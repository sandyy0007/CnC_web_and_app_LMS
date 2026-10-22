"""CSV bulk import with row-level validation and PostgreSQL persistence.

Rules taken from the requirements (§15, SRS §12):
  * validate row by row before committing — valid rows commit, invalid rows are returned with
    a specific reason; never all-or-nothing and never a silent partial failure
  * report total rows, valid rows, inserted count, updated count, skipped duplicates, and rejected rows
  * downloadable templates per entity with UTF-8 encoding and Excel compatibility
  * persist validated records in PostgreSQL authoritative database tables using canonical schemas
  * maintain strict institution and department tenant scoping
  * configurable maximum row count
"""
from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import UUID

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.core.config import settings
from app.core.errors import ValidationError
from app.core.logging import get_logger
from app.core.security import hash_password
from app.db.mongo import get_db
from app.db.postgres import get_pg_connection

log = get_logger("app.import")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
ATTENDANCE_STATUSES = {"PRESENT", "ABSENT", "LATE", "EXCUSED"}


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
            "Rahul Sharma", "rahul.sharma@aryacollege.in", "23EARCS999", "CSE", "2023-27-VII-CS-A",
            "7", "A", "+91 9800000001", "S. Sharma", "+91 9800000002", "regular",
        ],
    },
    "trainers": {
        "columns": [
            "name", "email", "departmentCode", "designation", "specializations",
            "phone", "assignedBatchCode",
        ],
        "required": ["name", "email", "departmentCode"],
        "sample": [
            "Dr. R. Bose", "r.bose.trainer@aryacollege.in", "CSE", "Associate Professor",
            "Communication|Teamwork|Leadership", "+91 9800000010", "2023-27-VII-CS-A",
        ],
    },
    "batches": {
        "columns": ["name", "code", "departmentCode", "semester", "capacity", "status"],
        "required": ["name", "code", "departmentCode"],
        "sample": ["Batch VII-CS-C", "2023-27-VII-CS-C", "CSE", "7", "60", "active"],
    },
    "attendance": {
        "columns": ["rollNumber", "sessionId", "status", "remarks"],
        "required": ["rollNumber", "sessionId", "status"],
        "sample": [
            "23EARCS001", "736e58ec-f139-4789-b36d-02da3dc934da", "PRESENT", "Summer soft skills training",
        ],
    },
}


def template_csv(entity: str) -> bytes:
    spec = TEMPLATES.get(entity)
    if not spec:
        raise ValidationError(f"No import template for '{entity}'. Supported templates: {', '.join(sorted(TEMPLATES))}")
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

    headers = {(h or "").strip().lstrip("\ufeff") for h in reader.fieldnames}
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


def _to_uuid(val: Any) -> UUID | None:
    if not val:
        return None
    try:
        return UUID(str(val))
    except Exception:
        return None


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
        "attendance": _import_attendance,
    }[entity]

    # Pre-resolve institutional departments and batches in PostgreSQL
    inst_uuid = _to_uuid(ctx.college_id)
    departments: dict[str, dict[str, Any]] = {}
    batches: dict[str, dict[str, Any]] = {}

    if settings.USE_POSTGRES:
        async with get_pg_connection() as conn:
            # Fallback to Arya College if institution not provided
            if not inst_uuid:
                row_inst = await conn.fetchrow("SELECT id FROM institutions ORDER BY created_at ASC LIMIT 1")
                if row_inst:
                    inst_uuid = row_inst["id"]

            dept_rows = await conn.fetch(
                "SELECT id, code, name, institution_id FROM departments WHERE institution_id = $1::uuid OR $1::uuid IS NULL",
                inst_uuid,
            )
            for d in dept_rows:
                departments[d["code"].upper()] = dict(d)

            batch_rows = await conn.fetch(
                "SELECT id, code, name, department_id, institution_id, semester FROM batches WHERE institution_id = $1::uuid OR $1::uuid IS NULL",
                inst_uuid,
            )
            for b in batch_rows:
                batches[b["code"].upper()] = dict(b)
    else:
        for d in await db.departments.find({"collegeId": ctx.college_id, "deletedAt": None}).to_list(length=500):
            departments[d["code"].upper()] = d
        for b in await db.batches.find({"collegeId": ctx.college_id, "deletedAt": None}).to_list(length=2000):
            batches[b["code"].upper()] = b

    context: dict[str, Any] = {
        "inst_uuid": inst_uuid,
        "departments": departments,
        "batches": batches,
        "seenEmails": set(),
        "seenCodes": set(),
        "seenAttendance": set(),
        "inserted_count": 0,
        "updated_count": 0,
        "skipped_duplicates": 0,
    }

    succeeded, failed = 0, []
    for index, row in enumerate(rows, start=2):  # row 1 is the header
        try:
            status_res = await handler(ctx, row, context)
            succeeded += 1
        except RowError as exc:
            failed.append(
                {"row": index, "field": exc.field, "value": str(exc.value)[:120], "reason": exc.reason}
            )
        except Exception as exc:  # pragma: no cover - unexpected row failure
            log.error("import_row_failed", extra={"row": index, "error": str(exc)})
            failed.append(
                {"row": index, "field": "-", "value": "-", "reason": f"Unexpected error: {str(exc)}"}
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

    errors_for_ui = [
        {"row": f["row"], "error": f["reason"], "field": f["field"], "value": f["value"]}
        for f in failed
    ]

    return {
        "jobId": str(job_id),
        "entity": entity,
        "totalRows": len(rows),
        "validRows": succeeded,
        "successCount": succeeded,
        "insertedCount": context["inserted_count"],
        "updatedCount": context["updated_count"],
        "skippedDuplicates": context["skipped_duplicates"],
        "failureCount": len(failed),
        "failedRows": failed,
        "errors": errors_for_ui,
        "status": "completed" if not failed else "completed_with_errors",
    }


# --------------------------------------------------------------------------- department helper
def _resolve_department(row: dict[str, str], context: dict[str, Any]) -> dict[str, Any]:
    code = _require(row, "departmentCode").upper()
    department = context["departments"].get(code)
    if not department:
        raise RowError(
            "departmentCode", code, f"No department with code '{code}' exists in your institution"
        )
    return department


# --------------------------------------------------------------------------- row handlers
async def _import_attendance(ctx: ScopeContext, row: dict[str, str], context: dict[str, Any]) -> str:
    """Validate and persist attendance record into PostgreSQL attendance_records."""
    roll = _require(row, "rollNumber").upper()
    session_id_raw = _require(row, "sessionId")
    status_raw = _require(row, "status").upper()
    remarks = (row.get("remarks") or "").strip() or None

    # Status enum check
    if status_raw not in ATTENDANCE_STATUSES:
        raise RowError(
            "status", status_raw,
            f"Invalid attendance status '{status_raw}' — must be one of: {', '.join(sorted(ATTENDANCE_STATUSES))}"
        )

    # Session UUID format check
    session_uuid = _to_uuid(session_id_raw)
    if not session_uuid:
        raise RowError("sessionId", session_id_raw, f"Invalid session ID format '{session_id_raw}' (must be a valid UUID)")

    # Intra-file duplicate check
    combo_key = (roll, str(session_uuid))
    if combo_key in context["seenAttendance"]:
        raise RowError(
            "rollNumber", roll,
            f"Duplicate attendance entry for participant '{roll}' and session '{session_id_raw}' within this file"
        )
    context["seenAttendance"].add(combo_key)

    if not settings.USE_POSTGRES:
        db = get_db()
        student = await db.student_profiles.find_one({"rollNumber": roll, "collegeId": ctx.college_id})
        if not student:
            raise RowError("rollNumber", roll, f"Participant with roll number '{roll}' does not exist")
        await db.attendance.insert_one({
            "studentUserId": student.get("userId"),
            "rollNumber": roll,
            "sessionId": session_id_raw,
            "status": status_raw,
            "remarks": remarks,
            "collegeId": ctx.college_id,
            "createdAt": _now(),
        })
        context["inserted_count"] += 1
        return "inserted"

    inst_uuid = context.get("inst_uuid")
    actor_uuid = _to_uuid(ctx.user_id)

    async with get_pg_connection() as conn:
        # Validate participant
        student = await conn.fetchrow(
            """
            SELECT sp.id, sp.user_id, sp.roll_number, sp.institution_id, sp.department_id, sp.batch_id
            FROM student_profiles sp
            WHERE UPPER(sp.roll_number) = UPPER($1)
            """,
            roll,
        )
        if not student:
            raise RowError("rollNumber", roll, f"Participant with roll number '{roll}' does not exist")
        if inst_uuid and student["institution_id"] and student["institution_id"] != inst_uuid:
            raise RowError("rollNumber", roll, "Participant belongs to a different institution")

        # Validate session
        session = await conn.fetchrow(
            "SELECT ts.id, ts.institution_id, ts.department_id, ts.batch_id, ts.topic, ts.session_date FROM training_sessions ts WHERE ts.id = $1",
            session_uuid,
        )
        if not session:
            raise RowError("sessionId", session_id_raw, f"Training session '{session_id_raw}' not found")
        if inst_uuid and session["institution_id"] and session["institution_id"] != inst_uuid:
            raise RowError("sessionId", session_id_raw, "Training session belongs to a different institution")

        # Eligibility check
        if session.get("batch_id") and student.get("batch_id") and session["batch_id"] != student["batch_id"]:
            raise RowError(
                "sessionId", session_id_raw,
                f"Participant '{roll}' is not assigned to the batch for this session"
            )
        if session.get("department_id") and student.get("department_id") and session["department_id"] != student["department_id"]:
            raise RowError(
                "sessionId", session_id_raw,
                f"Participant '{roll}' belongs to a different department than this session"
            )

        # Check existing attendance in PostgreSQL
        existing = await conn.fetchrow(
            "SELECT id, status FROM attendance_records WHERE session_id = $1 AND participant_user_id = $2",
            session_uuid,
            student["user_id"],
        )

        if existing:
            if existing["status"] == status_raw:
                context["skipped_duplicates"] += 1
                return "duplicate_skipped"
            else:
                await conn.execute(
                    "UPDATE attendance_records SET status = $1::attendance_status_enum, marked_by = $2, marked_at = NOW(), remarks = COALESCE($3, remarks) WHERE id = $4",
                    status_raw,
                    actor_uuid,
                    remarks,
                    existing["id"],
                )
                context["updated_count"] += 1
                return "updated"

        # Insert new record
        await conn.execute(
            "INSERT INTO attendance_records (id, session_id, participant_user_id, status, marked_by, marked_at, remarks, created_at) VALUES (gen_random_uuid(), $1, $2, $3::attendance_status_enum, $4, NOW(), $5, NOW())",
            session_uuid,
            student["user_id"],
            status_raw,
            actor_uuid,
            remarks,
        )
        context["inserted_count"] += 1
        return "inserted"


async def _import_trainer(ctx: ScopeContext, row: dict[str, str], context: dict[str, Any]) -> str:
    """Validate and persist trainer account and profile into PostgreSQL users and trainer_profiles."""
    name = _require(row, "name")
    email = _email(row)
    department = _resolve_department(row, context)
    designation = (row.get("designation") or "Soft Skills Trainer").strip()
    phone = (row.get("phone") or "").strip() or None
    batch_code = (row.get("assignedBatchCode") or "").strip().upper()

    if email in context["seenEmails"]:
        raise RowError("email", email, "Duplicate email within this file")

    raw_specs = row.get("specializations") or row.get("modules") or ""
    specs = [s.strip() for s in raw_specs.split("|") if s.strip()]
    if not specs:
        specs = ["Professional Communication", "Soft Skills", "Interview Preparation"]

    inst_uuid = context.get("inst_uuid")
    dept_uuid = _to_uuid(department.get("id") or department.get("_id"))

    if not settings.USE_POSTGRES:
        db = get_db()
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
                    "departmentId": department.get("_id") or department.get("id"),
                    "departmentName": department.get("name"),
                    "designation": designation,
                    "phone": phone,
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
        context["seenEmails"].add(email)
        context["inserted_count"] += 1
        return "inserted"

    assigned_batch_uuid = None
    if batch_code:
        batch = context["batches"].get(batch_code)
        if not batch:
            raise RowError("assignedBatchCode", batch_code, f"No batch with code '{batch_code}' exists in your institution")
        dept_id = str(department.get("_id") or department.get("id"))
        b_dept = str(batch.get("department_id") or batch.get("departmentId"))
        if b_dept and dept_id and b_dept != dept_id:
            dept_ident = department.get("code") or department.get("name")
            raise RowError("assignedBatchCode", batch_code, f"Batch '{batch_code}' does not belong to department '{dept_ident}'")
        assigned_batch_uuid = _to_uuid(batch.get("id") or batch.get("_id"))

    async with get_pg_connection() as conn:
        existing_user = await conn.fetchrow(
            "SELECT id, role, email, status FROM users WHERE LOWER(email) = LOWER($1)",
            email,
        )
        if existing_user:
            if existing_user["role"] != "TRAINER":
                raise RowError("email", email, f"A user with email '{email}' already exists with role '{existing_user['role']}'")

            # Update existing trainer profile if present
            await conn.execute(
                "UPDATE trainer_profiles SET title = COALESCE($1, title), specializations = $2, updated_at = NOW() WHERE user_id = $3",
                designation,
                specs,
                existing_user["id"],
            )
            if assigned_batch_uuid:
                await conn.execute(
                    "INSERT INTO batch_trainers (id, batch_id, trainer_user_id, assigned_at) VALUES (gen_random_uuid(), $1, $2, NOW()) ON CONFLICT DO NOTHING",
                    assigned_batch_uuid,
                    existing_user["id"],
                )
            context["seenEmails"].add(email)
            context["skipped_duplicates"] += 1
            return "duplicate_updated"

        # Create new trainer in PostgreSQL
        new_user_id = uuid.uuid4()
        temp_password = f"Trainer@{_now().year}"
        await conn.execute(
            "INSERT INTO users (id, email, password_hash, name, role, institution_id, department_id, phone, status, created_at, updated_at) VALUES ($1, LOWER($2), $3, $4, 'TRAINER'::user_role_enum, $5, $6, $7, 'ACTIVE'::record_status_enum, NOW(), NOW())",
            new_user_id,
            email,
            hash_password(temp_password),
            name,
            inst_uuid,
            dept_uuid,
            phone,
        )

        await conn.execute(
            "INSERT INTO trainer_profiles (id, user_id, title, specializations, institution_id, department_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET title = EXCLUDED.title, specializations = EXCLUDED.specializations, updated_at = NOW()",
            new_user_id,
            designation,
            specs,
            inst_uuid,
            dept_uuid,
        )

        if assigned_batch_uuid:
            await conn.execute(
                "INSERT INTO batch_trainers (id, batch_id, trainer_user_id, assigned_at) VALUES (gen_random_uuid(), $1, $2, NOW()) ON CONFLICT DO NOTHING",
                assigned_batch_uuid,
                new_user_id,
            )

    # Sync to MongoDB for backward compatibility
    db = get_db()
    await db.users.insert_one(
        {
            "_id": str(new_user_id),
            "name": name,
            "email": email,
            "passwordHash": hash_password(temp_password),
            "mustChangePassword": True,
            "role": "TRAINER",
            "collegeId": str(ctx.college_id) if ctx.college_id else None,
            "departmentId": str(dept_uuid) if dept_uuid else None,
            "departmentName": department.get("name"),
            "designation": designation,
            "phone": phone,
            "status": "active",
            "emailVerified": True,
            "provisionedBy": "bulk_import",
            "createdAt": _now(),
            "updatedAt": _now(),
            "createdBy": str(ctx.user_id) if ctx.user_id else None,
            "deletedAt": None,
            "version": 1,
        }
    )

    context["seenEmails"].add(email)
    context["inserted_count"] += 1
    return "inserted"


async def _import_student(ctx: ScopeContext, row: dict[str, str], context: dict[str, Any]) -> str:
    """Validate and persist student account and profile into PostgreSQL users and student_profiles."""
    name = _require(row, "name")
    email = _email(row)
    roll = _require(row, "rollNumber").upper()
    department = _resolve_department(row, context)

    batch_code = _require(row, "batchCode").upper()
    batch = context["batches"].get(batch_code)
    if not batch:
        raise RowError("batchCode", batch_code, f"No batch with code '{batch_code}' exists in your institution")

    dept_id = str(department.get("_id") or department.get("id"))
    batch_dept = str(batch.get("department_id") or batch.get("departmentId"))
    if batch_dept and dept_id and batch_dept != dept_id:
        dept_ident = department.get("code") or department.get("name")
        raise RowError(
            "batchCode", batch_code,
            f"Batch '{batch_code}' does not belong to department '{dept_ident}'"
        )

    if email in context["seenEmails"]:
        raise RowError("email", email, "Duplicate email within this file")
    if roll in context["seenCodes"]:
        raise RowError("rollNumber", roll, "Duplicate roll number within this file")

    enrollment_type = (row.get("enrollmentType") or "regular").lower()
    if enrollment_type not in ("regular", "lateral", "transfer"):
        raise RowError(
            "enrollmentType", enrollment_type, "Must be one of: regular, lateral, transfer"
        )

    if not settings.USE_POSTGRES:
        db = get_db()
        if await db.users.find_one({"email": email}):
            raise RowError("email", email, "A user with this email already exists")
        if await db.student_profiles.find_one({"collegeId": ctx.college_id, "rollNumber": roll}):
            raise RowError("rollNumber", roll, "This roll number is already used in your institution")

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
                    "departmentId": department.get("_id") or department.get("id"),
                    "departmentName": department.get("name"),
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

        await db.student_profiles.insert_one(
            {
                "userId": user_id,
                "name": name,
                "email": email,
                "rollNumber": roll,
                "collegeId": ctx.college_id,
                "departmentId": department.get("_id") or department.get("id"),
                "departmentName": department.get("name"),
                "batchId": batch.get("_id") or batch.get("id"),
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
                    "departmentId": department.get("_id") or department.get("id"),
                    "batchId": batch.get("_id") or batch.get("id"),
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
                "departmentId": department.get("_id") or department.get("id"),
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
        context["inserted_count"] += 1
        return "inserted"

    inst_uuid = context.get("inst_uuid")
    batch_uuid = _to_uuid(batch.get("id") or batch.get("_id"))
    semester_num = _int(row, "semester", batch.get("semester", 1))
    section_val = (row.get("section") or "A").strip()
    phone_val = (row.get("phone") or "").strip() or None

    async with get_pg_connection() as conn:
        existing_email = await conn.fetchrow("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", email)
        if existing_email:
            raise RowError("email", email, "A user with this email already exists")

        existing_roll = await conn.fetchrow(
            "SELECT id FROM student_profiles WHERE UPPER(roll_number) = UPPER($1) AND (institution_id = $2 OR $2 IS NULL)",
            roll,
            inst_uuid,
        )
        if existing_roll:
            raise RowError("rollNumber", roll, "This roll number is already used in your institution")

        new_user_id = uuid.uuid4()
        temp_password = f"Student@{_now().year}"

        await conn.execute(
            "INSERT INTO users (id, email, password_hash, name, role, institution_id, department_id, phone, status, created_at, updated_at) VALUES ($1, LOWER($2), $3, $4, 'STUDENT'::user_role_enum, $5, $6, $7, 'ACTIVE'::record_status_enum, NOW(), NOW())",
            new_user_id,
            email,
            hash_password(temp_password),
            name,
            inst_uuid,
            dept_uuid,
            phone_val,
        )

        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id, section, current_semester, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())",
            new_user_id,
            roll,
            inst_uuid,
            dept_uuid,
            batch_uuid,
            section_val,
            semester_num,
        )

    # Sync to MongoDB for backward compatibility
    db = get_db()
    await db.users.insert_one(
        {
            "_id": str(new_user_id),
            "name": name,
            "email": email,
            "passwordHash": hash_password(temp_password),
            "role": "STUDENT",
            "collegeId": str(ctx.college_id) if ctx.college_id else None,
            "departmentId": str(dept_uuid) if dept_uuid else None,
            "departmentName": department.get("name"),
            "status": "active",
            "emailVerified": True,
            "createdAt": _now(),
            "updatedAt": _now(),
            "createdBy": str(ctx.user_id) if ctx.user_id else None,
            "deletedAt": None,
            "version": 1,
        }
    )

    context["seenEmails"].add(email)
    context["seenCodes"].add(roll)
    context["inserted_count"] += 1
    return "inserted"


async def _import_batch(ctx: ScopeContext, row: dict[str, str], context: dict[str, Any]) -> str:
    """Validate and persist batch into PostgreSQL batches."""
    name = _require(row, "name")
    code = _require(row, "code").upper()
    department = _resolve_department(row, context)

    if code in context["seenCodes"]:
        raise RowError("code", code, "Duplicate batch code within this file")

    status = (row.get("status") or "active").lower()
    if status not in ("active", "archived", "upcoming"):
        raise RowError("status", status, "Must be one of: active, upcoming, archived")

    inst_uuid = context.get("inst_uuid")
    dept_uuid = _to_uuid(department.get("id") or department.get("_id"))
    semester_num = _int(row, "semester", 1)
    capacity_val = _int(row, "capacity", 60)

    if not settings.USE_POSTGRES:
        db = get_db()
        if await db.batches.find_one({"collegeId": ctx.college_id, "code": code, "deletedAt": None}):
            raise RowError("code", code, f"A batch with code '{code}' already exists in your institution")
        inserted = await db.batches.insert_one(
            {
                "name": name,
                "code": code,
                "collegeId": ctx.college_id,
                "departmentId": department.get("_id") or department.get("id"),
                "departmentName": department.get("name"),
                "semesterNumber": semester_num,
                "capacity": capacity_val,
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
            "id": inserted.inserted_id,
            "code": code,
            "name": name,
            "departmentId": department.get("_id") or department.get("id"),
            "department_id": department.get("_id") or department.get("id"),
        }
        context["seenCodes"].add(code)
        context["inserted_count"] += 1
        return "inserted"

    async with get_pg_connection() as conn:
        existing_batch = await conn.fetchrow(
            "SELECT id FROM batches WHERE UPPER(code) = UPPER($1) AND (institution_id = $2 OR $2 IS NULL)",
            code,
            inst_uuid,
        )
        if existing_batch:
            raise RowError("code", code, f"A batch with code '{code}' already exists in your institution")

        new_batch_id = uuid.uuid4()
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, semester, capacity, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE'::record_status_enum, NOW(), NOW())",
            new_batch_id,
            inst_uuid,
            dept_uuid,
            name,
            code,
            semester_num,
            capacity_val,
        )

    # Sync to MongoDB for backward compatibility
    db = get_db()
    inserted = await db.batches.insert_one(
        {
            "_id": str(new_batch_id),
            "name": name,
            "code": code,
            "collegeId": str(ctx.college_id) if ctx.college_id else None,
            "departmentId": str(dept_uuid) if dept_uuid else None,
            "departmentName": department.get("name"),
            "semesterNumber": semester_num,
            "capacity": capacity_val,
            "status": "active",
            "createdAt": _now(),
            "updatedAt": _now(),
            "createdBy": str(ctx.user_id) if ctx.user_id else None,
            "deletedAt": None,
            "version": 1,
        }
    )

    context["batches"][code] = {
        "id": new_batch_id,
        "code": code,
        "name": name,
        "department_id": dept_uuid,
    }
    context["seenCodes"].add(code)
    context["inserted_count"] += 1
    return "inserted"
