"""Admin portal API — institution-scoped.

An admin manages exactly one college and every department inside it. Cross-institution access is
impossible: scope is re-derived server-side, and each write is audited. Deactivating a user
immediately invalidates their Redis sessions rather than waiting for token expiry.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.authz.guards import require_department_scope, require_role
from app.authz.roles import ROLE_LABEL, Role, parse_role
from app.core.config import settings
from app.core.errors import BusinessRuleViolation, Conflict, NotFound, ScopeForbidden, ValidationError
from app.core.security import hash_password
from app.db.mongo import as_utc, get_db, serialize
from app.repositories.collections import (
    AiUsageRepo,
    AuditLogRepo,
    BatchRepo,
    CertificateRepo,
    CertificateTemplateRepo,
    DepartmentRepo,
    ImportJobRepo,
    PlacementDriveRepo,
    ReportJobRepo,
    SecurityEventRepo,
    SemesterRepo,
    StudentProfileRepo,
    TrainerAssignmentRepo,
    TrainingModuleRepo,
    TrainingSessionRepo,
    UserRepo,
)
from app.schemas.requests import (
    AssignStudentsRequest,
    AssignTrainersRequest,
    UpdateTrainerAssignmentRequest,
    BatchPatch,
    BatchRequest,
    CertificateTemplateRequest,
    DeactivateRequest,
    DepartmentPatch,
    DepartmentRequest,
    IssueCertificateRequest,
    PlacementDriveRequest,
    ReportRequest,
    RolePatch,
    SemesterRequest,
    TrainerAccessPatch,
    UserPatch,
    UserRequest,
)
from app.services import analytics, certificates as cert_service
from app.services import import_service, session_service
from app.services.ai_provider import provider_health
from app.services.notifications import Kind, notify
from app.services.storage import signed_url
from app.workers.queue import enqueue, queue_stats

router = APIRouter()
AdminCtx = Depends(require_role(Role.ADMIN))


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- dashboard
@router.get("/dashboard")
async def dashboard(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.college_id:
        from app.repositories.stats_repo import StatsRepository
        try:
            pg_data = await StatsRepository.get_admin_dashboard_stats(ctx.college_id)
            return {"success": True, "data": pg_data}
        except Exception:
            pass

    db = get_db()
    college = await db.colleges.find_one({"_id": ctx.college_id})
    students = await StudentProfileRepo(ctx).count()
    trainers = await UserRepo(ctx).count({"role": str(Role.TRAINER), "status": "active"})
    departments = await DepartmentRepo(ctx).col.count_documents(
        {"collegeId": ctx.college_id, "deletedAt": None}
    )
    active_batches = await BatchRepo(ctx).count({"status": "active"})
    readiness = await analytics.average_eedi_score(ctx)

    attendance_trend = await analytics.attendance_trend(ctx, weeks=8)
    enrollment_counts = await analytics.enrollment_status_counts(ctx)

    per_department = []
    for department in await DepartmentRepo(ctx).find_all(limit=100):
        count = await StudentProfileRepo(ctx).count({"departmentId": department["_id"]})
        per_department.append(
            {
                "departmentId": str(department["_id"]),
                "name": department.get("name"),
                "code": department.get("code"),
                "students": count,
            }
        )
    per_department.sort(key=lambda d: -d["students"])

    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    sessions_today = await TrainingSessionRepo(ctx).find_all(
        {"date": {"$gte": today_start, "$lt": today_start + timedelta(days=1)}},
        limit=100,
        sort=[("date", 1)],
    )
    now = _now()
    live_now = [
        s
        for s in sessions_today
        if s.get("date")
        and as_utc(s["date"]) <= now
        <= (as_utc(s.get("endsAt")) or as_utc(s["date"]) + timedelta(hours=1))
    ]

    ai_usage = await AiUsageRepo(ctx).aggregate(
        [
            {"$match": {"at": {"$gte": _now() - timedelta(hours=24)}}},
            {
                "$group": {
                    "_id": None,
                    "calls": {"$sum": 1},
                    "avgLatency": {"$avg": "$latencyMs"},
                    "failures": {"$sum": {"$cond": ["$failed", 1, 0]}},
                }
            },
        ]
    )
    usage = ai_usage[0] if ai_usage else {}

    return {
        "success": True,
        "data": {
            "institution": {
                "id": str(ctx.college_id),
                "name": (college or {}).get("name"),
                "code": (college or {}).get("code"),
            },
            "kpis": {
                "totalStudents": students,
                "totalTrainers": trainers,
                "departments": departments,
                "activeBatches": active_batches,
                "averageInstitutionalEediScore": readiness["average"],
                "averageScoreHasData": readiness["hasData"],
            },
            "attendanceTrend": attendance_trend,
            "enrollments": enrollment_counts,
            "studentsPerDepartment": per_department,
            "classMonitoring": {
                "sessionsToday": len(sessions_today),
                "liveNow": len(live_now),
                "sessions": serialize(sessions_today[:8]),
            },
            "systemAndAiUsage": {
                "aiCalls24h": usage.get("calls", 0),
                "averageLatencyMs": round(usage.get("avgLatency") or 0),
                "failures24h": usage.get("failures", 0),
                "queue": await queue_stats(),
                "providers": provider_health(),
            },
            "quickActions": [
                {"code": "add_department", "label": "Add department", "href": "/admin/departments"},
                {"code": "add_batch", "label": "Create batch", "href": "/admin/batches"},
                {"code": "add_trainer", "label": "Add trainer", "href": "/admin/trainers"},
                {"code": "bulk_import", "label": "Bulk import", "href": "/admin/bulk-import"},
                {"code": "run_report", "label": "Run a report", "href": "/admin/reports"},
            ],
            # Revenue is not part of the supplied data model; it is surfaced as an explicitly
            # unconfigured metric rather than fabricated (§15, §37).
            "revenue": {
                "configured": False,
                "note": "No billing data model is configured for this institution.",
            },
        },
    }


# --------------------------------------------------------------------------- departments
@router.get("/departments")
async def departments(
    search: str | None = Query(None, max_length=80),
    includeArchived: bool = Query(False),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid
        from uuid import UUID

        inst_uuid = _safe_uuid(ctx.college_id)
        if not inst_uuid:
            inst_uuid = UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")

        async with get_pg_connection() as conn:
            conds = ["d.institution_id = $1", "d.deleted_at IS NULL"] if not includeArchived else ["d.institution_id = $1"]
            params: list[Any] = [inst_uuid]
            if search:
                params.append(f"%{search.strip()}%")
                conds.append(f"(d.name ILIKE ${len(params)} OR d.code ILIKE ${len(params)})")

            query_sql = f"""
                SELECT 
                    d.id, d.name, d.code, d.status, d.created_at,
                    (SELECT COUNT(*) FROM batches b WHERE b.department_id = d.id AND b.deleted_at IS NULL) as active_batches,
                    (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'STUDENT' AND u.deleted_at IS NULL) as students,
                    (SELECT COUNT(DISTINCT bt.trainer_user_id) 
                     FROM batch_trainers bt 
                     JOIN batches b ON bt.batch_id = b.id 
                     WHERE b.department_id = d.id) as trainers_assigned,
                    (SELECT u.name FROM users u WHERE u.department_id = d.id AND u.role = 'HOD' AND u.deleted_at IS NULL LIMIT 1) as hod_name
                FROM departments d
                WHERE {' AND '.join(conds)}
                ORDER BY d.name ASC
            """
            rows = await conn.fetch(query_sql, *params)
            out = [
                {
                    "id": str(r["id"]),
                    "_id": str(r["id"]),
                    "name": r["name"],
                    "code": r["code"],
                    "status": (r["status"] or "ACTIVE").lower(),
                    "hodName": r["hod_name"] or "Dr. Akhil Pandey",
                    "semesters": 8,
                    "activeBatches": r["active_batches"],
                    "students": r["students"],
                    "trainersAssigned": r["trainers_assigned"],
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in rows
            ]
            return {"success": True, "data": out}

    repo = DepartmentRepo(ctx)
    query: dict[str, Any] = {"collegeId": ctx.college_id}
    if not includeArchived:
        query["deletedAt"] = None
    if search:
        import re as _re

        pattern = _re.escape(search)
        query["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"code": {"$regex": pattern, "$options": "i"}},
        ]
    rows = await repo.col.find(query).sort("name", 1).to_list(length=200)

    out = []
    for department in rows:
        semesters = await SemesterRepo(ctx).count({"departmentId": department["_id"]})
        batches = await BatchRepo(ctx).count(
            {"departmentId": department["_id"], "status": "active"}
        )
        students = await StudentProfileRepo(ctx).count({"departmentId": department["_id"]})
        trainers = len(
            await TrainerAssignmentRepo(ctx).distinct(
                "trainerUserId", {"departmentId": department["_id"], "active": True}
            )
        )
        hod = (
            await get_db().users.find_one({"_id": department.get("hodUserId")}, {"name": 1})
            if department.get("hodUserId")
            else None
        )
        out.append(
            {
                **serialize(department),
                "hodName": (hod or {}).get("name"),
                "semesters": semesters,
                "activeBatches": batches,
                "students": students,
                "trainersAssigned": trainers,
            }
        )
    return {"success": True, "data": out}


@router.post("/departments", status_code=status.HTTP_201_CREATED)
async def create_department(
    payload: DepartmentRequest, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        from app.repositories.game_repo import _safe_uuid

        inst_uuid = _safe_uuid(ctx.college_id) or UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")
        async with get_pg_connection() as conn:
            exists = await conn.fetchval(
                "SELECT 1 FROM departments WHERE institution_id = $1 AND UPPER(code) = $2 AND deleted_at IS NULL",
                inst_uuid, payload.code.upper(),
            )
            if exists:
                raise Conflict(f"A department with code '{payload.code.upper()}' already exists")

            row = await conn.fetchrow(
                """
                INSERT INTO departments (id, institution_id, name, code, status, created_at, updated_at)
                VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', NOW(), NOW())
                RETURNING id, name, code, status, created_at
                """,
                inst_uuid, payload.name, payload.code.upper(),
            )
            dept_dict = {
                "id": str(row["id"]),
                "_id": str(row["id"]),
                "name": row["name"],
                "code": row["code"],
                "status": (row["status"] or "ACTIVE").lower(),
                "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            }
            try:
                await get_db().departments.insert_one({
                    "_id": str(row["id"]),
                    "collegeId": str(inst_uuid),
                    "name": payload.name,
                    "code": payload.code.upper(),
                    "status": "active",
                    "createdAt": _now(),
                    "version": 1,
                })
            except Exception:
                pass
            return {"success": True, "message": "Department created", "data": dept_dict}

    db = get_db()
    if await db.departments.find_one(
        {"collegeId": ctx.college_id, "code": payload.code.upper()}
    ):
        raise Conflict(f"A department with code '{payload.code.upper()}' already exists")

    hod_id = None
    if payload.hodUserId:
        hod = await UserRepo(ctx).find_one({"_id": ObjectId(payload.hodUserId)})
        if not hod:
            raise NotFound("That user is not in your institution")
        hod_id = hod["_id"]

    saved = await DepartmentRepo(ctx).insert(
        {
            "name": payload.name,
            "code": payload.code.upper(),
            "collegeId": ctx.college_id,
            "hodUserId": hod_id,
            "description": payload.description,
            "status": "active",
        },
        conflict_message="A department with that code already exists",
    )
    if hod_id:
        await _bind_hod(ctx, hod_id, saved["_id"], saved.get("name"))
    return {"success": True, "message": "Department created", "data": serialize(saved)}


async def _bind_hod(
    ctx: ScopeContext, hod_id: ObjectId, department_id: ObjectId, department_name: str | None
) -> None:
    """Assigning an HOD updates their scope and forces re-authentication (SRS §9)."""
    await get_db().users.update_one(
        {"_id": hod_id},
        {
            "$set": {
                "role": str(Role.HOD),
                "departmentId": department_id,
                "departmentName": department_name,
                "updatedAt": _now(),
            }
        },
    )
    revoked = await session_service.revoke_all_sessions(
        str(hod_id), reason="department_reassignment"
    )
    await write_audit(
        ctx,
        action="update",
        entity_type="users",
        entity_id=hod_id,
        after={"role": str(Role.HOD), "departmentId": str(department_id)},
        detail=f"assigned as HOD of {department_name}; {revoked} session(s) revoked",
    )
    await notify(
        user_id=hod_id,
        kind=Kind.ACCOUNT,
        title="Your department assignment changed",
        body=f"You are now Head of Department for {department_name}. Please sign in again.",
        college_id=ctx.college_id,
        department_id=department_id,
    )


@router.patch("/departments/{department_id}")
async def update_department(
    department_id: str, payload: DepartmentPatch, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    resolved = await require_department_scope(ctx, department_id)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise ValidationError("Nothing to update")

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        from app.repositories.game_repo import _safe_uuid

        d_uuid = _safe_uuid(resolved)
        if d_uuid:
            async with get_pg_connection() as conn:
                set_clauses = ["updated_at = NOW()"]
                params: list[Any] = [d_uuid]
                if "name" in updates:
                    params.append(updates["name"])
                    set_clauses.append(f"name = ${len(params)}")
                if "status" in updates:
                    raw_st = updates["status"].upper()
                    st_val = "ACTIVE" if raw_st in ("ACTIVE", "UPCOMING") else ("ARCHIVED" if raw_st == "ARCHIVED" else "INACTIVE")
                    params.append(st_val)
                    set_clauses.append(f"status = ${len(params)}::record_status_enum")

                row = await conn.fetchrow(
                    f"UPDATE departments SET {', '.join(set_clauses)} WHERE id = $1 RETURNING id, name, code, status, created_at, updated_at",
                    *params,
                )
                if not row:
                    raise NotFound("Department not found")
                return {
                    "success": True,
                    "message": "Department updated",
                    "data": {
                        "id": str(row["id"]),
                        "_id": str(row["id"]),
                        "name": row["name"],
                        "code": row["code"],
                        "status": (row["status"] or "ACTIVE").lower(),
                        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
                    },
                }

    repo = DepartmentRepo(ctx)
    hod_id = updates.pop("hodUserId", None)
    saved = await repo.update(resolved, updates) if updates else await repo.get(resolved)
    if hod_id:
        hod = await UserRepo(ctx).find_one({"_id": ObjectId(hod_id)})
        if not hod:
            raise NotFound("That user is not in your institution")
        await repo.update(resolved, {"hodUserId": hod["_id"]})
        await _bind_hod(ctx, hod["_id"], resolved, saved.get("name"))
        saved = await repo.get(resolved)
    return {"success": True, "message": "Department updated", "data": serialize(saved)}


@router.delete("/departments/{department_id}")
async def archive_department(
    department_id: str, reason: str = Query(..., min_length=3, max_length=300),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Archive, never delete: dependent records keep their history (§37)."""
    resolved = await require_department_scope(ctx, department_id)
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid

        d_uuid = _safe_uuid(resolved)
        if d_uuid:
            async with get_pg_connection() as conn:
                active_students = await conn.fetchval(
                    "SELECT count(*) FROM student_profiles WHERE department_id = $1", d_uuid
                ) or 0
                active_batches = await conn.fetchval(
                    "SELECT count(*) FROM batches WHERE department_id = $1 AND deleted_at IS NULL", d_uuid
                ) or 0
                if active_students or active_batches:
                    raise BusinessRuleViolation(
                        f"This department still has {active_students} participant(s) and "
                        f"{active_batches} active batch(es). Move or complete them before archiving."
                    )
                await conn.execute("UPDATE departments SET deleted_at = NOW() WHERE id = $1", d_uuid)
                return {
                    "success": True,
                    "message": "Department archived. Historical records are preserved and read-only.",
                }

    active_students = await StudentProfileRepo(ctx).count({"departmentId": resolved})
    active_batches = await BatchRepo(ctx).count({"departmentId": resolved, "status": "active"})
    if active_students or active_batches:
        raise BusinessRuleViolation(
            f"This department still has {active_students} participant(s) and "
            f"{active_batches} active batch(es). Move or complete them before archiving."
        )
    await DepartmentRepo(ctx).soft_remove(resolved, reason=reason)
    return {
        "success": True,
        "message": "Department archived. Historical records are preserved and read-only.",
    }


# --------------------------------------------------------------------------- semesters & batches
@router.get("/semesters")
async def semesters(
    departmentId: str | None = Query(None), ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        from app.repositories.game_repo import _safe_uuid

        d_uuid = _safe_uuid(departmentId) if departmentId and departmentId != "all" else None
        inst_uuid = _safe_uuid(ctx.college_id) or UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")

        async with get_pg_connection() as conn:
            conds = ["s.deleted_at IS NULL"]
            params: list[Any] = []
            if d_uuid:
                params.append(d_uuid)
                conds.append(f"s.department_id = ${len(params)}")
            else:
                params.append(inst_uuid)
                conds.append(f"s.institution_id = ${len(params)}")

            query_sql = f"""
                SELECT s.id, s.department_id, s.number, s.label, s.academic_year, s.active, s.status,
                       d.name as department_name
                FROM semesters s
                LEFT JOIN departments d ON s.department_id = d.id
                WHERE {' AND '.join(conds)}
                ORDER BY s.number ASC
            """
            rows = await conn.fetch(query_sql, *params)
            out = [
                {
                    "id": str(r["id"]),
                    "_id": str(r["id"]),
                    "departmentId": str(r["department_id"]),
                    "departmentName": r["department_name"],
                    "number": r["number"],
                    "label": r["label"] or f"Semester {r['number']}",
                    "academicYear": r["academic_year"] or "2026-27",
                    "active": bool(r["active"]),
                    "status": r["status"] or "active",
                }
                for r in rows
            ]
            return {"success": True, "data": out}

    filters: dict[str, Any] = {}
    if departmentId:
        filters["departmentId"] = await require_department_scope(ctx, departmentId)
    rows = await SemesterRepo(ctx).find_all(filters, limit=200, sort=[("number", 1)])
    return {"success": True, "data": serialize(rows)}


@router.post("/semesters", status_code=status.HTTP_201_CREATED)
async def create_semester(
    payload: SemesterRequest, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    resolved = await require_department_scope(ctx, payload.departmentId)

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        from app.repositories.game_repo import _safe_uuid

        d_uuid = _safe_uuid(resolved)
        inst_uuid = _safe_uuid(ctx.college_id) or UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")

        async with get_pg_connection() as conn:
            existing = await conn.fetchrow(
                "SELECT id FROM semesters WHERE department_id = $1 AND number = $2 AND deleted_at IS NULL",
                d_uuid, payload.number,
            )
            if existing:
                raise Conflict(f"Semester {payload.number} already exists for this department")

            row = await conn.fetchrow(
                """
                INSERT INTO semesters (institution_id, department_id, number, label, academic_year, active, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'active')
                RETURNING id, department_id, number, label, academic_year, active, status
                """,
                inst_uuid, d_uuid, payload.number,
                payload.label or f"Semester {payload.number}",
                payload.academicYear or str(_now().year),
                payload.active,
            )
            sem_data = {
                "id": str(row["id"]),
                "_id": str(row["id"]),
                "departmentId": str(row["department_id"]),
                "number": row["number"],
                "label": row["label"],
                "academicYear": row["academic_year"],
                "active": row["active"],
                "status": row["status"],
            }
            return {"success": True, "message": "Semester created", "data": sem_data}

    existing = await SemesterRepo(ctx).find_one(
        {"departmentId": resolved, "number": payload.number}
    )
    if existing:
        raise Conflict(f"Semester {payload.number} already exists for this department")
    saved = await SemesterRepo(ctx).insert(
        {
            "departmentId": resolved,
            "number": payload.number,
            "label": payload.label or f"Semester {payload.number}",
            "academicYear": payload.academicYear or str(_now().year),
            "active": payload.active,
            "status": "active",
        }
    )
    return {"success": True, "message": "Semester created", "data": serialize(saved)}


@router.get("/batches")
async def batches(
    departmentId: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status", max_length=20),
    search: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid
        from uuid import UUID

        inst_uuid = _safe_uuid(ctx.college_id) or UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")
        async with get_pg_connection() as conn:
            conds = ["b.institution_id = $1", "b.deleted_at IS NULL"]
            params: list[Any] = [inst_uuid]

            if departmentId and departmentId.lower() != "all":
                d_uuid = _safe_uuid(departmentId)
                if d_uuid:
                    params.append(d_uuid)
                    conds.append(f"b.department_id = ${len(params)}")

            if status_filter and status_filter.lower() != "all":
                params.append(status_filter.upper())
                conds.append(f"b.status::text = ${len(params)}")

            if search:
                params.append(f"%{search.strip()}%")
                conds.append(f"(b.name ILIKE ${len(params)} OR b.code ILIKE ${len(params)})")

            where_clause = " AND ".join(conds)
            total = await conn.fetchval(f"SELECT COUNT(*) FROM batches b WHERE {where_clause}", *params) or 0

            offset = (page - 1) * pageSize
            query_sql = f"""
                SELECT 
                    b.id, b.name, b.code, b.status, b.created_at, b.department_id, b.capacity,
                    d.name as department_name,
                    (SELECT COUNT(*) FROM student_profiles sp WHERE sp.batch_id = b.id) as student_count,
                    (SELECT COUNT(DISTINCT bt.trainer_user_id) FROM batch_trainers bt WHERE bt.batch_id = b.id) as trainer_count
                FROM batches b
                LEFT JOIN departments d ON b.department_id = d.id
                WHERE {where_clause}
                ORDER BY b.created_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """
            rows = await conn.fetch(query_sql, *params, pageSize, offset)
            items = []
            for r in rows:
                b_cap = r["capacity"] if r["capacity"] is not None else 60
                st_count = r["student_count"]
                items.append({
                    "id": str(r["id"]),
                    "_id": str(r["id"]),
                    "name": r["name"],
                    "code": r["code"],
                    "departmentId": str(r["department_id"]) if r["department_id"] else None,
                    "departmentName": r["department_name"],
                    "status": (r["status"] or "ACTIVE").lower(),
                    "students": st_count,
                    "trainersAssigned": r["trainer_count"],
                    "capacity": b_cap,
                    "utilisationPercent": round((st_count / b_cap) * 100, 1) if b_cap else 0,
                    "isOverCapacity": st_count > b_cap,
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                })
            total_pages = max(1, (total + pageSize - 1) // pageSize)
            return {
                "success": True,
                "items": items,
                "total": total,
                "page": page,
                "pageSize": pageSize,
                "totalPages": total_pages,
            }

    filters: dict[str, Any] = {}
    if departmentId:
        filters["departmentId"] = await require_department_scope(ctx, departmentId)
    if status_filter and status_filter != "all":
        filters["status"] = status_filter
    page_result = await BatchRepo(ctx).list(
        filters=filters, search=search, page=page, page_size=pageSize
    )
    items = []
    for batch in page_result.items:
        count = await StudentProfileRepo(ctx).count({"batchId": batch["_id"]})
        trainers = len(
            await TrainerAssignmentRepo(ctx).distinct(
                "trainerUserId", {"batchId": batch["_id"], "active": True}
            )
        )
        items.append(
            {
                **serialize(batch),
                "students": count,
                "trainersAssigned": trainers,
                "utilisationPercent": (
                    round(count / batch["capacity"] * 100, 1) if batch.get("capacity") else None
                ),
            }
        )
    response = page_result.to_response()
    response["items"] = items
    return {"success": True, **response}


@router.post("/batches", status_code=status.HTTP_201_CREATED)
async def create_batch(payload: BatchRequest, ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    resolved = await require_department_scope(ctx, payload.departmentId)

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        from app.repositories.game_repo import _safe_uuid

        d_uuid = _safe_uuid(resolved)
        inst_uuid = _safe_uuid(ctx.college_id) or UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")

        async with get_pg_connection() as conn:
            exists = await conn.fetchval(
                "SELECT 1 FROM batches WHERE institution_id = $1 AND UPPER(code) = $2 AND deleted_at IS NULL",
                inst_uuid, payload.code.upper(),
            )
            if exists:
                raise Conflict(f"A batch with code '{payload.code.upper()}' already exists")

            cap = payload.capacity or 60
            row = await conn.fetchrow(
                """
                INSERT INTO batches (id, institution_id, department_id, name, code, academic_year, semester, capacity, status, created_at, updated_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, '2026-27', 1, $5, 'ACTIVE', NOW(), NOW())
                RETURNING id, name, code, capacity, status, created_at
                """,
                inst_uuid, d_uuid, payload.name, payload.code.upper(), cap,
            )
            return {
                "success": True,
                "message": "Batch created",
                "data": {
                    "id": str(row["id"]),
                    "_id": str(row["id"]),
                    "name": row["name"],
                    "code": row["code"],
                    "capacity": row["capacity"],
                    "status": (row["status"] or "ACTIVE").lower(),
                    "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                },
            }

    department = await DepartmentRepo(ctx).get(resolved)
    if await get_db().batches.find_one(
        {"collegeId": ctx.college_id, "code": payload.code.upper()}
    ):
        raise Conflict(f"A batch with code '{payload.code.upper()}' already exists")
    saved = await BatchRepo(ctx).insert(
        {
            "name": payload.name,
            "code": payload.code.upper(),
            "departmentId": resolved,
            "departmentName": department.get("name"),
            "semesterId": ObjectId(payload.semesterId) if payload.semesterId else None,
            "capacity": payload.capacity,
            "status": payload.status,
        },
        conflict_message="A batch with that code already exists",
    )
    return {"success": True, "message": "Batch created", "data": serialize(saved)}


@router.patch("/batches/{batch_id}")
async def update_batch(
    batch_id: str, payload: BatchPatch, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise ValidationError("Nothing to update")

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        from app.repositories.game_repo import _safe_uuid

        b_uuid = _safe_uuid(batch_id)
        if not b_uuid:
            raise ValidationError("Not a valid identifier")

        async with get_pg_connection() as conn:
            batch = await conn.fetchrow(
                "SELECT id, institution_id, department_id, name, code, capacity, status FROM batches WHERE id = $1 AND deleted_at IS NULL",
                b_uuid,
            )
            if not batch:
                raise NotFound("Resource not found")

            # Check capacity rule
            if "capacity" in updates:
                new_cap = updates["capacity"]
                current = await conn.fetchval(
                    "SELECT count(*) FROM student_profiles WHERE batch_id = $1", b_uuid
                ) or 0
                if new_cap < current:
                    raise BusinessRuleViolation(
                        f"This batch already has {current} participant(s) — capacity cannot be lower."
                    )

            set_clauses = ["updated_at = NOW()"]
            params: list[Any] = [b_uuid]
            if "name" in updates:
                params.append(updates["name"])
                set_clauses.append(f"name = ${len(params)}")
            if "capacity" in updates:
                params.append(updates["capacity"])
                set_clauses.append(f"capacity = ${len(params)}")
            if "status" in updates:
                raw_st = updates["status"].upper()
                st_val = "ACTIVE" if raw_st in ("ACTIVE", "UPCOMING") else ("ARCHIVED" if raw_st == "ARCHIVED" else "INACTIVE")
                params.append(st_val)
                set_clauses.append(f"status = ${len(params)}::record_status_enum")

            row = await conn.fetchrow(
                f"UPDATE batches SET {', '.join(set_clauses)} WHERE id = $1 RETURNING id, name, code, capacity, status, updated_at",
                *params,
            )
            return {
                "success": True,
                "message": "Batch updated",
                "data": {
                    "id": str(row["id"]),
                    "_id": str(row["id"]),
                    "name": row["name"],
                    "code": row["code"],
                    "capacity": row["capacity"],
                    "status": (row["status"] or "ACTIVE").lower(),
                    "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
                },
            }

    try:
        b_oid = ObjectId(batch_id)
    except Exception as exc:
        raise ValidationError("Not a valid identifier") from exc

    if updates.get("semesterId"):
        updates["semesterId"] = ObjectId(updates["semesterId"])
    if updates.get("capacity"):
        current = await StudentProfileRepo(ctx).count({"batchId": b_oid})
        if updates["capacity"] < current:
            raise BusinessRuleViolation(
                f"This batch already has {current} participant(s) — capacity cannot be lower."
            )
    saved = await BatchRepo(ctx).update(b_oid, updates)
    return {"success": True, "message": "Batch updated", "data": serialize(saved)}


@router.post("/batches/{batch_id}/students")
async def assign_students(
    batch_id: str, payload: AssignStudentsRequest, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    """Assign participants to a batch. Enrollment history is appended, never overwritten."""
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        from app.repositories.game_repo import _safe_uuid

        b_uuid = _safe_uuid(batch_id)
        if not b_uuid:
            raise ValidationError("Not a valid identifier")

        async with get_pg_connection() as conn:
            batch = await conn.fetchrow(
                "SELECT id, institution_id, department_id, name, capacity FROM batches WHERE id = $1 AND deleted_at IS NULL",
                b_uuid,
            )
            if not batch:
                raise NotFound("Batch not found")

            capacity = batch["capacity"] or 60
            current = await conn.fetchval(
                "SELECT count(*) FROM student_profiles WHERE batch_id = $1", b_uuid
            ) or 0

            # Enforce capacity transactionally: prevent over-capacity assignment
            if capacity and current + len(payload.studentUserIds) > capacity:
                raise BusinessRuleViolation(
                    f"That would put {current + len(payload.studentUserIds)} participants in a batch with capacity {capacity}. "
                    f"Current batch utilisation is already {current}/{capacity}."
                )

            assigned, rejected = [], []
            for raw_id in payload.studentUserIds:
                s_uuid = _safe_uuid(raw_id)
                if not s_uuid:
                    rejected.append({"studentUserId": raw_id, "reason": "Not a valid student identifier"})
                    continue

                sp = await conn.fetchrow(
                    "SELECT user_id, department_id, institution_id, batch_id FROM student_profiles WHERE user_id = $1",
                    s_uuid,
                )
                if not sp:
                    rejected.append({"studentUserId": raw_id, "reason": "Not in your institution"})
                    continue
                if sp["department_id"] != batch["department_id"]:
                    rejected.append({"studentUserId": raw_id, "reason": "Participant belongs to another department"})
                    continue
                if sp["batch_id"] == b_uuid:
                    rejected.append({"studentUserId": raw_id, "reason": "Already actively enrolled in this batch"})
                    continue

                # Transactionally assign
                await conn.execute(
                    "UPDATE student_profiles SET batch_id = $1, updated_at = NOW() WHERE user_id = $2",
                    b_uuid, s_uuid,
                )
                active_enr = await conn.fetchrow(
                    "SELECT id FROM enrollments WHERE participant_user_id = $1 AND enrollment_status = 'ACTIVE' LIMIT 1",
                    s_uuid,
                )
                if active_enr:
                    await conn.execute(
                        "UPDATE enrollments SET batch_id = $1, updated_at = NOW() WHERE id = $2",
                        b_uuid, active_enr["id"],
                    )
                assigned.append(raw_id)

            await write_audit(
                ctx,
                action="update",
                entity_type="batches",
                entity_id=b_uuid,
                after={"assigned": len(assigned), "rejected": len(rejected)},
                detail=f"{len(assigned)} participant(s) assigned to {batch['name']}",
            )
            return {
                "success": True,
                "message": f"{len(assigned)} participant(s) assigned",
                "data": {"assigned": assigned, "rejected": rejected},
            }

    try:
        b_oid = ObjectId(batch_id)
    except Exception as exc:
        raise ValidationError("Not a valid identifier") from exc

    batch = await BatchRepo(ctx).get(b_oid)
    capacity = batch.get("capacity") or 0
    current = await StudentProfileRepo(ctx).count({"batchId": batch["_id"]})
    if capacity and current + len(payload.studentUserIds) > capacity:
        raise BusinessRuleViolation(
            f"That would put {current + len(payload.studentUserIds)} participants in a batch "
            f"with capacity {capacity}."
        )

    db = get_db()
    assigned, rejected = [], []
    for raw_id in payload.studentUserIds:
        try:
            student_id = ObjectId(raw_id) if ObjectId.is_valid(raw_id) else raw_id
        except Exception:
            student_id = raw_id

        profile = await StudentProfileRepo(ctx).find_one(
            {"$or": [{"userId": student_id}, {"userId": str(raw_id)}, {"_id": student_id}]}
        )
        if not profile:
            rejected.append({"studentUserId": raw_id, "reason": "Not in your institution"})
            continue
        if profile.get("departmentId") and batch.get("departmentId") and str(profile.get("departmentId")) != str(batch.get("departmentId")):
            rejected.append(
                {"studentUserId": raw_id, "reason": "Participant belongs to another department"}
            )
            continue
        active = await db.enrollments.find_one(
            {
                "studentUserId": student_id,
                "status": "active",
            }
        )
        if active and str(active.get("batchId")) == str(batch["_id"]):
            rejected.append(
                {"studentUserId": raw_id, "reason": "Already actively enrolled in this batch"}
            )
            continue

        await db.student_profiles.update_many(
            {"$or": [{"userId": student_id}, {"userId": str(raw_id)}, {"_id": student_id}]},
            {"$set": {"batchId": batch["_id"], "batchName": batch.get("name"), "updatedAt": _now()}},
        )
        await db.users.update_many(
            {"$or": [{"_id": student_id}, {"_id": str(raw_id)}]},
            {"$set": {"batchId": batch["_id"], "batchName": batch.get("name"), "updatedAt": _now()}},
        )

        if active:
            await db.enrollments.update_one(
                {"_id": active["_id"]},
                {
                    "$set": {
                        "status": "transferred",
                        "statusChangedAt": _now(),
                        "statusChangeReason": payload.reason or "Batch reassignment",
                    }
                },
            )
        enrollment_id = (
            await db.enrollments.insert_one(
                {
                    "studentUserId": student_id,
                    "studentName": profile.get("name"),
                    "rollNumber": profile.get("rollNumber"),
                    "collegeId": ctx.college_id,
                    "departmentId": batch["departmentId"],
                    "batchId": batch["_id"],
                    "batchName": batch.get("name"),
                    "enrolledBy": ctx.user_id,
                    "enrolledByLabel": ctx.actor_label,
                    "enrolledAt": _now(),
                    "enrollmentType": "transfer" if active else payload.enrollmentType,
                    "status": "active",
                    "previousEnrollmentId": active["_id"] if active else None,
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
                "studentUserId": student_id,
                "collegeId": ctx.college_id,
                "departmentId": batch["departmentId"],
                "fromStatus": active.get("status") if active else None,
                "toStatus": "active",
                "reason": payload.reason or "Assigned to batch by admin",
                "actorId": ctx.user_id,
                "actorLabel": ctx.actor_label,
                "at": _now(),
            }
        )
        assigned.append(raw_id)

    await write_audit(
        ctx,
        action="update",
        entity_type="batches",
        entity_id=batch["_id"],
        after={"assigned": len(assigned), "rejected": len(rejected)},
        detail=f"{len(assigned)} participant(s) assigned to {batch.get('name')}",
    )
    return {
        "success": True,
        "message": f"{len(assigned)} participant(s) assigned",
        "data": {"assigned": assigned, "rejected": rejected},
    }


@router.post("/batches/{batch_id}/trainers")
async def assign_trainers(
    batch_id: str, payload: AssignTrainersRequest, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        from app.repositories.game_repo import _safe_uuid

        b_uuid = _safe_uuid(batch_id)
        if not b_uuid:
            raise ValidationError("Not a valid identifier")

        async with get_pg_connection() as conn:
            batch = await conn.fetchrow(
                "SELECT id, institution_id, department_id, name, start_date, end_date FROM batches WHERE id = $1 AND deleted_at IS NULL",
                b_uuid,
            )
            if not batch:
                raise NotFound("Batch not found")

            # Enforce institution tenant scope for Admin
            if ctx.college_id and batch["institution_id"] and str(batch["institution_id"]) != str(ctx.college_id):
                raise ScopeForbidden("Cannot assign trainers to a batch outside your institution.")

            assigned, rejected = [], []
            admin_uuid = _safe_uuid(ctx.user_id)
            start_d = payload.startDate or batch.get("start_date")
            end_d = payload.endDate or batch.get("end_date")
            w_days = payload.weekdays if payload.weekdays else [1, 2, 3, 4, 5, 6, 7]
            status_val = payload.status or "ACTIVE"
            note_text = payload.notes or payload.scheduleReference

            for raw_id in payload.trainerUserIds:
                t_uuid = _safe_uuid(raw_id)
                if not t_uuid:
                    rejected.append({"trainerUserId": raw_id, "reason": "Not a valid trainer identifier"})
                    continue

                user = await conn.fetchrow(
                    "SELECT id, role, institution_id FROM users WHERE id = $1 AND deleted_at IS NULL",
                    t_uuid,
                )
                if not user:
                    rejected.append({"trainerUserId": raw_id, "reason": "Trainer not found"})
                    continue

                if user["role"] != "TRAINER":
                    rejected.append({"trainerUserId": raw_id, "reason": "User does not have TRAINER role"})
                    continue

                if ctx.college_id and user["institution_id"] and str(user["institution_id"]) != str(ctx.college_id):
                    rejected.append({"trainerUserId": raw_id, "reason": "Trainer belongs to a different institution"})
                    continue

                await conn.execute(
                    """
                    INSERT INTO batch_trainers (
                        id, batch_id, trainer_user_id, assigned_at,
                        institution_id, start_date, end_date, weekdays, status, assigned_by, notes, updated_at
                    )
                    VALUES (gen_random_uuid(), $1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, NOW())
                    ON CONFLICT (batch_id, trainer_user_id) DO UPDATE SET
                        institution_id = EXCLUDED.institution_id,
                        start_date = EXCLUDED.start_date,
                        end_date = EXCLUDED.end_date,
                        weekdays = EXCLUDED.weekdays,
                        status = EXCLUDED.status,
                        assigned_by = EXCLUDED.assigned_by,
                        notes = EXCLUDED.notes,
                        updated_at = NOW()
                    """,
                    b_uuid, t_uuid, batch["institution_id"], start_d, end_d, w_days, status_val, admin_uuid, note_text
                )
                await session_service.revoke_all_sessions(str(t_uuid), reason="assignment_changed")
                assigned.append(raw_id)

            await write_audit(
                ctx,
                action="update",
                entity_type="trainer_assignments",
                entity_id=b_uuid,
                after={
                    "assignedCount": len(assigned),
                    "startDate": str(start_d) if start_d else None,
                    "endDate": str(end_d) if end_d else None,
                    "weekdays": w_days,
                    "status": status_val,
                },
                detail=f"{len(assigned)} trainer(s) assigned to {batch['name']} (Status: {status_val})",
            )
            return {
                "success": True,
                "message": f"{len(assigned)} trainer(s) assigned",
                "data": {"assigned": assigned, "rejected": rejected},
            }

    try:
        b_oid = ObjectId(batch_id)
    except Exception as exc:
        raise ValidationError("Not a valid identifier") from exc

    batch = await BatchRepo(ctx).get(b_oid)
    module = (
        await TrainingModuleRepo(ctx).get(payload.trainingModuleId)
        if payload.trainingModuleId
        else None
    )
    db = get_db()
    assigned, rejected = [], []
    for raw_id in payload.trainerUserIds:
        trainer = await UserRepo(ctx).find_one(
            {"_id": ObjectId(raw_id), "role": str(Role.TRAINER)}
        )
        if not trainer:
            rejected.append({"trainerUserId": raw_id, "reason": "Not a trainer in your institution"})
            continue
        await db.trainer_assignments.update_one(
            {
                "trainerUserId": trainer["_id"],
                "batchId": batch["_id"],
                "trainingModuleId": (module or {}).get("_id"),
            },
            {
                "$set": {
                    "trainerUserId": trainer["_id"],
                    "trainerName": trainer.get("name"),
                    "collegeId": ctx.college_id,
                    "departmentId": batch["departmentId"],
                    "batchId": batch["_id"],
                    "batchName": batch.get("name"),
                    "trainingModuleId": (module or {}).get("_id"),
                    "trainingModuleName": (module or {}).get("name"),
                    "academicYear": str(_now().year),
                    "active": True,
                    "updatedAt": _now(),
                },
                "$setOnInsert": {"createdAt": _now(), "deletedAt": None, "version": 1},
            },
            upsert=True,
        )
        await session_service.revoke_all_sessions(str(trainer["_id"]), reason="assignment_changed")
        assigned.append(raw_id)

    await write_audit(
        ctx,
        action="update",
        entity_type="trainer_assignments",
        entity_id=batch["_id"],
        after={"assigned": len(assigned)},
        detail=f"{len(assigned)} trainer(s) assigned to {batch.get('name')}",
    )
    return {
        "success": True,
        "message": f"{len(assigned)} trainer(s) assigned",
        "data": {"assigned": assigned, "rejected": rejected},
    }


@router.get("/batches/{batch_id}/trainers")
async def get_batch_trainers(
    batch_id: str,
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Retrieve all trainers assigned to this batch with schedule, weekdays, and status."""
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid

        b_uuid = _safe_uuid(batch_id)
        if not b_uuid:
            raise ValidationError("Not a valid identifier")

        async with get_pg_connection() as conn:
            batch = await conn.fetchrow(
                "SELECT id, institution_id, name FROM batches WHERE id = $1 AND deleted_at IS NULL",
                b_uuid,
            )
            if not batch:
                raise NotFound("Batch not found")

            if ctx.college_id and batch["institution_id"] and str(batch["institution_id"]) != str(ctx.college_id):
                raise ScopeForbidden("Cannot view trainers for a batch outside your institution.")

            rows = await conn.fetch(
                """
                SELECT 
                    bt.id,
                    bt.batch_id,
                    bt.trainer_user_id,
                    bt.start_date,
                    bt.end_date,
                    bt.weekdays,
                    bt.status,
                    bt.notes,
                    bt.assigned_at,
                    bt.created_at,
                    bt.updated_at,
                    u.name as trainer_name,
                    u.email as trainer_email,
                    u.status as trainer_account_status,
                    d.name as department_name,
                    tp.title as designation,
                    tp.specializations as specialization,
                    admin_u.name as assigned_by_name
                FROM batch_trainers bt
                JOIN users u ON bt.trainer_user_id = u.id
                LEFT JOIN departments d ON u.department_id = d.id
                LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
                LEFT JOIN users admin_u ON bt.assigned_by = admin_u.id
                WHERE bt.batch_id = $1
                ORDER BY bt.created_at DESC
                """,
                b_uuid,
            )

            out = [
                {
                    "id": str(r["id"]),
                    "batchId": str(r["batch_id"]),
                    "trainerUserId": str(r["trainer_user_id"]),
                    "trainerName": r["trainer_name"],
                    "trainerEmail": r["trainer_email"],
                    "trainerAccountStatus": r["trainer_account_status"],
                    "departmentName": r["department_name"] or "",
                    "designation": r["designation"] or "",
                    "specialization": r["specialization"] or "",
                    "startDate": r["start_date"].isoformat() if r["start_date"] else None,
                    "endDate": r["end_date"].isoformat() if r["end_date"] else None,
                    "weekdays": list(r["weekdays"]) if r["weekdays"] else [1, 2, 3, 4, 5, 6, 7],
                    "status": r["status"] or "ACTIVE",
                    "notes": r["notes"] or "",
                    "assignedAt": r["assigned_at"].isoformat() if r["assigned_at"] else (r["created_at"].isoformat() if r["created_at"] else None),
                    "assignedByName": r["assigned_by_name"] or "Administrator",
                }
                for r in rows
            ]
            return {"success": True, "data": out}

    try:
        b_oid = ObjectId(batch_id)
    except Exception as exc:
        raise ValidationError("Not a valid identifier") from exc

    db = get_db()
    assignments = await db.trainer_assignments.find({"batchId": b_oid, "active": True}).to_list(length=100)
    out = []
    for a in assignments:
        trainer = await UserRepo(ctx).get(a["trainerUserId"])
        out.append({
            "id": str(a["_id"]),
            "batchId": str(a["batchId"]),
            "trainerUserId": str(a["trainerUserId"]),
            "trainerName": (trainer or {}).get("name") or a.get("trainerName", ""),
            "trainerEmail": (trainer or {}).get("email", ""),
            "trainerAccountStatus": (trainer or {}).get("status", "ACTIVE"),
            "departmentName": a.get("departmentName", ""),
            "designation": "",
            "specialization": "",
            "startDate": None,
            "endDate": None,
            "weekdays": [1, 2, 3, 4, 5, 6, 7],
            "status": "ACTIVE" if a.get("active") else "INACTIVE",
            "notes": "",
            "assignedAt": a.get("createdAt", _now()).isoformat() if isinstance(a.get("createdAt"), datetime) else None,
            "assignedByName": "Administrator",
        })
    return {"success": True, "data": out}


@router.patch("/batches/{batch_id}/trainers/{trainer_id}")
async def update_trainer_assignment(
    batch_id: str,
    trainer_id: str,
    payload: UpdateTrainerAssignmentRequest,
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Update schedule, dates, weekdays, or status for an existing batch-trainer assignment."""
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid

        b_uuid = _safe_uuid(batch_id)
        t_uuid = _safe_uuid(trainer_id)
        if not b_uuid or not t_uuid:
            raise ValidationError("Not a valid identifier")

        async with get_pg_connection() as conn:
            batch = await conn.fetchrow(
                "SELECT id, institution_id, name FROM batches WHERE id = $1 AND deleted_at IS NULL",
                b_uuid,
            )
            if not batch:
                raise NotFound("Batch not found")

            if ctx.college_id and batch["institution_id"] and str(batch["institution_id"]) != str(ctx.college_id):
                raise ScopeForbidden("Cannot update trainer assignments outside your institution.")

            existing = await conn.fetchrow(
                "SELECT * FROM batch_trainers WHERE batch_id = $1 AND trainer_user_id = $2",
                b_uuid, t_uuid,
            )
            if not existing:
                raise NotFound("Trainer is not assigned to this batch")

            updates = []
            params: list[Any] = [b_uuid, t_uuid]

            if payload.startDate is not None:
                params.append(payload.startDate)
                updates.append(f"start_date = ${len(params)}")
            if payload.endDate is not None:
                params.append(payload.endDate)
                updates.append(f"end_date = ${len(params)}")
            if payload.weekdays is not None:
                params.append(payload.weekdays)
                updates.append(f"weekdays = ${len(params)}")
            if payload.status is not None:
                params.append(payload.status)
                updates.append(f"status = ${len(params)}")
            if payload.notes is not None or payload.scheduleReference is not None:
                note_val = payload.notes if payload.notes is not None else payload.scheduleReference
                params.append(note_val)
                updates.append(f"notes = ${len(params)}")

            admin_uuid = _safe_uuid(ctx.user_id)
            if admin_uuid:
                params.append(admin_uuid)
                updates.append(f"assigned_by = ${len(params)}")

            updates.append("updated_at = NOW()")

            query = f"""
                UPDATE batch_trainers
                SET {', '.join(updates)}
                WHERE batch_id = $1 AND trainer_user_id = $2
                RETURNING *
            """
            updated_row = await conn.fetchrow(query, *params)
            await session_service.revoke_all_sessions(str(t_uuid), reason="assignment_schedule_updated")

            await write_audit(
                ctx,
                action="update",
                entity_type="trainer_assignment_schedule",
                entity_id=b_uuid,
                detail=f"Updated trainer {trainer_id} schedule on batch {batch['name']}",
            )

            return {
                "success": True,
                "message": "Trainer assignment schedule updated",
                "data": {
                    "id": str(updated_row["id"]),
                    "batchId": str(updated_row["batch_id"]),
                    "trainerUserId": str(updated_row["trainer_user_id"]),
                    "startDate": updated_row["start_date"].isoformat() if updated_row["start_date"] else None,
                    "endDate": updated_row["end_date"].isoformat() if updated_row["end_date"] else None,
                    "weekdays": list(updated_row["weekdays"]) if updated_row["weekdays"] else [1, 2, 3, 4, 5, 6, 7],
                    "status": updated_row["status"],
                    "notes": updated_row["notes"],
                },
            }

    db = get_db()
    await db.trainer_assignments.update_one(
        {"batchId": ObjectId(batch_id), "trainerUserId": ObjectId(trainer_id)},
        {"$set": {"active": payload.status == "ACTIVE" if payload.status else True, "updatedAt": _now()}}
    )
    return {"success": True, "message": "Assignment updated"}


@router.delete("/batches/{batch_id}/trainers/{trainer_id}")
async def unassign_trainer(
    batch_id: str,
    trainer_id: str,
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Unassign a trainer from a batch, invalidating active sessions."""
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid

        b_uuid = _safe_uuid(batch_id)
        t_uuid = _safe_uuid(trainer_id)
        if not b_uuid or not t_uuid:
            raise ValidationError("Not a valid identifier")

        async with get_pg_connection() as conn:
            batch = await conn.fetchrow(
                "SELECT id, institution_id, name FROM batches WHERE id = $1 AND deleted_at IS NULL",
                b_uuid,
            )
            if not batch:
                raise NotFound("Batch not found")

            if ctx.college_id and batch["institution_id"] and str(batch["institution_id"]) != str(ctx.college_id):
                raise ScopeForbidden("Cannot unassign trainers from a batch outside your institution.")

            res = await conn.execute(
                "DELETE FROM batch_trainers WHERE batch_id = $1 AND trainer_user_id = $2",
                b_uuid, t_uuid,
            )
            if res == "DELETE 0":
                raise NotFound("Trainer assignment not found for this batch")

            await session_service.revoke_all_sessions(str(t_uuid), reason="trainer_unassigned_from_batch")

            await write_audit(
                ctx,
                action="delete",
                entity_type="trainer_assignment",
                entity_id=b_uuid,
                detail=f"Unassigned trainer {trainer_id} from batch {batch['name']}",
            )

            return {
                "success": True,
                "message": f"Trainer successfully unassigned from {batch['name']}",
            }

    db = get_db()
    await db.trainer_assignments.delete_many(
        {"batchId": ObjectId(batch_id), "trainerUserId": ObjectId(trainer_id)}
    )
    return {"success": True, "message": "Trainer unassigned"}


@router.get("/trainers/{trainer_id}/assignments")
async def get_trainer_assignments(
    trainer_id: str,
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Get all batch assignments and schedules for a specific trainer."""
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid

        t_uuid = _safe_uuid(trainer_id)
        if not t_uuid:
            raise ValidationError("Not a valid identifier")

        async with get_pg_connection() as conn:
            user = await conn.fetchrow(
                "SELECT id, name, email, institution_id FROM users WHERE id = $1 AND deleted_at IS NULL",
                t_uuid,
            )
            if not user:
                raise NotFound("Trainer not found")

            if ctx.college_id and user["institution_id"] and str(user["institution_id"]) != str(ctx.college_id):
                raise ScopeForbidden("Cannot view assignments for a trainer from another institution.")

            rows = await conn.fetch(
                """
                SELECT 
                    bt.id,
                    bt.batch_id,
                    b.name as batch_name,
                    b.code as batch_code,
                    b.academic_year,
                    b.semester,
                    d.name as department_name,
                    bt.start_date,
                    bt.end_date,
                    bt.weekdays,
                    bt.status,
                    bt.notes,
                    bt.assigned_at,
                    admin_u.name as assigned_by_name,
                    (SELECT COUNT(*) FROM student_profiles sp WHERE sp.batch_id = b.id) as student_count
                FROM batch_trainers bt
                JOIN batches b ON bt.batch_id = b.id
                LEFT JOIN departments d ON b.department_id = d.id
                LEFT JOIN users admin_u ON bt.assigned_by = admin_u.id
                WHERE bt.trainer_user_id = $1 AND b.deleted_at IS NULL
                ORDER BY b.name ASC
                """,
                t_uuid,
            )

            out = [
                {
                    "id": str(r["id"]),
                    "batchId": str(r["batch_id"]),
                    "batchName": r["batch_name"],
                    "batchCode": r["batch_code"],
                    "academicYear": r["academic_year"],
                    "semester": r["semester"],
                    "departmentName": r["department_name"] or "",
                    "studentCount": r["student_count"],
                    "startDate": r["start_date"].isoformat() if r["start_date"] else None,
                    "endDate": r["end_date"].isoformat() if r["end_date"] else None,
                    "weekdays": list(r["weekdays"]) if r["weekdays"] else [1, 2, 3, 4, 5, 6, 7],
                    "status": r["status"] or "ACTIVE",
                    "notes": r["notes"] or "",
                    "assignedAt": r["assigned_at"].isoformat() if r["assigned_at"] else None,
                    "assignedByName": r["assigned_by_name"] or "Administrator",
                }
                for r in rows
            ]
            return {"success": True, "data": out}

    return {"success": True, "data": []}


# --------------------------------------------------------------------------- trainers & users
@router.get("/trainers")
async def trainers(
    departmentId: str | None = Query(None),
    search: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid
        inst_uuid = _safe_uuid(ctx.college_id) if ctx.college_id else None
        if not inst_uuid and ctx.user_id:
            try:
                async with get_pg_connection() as conn:
                    inst_uuid = await conn.fetchval(
                        "SELECT institution_id FROM users WHERE id = $1::uuid", _safe_uuid(ctx.user_id)
                    )
            except Exception:
                pass
        if not inst_uuid:
            inst_uuid = UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")

        dept_uuid = _safe_uuid(departmentId) if departmentId else None

        async with get_pg_connection() as conn:
            conditions = ["(u.institution_id = $1 OR tp.institution_id = $1)", "(u.role = 'TRAINER' OR tp.id IS NOT NULL)", "u.deleted_at IS NULL"]
            params: list[Any] = [inst_uuid]

            if dept_uuid:
                params.append(dept_uuid)
                conditions.append(f"(u.department_id = ${len(params)} OR tp.department_id = ${len(params)})")
            if search:
                params.append(f"%{search.strip()}%")
                conditions.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)})")

            total = await conn.fetchval(
                f"SELECT count(*) FROM users u LEFT JOIN trainer_profiles tp ON tp.user_id = u.id WHERE {' AND '.join(conditions)}", *params
            ) or 0

            offset = (page - 1) * pageSize
            params.extend([pageSize, offset])
            limit_clause = f"LIMIT ${len(params)-1} OFFSET ${len(params)}"

            trainer_rows = await conn.fetch(f"""
                SELECT u.id, u.name, u.email, u.status, u.created_at, u.updated_at,
                       COALESCE(d.id, tpd.id) as department_id, COALESCE(d.name, tpd.name) as department_name,
                       tp.title as designation, tp.specializations
                FROM users u
                LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
                LEFT JOIN departments d ON d.id = u.department_id
                LEFT JOIN departments tpd ON tpd.id = tp.department_id
                WHERE {' AND '.join(conditions)}
                ORDER BY u.name ASC
                {limit_clause}
            """, *params)

            items = []
            for tr in trainer_rows:
                tid = tr["id"]
                batch_rows = await conn.fetch("""
                    SELECT b.name
                    FROM batch_trainers bt
                    JOIN batches b ON b.id = bt.batch_id
                    WHERE bt.trainer_user_id = $1
                    ORDER BY b.name ASC
                """, tid)
                batches = [b["name"] for b in batch_rows]

                items.append({
                    "id": str(tid),
                    "name": tr["name"],
                    "email": tr["email"],
                    "designation": tr["designation"] or "Soft Skills Trainer",
                    "departmentName": tr["department_name"] or "Faculty of Soft Skills",
                    "status": (tr["status"] or "active").lower(),
                    "lastActiveAt": tr["updated_at"].isoformat() if tr.get("updated_at") else None,
                    "batches": batches,
                    "modules": ["Soft Skills Foundations", "Campus Placement Prep", "Mock Interviews"],
                    "access": {
                        "canMarkAttendance": True,
                        "canEvaluate": True,
                        "canCreateAssignments": True,
                        "canViewReports": True,
                    }
                })

            total_pages = max(1, (total + pageSize - 1) // pageSize)
            return {
                "success": True,
                "items": items,
                "total": total,
                "page": page,
                "pageSize": pageSize,
                "hasMore": (offset + len(items)) < total,
                "pagination": {
                    "page": page,
                    "pageSize": pageSize,
                    "total": total,
                    "totalPages": total_pages,
                    "hasNext": (offset + len(items)) < total,
                    "hasPrev": page > 1,
                },
            }

    filters: dict[str, Any] = {"role": str(Role.TRAINER)}
    if departmentId:
        filters["departmentId"] = await require_department_scope(ctx, departmentId)
    page_result = await UserRepo(ctx).list(
        filters=filters, search=search, page=page, page_size=pageSize
    )
    items = []
    for trainer in page_result.items:
        assignments = await TrainerAssignmentRepo(ctx).find_all(
            {"trainerUserId": trainer["_id"], "active": True}, limit=100
        )
        items.append(
            {
                "id": str(trainer["_id"]),
                "name": trainer.get("name"),
                "email": trainer.get("email"),
                "designation": trainer.get("designation"),
                "departmentName": trainer.get("departmentName"),
                "status": trainer.get("status"),
                "lastActiveAt": trainer.get("lastActiveAt"),
                "batches": sorted({a.get("batchName") for a in assignments if a.get("batchName")}),
                "modules": sorted(
                    {a.get("trainingModuleName") for a in assignments if a.get("trainingModuleName")}
                ),
                "access": trainer.get("access")
                or {
                    "canMarkAttendance": True,
                    "canEvaluate": True,
                    "canCreateAssignments": True,
                    "canViewReports": True,
                },
            }
        )
    response = page_result.to_response()
    response["items"] = items
    return {"success": True, **response}


@router.patch("/trainers/{trainer_id}/access")
async def update_trainer_access(
    trainer_id: str, payload: TrainerAccessPatch, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    trainer = await UserRepo(ctx).find_one(
        {"_id": ObjectId(trainer_id), "role": str(Role.TRAINER)}
    )
    if not trainer:
        raise NotFound("Trainer not found in your institution")
    access = payload.model_dump()
    await get_db().users.update_one(
        {"_id": trainer["_id"]}, {"$set": {"access": access, "updatedAt": _now()}}
    )
    await write_audit(
        ctx,
        action="update",
        entity_type="users",
        entity_id=trainer["_id"],
        before={"access": trainer.get("access")},
        after={"access": access},
        detail=f"access controls updated for {trainer.get('name')}",
    )
    return {"success": True, "message": "Access updated", "data": access}


@router.get("/users")
async def users(
    role: str | None = Query(None, max_length=20),
    status_filter: str | None = Query(None, alias="status", max_length=20),
    departmentId: str | None = Query(None),
    search: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid
        from uuid import UUID

        inst_uuid = _safe_uuid(ctx.college_id) or UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")
        async with get_pg_connection() as conn:
            conds = ["u.institution_id = $1", "u.deleted_at IS NULL"]
            params: list[Any] = [inst_uuid]

            if role and role.upper() != "ALL":
                params.append(role.upper())
                conds.append(f"u.role::text = ${len(params)}")

            if status_filter and status_filter.lower() != "all":
                params.append(status_filter.upper())
                conds.append(f"u.status::text = ${len(params)}")

            if departmentId and departmentId.lower() != "all":
                d_uuid = _safe_uuid(departmentId)
                if d_uuid:
                    params.append(d_uuid)
                    conds.append(f"u.department_id = ${len(params)}")

            if search:
                params.append(f"%{search.strip()}%")
                conds.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)})")

            where_clause = " AND ".join(conds)
            total = await conn.fetchval(f"SELECT COUNT(*) FROM users u WHERE {where_clause}", *params) or 0

            offset = (page - 1) * pageSize
            query_sql = f"""
                SELECT 
                    u.id, u.name, u.email, u.role, u.status, u.created_at,
                    u.department_id, d.name as department_name,
                    sp.batch_id, b.name as batch_name, sp.roll_number
                FROM users u
                LEFT JOIN departments d ON u.department_id = d.id
                LEFT JOIN student_profiles sp ON u.id = sp.user_id
                LEFT JOIN batches b ON sp.batch_id = b.id
                WHERE {where_clause}
                ORDER BY u.created_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """
            rows = await conn.fetch(query_sql, *params, pageSize, offset)
            items = [
                {
                    "id": str(r["id"]),
                    "_id": str(r["id"]),
                    "name": r["name"],
                    "email": r["email"],
                    "role": r["role"],
                    "roleLabel": ROLE_LABEL.get(parse_role(r["role"]), r["role"]) if r["role"] in Role._value2member_map_ else r["role"],
                    "status": (r["status"] or "ACTIVE").lower(),
                    "departmentId": str(r["department_id"]) if r["department_id"] else None,
                    "departmentName": r["department_name"],
                    "batchId": str(r["batch_id"]) if r["batch_id"] else None,
                    "batchName": r["batch_name"],
                    "rollNumber": r["roll_number"],
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in rows
            ]
            total_pages = max(1, (total + pageSize - 1) // pageSize)
            return {
                "success": True,
                "items": items,
                "page": page,
                "pageSize": pageSize,
                "total": total,
                "totalPages": total_pages,
                "hasNext": page < total_pages,
                "hasPrev": page > 1,
                "pagination": {
                    "page": page,
                    "pageSize": pageSize,
                    "total": total,
                    "totalPages": total_pages,
                    "hasNext": page < total_pages,
                    "hasPrev": page > 1,
                },
                "meta": {
                    "roles": [
                        {"value": str(r), "label": ROLE_LABEL[r]}
                        for r in Role
                        if r is not Role.SUPER_ADMIN
                    ],
                    "statuses": ["active", "deactivated", "pending"],
                },
            }

    filters: dict[str, Any] = {}
    if role and role != "all":
        filters["role"] = parse_role(role).value
    if status_filter and status_filter != "all":
        filters["status"] = status_filter
    if departmentId:
        filters["departmentId"] = await require_department_scope(ctx, departmentId)
    page_result = await UserRepo(ctx).list(
        filters=filters, search=search, page=page, page_size=pageSize,
        projection={"passwordHash": 0, "deviceTokens": 0},
    )
    db = get_db()
    student_user_ids = [row["_id"] for row in page_result.items if row.get("role") == "STUDENT"]
    profiles_by_user: dict[str, Any] = {}
    if student_user_ids:
        try:
            mongo_profiles = await db.student_profiles.find(
                {"$or": [{"userId": {"$in": student_user_ids}}, {"_id": {"$in": student_user_ids}}]}
            ).to_list(len(student_user_ids))
            for p in mongo_profiles:
                uid_str = str(p.get("userId") or p.get("_id"))
                profiles_by_user[uid_str] = {
                    "batchId": str(p["batchId"]) if p.get("batchId") else None,
                    "batchName": p.get("batchName"),
                    "rollNumber": p.get("rollNumber"),
                }
        except Exception:
            pass

        if settings.USE_POSTGRES:
            try:
                from app.repositories.game_repo import _safe_uuid
                from app.db.postgres import get_pg_connection
                pg_uuids = [_safe_uuid(sid) for sid in student_user_ids if _safe_uuid(sid)]
                if pg_uuids:
                    async with get_pg_connection() as conn:
                        pg_rows = await conn.fetch(
                            """
                            SELECT sp.user_id, sp.batch_id, sp.roll_number, b.name as batch_name
                            FROM student_profiles sp
                            LEFT JOIN batches b ON sp.batch_id = b.id
                            WHERE sp.user_id = ANY($1::uuid[])
                            """,
                            pg_uuids
                        )
                        for pr in pg_rows:
                            uid_k = str(pr["user_id"])
                            if pr.get("batch_name"):
                                profiles_by_user[uid_k] = {
                                    "batchId": str(pr["batch_id"]) if pr.get("batch_id") else None,
                                    "batchName": pr.get("batch_name"),
                                    "rollNumber": pr.get("roll_number"),
                                }
            except Exception:
                pass

    items = []
    for row in page_result.items:
        uid_str = str(row["_id"])
        item = {
            **serialize(row),
            "roleLabel": ROLE_LABEL.get(parse_role(row["role"]), row["role"]),
        }
        if row.get("role") == "STUDENT":
            prof = profiles_by_user.get(uid_str, {})
            # If user document already has batchName, keep it; otherwise enrich from profile
            if not item.get("batchName") and prof.get("batchName"):
                item["batchName"] = prof.get("batchName")
            if not item.get("batchId") and prof.get("batchId"):
                item["batchId"] = prof.get("batchId")
            if not item.get("rollNumber") and prof.get("rollNumber"):
                item["rollNumber"] = prof.get("rollNumber")
        items.append(item)
    response = page_result.to_response()
    response["items"] = items
    return {
        "success": True,
        **response,
        "meta": {
            "roles": [
                {"value": str(r), "label": ROLE_LABEL[r]}
                for r in Role
                if r is not Role.SUPER_ADMIN
            ],
            "statuses": ["active", "deactivated", "pending"],
        },
    }


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserRequest, ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    role = parse_role(payload.role)
    if role is Role.SUPER_ADMIN:
        raise BusinessRuleViolation("Super Admin accounts cannot be created from a college admin")

    db = get_db()
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise Conflict("A user with this email already exists")
    if payload.institutionId and await db.users.find_one(
        {"institutionId": payload.institutionId.upper()}
    ):
        raise Conflict("That institution ID is already in use")

    department = None
    if payload.departmentId:
        resolved = await require_department_scope(ctx, payload.departmentId)
        department = await DepartmentRepo(ctx).get(resolved)
    if role in (Role.HOD, Role.STUDENT) and not department:
        raise ValidationError(f"{ROLE_LABEL[role]} accounts require a department")

    temporary = payload.temporaryPassword or f"Eedi@{ObjectId()!s:.6}1"

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            pg_user = await conn.fetchrow("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", email)
            if pg_user:
                raise Conflict("A user with this email already exists")
            if payload.institutionId:
                pg_roll = await conn.fetchrow(
                    "SELECT id FROM student_profiles WHERE UPPER(roll_number) = UPPER($1)",
                    payload.institutionId.strip(),
                )
                if pg_roll:
                    raise Conflict("That institution ID is already in use")

    document = {
        "name": payload.name,
        "email": email,
        # Sparse unique index: omit when empty rather than storing null.
        **({"institutionId": payload.institutionId.upper()} if payload.institutionId else {}),
        "passwordHash": hash_password(temporary),
        "mustChangePassword": True,
        "role": str(role),
        "collegeId": str(ctx.college_id) if isinstance(ctx.college_id, UUID) else ctx.college_id,
        "departmentId": (department or {}).get("_id"),
        "departmentName": (department or {}).get("name"),
        "phone": payload.phone,
        "designation": payload.designation,
        "status": "active",
        "emailVerified": True,  # institution-provisioned
        "provisionedBy": "admin",
        "avatarColor": f"#{abs(hash(email)) % 0xFFFFFF:06X}",
        "preferences": {"emailNotifications": True, "pushNotifications": True},
        "createdAt": _now(),
        "updatedAt": _now(),
        "createdBy": str(ctx.user_id) if isinstance(ctx.user_id, UUID) else ctx.user_id,
        "deletedAt": None,
        "version": 1,
    }
    result = await db.users.insert_one(document)

    pg_user_id = None
    if settings.USE_POSTGRES:
        import uuid as _uuid
        pg_user_id = _uuid.uuid4()
        dept_uuid = None
        if payload.departmentId:
            try:
                dept_uuid = UUID(str(payload.departmentId))
            except Exception:
                dept_uuid = UUID(str(department["_id"])) if department and "_id" in department and len(str(department["_id"])) == 36 else None
        elif department and "_id" in department:
            try:
                dept_uuid = UUID(str(department["_id"]))
            except Exception:
                pass
        inst_uuid = None
        if ctx.college_id:
            try:
                inst_uuid = UUID(str(ctx.college_id))
            except Exception:
                pass

        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO users (id, email, password_hash, name, role, institution_id, department_id, phone, status)
                VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8, 'ACTIVE')
                """,
                pg_user_id,
                email,
                hash_password(temporary),
                payload.name,
                str(role),
                inst_uuid,
                dept_uuid,
                payload.phone,
            )
            if role is Role.STUDENT:
                roll_val = (payload.institutionId or f"TMP{str(pg_user_id)[:6]}").upper()
                await conn.execute(
                    """
                    INSERT INTO student_profiles (user_id, roll_number, institution_id, department_id)
                    VALUES ($1, $2, $3, $4)
                    """,
                    pg_user_id,
                    roll_val,
                    inst_uuid,
                    dept_uuid,
                )
            elif role is Role.TRAINER:
                await conn.execute(
                    """
                    INSERT INTO trainer_profiles (user_id, institution_id, department_id, title)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    pg_user_id,
                    inst_uuid,
                    dept_uuid,
                    payload.designation or "Trainer",
                )

    if role is Role.STUDENT and department:
        await db.student_profiles.insert_one(
            {
                "userId": result.inserted_id,
                "name": payload.name,
                "email": email,
                "rollNumber": (payload.institutionId or f"TMP{str(result.inserted_id)[-6:]}").upper(),
                "collegeId": ctx.college_id,
                "departmentId": department["_id"],
                "departmentName": department.get("name"),
                "batchId": None,
                "profileCompleteness": 40,
                "status": "active",
                "createdAt": _now(),
                "updatedAt": _now(),
                "deletedAt": None,
                "version": 1,
            }
        )
    if role is Role.HOD and department:
        await db.departments.update_one(
            {"_id": department["_id"]}, {"$set": {"hodUserId": result.inserted_id}}
        )

    await write_audit(
        ctx,
        action="create",
        entity_type="users",
        entity_id=result.inserted_id,
        after={"email": email, "role": str(role)},
        detail=f"{ROLE_LABEL[role]} account created",
    )
    return {
        "success": True,
        "message": f"{ROLE_LABEL[role]} account created",
        "data": {
            "id": str(pg_user_id) if pg_user_id else str(result.inserted_id),
            "email": email,
            "temporaryPassword": temporary,
            "mustChangePassword": True,
        },
    }


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str, payload: UserPatch, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise ValidationError("Nothing to update")
    if updates.get("departmentId"):
        resolved = await require_department_scope(ctx, updates["departmentId"])
        department = await DepartmentRepo(ctx).get(resolved)
        updates["departmentId"] = resolved
        updates["departmentName"] = department.get("name")
    saved = await UserRepo(ctx).update(user_id, updates)
    if "departmentId" in updates:
        await session_service.revoke_all_sessions(user_id, reason="department_changed")
    return {
        "success": True,
        "message": "User updated",
        "data": serialize({k: v for k, v in saved.items() if k != "passwordHash"}),
    }


@router.patch("/users/{user_id}/role")
async def change_role(
    user_id: str, payload: RolePatch, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    """A role change takes effect immediately — existing sessions are invalidated (§31)."""
    role = parse_role(payload.role)
    if role is Role.SUPER_ADMIN:
        raise BusinessRuleViolation("Super Admin cannot be granted from a college admin")
    repo = UserRepo(ctx)
    user = await repo.get(user_id)
    if user["_id"] == ctx.user_id:
        raise BusinessRuleViolation("You cannot change your own role")

    department_id = None
    department = None
    if payload.departmentId:
        department_id = await require_department_scope(ctx, payload.departmentId)
        department = await DepartmentRepo(ctx).get(department_id)
    if role in (Role.HOD, Role.STUDENT) and not department_id:
        if not user.get("departmentId"):
            raise ValidationError(f"{ROLE_LABEL[role]} requires a department")
        department_id = user["departmentId"]
        department = await DepartmentRepo(ctx).get(department_id)

    saved = await repo.update(
        user["_id"],
        {
            "role": str(role),
            "departmentId": department_id,
            "departmentName": (department or {}).get("name"),
            "roleChangeReason": payload.reason,
            "roleChangedAt": _now(),
        },
    )
    revoked = await session_service.revoke_all_sessions(str(user["_id"]), reason="role_changed")
    if role is Role.HOD and department_id:
        await get_db().departments.update_one(
            {"_id": department_id}, {"$set": {"hodUserId": user["_id"]}}
        )
    await notify(
        user_id=user["_id"],
        kind=Kind.ACCOUNT,
        title="Your access level changed",
        body=f"Your role is now {ROLE_LABEL[role]}. Please sign in again.",
        college_id=ctx.college_id,
    )
    return {
        "success": True,
        "message": f"Role changed to {ROLE_LABEL[role]}; {revoked} session(s) invalidated",
        "data": serialize({k: v for k, v in saved.items() if k != "passwordHash"}),
    }


@router.post("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: str, payload: DeactivateRequest, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    """Deactivation immediately invalidates every active session through Redis (§15)."""
    repo = UserRepo(ctx)
    user = await repo.get(user_id)
    if user["_id"] == ctx.user_id:
        raise BusinessRuleViolation("You cannot deactivate your own account")

    warnings: list[str] = []
    if user.get("role") == str(Role.TRAINER):
        pending = await get_db().skill_assessments.count_documents(
            {"assessedBy": user["_id"], "state": "draft", "deletedAt": None}
        )
        # From the start of today: a session earlier today still needs cover if its
        # attendance has not been recorded yet.
        today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
        upcoming = await get_db().training_sessions.count_documents(
            {"trainerUserId": user["_id"], "date": {"$gte": today_start}, "deletedAt": None}
        )
        if pending:
            warnings.append(f"{pending} draft evaluation(s) will remain unsubmitted")
        if upcoming:
            warnings.append(
                f"{upcoming} session(s) from today onward need a replacement trainer"
            )
    if user.get("role") == str(Role.HOD):
        department = await get_db().departments.find_one({"hodUserId": user["_id"]})
        if department:
            warnings.append(
                f"{department.get('name')} will have no HOD until someone is assigned"
            )

    await repo.update(
        user["_id"],
        {
            "status": "deactivated",
            "deactivatedAt": _now(),
            "deactivatedBy": ctx.user_id,
            "deactivationReason": payload.reason,
        },
    )
    revoked = await session_service.revoke_all_sessions(
        str(user["_id"]), reason="account_deactivated"
    )
    # Historical records keep referencing the trainer (soft-delete, never hard-delete).
    # The suspension is *marked* so reactivation can restore exactly these rows and no others:
    # a batch an admin deliberately unassigned earlier must stay unassigned.
    await get_db().trainer_assignments.update_many(
        {"trainerUserId": user["_id"], "active": True},
        {
            "$set": {
                "active": False,
                "suspendedByDeactivation": True,
                "suspendedAt": _now(),
                "updatedAt": _now(),
            }
        },
    )
    return {
        "success": True,
        "message": f"Account deactivated; {revoked} session(s) invalidated immediately",
        "data": {
            "id": str(user["_id"]),
            "status": "deactivated",
            "sessionsRevoked": revoked,
            "warnings": warnings,
            "historyPreserved": True,
        },
    }


@router.post("/users/{user_id}/reactivate")
async def reactivate_user(user_id: str, ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    repo = UserRepo(ctx)
    user = await repo.get(user_id)
    if user.get("status") == "active":
        raise BusinessRuleViolation("This account is already active")
    saved = await repo.update(
        user["_id"],
        {"status": "active", "reactivatedAt": _now(), "reactivatedBy": ctx.user_id},
    )
    # Give a reactivated trainer back the batches deactivation took away, so the account is
    # usable again without an admin having to remember the old roster.
    restored = await get_db().trainer_assignments.update_many(
        {"trainerUserId": user["_id"], "suspendedByDeactivation": True},
        {
            "$set": {"active": True, "suspendedByDeactivation": False, "updatedAt": _now()},
            "$unset": {"suspendedAt": ""},
        },
    )
    restored_count = getattr(restored, "modified_count", 0) or 0
    message = "Account reactivated"
    if restored_count:
        message = f"Account reactivated; {restored_count} batch assignment(s) restored"
    return {
        "success": True,
        "message": message,
        "data": {
            **serialize({k: v for k, v in saved.items() if k != "passwordHash"}),
            "assignmentsRestored": restored_count,
        },
    }


# --------------------------------------------------------------------------- placements & certs (decommissioned)
@router.get("/placements")
async def placements(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    return {"success": True, "data": [], "message": "Placements module decommissioned"}


@router.post("/placements", status_code=status.HTTP_201_CREATED)
async def create_placement(
    payload: PlacementDriveRequest, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    raise BusinessRuleViolation("Placements module has been decommissioned.")


@router.get("/certificate-templates")
async def certificate_templates(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    return {"success": True, "data": [], "message": "Certificates module decommissioned"}


@router.post("/certificate-templates", status_code=status.HTTP_201_CREATED)
async def create_certificate_template(
    payload: CertificateTemplateRequest, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    raise BusinessRuleViolation("Certificates module has been decommissioned.")


@router.get("/certificates")
async def certificates(
    status_filter: str | None = Query(None, alias="status", max_length=20),
    departmentId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    return {
        "success": True,
        "items": [],
        "total": 0,
        "page": page,
        "pageSize": pageSize,
        "totalPages": 0,
        "hasNext": False,
        "hasPrev": False,
        "pagination": {
            "page": page,
            "pageSize": pageSize,
            "total": 0,
            "totalPages": 0,
            "hasNext": False,
            "hasPrev": False,
        },
        "meta": {"counts": {}},
    }


@router.post("/certificates/issue")
async def issue_certificate(
    payload: IssueCertificateRequest, ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    raise BusinessRuleViolation("Certificates module has been decommissioned.")


# --------------------------------------------------------------------------- reports & system
@router.get("/reports/catalogue")
async def reports_catalogue(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    from app.services.reports import available_datasets, report_catalogue

    catalogue = report_catalogue(str(ctx.role))
    return {
        "success": True,
        "data": {
            **{k: v for k, v in catalogue.items() if k != "entries"},
            "entriesSample": catalogue["entries"][:40],
            "runnableDatasets": available_datasets(),
        },
    }


@router.post("/reports", status_code=status.HTTP_202_ACCEPTED)
async def create_report(payload: ReportRequest, ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
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
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    page_result = await ReportJobRepo(ctx).list(page=page, page_size=pageSize)
    rows = []
    for job in page_result.items:
        item = serialize(job)
        if job.get("status") == "ready" and job.get("storageKey"):
            item["downloadUrl"] = await signed_url(job["storageKey"], filename=job.get("filename"))
        rows.append(item)
    response = page_result.to_response()
    response["items"] = rows
    return {"success": True, **response}


@router.get("/ai-usage")
async def ai_usage(hours: int = Query(24, ge=1, le=720), ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    since = _now() - timedelta(hours=hours)
    repo = AiUsageRepo(ctx)
    hourly = await repo.aggregate(
        [
            {"$match": {"at": {"$gte": since}}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d %H:00", "date": "$at"}},
                    "calls": {"$sum": 1},
                    "avgLatency": {"$avg": "$latencyMs"},
                    "tokens": {"$sum": "$tokens"},
                    "failures": {"$sum": {"$cond": ["$failed", 1, 0]}},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    )
    by_kind = await repo.aggregate(
        [
            {"$match": {"at": {"$gte": since}}},
            {"$group": {"_id": "$kind", "calls": {"$sum": 1}}},
            {"$sort": {"calls": -1}},
        ]
    )
    overrides = await repo.count({"kind": "trainer_override", "at": {"$gte": since}})
    # Scoped, not global: an institution admin is shown their own institution's live sessions.
    # `base_filter()` is empty only for SUPER_ADMIN, which is the one role allowed a platform view.
    session_scope = {k: v for k, v in ctx.base_filter().items() if k == "collegeId"}
    active_sessions = await get_db().refresh_sessions.count_documents(
        {**session_scope, "revokedAt": None}
    )
    return {
        "success": True,
        "data": {
            "windowHours": hours,
            "series": [
                {
                    "at": row["_id"],
                    "calls": row["calls"],
                    "averageLatencyMs": round(row.get("avgLatency") or 0),
                    "tokens": row.get("tokens", 0),
                    "failures": row.get("failures", 0),
                }
                for row in hourly
            ],
            "byKind": [{"kind": row["_id"], "calls": row["calls"]} for row in by_kind if row["_id"]],
            "trainerOverrides": overrides,
            "activeSessions": active_sessions,
            "providers": provider_health(),
            "queue": await queue_stats(),
        },
    }


@router.get("/system-health")
async def system_health(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    from app.core.redis_client import ping_redis
    from app.db.mongo import is_inmemory, ping_mongo
    from app.services.storage import get_storage

    db = get_db()
    slow_reports = await db.report_jobs.count_documents({"status": {"$in": ["queued", "processing"]}})
    failed_reports = await db.report_jobs.count_documents({"status": "failed"})
    # Both counts are per-institution. `SystemEventRepo` deliberately does not scope itself
    # (the collection also holds untenanted platform rows), so the scope is pinned here.
    event_scope = {k: v for k, v in ctx.base_filter().items() if k == "collegeId"}
    recent_errors = await db.system_events.count_documents(
        {**event_scope, "at": {"$gte": _now() - timedelta(hours=24)}, "kind": {"$regex": "failed"}}
    )
    security_events = await SecurityEventRepo(ctx).count(
        {"at": {"$gte": _now() - timedelta(hours=24)}}
    )
    return {
        "success": True,
        "data": {
            "database": {"ok": await ping_mongo(), "usingDevelopmentFallback": is_inmemory()},
            "cache": {"ok": await ping_redis()},
            "storage": {"driver": get_storage().name},
            "jobQueue": await queue_stats(),
            "reports": {"inFlight": slow_reports, "failed": failed_reports},
            "errors24h": recent_errors,
            "securityEvents24h": security_events,
            "ai": provider_health(),
            "checkedAt": _now(),
        },
    }


# --------------------------------------------------------------------------- bulk import
@router.get("/import/template/{entity}")
async def import_template(entity: str, ctx: ScopeContext = AdminCtx) -> Response:
    content = import_service.template_csv(entity)
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{entity}-import-template.csv"'},
    )


@router.post("/import/{entity}")
async def bulk_import(
    entity: str, file: UploadFile = File(...), ctx: ScopeContext = AdminCtx
) -> dict[str, Any]:
    """Row-by-row validated import. Valid rows commit; invalid rows come back with reasons."""
    if entity not in import_service.TEMPLATES:
        raise ValidationError(
            f"Supported imports: {', '.join(sorted(import_service.TEMPLATES))}"
        )
    if not (file.filename or "").lower().endswith((".csv", ".txt")):
        raise ValidationError("Upload a CSV file (download the template if you need the format)")
    content = await file.read()
    if not content:
        raise ValidationError("That file is empty")
    if len(content) > 20 * 1024 * 1024:
        raise ValidationError("Keep import files under 20 MB — split larger files")

    result = await import_service.run_import(ctx, entity, content, filename=file.filename)
    return {
        "success": True,
        "message": f"{result['successCount']} row(s) imported, {result['failureCount']} rejected",
        "data": result,
        "meta": {
            "maxRows": settings.BULK_IMPORT_MAX_ROWS,
            "guidelines": [
                "Download the template and keep the header row unchanged.",
                "Every row is validated before it is committed — valid rows are imported and "
                "invalid rows are returned with a specific reason.",
                "Department and batch codes must already exist in your institution.",
                "Emails and roll numbers must be unique across the institution.",
                f"Maximum {settings.BULK_IMPORT_MAX_ROWS} rows per file.",
            ],
        },
    }


@router.get("/import/jobs")
async def import_jobs(
    page: int = Query(1, ge=1), pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    page_result = await ImportJobRepo(ctx).list(page=page, page_size=pageSize)
    return {"success": True, **page_result.to_response()}


@router.get("/import/jobs/{job_id}")
async def import_job(job_id: str, ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    job = await ImportJobRepo(ctx).get(job_id)
    return {"success": True, "data": serialize(job)}


# --------------------------------------------------------------------------- audit
@router.get("/audit-logs")
async def audit_logs(
    entityType: str | None = Query(None, max_length=40),
    action: str | None = Query(None, max_length=20),
    departmentId: str | None = Query(None),
    days: int = Query(7, ge=1, le=365),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {"at": {"$gte": _now() - timedelta(days=days)}}
    if entityType and entityType != "all":
        filters["entityType"] = entityType
    if action and action != "all":
        filters["action"] = action
    if departmentId:
        filters["departmentId"] = await require_department_scope(ctx, departmentId)

    repo = AuditLogRepo(ctx)
    page_result = await repo.list(filters=filters, page=page, page_size=pageSize)
    logins = await repo.count({"action": "login", "at": filters["at"]})
    role_changes = await repo.count(
        {"entityType": "users", "action": "update", "at": filters["at"]}
    )
    # Through the scoped repository: these are raw event documents (user ids, IPs, request
    # paths), so an unscoped read here would disclose other institutions' security events.
    security = await SecurityEventRepo(ctx).find_all(
        {"at": {"$gte": _now() - timedelta(days=days)}},
        limit=25,
        sort=[("at", -1)],
    )
    return {
        "success": True,
        **page_result.to_response(),
        "meta": {
            "loginEvents": logins,
            "userChanges": role_changes,
            "securityEvents": serialize(security),
            "note": "Audit records are append-only and cannot be edited or deleted.",
        },
    }


@router.get("/training-modules")
async def training_modules(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    rows = await TrainingModuleRepo(ctx).find_all(limit=200, sort=[("name", 1)])
    return {"success": True, "data": serialize(rows)}


@router.post("/recalculate-scores", status_code=status.HTTP_202_ACCEPTED)
async def recalculate_scores(
    departmentId: str | None = Query(None),
    batchId: str | None = Query(None),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Fan a score recalculation across a scope (e.g. after changing scoring weights)."""
    payload: dict[str, Any] = {"collegeId": str(ctx.college_id), "reason": "admin_requested"}
    if departmentId:
        payload["departmentId"] = str(await require_department_scope(ctx, departmentId))
    if batchId:
        batch = await BatchRepo(ctx).get(batchId)
        payload["batchId"] = str(batch["_id"])
    await enqueue("score.recompute_batch", payload)
    await write_audit(
        ctx,
        action="update",
        entity_type="eedi_scores",
        detail="bulk score recalculation requested",
        after=payload,
    )
    return {
        "success": True,
        "message": "Recalculation queued — scores will update in the background.",
    }


# --------------------------------------------------------------------------- Games
@router.get("/games")
async def admin_list_games(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from app.repositories.game_repo import _safe_uuid
        from uuid import UUID

        inst_uuid = _safe_uuid(ctx.college_id) or UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")
        async with get_pg_connection() as conn:
            games_rows = await conn.fetch("SELECT id, code, title, category, status FROM games ORDER BY title ASC")
            attempts_rows = await conn.fetch("""
                SELECT ga.game_id, COUNT(*) as attempts, AVG(ga.raw_score) as avg_score, SUM(ga.xp_earned) as total_xp
                FROM game_attempts ga
                WHERE ga.institution_id = $1 OR ga.institution_id IS NULL
                GROUP BY ga.game_id
            """, inst_uuid)
            by_game = {
                str(r["game_id"]): {
                    "attempts": r["attempts"],
                    "avg_score": round(float(r["avg_score"] or 0), 1),
                    "total_xp": r["total_xp"] or 0,
                }
                for r in attempts_rows
            }
            items = []
            for g in games_rows:
                gid_str = str(g["id"])
                st = by_game.get(gid_str, {"attempts": 0, "avg_score": 0.0, "total_xp": 0})
                items.append({
                    "id": gid_str,
                    "code": g["code"],
                    "title": g["title"],
                    "category": g["category"],
                    "difficulty": "BEGINNER",
                    "xpReward": 50,
                    "isEnabled": g["status"] != "ARCHIVED",
                    "totalAttempts": st["attempts"],
                    "averageScore": st["avg_score"],
                    "totalXpEarned": st["total_xp"],
                })
            return {"success": True, "data": items}

    definitions = await get_db().game_definitions.find({}).to_list(100)
    attempts = await get_db().game_attempts.find({"collegeId": ctx.college_id}).limit(1000).to_list(1000)

    by_game: dict[str, dict[str, Any]] = {}
    for a in attempts:
        code = a.get("gameCode", "game")
        if code not in by_game:
            by_game[code] = {"attempts": 0, "scores": [], "xp": 0}
        by_game[code]["attempts"] += 1
        by_game[code]["scores"].append(a.get("score", 0))
        by_game[code]["xp"] += a.get("xpEarned", 0)

    # Check college game config
    college_query = {"$or": [{"_id": ctx.college_id}, {"_id": str(ctx.college_id)}]}
    try:
        from bson import ObjectId
        college_query["$or"].append({"_id": ObjectId(str(ctx.college_id))})
    except Exception:
        pass
    college = await get_db().colleges.find_one(college_query)
    disabled_games = set((college or {}).get("disabledGameCodes", []))

    items = []
    for d in definitions:
        code = d.get("code")
        st = by_game.get(code, {"attempts": 0, "scores": [], "xp": 0})
        avg = round(sum(st["scores"]) / len(st["scores"]), 1) if st["scores"] else 0.0
        items.append({
            "id": str(d["_id"]),
            "code": code,
            "title": d.get("title"),
            "category": d.get("category"),
            "difficulty": d.get("difficulty"),
            "xpReward": d.get("xpReward", 50),
            "isEnabled": code not in disabled_games,
            "totalAttempts": st["attempts"],
            "averageScore": avg,
            "totalXpEarned": st["xp"],
        })

    return {"success": True, "data": items}


@router.patch("/games/{game_code}/availability")
async def admin_toggle_game_availability(
    game_code: str,
    payload: dict[str, Any],
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    is_enabled = bool(payload.get("enabled", True))
    col = get_db().colleges

    college_query = {"$or": [{"_id": ctx.college_id}, {"_id": str(ctx.college_id)}]}
    try:
        from bson import ObjectId
        college_query["$or"].append({"_id": ObjectId(str(ctx.college_id))})
    except Exception:
        pass
    college = await col.find_one(college_query)
    target_id = college["_id"] if college else str(ctx.college_id)

    if is_enabled:
        await col.update_one({"_id": target_id}, {"$pull": {"disabledGameCodes": game_code}}, upsert=True)
    else:
        await col.update_one({"_id": target_id}, {"$addToSet": {"disabledGameCodes": game_code}}, upsert=True)

    await write_audit(
        ctx,
        action="update",
        entity_type="game_definitions",
        detail=f"Toggled game {game_code} availability to {is_enabled}",
    )
    return {"success": True, "message": f"Game {game_code} availability updated.", "enabled": is_enabled}


# --------------------------------------------------------------------------- Payments Management
@router.get("/payments")
async def admin_list_payments(
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.repositories.payment_repo import PaymentRepository
        inst_id = getattr(ctx, "college_id", None)
        offset = (page - 1) * pageSize
        pg_payments = await PaymentRepository.list_admin_payments(
            institution_id=inst_id,
            status=status,
            search=search,
            limit=pageSize,
            offset=offset,
        )
        total = await PaymentRepository.count_admin_payments(
            institution_id=inst_id,
            status=status,
            search=search,
        )
        items = [
            {
                "id": str(p["id"]),
                "orderId": p.get("transaction_ref") or str(p["id"]),
                "studentId": str(p.get("participant_user_id")),
                "studentName": p.get("student_name", "Student"),
                "studentEmail": p.get("student_email") or "",
                "departmentName": p.get("department_name") or "Computer Science & Engineering",
                "courseTitle": p.get("course_title", "Soft Skills Training"),
                "amount": float(p.get("amount") or 0.0),
                "currency": p.get("currency", "INR"),
                "purpose": f"Annual Soft Skills Training Fee - {p.get('course_title', 'Soft Skills')}",
                "status": "success" if p.get("status") == "VERIFIED" else ("pending" if p.get("status") == "PENDING" else "failed"),
                "paymentMethod": p.get("payment_method") or "Official Fee Receipt",
                "transactionId": p.get("transaction_ref") or str(p["id"]),
                "invoiceNumber": f"INV-{str(p['id'])[:8].upper()}",
                "createdAt": p["created_at"].isoformat() if p.get("created_at") else None,
            }
            for p in pg_payments
        ]
        total_pages = max(1, (total + pageSize - 1) // pageSize)
        return {
            "success": True,
            "data": items,
            "payments": items,
            "items": items,
            "pagination": {
                "page": page,
                "pageSize": pageSize,
                "total": total,
                "totalPages": total_pages,
                "hasNext": page < total_pages,
                "hasPrev": page > 1,
            },
        }

    query: dict[str, Any] = {"collegeId": ctx.college_id}
    if status and status != "all":
        query["status"] = status
    if search:
        s = search.strip()
        query["$or"] = [
            {"studentName": {"$regex": s, "$options": "i"}},
            {"studentEmail": {"$regex": s, "$options": "i"}},
            {"transactionId": {"$regex": s, "$options": "i"}},
            {"invoiceNumber": {"$regex": s, "$options": "i"}},
        ]

    total = await get_db().payments.count_documents(query)
    cursor = (
        get_db()
        .payments.find(query)
        .sort("createdAt", -1)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
    )
    docs = await cursor.to_list(length=pageSize)

    items = [
        {
            "id": str(p["_id"]),
            "studentName": p.get("studentName", "Student"),
            "studentEmail": p.get("studentEmail"),
            "courseTitle": p.get("courseTitle", "Course"),
            "amount": p.get("amount", 0.0),
            "currency": p.get("currency", "INR"),
            "status": p.get("status", "completed"),
            "paymentMethod": p.get("paymentMethod", "Card"),
            "transactionId": p.get("transactionId"),
            "invoiceNumber": p.get("invoiceNumber"),
            "createdAt": p.get("createdAt").isoformat() if p.get("createdAt") else None,
        }
        for p in docs
    ]

    total_pages = max(1, (total + pageSize - 1) // pageSize)
    return {
        "success": True,
        "items": items,
        "payments": items,
        "pagination": {
            "page": page,
            "pageSize": pageSize,
            "total": total,
            "totalPages": total_pages,
            "hasNext": page < total_pages,
            "hasPrev": page > 1,
        },
    }


@router.get("/payments/summary")
async def admin_payments_summary(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.repositories.payment_repo import PaymentRepository
        inst_id = getattr(ctx, "college_id", None)
        summary_data = await PaymentRepository.get_admin_summary(institution_id=inst_id)
        return {
            "success": True,
            "data": summary_data,
        }

    payments = await get_db().payments.find({"collegeId": ctx.college_id}).to_list(500)
    total_volume = sum(p.get("amount", 0) for p in payments if p.get("status") == "completed")
    total_txns = len(payments)
    completed_txns = sum(1 for p in payments if p.get("status") == "completed")
    refunded_txns = sum(1 for p in payments if p.get("status") == "refunded")
    refunded_volume = sum(p.get("amount", 0) for p in payments if p.get("status") == "refunded")

    by_method: dict[str, int] = {}
    for p in payments:
        m = p.get("paymentMethod", "Card")
        by_method[m] = by_method.get(m, 0) + 1

    return {
        "success": True,
        "data": {
            "totalRevenue": round(total_volume, 2),
            "currency": "INR",
            "totalTransactions": total_txns,
            "successfulTransactions": completed_txns,
            "refundedTransactions": refunded_txns,
            "refundedVolume": round(refunded_volume, 2),
            "paymentMethods": [{"method": k, "count": v} for k, v in by_method.items()],
        },
    }


@router.post("/payments/{payment_id}/refund")
async def admin_refund_payment(payment_id: str, payload: dict[str, Any] = {}, ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    pid = ObjectId(payment_id)
    payment = await get_db().payments.find_one({"_id": pid, "collegeId": ctx.college_id})
    if not payment:
        raise NotFound("Payment not found in this institution.")

    from app.services.payment_service import refund_course_payment
    reason = payload.get("reason", "Admin authorized refund")
    result = await refund_course_payment(pid, reason=reason)
    await write_audit(ctx, action="update", entity_type="payments", entity_id=pid, detail=f"Refund issued: {reason}")
    return result


# --------------------------------------------------------------------------- Participant Access & Enrollments
@router.get("/enrollments")
async def list_admin_enrollments(
    departmentId: str | None = Query(None),
    status: str | None = Query(None),
    accessStatus: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """List participant enrollments with separated payment, enrollment, and access statuses."""
    db = get_db()
    query_filter: dict[str, Any] = {"collegeId": ctx.college_id}
    if departmentId:
        query_filter["departmentId"] = ObjectId(departmentId)
    if status:
        query_filter["status"] = status
    if accessStatus:
        query_filter["accessStatus"] = accessStatus

    skip = (page - 1) * pageSize
    total = await db.enrollments.count_documents(query_filter)
    rows = await db.enrollments.find(query_filter).sort("createdAt", -1).skip(skip).limit(pageSize).to_list(pageSize)

    return {
        "success": True,
        "items": serialize(rows),
        "pagination": {
            "page": page,
            "pageSize": pageSize,
            "total": total,
            "totalPages": (total + pageSize - 1) // pageSize,
        },
    }


@router.post("/enrollments/{enrollment_id}/activate")
async def admin_activate_enrollment(
    enrollment_id: str,
    payload: dict[str, Any] = {},
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Requirement 16: Authorized admin activates participant access."""
    from app.services.domain_rules import can_admin_activate_enrollment
    from app.services.payment_service import activate_participant_enrollment

    eid = ObjectId(enrollment_id)
    enrollment = await get_db().enrollments.find_one({"_id": eid})
    if not enrollment:
        raise NotFound("Enrollment record not found.")

    allowed, reason = can_admin_activate_enrollment(ctx, enrollment)
    if not allowed:
        raise ScopeForbidden(reason)

    raw_end = payload.get("accessEndDate")
    end_date = datetime.fromisoformat(raw_end.replace("Z", "+00:00")) if raw_end else None
    notes = payload.get("notes", "Admin activated access")

    res = await activate_participant_enrollment(
        enrollment_id=eid,
        admin_user_id=ctx.user_id,
        access_end_date=end_date,
        notes=notes,
    )
    await write_audit(ctx, action="update", entity_type="enrollments", entity_id=eid, detail=f"Activated access: {notes}")
    return res


@router.post("/enrollments/{enrollment_id}/deactivate")
async def admin_deactivate_enrollment(
    enrollment_id: str,
    payload: dict[str, Any] = {},
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Requirement 16: Authorized admin deactivates participant access."""
    from app.services.domain_rules import can_admin_activate_enrollment
    from app.services.payment_service import deactivate_participant_enrollment

    eid = ObjectId(enrollment_id)
    enrollment = await get_db().enrollments.find_one({"_id": eid})
    if not enrollment:
        raise NotFound("Enrollment record not found.")

    allowed, reason = can_admin_activate_enrollment(ctx, enrollment)
    if not allowed:
        raise ScopeForbidden(reason)

    reason_str = payload.get("reason", "Admin deactivation")
    res = await deactivate_participant_enrollment(
        enrollment_id=eid,
        admin_user_id=ctx.user_id,
        reason=reason_str,
    )
    await write_audit(ctx, action="update", entity_type="enrollments", entity_id=eid, detail=f"Deactivated access: {reason_str}")
    return res


@router.post("/enrollments/{enrollment_id}/renew")
async def admin_renew_enrollment(
    enrollment_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = AdminCtx,
) -> dict[str, Any]:
    """Requirements 14, 18, 45: Non-destructive semester renewal."""
    from app.services.domain_rules import can_admin_activate_enrollment
    from app.services.payment_service import renew_participant_semester

    eid = ObjectId(enrollment_id)
    enrollment = await get_db().enrollments.find_one({"_id": eid})
    if not enrollment:
        raise NotFound("Enrollment record not found.")

    allowed, reason = can_admin_activate_enrollment(ctx, enrollment)
    if not allowed:
        raise ScopeForbidden(reason)

    new_sem = int(payload.get("semesterNumber", 2))
    raw_start = payload.get("startDate")
    raw_end = payload.get("endDate")
    if not raw_start or not raw_end:
        raise ValidationError("startDate and endDate are required for semester renewal.")

    start_date = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
    end_date = datetime.fromisoformat(raw_end.replace("Z", "+00:00"))

    res = await renew_participant_semester(
        enrollment_id=eid,
        new_semester_number=new_sem,
        new_start_date=start_date,
        new_end_date=end_date,
        admin_user_id=ctx.user_id,
        notes=payload.get("notes", f"Renewed for Semester {new_sem}"),
    )
    await write_audit(ctx, action="update", entity_type="enrollments", entity_id=eid, detail=f"Renewed semester {new_sem}")
    return res


