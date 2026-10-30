"""In-app notifications backed by PostgreSQL. Always scoped to the authenticated user's own rows."""
from __future__ import annotations

import math
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query

from app.authz.guards import CurrentUser
from app.core.errors import NotFound
from app.db.postgres import get_pg_connection
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
    page = max(1, page)
    pageSize = min(100, max(1, pageSize))
    offset = (page - 1) * pageSize

    u_uuid = UUID(str(ctx.user_id))

    where_clauses = ["recipient_user_id = $1"]
    params: list[Any] = [u_uuid]

    if unreadOnly:
        where_clauses.append("is_read = FALSE")
    if kind and kind != "all":
        params.append(kind)
        where_clauses.append(f"kind = ${len(params)}")

    where_sql = " AND ".join(where_clauses)

    async with get_pg_connection() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM notifications WHERE {where_sql}", *params)
        total = total or 0

        params.extend([pageSize, offset])
        rows = await conn.fetch(
            f"""
            SELECT id, title, message as body, type, kind, is_read as read,
                   action_url as href, metadata, created_at
            FROM notifications
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}
            """,
            *params,
        )

    items = []
    for r in rows:
        items.append({
            "id": str(r["id"]),
            "_id": str(r["id"]),
            "title": r["title"],
            "body": r["body"],
            "message": r["body"],
            "type": r["type"],
            "kind": r["kind"],
            "icon": service.ICON_BY_KIND.get(r["kind"], "bell"),
            "read": bool(r["read"]),
            "href": r["href"],
            "metadata": r["metadata"] or {},
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
        })

    total_pages = max(1, math.ceil(total / pageSize))
    unread = await service.unread_count(ctx.user_id)

    return {
        "success": True,
        "items": items,
        "pagination": {
            "page": page,
            "pageSize": pageSize,
            "total": total,
            "totalPages": total_pages,
            "hasNext": page < total_pages,
            "hasPrev": page > 1,
        },
        "meta": {"unread": unread},
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
    await service.register_device_token(ctx.user_id, payload.token, payload.platform)
    return {
        "success": True,
        "message": "Device registered",
        "data": {
            "pushProvider": "console",
            "pushEnabled": True,
        },
    }
