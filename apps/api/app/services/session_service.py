"""Session and refresh-token lifecycle.

Redis is the primary source of truth for liveness (which sessions may still refresh).
PostgreSQL `refresh_sessions` stores persistent session audit logs for device security views.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.authz.audit import write_security_event
from app.core.config import settings
from app.core.errors import Unauthenticated
from app.core.logging import get_logger
from app.core.redis_client import K, get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_token,
)
from app.db.postgres import get_pg_connection

log = get_logger("app.sessions")

REFRESH_TTL = settings.REFRESH_TOKEN_TTL_DAYS * 86400


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_uuid(val: Any) -> UUID | None:
    if not val:
        return None
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


async def open_session(
    *,
    user: dict[str, Any],
    ip: str | None,
    user_agent: str | None,
    remember_me: bool = False,
) -> dict[str, Any]:
    """Create a session + access/refresh pair for a freshly authenticated user."""
    user_id = str(user.get("id") or user.get("_id"))
    session_id, family_id = uuid.uuid4().hex, uuid.uuid4().hex
    redis = get_redis()

    access_token, access_expiry = create_access_token(
        user_id=user_id,
        role=str(user["role"]),
        college_id=str(user["collegeId"]) if user.get("collegeId") else None,
        department_id=str(user["departmentId"]) if user.get("departmentId") else None,
        session_id=session_id,
    )
    refresh_token, refresh_jti, refresh_expiry = create_refresh_token(
        user_id=user_id, session_id=session_id, family_id=family_id
    )

    ttl = REFRESH_TTL * (2 if remember_me else 1)
    await redis.delete(K.user_revoked_at(user_id))
    await redis.setex(K.session(user_id, session_id), ttl, family_id)
    await redis.sadd(K.session_index(user_id), session_id)
    await redis.setex(K.refresh(refresh_jti), ttl, session_id)
    await redis.sadd(K.refresh_family(family_id), refresh_jti)
    await redis.expire(K.refresh_family(family_id), ttl)

    try:
        u_uuid = _to_uuid(user_id)
        c_uuid = _to_uuid(user.get("collegeId") or user.get("institution_id"))
        d_uuid = _to_uuid(user.get("departmentId") or user.get("department_id"))
        if u_uuid:
            async with get_pg_connection() as conn:
                await conn.execute(
                    """
                    INSERT INTO refresh_sessions (
                        user_id, institution_id, department_id, session_id, family_id,
                        ip_address, user_agent, remember_me, current_jti_hash,
                        created_at, last_used_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                    ON CONFLICT (session_id) DO NOTHING
                    """,
                    u_uuid,
                    c_uuid,
                    d_uuid,
                    session_id,
                    family_id,
                    ip,
                    user_agent,
                    remember_me,
                    hash_token(refresh_jti),
                )
    except Exception as exc:
        log.warning("session_pg_insert_failed", extra={"error": str(exc)})

    return {
        "accessToken": access_token,
        "accessTokenExpiresAt": access_expiry,
        "refreshToken": refresh_token,
        "refreshTokenExpiresAt": refresh_expiry,
        "sessionId": session_id,
    }


async def refresh_session(refresh_token_raw: str, ip: str | None = None) -> dict[str, Any]:
    claims = decode_token(refresh_token_raw, expected_type="refresh")
    user_id = str(claims["sub"])
    session_id = str(claims["sid"])
    family_id = str(claims["fam"])
    jti = str(claims["jti"])

    redis = get_redis()

    if await redis.get(K.denylist(jti)):
        log.warning("refresh_reuse_detected", extra={"user_id": user_id, "session_id": session_id})
        await revoke_family(user_id, family_id, reason="refresh_reuse")
        await write_security_event(
            kind="refresh_token_reuse",
            user_id=user_id,
            detail="rotated refresh token re-presented; session family terminated",
            ip=ip,
        )
        raise Unauthenticated("Invalid session — please sign in again")

    stored_session_id = await redis.get(K.refresh(jti))
    if not stored_session_id or stored_session_id != session_id:
        raise Unauthenticated("Session expired or invalid")

    user = None
    try:
        from app.repositories.user_repo import UserRepository
        pg_user = await UserRepository.get_by_id(user_id)
        if pg_user:
            user = {
                "id": str(pg_user["id"]),
                "_id": str(pg_user["id"]),
                "name": pg_user["name"],
                "email": pg_user["email"],
                "role": str(pg_user["role"]).upper(),
                "collegeId": str(pg_user["institution_id"]) if pg_user.get("institution_id") else None,
                "departmentId": str(pg_user["department_id"]) if pg_user.get("department_id") else None,
                "status": str(pg_user["status"]).lower(),
            }
    except Exception:
        user = None

    if not user or user.get("status") not in ("active", "ACTIVE", None):
        await close_session(user_id, session_id)
        raise Unauthenticated("This account is no longer active")

    ttl = await redis.ttl(K.refresh(jti))
    await redis.setex(K.denylist(jti), max(60, ttl if ttl and ttl > 0 else REFRESH_TTL), "rotated")
    await redis.delete(K.refresh(jti))

    access_token, access_expiry = create_access_token(
        user_id=user_id,
        role=str(user["role"]),
        college_id=str(user["collegeId"]) if user.get("collegeId") else None,
        department_id=str(user["departmentId"]) if user.get("departmentId") else None,
        session_id=session_id,
    )
    new_refresh, new_jti, refresh_expiry = create_refresh_token(
        user_id=user_id, session_id=session_id, family_id=family_id
    )
    remaining = await redis.ttl(K.session(user_id, session_id))
    ttl_out = max(300, remaining if remaining and remaining > 0 else REFRESH_TTL)
    await redis.setex(K.refresh(new_jti), ttl_out, session_id)
    await redis.sadd(K.refresh_family(family_id), new_jti)

    try:
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE refresh_sessions
                SET last_used_at = NOW(), current_jti_hash = $2, ip_address = $3
                WHERE session_id = $1
                """,
                session_id,
                hash_token(new_jti),
                ip,
            )
    except Exception:
        pass

    return {
        "accessToken": access_token,
        "accessTokenExpiresAt": access_expiry,
        "refreshToken": new_refresh,
        "refreshTokenExpiresAt": refresh_expiry,
        "sessionId": session_id,
        "user": user,
    }


async def close_session(user_id: str, session_id: str) -> None:
    redis = get_redis()
    family_id = await redis.get(K.session(user_id, session_id))
    await redis.delete(K.session(user_id, session_id))
    await redis.srem(K.session_index(user_id), session_id)
    if family_id:
        for jti in await redis.smembers(K.refresh_family(family_id)) or []:
            await redis.setex(K.denylist(jti), REFRESH_TTL, "logout")
            await redis.delete(K.refresh(jti))
        await redis.delete(K.refresh_family(family_id))

    try:
        async with get_pg_connection() as conn:
            await conn.execute(
                "UPDATE refresh_sessions SET revoked_at = NOW() WHERE session_id = $1",
                session_id,
            )
    except Exception:
        pass


async def revoke_family(user_id: str, family_id: str, *, reason: str) -> None:
    redis = get_redis()
    for jti in await redis.smembers(K.refresh_family(family_id)) or []:
        await redis.setex(K.denylist(jti), REFRESH_TTL, reason)
        await redis.delete(K.refresh(jti))
    await redis.delete(K.refresh_family(family_id))
    for session_id in await redis.smembers(K.session_index(user_id)) or []:
        if await redis.get(K.session(user_id, session_id)) == family_id:
            await redis.delete(K.session(user_id, session_id))
            await redis.srem(K.session_index(user_id), session_id)

    try:
        async with get_pg_connection() as conn:
            await conn.execute(
                "UPDATE refresh_sessions SET revoked_at = NOW() WHERE family_id = $1",
                family_id,
            )
    except Exception:
        pass


async def revoke_all_sessions(user_id: str, *, reason: str = "logout_all") -> int:
    redis = get_redis()
    sessions = list(await redis.smembers(K.session_index(user_id)) or [])
    for session_id in sessions:
        await close_session(user_id, session_id)
    await redis.delete(K.session_index(user_id))
    await redis.setex(K.user_revoked_at(user_id), REFRESH_TTL, str(int(_now().timestamp())))

    try:
        u_uuid = _to_uuid(user_id)
        if u_uuid:
            async with get_pg_connection() as conn:
                await conn.execute(
                    "UPDATE refresh_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
                    u_uuid,
                )
    except Exception:
        pass

    log.info("sessions_revoked", extra={"user_id": user_id, "count": len(sessions), "reason": reason})
    return len(sessions)


async def list_active_sessions(user_id: str, current_session_id: str | None = None) -> list[dict]:
    rows = []
    try:
        u_uuid = _to_uuid(user_id)
        if u_uuid:
            async with get_pg_connection() as conn:
                rows = await conn.fetch(
                    """
                    SELECT session_id, ip_address, user_agent, created_at, last_used_at
                    FROM refresh_sessions
                    WHERE user_id = $1 AND revoked_at IS NULL
                    ORDER BY last_used_at DESC
                    LIMIT 50
                    """,
                    u_uuid,
                )
    except Exception as exc:
        log.warning("list_active_sessions_failed", extra={"error": str(exc)})

    redis = get_redis()
    live = set(await redis.smembers(K.session_index(user_id)) or [])

    out = []
    for r in rows:
        sid = r["session_id"]
        out.append(
            {
                "id": sid,
                "sessionId": sid,
                "ip": r["ip_address"] or "Unknown",
                "userAgent": r["user_agent"] or "Browser",
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                "lastUsedAt": r["last_used_at"].isoformat() if r["last_used_at"] else None,
                "isCurrent": sid == current_session_id,
                "isAlive": sid in live,
            }
        )
    return out
