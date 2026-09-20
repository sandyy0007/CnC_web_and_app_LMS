"""Report job status and signed downloads, shared by every portal."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.authz.guards import CurrentUser
from app.db.mongo import serialize
from app.repositories.collections import ReportJobRepo
from app.services.reports import download_url_for_export, report_catalogue
from app.services.storage import signed_url

router = APIRouter()


@router.get("/jobs")
async def jobs(
    ctx: CurrentUser,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status", max_length=20),
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status_filter and status_filter != "all":
        filters["status"] = status_filter
    from app.authz.roles import Role

    if ctx.role in (Role.STUDENT, Role.TRAINER):
        filters["requestedBy"] = ctx.user_id
    page_result = await ReportJobRepo(ctx).list(filters=filters, page=page, page_size=pageSize)
    rows = []
    for job in page_result.items:
        item = serialize(job)
        if job.get("status") == "ready" and job.get("storageKey"):
            item["downloadUrl"] = await signed_url(job["storageKey"], filename=job.get("filename"))
        rows.append(item)
    response = page_result.to_response()
    response["items"] = rows
    return {"success": True, **response}


@router.get("/jobs/{job_id}")
async def job_status(job_id: str, ctx: CurrentUser) -> dict[str, Any]:
    job = await ReportJobRepo(ctx).get(job_id)
    data = serialize(job)
    if job.get("status") == "ready" and job.get("storageKey"):
        data["downloadUrl"] = await signed_url(job["storageKey"], filename=job.get("filename"))
    return {"success": True, "data": data}


@router.get("/download/{export_id}")
async def download(export_id: str, ctx: CurrentUser) -> dict[str, Any]:
    """Returns a short-lived signed URL — the file itself is never publicly reachable."""
    return {"success": True, "data": await download_url_for_export(ctx, export_id)}


@router.get("/catalogue")
async def catalogue(ctx: CurrentUser) -> dict[str, Any]:
    data = report_catalogue(str(ctx.role))
    return {
        "success": True,
        "data": {
            **{k: v for k, v in data.items() if k != "entries"},
            "entriesSample": data["entries"][:40],
        },
    }
