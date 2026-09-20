"""Notifications.

In-app notifications always work (they are rows in MongoDB, scoped to one user). Push delivery is
isolated behind `PushProvider` so Firebase Cloud Messaging is one adapter rather than a dependency
threaded through the codebase. Every notification respects role and tenant scope: it is addressed
to a specific user id, and the reader endpoint only ever returns that user's own rows.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Iterable

from bson import ObjectId

from app.core.config import settings
from app.core.logging import get_logger
from app.db.mongo import get_db

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

    @property
    @abstractmethod
    def name(self) -> str: ...


class NoopPushProvider(PushProvider):
    """Used whenever FCM is not configured — in-app notifications still work."""

    @property
    def name(self) -> str:
        return "noop"

    async def send(self, *, tokens: list[str], title: str, body: str, data: dict) -> int:
        log.info("push_skipped_not_configured", extra={"title": title, "devices": len(tokens)})
        return 0


class FcmPushProvider(PushProvider):
    @property
    def name(self) -> str:
        return "fcm"

    async def send(self, *, tokens: list[str], title: str, body: str, data: dict) -> int:
        if not tokens:
            return 0
        import httpx

        sent = 0
        headers = {
            "Authorization": f"key={settings.FCM_SERVER_KEY or ''}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    "https://fcm.googleapis.com/fcm/send",
                    headers=headers,
                    json={
                        "registration_ids": tokens[:500],
                        "notification": {"title": title, "body": body},
                        "data": {k: str(v) for k, v in data.items()},
                    },
                )
                response.raise_for_status()
                sent = int(response.json().get("success", 0))
        except Exception as exc:  # pragma: no cover - external service
            log.error("push_failed", extra={"error": str(exc)})
        return sent


_push: PushProvider | None = None


def get_push_provider() -> PushProvider:
    global _push
    if _push is None:
        _push = (
            FcmPushProvider()
            if settings.FCM_ENABLED and settings.FCM_SERVER_KEY
            else NoopPushProvider()
        )
    return _push


def reset_push_for_tests() -> None:
    global _push
    _push = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
) -> ObjectId | None:
    """Create one in-app notification (and optionally push it)."""
    if user_id is None:
        return None
    document = {
        "userId": ObjectId(str(user_id)),
        "kind": kind,
        "icon": ICON_BY_KIND.get(kind, "bell"),
        "title": title,
        "body": body,
        "href": href,
        "collegeId": college_id,
        "departmentId": department_id,
        "metadata": metadata or {},
        "read": False,
        "createdAt": _now(),
        "updatedAt": _now(),
        "deletedAt": None,
    }
    result = await get_db().notifications.insert_one(document)

    if push:
        tokens = await _device_tokens(document["userId"])
        if tokens:
            await get_push_provider().send(
                tokens=tokens,
                title=title,
                body=body,
                data={"kind": kind, "href": href or "", "id": str(result.inserted_id)},
            )
    return result.inserted_id


async def notify_many(user_ids: Iterable[Any], **kwargs: Any) -> int:
    count = 0
    for user_id in user_ids:
        if await notify(user_id=user_id, **kwargs):
            count += 1
    return count


async def _device_tokens(user_id: ObjectId) -> list[str]:
    user = await get_db().users.find_one({"_id": user_id}, {"deviceTokens": 1, "preferences": 1})
    if not user:
        return []
    preferences = user.get("preferences") or {}
    if preferences.get("pushNotifications") is False:
        return []
    return [t for t in (user.get("deviceTokens") or []) if t]


async def register_device_token(user_id: Any, token: str, platform: str = "web") -> None:
    await get_db().users.update_one(
        {"_id": ObjectId(str(user_id))},
        {
            "$addToSet": {"deviceTokens": token},
            "$set": {"lastDevicePlatform": platform, "updatedAt": _now()},
        },
    )


async def unread_count(user_id: Any) -> int:
    return await get_db().notifications.count_documents(
        {"userId": ObjectId(str(user_id)), "read": False, "deletedAt": None}
    )


async def mark_read(user_id: Any, notification_id: Any) -> bool:
    result = await get_db().notifications.update_one(
        {"_id": ObjectId(str(notification_id)), "userId": ObjectId(str(user_id))},
        {"$set": {"read": True, "readAt": _now(), "updatedAt": _now()}},
    )
    return result.matched_count > 0


async def mark_all_read(user_id: Any) -> int:
    result = await get_db().notifications.update_many(
        {"userId": ObjectId(str(user_id)), "read": False},
        {"$set": {"read": True, "readAt": _now(), "updatedAt": _now()}},
    )
    return result.modified_count


# --------------------------------------------------------------------------- routing helpers
async def notify_department_hod(
    *, college_id: Any, department_id: Any, kind: str, title: str, body: str, href: str | None = None
) -> None:
    """Route a department-scoped alert to that department's HOD only."""
    department = await get_db().departments.find_one(
        {"_id": ObjectId(str(department_id))}, {"hodUserId": 1, "collegeId": 1}
    )
    if not department or not department.get("hodUserId"):
        return
    if department.get("collegeId") != ObjectId(str(college_id)):
        return
    await notify(
        user_id=department["hodUserId"],
        kind=kind,
        title=title,
        body=body,
        href=href,
        college_id=department.get("collegeId"),
        department_id=ObjectId(str(department_id)),
    )


async def notify_college_admins(
    *, college_id: Any, kind: str, title: str, body: str, href: str | None = None
) -> int:
    admins = await (
        get_db()
        .users.find(
            {"collegeId": ObjectId(str(college_id)), "role": "ADMIN", "status": "active"},
            {"_id": 1},
        )
        .to_list(length=50)
    )
    return await notify_many(
        [a["_id"] for a in admins],
        kind=kind,
        title=title,
        body=body,
        href=href,
        college_id=ObjectId(str(college_id)),
    )
