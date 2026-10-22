"""Session and refresh-token lifecycle.

Redis is the source of truth for *liveness* (which sessions may still refresh) and MongoDB keeps a
readable device list for the user's "Connected devices" / "Session security" panel.

Rotation model: each login opens a **family**. Every refresh issues a new token inside the family
and denylists the one it replaced. Presenting an already-rotated token is treated as theft: the
whole family is revoked and a security event is written.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

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
from app.db.mongo import get_db

log = get_logger("app.sessions")

REFRESH_TTL = settings.REFRESH_TOKEN_TTL_DAYS * 86400


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def open_session(
    *,
    user: dict[str, Any],
    ip: str | None,
    user_agent: str | None,
    remember_me: bool = False,
) -> dict[str, Any]:
    """Create a session + access/refresh pair for a freshly authenticated user."""
    user_id = str(user["_id"])
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
    # A successful sign-in supersedes any earlier "everything before now is revoked" marker;
    # otherwise logging in within the same second as a revocation would invalidate itself.
    # Old tokens stay dead regardless, because their session keys were deleted.
    await redis.delete(K.user_revoked_at(user_id))
    await redis.setex(K.session(user_id, session_id), ttl, family_id)
    await redis.sadd(K.session_index(user_id), session_id)
    await redis.setex(K.refresh(refresh_jti), ttl, session_id)
    await redis.sadd(K.refresh_family(family_id), refresh_jti)
    await redis.expire(K.refresh_family(family_id), ttl)

    await get_db().refresh_sessions.insert_one(
        {
            "userId": user["_id"],
            # Tenant stamp: an admin's "active sessions" figure is a per-institution number, and
            # the only way to compute it per institution is to record which institution the
            # session belongs to when it is opened.
            "collegeId": user.get("collegeId"),
            "departmentId": user.get("departmentId"),
            "sessionId": session_id,
            "familyId": family_id,
            "ip": ip,
            "userAgent": user_agent,
            "rememberMe": remember_me,
            "createdAt": _now(),
            "lastUsedAt": _now(),
            "revokedAt": None,
            "currentJtiHash": hash_token(refresh_jti),
        }
    )
    return {
        "accessToken": access_token,
        "accessTokenExpiresAt": access_expiry,
        "refreshToken": refresh_token,
        "refreshTokenExpiresAt": refresh_expiry,
        "sessionId": session_id,
    }


def _safe_user_id(uid: Any) -> Any:
    if uid is None:
        return None
    s = str(uid).strip()
    if ObjectId.is_valid(s):
        return ObjectId(s)
    return s


async def rotate_session(refresh_token: str, *, ip: str | None = None) -> dict[str, Any]:
    """Validate + rotate. Reuse of a retired token revokes the entire family."""
    payload = decode_token(refresh_token, expected_type="refresh")
    user_id, session_id = str(payload["sub"]), str(payload["sid"])
    family_id, jti = str(payload.get("fam", "")), str(payload["jti"])
    redis = get_redis()

    if await redis.exists(K.denylist(jti)):
        # Replay of a rotated token — assume compromise (master prompt §31).
        await revoke_family(user_id, family_id, reason="refresh_token_reuse")
        await write_security_event(
            kind="refresh_token_reuse",
            user_id=_safe_user_id(user_id),
            detail="A retired refresh token was replayed; the token family was revoked",
            ip=ip,
            metadata={"familyId": family_id},
        )  # tenant is derived from the user record inside write_security_event
        raise Unauthenticated("Your session was ended for security reasons. Please sign in again.")

    if not await redis.exists(K.refresh(jti)) or not await redis.exists(
        K.session(user_id, session_id)
    ):
        raise Unauthenticated("Your session has expired")

    revoked_at = await redis.get(K.user_revoked_at(user_id))
    if revoked_at and int(revoked_at) > int(payload.get("iat", 0)):
        raise Unauthenticated("Please sign in again")

    user = None
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        async with get_pg_connection() as conn:
            try:
                user_row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", UUID(str(user_id)))
                if user_row:
                    user = dict(user_row)
                    user["id"] = str(user["id"])
                    user["_id"] = str(user["id"])
                    user["role"] = user["role"].upper() if isinstance(user["role"], str) else str(user["role"]).upper()
                    user["collegeId"] = user.get("institution_id")
                    user["departmentId"] = user.get("department_id")
            except Exception:
                user = None
    if not user:
        user = await get_db().users.find_one({"_id": _safe_user_id(user_id)})
    if not user or user.get("status") not in ("active", "ACTIVE", None):
        await close_session(user_id, session_id)
        raise Unauthenticated("This account is no longer active")

    # Retire the presented token.
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

    await get_db().refresh_sessions.update_one(
        {"sessionId": session_id},
        {"$set": {"lastUsedAt": _now(), "currentJtiHash": hash_token(new_jti), "ip": ip}},
    )
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
    await get_db().refresh_sessions.update_one(
        {"sessionId": session_id}, {"$set": {"revokedAt": _now()}}
    )


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
    await get_db().refresh_sessions.update_many(
        {"familyId": family_id}, {"$set": {"revokedAt": _now(), "revokeReason": reason}}
    )


async def revoke_all_sessions(user_id: str, *, reason: str = "logout_all") -> int:
    """Used by logout-all, password reset and account deactivation (immediate invalidation)."""
    redis = get_redis()
    sessions = list(await redis.smembers(K.session_index(user_id)) or [])
    for session_id in sessions:
        await close_session(user_id, session_id)
    await redis.delete(K.session_index(user_id))
    # Any access token minted before this instant is refused by the guard.
    await redis.setex(K.user_revoked_at(user_id), REFRESH_TTL, str(int(_now().timestamp())))
    await get_db().refresh_sessions.update_many(
        {"userId": _safe_user_id(user_id), "revokedAt": None},
        {"$set": {"revokedAt": _now(), "revokeReason": reason}},
    )
    log.info("sessions_revoked", extra={"user_id": user_id, "count": len(sessions), "reason": reason})
    return len(sessions)


async def list_active_sessions(user_id: str, current_session_id: str | None = None) -> list[dict]:
    rows = await (
        get_db()
        .refresh_sessions.find({"userId": _safe_user_id(user_id), "revokedAt": None})
        .sort("lastUsedAt", -1)
        .to_list(length=50)
    )
    redis = get_redis()
    live = set(await redis.smembers(K.session_index(user_id)) or [])
    return [
        {
            "id": str(r["_id"]),
            "sessionId": r["sessionId"],
            "ip": r.get("ip"),
            "userAgent": r.get("userAgent"),
            "createdAt": r.get("createdAt"),
            "lastUsedAt": r.get("lastUsedAt"),
            "current": r["sessionId"] == current_session_id,
            "active": r["sessionId"] in live,
        }
        for r in rows
    ]
