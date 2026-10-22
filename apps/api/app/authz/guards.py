"""Centralized authorization.

The check sequence for every protected endpoint (SRS §14.3):
  1. authenticated?                      → 401
  2. role allowed for this action?       → 403
  3. requested college matches token?    → 403 + security log
  4. requested department matches token? → 403 + security log
  5. does the target resource itself sit inside the scope? → 403/404 + security log
  6. allow

Scoping lives here and in the repository layer only, so it cannot drift endpoint by endpoint.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Callable

from bson import ObjectId
from fastapi import Depends, Request

from app.authz.audit import write_security_event
from app.authz.context import ScopeContext
from app.authz.roles import DEPARTMENT_BOUND, Role, parse_role
from app.core.config import settings
from app.core.errors import RoleForbidden, ScopeForbidden, Unauthenticated
from app.core.redis_client import K, get_redis
from app.core.security import decode_token
from app.db.mongo import get_db

BEARER = "bearer "


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


async def _bearer_payload(request: Request) -> dict[str, Any]:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith(BEARER):
        raise Unauthenticated("Authentication required")
    return decode_token(header[len(BEARER):].strip(), expected_type="access")


async def get_scope_context(request: Request) -> ScopeContext:
    """Resolve and re-verify the authorization context on every request.

    The token is not trusted on its own: the user record is re-read so that a role change,
    department reassignment, or deactivation takes effect immediately rather than at token expiry.
    """
    payload = await _bearer_payload(request)
    user_id_raw, session_id, jti = payload.get("sub"), payload.get("sid", ""), payload.get("jti", "")
    try:
        user_id = ObjectId(str(user_id_raw))
    except Exception:
        try:
            from uuid import UUID as PyUUID
            user_id = PyUUID(str(user_id_raw))
        except Exception as exc:
            raise Unauthenticated("Invalid authentication token") from exc

    redis = get_redis()
    try:
        if await redis.exists(K.denylist(jti)):
            raise Unauthenticated("Your session has been signed out")
        if not await redis.exists(K.session(str(user_id), session_id)):
            raise Unauthenticated("Your session is no longer active")
        revoked_at = await redis.get(K.user_revoked_at(str(user_id)))
        if revoked_at and int(revoked_at) > int(payload.get("iat", 0)):
            raise Unauthenticated("Please sign in again")
    except Unauthenticated:
        raise
    except Exception:  # pragma: no cover - Redis outage must not silently grant access
        raise Unauthenticated("Session store unavailable — please sign in again")

    user = None
    if settings.USE_POSTGRES:
        from app.repositories.user_repo import UserRepository
        try:
            pg_user = await UserRepository.get_by_id(str(user_id))
            if pg_user:
                user = {
                    "_id": str(pg_user["id"]),
                    "name": pg_user["name"],
                    "email": pg_user["email"],
                    "role": pg_user["role"],
                    "collegeId": str(pg_user["institution_id"]) if pg_user.get("institution_id") else None,
                    "departmentId": str(pg_user["department_id"]) if pg_user.get("department_id") else None,
                    "status": str(pg_user["status"]).lower(),
                    "emailVerified": True,
                }
        except Exception:
            pass

    if not user:
        db = get_db()
        user = await db.users.find_one(
            {"_id": user_id},
            {
                "name": 1, "email": 1, "role": 1, "collegeId": 1, "departmentId": 1,
                "status": 1, "emailVerified": 1,
            },
        )
    if not user:
        raise Unauthenticated("Account not found")
    if user.get("status") != "active":
        raise Unauthenticated("This account is not active")
    if not user.get("emailVerified", False):
        raise Unauthenticated("Please verify your email address to continue")

    role = parse_role(user["role"])
    token_role_str = str(payload.get("role", "")).upper()
    user_primary_role_str = str(role).upper()

    # Support dual-role switching (e.g. SUPER_ADMIN or ADMIN who also has a TRAINER profile)
    active_role = role
    effective_college_id = user.get("collegeId")
    effective_dept_id = user.get("departmentId")

    if token_role_str and token_role_str != user_primary_role_str:
        if token_role_str == "TRAINER" and settings.USE_POSTGRES:
            from app.db.postgres import get_pg_connection
            async with get_pg_connection() as conn:
                try:
                    tp = await conn.fetchrow(
                        "SELECT institution_id, department_id FROM trainer_profiles WHERE user_id = $1::uuid",
                        str(user_id),
                    )
                    if tp:
                        active_role = Role.TRAINER
                        if tp["institution_id"]:
                            effective_college_id = str(tp["institution_id"])
                        if tp["department_id"]:
                            effective_dept_id = str(tp["department_id"])
                except Exception:
                    pass
        if str(active_role).upper() != token_role_str:
            raise Unauthenticated("Your access level changed — please sign in again")

    token_college = payload.get("college_id")
    actual_college = str(effective_college_id) if effective_college_id else None
    if (token_college or None) != actual_college:
        raise Unauthenticated("Your institution assignment changed — please sign in again")
    token_dept = payload.get("department_id")
    actual_dept = str(effective_dept_id) if effective_dept_id else None
    if (token_dept or None) != actual_dept:
        raise Unauthenticated("Your department assignment changed — please sign in again")

    if active_role in DEPARTMENT_BOUND and not effective_dept_id:
        raise ScopeForbidden("Your account is not assigned to a department")

    ctx = ScopeContext(
        user_id=user_id,
        role=active_role,
        college_id=effective_college_id,
        department_id=effective_dept_id,
        session_id=session_id,
        request_id=getattr(request.state, "request_id", "unknown"),
        ip=_client_ip(request),
        email=user.get("email"),
        name=user.get("name"),
    )

    if active_role is Role.TRAINER:
        ctx = await _hydrate_trainer_scope(ctx)
    elif active_role is Role.PARENT:
        ctx = await _hydrate_parent_scope(ctx)

    # FR-12: a request naming a scope other than the caller's own is rejected and logged —
    # not silently ignored, so the security signal is never lost.
    await _reject_client_scope_claims(request, ctx)

    request.state.scope = ctx
    return ctx


#: Scope identifiers a client might try to smuggle in, in any casing/spelling we accept.
_SCOPE_KEYS: dict[str, str] = {
    "collegeid": "college", "college_id": "college",
    "departmentid": "department", "department_id": "department",
    "batchid": "batch", "batch_id": "batch",
    "studentid": "student", "student_id": "student", "studentuserid": "student",
    "trainerid": "trainer", "trainer_id": "trainer", "traineruserid": "trainer",
}

#: Bodies larger than this are not inspected — a file upload must not be buffered here.
_MAX_BODY_INSPECT_BYTES = 256 * 1024


async def _reject_client_scope_claims(request: Request, ctx: ScopeContext) -> None:
    """Validate every scope identifier the client supplied, wherever it came from.

    Covers the query string and a small JSON body. Roles whose scope is fixed server-side
    (HOD, STUDENT, TRAINER, PARENT) are checked here with no database round-trip; roles that may
    legitimately address any department in their own college (ADMIN) are validated by
    `require_department_scope` at the endpoint, which resolves the target's real college.
    """
    if ctx.is_platform_wide:
        return

    claimed: list[tuple[str, str]] = []
    for key, value in request.query_params.multi_items():
        kind = _SCOPE_KEYS.get(key.lower())
        if kind and value and value.lower() not in ("all", "none", "null", ""):
            claimed.append((kind, value))

    if request.method in ("POST", "PATCH", "PUT"):
        content_type = (request.headers.get("content-type") or "").split(";")[0].strip()
        length = int(request.headers.get("content-length") or 0)
        if content_type == "application/json" and 0 < length <= _MAX_BODY_INSPECT_BYTES:
            try:
                # `body()` caches on the request, so the handler can still parse it afterwards.
                import json

                payload = json.loads(await request.body() or b"{}")
            except Exception:
                payload = None
            if isinstance(payload, dict):
                for key, value in payload.items():
                    kind = _SCOPE_KEYS.get(key.lower())
                    if kind and isinstance(value, str) and value:
                        claimed.append((kind, value))

    for kind, raw in claimed:
        try:
            value = ObjectId(str(raw))
        except Exception:
            # A malformed identifier is a validation problem, handled by the endpoint.
            continue

        if kind == "college" and ctx.college_id is not None and value != ctx.college_id:
            await _deny_scope(
                ctx, f"request named college {raw} outside the caller's own institution",
                path=str(request.url.path),
            )
        elif kind == "department":
            if ctx.role in (Role.HOD, Role.STUDENT):
                if ctx.department_id is not None and value != ctx.department_id:
                    await _deny_scope(
                        ctx,
                        f"{ctx.role} bound to department {ctx.department_id} named department {raw}",
                        path=str(request.url.path),
                    )
            elif ctx.role is Role.TRAINER and ctx.department_ids and value not in ctx.department_ids:
                await _deny_scope(
                    ctx, f"trainer named unassigned department {raw}",
                    path=str(request.url.path),
                )
        elif kind == "batch":
            if ctx.role is Role.TRAINER and ctx.batch_ids:
                if value not in ctx.batch_ids:
                    await _deny_scope(
                        ctx, f"trainer named unassigned batch {raw}", path=str(request.url.path)
                    )
            elif ctx.college_id is not None:
                # A named batch must belong to the caller's own scope. Resolving it costs one
                # indexed lookup and only happens when a batch id was actually supplied.
                batch = await get_db().batches.find_one(
                    {"_id": value}, {"collegeId": 1, "departmentId": 1}
                )
                if batch is None:
                    continue  # not-found is the endpoint's concern, not a scope violation
                if batch.get("collegeId") != ctx.college_id:
                    await _deny_scope(
                        ctx, f"request named batch {raw} in another institution",
                        path=str(request.url.path),
                    )
                if (
                    ctx.role in (Role.HOD, Role.STUDENT)
                    and ctx.department_id is not None
                    and batch.get("departmentId") != ctx.department_id
                ):
                    await _deny_scope(
                        ctx, f"request named batch {raw} in another department",
                        path=str(request.url.path),
                    )
        elif kind == "student":
            if ctx.role is Role.STUDENT and value != ctx.user_id:
                await _deny_scope(
                    ctx, "student named another participant", path=str(request.url.path)
                )
            elif ctx.role is Role.PARENT and value not in ctx.linked_student_ids:
                await _deny_scope(
                    ctx, "parent named an unlinked student", path=str(request.url.path)
                )
        elif kind == "trainer" and ctx.role is Role.TRAINER and value != ctx.user_id:
            await _deny_scope(
                ctx, "trainer named another trainer's records", path=str(request.url.path)
            )


async def _hydrate_trainer_scope(ctx: ScopeContext) -> ScopeContext:
    """Trainer scope is derived from active assignments — never from the request."""
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        import uuid
        async with get_pg_connection() as conn:
            try:
                u_uuid = uuid.UUID(str(ctx.user_id))
            except Exception:
                u_uuid = None
            if u_uuid:
                rows = await conn.fetch('''
                    SELECT bt.batch_id, b.department_id
                    FROM batch_trainers bt
                    JOIN batches b ON bt.batch_id = b.id
                    WHERE bt.trainer_user_id = $1
                      AND (bt.status IS NULL OR bt.status = 'ACTIVE')
                      AND (bt.start_date IS NULL OR bt.start_date <= CURRENT_DATE)
                      AND (bt.end_date IS NULL OR bt.end_date >= CURRENT_DATE)
                      AND b.status = 'ACTIVE'
                      AND b.deleted_at IS NULL
                ''', u_uuid)
                batches = tuple({str(r["batch_id"]) for r in rows if r.get("batch_id")})
                depts = tuple({str(r["department_id"]) for r in rows if r.get("department_id")})
                return ScopeContext(
                    **{**ctx.__dict__, "batch_ids": batches, "department_ids": depts}
                )
    rows = await (
        get_db()
        .trainer_assignments.find(
            {"trainerUserId": ctx.user_id, "active": True}, {"batchId": 1, "departmentId": 1}
        )
        .to_list(length=500)
    )
    batches = tuple({r["batchId"] for r in rows if r.get("batchId")})
    depts = tuple({r["departmentId"] for r in rows if r.get("departmentId")})
    return ScopeContext(
        **{**ctx.__dict__, "batch_ids": batches, "department_ids": depts}
    )


async def _hydrate_parent_scope(ctx: ScopeContext) -> ScopeContext:
    rows = await (
        get_db()
        .parent_links.find({"parentUserId": ctx.user_id, "verified": True}, {"studentUserId": 1})
        .to_list(length=50)
    )
    return ScopeContext(
        **{**ctx.__dict__, "linked_student_ids": tuple(r["studentUserId"] for r in rows)}
    )


CurrentUser = Annotated[ScopeContext, Depends(get_scope_context)]


# --------------------------------------------------------------------------- role guard
def require_role(*allowed: Role) -> Callable[..., Any]:
    """Dependency factory: `ctx: ScopeContext = Depends(require_role(Role.HOD))`."""
    allowed_set = frozenset(allowed)

    async def _dep(request: Request, ctx: ScopeContext = Depends(get_scope_context)) -> ScopeContext:
        if ctx.role not in allowed_set and ctx.role is not Role.SUPER_ADMIN:
            await write_security_event(
                kind="role_denied",
                user_id=ctx.user_id,
                detail=f"role {ctx.role} attempted an action allowed only for "
                       f"{sorted(str(r) for r in allowed_set)}",
                request_id=ctx.request_id,
                ip=ctx.ip,
                path=str(request.url.path),
                college_id=ctx.college_id,
                department_id=ctx.department_id,
            )
            raise RoleForbidden()
        return ctx

    return _dep


# --------------------------------------------------------------------------- scope guards
async def _deny_scope(ctx: ScopeContext, reason: str, *, path: str | None = None) -> None:
    await write_security_event(
        kind="scope_denied",
        user_id=ctx.user_id,
        detail=reason,
        request_id=ctx.request_id,
        ip=ctx.ip,
        path=path,
        college_id=ctx.college_id,
        department_id=ctx.department_id,
        metadata={
            "role": str(ctx.role),
            "collegeId": str(ctx.college_id),
            "departmentId": str(ctx.department_id),
        },
    )
    try:
        redis = get_redis()
        key = K.scope_denials(str(ctx.user_id))
        count = await redis.incr(key)
        await redis.expire(key, 900)
        if count >= 5:
            await write_security_event(
                kind="scope_denial_anomaly",
                user_id=ctx.user_id,
                detail=f"{count} cross-scope attempts in 15 minutes — possible scraping or "
                       "compromised account",
                request_id=ctx.request_id,
                ip=ctx.ip,
                college_id=ctx.college_id,
                department_id=ctx.department_id,
            )
    except Exception:  # pragma: no cover
        pass
    raise ScopeForbidden()


def require_college_scope(ctx: ScopeContext, requested: Any) -> ObjectId:
    """Requested college must equal the token's college."""
    if ctx.is_platform_wide:
        return ObjectId(str(requested)) if requested else (ctx.college_id or ObjectId())
    if ctx.college_id is None:
        raise ScopeForbidden()
    if requested and ObjectId(str(requested)) != ctx.college_id:
        raise ScopeForbidden()
    return ctx.college_id


async def require_department_scope(ctx: ScopeContext, requested: Any = None) -> Any:
    """HOD is bound to exactly one department; admins may address any in their own college."""
    req_str = str(requested) if requested is not None else None

    # PostgreSQL UUID resolution
    if settings.USE_POSTGRES and req_str:
        from uuid import UUID
        from app.db.postgres import get_pg_connection
        is_uuid = False
        try:
            req_uuid = UUID(req_str)
            is_uuid = True
        except (ValueError, TypeError):
            is_uuid = False

        if is_uuid:
            inst_uuid = None
            if ctx.college_id:
                try:
                    inst_uuid = UUID(str(ctx.college_id))
                except Exception:
                    pass
            if not inst_uuid:
                inst_uuid = UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")

            async with get_pg_connection() as conn:
                dept = await conn.fetchrow(
                    "SELECT id, institution_id, name FROM departments WHERE id = $1 AND deleted_at IS NULL",
                    req_uuid,
                )
                if not dept:
                    await _deny_scope(ctx, f"department {requested} not found")
                if not ctx.is_platform_wide and dept["institution_id"] != inst_uuid:
                    await _deny_scope(ctx, f"admin requested out-of-college department {requested}")
                if ctx.role is Role.HOD and ctx.department_id is not None:
                    if str(ctx.department_id) != req_str:
                        await _deny_scope(
                            ctx, f"HOD of department {ctx.department_id} requested department {requested}"
                        )
                return req_uuid

    if ctx.role is Role.HOD:
        if ctx.department_id is None:
            raise ScopeForbidden()
        if requested and str(requested) != str(ctx.department_id):
            await _deny_scope(
                ctx, f"HOD of department {ctx.department_id} requested department {requested}"
            )
        return ctx.department_id
    if ctx.role in (Role.ADMIN, Role.SUPER_ADMIN):
        if not requested:
            raise ScopeForbidden("A department must be specified")
        try:
            oid = ObjectId(str(requested))
        except Exception:
            await _deny_scope(ctx, f"invalid department identifier {requested}")
        dept = await get_db().departments.find_one(
            {"_id": oid}, {"collegeId": 1}
        )
        if not dept or (not ctx.is_platform_wide and dept["collegeId"] != ctx.college_id):
            await _deny_scope(ctx, f"admin requested out-of-college department {requested}")
        return oid
    if ctx.role is Role.TRAINER:
        if requested and str(requested) not in [str(d) for d in ctx.department_ids]:
            await _deny_scope(ctx, f"trainer requested unassigned department {requested}")
        return requested if requested else (
            ctx.department_ids[0] if ctx.department_ids else None
        )
    if ctx.role is Role.STUDENT and ctx.department_id is not None:
        if requested and str(requested) != str(ctx.department_id):
            await _deny_scope(ctx, "student requested another department")
        return ctx.department_id
    raise ScopeForbidden()


async def require_trainer_batch_scope(ctx: ScopeContext, batch_id: Any) -> Any:
    """A trainer may only act on batches they are actively assigned to."""
    bid_str = str(batch_id)
    if settings.USE_POSTGRES and len(bid_str) == 36:
        try:
            from uuid import UUID
            from app.db.postgres import get_pg_connection
            b_uuid = UUID(bid_str)
            t_uuid = UUID(str(ctx.user_id))
            async with get_pg_connection() as conn:
                is_assigned = await conn.fetchval(
                    """
                    SELECT 1 FROM batch_trainers 
                    WHERE batch_id = $1 AND trainer_user_id = $2
                      AND (status IS NULL OR status = 'ACTIVE')
                      AND (start_date IS NULL OR start_date <= CURRENT_DATE)
                      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
                    """,
                    b_uuid, t_uuid
                )
                if not is_assigned and ctx.role is Role.TRAINER:
                    await _deny_scope(ctx, f"trainer requested unassigned batch {batch_id}")
            return batch_id
        except ScopeForbidden:
            raise
        except Exception:
            pass

    oid = ObjectId(bid_str)
    if ctx.role in (Role.ADMIN, Role.SUPER_ADMIN, Role.HOD):
        batch = await get_db().batches.find_one({"_id": oid}, {"collegeId": 1, "departmentId": 1})
        if not batch:
            raise ScopeForbidden()
        if not ctx.is_platform_wide and batch["collegeId"] != ctx.college_id:
            await _deny_scope(ctx, f"out-of-college batch {batch_id}")
        if ctx.role is Role.HOD and batch["departmentId"] != ctx.department_id:
            await _deny_scope(ctx, f"HOD requested out-of-department batch {batch_id}")
        return oid
    if ctx.role is not Role.TRAINER:
        raise ScopeForbidden()
    if oid not in ctx.batch_ids:
        await _deny_scope(ctx, f"trainer requested unassigned batch {batch_id}")
    return oid


async def require_trainer_session_scope(ctx: ScopeContext, session_id: Any) -> dict[str, Any]:
    """Attendance/evaluation writes are only allowed on the trainer's own sessions."""
    s_id_str = str(session_id)
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        is_uuid = False
        try:
            s_uuid = UUID(s_id_str)
            is_uuid = True
        except (ValueError, TypeError):
            is_uuid = False

        if is_uuid:
            async with get_pg_connection() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT ts.id, ts.institution_id, ts.department_id, ts.batch_id, ts.trainer_user_id,
                           ts.topic, ts.room, ts.session_date, ts.status, b.name as batch_name
                    FROM training_sessions ts
                    LEFT JOIN batches b ON ts.batch_id = b.id
                    WHERE ts.id = $1
                    """,
                    s_uuid,
                )
                if not row:
                    raise ScopeForbidden()
                session = {
                    "_id": str(row["id"]),
                    "id": str(row["id"]),
                    "collegeId": str(row["institution_id"]) if row["institution_id"] else None,
                    "departmentId": str(row["department_id"]) if row["department_id"] else None,
                    "batchId": str(row["batch_id"]) if row["batch_id"] else None,
                    "batchName": row["batch_name"],
                    "trainerUserId": str(row["trainer_user_id"]) if row["trainer_user_id"] else None,
                    "topic": row["topic"],
                    "room": row["room"],
                    "date": row["session_date"].isoformat() if row["session_date"] else None,
                    "status": row["status"],
                }
                if ctx.role is Role.TRAINER:
                    if session.get("trainerUserId") and str(session.get("trainerUserId")) != str(ctx.user_id):
                        await _deny_scope(ctx, f"trainer requested session {session_id} owned by another trainer")
                    if session.get("batchId") and str(session["batchId"]) not in [str(b) for b in (ctx.batch_ids or ())]:
                        await _deny_scope(ctx, "trainer requested session outside assigned batches")
                    return session
                if ctx.is_platform_wide:
                    return session
                if session.get("collegeId") and ctx.college_id and str(session.get("collegeId")) != str(ctx.college_id):
                    await _deny_scope(ctx, "out-of-college session")
                if ctx.role is Role.HOD and session.get("departmentId") and ctx.department_id and str(session.get("departmentId")) != str(ctx.department_id):
                    await _deny_scope(ctx, "out-of-department session")
                return session

    try:
        oid = ObjectId(s_id_str)
        session = await get_db().training_sessions.find_one({"_id": oid})
    except Exception:
        session = None

    if not session:
        session = await get_db().training_sessions.find_one({"$or": [{"_id": s_id_str}, {"id": s_id_str}]})

    if not session:
        raise ScopeForbidden()
    if ctx.role is Role.TRAINER:
        if str(session.get("trainerUserId")) != str(ctx.user_id):
            await _deny_scope(ctx, f"trainer requested session {session_id} owned by another trainer")
        if session.get("batchId") and ctx.batch_ids and str(session["batchId"]) not in [str(b) for b in ctx.batch_ids]:
            await _deny_scope(ctx, "trainer requested session outside assigned batches")
        return session
    if ctx.is_platform_wide:
        return session
    if session.get("collegeId") != ctx.college_id:
        await _deny_scope(ctx, "out-of-college session")
    if ctx.role is Role.HOD and session.get("departmentId") != ctx.department_id:
        await _deny_scope(ctx, "out-of-department session")
    return session


async def require_student_self(ctx: ScopeContext, student_id: Any) -> ObjectId:
    """Students may only address their own records; parents only their linked student."""
    oid = ObjectId(str(student_id))
    if ctx.role is Role.STUDENT:
        if oid != ctx.user_id:
            await _deny_scope(ctx, "student requested another student's record")
        return oid
    if ctx.role is Role.PARENT:
        return await require_parent_student_link(ctx, oid)
    return await require_student_in_scope(ctx, oid)


async def require_parent_student_link(ctx: ScopeContext, student_id: Any) -> ObjectId:
    oid = ObjectId(str(student_id))
    if oid not in ctx.linked_student_ids:
        await _deny_scope(ctx, "parent requested an unlinked student")
    return oid


async def require_student_in_scope(ctx: ScopeContext, student_id: Any) -> Any:
    """Resolve a student and prove they sit inside the caller's scope (check 5)."""
    sid_str = str(student_id)
    if settings.USE_POSTGRES and len(sid_str) == 36:
        try:
            from uuid import UUID
            from app.db.postgres import get_pg_connection
            s_uuid = UUID(sid_str)
            async with get_pg_connection() as conn:
                prof = await conn.fetchrow("""
                    SELECT sp.user_id, sp.batch_id, u.institution_id, u.department_id
                    FROM users u
                    JOIN student_profiles sp ON sp.user_id = u.id
                    WHERE u.id = $1 AND u.deleted_at IS NULL
                """, s_uuid)
                if not prof:
                    raise ScopeForbidden()
                if ctx.is_platform_wide:
                    return student_id
                if ctx.role is Role.TRAINER:
                    is_assigned = await conn.fetchval(
                        """
                        SELECT 1 FROM batch_trainers 
                        WHERE batch_id = $1 AND trainer_user_id = $2
                          AND (status IS NULL OR status = 'ACTIVE')
                          AND (start_date IS NULL OR start_date <= CURRENT_DATE)
                          AND (end_date IS NULL OR end_date >= CURRENT_DATE)
                        """,
                        prof["batch_id"], UUID(str(ctx.user_id))
                    )
                    if not is_assigned:
                        await _deny_scope(ctx, f"trainer requested student outside assigned batches ({student_id})")
                return student_id
        except ScopeForbidden:
            raise
        except Exception:
            pass
    oid = ObjectId(str(student_id))
    profile = await get_db().student_profiles.find_one(
        {"userId": oid}, {"collegeId": 1, "departmentId": 1, "batchId": 1}
    )
    if not profile:
        # Do not confirm existence outside scope — same shape as a scope denial (SRS §13.1).
        raise ScopeForbidden()
    if ctx.is_platform_wide:
        return oid
    if profile.get("collegeId") != ctx.college_id:
        await _deny_scope(ctx, f"cross-college student access attempt ({student_id})")
    if ctx.role is Role.HOD and profile.get("departmentId") != ctx.department_id:
        await _deny_scope(ctx, f"cross-department student access attempt ({student_id})")
    if ctx.role is Role.TRAINER and profile.get("batchId") not in ctx.batch_ids:
        await _deny_scope(ctx, f"trainer requested student outside assigned batches ({student_id})")
    return oid


async def require_resource_in_scope(
    ctx: ScopeContext, collection: str, resource_id: Any, *, department_bound: bool = True
) -> dict[str, Any]:
    """Generic check 5 for any scoped collection."""
    doc = await get_db()[collection].find_one({"_id": ObjectId(str(resource_id))})
    if not doc:
        raise ScopeForbidden()
    if ctx.is_platform_wide:
        return doc
    if doc.get("collegeId") is not None and doc.get("collegeId") != ctx.college_id:
        await _deny_scope(ctx, f"cross-college access to {collection}/{resource_id}")
    if (
        department_bound
        and ctx.role is Role.HOD
        and doc.get("departmentId") is not None
        and doc.get("departmentId") != ctx.department_id
    ):
        await _deny_scope(ctx, f"cross-department access to {collection}/{resource_id}")
    return doc


def assert_dev_endpoints_enabled() -> None:
    if not settings.ALLOW_DEV_ENDPOINTS or settings.is_production:
        raise RoleForbidden("This endpoint is disabled")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def require_course_access(ctx: ScopeContext, course_id: Any) -> dict[str, Any]:
    """Verify server-side that the student or staff caller is authorized to access course content."""
    from app.services.domain_rules import can_access_course, is_access_active
    from uuid import UUID

    db = get_db()
    course = None
    course_oid = None
    cid_uuid = None
    try:
        cid_uuid = UUID(str(course_id))
    except (ValueError, TypeError):
        cid_uuid = None

    if cid_uuid and settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("SELECT * FROM courses WHERE id = $1 AND deleted_at IS NULL", cid_uuid)
            if row:
                course = dict(row)
                course["_id"] = str(row["id"])
                raw_mode = "BOTH" if row["delivery_mode"] == "HYBRID" else str(row["delivery_mode"]).upper()
                course["courseMode"] = raw_mode
                course["availableModes"] = ["ONLINE", "OFFLINE"] if row["delivery_mode"] == "HYBRID" else [raw_mode]
                course["collegeId"] = None

    if not course:
        try:
            course_oid = ObjectId(str(course_id))
            course = await db.courses.find_one({"_id": course_oid, "deletedAt": None})
        except Exception:
            pass

    if not course:
        raise ScopeForbidden("Course not found")

    if ctx.is_platform_wide:
        return course

    course_mode = course.get("courseMode", "ONLINE")

    if ctx.role is Role.STUDENT:
        if cid_uuid and settings.USE_POSTGRES:
            from app.db.postgres import get_pg_connection
            async with get_pg_connection() as conn:
                try:
                    s_uuid = UUID(str(ctx.user_id))
                    erow = await conn.fetchrow("SELECT * FROM enrollments WHERE participant_user_id = $1 AND course_id = $2", s_uuid, cid_uuid)
                    if erow:
                        return course
                except Exception:
                    pass
        elif course_oid:
            enrollment = await db.enrollments.find_one({
                "studentUserId": ctx.user_id,
                "courseId": course_oid,
                "deletedAt": None,
            })
            if enrollment:
                allowed, reason = can_access_course(ctx, course, enrollment)
                if allowed:
                    return course
                await _deny_scope(ctx, f"participant access denied to course {course_id}: {reason}")

            now = datetime.now(timezone.utc)
            trial = await db.course_trials.find_one({
                "studentUserId": ctx.user_id,
                "courseId": course_oid,
                "status": "active",
            })
            if trial:
                expires_at = trial["expiresAt"]
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if now < expires_at:
                    return course

        await _deny_scope(ctx, f"participant {ctx.user_id} attempted access to course {course_id} without active enrollment or trial")

    if ctx.role in (Role.ADMIN, Role.HOD, Role.TRAINER):
        allowed, reason = can_access_course(ctx, course)
        if not allowed:
            await _deny_scope(ctx, f"{ctx.role} access denied to course {course_id}: {reason}")

    return course
