"""Append-only audit + security event trail (SRS §11.2, §14.4)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.authz.context import ScopeContext
from app.core.logging import get_logger
from app.db.mongo import get_db

log = get_logger("app.audit")

CREATE, UPDATE, DELETE, EXPORT, LOGIN, LOGOUT, ISSUE = (
    "create", "update", "delete", "export", "login", "logout", "issue",
)


def _clean(value: Any) -> Any:
    """Never let a secret reach the audit trail."""
    redact = {"password", "passwordHash", "otp", "token", "refreshToken", "secret"}
    if isinstance(value, dict):
        return {k: ("[redacted]" if k in redact else _clean(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


async def write_audit(
    ctx: ScopeContext | None,
    *,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    before: Any = None,
    after: Any = None,
    detail: str | None = None,
    college_id: ObjectId | None = None,
    department_id: ObjectId | None = None,
    actor_label: str | None = None,
) -> None:
    doc = {
        "actorId": ctx.user_id if ctx else None,
        "actorLabel": actor_label or (ctx.actor_label if ctx else "system"),
        "actorRole": str(ctx.role) if ctx else "SYSTEM",
        "action": action,
        "entityType": entity_type,
        "entityId": entity_id,
        "before": _clean(before),
        "after": _clean(after),
        "detail": detail,
        "collegeId": college_id or (ctx.college_id if ctx else None),
        "departmentId": department_id or (ctx.department_id if ctx else None),
        "requestId": ctx.request_id if ctx else None,
        "ip": ctx.ip if ctx else None,
        "at": datetime.now(timezone.utc),
    }
    try:
        await get_db().audit_logs.insert_one(doc)
    except Exception as exc:  # pragma: no cover - trail must never break the request
        log.error("audit_write_failed", extra={"error": str(exc), "entity": entity_type})


async def write_security_event(
    *,
    kind: str,
    user_id: ObjectId | None,
    detail: str,
    request_id: str | None = None,
    ip: str | None = None,
    path: str | None = None,
    metadata: dict[str, Any] | None = None,
    college_id: ObjectId | None = None,
    department_id: ObjectId | None = None,
) -> None:
    """Every rejected scope attempt, lockout and suspicious auth event lands here.

    The row is stamped with the tenant it belongs to. Without that stamp the only way to read
    these events back is an unscoped query, which is exactly how one institution's admin ends up
    counting — or reading — another institution's security events. When the caller cannot supply
    the tenant (a pre-authentication event, say) it is derived from the user record: one indexed
    read, on the rare path where a security event is being written at all.

    An event with no resolvable tenant (a failed sign-in for an unknown identifier) keeps a null
    `collegeId` on purpose. It belongs to no institution, so no institution's admin should see it;
    only SUPER_ADMIN, whose scope filter is empty, can.
    """
    if college_id is None and user_id is not None:
        owner = await get_db().users.find_one(
            {"_id": user_id}, {"collegeId": 1, "departmentId": 1}
        )
        if owner:
            college_id = owner.get("collegeId")
            department_id = department_id or owner.get("departmentId")

    doc = {
        "kind": kind,
        "userId": user_id,
        "collegeId": college_id,
        "departmentId": department_id,
        "detail": detail,
        "requestId": request_id,
        "ip": ip,
        "path": path,
        "metadata": _clean(metadata or {}),
        "at": datetime.now(timezone.utc),
    }
    try:
        await get_db().security_events.insert_one(doc)
    except Exception as exc:  # pragma: no cover
        log.error("security_event_write_failed", extra={"error": str(exc)})
    log.warning("security_event", extra={"kind": kind, "detail": detail, "user_id": str(user_id)})
