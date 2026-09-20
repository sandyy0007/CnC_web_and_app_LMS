"""HOD portal API — department-scoped, implementing FR-01…FR-14 of the HOD SRS.

Non-negotiable rule (SRS §2, §14): an HOD is bound to exactly one `collegeId` and one
`departmentId`, both re-derived server-side on every request. A manipulated URL, query parameter
or payload naming another department or college is rejected with a generic authorization response
and written to the security log — it never reveals whether the target exists.

The role is read-heavy by design: writes are limited to enrollment status transitions (which
append history rather than overwrite), certificate review flags, and reassignment requests.
"""
from __future__ import annotations

import asyncio

from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, Query, status

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.authz.guards import require_role, require_student_in_scope
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import BusinessRuleViolation, NotFound, ValidationError
from app.db.mongo import get_db, serialize
from app.repositories.collections import (
    AuditLogRepo,
    BatchRepo,
    CertificateRepo,
    EediScoreRepo,
    EnrollmentEventRepo,
    EnrollmentRepo,
    NotificationRepo,
    ReportJobRepo,
    SkillAssessmentRepo,
    StudentProfileRepo,
    TrainerAssignmentRepo,
    TrainerFeedbackRepo,
    TrainingModuleRepo,
    TrainingSessionRepo,
    UserRepo,
)
from app.schemas.requests import (
    CertificateFlagRequest,
    EnrollmentStatusPatch,
    ReassignmentRequest,
    ReportRequest,
)
from app.services import analytics
from app.services.notifications import Kind, notify_college_admins
from app.services.scoring import PILLAR_LABELS, band_for, proficiency_level
from app.services.storage import signed_url

router = APIRouter()
HodCtx = Depends(require_role(Role.HOD))

#: Enrollment transitions the HOD is permitted to make (SRS §12).
ALLOWED_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "active": ("on_hold", "transferred", "completed", "dropped"),
    "on_hold": ("active", "dropped", "transferred"),
    "transferred": (),
    "completed": (),
    "dropped": ("active",),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _scope_header(ctx: ScopeContext) -> dict[str, Any]:
    """`College Name > Department Name` — shown on every HOD screen (SRS §6.1)."""
    db = get_db()
    college = (
        await db.colleges.find_one({"_id": ctx.college_id}, {"name": 1, "code": 1})
        if ctx.college_id
        else None
    )
    department = (
        await db.departments.find_one(
            {"_id": ctx.department_id}, {"name": 1, "code": 1, "status": 1}
        )
        if ctx.department_id
        else None
    )
    if not department:
        raise NotFound("Your department record could not be found")
    return {
        "collegeId": str(ctx.college_id),
        "collegeName": (college or {}).get("name"),
        "collegeCode": (college or {}).get("code"),
        "departmentId": str(ctx.department_id),
        "departmentName": (department or {}).get("name"),
        "departmentCode": (department or {}).get("code"),
        "departmentStatus": (department or {}).get("status", "active"),
        # An archived department degrades to a read-only view rather than hard-deleting history.
        "readOnly": (department or {}).get("status") == "archived",
        "breadcrumb": f"{(college or {}).get('name', '')} › {(department or {}).get('name', '')}",
        "isolationNotice": (
            "Data isolation active — college + department scoped server-side on every request."
        ),
    }


def _narrow(ctx: ScopeContext, **requested: Any) -> dict[str, Any]:
    """Filters may narrow within the department, never widen out of it (FR-13)."""
    return ctx.narrow(**{k: v for k, v in requested.items() if v not in (None, "", "all")})


# --------------------------------------------------------------------------- FR-02 dashboard
@router.get("/dashboard")
async def dashboard(ctx: ScopeContext = HodCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.college_id and ctx.department_id:
        from app.repositories.stats_repo import StatsRepository
        try:
            pg_data = await StatsRepository.get_hod_dashboard_data(ctx.college_id, ctx.department_id)
            return {"success": True, "data": pg_data}
        except Exception:
            pass

    # None of these reads depends on another, so they go to the database together rather than
    # as a dozen sequential round-trips. Scope is still derived per query from `ctx`.
    (
        scope,
        participants,
        trainers,
        attendance,
        assessments,
        certificates,
        defaulters,
        low_scores,
        recent_enrollments,
        trend,
        module_attendance,
        module_scores,
    ) = await asyncio.gather(
        _scope_header(ctx),
        analytics.participant_counts(ctx),
        analytics.trainer_counts(ctx),
        analytics.attendance_overall(ctx),
        analytics.assessment_summary(ctx),
        analytics.certificate_counts(ctx),
        analytics.attendance_defaulters(ctx),
        analytics.low_score_count(ctx, threshold=settings.CERTIFICATE_MIN_AVG_SCORE),
        EnrollmentRepo(ctx).find_all(limit=6, sort=[("enrolledAt", -1)]),
        analytics.attendance_trend(ctx, weeks=8),
        analytics.attendance_by(ctx, "trainingModuleName"),
        analytics.assessment_by_module(ctx),
    )
    pending_certificates = certificates.get("pending", 0)

    return {
        "success": True,
        "data": {
            "scope": scope,
            "kpis": {
                "participants": {
                    "value": participants["total"],
                    "deltaLabel": f"+{participants['addedThisMonth']} this month"
                    if participants["addedThisMonth"]
                    else "No change",
                    "delta": participants["addedThisMonth"],
                },
                "trainers": {"value": trainers["total"], "deltaLabel": "Faculty acting as trainers"},
                "averageSessionAttendance": {
                    "value": attendance["percentage"],
                    "hasData": attendance["hasData"],
                    "suffix": "%",
                },
                "averageSkillScore": {
                    "value": assessments["average"],
                    "outOf": 100,
                    "hasData": assessments["hasData"],
                },
            },
            "alerts": [
                {
                    "code": "attendance_defaulters",
                    "label": f"Attendance Defaulters (below {settings.ATTENDANCE_DEFAULTER_THRESHOLD:g}%)",
                    "count": len(defaulters),
                    "tone": "warning",
                    "href": "/hod/attendance",
                },
                {
                    "code": "low_assessment_scores",
                    "label": "Low Skill-Assessment Scores",
                    "count": low_scores,
                    "tone": "danger",
                    "href": "/hod/assessments",
                },
                {
                    "code": "pending_approvals",
                    "label": "Enrollment / Certificate approvals pending",
                    "count": pending_certificates,
                    "tone": "info",
                    "href": "/hod/certificates",
                },
            ],
            "attendanceTrend": trend,
            "moduleAttendance": module_attendance,
            "moduleScores": module_scores,
            "certificatesIssued": certificates.get("issued", 0),
            "recentEnrollments": serialize(recent_enrollments),
            "thresholds": {
                "attendance": settings.ATTENDANCE_DEFAULTER_THRESHOLD,
                "certificateAttendance": settings.CERTIFICATE_MIN_ATTENDANCE,
                "certificateScore": settings.CERTIFICATE_MIN_AVG_SCORE,
            },
        },
    }


# --------------------------------------------------------------------------- FR-03 participants
@router.get("/participants")
async def participants(
    search: str | None = Query(None, max_length=80),
    batchId: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status", max_length=20),
    certificate: str | None = Query(None, max_length=20),
    sortBy: str | None = Query(None, max_length=30),
    sortDir: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    scope = await _scope_header(ctx)
    filters = _narrow(ctx, batchId=batchId, status=status_filter)
    filters.pop("collegeId", None)
    filters.pop("departmentId", None)

    page_result = await StudentProfileRepo(ctx).list(
        filters=filters, search=search, sort_by=sortBy, sort_dir=sortDir,
        page=page, page_size=pageSize,
    )
    user_ids = [p["userId"] for p in page_result.items]
    # Scope the aggregation to the page, not the whole department — a 428-participant
    # department must not aggregate every attendance row to render 20 of them (NFR: <2s).
    attendance = await analytics.student_attendance_map(
        ctx, filters={"studentUserId": {"$in": user_ids}}
    )
    scores = {
        row["studentUserId"]: row
        for row in await SkillAssessmentRepo(ctx).aggregate(
            [
                {"$match": {"studentUserId": {"$in": user_ids}, "state": "submitted"}},
                {"$group": {"_id": "$studentUserId", "avg": {"$avg": "$totalScore"}}},
                {"$project": {"studentUserId": "$_id", "avg": 1}},
            ]
        )
    }
    certificates = {
        row["studentUserId"]: row
        for row in await CertificateRepo(ctx).find_all(
            {"studentUserId": {"$in": user_ids}}, limit=500
        )
    }
    enrollments = {
        row["studentUserId"]: row
        for row in await EnrollmentRepo(ctx).find_all(
            {"studentUserId": {"$in": user_ids}}, limit=1000, sort=[("enrolledAt", -1)]
        )
    }

    rows = []
    for profile in page_result.items:
        user_id = profile["userId"]
        att = attendance.get(user_id, {})
        avg = (scores.get(user_id) or {}).get("avg")
        cert = certificates.get(user_id, {})
        enrollment = enrollments.get(user_id, {})
        cert_status = cert.get("status", "not_eligible")
        if certificate and certificate != "all" and cert_status != certificate:
            continue
        rows.append(
            {
                "studentUserId": str(user_id),
                "name": profile.get("name"),
                "rollNumber": profile.get("rollNumber"),
                "batchId": str(profile["batchId"]) if profile.get("batchId") else None,
                "batchName": profile.get("batchName"),
                "attendancePercent": att.get("percentage"),
                "attendanceBand": (
                    "high"
                    if (att.get("percentage") or 0) >= 75
                    else "medium"
                    if (att.get("percentage") or 0) >= 60
                    else "low"
                ),
                "averageSkillScore": round(avg, 1) if avg is not None else None,
                "certificateStatus": cert_status,
                "enrollmentStatus": enrollment.get("status", profile.get("status", "active")),
                "avatarColor": profile.get("avatarColor"),
            }
        )

    response = page_result.to_response()
    response["items"] = rows
    batches = await BatchRepo(ctx).find_all(limit=100, projection={"name": 1, "code": 1})
    return {
        "success": True,
        **response,
        "meta": {
            "scope": scope,
            "filters": {
                "batches": [{"id": str(b["_id"]), "name": b.get("name")} for b in batches],
                "statuses": ["active", "on_hold", "completed", "dropped", "transferred"],
                "certificateStates": ["issued", "pending", "not_eligible", "revoked"],
            },
            "legend": [
                {"label": "≥75% attendance", "tone": "success"},
                {"label": "60–74%", "tone": "warning"},
                {"label": "<60%", "tone": "danger"},
            ],
        },
    }


# --------------------------------------------------------------------------- FR-04 360 profile
@router.get("/participants/{student_id}")
async def participant_profile(student_id: str, ctx: ScopeContext = HodCtx) -> dict[str, Any]:
    """Full 360° training profile. Out-of-department ids are refused, not merely empty."""
    scope = await _scope_header(ctx)
    resolved = await require_student_in_scope(ctx, student_id)

    profile = await StudentProfileRepo(ctx).find_one({"userId": resolved})
    if not profile:
        raise NotFound("Participant not found")

    attendance = await analytics.attendance_overall(ctx, filters={"studentUserId": resolved})
    sessions_total = await TrainingSessionRepo(ctx).count({"batchId": profile.get("batchId")})
    assessments = await SkillAssessmentRepo(ctx).find_all(
        {"studentUserId": resolved, "state": "submitted"}, limit=50, sort=[("createdAt", -1)]
    )
    rubric = await analytics.rubric_breakdown(ctx, filters={"studentUserId": resolved})
    feedback = await TrainerFeedbackRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=30, sort=[("createdAt", -1)]
    )
    enrollment_history = await EnrollmentRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=50, sort=[("enrolledAt", -1)]
    )
    events = await EnrollmentEventRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=100, sort=[("at", -1)]
    )
    certificate = await CertificateRepo(ctx).find_one({"studentUserId": resolved})
    score = await EediScoreRepo(ctx).find_one({"studentUserId": resolved}) or {}

    avg_rows = await SkillAssessmentRepo(ctx).aggregate(
        [
            {"$match": {"studentUserId": resolved, "state": "submitted"}},
            {"$group": {"_id": None, "avg": {"$avg": "$totalScore"}}},
        ]
    )
    average = round(avg_rows[0]["avg"], 1) if avg_rows and avg_rows[0].get("avg") else None
    feedback_avg = (
        round(sum(f.get("rating", 0) for f in feedback) / len(feedback), 1) if feedback else None
    )
    current = next((e for e in enrollment_history if e.get("status") == "active"), None)
    department_average = await analytics.assessment_summary(ctx)

    return {
        "success": True,
        "data": {
            "scope": scope,
            "participant": {
                **serialize(profile),
                "enrollmentStatus": (current or {}).get("status")
                or (enrollment_history[0].get("status") if enrollment_history else "unknown"),
                "certificateStatus": (certificate or {}).get("status", "not_eligible"),
            },
            "summary": {
                "sessionAttendancePercent": attendance["percentage"],
                "aboveDepartmentAverage": (
                    attendance["percentage"] > (await analytics.attendance_overall(ctx))["percentage"]
                ),
                "averageSkillScore": average,
                "proficiency": proficiency_level(average),
                "band": band_for(average),
                "sessionsAttended": attendance["present"],
                "sessionsTotal": attendance["total"] or sessions_total,
                "sessionsMissed": max(0, (attendance["total"] or 0) - attendance["present"]),
                "trainerFeedbackAverage": feedback_avg,
                "feedbackEntries": len(feedback),
                "departmentAverageSkillScore": department_average["average"],
            },
            "personalDetails": {
                "fullName": profile.get("name"),
                "rollNumber": profile.get("rollNumber"),
                "trainingBatch": profile.get("batchName"),
                "department": f"{scope['departmentCode']} — {scope['collegeName']}",
                "guardianContact": ((profile.get("guardianInfo") or {}).get("phone")),
                "enrollmentStatus": (current or {}).get("status"),
                "enrolledBy": (current or {}).get("enrolledByLabel"),
                "enrolledOn": (current or {}).get("enrolledAt"),
            },
            "rubricScores": rubric,
            "pillarScores": [
                {"code": code, "label": label, "score": (score.get("pillarScores") or {}).get(code)}
                for code, label in PILLAR_LABELS.items()
            ],
            "assessments": serialize(assessments),
            "feedback": serialize(feedback),
            "enrollmentHistory": serialize(enrollment_history),
            "enrollmentEvents": serialize(events),
            "certificate": serialize(certificate),
            "readiness": {
                "score": score.get("finalScore"),
                "delta": score.get("delta"),
                "focusPillar": PILLAR_LABELS.get(score.get("focusPillar") or "", None),
            },
        },
    }


# --------------------------------------------------------------------------- FR-05/06 attendance
@router.get("/attendance")
async def attendance(
    trainingModuleId: str | None = Query(None),
    batchId: str | None = Query(None),
    weeks: int = Query(8, ge=1, le=52),
    threshold: float | None = Query(None, ge=0, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    scope = await _scope_header(ctx)
    narrowed = _narrow(ctx, batchId=batchId)
    extra: dict[str, Any] = {}
    if narrowed.get("batchId"):
        extra["batchId"] = narrowed["batchId"]
    if trainingModuleId:
        module = await TrainingModuleRepo(ctx).get(trainingModuleId)
        extra["trainingModuleId"] = module["_id"]

    overall = await analytics.attendance_overall(ctx, filters=extra)
    sessions_conducted = await TrainingSessionRepo(ctx).count(extra or None)
    no_data_sessions = await analytics.sessions_without_attendance(ctx, filters=extra or None)
    defaulters = await analytics.attendance_defaulters(ctx, threshold=threshold, filters=extra)
    by_batch = await analytics.attendance_by(ctx, "batchName", filters=extra)
    by_module = await analytics.attendance_by(ctx, "trainingModuleName", filters=extra)

    modules = await TrainingModuleRepo(ctx).find_all(limit=100, projection={"name": 1})
    batches = await BatchRepo(ctx).find_all(limit=100, projection={"name": 1})
    return {
        "success": True,
        "data": {
            "scope": scope,
            "overall": overall,
            "sessionsConducted": sessions_conducted,
            "sessionsWithoutAttendanceData": no_data_sessions,
            "defaulters": serialize(defaulters),
            "defaulterCount": len(defaulters),
            "threshold": threshold if threshold is not None else settings.ATTENDANCE_DEFAULTER_THRESHOLD,
            "weeklyTrend": await analytics.attendance_trend(ctx, weeks=weeks, filters=extra),
            "monthlyTrend": await analytics.attendance_monthly_trend(ctx, filters=extra),
            "batchWise": by_batch,
            "moduleWise": by_module,
            "notes": [
                "Sessions with no attendance recorded are excluded from the denominator, "
                "never counted as absence.",
            ],
        },
        "meta": {
            "filters": {
                "modules": [{"id": str(m["_id"]), "name": m.get("name")} for m in modules],
                "batches": [{"id": str(b["_id"]), "name": b.get("name")} for b in batches],
            }
        },
    }


@router.get("/attendance/defaulters")
async def defaulters(
    threshold: float | None = Query(None, ge=0, le=100),
    batchId: str | None = Query(None),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    narrowed = _narrow(ctx, batchId=batchId)
    extra = {"batchId": narrowed["batchId"]} if narrowed.get("batchId") else {}
    rows = await analytics.attendance_defaulters(ctx, threshold=threshold, filters=extra)
    return {
        "success": True,
        "data": serialize(rows),
        "meta": {
            "threshold": threshold if threshold is not None else settings.ATTENDANCE_DEFAULTER_THRESHOLD,
            "count": len(rows),
            "scope": await _scope_header(ctx),
        },
    }


# --------------------------------------------------------------------------- FR-07 assessments
@router.get("/assessments")
async def assessments(
    trainingModuleId: str | None = Query(None),
    batchId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    scope = await _scope_header(ctx)
    narrowed = _narrow(ctx, batchId=batchId)
    extra: dict[str, Any] = {}
    if narrowed.get("batchId"):
        extra["batchId"] = narrowed["batchId"]
    if trainingModuleId:
        module = await TrainingModuleRepo(ctx).get(trainingModuleId)
        extra["trainingModuleId"] = module["_id"]

    (
        department_summary,
        filtered_summary,
        by_module,
        by_batch,
        distribution,
        rubric,
    ) = await asyncio.gather(
        analytics.assessment_summary(ctx),
        analytics.assessment_summary(ctx, filters=extra),
        analytics.assessment_by_module(ctx, filters=extra),
        analytics.assessment_by_batch(ctx, filters=extra),
        analytics.proficiency_distribution(ctx, filters=extra),
        analytics.rubric_breakdown(ctx, filters=extra),
    )

    # Per-participant rubric table.
    criteria = [row["criterion"] for row in rubric]
    page_result = await StudentProfileRepo(ctx).list(
        filters={"batchId": extra["batchId"]} if extra.get("batchId") else None,
        page=page, page_size=pageSize,
    )
    user_ids = [p["userId"] for p in page_result.items]
    per_student = await SkillAssessmentRepo(ctx).aggregate(
        [
            {"$match": {"studentUserId": {"$in": user_ids}, "state": "submitted", **extra}},
            {"$unwind": "$rubricScores"},
            {
                "$group": {
                    "_id": {"s": "$studentUserId", "c": "$rubricScores.criterion"},
                    "avg": {"$avg": "$rubricScores.score"},
                }
            },
        ]
    )
    matrix: dict[Any, dict[str, float]] = {}
    for row in per_student:
        matrix.setdefault(row["_id"]["s"], {})[row["_id"]["c"]] = round(row["avg"], 1)

    rows = []
    for profile in page_result.items:
        scores = matrix.get(profile["userId"], {})
        values = list(scores.values())
        overall = round(sum(values) / len(values), 1) if values else None
        rows.append(
            {
                "studentUserId": str(profile["userId"]),
                "name": profile.get("name"),
                "rollNumber": profile.get("rollNumber"),
                "batchName": profile.get("batchName"),
                "scores": scores,
                "overall": overall,
                "band": band_for(overall),
            }
        )

    modules = await TrainingModuleRepo(ctx).find_all(limit=100, projection={"name": 1})
    batches = await BatchRepo(ctx).find_all(limit=100, projection={"name": 1})
    response = page_result.to_response()
    response["items"] = rows
    return {
        "success": True,
        **response,
        "data": {
            "scope": scope,
            "departmentAverage": department_summary,
            "filteredAverage": filtered_summary,
            "moduleAverages": by_module,
            "batchAverages": by_batch,
            "proficiencyDistribution": distribution,
            "rubricCriteria": criteria,
            "rubricAverages": rubric,
        },
        "meta": {
            "filters": {
                "modules": [{"id": str(m["_id"]), "name": m.get("name")} for m in modules],
                "batches": [{"id": str(b["_id"]), "name": b.get("name")} for b in batches],
            },
            "note": "Read-only: assessment scores are entered by trainers (segregation of duties).",
        },
    }


# --------------------------------------------------------------------------- FR-08 trainers
@router.get("/trainers")
async def trainers(ctx: ScopeContext = HodCtx) -> dict[str, Any]:
    scope = await _scope_header(ctx)
    roster = await UserRepo(ctx).find_all(
        {"role": str(Role.TRAINER)},
        projection={"name": 1, "email": 1, "status": 1, "designation": 1},
        limit=500,
        sort=[("name", 1)],
    )
    assignments = await TrainerAssignmentRepo(ctx).find_all({"active": True}, limit=2000)
    session_counts = {
        row["_id"]: row["sessions"]
        for row in await TrainingSessionRepo(ctx).aggregate(
            [{"$group": {"_id": "$trainerUserId", "sessions": {"$sum": 1}}}]
        )
    }
    feedback = {
        row["_id"]: row
        for row in await TrainerFeedbackRepo(ctx).aggregate(
            [{"$group": {"_id": "$trainerUserId", "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}}]
        )
    }
    modules_by_trainer: dict[Any, set[str]] = {}
    for assignment in assignments:
        modules_by_trainer.setdefault(assignment["trainerUserId"], set()).add(
            assignment.get("trainingModuleName") or "—"
        )

    rows = []
    total_sessions = 0
    for trainer in roster:
        sessions = session_counts.get(trainer["_id"], 0)
        total_sessions += sessions
        rating = feedback.get(trainer["_id"], {})
        rows.append(
            {
                "trainerUserId": str(trainer["_id"]),
                "name": trainer.get("name"),
                "designation": trainer.get("designation"),
                "status": trainer.get("status"),
                "modulesAssigned": sorted(modules_by_trainer.get(trainer["_id"], set())),
                "sessionsConducted": sessions,
                "averageFeedback": round(rating.get("avg", 0), 1) if rating.get("avg") else None,
                "feedbackEntries": rating.get("n", 0),
                "workloadHoursPerWeek": round(sessions * 1.5, 1),
            }
        )

    overall_feedback = [r["averageFeedback"] for r in rows if r["averageFeedback"] is not None]
    return {
        "success": True,
        "data": {
            "scope": scope,
            "activeTrainers": len([r for r in rows if r["status"] == "active"]),
            "averageFeedback": (
                round(sum(overall_feedback) / len(overall_feedback), 1) if overall_feedback else None
            ),
            "sessionsThisCycle": total_sessions,
            "roster": rows,
            "notice": (
                "Trainer roster is read-focused. To change a trainer's module assignment, submit "
                "a reassignment request — handled by College Admin per institutional policy."
            ),
        },
    }


@router.post("/trainers/{trainer_id}/reassignment-request", status_code=status.HTTP_202_ACCEPTED)
async def request_reassignment(
    trainer_id: str, payload: ReassignmentRequest, ctx: ScopeContext = HodCtx
) -> dict[str, Any]:
    """The HOD cannot edit assignments directly; they raise a request for the College Admin."""
    trainer = await UserRepo(ctx).find_one(
        {"_id": ObjectId(trainer_id), "role": str(Role.TRAINER)}
    )
    if not trainer:
        raise NotFound("Trainer not found in your department")

    document = {
        "kind": "trainer_reassignment_request",
        "trainerUserId": trainer["_id"],
        "trainerName": trainer.get("name"),
        "collegeId": ctx.college_id,
        "departmentId": ctx.department_id,
        "requestedBy": ctx.user_id,
        "requestedByLabel": ctx.actor_label,
        "reason": payload.reason,
        "requestedModules": payload.requestedModules,
        "status": "pending",
        "at": _now(),
    }
    result = await get_db().system_events.insert_one(document)
    await write_audit(
        ctx,
        action="create",
        entity_type="trainer_reassignment_request",
        entity_id=result.inserted_id,
        after={"trainer": trainer.get("name"), "reason": payload.reason},
        detail=f"reassignment requested for {trainer.get('name')}",
    )
    await notify_college_admins(
        college_id=ctx.college_id,
        kind=Kind.ACCOUNT,
        title="Trainer reassignment requested",
        body=f"{ctx.name} requested a reassignment for {trainer.get('name')}: {payload.reason[:120]}",
        href="/admin/trainers",
    )
    return {
        "success": True,
        "message": "Reassignment request submitted to your College Admin",
        "data": {"requestId": str(result.inserted_id), "status": "pending"},
    }


# --------------------------------------------------------------------------- FR-07a feedback & certs
@router.get("/feedback")
async def feedback(
    page: int = Query(1, ge=1), pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    page_result = await TrainerFeedbackRepo(ctx).list(page=page, page_size=pageSize)
    summary = await analytics.feedback_summary(ctx)
    return {
        "success": True,
        **page_result.to_response(),
        "meta": {"summary": summary, "scope": await _scope_header(ctx)},
    }


@router.get("/certificates")
async def certificates(
    status_filter: str | None = Query(None, alias="status", max_length=20),
    batchId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    scope = await _scope_header(ctx)
    narrowed = _narrow(ctx, batchId=batchId, status=status_filter)
    filters: dict[str, Any] = {}
    if narrowed.get("batchId"):
        filters["batchId"] = narrowed["batchId"]
    if status_filter and status_filter != "all":
        filters["status"] = status_filter

    page_result = await CertificateRepo(ctx).list(filters=filters, page=page, page_size=pageSize)
    counts = await analytics.certificate_counts(ctx)
    total_participants = await StudentProfileRepo(ctx).count()
    feedback_summary = await analytics.feedback_summary(ctx)
    recent_feedback = await TrainerFeedbackRepo(ctx).find_all(
        limit=5, sort=[("createdAt", -1)]
    )

    rows = [
        {
            "certificateId": str(row["_id"]),
            "studentUserId": str(row.get("studentUserId")),
            "name": row.get("studentName"),
            "rollNumber": row.get("rollNumber"),
            "batchName": row.get("batchName"),
            "attendancePercent": row.get("attendancePct"),
            "averageScore": row.get("avgScore"),
            "status": row.get("status"),
            "eligibilityMet": row.get("eligibilityMet"),
            "reason": row.get("reason"),
            "certificateNo": row.get("certificateNo"),
            "issuedAt": row.get("issuedAt"),
            "flaggedForReview": row.get("flaggedForReview", False),
        }
        for row in page_result.items
    ]
    response = page_result.to_response()
    response["items"] = rows
    return {
        "success": True,
        **response,
        "data": {
            "scope": scope,
            "certificatesIssued": counts.get("issued", 0),
            "issuedPercentOfParticipants": (
                round(counts.get("issued", 0) / total_participants * 100)
                if total_participants
                else 0
            ),
            "pendingReview": counts.get("pending", 0),
            "notEligible": counts.get("not_eligible", 0),
            "averageTrainerRating": feedback_summary["average"],
            "feedbackEntries": feedback_summary["count"],
            "recentFeedback": serialize(recent_feedback),
            "criteria": {
                "minAttendance": settings.CERTIFICATE_MIN_ATTENDANCE,
                "minAvgScore": settings.CERTIFICATE_MIN_AVG_SCORE,
                "note": "Requires minimum attendance AND minimum average score. "
                        "No partial certificates are issued.",
            },
        },
    }


@router.post("/certificates/{certificate_id}/flag")
async def flag_certificate(
    certificate_id: str, payload: CertificateFlagRequest, ctx: ScopeContext = HodCtx
) -> dict[str, Any]:
    """The HOD may flag a record for review — issuance itself sits with the College Admin."""
    repo = CertificateRepo(ctx)
    certificate = await repo.get(certificate_id)
    saved = await repo.update(
        certificate["_id"],
        {
            "flaggedForReview": True,
            "flagNote": payload.note,
            "flaggedBy": ctx.user_id,
            "flaggedByLabel": ctx.actor_label,
            "flaggedAt": _now(),
        },
    )
    await notify_college_admins(
        college_id=ctx.college_id,
        kind=Kind.CERTIFICATE_ELIGIBILITY,
        title="Certificate flagged for review",
        body=f"{certificate.get('studentName')} — {payload.note[:120]}",
        href="/admin/certificates",
    )
    return {"success": True, "message": "Flagged for review", "data": serialize(saved)}


# --------------------------------------------------------------------------- FR-09 enrollment
@router.get("/enrollments")
async def enrollments(
    status_filter: str | None = Query(None, alias="status", max_length=20),
    batchId: str | None = Query(None),
    enrollmentType: str | None = Query(None, max_length=20),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    scope = await _scope_header(ctx)
    narrowed = _narrow(ctx, batchId=batchId)
    filters: dict[str, Any] = {}
    if narrowed.get("batchId"):
        filters["batchId"] = narrowed["batchId"]
    if status_filter and status_filter != "all":
        filters["status"] = status_filter
    if enrollmentType and enrollmentType != "all":
        filters["enrollmentType"] = enrollmentType
    if from_ or to:
        window: dict[str, Any] = {}
        try:
            if from_:
                window["$gte"] = datetime.fromisoformat(from_).replace(tzinfo=timezone.utc)
            if to:
                window["$lte"] = datetime.fromisoformat(to).replace(tzinfo=timezone.utc) + timedelta(days=1)
        except ValueError as exc:
            raise ValidationError("Dates must be in YYYY-MM-DD format") from exc
        if window.get("$gte") and window.get("$lte") and window["$gte"] > window["$lte"]:
            raise ValidationError("The start date must be on or before the end date")
        filters["enrolledAt"] = window

    page_result = await EnrollmentRepo(ctx).list(filters=filters, page=page, page_size=pageSize)
    counts = await analytics.enrollment_status_counts(ctx)
    roster = await StudentProfileRepo(ctx).count()
    sample = await EnrollmentRepo(ctx).find_all(
        {"status": {"$in": ["on_hold", "transferred"]}}, limit=1, sort=[("updatedAt", -1)]
    )
    sample_history = []
    if sample:
        sample_history = await EnrollmentEventRepo(ctx).find_all(
            {"enrollmentId": sample[0]["_id"]}, limit=20, sort=[("at", 1)]
        )

    return {
        "success": True,
        **page_result.to_response(),
        "data": {
            "scope": scope,
            "counts": counts,
            "activePercentOfRoster": (
                round(counts.get("active", 0) / roster * 100, 1) if roster else 0
            ),
            "legend": [
                {"status": "active", "label": "Currently participating in the training program"},
                {"status": "on_hold", "label": "Temporarily paused, e.g. pending transfer review"},
                {"status": "completed", "label": "Finished the program cycle"},
                {"status": "dropped", "label": "Withdrew from the program"},
                {"status": "transferred", "label": "Moved to another batch or department"},
            ],
            "sampleStatusHistory": {
                "participant": (sample[0].get("studentName") if sample else None),
                "events": serialize(sample_history),
                "note": "Full history preserved, never overwritten.",
            },
            "allowedTransitions": {k: list(v) for k, v in ALLOWED_TRANSITIONS.items()},
        },
    }


@router.patch("/enrollments/{enrollment_id}/status")
async def update_enrollment_status(
    enrollment_id: str, payload: EnrollmentStatusPatch, ctx: ScopeContext = HodCtx
) -> dict[str, Any]:
    """Status transitions append a new history row — the old record is never overwritten."""
    scope = await _scope_header(ctx)
    if scope["readOnly"]:
        raise BusinessRuleViolation(
            "This department is archived — its records are read-only"
        )

    repo = EnrollmentRepo(ctx)
    enrollment = await repo.get(enrollment_id)
    current = enrollment.get("status", "active")
    if payload.status == current:
        raise BusinessRuleViolation(f"This enrollment is already '{current}'")
    allowed = ALLOWED_TRANSITIONS.get(current, ())
    if payload.status not in allowed:
        raise BusinessRuleViolation(
            f"'{current}' → '{payload.status}' is not a permitted transition. "
            f"Allowed: {', '.join(allowed) or 'none'}."
        )

    db = get_db()
    # Close the current row and open a new one so history survives intact.
    await repo.update(
        enrollment["_id"],
        {
            "status": payload.status,
            "statusChangedAt": _now(),
            "statusChangedBy": ctx.user_id,
            "statusChangeReason": payload.reason,
        },
        expected_version=payload.expectedVersion,
    )
    successor = None
    if payload.status in ("transferred", "on_hold"):
        successor_doc = {
            **{
                k: v
                for k, v in enrollment.items()
                if k
                not in (
                    "_id", "status", "createdAt", "updatedAt", "version", "statusChangedAt",
                    "statusChangeReason", "statusChangedBy",
                )
            },
            "status": payload.status,
            "previousEnrollmentId": enrollment["_id"],
            "enrolledBy": ctx.user_id,
            "enrolledByLabel": ctx.actor_label,
            "enrolledAt": _now(),
            "createdAt": _now(),
            "updatedAt": _now(),
            "deletedAt": None,
            "version": 1,
        }
        successor = await db.enrollments.insert_one(successor_doc)

    await db.enrollment_events.insert_one(
        {
            "enrollmentId": enrollment["_id"],
            "successorEnrollmentId": successor.inserted_id if successor else None,
            "studentUserId": enrollment.get("studentUserId"),
            "collegeId": ctx.college_id,
            "departmentId": ctx.department_id,
            "fromStatus": current,
            "toStatus": payload.status,
            "reason": payload.reason,
            "actorId": ctx.user_id,
            "actorLabel": ctx.actor_label,
            "at": _now(),
        }
    )
    return {
        "success": True,
        "message": f"Enrollment moved from {current} to {payload.status}",
        "data": {
            "enrollmentId": str(enrollment["_id"]),
            "fromStatus": current,
            "toStatus": payload.status,
            "successorEnrollmentId": str(successor.inserted_id) if successor else None,
            "historyPreserved": True,
        },
    }


# --------------------------------------------------------------------------- FR-10 reports
@router.post("/reports", status_code=status.HTTP_202_ACCEPTED)
async def create_report(payload: ReportRequest, ctx: ScopeContext = HodCtx) -> dict[str, Any]:
    allowed = {
        "attendance", "assessment", "enrollment", "defaulters", "certification",
        "feedback", "trainer", "audit", "learning", "practice", "prediction",
    }
    if payload.reportType not in allowed:
        raise ValidationError(f"Available report types: {', '.join(sorted(allowed))}")
    from app.services.reports import request_report

    result = await request_report(
        ctx,
        report_type=payload.reportType,
        fmt=payload.format,
        filters=payload.filters,
        force_async=payload.forceAsync,
    )
    return {"success": True, "data": result}


@router.get("/reports")
async def list_reports(
    page: int = Query(1, ge=1), pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    page_result = await ReportJobRepo(ctx).list(page=page, page_size=pageSize)
    rows = []
    for job in page_result.items:
        item = serialize(job)
        if job.get("status") == "ready" and job.get("storageKey"):
            item["downloadUrl"] = await signed_url(
                job["storageKey"], filename=job.get("filename")
            )
        rows.append(item)
    response = page_result.to_response()
    response["items"] = rows

    from app.services.reports import REPORT_FAMILIES

    return {
        "success": True,
        **response,
        "meta": {
            "scope": await _scope_header(ctx),
            "available": [
                f for f in REPORT_FAMILIES if "HOD" in f["roles"]
            ],
            "asyncNotice": (
                "Large exports (e.g. full-program attendance for 2,000+ participants) are "
                "processed asynchronously as a background job — you'll be notified when the "
                "file is ready."
            ),
            "asyncRowThreshold": settings.REPORT_ASYNC_ROW_THRESHOLD,
        },
    }


# --------------------------------------------------------------------------- FR-11 audit
@router.get("/audit-logs")
async def audit_logs(
    entityType: str | None = Query(None, max_length=40),
    action: str | None = Query(None, max_length=20),
    actorId: str | None = Query(None),
    days: int = Query(7, ge=1, le=365),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    """Read-only, department-scoped, append-only trail."""
    filters: dict[str, Any] = {"at": {"$gte": _now() - timedelta(days=days)}}
    if entityType and entityType != "all":
        filters["entityType"] = entityType
    if action and action != "all":
        filters["action"] = action
    if actorId:
        # An actor filter cannot be used to read another department's trail: the repository's
        # scope filter still applies on top of it.
        filters["actorId"] = ObjectId(actorId)

    repo = AuditLogRepo(ctx)
    page_result = await repo.list(filters=filters, page=page, page_size=pageSize)
    counts = await repo.aggregate(
        [{"$group": {"_id": "$action", "count": {"$sum": 1}}}],
        extra_match={"at": {"$gte": _now() - timedelta(days=days)}},
    )
    by_action = {row["_id"]: row["count"] for row in counts if row["_id"]}

    from app.repositories.collections import SecurityEventRepo

    blocked = await SecurityEventRepo(ctx).count(
        {
            "kind": {"$in": ["scope_denied", "role_denied"]},
            "userId": ctx.user_id,
            "at": {"$gte": _now() - timedelta(days=days)},
        }
    )

    actors = await repo.distinct("actorLabel", {"at": {"$gte": _now() - timedelta(days=days)}})
    return {
        "success": True,
        **page_result.to_response(),
        "data": {
            "scope": await _scope_header(ctx),
            "windowDays": days,
            "totalEvents": sum(by_action.values()),
            "createEvents": by_action.get("create", 0),
            "updateEvents": by_action.get("update", 0),
            "deleteEvents": by_action.get("delete", 0),
            "exportEvents": by_action.get("export", 0),
            "crossScopeAttemptsBlocked": blocked,
            "notice": (
                "Read-only trail, department-scoped. Every create/update/delete on records "
                "within your department is captured here — this log is append-only and cannot "
                "be edited or deleted, even by admin roles."
            ),
        },
        "meta": {
            "filters": {
                "entityTypes": sorted({e for e in await repo.distinct("entityType") if e}),
                "actions": ["create", "update", "delete", "export", "login", "issue"],
                "actors": sorted(a for a in actors if a),
            }
        },
    }


# --------------------------------------------------------------------------- FR-14 notifications
@router.get("/notifications")
async def notifications(
    unreadOnly: bool = Query(False),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    filters = {"read": False} if unreadOnly else None
    page_result = await NotificationRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize
    )
    from app.services.notifications import unread_count

    return {
        "success": True,
        **page_result.to_response(),
        "meta": {"unread": await unread_count(ctx.user_id)},
    }


@router.get("/scope")
async def scope(ctx: ScopeContext = HodCtx) -> dict[str, Any]:
    """What this HOD can see — used by the sidebar's locked "Scope" group."""
    header = await _scope_header(ctx)
    return {
        "success": True,
        "data": {
            "scope": header,
            "locked": [
                {"label": "Other Departments", "reason": "Not rendered; also blocked server-side"},
                {"label": "Other Colleges", "reason": "Not rendered; also blocked server-side"},
            ],
        },
    }


# --------------------------------------------------------------------------- Games & Activities
@router.get("/games/analytics")
async def hod_games_analytics(ctx: ScopeContext = HodCtx) -> dict[str, Any]:
    # Scope strictly by department
    query = {"collegeId": ctx.college_id}
    if ctx.department_id:
        query["departmentId"] = ctx.department_id

    total_students = await get_db().student_profiles.count_documents(query)
    attempts = await get_db().game_attempts.find(query).limit(1000).to_list(1000)

    unique_players = len({a.get("studentUserId") for a in attempts if a.get("studentUserId")})
    participation_pct = round((unique_players / max(1, total_students)) * 100, 1)
    completed_attempts = sum(1 for a in attempts if a.get("completed"))
    completion_rate = round((completed_attempts / max(1, len(attempts))) * 100, 1) if attempts else 0.0
    avg_score = round(sum(a.get("score", 0) for a in attempts) / max(1, len(attempts)), 1) if attempts else 0.0
    total_xp = sum(a.get("xpEarned", 0) for a in attempts)

    by_game: dict[str, dict[str, Any]] = {}
    for a in attempts:
        code = a.get("gameCode", "game")
        title = a.get("gameTitle", code)
        if code not in by_game:
            by_game[code] = {"code": code, "title": title, "attempts": 0, "scores": []}
        by_game[code]["attempts"] += 1
        by_game[code]["scores"].append(a.get("score", 0))

    most_played = sorted(
        [
            {
                "code": v["code"],
                "title": v["title"],
                "attempts": v["attempts"],
                "averageScore": round(sum(v["scores"]) / len(v["scores"]), 1),
            }
            for v in by_game.values()
        ],
        key=lambda x: x["attempts"],
        reverse=True,
    )[:5]

    by_cat: dict[str, list[float]] = {}
    for a in attempts:
        cat = a.get("category", "General")
        by_cat.setdefault(cat, []).append(a.get("score", 0))

    category_stats = [
        {"category": cat, "averageScore": round(sum(scores)/len(scores), 1), "attempts": len(scores)}
        for cat, scores in by_cat.items()
    ]

    return {
        "success": True,
        "data": {
            "totalStudents": total_students,
            "activePlayers": unique_players,
            "participationRate": participation_pct,
            "totalAttempts": len(attempts),
            "completionRate": completion_rate,
            "averageScore": avg_score,
            "totalXp": total_xp,
            "mostPlayedGames": most_played,
            "categoryPerformance": category_stats,
        },
    }


@router.get("/evaluations/reports/{report_id}")
async def hod_get_evaluation_report(
    report_id: str,
    ctx: ScopeContext = HodCtx,
) -> dict[str, Any]:
    """Requirement 26: SPOC views evaluation report for participant in their department."""
    from app.services.evaluation_report_service import get_evaluation_report

    report = await get_evaluation_report(ctx, report_id)
    return {"success": True, "data": report}


