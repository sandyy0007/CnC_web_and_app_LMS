"""Signed file delivery for the local storage driver.

Private objects are never served from a public path: the token is HMAC-signed, carries an expiry,
and is minted only after a scope check by whichever endpoint produced the link.
"""
from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.core.errors import NotFound
from app.services.storage import LocalStorageDriver, get_storage

router = APIRouter()


@router.get("/signed")
async def signed_download(
    token: str = Query(..., max_length=600), filename: str | None = Query(None, max_length=200)
) -> Response:
    key = LocalStorageDriver.resolve_signed_token(token)
    storage = get_storage()
    if not await storage.exists(key):
        raise NotFound("This file is no longer available")
    content = await storage.get(key)
    suffix = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    media_type = {
        "pdf": "application/pdf",
        "csv": "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "webm": "audio/webm",
        "mp4": "video/mp4",
        "png": "image/png",
        "jpg": "image/jpeg",
    }.get(suffix, "application/octet-stream")
    disposition = f'attachment; filename="{filename}"' if filename else "inline"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": disposition, "Cache-Control": "private, no-store"},
    )
