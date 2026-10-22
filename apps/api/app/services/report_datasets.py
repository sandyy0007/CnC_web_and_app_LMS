"""Report dataset builders backed by PostgreSQL cnc database.

Each builder runs real scoped queries and returns (columns, rows, title).
Registering them here ensures Super Admin, Admin, HOD, Trainer, and Student
all access their authorized data with strict tenant and role boundaries.
"""
from __future__ import annotations

import uuid
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Any, Sequence

from bson import ObjectId

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import ScopeForbidden, ValidationError, NotFound
from app.db.postgres import get_pg_connection
from app.services.reports import dataset


def _to_uuid(val: Any) -> uuid.UUID | None:
    if not val or str(val).lower() in ("all", "none", "null", ""):
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


def _fmt(val: Any) -> Any:
    if val is None:
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%d %b %Y %H:%M") if isinstance(val, datetime) else val.strftime("%d %b %Y")
    if isinstance(val, (uuid.UUID, ObjectId)):
        return str(val)
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (list, tuple)):
        return ", ".join(str(x) for x in val)
    if isinstance(val, bool):
        return "Yes" if val else "No"
    return val


def _parse_dates(filters: dict[str, Any]) -> tuple[date | None, date | None]:
    start = filters.get("from")
    end = filters.get("to")
    start_d = end_d = None
    if start:
        try:
            start_d = datetime.fromisoformat(str(start)).date()
        except Exception:
            pass
    if end:
        try:
            end_d = datetime.fromisoformat(str(end)).date()
        except Exception:
            pass
    if start_d and end_d and start_d > end_d:
        raise ValidationError("The start date must be on or before the end date")
    return start_d, end_d


async def _resolve_scope(ctx: ScopeContext, filters: dict[str, Any]) -> tuple[uuid.UUID | None, uuid.UUID | None, uuid.UUID | None]:
    """Resolves (institution_id, department_id, batch_id) applying strict server-side RBAC."""
    target_inst: uuid.UUID | None = None
    target_dept: uuid.UUID | None = None
    target_batch: uuid.UUID | None = _to_uuid(filters.get("batchId"))

    if ctx.role == Role.SUPER_ADMIN:
        target_inst = _to_uuid(filters.get("collegeId") or filters.get("institutionId"))
        target_dept = _to_uuid(filters.get("departmentId"))
    elif ctx.role == Role.ADMIN:
        target_inst = _to_uuid(ctx.college_id)
        raw_dept = filters.get("departmentId")
        if raw_dept and str(raw_dept).lower() != "all":
            target_dept = _to_uuid(raw_dept)
            if target_dept and target_inst:
                async with get_pg_connection() as conn:
                    exists = await conn.fetchval(
                        "SELECT id FROM departments WHERE id = $1 AND institution_id = $2",
                        target_dept, target_inst
                    )
                    if not exists:
                        raise ScopeForbidden("Requested department does not belong to your institution")
    elif ctx.role == Role.HOD:
        target_inst = _to_uuid(ctx.college_id)
        target_dept = _to_uuid(ctx.department_id)
        raw_dept = filters.get("departmentId")
        if raw_dept and str(raw_dept).lower() != "all":
            requested = _to_uuid(raw_dept)
            if requested and requested != target_dept:
                raise ScopeForbidden("HOD is strictly isolated to their authorized department")
    elif ctx.role == Role.TRAINER:
        target_inst = _to_uuid(ctx.college_id)
        if target_batch:
            assigned = [_to_uuid(b) for b in ctx.batch_ids if _to_uuid(b)]
            async with get_pg_connection() as conn:
                is_assigned = await conn.fetchval(
                    "SELECT 1 FROM batch_trainers WHERE batch_id = $1 AND trainer_user_id = $2",
                    target_batch, _to_uuid(ctx.user_id)
                )
            if not is_assigned and target_batch not in assigned:
                raise ScopeForbidden("Trainer cannot access or export an unassigned batch")
    elif ctx.role == Role.STUDENT:
        target_inst = _to_uuid(ctx.college_id)
        target_dept = _to_uuid(ctx.department_id)
    else:
        target_inst = _to_uuid(ctx.college_id)

    return target_inst, target_dept, target_batch


# --------------------------------------------------------------------------- Attendance
@dataset("attendance")
async def attendance_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.attendance_report(ctx, filters)
    inst_id, dept_id, batch_id = await _resolve_scope(ctx, filters)
    start_d, end_d = _parse_dates(filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"sp.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"sp.department_id = ${len(params)}")
    if batch_id:
        params.append(batch_id)
        conditions.append(f"sp.batch_id = ${len(params)}")

    if ctx.role == Role.TRAINER:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"(sp.batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = ${len(params)}))")

    if ctx.role == Role.STUDENT:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"sp.user_id = ${len(params)}")

    date_where_cte = ""
    date_join_cond = ""
    has_date_filter = bool(start_d or end_d)
    if start_d:
        params.append(start_d)
        date_where_cte += f" AND session_date >= ${len(params)}"
        date_join_cond += f" AND ts.session_date >= ${len(params)}"
    if end_d:
        params.append(end_d)
        date_where_cte += f" AND session_date <= ${len(params)}"
        date_join_cond += f" AND ts.session_date <= ${len(params)}"

    where_clause = " AND ".join(conditions)
    having_clause = "HAVING COALESCE(bs.total_sessions, 0) > 0" if has_date_filter else ""

    sql = f"""
        WITH batch_sess AS (
            SELECT batch_id, COUNT(id) as total_sessions
            FROM training_sessions
            WHERE 1=1 {date_where_cte}
            GROUP BY batch_id
        )
        SELECT 
            sp.roll_number,
            u.name as student_name,
            u.email as student_email,
            d.name as department_name,
            COALESCE(b.name, 'Unassigned') as batch_name,
            COALESCE(bs.total_sessions, 0) as sessions_total,
            COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END) as sessions_present,
            COUNT(CASE WHEN ar.status = 'ABSENT' THEN 1 END) as sessions_absent,
            COUNT(CASE WHEN ar.status = 'LATE' THEN 1 END) as sessions_late,
            CASE 
                WHEN COALESCE(bs.total_sessions, 0) > 0 THEN 
                    ROUND((COUNT(CASE WHEN ar.status IN ('PRESENT', 'LATE') THEN 1 END)::numeric / bs.total_sessions::numeric) * 100, 1)
                ELSE 0.0
            END as attendance_pct
        FROM student_profiles sp
        JOIN users u ON u.id = sp.user_id
        JOIN departments d ON d.id = sp.department_id
        LEFT JOIN batches b ON b.id = sp.batch_id
        LEFT JOIN batch_sess bs ON bs.batch_id = b.id
        LEFT JOIN attendance_records ar ON ar.participant_user_id = u.id
        LEFT JOIN training_sessions ts ON ts.id = ar.session_id {date_join_cond}
        WHERE {where_clause}
        GROUP BY sp.id, sp.roll_number, u.name, u.email, d.name, b.name, bs.total_sessions
        {having_clause}
        ORDER BY d.name, b.name, sp.roll_number;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    threshold = float(filters.get("threshold") or settings.ATTENDANCE_DEFAULTER_THRESHOLD)
    rows = []
    for r in records:
        pct = float(r["attendance_pct"] or 0)
        tot = r["sessions_total"]
        flag = "Defaulter" if tot > 0 and pct < threshold else "Good"
        rows.append([
            r["roll_number"],
            r["student_name"],
            r["student_email"],
            r["department_name"],
            r["batch_name"],
            tot,
            r["sessions_present"],
            r["sessions_absent"],
            r["sessions_late"],
            f"{pct}%",
            flag,
        ])

    columns = [
        "Roll No.", "Participant", "Email", "Department", "Batch",
        "Sessions Total", "Present", "Absent", "Late", "Attendance %", "Status"
    ]
    return columns, rows, "Session Attendance"


# --------------------------------------------------------------------------- Defaulters
@dataset("defaulters")
async def defaulters_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.defaulters_report(ctx, filters)
    threshold = float(filters.get("threshold") or settings.ATTENDANCE_DEFAULTER_THRESHOLD)
    cols, all_rows, _ = await attendance_report(ctx, filters)
    defaulters = [
        [r[0], r[1], r[2], r[3], r[4], r[9], r[6] + r[8], r[5], f"{threshold}%", "Below Threshold"]
        for r in all_rows
        if r[5] > 0 and float(str(r[9]).replace("%", "")) < threshold
    ]
    columns = [
        "Roll No.", "Participant", "Email", "Department", "Batch",
        "Attendance %", "Attended (Present+Late)", "Total Sessions", "Threshold %", "Flag"
    ]
    return columns, defaulters, "Attendance Defaulters"


# --------------------------------------------------------------------------- Assessment / EEDI
@dataset("assessment")
async def assessment_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.assessment_report(ctx, filters)
    inst_id, dept_id, batch_id = await _resolve_scope(ctx, filters)
    start_d, end_d = _parse_dates(filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"ee.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"ee.department_id = ${len(params)}")
    if batch_id:
        params.append(batch_id)
        conditions.append(f"sp.batch_id = ${len(params)}")

    if ctx.role == Role.TRAINER:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"(ee.trainer_user_id = ${len(params)} OR sp.batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = ${len(params)}))")

    if ctx.role == Role.STUDENT:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"ee.participant_user_id = ${len(params)}")

    if start_d:
        params.append(start_d)
        conditions.append(f"ee.submitted_at::date >= ${len(params)}")
    if end_d:
        params.append(end_d)
        conditions.append(f"ee.submitted_at::date <= ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            sp.roll_number,
            u.name as student_name,
            u.email as student_email,
            d.name as department_name,
            COALESCE(b.name, 'Unassigned') as batch_name,
            ee.semester,
            ee.eedi_score,
            ee.employment_score,
            COALESCE(tu.name, 'System') as trainer_name,
            ee.status,
            ee.submitted_at
        FROM eedi_evaluations ee
        JOIN users u ON u.id = ee.participant_user_id
        JOIN student_profiles sp ON sp.user_id = u.id
        JOIN departments d ON d.id = ee.department_id
        LEFT JOIN batches b ON b.id = sp.batch_id
        LEFT JOIN users tu ON tu.id = ee.trainer_user_id
        WHERE {where_clause}
        ORDER BY d.name, b.name, sp.roll_number;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = []
    for r in records:
        score = float(r["eedi_score"] or 0)
        if score >= 80:
            band = "Advanced"
        elif score >= 60:
            band = "Proficient"
        elif score >= 40:
            band = "Developing"
        else:
            band = "Novice"

        rows.append([
            r["roll_number"],
            r["student_name"],
            r["student_email"],
            r["department_name"],
            r["batch_name"],
            r["semester"],
            score,
            float(r["employment_score"] or 0),
            band,
            r["trainer_name"],
            str(r["status"]),
            _fmt(r["submitted_at"]),
        ])

    columns = [
        "Roll No.", "Participant", "Email", "Department", "Batch",
        "Semester", "EEDI Score", "Employment Score", "Proficiency Band",
        "Evaluator", "Status", "Evaluated At"
    ]
    return columns, rows, "Skill Assessment"


# --------------------------------------------------------------------------- Enrollment
@dataset("enrollment")
async def enrollment_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.enrollment_report(ctx, filters)
    inst_id, dept_id, batch_id = await _resolve_scope(ctx, filters)
    start_d, end_d = _parse_dates(filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"e.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"e.department_id = ${len(params)}")
    if batch_id:
        params.append(batch_id)
        conditions.append(f"e.batch_id = ${len(params)}")

    if ctx.role == Role.TRAINER:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"(e.batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = ${len(params)}))")

    if ctx.role == Role.STUDENT:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"e.participant_user_id = ${len(params)}")

    if start_d:
        params.append(start_d)
        conditions.append(f"e.created_at::date >= ${len(params)}")
    if end_d:
        params.append(end_d)
        conditions.append(f"e.created_at::date <= ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            sp.roll_number,
            u.name as student_name,
            u.email as student_email,
            d.name as department_name,
            COALESCE(b.name, 'Unassigned') as batch_name,
            c.code as course_code,
            c.title as course_title,
            e.current_semester,
            e.enrollment_status,
            e.payment_status,
            e.access_status,
            e.created_at
        FROM enrollments e
        JOIN users u ON u.id = e.participant_user_id
        JOIN student_profiles sp ON sp.user_id = u.id
        JOIN departments d ON d.id = e.department_id
        LEFT JOIN batches b ON b.id = e.batch_id
        JOIN courses c ON c.id = e.course_id
        WHERE {where_clause}
        ORDER BY d.name, b.name, sp.roll_number;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = [
        [
            r["roll_number"],
            r["student_name"],
            r["student_email"],
            r["department_name"],
            r["batch_name"],
            r["course_code"],
            r["course_title"],
            r["current_semester"],
            str(r["enrollment_status"]),
            str(r["payment_status"]),
            str(r["access_status"]),
            _fmt(r["created_at"]),
        ]
        for r in records
    ]

    columns = [
        "Roll No.", "Participant", "Email", "Department", "Batch",
        "Course Code", "Course Title", "Semester", "Enrollment Status",
        "Payment Status", "Access Status", "Enrolled At"
    ]
    return columns, rows, "Enrollment Records"


# --------------------------------------------------------------------------- Payments
@dataset("payments")
async def payments_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        return (["Roll No.", "Participant", "Amount", "Status", "Date"], [], "Student Fee & Platform Payments")
    inst_id, dept_id, batch_id = await _resolve_scope(ctx, filters)
    start_d, end_d = _parse_dates(filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"sp.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"sp.department_id = ${len(params)}")
    if batch_id:
        params.append(batch_id)
        conditions.append(f"sp.batch_id = ${len(params)}")

    if ctx.role == Role.STUDENT:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"p.participant_user_id = ${len(params)}")

    if start_d:
        params.append(start_d)
        conditions.append(f"p.created_at::date >= ${len(params)}")
    if end_d:
        params.append(end_d)
        conditions.append(f"p.created_at::date <= ${len(params)}")

    status_filter = filters.get("status")
    if status_filter and status_filter != "all":
        params.append(status_filter.upper())
        conditions.append(f"p.status::text = ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            p.transaction_ref,
            u.name as student_name,
            COALESCE(sp.roll_number, '—') as roll_number,
            u.email as student_email,
            COALESCE(d.name, '—') as department_name,
            COALESCE(c.code, '—') as course_code,
            COALESCE(c.title, 'Course Fee') as course_title,
            p.amount,
            p.currency,
            p.payment_method,
            p.status,
            COALESCE(tu.name, 'Admin') as verified_by_name,
            p.created_at
        FROM payments p
        JOIN users u ON u.id = p.participant_user_id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN departments d ON d.id = sp.department_id
        LEFT JOIN courses c ON c.id = p.course_id
        LEFT JOIN users tu ON tu.id = p.verified_by
        WHERE {where_clause}
        ORDER BY p.created_at DESC;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = [
        [
            r["transaction_ref"],
            r["student_name"],
            r["roll_number"],
            r["student_email"],
            r["department_name"],
            r["course_code"],
            r["course_title"],
            float(r["amount"]),
            r["currency"],
            r["payment_method"],
            str(r["status"]),
            r["verified_by_name"],
            _fmt(r["created_at"]),
        ]
        for r in records
    ]

    columns = [
        "Txn ID / Ref", "Student Name", "Roll No.", "Email", "Department",
        "Course Code", "Course Title", "Amount", "Currency", "Payment Method",
        "Status", "Verified By", "Date"
    ]
    return columns, rows, "Payments & Revenue Ledger"


# --------------------------------------------------------------------------- Trainer Workload
@dataset("trainer")
async def trainer_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.trainer_report(ctx, filters)
    inst_id, dept_id, _ = await _resolve_scope(ctx, filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"tp.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"tp.department_id = ${len(params)}")

    if ctx.role == Role.TRAINER:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"tp.user_id = ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            u.name as trainer_name,
            u.email as trainer_email,
            COALESCE(d.name, '—') as department_name,
            COALESCE(tp.title, 'Trainer') as title,
            tp.specializations,
            tp.rating,
            u.status as account_status,
            COUNT(DISTINCT bt.batch_id) as batches_assigned,
            COUNT(DISTINCT ts.id) as sessions_conducted
        FROM trainer_profiles tp
        JOIN users u ON u.id = tp.user_id
        LEFT JOIN departments d ON d.id = tp.department_id
        LEFT JOIN batch_trainers bt ON bt.trainer_user_id = u.id
        LEFT JOIN training_sessions ts ON ts.trainer_user_id = u.id
        WHERE {where_clause}
        GROUP BY tp.id, u.name, u.email, d.name, tp.title, tp.specializations, tp.rating, u.status
        ORDER BY u.name;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = [
        [
            r["trainer_name"],
            r["trainer_email"],
            r["department_name"],
            r["title"],
            _fmt(r["specializations"]),
            r["batches_assigned"],
            r["sessions_conducted"],
            float(r["rating"]) if r["rating"] else "—",
            str(r["account_status"]).title(),
        ]
        for r in records
    ]

    columns = [
        "Trainer Name", "Email", "Department", "Title", "Specializations",
        "Batches Assigned", "Sessions Conducted", "Rating", "Status"
    ]
    return columns, rows, "Trainer Roster & Workload"


# --------------------------------------------------------------------------- Users
@dataset("users")
async def users_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.users_report(ctx, filters)
    inst_id, dept_id, _ = await _resolve_scope(ctx, filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"u.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"u.department_id = ${len(params)}")

    role_filter = filters.get("role")
    if role_filter and role_filter != "all":
        params.append(role_filter.upper())
        conditions.append(f"u.role::text = ${len(params)}")

    status_filter = filters.get("status")
    if status_filter and status_filter != "all":
        params.append(status_filter.upper())
        conditions.append(f"u.status::text = ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            u.name,
            u.email,
            u.role,
            COALESCE(d.name, '—') as department_name,
            COALESCE(inst.name, '—') as institution_name,
            u.status,
            COALESCE(u.phone, '—') as phone,
            u.last_login_at,
            u.created_at
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN institutions inst ON inst.id = u.institution_id
        WHERE {where_clause}
        ORDER BY u.role, u.name;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = [
        [
            r["name"],
            r["email"],
            str(r["role"]),
            r["department_name"],
            r["institution_name"],
            str(r["status"]).title(),
            r["phone"],
            _fmt(r["last_login_at"]),
            _fmt(r["created_at"]),
        ]
        for r in records
    ]

    columns = [
        "Name", "Email", "Role", "Department", "Institution",
        "Status", "Phone", "Last Login", "Created At"
    ]
    return columns, rows, "Users & Roles"


# --------------------------------------------------------------------------- Learning
@dataset("learning")
async def learning_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.learning_report(ctx, filters)
    inst_id, dept_id, batch_id = await _resolve_scope(ctx, filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"sp.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"sp.department_id = ${len(params)}")
    if batch_id:
        params.append(batch_id)
        conditions.append(f"sp.batch_id = ${len(params)}")

    if ctx.role == Role.TRAINER:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"(sp.batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = ${len(params)}))")

    if ctx.role == Role.STUDENT:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"sp.user_id = ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            sp.roll_number,
            u.name as student_name,
            d.name as department_name,
            COALESCE(b.name, 'Unassigned') as batch_name,
            COALESCE(sp.academic_year, '—') as academic_year,
            COUNT(DISTINCT e.course_id) as enrolled_courses,
            COUNT(DISTINCT CASE WHEN e.access_status = 'ACTIVE' THEN e.course_id END) as active_courses,
            ee.eedi_score,
            ee.employment_score
        FROM student_profiles sp
        JOIN users u ON u.id = sp.user_id
        JOIN departments d ON d.id = sp.department_id
        LEFT JOIN batches b ON b.id = sp.batch_id
        LEFT JOIN enrollments e ON e.participant_user_id = u.id
        LEFT JOIN eedi_evaluations ee ON ee.participant_user_id = u.id
        WHERE {where_clause}
        GROUP BY sp.id, sp.roll_number, u.name, d.name, b.name, sp.academic_year, ee.eedi_score, ee.employment_score
        ORDER BY d.name, b.name, sp.roll_number;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = [
        [
            r["roll_number"],
            r["student_name"],
            r["department_name"],
            r["batch_name"],
            r["academic_year"],
            r["enrolled_courses"],
            r["active_courses"],
            float(r["eedi_score"]) if r["eedi_score"] else "—",
            float(r["employment_score"]) if r["employment_score"] else "—",
        ]
        for r in records
    ]

    columns = [
        "Roll No.", "Participant", "Department", "Batch", "Academic Year",
        "Courses Enrolled", "Active Courses", "EEDI Score", "Employment Score"
    ]
    return columns, rows, "Learning Hours & Completion"


# --------------------------------------------------------------------------- Practice / Games
@dataset("practice")
async def practice_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.practice_report(ctx, filters)
    inst_id, dept_id, batch_id = await _resolve_scope(ctx, filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"sp.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"sp.department_id = ${len(params)}")
    if batch_id:
        params.append(batch_id)
        conditions.append(f"sp.batch_id = ${len(params)}")

    if ctx.role == Role.TRAINER:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"(sp.batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = ${len(params)}))")

    if ctx.role == Role.STUDENT:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"ga.participant_user_id = ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            u.name as student_name,
            COALESCE(sp.roll_number, '—') as roll_number,
            COALESCE(d.name, '—') as department_name,
            g.title as game_title,
            g.category as game_category,
            ga.raw_score,
            ga.final_eedi,
            ga.status,
            ga.completed_at
        FROM game_attempts ga
        JOIN users u ON u.id = ga.participant_user_id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN departments d ON d.id = sp.department_id
        JOIN games g ON g.id = ga.game_id
        WHERE {where_clause}
        ORDER BY ga.completed_at DESC NULLS LAST;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = [
        [
            r["student_name"],
            r["roll_number"],
            r["department_name"],
            r["game_title"],
            str(r["game_category"]).title(),
            r["raw_score"],
            float(r["final_eedi"]) if r["final_eedi"] else "—",
            str(r["status"]).title(),
            _fmt(r["completed_at"]),
        ]
        for r in records
    ]

    columns = [
        "Participant", "Roll No.", "Department", "Game Title",
        "Category", "Score", "EEDI Score", "Status", "Completed At"
    ]
    return columns, rows, "Practice & AI Activity"


# --------------------------------------------------------------------------- Risk & Prediction
@dataset("prediction")
async def prediction_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.prediction_report(ctx, filters)
    inst_id, dept_id, batch_id = await _resolve_scope(ctx, filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"sp.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"sp.department_id = ${len(params)}")
    if batch_id:
        params.append(batch_id)
        conditions.append(f"sp.batch_id = ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            sp.roll_number,
            u.name as student_name,
            u.email as student_email,
            d.name as department_name,
            COALESCE(b.name, 'Unassigned') as batch_name,
            COUNT(ar.id) as sessions_total,
            CASE 
                WHEN COUNT(ar.id) > 0 THEN 
                    ROUND((COUNT(CASE WHEN ar.status IN ('PRESENT', 'LATE') THEN 1 END)::numeric / COUNT(ar.id)::numeric) * 100, 1)
                ELSE 0.0
            END as attendance_pct,
            ee.eedi_score
        FROM student_profiles sp
        JOIN users u ON u.id = sp.user_id
        JOIN departments d ON d.id = sp.department_id
        LEFT JOIN batches b ON b.id = sp.batch_id
        LEFT JOIN attendance_records ar ON ar.participant_user_id = u.id
        LEFT JOIN eedi_evaluations ee ON ee.participant_user_id = u.id
        WHERE {where_clause}
        GROUP BY sp.id, sp.roll_number, u.name, u.email, d.name, b.name, ee.eedi_score
        HAVING (COUNT(ar.id) > 0 AND (COUNT(CASE WHEN ar.status IN ('PRESENT', 'LATE') THEN 1 END)::numeric / COUNT(ar.id)::numeric) * 100 < 75)
            OR (ee.eedi_score IS NOT NULL AND ee.eedi_score < 40)
        ORDER BY attendance_pct ASC, sp.roll_number;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = []
    for r in records:
        att = float(r["attendance_pct"] or 0)
        score = float(r["eedi_score"]) if r["eedi_score"] else None
        reasons = []
        if r["sessions_total"] > 0 and att < 75.0:
            reasons.append(f"Attendance {att}% (<75%)")
        if score is not None and score < 40.0:
            reasons.append(f"EEDI Score {score} (<40)")
        level = "High" if len(reasons) > 1 else "Medium"
        rows.append([
            r["roll_number"],
            r["student_name"],
            r["student_email"],
            r["department_name"],
            r["batch_name"],
            r["sessions_total"],
            f"{att}%",
            score if score is not None else "—",
            level,
            "; ".join(reasons) if reasons else "Watchlist",
        ])

    columns = [
        "Roll No.", "Participant", "Email", "Department", "Batch",
        "Sessions Total", "Attendance %", "EEDI Score", "Risk Level", "Risk Factors"
    ]
    return columns, rows, "Risk & Prediction"


# --------------------------------------------------------------------------- Student Progress
@dataset("student_progress")
async def student_progress_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.student_progress_report(ctx, filters)
    u_uuid = _to_uuid(ctx.user_id)
    async with get_pg_connection() as conn:
        profile = await conn.fetchrow("""
            SELECT sp.roll_number, u.name, u.email, d.name as dept, COALESCE(b.name, 'Unassigned') as batch, sp.academic_year
            FROM student_profiles sp
            JOIN users u ON u.id = sp.user_id
            JOIN departments d ON d.id = sp.department_id
            LEFT JOIN batches b ON b.id = sp.batch_id
            WHERE sp.user_id = $1;
        """, u_uuid)

        att = await conn.fetchrow("""
            SELECT 
                COUNT(id) as total,
                COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as present,
                COUNT(CASE WHEN status = 'LATE' THEN 1 END) as late,
                COUNT(CASE WHEN status = 'ABSENT' THEN 1 END) as absent
            FROM attendance_records
            WHERE participant_user_id = $1;
        """, u_uuid)

        eval_rec = await conn.fetchrow("""
            SELECT eedi_score, employment_score, semester, status, submitted_at
            FROM eedi_evaluations
            WHERE participant_user_id = $1
            ORDER BY submitted_at DESC NULLS LAST LIMIT 1;
        """, u_uuid)

        courses = await conn.fetch("""
            SELECT c.code, c.title, e.access_status, e.created_at
            FROM enrollments e
            JOIN courses c ON c.id = e.course_id
            WHERE e.participant_user_id = $1
            ORDER BY e.created_at DESC;
        """, u_uuid)

        games = await conn.fetch("""
            SELECT g.title, ga.raw_score, ga.final_eedi, ga.completed_at
            FROM game_attempts ga
            JOIN games g ON g.id = ga.game_id
            WHERE ga.participant_user_id = $1
            ORDER BY ga.completed_at DESC NULLS LAST LIMIT 10;
        """, u_uuid)

    tot_sess = att["total"] if att else 0
    pres = (att["present"] + att["late"]) if att else 0
    att_pct = round((pres / tot_sess) * 100, 1) if tot_sess > 0 else 0.0

    rows = [
        ["Profile", "Student Name", profile["name"] if profile else "—"],
        ["Profile", "Roll Number", profile["roll_number"] if profile else "—"],
        ["Profile", "Department", profile["dept"] if profile else "—"],
        ["Profile", "Batch", profile["batch"] if profile else "—"],
        ["Profile", "Academic Year", profile["academic_year"] if profile else "—"],
        ["Attendance", "Sessions Attended", f"{pres} / {tot_sess} ({att_pct}%)"],
        ["Evaluation", "EEDI Readiness Score", float(eval_rec["eedi_score"]) if eval_rec and eval_rec["eedi_score"] else "—"],
        ["Evaluation", "Employment Score", float(eval_rec["employment_score"]) if eval_rec and eval_rec["employment_score"] else "—"],
        ["Enrollments", "Total Enrolled Courses", len(courses)],
    ]
    for c in courses:
        rows.append(["Enrolled Course", f"{c['code']} - {c['title']}", f"Status: {c['access_status']}"])
    for g in games:
        rows.append(["Game Activity", g["title"], f"Score: {g['raw_score']} (EEDI: {float(g['final_eedi']) if g['final_eedi'] else '—'})"])

    columns = ["Category", "Metric / Activity", "Value / Details"]
    return columns, rows, "My Progress Report"


# --------------------------------------------------------------------------- Feedback / Sessions
@dataset("feedback")
async def feedback_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.feedback_report(ctx, filters)
    inst_id, dept_id, batch_id = await _resolve_scope(ctx, filters)
    start_d, end_d = _parse_dates(filters)

    conditions = ["1=1"]
    params: list[Any] = []

    if inst_id:
        params.append(inst_id)
        conditions.append(f"ts.institution_id = ${len(params)}")
    if dept_id:
        params.append(dept_id)
        conditions.append(f"ts.department_id = ${len(params)}")
    if batch_id:
        params.append(batch_id)
        conditions.append(f"ts.batch_id = ${len(params)}")

    if ctx.role == Role.TRAINER:
        u_uuid = _to_uuid(ctx.user_id)
        params.append(u_uuid)
        conditions.append(f"ts.trainer_user_id = ${len(params)}")

    if start_d:
        params.append(start_d)
        conditions.append(f"ts.session_date >= ${len(params)}")
    if end_d:
        params.append(end_d)
        conditions.append(f"ts.session_date <= ${len(params)}")

    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT 
            ts.topic as session_topic,
            ts.session_date,
            COALESCE(b.name, '—') as batch_name,
            COALESCE(d.name, '—') as department_name,
            tu.name as trainer_name,
            COALESCE(ts.room, '—') as room,
            ts.status,
            ts.starts_at,
            ts.ends_at
        FROM training_sessions ts
        JOIN users tu ON tu.id = ts.trainer_user_id
        JOIN departments d ON d.id = ts.department_id
        LEFT JOIN batches b ON b.id = ts.batch_id
        WHERE {where_clause}
        ORDER BY ts.session_date DESC;
    """

    async with get_pg_connection() as conn:
        records = await conn.fetch(sql, *params)

    rows = [
        [
            r["session_topic"],
            _fmt(r["session_date"]),
            r["batch_name"],
            r["department_name"],
            r["trainer_name"],
            r["room"],
            str(r["status"]),
            _fmt(r["starts_at"]),
            _fmt(r["ends_at"]),
        ]
        for r in records
    ]

    columns = [
        "Session Topic", "Date", "Batch", "Department",
        "Trainer", "Room", "Status", "Start Time", "End Time"
    ]
    return columns, rows, "Trainer Sessions & Feedback"


# --------------------------------------------------------------------------- Certification
@dataset("certification")
async def certification_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.certification_report(ctx, filters)
    cols, all_rows, _ = await attendance_report(ctx, filters)
    rows = []
    for r in all_rows:
        pct = float(str(r[9]).replace("%", "")) if r[9] else 0.0
        eligible = "Eligible" if pct >= 75.0 and r[5] > 0 else "Not Eligible"
        rows.append([
            r[0], r[1], r[2], r[3], r[4], f"{pct}%", eligible,
            "Criteria met" if eligible == "Eligible" else "Attendance below 75%"
        ])
    columns = ["Roll No.", "Participant", "Email", "Department", "Batch", "Attendance %", "Certification Status", "Details"]
    return columns, rows, "Certification Status"


# --------------------------------------------------------------------------- Placement
@dataset("placement")
async def placement_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.placement_report(ctx, filters)
    return await learning_report(ctx, filters)


# --------------------------------------------------------------------------- Audit
@dataset("audit")
async def audit_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.audit_report(ctx, filters)
    inst_id, dept_id, _ = await _resolve_scope(ctx, filters)
    sql = "SELECT id, action, entity_type, entity_id, detail, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 500;"
    try:
        async with get_pg_connection() as conn:
            records = await conn.fetch(sql)
    except Exception:
        records = []

    rows = [
        [
            _fmt(r["created_at"]),
            r["action"],
            r["entity_type"],
            str(r["entity_id"]),
            r["detail"] or "—"
        ]
        for r in records
    ]
    columns = ["Timestamp", "Action", "Entity", "Record ID", "Detail"]
    return columns, rows, "Audit Trail"


# --------------------------------------------------------------------------- System
@dataset("system")
async def system_report(ctx: ScopeContext, filters: dict[str, Any]):
    if not settings.USE_POSTGRES:
        from app.services import mongo_report_datasets
        return await mongo_report_datasets.system_report(ctx, filters)
    async with get_pg_connection() as conn:
        inst_count = await conn.fetchval("SELECT count(*) FROM institutions")
        dept_count = await conn.fetchval("SELECT count(*) FROM departments")
        user_count = await conn.fetchval("SELECT count(*) FROM users")
        stud_count = await conn.fetchval("SELECT count(*) FROM student_profiles")
        batch_count = await conn.fetchval("SELECT count(*) FROM batches")
        sess_count = await conn.fetchval("SELECT count(*) FROM training_sessions")
        att_count = await conn.fetchval("SELECT count(*) FROM attendance_records")
        eval_count = await conn.fetchval("SELECT count(*) FROM eedi_evaluations")
        pay_count = await conn.fetchval("SELECT count(*) FROM payments")
        pay_rev = await conn.fetchval("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'VERIFIED'")

    rows = [
        ["Institutions", inst_count, "Active platform institutions"],
        ["Departments", dept_count, "Active academic departments"],
        ["Total Users", user_count, "Registered accounts"],
        ["Students", stud_count, "Enrolled students across institutions"],
        ["Batches", batch_count, "Configured student cohorts"],
        ["Training Sessions", sess_count, "Scheduled/completed training sessions"],
        ["Attendance Marks", att_count, "Total recorded attendance entries"],
        ["EEDI Evaluations", eval_count, "Completed skill assessments"],
        ["Verified Payments", pay_count, f"Total INR {float(pay_rev):,.2f}"],
    ]
    columns = ["System Metric", "Count / Value", "Description"]
    return columns, rows, "AI & System Usage"
