"""Audit Log PostgreSQL repository."""
from __future__ import annotations

from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection


class AuditRepository:
    @staticmethod
    async def log_event(
        actor_user_id: UUID | str | None,
        action: str,
        entity_name: str,
        entity_id: str,
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        try:
            actor_uuid = UUID(str(actor_user_id)) if actor_user_id else None
            inst_uuid = UUID(str(institution_id)) if institution_id else None
            dept_uuid = UUID(str(department_id)) if department_id else None
            async with get_pg_connection() as conn:
                await conn.execute(
                    """
                    INSERT INTO audit_logs (
                        actor_user_id, action, entity_name, entity_id,
                        institution_id, department_id, metadata, ip_address, user_agent
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """,
                    actor_uuid,
                    action,
                    entity_name,
                    entity_id,
                    inst_uuid,
                    dept_uuid,
                    metadata or {},
                    ip_address,
                    user_agent,
                )
        except Exception:
            # Audit failures should never crash primary transactions
            pass

