"""Certificate eligibility and issuance.

Eligibility is recomputed whenever new attendance or assessment data lands for a participant
(SRS §11.3). A certificate cannot be marked *issued* unless **both** the minimum attendance and
the minimum average score are met, and issuance always records the approving actor (SRS §12).
No partial certificates are ever issued: when only one threshold is met the participant stays
"Not Eligible" with the reason shown.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.core.config import settings
from app.core.errors import BusinessRuleViolation
from app.core.logging import get_logger
from app.db.mongo import get_db
from app.services.storage import Keys, put_object

log = get_logger("app.certificates")

PENDING, ISSUED, REVOKED, NOT_ELIGIBLE = "pending", "issued", "revoked", "not_eligible"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def evaluate_eligibility(
    *, attendance_pct: float | None, avg_score: float | None, min_attendance: float, min_score: float
) -> tuple[bool, str | None]:
    """Returns (eligible, reason_if_not). Both thresholds must be met."""
    if attendance_pct is None and avg_score is None:
        return False, "Awaiting attendance and assessment data"
    attendance_ok = attendance_pct is not None and attendance_pct >= min_attendance
    score_ok = avg_score is not None and avg_score >= min_score
    if attendance_ok and score_ok:
        return True, None
    if not attendance_ok and not score_ok:
        return False, "Attendance & score below threshold"
    if not attendance_ok:
        return False, "Attendance below threshold"
    return False, "Score below threshold"


async def _thresholds(college_id: Any, template_code: str | None = None) -> tuple[float, float, dict | None]:
    template = None
    if college_id is not None:
        query: dict[str, Any] = {"collegeId": ObjectId(str(college_id)), "deletedAt": None, "active": True}
        if template_code:
            query["code"] = template_code
        template = await get_db().certificate_templates.find_one(query)
    criteria = (template or {}).get("criteria") or {}
    return (
        float(criteria.get("minAttendance", settings.CERTIFICATE_MIN_ATTENDANCE)),
        float(criteria.get("minAvgScore", settings.CERTIFICATE_MIN_AVG_SCORE)),
        template,
    )


async def recompute_for_student(student_user_id: Any, *, reason: str = "data_change") -> dict[str, Any]:
    """Recompute one participant's certificate record from live attendance + assessment data."""
    db = get_db()
    student_id = ObjectId(str(student_user_id))
    profile = await db.student_profiles.find_one({"userId": student_id})
    if not profile:
        return {"skipped": True, "reason": "no_student_profile"}

    attendance_rows = await db.attendance.aggregate(
        [
            {"$match": {"studentUserId": student_id}},
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "present": {
                        "$sum": {"$cond": [{"$in": ["$status", ["present", "late"]]}, 1, 0]}
                    },
                }
            },
        ]
    ).to_list(length=1)
    attendance_pct = None
    if attendance_rows and attendance_rows[0]["total"]:
        attendance_pct = round(
            attendance_rows[0]["present"] / attendance_rows[0]["total"] * 100, 1
        )

    score_rows = await db.skill_assessments.aggregate(
        [
            {"$match": {"studentUserId": student_id, "state": "submitted", "deletedAt": None}},
            {"$group": {"_id": None, "avg": {"$avg": "$totalScore"}, "n": {"$sum": 1}}},
        ]
    ).to_list(length=1)
    avg_score = (
        round(score_rows[0]["avg"], 1) if score_rows and score_rows[0].get("avg") is not None else None
    )

    min_attendance, min_score, template = await _thresholds(profile.get("collegeId"))
    eligible, reason_text = evaluate_eligibility(
        attendance_pct=attendance_pct,
        avg_score=avg_score,
        min_attendance=min_attendance,
        min_score=min_score,
    )

    existing = await db.certificates.find_one(
        {"studentUserId": student_id, "trainingProgramId": (template or {}).get("_id")}
    )
    # An already-issued certificate is never silently downgraded.
    if existing and existing.get("status") == ISSUED:
        status = ISSUED
    elif eligible:
        status = PENDING
    else:
        status = NOT_ELIGIBLE

    document = {
        "studentUserId": student_id,
        "studentName": profile.get("name"),
        "rollNumber": profile.get("rollNumber"),
        "batchId": profile.get("batchId"),
        "batchName": profile.get("batchName"),
        "collegeId": profile.get("collegeId"),
        "departmentId": profile.get("departmentId"),
        "trainingProgramId": (template or {}).get("_id"),
        "templateName": (template or {}).get("name"),
        "attendancePct": attendance_pct,
        "avgScore": avg_score,
        "criteria": {"minAttendance": min_attendance, "minAvgScore": min_score},
        "eligibilityMet": eligible,
        "reason": reason_text,
        "status": status,
        "recomputedAt": _now(),
        "recomputeReason": reason,
        "updatedAt": _now(),
    }
    await db.certificates.update_one(
        {"studentUserId": student_id, "trainingProgramId": (template or {}).get("_id")},
        {
            "$set": document,
            "$setOnInsert": {"createdAt": _now(), "deletedAt": None, "version": 1, "issuedAt": None},
        },
        upsert=True,
    )
    return document


async def issue_certificate(ctx: ScopeContext, certificate_id: Any) -> dict[str, Any]:
    """Issue a certificate. Refuses unless both thresholds are met; logs the approving actor."""
    db = get_db()
    certificate = await db.certificates.find_one({"_id": ObjectId(str(certificate_id))})
    if not certificate:
        from app.core.errors import ScopeForbidden

        raise ScopeForbidden()
    if not ctx.is_platform_wide and certificate.get("collegeId") != ctx.college_id:
        from app.core.errors import ScopeForbidden

        raise ScopeForbidden()
    if certificate.get("status") == ISSUED:
        raise BusinessRuleViolation("This certificate has already been issued")

    refreshed = await recompute_for_student(certificate["studentUserId"], reason="pre_issue_check")
    if not refreshed.get("eligibilityMet"):
        raise BusinessRuleViolation(
            f"Cannot issue: {refreshed.get('reason') or 'eligibility criteria not met'}. "
            "Partial certificates are not issued."
        )

    sequence = await db.certificates.count_documents(
        {"collegeId": certificate.get("collegeId"), "status": ISSUED}
    )
    certificate_no = (
        f"WC-{_now():%Y}-{str(certificate.get('departmentId'))[-4:].upper()}-{sequence + 1:05d}"
    )
    pdf = _render_certificate_pdf(
        student_name=refreshed.get("studentName") or "Participant",
        roll_number=refreshed.get("rollNumber") or "",
        program=refreshed.get("templateName") or "Soft-Skills Training Program",
        certificate_no=certificate_no,
        attendance=refreshed.get("attendancePct"),
        score=refreshed.get("avgScore"),
        issued_by=ctx.actor_label,
    )
    stored = await put_object(
        Keys.certificate(str(certificate["_id"])), pdf, "application/pdf"
    )

    await db.certificates.update_one(
        {"_id": certificate["_id"]},
        {
            "$set": {
                "status": ISSUED,
                "certificateNo": certificate_no,
                "issuedAt": _now(),
                "issuedBy": ctx.user_id,
                "issuedByLabel": ctx.actor_label,
                "storageKey": stored.key,
                "bytes": stored.bytes,
                "updatedAt": _now(),
            },
            "$inc": {"version": 1},
        },
    )
    await write_audit(
        ctx,
        action="issue",
        entity_type="certificates",
        entity_id=certificate["_id"],
        before={"status": certificate.get("status")},
        after={"status": ISSUED, "certificateNo": certificate_no},
        detail=f"certificate issued to {refreshed.get('studentName')} ({certificate_no})",
        college_id=certificate.get("collegeId"),
        department_id=certificate.get("departmentId"),
    )

    from app.services.notifications import Kind, notify

    await notify(
        user_id=certificate["studentUserId"],
        kind=Kind.CERTIFICATE_ELIGIBILITY,
        title="Your certificate has been issued",
        body=f"{refreshed.get('templateName') or 'Training program'} · {certificate_no}",
        href="/student/achievements",
        college_id=certificate.get("collegeId"),
        department_id=certificate.get("departmentId"),
    )
    return {"certificateNo": certificate_no, "status": ISSUED, "storageKey": stored.key}


def _render_certificate_pdf(
    *,
    student_name: str,
    roll_number: str,
    program: str,
    certificate_no: str,
    attendance: float | None,
    score: float | None,
    issued_by: str,
) -> bytes:
    import io

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdf_canvas

    stream = io.BytesIO()
    width, height = landscape(A4)
    pdf = pdf_canvas.Canvas(stream, pagesize=landscape(A4))

    pdf.setFillColor(colors.HexColor("#171340"))
    pdf.rect(0, height - 26 * mm, width, 26 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.HexColor("#F2A93B"))
    pdf.rect(0, height - 29 * mm, width, 3 * mm, fill=1, stroke=0)

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(18 * mm, height - 17 * mm, "Winners Creek")
    pdf.setFont("Helvetica", 9.5)
    pdf.drawRightString(
        width - 18 * mm, height - 16.5 * mm, "Practise · Assess · Improve · Become Employable"
    )

    pdf.setFillColor(colors.HexColor("#6B6C86"))
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(width / 2, height - 52 * mm, "CERTIFICATE OF COMPLETION")

    pdf.setFillColor(colors.HexColor("#161327"))
    pdf.setFont("Helvetica-Bold", 30)
    pdf.drawCentredString(width / 2, height - 72 * mm, student_name)

    pdf.setFont("Helvetica", 11.5)
    pdf.setFillColor(colors.HexColor("#6B6C86"))
    pdf.drawCentredString(width / 2, height - 82 * mm, f"Roll No. {roll_number}")
    pdf.drawCentredString(
        width / 2, height - 96 * mm, "has successfully completed the requirements of"
    )
    pdf.setFont("Helvetica-Bold", 15)
    pdf.setFillColor(colors.HexColor("#4B3FE4"))
    pdf.drawCentredString(width / 2, height - 108 * mm, program)

    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(colors.HexColor("#6B6C86"))
    detail = []
    if attendance is not None:
        detail.append(f"Session attendance {attendance}%")
    if score is not None:
        detail.append(f"Average assessment score {score}/100")
    if detail:
        pdf.drawCentredString(width / 2, height - 120 * mm, "   ·   ".join(detail))

    pdf.setStrokeColor(colors.HexColor("#E7E8F2"))
    pdf.line(20 * mm, 26 * mm, width - 20 * mm, 26 * mm)
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(20 * mm, 19 * mm, f"Certificate No.  {certificate_no}")
    pdf.drawString(20 * mm, 14 * mm, f"Issued  {_now():%d %b %Y}")
    pdf.drawRightString(width - 20 * mm, 19 * mm, f"Approved by  {issued_by}")
    pdf.drawRightString(
        width - 20 * mm, 14 * mm, "Verify this certificate with your institution administrator"
    )

    pdf.showPage()
    pdf.save()
    return stream.getvalue()
