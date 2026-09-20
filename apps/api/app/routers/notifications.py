"""In-app notifications. Always scoped to the authenticated user's own rows."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.authz.guards import CurrentUser
from app.core.errors import NotFound
from app.repositories.collections import NotificationRepo
from app.schemas.requests import DeviceTokenRequest
from app.services import notifications as service

router = APIRouter()


@router.get("")
async def list_notifications(
    ctx: CurrentUser,
    unreadOnly: bool = Query(False),
    kind: str | None = Query(None, max_length=40),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if unreadOnly:
        filters["read"] = False
    if kind and kind != "all":
        filters["kind"] = kind
    page_result = await NotificationRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize
    )
    return {
        "success": True,
        **page_result.to_response(),
        "meta": {"unread": await service.unread_count(ctx.user_id)},
    }


@router.get("/unread-count")
async def unread_count(ctx: CurrentUser) -> dict[str, Any]:
    return {"success": True, "data": {"unread": await service.unread_count(ctx.user_id)}}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, ctx: CurrentUser) -> dict[str, Any]:
    if not await service.mark_read(ctx.user_id, notification_id):
        raise NotFound("Notification not found")
    return {
        "success": True,
        "data": {"unread": await service.unread_count(ctx.user_id)},
    }


@router.post("/read-all")
async def mark_all_read(ctx: CurrentUser) -> dict[str, Any]:
    updated = await service.mark_all_read(ctx.user_id)
    return {"success": True, "message": f"{updated} notification(s) marked read"}


@router.post("/devices")
async def register_device(payload: DeviceTokenRequest, ctx: CurrentUser) -> dict[str, Any]:
    """Register a push token. Delivery is handled by the notification service's FCM adapter."""
    await service.register_device_token(ctx.user_id, payload.token, payload.platform)
    provider = service.get_push_provider()
    return {
        "success": True,
        "message": "Device registered",
        "data": {
            "pushProvider": provider.name,
            "pushEnabled": provider.name != "noop",
            "note": (
                None
                if provider.name != "noop"
                else "Push delivery is not configured on this deployment; in-app notifications "
                     "continue to work."
            ),
        },
    }
