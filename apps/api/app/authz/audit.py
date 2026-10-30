"""Append-only audit + security event trail (SRS §11.2, §14.4).

Persisted in PostgreSQL `audit_logs` and `security_events`.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.authz.context import ScopeContext
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.repositories.audit_repo import AuditRepository

log = get_logger("app.audit")

CREATE, UPDATE, DELETE, EXPORT, LOGIN, LOGOUT, ISSUE = (
    "create", "update", "delete", "export", "login", "logout", "issue",
)


def _clean(value: Any) -> Any:
    """Never let a secret reach the audit trail, and serialize UUIDs/datetimes."""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    redact = {"password", "passwordHash", "password_hash", "otp", "token", "refreshToken", "secret"}
    if isinstance(value, dict):
        return {k: ("[redacted]" if k in redact else _clean(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def _to_uuid(val: Any) -> UUID | None:
    if not val:
        return None
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


async def write_audit(
    ctx: ScopeContext | None,
    *,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    before: Any = None,
    after: Any = None,
    detail: str | None = None,
    college_id: Any = None,
    department_id: Any = None,
    actor_label: str | None = None,
) -> None:
    try:
        actor_id = _to_uuid(ctx.user_id if ctx else None)
        inst_id = _to_uuid(college_id or (ctx.college_id if ctx else None))
        dept_id = _to_uuid(department_id or (ctx.department_id if ctx else None))
        ent_id_str = str(entity_id) if entity_id is not None else ""

        meta = {
            "before": _clean(before),
            "after": _clean(after),
            "detail": detail,
            "actorLabel": actor_label or (ctx.actor_label if ctx else "system"),
            "actorRole": str(ctx.role) if ctx else "SYSTEM",
            "requestId": ctx.request_id if ctx else None,
        }

        await AuditRepository.log_event(
            actor_user_id=actor_id,
            action=action,
            entity_name=entity_type,
            entity_id=ent_id_str,
            institution_id=inst_id,
            department_id=dept_id,
            metadata=meta,
            ip_address=ctx.ip if ctx else None,
        )
    except Exception as exc:  # pragma: no cover - trail must never break the request
        log.error("audit_write_failed", extra={"error": str(exc), "entity": entity_type})


async def write_security_event(
    *,
    kind: str,
    user_id: Any = None,
    detail: str,
    request_id: str | None = None,
    ip: str | None = None,
    path: str | None = None,
    metadata: dict[str, Any] | None = None,
    college_id: Any = None,
    department_id: Any = None,
) -> None:
    """Security events recorded in PostgreSQL `security_events` table."""
    try:
        u_uuid = _to_uuid(user_id)
        c_uuid = _to_uuid(college_id)
        d_uuid = _to_uuid(department_id)

        if c_uuid is None and u_uuid is not None:
            try:
                async with get_pg_connection() as conn:
                    row = await conn.fetchrow(
                        "SELECT institution_id, department_id FROM users WHERE id = $1",
                        u_uuid,
                    )
                    if row:
                        c_uuid = row["institution_id"]
                        d_uuid = d_uuid or row["department_id"]
            except Exception:
                pass

        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO security_events (
                    kind, user_id, institution_id, department_id, detail,
                    ip_address, request_id, path, metadata, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                """,
                kind,
                u_uuid,
                c_uuid,
                d_uuid,
                detail,
                ip,
                request_id,
                path,
                _clean(metadata or {}),
            )
    except Exception as exc:  # pragma: no cover
        log.error("security_event_write_failed", extra={"error": str(exc)})
    log.warning("security_event", extra={"kind": kind, "detail": detail, "user_id": str(user_id)})
