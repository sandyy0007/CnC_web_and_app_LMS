"""CSV bulk import with row-level validation.

Rules taken from the requirements (§15, SRS §12):
  * validate row by row **before** committing — valid rows commit, invalid rows are returned with
    a specific reason; never all-or-nothing and never a silent partial failure
  * report success count, failed rows and the reason per row
  * downloadable templates per entity
  * configurable maximum row count
  * no scraping, no inferred data
"""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone
from typing import Any, Callable


from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.core.config import settings
from app.core.errors import ValidationError
from app.core.logging import get_logger
from app.core.security import hash_password
from app.db.mongo import get_db

log = get_logger("app.import")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- templates
TEMPLATES: dict[str, dict[str, Any]] = {
    "students": {
        "columns": [
            "name", "email", "rollNumber", "departmentCode", "batchCode", "semester",
            "section", "phone", "guardianName", "guardianPhone", "enrollmentType",
        ],
        "required": ["name", "email", "rollNumber", "departmentCode", "batchCode"],
        "sample": [
            "Rahul Sharma", "rahul.sharma@abcengg.edu", "CSE21B045", "CSE", "CSE-C",
            "6", "CS-A", "+91 9800000001", "S. Sharma", "+91 9800000002", "regular",
        ],
    },
    "trainers": {
        "columns": ["name", "email", "departmentCode", "modules", "phone", "designation"],
        "required": ["name", "email", "departmentCode"],
        "sample": [
            "Dr. R. Bose", "r.bose@abcengg.edu", "CSE", "Communication|Teamwork",
            "+91 9800000010", "Associate Professor",
        ],
    },
    "batches": {
        "columns": ["name", "code", "departmentCode", "semester", "capacity", "status"],
        "required": ["name", "code", "departmentCode"],
        "sample": ["Batch D", "CSE-D", "CSE", "6", "60", "active"],
    },
}


def template_csv(entity: str) -> bytes:
    spec = TEMPLATES.get(entity)
    if not spec:
        raise ValidationError(f"No import template for '{entity}'")
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(spec["columns"])
    writer.writerow(spec["sample"])
    return buffer.getvalue().encode("utf-8-sig")


def parse_csv(content: bytes, entity: str) -> list[dict[str, str]]:
    spec = TEMPLATES.get(entity)
    if not spec:
        raise ValidationError(f"Unsupported import entity '{entity}'")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValidationError("The file must be UTF-8 encoded CSV") from exc

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise ValidationError("The file appears to be empty")

    headers = {(h or "").strip().lstrip("﻿") for h in reader.fieldnames}
    missing = [c for c in spec["required"] if c not in headers]
    if missing:
        raise ValidationError(
            f"The file is missing required column(s): {', '.join(missing)}. "
            "Download the template to see the expected format."
        )

    rows = [
        {(k or "").strip(): (v or "").strip() for k, v in row.items() if k}
        for row in reader
    ]
    if len(rows) > settings.BULK_IMPORT_MAX_ROWS:
        raise ValidationError(
            f"This file has {len(rows)} rows — the maximum is "
            f"{settings.BULK_IMPORT_MAX_ROWS}. Split it into smaller files."
        )
    if not rows:
        raise ValidationError("The file has a header row but no data rows")
    return rows


# --------------------------------------------------------------------------- validation
class RowError(Exception):
    def __init__(self, field: str, value: Any, reason: str) -> None:
        self.field, self.value, self.reason = field, value, reason
        super().__init__(reason)


def _require(row: dict[str, str], field: str) -> str:
    value = (row.get(field) or "").strip()
    if not value:
        raise RowError(field, "", f"'{field}' is required")
    return value


def _email(row: dict[str, str]) -> str:
    value = _require(row, "email").lower()
    if not EMAIL_RE.match(value):
        raise RowError("email", value, "Not a valid email address")
    return value


def _int(row: dict[str, str], field: str, default: int | None = None) -> int | None:
    raw = (row.get(field) or "").strip()
    if not raw:
        return default
    try:
        return int(float(raw))
    except ValueError:
        raise RowError(field, raw, f"'{field}' must be a whole number") from None


# --------------------------------------------------------------------------- runner
async def run_import(
    ctx: ScopeContext, entity: str, content: bytes, *, filename: str | None = None
) -> dict[str, Any]:
    rows = parse_csv(content, entity)
    db = get_db()

    job = {
        "entity": entity,
        "filename": filename,
        "collegeId": ctx.college_id,
        "requestedBy": ctx.user_id,
        "requestedByLabel": ctx.actor_label,
        "totalRows": len(rows),
        "successCount": 0,
        "failureCount": 0,
        "status": "processing",
        "failedRows": [],
        "createdAt": _now(),
        "updatedAt": _now(),
        "deletedAt": None,
        "version": 1,
    }
    job_id = (await db.import_jobs.insert_one(job)).inserted_id

    handler: Callable[..., Any] = {
        "students": _import_student,
        "trainers": _import_trainer,
        "batches": _import_batch,
    }[entity]

    # Pre-resolve the scope's departments and batches so every row is validated against reality.
    departments = {
        d["code"].upper(): d
        for d in await db.departments.find(
            {"collegeId": ctx.college_id, "deletedAt": None}
        ).to_list(length=500)
    }
    batches = {
        b["code"].upper(): b
        for b in await db.batches.find(
            {"collegeId": ctx.college_id, "deletedAt": None}
        ).to_list(length=2000)
    }
    context = {"departments": departments, "batches": batches, "seenEmails": set(), "seenCodes": set()}

    succeeded, failed = 0, []
    for index, row in enumerate(rows, start=2):  # row 1 is the header
        try:
            await handler(ctx, row, context)
            succeeded += 1
        except RowError as exc:
            failed.append(
                {"row": index, "field": exc.field, "value": str(exc.value)[:120], "reason": exc.reason}
            )
        except Exception as exc:  # pragma: no cover - unexpected row failure
            log.error("import_row_failed", extra={"row": index, "error": str(exc)})
            failed.append(
                {"row": index, "field": "-", "value": "-", "reason": "Unexpected error for this row"}
            )

    await db.import_jobs.update_one(
        {"_id": job_id},
        {
            "$set": {
                "status": "completed" if not failed else "completed_with_errors",
                "successCount": succeeded,
                "failureCount": len(failed),
                "failedRows": failed[:1000],
                "finishedAt": _now(),
                "updatedAt": _now(),
            }
        },
    )
    await write_audit(
        ctx,
        action="create",
        entity_type="import_jobs",
        entity_id=job_id,
        after={"entity": entity, "success": succeeded, "failed": len(failed)},
        detail=f"bulk import of {entity}: {succeeded} imported, {len(failed)} rejected",
    )

    from app.services.notifications import Kind, notify

    await notify(
        user_id=ctx.user_id,
        kind=Kind.IMPORT_COMPLETE,
        title=f"Bulk import finished — {entity}",
        body=f"{succeeded} row(s) imported, {len(failed)} rejected.",
        href="/admin/bulk-import",
        college_id=ctx.college_id,
    )
    return {
        "jobId": str(job_id),
        "entity": entity,
        "totalRows": len(rows),
        "successCount": succeeded,
        "failureCount": len(failed),
        "failedRows": failed,
        "status": "completed" if not failed else "completed_with_errors",
    }


# --------------------------------------------------------------------------- row handlers
async def _resolve_department(row: dict[str, str], context: dict[str, Any]) -> dict[str, Any]:
    code = _require(row, "departmentCode").upper()
    department = context["departments"].get(code)
    if not department:
        raise RowError(
            "departmentCode", code, f"No department with code '{code}' exists in your institution"
        )
    return department


async def _import_student(ctx: ScopeContext, row: dict[str, str], context: dict[str, Any]) -> None:
    db = get_db()
    name = _require(row, "name")
    email = _email(row)
    roll = _require(row, "rollNumber").upper()
    department = await _resolve_department(row, context)

    batch_code = _require(row, "batchCode").upper()
    batch = context["batches"].get(batch_code)
    if not batch:
        raise RowError("batchCode", batch_code, f"No batch with code '{batch_code}' exists")
    if batch["departmentId"] != department["_id"]:
        raise RowError(
            "batchCode", batch_code, f"Batch '{batch_code}' does not belong to department "
            f"'{department['code']}'"
        )

    if email in context["seenEmails"]:
        raise RowError("email", email, "Duplicate email within this file")
    if roll in context["seenCodes"]:
        raise RowError("rollNumber", roll, "Duplicate roll number within this file")

    if await db.users.find_one({"email": email}):
        raise RowError("email", email, "A user with this email already exists")
    if await db.student_profiles.find_one({"collegeId": ctx.college_id, "rollNumber": roll}):
        raise RowError("rollNumber", roll, "This roll number is already used in your institution")

    enrollment_type = (row.get("enrollmentType") or "regular").lower()
    if enrollment_type not in ("regular", "lateral", "transfer"):
        raise RowError(
            "enrollmentType", enrollment_type, "Must be one of: regular, lateral, transfer"
        )

    user_id = (
        await db.users.insert_one(
            {
                "name": name,
                "email": email,
                "institutionId": roll,
                "passwordHash": hash_password(f"Eedi@{roll}"),
                "mustChangePassword": True,
                "role": "STUDENT",
                "collegeId": ctx.college_id,
                "departmentId": department["_id"],
                "departmentName": department.get("name"),
                "phone": row.get("phone") or None,
                "status": "active",
                "emailVerified": True,  # institution-provisioned account
                "provisionedBy": "bulk_import",
                "createdAt": _now(),
                "updatedAt": _now(),
                "createdBy": ctx.user_id,
                "deletedAt": None,
                "version": 1,
            }
        )
    ).inserted_id

    await db.student_profiles.insert_one(
        {
            "userId": user_id,
            "name": name,
            "email": email,
            "rollNumber": roll,
            "collegeId": ctx.college_id,
            "departmentId": department["_id"],
            "departmentName": department.get("name"),
            "batchId": batch["_id"],
            "batchName": batch.get("name"),
            "semester": _int(row, "semester", 1),
            "section": row.get("section") or None,
            "guardianInfo": {
                "name": row.get("guardianName") or None,
                "phone": row.get("guardianPhone") or None,
            },
            "profileCompleteness": 60,
            "status": "active",
            "createdAt": _now(),
            "updatedAt": _now(),
            "createdBy": ctx.user_id,
            "deletedAt": None,
            "version": 1,
        }
    )
    enrollment_id = (
        await db.enrollments.insert_one(
            {
                "studentUserId": user_id,
                "studentName": name,
                "rollNumber": roll,
                "collegeId": ctx.college_id,
                "departmentId": department["_id"],
                "batchId": batch["_id"],
                "batchName": batch.get("name"),
                "enrolledBy": ctx.user_id,
                "enrolledByLabel": ctx.actor_label,
                "enrolledAt": _now(),
                "enrollmentType": enrollment_type,
                "status": "active",
                "previousEnrollmentId": None,
                "createdAt": _now(),
                "updatedAt": _now(),
                "deletedAt": None,
                "version": 1,
            }
        )
    ).inserted_id
    await db.enrollment_events.insert_one(
        {
            "enrollmentId": enrollment_id,
            "studentUserId": user_id,
            "collegeId": ctx.college_id,
            "departmentId": department["_id"],
            "fromStatus": None,
            "toStatus": "active",
            "reason": "Bulk import",
            "actorId": ctx.user_id,
            "actorLabel": ctx.actor_label,
            "at": _now(),
        }
    )
    context["seenEmails"].add(email)
    context["seenCodes"].add(roll)


async def _import_trainer(ctx: ScopeContext, row: dict[str, str], context: dict[str, Any]) -> None:
    db = get_db()
    name = _require(row, "name")
    email = _email(row)
    department = await _resolve_department(row, context)

    if email in context["seenEmails"]:
        raise RowError("email", email, "Duplicate email within this file")
    if await db.users.find_one({"email": email}):
        raise RowError("email", email, "A user with this email already exists")

    user_id = (
        await db.users.insert_one(
            {
                "name": name,
                "email": email,
                "passwordHash": hash_password("Eedi@Trainer1"),
                "mustChangePassword": True,
                "role": "TRAINER",
                "collegeId": ctx.college_id,
                "departmentId": department["_id"],
                "departmentName": department.get("name"),
                "designation": row.get("designation") or None,
                "phone": row.get("phone") or None,
                "status": "active",
                "emailVerified": True,
                "provisionedBy": "bulk_import",
                "createdAt": _now(),
                "updatedAt": _now(),
                "createdBy": ctx.user_id,
                "deletedAt": None,
                "version": 1,
            }
        )
    ).inserted_id

    module_names = [m.strip() for m in (row.get("modules") or "").split("|") if m.strip()]
    for module_name in module_names:
        module = await db.training_modules.find_one(
            {"collegeId": ctx.college_id, "name": module_name, "deletedAt": None}
        )
        if not module:
            raise RowError("modules", module_name, f"No training module named '{module_name}'")
        await db.trainer_assignments.insert_one(
            {
                "trainerUserId": user_id,
                "trainerName": name,
                "collegeId": ctx.college_id,
                "departmentId": department["_id"],
                "batchId": None,
                "trainingModuleId": module["_id"],
                "trainingModuleName": module_name,
                "academicYear": str(_now().year),
                "active": True,
                "createdAt": _now(),
                "updatedAt": _now(),
                "createdBy": ctx.user_id,
                "deletedAt": None,
                "version": 1,
            }
        )
    context["seenEmails"].add(email)


async def _import_batch(ctx: ScopeContext, row: dict[str, str], context: dict[str, Any]) -> None:
    db = get_db()
    name = _require(row, "name")
    code = _require(row, "code").upper()
    department = await _resolve_department(row, context)

    if code in context["seenCodes"]:
        raise RowError("code", code, "Duplicate batch code within this file")
    if await db.batches.find_one({"collegeId": ctx.college_id, "code": code}):
        raise RowError("code", code, "A batch with this code already exists")

    status = (row.get("status") or "active").lower()
    if status not in ("active", "archived", "upcoming"):
        raise RowError("status", status, "Must be one of: active, upcoming, archived")

    inserted = await db.batches.insert_one(
        {
            "name": name,
            "code": code,
            "collegeId": ctx.college_id,
            "departmentId": department["_id"],
            "departmentName": department.get("name"),
            "semesterNumber": _int(row, "semester", 1),
            "capacity": _int(row, "capacity", 60),
            "status": status,
            "createdAt": _now(),
            "updatedAt": _now(),
            "createdBy": ctx.user_id,
            "deletedAt": None,
            "version": 1,
        }
    )
    context["batches"][code] = {
        "_id": inserted.inserted_id,
        "code": code,
        "name": name,
        "departmentId": department["_id"],
    }
    context["seenCodes"].add(code)
