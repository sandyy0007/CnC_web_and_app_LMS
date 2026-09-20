"""Report generation.

Reports are real data queries — never canned output. Every request is scoped to the caller,
recorded in `report_jobs` with its filters, and logged for audit ("who exported what, when").
Small reports are produced synchronously; anything over `REPORT_ASYNC_ROW_THRESHOLD` rows is
handed to the background worker so the HTTP request cannot time out (SRS §9, §21).

Generated files go to private object storage and are delivered only through expiring signed URLs.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Sequence

from bson import ObjectId

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.core.config import settings
from app.core.errors import BusinessRuleViolation, ValidationError
from app.core.logging import get_logger
from app.db.mongo import get_db
from app.services.storage import Keys, put_object, signed_url

log = get_logger("app.reports")

FORMATS = ("xlsx", "csv", "pdf")

QUEUED, PROCESSING, READY, FAILED = "queued", "processing", "ready", "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- report catalogue
class ReportFamily:
    ATTENDANCE = "attendance"
    ASSESSMENT = "assessment"
    ENROLLMENT = "enrollment"
    DEFAULTERS = "defaulters"
    CERTIFICATION = "certification"
    FEEDBACK = "feedback"
    TRAINER = "trainer"
    LEARNING = "learning"
    PRACTICE = "practice"
    PLACEMENT = "placement"
    AUDIT = "audit"
    USERS = "users"
    SYSTEM = "system"
    PREDICTION = "prediction"


#: The 14 report families referenced by the Admin requirements. The catalogue is generated as
#: family × time-grain × entity × signal, which is what produces the 300+ report count without
#: hand-writing 300 endpoints.
REPORT_FAMILIES: tuple[dict[str, Any], ...] = (
    {"code": ReportFamily.ATTENDANCE, "label": "Session Attendance",
     "description": "Overall, module-wise and batch-wise attendance for a date/batch range.",
     "signals": ["attendance", "trends"], "roles": ["HOD", "ADMIN", "TRAINER"]},
    {"code": ReportFamily.ASSESSMENT, "label": "Skill Assessment",
     "description": "Rubric scores, batch averages and proficiency distribution.",
     "signals": ["skill_trends", "completion"], "roles": ["HOD", "ADMIN", "TRAINER"]},
    {"code": ReportFamily.ENROLLMENT, "label": "Enrollment",
     "description": "Enrollment history and current status for the scope.",
     "signals": ["enrollment"], "roles": ["HOD", "ADMIN"]},
    {"code": ReportFamily.DEFAULTERS, "label": "Attendance Defaulters",
     "description": "Participants below the configured attendance threshold.",
     "signals": ["attendance"], "roles": ["HOD", "ADMIN", "TRAINER"]},
    {"code": ReportFamily.CERTIFICATION, "label": "Certification",
     "description": "Certificate eligibility and issuance status per participant.",
     "signals": ["completion"], "roles": ["HOD", "ADMIN"]},
    {"code": ReportFamily.FEEDBACK, "label": "Trainer Feedback",
     "description": "Feedback entries and ratings captured per session or module.",
     "signals": ["feedback"], "roles": ["HOD", "ADMIN"]},
    {"code": ReportFamily.TRAINER, "label": "Trainer Workload",
     "description": "Trainers, assigned modules, sessions conducted and workload.",
     "signals": ["workload"], "roles": ["HOD", "ADMIN"]},
    {"code": ReportFamily.LEARNING, "label": "Learning Hours & Completion",
     "description": "Learning hours, course completion and progress by entity.",
     "signals": ["learning_hours", "completion"], "roles": ["ADMIN", "HOD"]},
    {"code": ReportFamily.PRACTICE, "label": "Practice & AI Activity",
     "description": "Practice sessions, AI scores and improvement deltas.",
     "signals": ["skill_trends"], "roles": ["ADMIN", "HOD"]},
    {"code": ReportFamily.PLACEMENT, "label": "Placement Readiness",
     "description": "Readiness scores against placement goals and drive eligibility.",
     "signals": ["prediction", "completion"], "roles": ["ADMIN"]},
    {"code": ReportFamily.AUDIT, "label": "Audit Trail",
     "description": "Create/update/delete history for scoped records.",
     "signals": ["audit"], "roles": ["HOD", "ADMIN"]},
    {"code": ReportFamily.USERS, "label": "Users & Roles",
     "description": "Accounts, roles, status and last activity.",
     "signals": ["accounts"], "roles": ["ADMIN"]},
    {"code": ReportFamily.SYSTEM, "label": "System & AI Usage",
     "description": "Server load, AI usage and job-queue health.",
     "signals": ["usage"], "roles": ["ADMIN"]},
    {"code": ReportFamily.PREDICTION, "label": "Risk & Prediction",
     "description": "At-risk participants derived from attendance and score trends.",
     "signals": ["prediction"], "roles": ["ADMIN", "HOD"]},
)

TIME_GRAINS = ("daily", "weekly", "monthly", "semester", "yearly")
ENTITY_GRAINS = ("department", "branch", "trainer", "student", "placement")


def report_catalogue(role: str) -> dict[str, Any]:
    """Family × time × entity catalogue, filtered to what this role may run."""
    families = [f for f in REPORT_FAMILIES if role in f["roles"] or role == "SUPER_ADMIN"]
    entries = []
    for family in families:
        for grain in TIME_GRAINS:
            for entity in ENTITY_GRAINS:
                entries.append(
                    {
                        "id": f"{family['code']}.{grain}.{entity}",
                        "family": family["code"],
                        "familyLabel": family["label"],
                        "timeGrain": grain,
                        "entity": entity,
                        "signals": family["signals"],
                    }
                )
    return {
        "families": families,
        "timeGrains": list(TIME_GRAINS),
        "entities": list(ENTITY_GRAINS),
        "totalReports": len(entries),
        "entries": entries,
    }


# --------------------------------------------------------------------------- writers
def to_csv(columns: Sequence[str], rows: Sequence[Sequence[Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8-sig")


def to_xlsx(
    title: str, columns: Sequence[str], rows: Sequence[Sequence[Any]], *, meta: dict[str, Any] | None = None
) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = title[:31] or "Report"

    header_fill = PatternFill("solid", fgColor="171340")
    header_font = Font(color="FFFFFF", bold=True, size=10)

    sheet.append(list(columns))
    for index in range(1, len(columns) + 1):
        cell = sheet.cell(row=1, column=index)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    sheet.row_dimensions[1].height = 22

    for row in rows:
        sheet.append(["" if v is None else v for v in row])

    for index, column in enumerate(columns, start=1):
        width = max(len(str(column)) + 4, 12)
        for row in rows[:400]:
            if index - 1 < len(row):
                width = max(width, min(46, len(str(row[index - 1])) + 3))
        sheet.column_dimensions[get_column_letter(index)].width = width
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions

    if meta:
        info = workbook.create_sheet("Report info")
        info.append(["Field", "Value"])
        info.cell(row=1, column=1).font = Font(bold=True)
        info.cell(row=1, column=2).font = Font(bold=True)
        for key, value in meta.items():
            info.append([key, str(value)])
        info.column_dimensions["A"].width = 26
        info.column_dimensions["B"].width = 60

    stream = io.BytesIO()
    workbook.save(stream)
    return stream.getvalue()


def to_pdf(
    title: str,
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
    *,
    subtitle: str = "",
    meta: dict[str, Any] | None = None,
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    stream = io.BytesIO()
    document = SimpleDocTemplate(
        stream,
        pagesize=landscape(A4) if len(columns) > 6 else A4,
        leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
        title=title, author="Winners Creek",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=16, textColor=colors.HexColor("#171340"), spaceAfter=2)
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=8.5, textColor=colors.HexColor("#6B6C86"), alignment=TA_LEFT)
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=7.6, leading=9.4)
    head = ParagraphStyle("head", parent=styles["Normal"], fontSize=7.4, leading=9, textColor=colors.white)

    story: list[Any] = [Paragraph(title, h1)]
    if subtitle:
        story.append(Paragraph(subtitle, sub))
    story.append(Spacer(1, 7 * mm))

    if rows:
        data = [[Paragraph(str(c), head) for c in columns]]
        for row in rows[:4000]:
            data.append([Paragraph("" if v is None else str(v), cell) for v in row])
        table = Table(data, repeatRows=1, hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#171340")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E7E8F2")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F8FC")]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(table)
    else:
        story.append(Paragraph("No records matched the selected filters.", sub))

    if meta:
        story.extend([PageBreak(), Paragraph("Report details", h1), Spacer(1, 4 * mm)])
        story.append(
            Table(
                [[Paragraph("Field", head), Paragraph("Value", head)]]
                + [[Paragraph(str(k), cell), Paragraph(str(v), cell)] for k, v in meta.items()],
                colWidths=[55 * mm, 110 * mm],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#171340")),
                        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E7E8F2")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ]
                ),
            )
        )

    document.build(story)
    return stream.getvalue()


MIME = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv",
    "pdf": "application/pdf",
}


def render(
    fmt: str,
    *,
    title: str,
    subtitle: str,
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
    meta: dict[str, Any],
) -> tuple[bytes, str]:
    if fmt not in FORMATS:
        raise ValidationError(f"Unsupported report format '{fmt}'")
    if fmt == "csv":
        return to_csv(columns, rows), MIME["csv"]
    if fmt == "xlsx":
        return to_xlsx(title, columns, rows, meta=meta), MIME["xlsx"]
    return to_pdf(title, columns, rows, subtitle=subtitle, meta=meta), MIME["pdf"]


# --------------------------------------------------------------------------- dataset registry
#: A dataset builder returns (columns, rows, title). Registered per report type so HOD, trainer
#: and admin all share one implementation with different scope.
DatasetBuilder = Callable[[ScopeContext, dict[str, Any]], Awaitable[tuple[list[str], list[list[Any]], str]]]
_datasets: dict[str, DatasetBuilder] = {}


def dataset(name: str) -> Callable[[DatasetBuilder], DatasetBuilder]:
    def register(fn: DatasetBuilder) -> DatasetBuilder:
        _datasets[name] = fn
        return fn

    return register


def available_datasets() -> list[str]:
    return sorted(_datasets)


async def build_dataset(
    ctx: ScopeContext, report_type: str, filters: dict[str, Any]
) -> tuple[list[str], list[list[Any]], str]:
    builder = _datasets.get(report_type)
    if not builder:
        raise ValidationError(
            f"Unknown report type '{report_type}'. Available: {', '.join(available_datasets())}"
        )
    return await builder(ctx, filters)


# --------------------------------------------------------------------------- job lifecycle
async def request_report(
    ctx: ScopeContext,
    *,
    report_type: str,
    fmt: str,
    filters: dict[str, Any] | None = None,
    force_async: bool = False,
) -> dict[str, Any]:
    """Create a report job; run it now if small, otherwise queue it."""
    if fmt not in FORMATS:
        raise ValidationError(f"Unsupported format '{fmt}' — choose one of {', '.join(FORMATS)}")
    if report_type not in _datasets:
        raise ValidationError(f"Unknown report type '{report_type}'")

    filters = {k: v for k, v in (filters or {}).items() if v not in (None, "")}
    db = get_db()
    job = {
        "reportType": report_type,
        "format": fmt,
        "filters": filters,
        "status": QUEUED,
        "requestedBy": ctx.user_id,
        "requestedByLabel": ctx.actor_label,
        "requestedByRole": str(ctx.role),
        "collegeId": ctx.college_id,
        "departmentId": ctx.department_id,
        "scope": {
            "role": str(ctx.role),
            "collegeId": str(ctx.college_id) if ctx.college_id else None,
            "departmentId": str(ctx.department_id) if ctx.department_id else None,
        },
        "rowCount": None,
        "error": None,
        "exportId": None,
        "createdAt": _now(),
        "updatedAt": _now(),
        "deletedAt": None,
        "version": 1,
    }
    result = await db.report_jobs.insert_one(job)
    job_id = result.inserted_id

    await write_audit(
        ctx,
        action="export",
        entity_type="report_jobs",
        entity_id=job_id,
        after={"reportType": report_type, "format": fmt, "filters": filters},
        detail=f"{report_type} export requested as {fmt.upper()}",
    )

    # Decide sync vs async from the real row count, not a guess.
    columns, rows, title = await build_dataset(ctx, report_type, filters)
    if force_async or len(rows) > settings.REPORT_ASYNC_ROW_THRESHOLD:
        from app.workers.queue import enqueue

        # Record the row count *before* handing the job over: a worker that finishes quickly
        # must not have its `ready` status overwritten by a late `queued` write.
        await db.report_jobs.update_one(
            {"_id": job_id}, {"$set": {"rowCount": len(rows), "updatedAt": _now()}}
        )
        await enqueue("report.generate", {"jobId": str(job_id), "userId": str(ctx.user_id)})
        current = await db.report_jobs.find_one({"_id": job_id}, {"status": 1})
        return {
            "id": str(job_id),
            "status": (current or {}).get("status", QUEUED),
            "async": True,
            "rowCount": len(rows),
            "message": "This export is large and is being generated in the background. "
                       "You'll be notified when it's ready.",
        }

    finished = await _finalise(ctx, job_id, report_type, fmt, filters, columns, rows, title)
    return {"id": str(job_id), "async": False, **finished}


async def _finalise(
    ctx: ScopeContext,
    job_id: ObjectId,
    report_type: str,
    fmt: str,
    filters: dict[str, Any],
    columns: list[str],
    rows: list[list[Any]],
    title: str,
) -> dict[str, Any]:
    db = get_db()
    await db.report_jobs.update_one(
        {"_id": job_id}, {"$set": {"status": PROCESSING, "updatedAt": _now()}}
    )
    meta = {
        "Report": title,
        "Generated at": _now().strftime("%d %b %Y, %H:%M UTC"),
        "Requested by": ctx.actor_label,
        "Scope": f"college={ctx.college_id} department={ctx.department_id or 'all'}",
        "Filters": filters or "none",
        "Rows": len(rows),
        "Scoring version": settings.SCORING_VERSION,
    }
    subtitle = f"Generated {meta['Generated at']} · {len(rows)} row(s) · scoped to the requester"
    content, mime = render(
        fmt, title=title, subtitle=subtitle, columns=columns, rows=rows, meta=meta
    )

    key = Keys.report(str(job_id), fmt)
    stored = await put_object(key, content, mime)
    filename = f"{report_type}-{_now():%Y%m%d-%H%M}.{fmt}"
    export = await db.report_exports.insert_one(
        {
            "jobId": job_id,
            "storageKey": stored.key,
            "bytes": stored.bytes,
            "checksum": stored.checksum,
            "contentType": mime,
            "filename": filename,
            "rowCount": len(rows),
            "collegeId": ctx.college_id,
            "departmentId": ctx.department_id,
            "requestedBy": ctx.user_id,
            "createdAt": _now(),
            "updatedAt": _now(),
            "deletedAt": None,
        }
    )
    await db.report_jobs.update_one(
        {"_id": job_id},
        {
            "$set": {
                "status": READY,
                "rowCount": len(rows),
                "exportId": export.inserted_id,
                "storageKey": stored.key,
                "filename": filename,
                "bytes": stored.bytes,
                "readyAt": _now(),
                "updatedAt": _now(),
            }
        },
    )
    return {
        "status": READY,
        "rowCount": len(rows),
        "filename": filename,
        "exportId": str(export.inserted_id),
        "downloadUrl": await signed_url(stored.key, filename=filename),
        "bytes": stored.bytes,
    }


async def mark_failed(job_id: Any, error: str) -> None:
    await get_db().report_jobs.update_one(
        {"_id": ObjectId(str(job_id))},
        {"$set": {"status": FAILED, "error": error[:500], "updatedAt": _now()}},
    )


async def download_url_for_export(ctx: ScopeContext, export_id: Any) -> dict[str, Any]:
    """Signed, expiring download — scope-checked before the link is minted."""
    export = await get_db().report_exports.find_one({"_id": ObjectId(str(export_id))})
    if not export:
        from app.core.errors import ScopeForbidden

        raise ScopeForbidden()
    if not ctx.is_platform_wide:
        if export.get("collegeId") != ctx.college_id:
            from app.core.errors import ScopeForbidden

            raise ScopeForbidden()
        from app.authz.roles import Role

        if (
            ctx.role is Role.HOD
            and export.get("departmentId") is not None
            and export["departmentId"] != ctx.department_id
        ):
            from app.core.errors import ScopeForbidden

            raise ScopeForbidden()
        if ctx.role is Role.TRAINER and export.get("requestedBy") != ctx.user_id:
            from app.core.errors import ScopeForbidden

            raise ScopeForbidden()
    if not export.get("storageKey"):
        raise BusinessRuleViolation("This export has no file yet")
    await write_audit(
        ctx,
        action="export",
        entity_type="report_exports",
        entity_id=export["_id"],
        detail=f"downloaded {export.get('filename')}",
    )
    return {
        "filename": export.get("filename"),
        "url": await signed_url(export["storageKey"], filename=export.get("filename")),
        "expiresInSeconds": settings.SIGNED_URL_TTL_SECONDS,
        "bytes": export.get("bytes"),
    }
