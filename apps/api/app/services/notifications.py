"""Notifications service backed entirely by PostgreSQL.

In-app notifications are persisted in PostgreSQL `notifications` table.
Push delivery is optionally routed through PushProvider (FCM).
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Iterable
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection

log = get_logger("app.notifications")


class Kind:
    ASSIGNMENT_DUE = "assignment_due"
    CLASS_REMINDER = "class_reminder"
    ASSESSMENT_FEEDBACK = "assessment_feedback"
    WEAK_STUDENT = "weak_student"
    NEW_ENROLLMENT = "new_enrollment"
    CERTIFICATE_ELIGIBILITY = "certificate_eligibility"
    REPORT_READY = "report_ready"
    REPORT_FAILED = "report_failed"
    SECURITY = "security"
    ATTENDANCE_DEFAULTER = "attendance_defaulter"
    LOW_ASSESSMENT_SCORE = "low_assessment_score"
    ACCOUNT = "account"
    IMPORT_COMPLETE = "import_complete"
    CHAT_MESSAGE = "chat_message"


ICON_BY_KIND = {
    Kind.ASSIGNMENT_DUE: "clipboard-list",
    Kind.CLASS_REMINDER: "video",
    Kind.ASSESSMENT_FEEDBACK: "message-square",
    Kind.WEAK_STUDENT: "alert-triangle",
    Kind.NEW_ENROLLMENT: "user-plus",
    Kind.CERTIFICATE_ELIGIBILITY: "award",
    Kind.REPORT_READY: "download",
    Kind.REPORT_FAILED: "alert-circle",
    Kind.SECURITY: "shield",
    Kind.ATTENDANCE_DEFAULTER: "calendar-x",
    Kind.LOW_ASSESSMENT_SCORE: "trending-down",
    Kind.ACCOUNT: "user",
    Kind.IMPORT_COMPLETE: "upload",
    Kind.CHAT_MESSAGE: "message-square",
}


class PushProvider(ABC):
    @abstractmethod
    async def send(self, *, tokens: list[str], title: str, body: str, data: dict) -> int: ...


class ConsolePushProvider(PushProvider):
    async def send(self, *, tokens: list[str], title: str, body: str, data: dict) -> int:
        log.info(
            "push_notification",
            extra={"recipients": len(tokens), "title": title, "kind": data.get("kind")},
        )
        return len(tokens)


_push_provider: PushProvider | None = None


def get_push_provider() -> PushProvider:
    global _push_provider
    if _push_provider is None:
        _push_provider = ConsolePushProvider()
    return _push_provider


def reset_push_for_tests() -> None:
    global _push_provider
    _push_provider = None


def _to_uuid(val: Any) -> UUID | None:
    if not val:
        return None
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


async def notify(
    *,
    user_id: Any,
    kind: str,
    title: str,
    body: str,
    href: str | None = None,
    college_id: Any = None,
    department_id: Any = None,
    metadata: dict[str, Any] | None = None,
    push: bool = True,
) -> str | None:
    """Create one in-app notification in PostgreSQL."""
    u_uuid = _to_uuid(user_id)
    if not u_uuid:
        return None

    c_uuid = _to_uuid(college_id)
    meta = metadata or {}
    meta_json = json.dumps(meta)

    try:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO notifications (
                    recipient_user_id, title, message, type, kind, is_read, action_url, institution_id, metadata, created_at
                )
                VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8::jsonb, NOW())
                RETURNING id
                """,
                u_uuid,
                title,
                body,
                "SYSTEM",
                kind,
                href,
                c_uuid,
                meta_json,
            )
            notif_id = str(row["id"])

        if push:
            tokens = await _device_tokens(u_uuid)
            if tokens:
                await get_push_provider().send(
                    tokens=tokens,
                    title=title,
                    body=body,
                    data={"kind": kind, "href": href or "", "id": notif_id},
                )
        return notif_id
    except Exception as exc:
        log.error("notification_create_failed", extra={"error": str(exc), "user_id": str(user_id)})
        return None


async def notify_many(user_ids: Iterable[Any], **kwargs: Any) -> int:
    count = 0
    for uid in user_ids:
        if await notify(user_id=uid, **kwargs):
            count += 1
    return count


async def _device_tokens(user_uuid: UUID) -> list[str]:
    try:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("SELECT preferences FROM users WHERE id = $1", user_uuid)
            if not row or not row.get("preferences"):
                return []
            prefs = row["preferences"]
            if isinstance(prefs, str):
                prefs = json.loads(prefs)
            if prefs.get("pushNotifications") is False:
                return []
            return prefs.get("deviceTokens", [])
    except Exception:
        return []


async def register_device_token(user_id: Any, token: str, platform: str = "web") -> None:
    u_uuid = _to_uuid(user_id)
    if not u_uuid:
        return
    try:
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE users
                SET preferences = jsonb_set(
                    COALESCE(preferences, '{}'::jsonb),
                    '{deviceTokens}',
                    (COALESCE(preferences->'deviceTokens', '[]'::jsonb) || to_jsonb($2::text))
                ),
                updated_at = NOW()
                WHERE id = $1
                """,
                u_uuid,
                token,
            )
    except Exception as exc:
        log.warning("register_device_token_failed", extra={"error": str(exc)})


async def unread_count(user_id: Any) -> int:
    u_uuid = _to_uuid(user_id)
    if not u_uuid:
        return 0
    try:
        async with get_pg_connection() as conn:
            val = await conn.fetchval(
                "SELECT COUNT(*) FROM notifications WHERE recipient_user_id = $1 AND is_read = FALSE",
                u_uuid,
            )
            return val or 0
    except Exception:
        return 0


async def mark_read(user_id: Any, notification_id: Any) -> bool:
    u_uuid = _to_uuid(user_id)
    n_uuid = _to_uuid(notification_id)
    if not u_uuid or not n_uuid:
        return False
    try:
        async with get_pg_connection() as conn:
            res = await conn.execute(
                "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND recipient_user_id = $2",
                n_uuid,
                u_uuid,
            )
            return "UPDATE 1" in res
    except Exception:
        return False


async def mark_all_read(user_id: Any) -> int:
    u_uuid = _to_uuid(user_id)
    if not u_uuid:
        return 0
    try:
        async with get_pg_connection() as conn:
            res = await conn.execute(
                "UPDATE notifications SET is_read = TRUE WHERE recipient_user_id = $1 AND is_read = FALSE",
                u_uuid,
            )
            # res is e.g. 'UPDATE 3'
            parts = res.split(" ")
            return int(parts[-1]) if len(parts) > 1 and parts[-1].isdigit() else 0
    except Exception:
        return 0


async def notify_department_hod(
    *, college_id: Any, department_id: Any, kind: str, title: str, body: str, href: str | None = None
) -> None:
    """Route a department-scoped alert to that department's HOD."""
    d_uuid = _to_uuid(department_id)
    c_uuid = _to_uuid(college_id)
    if not d_uuid:
        return
    try:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                "SELECT hod_user_id, institution_id FROM departments WHERE id = $1",
                d_uuid,
            )
            if not row or not row.get("hod_user_id"):
                return
            await notify(
                user_id=row["hod_user_id"],
                kind=kind,
                title=title,
                body=body,
                href=href,
                college_id=c_uuid or row["institution_id"],
                department_id=d_uuid,
            )
    except Exception as exc:
        log.warning("notify_department_hod_failed", extra={"error": str(exc)})
