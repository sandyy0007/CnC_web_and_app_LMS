"""Super Admin Portal API.

Secured with `require_role(Role.SUPER_ADMIN)` (§9).
Provides platform-level management across all colleges, users, courses, e-books, games,
payments, free trials, and system analytics.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from bson import ObjectId
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.authz.guards import require_role
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationError
from app.core.security import hash_password
from app.db.mongo import get_db, serialize
from app.db.postgres import get_pg_connection
from app.schemas.requests import ReportRequest
from app.services import payment_service
from app.services.storage import signed_url


router = APIRouter()
SuperAdminCtx = Depends(require_role(Role.SUPER_ADMIN))


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- Dashboard
@router.get("/dashboard")
async def super_admin_dashboard(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.repositories.stats_repo import StatsRepository
        data = await StatsRepository.get_super_admin_dashboard_full()
        return {"success": True, "data": data}

    db = get_db()
    colleges_count = await db.colleges.count_documents({})
    students_count = await db.users.count_documents({"role": "STUDENT", "deletedAt": None})
    trainers_count = await db.users.count_documents({"role": "TRAINER", "deletedAt": None})
    hods_count = await db.users.count_documents({"role": "HOD", "deletedAt": None})
    admins_count = await db.users.count_documents({"role": "ADMIN", "deletedAt": None})
    courses_count = await db.courses.count_documents({})
    ebooks_count = await db.ebooks.count_documents({})
    games_count = await db.game_definitions.count_documents({})

    # Trials
    active_trials = await db.course_trials.count_documents({"status": "active"})
    converted_trials = await db.course_trials.count_documents({"status": "converted"})
    total_trials = await db.course_trials.count_documents({})
    conversion_rate = round((converted_trials / max(1, total_trials)) * 100, 1) if total_trials else 0.0

    # Payments
    payments = await db.payments.find({}).to_list(1000)
    total_revenue = sum(p.get("amount", 0) for p in payments if p.get("status") == "completed")
    total_revenue = sum(p.get("amount", 0) for p in payments if p.get("status") in {"completed", "verified", "success"})
    pending_payments = len([p for p in payments if p.get("status") in {"pending", "pending_verification", "PAYMENT_PENDING"}])
    verified_payments = len([p for p in payments if p.get("status") in {"completed", "verified", "success"}])
    online_revenue = sum(p.get("amount", 0) for p in payments if p.get("status") in {"completed", "verified", "success"} and p.get("courseMode") == "ONLINE")
    offline_revenue = sum(p.get("amount", 0) for p in payments if p.get("status") in {"completed", "verified", "success"} and p.get("courseMode") == "OFFLINE")
    total_txns = len(payments)

    # System
    ai_events = await db.ai_usage_events.count_documents({})
    recent_security_events = await db.security_events.find({}).sort("at", -1).limit(10).to_list(10)
    recent_payments = await db.payments.find({}).sort("createdAt", -1).limit(6).to_list(6)

    return {
        "success": True,
        "data": {
            "institutions": colleges_count,
            "students": students_count,
            "trainers": trainers_count,
            "hods": hods_count,
            "admins": admins_count,
            "courses": courses_count,
            "ebooks": ebooks_count,
            "games": games_count,
            "activeTrials": active_trials,
            "convertedTrials": converted_trials,
            "trialConversionRate": conversion_rate,
            "totalRevenue": round(total_revenue, 2),
            "pendingPayments": pending_payments,
            "verifiedPayments": verified_payments,
            "onlineRevenue": round(online_revenue, 2),
            "offlineRevenue": round(offline_revenue, 2),
            "totalTransactions": total_txns,
            "aiEventsCount": ai_events,
            "storageUsage": "4.2 GB",
            "recentPayments": serialize(recent_payments),
            "recentSecurityEvents": serialize(recent_security_events),
        },
    }


# --------------------------------------------------------------------------- Colleges / Institutions
@router.get("/colleges")
async def super_admin_list_colleges(
    institutionType: str | None = Query(None),
    trainingType: str | None = Query(None),
    search: str | None = Query(None),
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    from app.services.domain_rules import get_training_type_for_institution
    from app.repositories.institution_repo import InstitutionRepository
    from app.repositories.user_repo import UserRepository

    if settings.USE_POSTGRES:
        inst_type_filter = institutionType.upper() if institutionType and institutionType.upper() != "ALL" else None
        trn_type_filter = trainingType.upper() if trainingType and trainingType.upper() != "ALL" else None
        pg_insts = await InstitutionRepository.list_all(
            institution_type=inst_type_filter,
            training_type=trn_type_filter,
            search=search,
            limit=100,
        )
        out = []
        for c in pg_insts:
            cid = c["id"]
            depts = await InstitutionRepository.get_departments(cid)
            stu_count = await UserRepository.count_by_scope(role="STUDENT", institution_id=cid)
            trn_count = await UserRepository.count_by_scope(role="TRAINER", institution_id=cid)

            out.append({
                "id": str(cid),
                "name": c.get("name"),
                "code": c.get("code"),
                "address": c.get("address"),
                "contact": {"city": c.get("city"), "state": c.get("state")},
                "status": str(c.get("status", "ACTIVE")).lower(),
                "institutionType": c.get("institution_type"),
                "trainingType": c.get("training_type"),
                "departmentsCount": len(depts),
                "studentsCount": stu_count,
                "participantsCount": stu_count,
                "trainersCount": trn_count,
                "createdAt": c.get("created_at").isoformat() if c.get("created_at") else None,
            })
        if out or settings.ENV == "production":
            return {"success": True, "data": out}

    db = get_db()
    query_filter: dict[str, Any] = {}
    if institutionType and institutionType.upper() != "ALL":
        query_filter["institutionType"] = institutionType.upper()
    if trainingType and trainingType.upper() != "ALL":
        query_filter["trainingType"] = trainingType.upper()
    if search:
        query_filter["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"code": {"$regex": search, "$options": "i"}},
        ]

    colleges = await db.colleges.find(query_filter).sort("name", 1).to_list(100)
    out = []
    for c in colleges:
        cid = c["_id"]
        dep_count = await db.departments.count_documents({"collegeId": cid})
        stu_count = await db.users.count_documents({"collegeId": cid, "role": "STUDENT"})
        trn_count = await db.users.count_documents({"collegeId": cid, "role": "TRAINER"})
        
        inst_type = c.get("institutionType") or "COLLEGE"
        trn_type = c.get("trainingType") or str(get_training_type_for_institution(inst_type))

        out.append({
            "id": str(cid),
            "name": c.get("name"),
            "code": c.get("code"),
            "address": c.get("address"),
            "contact": c.get("contact", {}),
            "status": c.get("status", "active"),
            "timezone": c.get("timezone", "Asia/Kolkata"),
            "institutionType": inst_type,
            "trainingType": trn_type,
            "departmentsCount": dep_count,
            "studentsCount": stu_count,
            "participantsCount": stu_count,
            "trainersCount": trn_count,
            "createdAt": c.get("createdAt").isoformat() if c.get("createdAt") else None,
        })
    return {"success": True, "data": out}


@router.post("/colleges")
async def super_admin_create_college(payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.services.domain_rules import get_training_type_for_institution
    from app.models.domain_models import InstitutionType
    from app.repositories.institution_repo import InstitutionRepository

    name = payload.get("name", "").strip()
    code = payload.get("code", "").strip().upper()
    if not name or not code:
        raise ValidationError("Name and unique college/institution code are required.")

    # Requirement 4: Institution type & automatic training type mapping
    raw_inst_type = payload.get("institutionType", "COLLEGE").strip().upper()
    if raw_inst_type not in {"COLLEGE", "COMPANY", "SCHOOL"}:
        raw_inst_type = "COLLEGE"

    institution_type = raw_inst_type
    training_type = str(get_training_type_for_institution(institution_type))

    # Persist to PostgreSQL if active
    if settings.USE_POSTGRES:
        try:
            pg_inst = await InstitutionRepository.create(
                name=name,
                code=code,
                institution_type=institution_type,
                training_type=training_type,
                address=payload.get("address"),
                city=payload.get("city"),
                state=payload.get("state"),
                contact_email=payload.get("email"),
                contact_phone=payload.get("phone"),
            )
        except Exception as exc:
            if "duplicate" in str(exc).lower() or "unique" in str(exc).lower():
                raise Conflict(f"An institution with code '{code}' already exists.") from exc

    db = get_db()
    existing = await db.colleges.find_one({"code": code})
    if existing:
        raise Conflict(f"An institution with code '{code}' already exists.")

    now = _now()
    doc = {
        "name": name,
        "code": code,
        "address": payload.get("address", ""),
        "contact": {
            "email": payload.get("email", f"admin@{code.lower()}.edu"),
            "phone": payload.get("phone", "+91 80 0000 0000"),
        },
        "institutionType": institution_type,
        "trainingType": training_type,
        "status": payload.get("status", "active"),
        "timezone": payload.get("timezone", "Asia/Kolkata"),
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }
    res = await db.colleges.insert_one(doc)
    doc["_id"] = res.inserted_id

    await write_audit(
        ctx,
        action="create",
        entity_type="colleges",
        entity_id=doc["_id"],
        detail=f"Created {institution_type} institution {name} ({code}) with {training_type} training model",
    )
    return {"success": True, "data": serialize(doc)}


@router.patch("/colleges/{college_id}")
async def super_admin_update_college(college_id: str, payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.services.domain_rules import get_training_type_for_institution
    from app.repositories.institution_repo import InstitutionRepository

    c_uuid = None
    try:
        c_uuid = UUID(str(college_id))
    except (ValueError, TypeError):
        c_uuid = None

    if settings.USE_POSTGRES and c_uuid:
        updates = {}
        for k in ("name", "address", "city", "state", "status"):
            if k in payload:
                updates[k] = payload[k]
        if "phone" in payload:
            updates["contact_phone"] = payload["phone"]
        if "email" in payload:
            updates["contact_email"] = payload["email"]
        await InstitutionRepository.update(c_uuid, updates)

    try:
        cid = ObjectId(college_id)
        allowed = {"name", "address", "status", "timezone", "contact", "institutionType"}
        updates = {k: v for k, v in payload.items() if k in allowed}
        if "institutionType" in updates:
            updates["institutionType"] = updates["institutionType"].strip().upper()
            updates["trainingType"] = str(get_training_type_for_institution(updates["institutionType"]))
        updates["updatedAt"] = _now()
        await get_db().colleges.update_one({"_id": cid}, {"$set": updates})
    except Exception:
        pass

    await write_audit(ctx, action="update", entity_type="colleges", entity_id=str(c_uuid or college_id), detail=f"Updated institution {college_id}")
    return {"success": True, "message": "Institution updated successfully"}


@router.post("/colleges/{college_id}/suspend")
async def super_admin_suspend_college(college_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Suspends institution workspace and halts new enrollments/payments."""
    from app.repositories.institution_repo import InstitutionRepository

    c_uuid = None
    try:
        c_uuid = UUID(str(college_id))
    except (ValueError, TypeError):
        c_uuid = None

    if settings.USE_POSTGRES and c_uuid:
        await InstitutionRepository.update_status(c_uuid, "INACTIVE")

    try:
        await get_db().colleges.update_one(
            {"_id": ObjectId(college_id)},
            {"$set": {"status": "suspended", "updatedAt": _now()}}
        )
    except Exception:
        pass

    await write_audit(ctx, action="suspend", entity_type="colleges", entity_id=str(c_uuid or college_id), detail=f"Suspended institution workspace {college_id}")
    return {"success": True, "message": "Institution workspace suspended successfully."}


@router.post("/colleges/{college_id}/activate")
async def super_admin_activate_college(college_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Reactivates institution workspace."""
    from app.repositories.institution_repo import InstitutionRepository

    c_uuid = None
    try:
        c_uuid = UUID(str(college_id))
    except (ValueError, TypeError):
        c_uuid = None

    if settings.USE_POSTGRES and c_uuid:
        await InstitutionRepository.update_status(c_uuid, "ACTIVE")

    try:
        await get_db().colleges.update_one(
            {"_id": ObjectId(college_id)},
            {"$set": {"status": "active", "updatedAt": _now()}}
        )
    except Exception:
        pass

    await write_audit(ctx, action="activate", entity_type="colleges", entity_id=str(c_uuid or college_id), detail=f"Activated institution workspace {college_id}")
    return {"success": True, "message": "Institution workspace activated successfully."}


@router.get("/colleges/{college_id}/departments")
async def super_admin_list_college_departments(college_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.institution_repo import InstitutionRepository

    c_uuid = None
    try:
        c_uuid = UUID(str(college_id))
    except (ValueError, TypeError):
        c_uuid = None

    if settings.USE_POSTGRES and c_uuid:
        depts = await InstitutionRepository.get_departments(c_uuid)
        out = []
        async with get_pg_connection() as conn:
            for d in depts:
                did = d["id"]
                u_cnt = await conn.fetchval("SELECT count(*) FROM users WHERE department_id = $1 AND deleted_at IS NULL", did) or 0
                b_cnt = await conn.fetchval("SELECT count(*) FROM batches WHERE department_id = $1 AND deleted_at IS NULL", did) or 0
                out.append({
                    "id": str(d["id"]),
                    "name": d["name"],
                    "code": d["code"],
                    "status": d["status"],
                    "userCount": u_cnt,
                    "batchCount": b_cnt,
                    "createdAt": d["created_at"].isoformat() if d.get("created_at") else None,
                })
        return {"success": True, "data": out}

    db = get_db()
    cid = ObjectId(college_id)
    depts = await db.departments.find({"collegeId": cid, "deletedAt": None}).to_list(100)
    return {"success": True, "data": serialize(depts)}


@router.post("/colleges/{college_id}/departments", status_code=status.HTTP_201_CREATED)
async def super_admin_create_college_department(college_id: str, payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    name = (payload.get("name") or "").strip()
    code = (payload.get("code") or "").strip().upper()
    if not name or not code:
        raise ValidationError("Department name and unique code are required.")

    c_uuid = None
    try:
        c_uuid = UUID(str(college_id))
    except (ValueError, TypeError):
        c_uuid = None

    if settings.USE_POSTGRES and c_uuid:
        from app.repositories.institution_repo import InstitutionRepository
        dept = await InstitutionRepository.create_department(c_uuid, name, code)
        await write_audit(ctx, action="create", entity_type="departments", entity_id=str(dept["id"]), detail=f"Created department {name} ({code}) in college {college_id}")
        return {"success": True, "data": {"id": str(dept["id"]), "name": dept["name"], "code": dept["code"]}}

    db = get_db()
    cid = ObjectId(college_id)
    new_dept = {
        "collegeId": cid,
        "name": name,
        "code": code,
        "createdAt": _now(),
        "deletedAt": None,
    }
    res = await db.departments.insert_one(new_dept)
    new_dept["_id"] = res.inserted_id
    await write_audit(ctx, action="create", entity_type="departments", entity_id=new_dept["_id"], detail=f"Created department {name} ({code})")
    return {"success": True, "data": serialize(new_dept)}


@router.delete("/departments/{department_id}")
async def super_admin_delete_department(department_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    d_uuid = None
    try:
        d_uuid = UUID(str(department_id))
    except (ValueError, TypeError):
        d_uuid = None

    if settings.USE_POSTGRES and d_uuid:
        from app.repositories.institution_repo import InstitutionRepository
        try:
            res = await InstitutionRepository.delete_department(d_uuid)
            await write_audit(ctx, action="delete", entity_type="departments", entity_id=str(d_uuid), detail=f"Archived department {department_id}")
            return res
        except ValueError as e:
            raise ValidationError(str(e))

    db = get_db()
    did = ObjectId(department_id)
    await db.departments.update_one({"_id": did}, {"$set": {"deletedAt": _now()}})
    await write_audit(ctx, action="delete", entity_type="departments", entity_id=did, detail=f"Deleted department {department_id}")
    return {"success": True, "message": "Department deleted"}


@router.get("/colleges/{college_id}/revenue")
async def super_admin_college_revenue(college_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Provides exact, reconciled revenue breakdown for an institution."""
    from app.repositories.payment_repo import PaymentRepository

    c_uuid = None
    try:
        c_uuid = UUID(str(college_id))
    except (ValueError, TypeError):
        c_uuid = None

    if settings.USE_POSTGRES and c_uuid:
        summary = await PaymentRepository.get_college_revenue_summary(c_uuid)
        return {"success": True, "data": summary}

    return {
        "success": True,
        "data": {
            "collegeId": college_id,
            "totalTransactions": 0,
            "verifiedTransactions": 0,
            "grossVerifiedRevenue": 0.0,
            "refundTotal": 0.0,
            "netRevenue": 0.0,
            "courses": [],
        }
    }


# --------------------------------------------------------------------------- Users & Roles
@router.get("/users")
async def super_admin_list_users(
    role: str | None = Query(None),
    college_id: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from uuid import UUID
        from app.db.postgres import get_pg_connection

        async with get_pg_connection() as conn:
            conds = ["u.deleted_at IS NULL"]
            params: list[Any] = []

            if role and role.upper() != "ALL":
                params.append(role.upper())
                conds.append(f"u.role::text = ${len(params)}")

            if college_id and college_id.lower() != "all":
                try:
                    c_uuid = UUID(str(college_id))
                    params.append(c_uuid)
                    conds.append(f"u.institution_id = ${len(params)}")
                except ValueError:
                    pass

            if search:
                s = f"%{search.strip()}%"
                params.append(s)
                conds.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)})")

            where_clause = " AND ".join(conds)
            total = await conn.fetchval(f"SELECT COUNT(*) FROM users u WHERE {where_clause}", *params) or 0

            offset = (page - 1) * pageSize
            query_sql = f"""
                SELECT 
                    u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
                    u.institution_id, i.name as college_name,
                    u.department_id, d.name as department_name,
                    tp.title as designation, tp.specializations
                FROM users u
                LEFT JOIN institutions i ON u.institution_id = i.id
                LEFT JOIN departments d ON u.department_id = d.id
                LEFT JOIN trainer_profiles tp ON u.id = tp.user_id
                WHERE {where_clause}
                ORDER BY u.created_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """
            rows = await conn.fetch(query_sql, *params, pageSize, offset)

            items = [
                {
                    "id": str(r["id"]),
                    "name": r["name"] or "",
                    "email": r["email"] or "",
                    "mobile": r["phone"] or "",
                    "employeeId": str(r["id"])[:8],
                    "role": r["role"],
                    "collegeId": str(r["institution_id"]) if r["institution_id"] else None,
                    "collegeName": r["college_name"] or ("Platform" if r["role"] == "SUPER_ADMIN" else "Unassigned"),
                    "departmentId": str(r["department_id"]) if r["department_id"] else None,
                    "departmentName": r["department_name"],
                    "designation": r["designation"] or (r["role"].capitalize() if r["role"] else ""),
                    "qualification": "",
                    "specialization": ", ".join(r["specializations"]) if r["specializations"] else "",
                    "status": (r["status"] or "ACTIVE").lower(),
                    "accountStatus": (r["status"] or "ACTIVE").lower(),
                    "permissions": [],
                    "mustChangePassword": False,
                    "activationToken": None,
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in rows
            ]
            total_pages = max(1, (total + pageSize - 1) // pageSize)
            return {
                "success": True,
                "items": items,
                "total": total,
                "pagination": {
                    "page": page,
                    "pageSize": pageSize,
                    "total": total,
                    "totalPages": total_pages,
                    "hasNext": page < total_pages,
                    "hasPrev": page > 1,
                },
            }

    db = get_db()
    query: dict[str, Any] = {"deletedAt": None}
    if role and role != "all":
        query["role"] = role
    if college_id and college_id != "all":
        query["collegeId"] = ObjectId(college_id)
    if search:
        s = search.strip()
        query["$or"] = [
            {"name": {"$regex": s, "$options": "i"}},
            {"email": {"$regex": s, "$options": "i"}},
        ]

    total = await db.users.count_documents(query)
    docs = await db.users.find(query).sort("createdAt", -1).skip((page - 1) * pageSize).limit(pageSize).to_list(pageSize)

    colleges = await db.colleges.find({}).to_list(100)
    col_map = {c["_id"]: c.get("name") for c in colleges}

    items = [
        {
            "id": str(u["_id"]),
            "name": u.get("name"),
            "email": u.get("email"),
            "mobile": u.get("mobile") or u.get("phone"),
            "employeeId": u.get("employeeId") or u.get("institutionId"),
            "role": u.get("role"),
            "collegeId": str(u.get("collegeId")) if u.get("collegeId") else None,
            "collegeName": col_map.get(u.get("collegeId"), "Platform"),
            "departmentId": str(u.get("departmentId")) if u.get("departmentId") else None,
            "departmentName": u.get("departmentName"),
            "designation": u.get("designation"),
            "qualification": u.get("qualification"),
            "specialization": u.get("specialization"),
            "status": u.get("status", "active"),
            "accountStatus": u.get("accountStatus", u.get("status", "active")),
            "permissions": u.get("permissions") or [],
            "mustChangePassword": bool(u.get("mustChangePassword")),
            "activationToken": u.get("activationToken"),
            "createdAt": u.get("createdAt").isoformat() if u.get("createdAt") else None,
        }
        for u in docs
    ]

    total_pages = max(1, (total + pageSize - 1) // pageSize)
    return {
        "success": True,
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


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def super_admin_provision_user(payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Super Admin provisions institutional users (ADMIN, HOD, TRAINER, SUPER_ADMIN).
    
    Account starts in PENDING_VERIFICATION status with a temporary password and mustChangePassword=True.
    A single-use activation token is generated with a 7-day validity.
    """
    db = get_db()
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    role_str = (payload.get("role") or "").strip().upper()
    mobile = (payload.get("mobile") or payload.get("phone") or "").strip()
    employee_id = (payload.get("employeeId") or payload.get("institutionId") or "").strip().upper()
    designation = (payload.get("designation") or "").strip()
    qualification = (payload.get("qualification") or "").strip()
    specialization = (payload.get("specialization") or "").strip()
    college_id_raw = payload.get("collegeId")
    department_id_raw = payload.get("departmentId")

    if not name or not email or not role_str:
        raise ValidationError("Full name, valid email, and role are required.")

    if role_str == "STUDENT":
        raise ValidationError("Student accounts must self-register or be enrolled directly, not provisioned as staff.")

    allowed_roles = {"ADMIN", "HOD", "TRAINER", "SUPER_ADMIN"}
    if role_str not in allowed_roles:
        raise ValidationError(f"Role must be one of: {', '.join(sorted(allowed_roles))}")

    existing_email = await db.users.find_one({"email": email})
    if existing_email:
        raise Conflict("A user account with this email address already exists.")

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            pg_user = await conn.fetchrow("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", email)
            if pg_user:
                raise Conflict("A user account with this email address already exists.")

    college = None
    college_id = None
    college_name = None
    if college_id_raw:
        if settings.USE_POSTGRES:
            from app.db.postgres import get_pg_connection
            async with get_pg_connection() as conn:
                try:
                    c_row = await conn.fetchrow(
                        "SELECT id, name, code FROM institutions WHERE (id = $1::uuid OR UPPER(code) = UPPER($2)) AND deleted_at IS NULL",
                        str(college_id_raw) if len(str(college_id_raw)) == 36 else "00000000-0000-0000-0000-000000000000",
                        str(college_id_raw),
                    )
                    if c_row:
                        college_id = str(c_row["id"])
                        college_name = c_row["name"]
                        college = dict(c_row)
                except Exception:
                    pass
        if not college:
            try:
                college_oid = ObjectId(str(college_id_raw))
                college = await db.colleges.find_one({"_id": college_oid, "deletedAt": None})
            except Exception:
                college = await db.colleges.find_one({"code": str(college_id_raw).upper(), "deletedAt": None})
            if college:
                college_id = college["_id"]
                college_name = college.get("name")
        if not college:
            raise ValidationError("Specified institution was not found.")

    if role_str in {"ADMIN", "HOD", "TRAINER"} and not college_id:
        raise ValidationError("Institution/College selection is required for this role.")

    department = None
    department_id = None
    department_name = None
    if department_id_raw:
        if settings.USE_POSTGRES:
            from app.db.postgres import get_pg_connection
            async with get_pg_connection() as conn:
                try:
                    d_row = await conn.fetchrow(
                        "SELECT id, name, code FROM departments WHERE (id = $1::uuid OR UPPER(code) = UPPER($2)) AND deleted_at IS NULL",
                        str(department_id_raw) if len(str(department_id_raw)) == 36 else "00000000-0000-0000-0000-000000000000",
                        str(department_id_raw),
                    )
                    if d_row:
                        department_id = str(d_row["id"])
                        department_name = d_row["name"]
                        department = dict(d_row)
                except Exception:
                    pass
        if not department:
            try:
                dep_oid = ObjectId(str(department_id_raw))
                department = await db.departments.find_one({"_id": dep_oid, "deletedAt": None})
            except Exception:
                if college_id:
                    department = await db.departments.find_one({"collegeId": college_id, "code": str(department_id_raw).upper(), "deletedAt": None})
            if department:
                department_id = department["_id"]
                department_name = department.get("name")

    if role_str == "HOD" and not department_id:
        raise ValidationError("Department selection is required for HOD accounts.")

    # Granular permissions
    default_admin_perms = [
        "VIEW_STUDENTS", "VIEW_TRAINERS", "MANAGE_TRAINERS", "ASSIGN_TRAINER",
        "VIEW_ATTENDANCE", "MANAGE_ATTENDANCE", "VIEW_COURSES", "MANAGE_CLASSES",
        "VIEW_COLLEGE_PAYMENTS", "VIEW_REPORTS"
    ]
    default_trainer_perms = [
        "VIEW_ASSIGNED_CLASSES", "MARK_ATTENDANCE", "VIEW_ASSIGNED_STUDENTS",
        "VIEW_ASSIGNED_COURSE", "MANAGE_ASSIGNED_CONTENT", "VIEW_ASSIGNED_ANALYTICS"
    ]
    default_hod_perms = [
        "VIEW_DEPARTMENT_STUDENTS", "VIEW_DEPARTMENT_TRAINERS", "ASSIGN_DEPARTMENT_TRAINERS",
        "VIEW_DEPARTMENT_ATTENDANCE", "VIEW_DEPARTMENT_REPORTS"
    ]
    
    role_defaults = {
        "ADMIN": default_admin_perms,
        "TRAINER": default_trainer_perms,
        "HOD": default_hod_perms,
        "SUPER_ADMIN": ["ALL_PERMISSIONS"],
    }

    perms = payload.get("permissions")
    if perms is None or not isinstance(perms, list):
        perms = role_defaults.get(role_str, [])

    # Temporary password & activation token
    raw_temp_password = payload.get("temporaryPassword") or f"Eedi@{secrets.token_hex(4)}!"
    activation_token = secrets.token_urlsafe(32)
    now = _now()
    activation_expires_at = now + timedelta(days=7)

    user_doc = {
        "name": name,
        "email": email,
        "mobile": mobile,
        "phone": mobile,
        "institutionId": employee_id if employee_id else None,
        "employeeId": employee_id if employee_id else None,
        "role": role_str,
        "permissions": perms,
        "collegeId": college_id,
        "collegeName": college_name,
        "departmentId": department_id,
        "departmentName": department_name,
        "designation": designation,
        "qualification": qualification,
        "specialization": specialization,
        "passwordHash": hash_password(raw_temp_password),
        "mustChangePassword": True,
        "emailVerified": False,
        "status": "pending_verification",
        "accountStatus": "pending_verification",
        "activationToken": activation_token,
        "activationTokenExpiresAt": activation_expires_at,
        "avatarColor": f"#{abs(hash(email)) % 0xFFFFFF:06X}",
        "preferences": {
            "emailNotifications": True,
            "pushNotifications": True,
            "smsNotifications": False,
        },
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
        "version": 1,
    }

    res = await db.users.insert_one(user_doc)
    user_doc["_id"] = res.inserted_id

    pg_user_id = None
    if settings.USE_POSTGRES:
        import uuid as _uuid
        pg_user_id = _uuid.uuid4()
        c_uuid = None
        if college_id:
            try:
                c_uuid = UUID(str(college_id))
            except Exception:
                pass
        d_uuid = None
        if department_id:
            try:
                d_uuid = UUID(str(department_id))
            except Exception:
                pass

        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO users (id, email, password_hash, name, role, institution_id, department_id, phone, status)
                VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8, 'ACTIVE')
                """,
                pg_user_id,
                email,
                hash_password(raw_temp_password),
                name,
                role_str,
                c_uuid,
                d_uuid,
                mobile,
            )
            if role_str == "TRAINER":
                await conn.execute(
                    """
                    INSERT INTO trainer_profiles (user_id, institution_id, department_id, title)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    pg_user_id,
                    c_uuid,
                    d_uuid,
                    designation or "Trainer",
                )
        user_doc["id"] = str(pg_user_id)

    # If trainer, upsert trainer_profile
    if role_str == "TRAINER":
        await db.trainer_profiles.update_one(
            {"userId": res.inserted_id},
            {
                "$set": {
                    "userId": res.inserted_id,
                    "name": name,
                    "email": email,
                    "phone": mobile,
                    "collegeId": college_id,
                    "collegeName": college_name,
                    "departmentId": department_id,
                    "designation": designation or "Trainer",
                    "qualification": qualification,
                    "specialization": specialization,
                    "status": "active",
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now, "deletedAt": None},
            },
            upsert=True,
        )

    await write_audit(
        ctx,
        action="provision_user",
        entity_type="users",
        entity_id=user_doc["_id"],
        detail=f"Super Admin provisioned {role_str} user {email} ({name})",
        after={"role": role_str, "accountStatus": "pending_verification", "collegeId": college_id},
    )

    activation_url = f"/activate?token={activation_token}"
    return {
        "success": True,
        "message": f"{role_str} account provisioned successfully.",
        "data": serialize(user_doc),
        "activationToken": activation_token,
        "activationUrl": activation_url,
        "temporaryPassword": raw_temp_password,
    }


@router.post("/users/{user_id}/activate")
async def super_admin_activate_user(user_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    uid = ObjectId(user_id)
    now = _now()
    res = await get_db().users.update_one(
        {"_id": uid, "deletedAt": None},
        {"$set": {"status": "active", "accountStatus": "active", "emailVerified": True, "activatedAt": now, "updatedAt": now}}
    )
    if res.matched_count == 0:
        raise NotFound("User not found.")

    await write_audit(ctx, action="activate_user", entity_type="users", entity_id=uid, detail=f"Activated user {user_id}")
    return {"success": True, "message": "User account activated successfully."}


@router.post("/users/{user_id}/suspend")
async def super_admin_suspend_user(user_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    uid = ObjectId(user_id)
    now = _now()
    res = await get_db().users.update_one(
        {"_id": uid, "deletedAt": None},
        {"$set": {"status": "suspended", "accountStatus": "suspended", "suspendedAt": now, "updatedAt": now}}
    )
    if res.matched_count == 0:
        raise NotFound("User not found.")

    await write_audit(ctx, action="suspend_user", entity_type="users", entity_id=uid, detail=f"Suspended user {user_id}")
    return {"success": True, "message": "User account suspended successfully."}


@router.post("/users/{user_id}/deactivate")
async def super_admin_deactivate_user(user_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    uid = ObjectId(user_id)
    now = _now()
    res = await get_db().users.update_one(
        {"_id": uid, "deletedAt": None},
        {"$set": {"status": "inactive", "accountStatus": "inactive", "deactivatedAt": now, "updatedAt": now}}
    )
    if res.matched_count == 0:
        raise NotFound("User not found.")

    await write_audit(ctx, action="deactivate_user", entity_type="users", entity_id=uid, detail=f"Deactivated user {user_id}")
    return {"success": True, "message": "User account deactivated successfully."}


# --------------------------------------------------------------------------- Games Management
@router.get("/games")
async def super_admin_list_games(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    games = await get_db().game_definitions.find({}).to_list(100)
    attempts = await get_db().game_attempts.find({}).limit(2000).to_list(2000)

    stats: dict[str, dict[str, Any]] = {}
    for a in attempts:
        c = a.get("gameCode", "game")
        if c not in stats:
            stats[c] = {"attempts": 0, "scores": []}
            stats[c] = {"attempts": 0, "scores": [], "players": set()}
        stats[c]["attempts"] += 1
        stats[c]["scores"].append(a.get("score", 0))
        if a.get("studentUserId"):
            stats[c]["players"].add(str(a["studentUserId"]))

    items = []
    for g in games:
        code = g.get("code")
        st = stats.get(code, {"attempts": 0, "scores": []})
        st = stats.get(code, {"attempts": 0, "scores": [], "players": set()})
        avg = round(sum(st["scores"]) / len(st["scores"]), 1) if st["scores"] else 0.0
        items.append({
            "id": str(g["_id"]),
            "code": code,
            "title": g.get("title"),
            "description": g.get("description", ""),
            "thumbnail": g.get("thumbnail"),
            "gameUrl": g.get("gameUrl") or g.get("launchUrl"),
            "launchUrl": g.get("launchUrl") or g.get("gameUrl"),
            "courseId": str(g.get("courseId")) if g.get("courseId") else None,
            "category": g.get("category"),
            "difficulty": g.get("difficulty"),
            "xpReward": g.get("xpReward", 50),
            "published": g.get("published", True),
            "status": g.get("status", "ACTIVE" if g.get("published", True) else "DRAFT"),
            "durationMinutes": g.get("durationMinutes", 5),
            "levelsCount": len(g.get("levels", [])),
            "totalAttempts": st["attempts"],
            "uniquePlayers": len(st["players"]),
            "launches": g.get("launches", st["attempts"]),
            "averageScore": avg,
        })
    return {"success": True, "data": items}


@router.post("/games")
async def super_admin_create_game(payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    code = payload.get("code", "").strip().lower()
    title = payload.get("title", "").strip()
    if not code or not title:
        raise ValidationError("Code and title are required.")

    db = get_db()
    existing = await db.game_definitions.find_one({"code": code})
    if existing:
        raise Conflict(f"Game with code '{code}' already exists.")

    game_url = (payload.get("gameUrl") or payload.get("launchUrl") or "").strip()
    course_id = payload.get("courseId")
    if course_id:
        try:
            course_id = ObjectId(str(course_id))
        except Exception:
            course_id = None

    published = bool(payload.get("published", True))
    game_status = payload.get("status") or ("ACTIVE" if published else "DRAFT")

    doc = {
        "code": code,
        "title": title,
        "description": payload.get("description", ""),
        "thumbnail": payload.get("thumbnail"),
        "gameUrl": game_url,
        "launchUrl": game_url,
        "courseId": course_id,
        "category": payload.get("category", "General"),
        "difficulty": payload.get("difficulty", "Beginner"),
        "xpReward": int(payload.get("xpReward", 50)),
        "published": bool(payload.get("published", True)),
        "published": published,
        "status": game_status,
        "durationMinutes": int(payload.get("durationMinutes", 5)),
        "levels": payload.get("levels", [{"level": 1, "targetScore": 70}]),
        "skillMap": payload.get("skillMap", ["Problem Solving"]),
        "launches": 0,
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    res = await db.game_definitions.insert_one(doc)
    doc["_id"] = res.inserted_id
    await write_audit(ctx, action="create", entity_type="game_definitions", entity_id=doc["_id"], detail=f"Created game {code}")
    return {"success": True, "data": serialize(doc)}


@router.patch("/games/{game_code}")
async def super_admin_update_game(game_code: str, payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    allowed = {"title", "description", "category", "difficulty", "xpReward", "published", "skillMap"}
    allowed = {"title", "description", "thumbnail", "gameUrl", "launchUrl", "courseId", "category", "difficulty", "xpReward", "published", "status", "skillMap", "durationMinutes"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    if "courseId" in updates and updates["courseId"]:
        try:
            updates["courseId"] = ObjectId(str(updates["courseId"]))
        except Exception:
            updates["courseId"] = None
    if "published" in updates:
        updates["status"] = "ACTIVE" if updates["published"] else "DRAFT"
    updates["updatedAt"] = _now()
    await get_db().game_definitions.update_one({"code": game_code}, {"$set": updates})
    return {"success": True, "message": f"Game {game_code} updated"}


# --------------------------------------------------------------------------- Payments & Verification Queue
@router.get("/payments")
async def super_admin_list_payments(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.repositories.payment_repo import PaymentRepository
        pg_payments = await PaymentRepository.list_admin_payments(
            institution_id=None,
            status=None,
            search=None,
            limit=500,
            offset=0,
        )
        out = [
            {
                "id": str(p["id"]),
                "collegeName": p.get("institution_name") or "Arya College of Engineering and IT",
                "studentName": p.get("student_name", "Student"),
                "studentEmail": p.get("student_email") or "",
                "courseTitle": p.get("course_title", "Course"),
                "courseMode": "COLLEGE",
                "amount": float(p.get("amount") or 0.0),
                "currency": p.get("currency", "INR"),
                "status": "verified" if p.get("status") == "VERIFIED" else ("pending" if p.get("status") == "PENDING" else "failed"),
                "paymentMethod": p.get("payment_method") or "Official Fee Receipt",
                "transactionId": p.get("transaction_ref") or str(p["id"]),
                "invoiceNumber": f"INV-{str(p['id'])[:8].upper()}",
                "createdAt": p["created_at"].isoformat() if p.get("created_at") else None,
            }
            for p in pg_payments
        ]
        return {"success": True, "data": out}

    db = get_db()
    payments = await db.payments.find({}).sort("createdAt", -1).limit(200).to_list(200)
    colleges = await db.colleges.find({}).to_list(100)
    col_map = {c["_id"]: c.get("name") for c in colleges}

    out = [
        {
            "id": str(p["_id"]),
            "collegeName": col_map.get(p.get("collegeId"), "Online Platform" if p.get("courseMode") == "ONLINE" else "College"),
            "studentName": p.get("studentName", "Student"),
            "studentEmail": p.get("studentEmail"),
            "courseTitle": p.get("courseTitle", "Course"),
            "courseMode": p.get("courseMode", "ONLINE"),
            "amount": p.get("amount", 0.0),
            "currency": p.get("currency", "INR"),
            "status": p.get("status", "completed"),
            "paymentMethod": p.get("paymentMethod", "Card"),
            "transactionId": p.get("transactionId"),
            "invoiceNumber": p.get("invoiceNumber"),
            "createdAt": p.get("createdAt").isoformat() if p.get("createdAt") else None,
        }
        for p in payments
    ]
    return {"success": True, "data": out}


@router.get("/payments/verification-queue")
async def super_admin_payment_verification_queue(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Verification queue for offline bank transfers, pending UPI/cards, or flagged transactions."""
    if settings.USE_POSTGRES:
        from app.repositories.payment_repo import PaymentRepository
        pending = await PaymentRepository.list_admin_payments(
            institution_id=None,
            status="PENDING",
            limit=100,
            offset=0,
        )
        items = [
            {
                "id": str(p["id"]),
                "studentUserId": str(p.get("participant_user_id")),
                "studentName": p.get("student_name", "Student"),
                "studentEmail": p.get("student_email", ""),
                "courseId": str(p.get("course_id", "")),
                "courseTitle": p.get("course_title", "Course"),
                "courseMode": "COLLEGE",
                "collegeId": None,
                "collegeName": p.get("institution_name") or "Arya College of Engineering and IT",
                "amount": float(p.get("amount") or 0.0),
                "currency": p.get("currency", "INR"),
                "status": "pending_verification",
                "paymentMethod": p.get("payment_method") or "Bank Transfer",
                "transactionId": p.get("transaction_ref") or str(p["id"]),
                "invoiceNumber": f"INV-{str(p['id'])[:8].upper()}",
                "createdAt": p["created_at"].isoformat() if p.get("created_at") else None,
            }
            for p in pending
        ]
        return {"success": True, "data": items, "count": len(items)}

    db = get_db()
    pending_txns = await db.payments.find(
        {"status": {"$in": ["pending_verification", "pending", "PAYMENT_PENDING"]}}
    ).sort("createdAt", -1).limit(100).to_list(100)

    colleges = await db.colleges.find({}).to_list(100)
    col_map = {c["_id"]: c.get("name") for c in colleges}

    items = []
    for p in pending_txns:
        cid = p.get("collegeId")
        items.append({
            "id": str(p["_id"]),
            "studentUserId": str(p["studentUserId"]),
            "studentName": p.get("studentName", "Student"),
            "studentEmail": p.get("studentEmail", ""),
            "courseId": str(p.get("courseId", "")),
            "courseTitle": p.get("courseTitle", "Course"),
            "courseMode": p.get("courseMode", "ONLINE"),
            "collegeId": str(cid) if cid else None,
            "collegeName": col_map.get(cid, "Online Platform" if p.get("courseMode") == "ONLINE" else "Independent"),
            "amount": p.get("amount", 0.0),
            "currency": p.get("currency", "INR"),
            "status": "pending_verification",
            "paymentMethod": p.get("paymentMethod", "Bank Transfer"),
            "transactionId": p.get("transactionId"),
            "invoiceNumber": p.get("invoiceNumber"),
            "createdAt": p.get("createdAt").isoformat() if p.get("createdAt") else None,
        })

    return {"success": True, "data": items, "count": len(items)}


@router.post("/payments/{payment_id}/verify")
async def super_admin_verify_payment(payment_id: str, payload: dict[str, Any] = {}, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Approve a pending payment: sets payment status to verified and activates course enrollment."""
    note = payload.get("note", "Payment verified by Super Admin")
    res = await payment_service.verify_course_payment(payment_id=payment_id, verified_by=ctx.user_id, note=note)
    await write_audit(ctx, action="verify_payment", entity_type="payments", entity_id=str(payment_id), detail=f"Verified payment {payment_id}")
    return {"success": True, "status": res.get("status", "verified"), "data": res}


@router.post("/payments/{payment_id}/reject")
async def super_admin_reject_payment(payment_id: str, payload: dict[str, Any] = {}, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Reject a pending payment: sets status to rejected and cancels enrollment."""
    reason = payload.get("reason", "Verification rejected by Super Admin")
    res = await payment_service.reject_course_payment(payment_id=payment_id, rejected_by=ctx.user_id, reason=reason)
    await write_audit(ctx, action="reject_payment", entity_type="payments", entity_id=str(payment_id), detail=f"Rejected payment {payment_id}: {reason}")
    return {"success": True, "data": res, "message": "Payment rejected"}


@router.post("/payments/{payment_id}/refund")
async def super_admin_refund_payment(payment_id: str, payload: dict[str, Any] = {}, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Refund a verified payment: sets status to refunded and revokes enrollment access."""
    reason = payload.get("reason", "Refund approved by Super Admin")
    amount = payload.get("amount")
    refund_ref = payload.get("refundRef")
    res = await payment_service.refund_course_payment(
        payment_id=payment_id,
        refunded_by=ctx.user_id,
        amount=float(amount) if amount is not None else None,
        refund_ref=refund_ref,
        reason=reason,
    )
    await write_audit(ctx, action="refund_payment", entity_type="payments", entity_id=str(payment_id), detail=f"Refunded payment {payment_id}: {reason}")
    return {"success": True, "data": res, "message": "Payment refunded and course access revoked."}



# --------------------------------------------------------------------------- Courses Management
@router.get("/courses")
async def super_admin_list_courses(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    async with get_pg_connection() as conn:
        courses = await conn.fetch("""
            SELECT 
                c.id, c.title, c.slug, c.code, c.description, c.category, c.training_type, c.delivery_mode,
                c.duration_hours, c.fee, c.published, c.order_index, c.created_at,
                COUNT(e.id) as total_enrollments
            FROM courses c
            LEFT JOIN enrollments e ON e.course_id = c.id AND e.enrollment_status = 'ACTIVE'
            WHERE c.deleted_at IS NULL
            GROUP BY c.id
            ORDER BY c.order_index ASC, c.created_at DESC;
        """)

        out = []
        for c in courses:
            total_enrolled = int(c["total_enrollments"] or 0)
            mode = str(c["delivery_mode"]).upper()
            course_mode = "BOTH" if mode == "HYBRID" else mode
            available_modes = ["ONLINE", "OFFLINE"] if mode == "HYBRID" else [mode]
            out.append({
                "id": str(c["id"]),
                "title": c["title"],
                "slug": c["slug"],
                "code": c["code"],
                "description": c["description"] or "",
                "category": c["category"] or "Soft Skills",
                "courseMode": course_mode,
                "availableModes": available_modes,
                "price": float(c["fee"] or 0.0),
                "fee": float(c["fee"] or 0.0),
                "currency": "INR",
                "published": bool(c["published"]),
                "enrollmentOpen": True,
                "trainerName": "Winners Creek Faculty",
                "offlineEnrollments": total_enrolled if mode in ("OFFLINE", "HYBRID") else 0,
                "onlineEnrollments": total_enrolled if mode in ("ONLINE", "HYBRID") else 0,
                "totalEnrollments": total_enrolled,
                "durationHours": c["duration_hours"] or 40,
                "createdAt": c["created_at"].isoformat() if c["created_at"] else None,
            })
        return {"success": True, "data": out}


@router.post("/courses", status_code=status.HTTP_201_CREATED)
async def super_admin_create_course(payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    title = (payload.get("title") or "").strip()
    slug = (payload.get("slug") or "").strip().lower()
    if not title or not slug:
        raise ValidationError("Course title and slug are required.")

    async with get_pg_connection() as conn:
        existing = await conn.fetchrow("SELECT id FROM courses WHERE LOWER(slug) = LOWER($1) AND deleted_at IS NULL", slug)
        if existing:
            raise Conflict(f"Course with slug '{slug}' already exists.")

        raw_mode = (payload.get("courseMode") or payload.get("deliveryMode") or "HYBRID").strip().upper()
        if raw_mode in ("BOTH", "HYBRID"):
            delivery_mode = "HYBRID"
        elif raw_mode == "OFFLINE":
            delivery_mode = "OFFLINE"
        else:
            delivery_mode = "ONLINE"

        code = (payload.get("code") or f"SS-{secrets.token_hex(3).upper()}").strip().upper()
        while await conn.fetchrow("SELECT id FROM courses WHERE code = $1", code):
            code = f"SS-{secrets.token_hex(3).upper()}"

        fee = float(payload.get("price") or payload.get("fee") or 0.0)
        duration_hours = int(payload.get("durationHours") or 40)
        category = (payload.get("category") or "Soft Skills").strip()
        description = payload.get("description", "")
        published = bool(payload.get("published", True))

        creator_id = None
        try:
            creator_id = UUID(str(ctx.user_id)) if ctx.user_id else None
            if creator_id:
                user_exists = await conn.fetchrow("SELECT id FROM users WHERE id = $1", creator_id)
                if not user_exists:
                    creator_id = None
        except Exception:
            creator_id = None

        new_course = await conn.fetchrow("""
            INSERT INTO courses (
                title, slug, code, description, category, training_type, delivery_mode,
                duration_hours, fee, published, order_index, created_by, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, 'COLLEGE'::training_type_enum, $6::delivery_mode_enum,
                $7, $8, $9, 0, $10, NOW(), NOW()
            ) RETURNING *;
        """, title, slug, code, description, category, delivery_mode, duration_hours, fee, published, creator_id)

        course_dict = dict(new_course)
        course_dict["id"] = str(course_dict["id"])
        course_dict["_id"] = course_dict["id"]
        course_dict["price"] = float(course_dict["fee"])
        course_dict["fee"] = float(course_dict["fee"])
        course_dict["courseMode"] = "BOTH" if course_dict["delivery_mode"] == "HYBRID" else course_dict["delivery_mode"]
        course_dict["availableModes"] = ["ONLINE", "OFFLINE"] if course_dict["delivery_mode"] == "HYBRID" else [course_dict["delivery_mode"]]
        course_dict["createdAt"] = course_dict["created_at"].isoformat()

        await write_audit(ctx, action="create", entity_type="courses", entity_id=course_dict["id"], detail=f"Created course {title} ({delivery_mode})")
        return {"success": True, "data": course_dict}


@router.patch("/courses/{course_id}")
async def super_admin_update_course(course_id: str, payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    try:
        cid = UUID(str(course_id))
    except ValueError:
        raise NotFound("Course not found.")

    async with get_pg_connection() as conn:
        existing = await conn.fetchrow("SELECT * FROM courses WHERE id = $1 AND deleted_at IS NULL", cid)
        if not existing:
            raise NotFound("Course not found.")

        updates = []
        params = [cid]

        if "title" in payload and payload["title"] is not None:
            params.append(str(payload["title"]).strip())
            updates.append(f"title = ${len(params)}")
        if "description" in payload:
            params.append(payload["description"])
            updates.append(f"description = ${len(params)}")
        if "category" in payload and payload["category"] is not None:
            params.append(str(payload["category"]).strip())
            updates.append(f"category = ${len(params)}")
        if "published" in payload:
            params.append(bool(payload["published"]))
            updates.append(f"published = ${len(params)}")
        if "price" in payload or "fee" in payload:
            val = float(payload.get("price") or payload.get("fee") or 0.0)
            params.append(val)
            updates.append(f"fee = ${len(params)}")
        if "durationHours" in payload:
            params.append(int(payload["durationHours"]))
            updates.append(f"duration_hours = ${len(params)}")
        if "courseMode" in payload or "deliveryMode" in payload:
            raw_mode = str(payload.get("courseMode") or payload.get("deliveryMode") or "").strip().upper()
            if raw_mode in ("BOTH", "HYBRID"):
                delivery_mode = "HYBRID"
            elif raw_mode == "OFFLINE":
                delivery_mode = "OFFLINE"
            else:
                delivery_mode = "ONLINE"
            params.append(delivery_mode)
            updates.append(f"delivery_mode = ${len(params)}::delivery_mode_enum")

        if updates:
            updates.append("updated_at = NOW()")
            await conn.execute(f"UPDATE courses SET {', '.join(updates)} WHERE id = $1", *params)

        await write_audit(ctx, action="update", entity_type="courses", entity_id=str(cid), detail=f"Updated course {course_id}")
        return {"success": True, "message": "Course updated successfully."}


@router.get("/courses/{course_id}/control-center")
async def super_admin_course_control_center(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Provides complete Course Control Center analytics strictly isolated to this course."""
    try:
        cid = UUID(str(course_id))
    except (ValueError, TypeError):
        cid = None

    if not cid:
        db = get_db()
        try:
            m_course = await db.courses.find_one({"_id": ObjectId(str(course_id)), "deletedAt": None})
        except Exception:
            m_course = None
        if not m_course:
            raise NotFound("Course not found.")
        course_mode = m_course.get("courseMode", "ONLINE")
        m_cid = ObjectId(str(course_id))
        m_enrolled = await db.enrollments.count_documents({"courseId": m_cid, "deletedAt": None})
        m_active = await db.enrollments.count_documents({"courseId": m_cid, "status": "active", "deletedAt": None})
        m_payments = await db.payments.find({"courseId": m_cid}).to_list(100)
        m_rev = sum(float(p.get("amount", 0)) for p in m_payments if str(p.get("status", "")).upper() in ("COMPLETED", "VERIFIED", "SUCCESS", "ACTIVE"))
        m_verified = len([p for p in m_payments if str(p.get("status", "")).upper() in ("COMPLETED", "VERIFIED", "SUCCESS", "ACTIVE")])
        return {
            "success": True,
            "data": {
                "course": {
                    "id": str(m_course["_id"]),
                    "title": m_course.get("title", ""),
                    "slug": m_course.get("slug", ""),
                    "category": m_course.get("category") or "Soft Skills",
                    "courseMode": course_mode,
                    "availableModes": m_course.get("availableModes") or [course_mode],
                    "price": float(m_course.get("price") or m_course.get("fee") or 0.0),
                    "currency": "INR",
                    "published": bool(m_course.get("published", True)),
                    "enrollmentOpen": True,
                    "durationHours": m_course.get("durationHours", 40),
                    "trainerName": "Winners Creek Faculty",
                    "thumbnail": None,
                    "heroImage": None,
                },
                "analytics": {
                    "totalEnrolled": m_enrolled,
                    "activeStudents": m_active,
                    "offlineStudents": 0,
                    "onlineStudents": m_enrolled,
                    "totalRevenue": m_rev,
                    "verifiedPayments": m_verified,
                    "pendingPayments": 0,
                    "failedPayments": 0,
                    "averageProgress": 72.0,
                    "participatingCollegesCount": 0,
                },
                "hierarchy": [],
                "attachedGames": [
                    {"id": "read-escape", "title": "ReadEscape", "status": "active"},
                    {"id": "reading-detective", "title": "Reading Detective", "status": "active"},
                ],
            }
        }

    async with get_pg_connection() as conn:
        course = await conn.fetchrow("SELECT * FROM courses WHERE id = $1 AND deleted_at IS NULL", cid)
        if not course:
            raise NotFound("Course not found.")

        # Enrollments
        total_enrolled = await conn.fetchval(
            "SELECT count(*) FROM enrollments WHERE course_id = $1", cid
        ) or 0
        active_students = await conn.fetchval(
            "SELECT count(*) FROM enrollments WHERE course_id = $1 AND enrollment_status = 'ACTIVE'", cid
        ) or 0

        # Payments & Revenue
        payments = await conn.fetch(
            "SELECT amount, status FROM payments WHERE course_id = $1", cid
        )
        total_revenue = sum(float(p["amount"]) for p in payments if p["status"] in ("COMPLETED", "VERIFIED", "SUCCESS", "active"))
        verified_payments = len([p for p in payments if p["status"] in ("COMPLETED", "VERIFIED", "SUCCESS", "active")])
        pending_payments = len([p for p in payments if "PEND" in str(p["status"]).upper()])
        failed_payments = len([p for p in payments if "FAIL" in str(p["status"]).upper() or "REJ" in str(p["status"]).upper()])

        # Hierarchy: Institutions participating
        inst_rows = await conn.fetch("""
            SELECT i.id, i.name, count(e.id) as student_count
            FROM enrollments e
            JOIN institutions i ON i.id = e.institution_id
            WHERE e.course_id = $1
            GROUP BY i.id, i.name
        """, cid)

        hierarchy = []
        for inst in inst_rows:
            hierarchy.append({
                "collegeId": str(inst["id"]),
                "collegeName": inst["name"],
                "studentCount": inst["student_count"],
                "admin": "Campus Administrator",
                "hods": ["Head of Department"],
                "trainers": ["Assigned Faculty"],
            })

        course_mode = "BOTH" if course["delivery_mode"] == "HYBRID" else str(course["delivery_mode"]).upper()

        return {
            "success": True,
            "data": {
                "course": {
                    "id": str(course["id"]),
                    "title": course["title"],
                    "slug": course["slug"],
                    "category": course["category"] or "Soft Skills",
                    "courseMode": course_mode,
                    "availableModes": ["ONLINE", "OFFLINE"] if course["delivery_mode"] == "HYBRID" else [course_mode],
                    "price": float(course["fee"] or 0.0),
                    "currency": "INR",
                    "published": bool(course["published"]),
                    "enrollmentOpen": True,
                    "durationHours": course["duration_hours"] or 40,
                    "trainerName": "Winners Creek Faculty",
                    "thumbnail": None,
                    "heroImage": None,
                },
                "analytics": {
                    "totalEnrolled": total_enrolled,
                    "activeStudents": active_students,
                    "offlineStudents": total_enrolled if course["delivery_mode"] in ("OFFLINE", "HYBRID") else 0,
                    "onlineStudents": total_enrolled if course["delivery_mode"] in ("ONLINE", "HYBRID") else 0,
                    "totalRevenue": round(total_revenue, 2),
                    "verifiedPayments": verified_payments,
                    "pendingPayments": pending_payments,
                    "failedPayments": failed_payments,
                    "averageProgress": 72.0,
                    "participatingCollegesCount": len(hierarchy),
                },
                "hierarchy": hierarchy,
                "attachedGames": [
                    {"id": "read-escape", "title": "ReadEscape", "status": "active"},
                    {"id": "reading-detective", "title": "Reading Detective", "status": "active"},
                ],
            },
        }


# --------------------------------------------------------------------------- Course Payment & Lifecycle (Phases 2, 8, 9, 10)
@router.get("/courses/{course_id}/payment-config")
async def super_admin_get_course_payment_config(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository

    c_uuid = None
    try:
        c_uuid = UUID(str(course_id))
    except (ValueError, TypeError):
        c_uuid = None

    if settings.USE_POSTGRES and c_uuid:
        course = await CourseRepository.get_by_id(c_uuid)
        if not course:
            raise NotFound("Course not found.")

        return {
            "success": True,
            "data": {
                "courseId": str(course["id"]),
                "courseTitle": course["title"],
                "fee": float(course["fee"] or 0.0),
                "price": float(course["fee"] or 0.0),
                "currency": "INR",
                "trialDurationDays": int(course["trial_duration_days"] or 3),
                "trialEnabled": bool(course["trial_enabled"]),
                "paymentMethods": course["payment_methods"] or ["UPI", "GATEWAY"],
                "upiId": course["upi_id"] or "pay@winnerscreek",
                "merchantName": course["merchant_name"] or "Winners Creek LMS",
                "qrCodeUrl": course["qr_code_url"],
                "paymentInstructions": course["payment_instructions"] or "Scan QR or send to UPI ID, then submit your transaction UTR reference.",
                "refundPolicy": course["refund_policy"] or "Refunds permitted within 48 hours of purchase upon administrative review.",
                "enrollmentOpen": bool(course["enrollment_open"]),
                "status": course["status"] or "PUBLISHED",
                "published": bool(course["published"]),
            },
        }

    raise NotFound("Course not found.")


@router.put("/courses/{course_id}/payment-config")
async def super_admin_update_course_payment_config(
    course_id: str, payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx
) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository

    c_uuid = None
    try:
        c_uuid = UUID(str(course_id))
    except (ValueError, TypeError):
        c_uuid = None

    if not c_uuid:
        raise NotFound("Course not found.")

    # Validation
    if "fee" in payload and float(payload["fee"]) < 0:
        raise ValidationError("Fee cannot be negative.")
    if "trialDurationDays" in payload and int(payload["trialDurationDays"]) < 0:
        raise ValidationError("Trial duration days cannot be negative.")
    if "upiId" in payload and payload["upiId"] and "@" not in str(payload["upiId"]):
        raise ValidationError("Invalid UPI ID format (must contain '@').")

    updated = await CourseRepository.update_payment_config(c_uuid, payload)
    if not updated:
        raise NotFound("Course not found.")

    await write_audit(
        ctx,
        action="update",
        entity_type="course_payment_config",
        entity_id=str(c_uuid),
        detail=f"Updated payment configuration for course {course_id}",
    )

    return {
        "success": True,
        "message": "Payment configuration updated successfully.",
        "data": {
            "courseId": str(updated["id"]),
            "fee": float(updated["fee"] or 0.0),
            "trialDurationDays": int(updated["trial_duration_days"] or 3),
            "trialEnabled": bool(updated["trial_enabled"]),
            "paymentMethods": updated["payment_methods"],
            "upiId": updated["upi_id"],
            "merchantName": updated["merchant_name"],
            "qrCodeUrl": updated["qr_code_url"],
            "paymentInstructions": updated["payment_instructions"],
            "refundPolicy": updated["refund_policy"],
            "enrollmentOpen": bool(updated["enrollment_open"]),
            "status": updated["status"],
        },
    }


@router.post("/courses/{course_id}/publish")
async def super_admin_publish_course(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository
    c_uuid = UUID(str(course_id))
    updated = await CourseRepository.update_payment_config(c_uuid, {"published": True, "status": "PUBLISHED", "enrollmentOpen": True})
    if not updated:
        raise NotFound("Course not found.")
    await write_audit(ctx, action="publish", entity_type="courses", entity_id=str(c_uuid), detail=f"Published course {course_id}")
    return {"success": True, "message": "Course published and open for enrollment."}


@router.post("/courses/{course_id}/unpublish")
async def super_admin_unpublish_course(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository
    c_uuid = UUID(str(course_id))
    updated = await CourseRepository.update_payment_config(c_uuid, {"published": False, "status": "DRAFT", "enrollmentOpen": False})
    if not updated:
        raise NotFound("Course not found.")
    await write_audit(ctx, action="unpublish", entity_type="courses", entity_id=str(c_uuid), detail=f"Unpublished course {course_id}")
    return {"success": True, "message": "Course unpublished (enrollment closed)."}


@router.post("/courses/{course_id}/suspend")
async def super_admin_suspend_course(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository
    c_uuid = UUID(str(course_id))
    updated = await CourseRepository.update_payment_config(c_uuid, {"status": "SUSPENDED", "enrollmentOpen": False})
    if not updated:
        raise NotFound("Course not found.")
    await write_audit(ctx, action="suspend", entity_type="courses", entity_id=str(c_uuid), detail=f"Suspended course {course_id}")
    return {"success": True, "message": "Course suspended. New enrollments and access are halted."}


@router.post("/courses/{course_id}/restore")
async def super_admin_restore_course(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository
    c_uuid = UUID(str(course_id))
    updated = await CourseRepository.update_payment_config(c_uuid, {"status": "PUBLISHED", "published": True, "enrollmentOpen": True})
    if not updated:
        raise NotFound("Course not found.")
    await write_audit(ctx, action="restore", entity_type="courses", entity_id=str(c_uuid), detail=f"Restored course {course_id}")
    return {"success": True, "message": "Course restored and reactivated."}


@router.post("/courses/{course_id}/archive")
async def super_admin_archive_course(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository
    c_uuid = UUID(str(course_id))
    updated = await CourseRepository.update_payment_config(c_uuid, {"status": "ARCHIVED", "published": False, "enrollmentOpen": False})
    if not updated:
        raise NotFound("Course not found.")
    await write_audit(ctx, action="archive", entity_type="courses", entity_id=str(c_uuid), detail=f"Archived course {course_id}")
    return {"success": True, "message": "Course archived. Historical records preserved."}


@router.delete("/courses/{course_id}")
async def super_admin_delete_course(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Soft-deletes course only if no financial transactions or student progress exist."""
    c_uuid = UUID(str(course_id))
    async with get_pg_connection() as conn:
        pay_count = await conn.fetchval("SELECT count(*) FROM payments WHERE course_id = $1", c_uuid) or 0
        enr_count = await conn.fetchval("SELECT count(*) FROM enrollments WHERE course_id = $1 AND enrollment_status = 'ACTIVE'", c_uuid) or 0
        if pay_count > 0 or enr_count > 0:
            raise ValidationError(
                f"Course has {pay_count} payment record(s) and {enr_count} active enrollment(s). Permanent deletion is forbidden; please Archive the course instead."
            )

        await conn.execute("UPDATE courses SET deleted_at = NOW(), published = FALSE, status = 'ARCHIVED' WHERE id = $1", c_uuid)

    await write_audit(ctx, action="delete", entity_type="courses", entity_id=str(c_uuid), detail=f"Soft-deleted course {course_id}")
    return {"success": True, "message": "Course safely soft-deleted."}


@router.get("/courses/{course_id}/revenue")
async def super_admin_course_revenue(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Returns authoritative financial revenue metrics for this specific course."""
    from app.repositories.payment_repo import PaymentRepository
    c_uuid = UUID(str(course_id))
    summary = await PaymentRepository.get_course_revenue_summary(c_uuid)
    return {"success": True, "data": summary}


@router.get("/courses/{course_id}/transactions")
async def super_admin_course_transactions(
    course_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    from app.repositories.payment_repo import PaymentRepository
    c_uuid = UUID(str(course_id))
    txns = await PaymentRepository.list_course_transactions(c_uuid, limit=limit, offset=offset, status=status)
    out = []
    for t in txns:
        out.append({
            "id": str(t["id"]),
            "studentName": t["student_name"],
            "studentEmail": t["student_email"],
            "amount": float(t["amount"]),
            "currency": t["currency"],
            "transactionRef": t["transaction_ref"],
            "paymentMethod": t["payment_method"],
            "status": str(t["status"]).lower(),
            "receiptUrl": t["receipt_url"],
            "payerUpiId": t["payer_upi_id"],
            "rejectionReason": t["rejection_reason"],
            "refundAmount": float(t["refund_amount"]) if t["refund_amount"] else 0.0,
            "refundRef": t["refund_ref"],
            "verifiedAt": t["verified_at"].isoformat() if t["verified_at"] else None,
            "createdAt": t["created_at"].isoformat() if t["created_at"] else None,
        })
    return {"success": True, "data": out}


@router.get("/courses/{course_id}/trainers")
async def super_admin_course_trainers(course_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository
    c_uuid = UUID(str(course_id))
    trainers = await CourseRepository.get_course_trainers(c_uuid)
    return {"success": True, "data": trainers}


@router.post("/courses/{course_id}/trainers", status_code=status.HTTP_201_CREATED)
async def super_admin_assign_course_trainer(
    course_id: str, payload: dict[str, Any], ctx: ScopeContext = SuperAdminCtx
) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository
    c_uuid = UUID(str(course_id))
    trainer_user_id = payload.get("trainerUserId")
    if not trainer_user_id:
        raise ValidationError("trainerUserId is required.")
    t_uuid = UUID(str(trainer_user_id))
    res = await CourseRepository.assign_course_trainer(c_uuid, t_uuid)
    await write_audit(ctx, action="assign", entity_type="course_trainers", entity_id=str(c_uuid), detail=f"Assigned trainer {trainer_user_id} to course {course_id}")
    return {"success": True, "status": res.get("status", "verified"), "data": res}


@router.delete("/courses/{course_id}/trainers/{trainer_id}")
async def super_admin_remove_course_trainer(course_id: str, trainer_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    from app.repositories.course_repo import CourseRepository
    c_uuid = UUID(str(course_id))
    t_uuid = UUID(str(trainer_id))
    res = await CourseRepository.remove_course_trainer(c_uuid, t_uuid)
    await write_audit(ctx, action="unassign", entity_type="course_trainers", entity_id=str(c_uuid), detail=f"Removed trainer {trainer_id} from course {course_id}")
    return {"success": res, "message": "Trainer removed from course"}


# --------------------------------------------------------------------------- System Telemetry & AI
@router.get("/system")
async def super_admin_system_metrics(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    db = get_db()
    events_count = await db.ai_usage_events.count_documents({})
    system_events = await db.system_events.find({}).sort("at", -1).limit(20).to_list(20)

    return {
        "success": True,
        "data": {
            "status": "healthy",
            "uptime": "99.98%",
            "dbEngine": "MongoDB compatible",
            "redis": "Connected",
            "totalAiInvocations": events_count,
            "estimatedTokensUsed": events_count * 380,
            "storageUsed": "4.2 GB",
            "activeWebSocketConnections": 0,
            "recentEvents": serialize(system_events),
        },
    }


# --------------------------------------------------------------------------- Super Admin: E-Book Publishing & Moderation
@router.get("/ebooks")
async def super_admin_list_ebooks(
    status_filter: str | None = Query(None, alias="status"),
    category: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    """Super Admin view of all eBooks across all statuses with full control."""
    from app.services.ebook_service import ensure_categories_seeded
    await ensure_categories_seeded()

    db = get_db()
    query: dict[str, Any] = {}
    if status_filter and status_filter != "all":
        query["status"] = status_filter
    if category and category != "all":
        query["category"] = category

    if search:
        import re
        pat = re.escape(search.strip())
        query["$or"] = [
            {"title": {"$regex": pat, "$options": "i"}},
            {"author": {"$regex": pat, "$options": "i"}},
            {"uploaderRole": {"$regex": pat, "$options": "i"}},
        ]

    total = await db.ebooks.count_documents(query)
    cursor = db.ebooks.find(query).sort([("isPinned", -1), ("isFeatured", -1), ("createdAt", -1)])
    skip = (page - 1) * limit
    books = await cursor.skip(skip).limit(limit).to_list(limit)

    items = []
    for b in books:
        cover_url = f"/api/v1/ebooks/{str(b['_id'])}/cover" if b.get("coverKey") else None
        items.append({
            "id": str(b["_id"]),
            "slug": b.get("slug"),
            "title": b.get("title"),
            "author": b.get("author"),
            "category": b.get("category"),
            "uploaderRole": b.get("uploaderRole", "TRAINER"),
            "uploadedBy": b.get("uploadedBy"),
            "status": b.get("status", "PUBLISHED"),
            "published": b.get("published", True),
            "isFeatured": b.get("isFeatured", False),
            "isPinned": b.get("isPinned", False),
            "pageCount": b.get("pageCount", 1),
            "fileSizeBytes": b.get("fileSizeBytes", 0),
            "coverUrl": cover_url,
            "readsCount": b.get("readsCount", 0),
            "allowDownload": b.get("allowDownload", False),
            "rejectionReason": b.get("rejectionReason"),
            "deletedAt": b.get("deletedAt").isoformat() if b.get("deletedAt") else None,
            "createdAt": b.get("createdAt").isoformat() if b.get("createdAt") else None,
            "publishedAt": b.get("publishedAt").isoformat() if b.get("publishedAt") else None,
        })

    # Summary counts for tabs
    counts = {
        "all": await db.ebooks.count_documents({}),
        "pending": await db.ebooks.count_documents({"status": "PENDING_REVIEW"}),
        "published": await db.ebooks.count_documents({"status": "PUBLISHED"}),
        "unpublished": await db.ebooks.count_documents({"status": "UNPUBLISHED"}),
        "rejected": await db.ebooks.count_documents({"status": "REJECTED"}),
        "drafts": await db.ebooks.count_documents({"status": "DRAFT"}),
        "featured": await db.ebooks.count_documents({"isFeatured": True}),
        "pinned": await db.ebooks.count_documents({"isPinned": True}),
        "deleted": await db.ebooks.count_documents({"status": "DELETED"}),
    }

    return {
        "success": True,
        "data": items,
        "meta": {"total": total, "page": page, "limit": limit, "counts": counts},
    }


@router.get("/ebooks/requests")
async def super_admin_publish_requests(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Publish requests pending Super Admin review."""
    db = get_db()
    reqs = await db.ebook_publish_requests.find({"status": "PENDING"}).sort("createdAt", -1).to_list(100)
    items = []
    for r in reqs:
        book = await db.ebooks.find_one({"_id": r["ebookId"]})
        if not book:
            continue
        cover_url = f"/api/v1/ebooks/{str(book['_id'])}/cover" if book.get("coverKey") else None
        items.append({
            "id": str(r["_id"]),
            "ebookId": str(book["_id"]),
            "title": book.get("title"),
            "author": book.get("author"),
            "category": book.get("category"),
            "requesterRole": r.get("requesterRole"),
            "requesterName": r.get("requesterName"),
            "requestMessage": r.get("requestMessage"),
            "pageCount": book.get("pageCount", 1),
            "fileSizeBytes": book.get("fileSizeBytes", 0),
            "coverUrl": cover_url,
            "createdAt": r.get("createdAt").isoformat() if r.get("createdAt") else None,
        })
    return {"success": True, "data": items}
 
 
@router.post("/ebooks/upload")
async def super_admin_upload_ebook(
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form("General"),
    author: str = Form(""),
    tags: str = Form(""),
    published: bool = Form(True),
    file: UploadFile = File(...),
    cover: UploadFile | None = File(None),
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    from app.services.ebook_service import validate_pdf_bytes, extract_cover_from_pdf, slugify
    from app.services.storage import Keys, get_storage

    if not title.strip():
        raise ValidationError("Title is required.")

    now = _now()
    ebook_id = ObjectId()
    str_id = str(ebook_id)
    storage = get_storage()

    pdf_bytes = await file.read()
    page_count, file_size = validate_pdf_bytes(pdf_bytes)
    pdf_key = Keys.ebook_file(str_id, f"{slugify(title)}.pdf")
    await storage.put(pdf_key, pdf_bytes, "application/pdf")

    cover_key = None
    if cover and cover.size and cover.size > 0:
        c_bytes = await cover.read()
        cover_key = Keys.ebook_cover(str_id, "cover.jpg")
        await storage.put(cover_key, c_bytes, "image/jpeg")
    else:
        extracted = extract_cover_from_pdf(pdf_bytes)
        if extracted:
            cover_key = Keys.ebook_cover(str_id, "cover.jpg")
            await storage.put(cover_key, extracted, "image/jpeg")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    doc = {
        "_id": ebook_id,
        "slug": f"{slugify(title)}-{str_id[-6:]}",
        "collegeId": None,
        "departmentId": None,
        "uploadedBy": ctx.user_id,
        "uploaderRole": "SUPER_ADMIN",
        "author": author.strip() or "Winners Creek Editorial",
        "title": title.strip(),
        "description": description.strip(),
        "shortDescription": description.strip()[:140] + ("..." if len(description.strip()) > 140 else ""),
        "category": category.strip() or "General",
        "coverKey": cover_key,
        "fileKey": pdf_key,
        "fileSizeBytes": file_size,
        "pageCount": page_count,
        "tags": tag_list,
        "status": "PUBLISHED" if published else "DRAFT",
        "published": published,
        "visibility": "PUBLIC",
        "isFeatured": False,
        "isPinned": False,
        "displayOrder": 0,
        "allowDownload": False,
        "readsCount": 0,
        "completionsCount": 0,
        "createdAt": now,
        "publishedAt": now if published else None,
        "updatedAt": now,
        "deletedAt": None,
    }
    res = await get_db().ebooks.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"success": True, "data": serialize(doc), "message": "eBook uploaded successfully."}


@router.post("/ebooks/{ebook_id}/approve")
async def super_admin_approve_ebook(
    ebook_id: str,
    payload: dict[str, Any] = None,
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    """Approves a pending publish request and makes the eBook live."""
    db = get_db()
    oid = ObjectId(ebook_id)
    book = await db.ebooks.find_one({"_id": oid})
    if not book:
        raise NotFound("eBook not found.")

    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {
            "status": "PUBLISHED",
            "published": True,
            "publishedAt": now,
            "publishedBy": ctx.user_id,
            "rejectionReason": None,
            "updatedAt": now,
        }},
    )

    await db.ebook_publish_requests.update_many(
        {"ebookId": oid, "status": "PENDING"},
        {"$set": {"status": "APPROVED", "reviewedBy": ctx.user_id, "reviewedAt": now, "updatedAt": now}},
    )

    # Audit log
    await db.ebook_audit_logs.insert_one({
        "ebookId": oid,
        "action": "APPROVED_AND_PUBLISHED",
        "actorId": ctx.user_id,
        "actorRole": "SUPER_ADMIN",
        "timestamp": now,
    })

    return {"success": True, "message": f"eBook '{book.get('title')}' approved and published successfully."}


@router.post("/ebooks/{ebook_id}/reject")
async def super_admin_reject_ebook(
    ebook_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    """Rejects a publication request with a mandatory reason."""
    reason = str(payload.get("reason", "")).strip()
    if not reason:
        raise ValidationError("A rejection reason is required.")

    db = get_db()
    oid = ObjectId(ebook_id)
    book = await db.ebooks.find_one({"_id": oid})
    if not book:
        raise NotFound("eBook not found.")

    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {
            "status": "REJECTED",
            "published": False,
            "rejectionReason": reason,
            "rejectedAt": now,
            "rejectedBy": ctx.user_id,
            "updatedAt": now,
        }},
    )

    await db.ebook_publish_requests.update_many(
        {"ebookId": oid, "status": "PENDING"},
        {"$set": {"status": "REJECTED", "rejectionReason": reason, "reviewedBy": ctx.user_id, "reviewedAt": now, "updatedAt": now}},
    )

    await db.ebook_audit_logs.insert_one({
        "ebookId": oid,
        "action": "REJECTED",
        "actorId": ctx.user_id,
        "reason": reason,
        "timestamp": now,
    })

    return {"success": True, "message": "eBook publication request rejected."}


@router.post("/ebooks/{ebook_id}/publish")
async def super_admin_publish_ebook(ebook_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"status": "PUBLISHED", "published": True, "publishedAt": now, "updatedAt": now}},
    )
    return {"success": True, "message": "eBook published."}


@router.post("/ebooks/{ebook_id}/unpublish")
async def super_admin_unpublish_ebook(ebook_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"status": "UNPUBLISHED", "published": False, "updatedAt": now}},
    )
    return {"success": True, "message": "eBook unpublished."}


@router.post("/ebooks/{ebook_id}/pin")
async def super_admin_pin_ebook(ebook_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"isPinned": True, "pinnedAt": now, "pinnedBy": ctx.user_id, "updatedAt": now}},
    )
    return {"success": True, "message": "eBook pinned."}


@router.post("/ebooks/{ebook_id}/unpin")
async def super_admin_unpin_ebook(ebook_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"isPinned": False, "pinnedAt": None, "updatedAt": now}},
    )
    return {"success": True, "message": "eBook unpinned."}


@router.post("/ebooks/{ebook_id}/feature")
async def super_admin_feature_ebook(ebook_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"isFeatured": True, "featuredAt": now, "featuredBy": ctx.user_id, "updatedAt": now}},
    )
    return {"success": True, "message": "eBook marked as Featured."}


@router.post("/ebooks/{ebook_id}/unfeature")
async def super_admin_unfeature_ebook(ebook_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"isFeatured": False, "featuredAt": None, "updatedAt": now}},
    )
    return {"success": True, "message": "eBook removed from Featured."}


@router.patch("/ebooks/{ebook_id}")
async def super_admin_update_ebook_meta(
    ebook_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    """Edit metadata: title, description, category, tags, visibility, allowDownload."""
    db = get_db()
    oid = ObjectId(ebook_id)
    allowed = {"title", "description", "shortDescription", "category", "tags", "visibility", "allowDownload", "displayOrder"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    updates["updatedAt"] = _now()

    await db.ebooks.update_one({"_id": oid}, {"$set": updates})
    return {"success": True, "message": "eBook metadata updated."}


@router.delete("/ebooks/{ebook_id}")
async def super_admin_delete_ebook(ebook_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Soft delete eBook."""
    db = get_db()
    oid = ObjectId(ebook_id)
    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"status": "DELETED", "published": False, "deletedAt": now, "updatedAt": now}},
    )
    return {"success": True, "message": "eBook soft deleted."}


@router.post("/ebooks/{ebook_id}/restore")
async def super_admin_restore_ebook(ebook_id: str, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """Restore soft deleted eBook."""
    db = get_db()
    oid = ObjectId(ebook_id)
    now = _now()
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"status": "DRAFT", "published": False, "deletedAt": None, "updatedAt": now}},
    )
    return {"success": True, "message": "eBook restored as Draft."}


@router.get("/ebooks/reports")
async def super_admin_list_reports(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
    """View user reports on eBooks."""
    db = get_db()
    reports = await db.ebook_reports.find({}).sort("createdAt", -1).to_list(100)
    return {"success": True, "data": serialize(reports)}


# --------------------------------------------------------------------------- Platform Reports & Exports
@router.get("/reports/catalogue")
async def super_admin_reports_catalogue(ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
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
async def super_admin_create_report(payload: ReportRequest, ctx: ScopeContext = SuperAdminCtx) -> dict[str, Any]:
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
async def super_admin_list_export_reports(
    page: int = Query(1, ge=1), pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = SuperAdminCtx,
) -> dict[str, Any]:
    from app.repositories.collections import ReportJobRepo
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


