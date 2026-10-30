"""Live Class & Virtual Classroom business logic and authorization service."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.errors import NotFound, RoleForbidden, ScopeForbidden
from app.repositories.live_class_repo import LiveClassRepository


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def can_student_access_live_class(
    student_user_id: Any, live_class_id: Any
) -> tuple[bool, str, dict[str, Any] | None]:
    return await LiveClassRepository.can_student_access_live_class(student_user_id, live_class_id)


async def get_eligible_classes_for_student(ctx: ScopeContext) -> list[dict[str, Any]]:
    return await LiveClassRepository.get_eligible_classes_for_student(
        ctx.user_id, ctx.college_id, ctx.department_id
    )


async def get_classes_for_trainer(ctx: ScopeContext) -> list[dict[str, Any]]:
    return await LiveClassRepository.get_classes_for_trainer(ctx.user_id, list(ctx.batch_ids))


async def join_live_class(
    live_class_id: Any, user_id: Any, user_name: str, role: str
) -> dict[str, Any]:
    return await LiveClassRepository.join_live_class(live_class_id, user_id, user_name, role)


async def record_heartbeat(
    live_class_id: Any,
    user_id: Any,
    user_name: str,
    role: str,
    audio_active: bool = False,
    video_active: bool = False,
    screen_active: bool = False,
) -> dict[str, Any]:
    return await LiveClassRepository.record_heartbeat(live_class_id, user_id, user_name, role)


async def leave_live_class(live_class_id: Any, user_id: Any) -> dict[str, Any]:
    return await LiveClassRepository.leave_live_class(live_class_id, user_id)


async def finalize_class_attendance(
    live_class_id: Any, ended_by: Any
) -> dict[str, Any]:
    return await LiveClassRepository.finalize_class_attendance(live_class_id, ended_by)


async def get_class_attendance_summary(live_class_id: Any) -> dict[str, Any]:
    return await LiveClassRepository.get_class_attendance_summary(live_class_id)
