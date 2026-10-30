"""Public and Authenticated E-Book endpoints.

Enforces:
- Strict PDF 5-page free preview for unauthenticated visitors.
- Authenticated reading with enrollment/access-rule verification.
- Reviewing, rating, reporting, and bookmarking.
- Entirely powered by PostgreSQL.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import StreamingResponse
import io

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context
from app.core.errors import NotFound, ScopeForbidden, Unauthenticated, ValidationError
from app.repositories.ebook_repo import EbookRepository
from app.services.ebook_service import (
    FREE_PREVIEW_PAGE_LIMIT,
    ensure_categories_seeded,
    get_or_create_preview_slice,
    _now,
)
from app.services.storage import get_storage

router = APIRouter()


async def optional_user(request: Request) -> ScopeContext | None:
    if not request.headers.get("authorization"):
        return None
    try:
        return await get_scope_context(request)
    except Exception:
        return None


require_auth = get_scope_context


# --------------------------------------------------------------------------- Public & Browse
@router.get("")
async def list_public_ebooks(
    category: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    featured: bool | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
) -> dict[str, Any]:
    """Public catalog: returns ONLY published, active eBooks."""
    await ensure_categories_seeded()
    books, total = await EbookRepository.list_public_ebooks(
        category=category,
        tag=tag,
        search=search,
        featured=featured,
        page=page,
        limit=limit,
    )
    categories = await EbookRepository.list_categories()

    items = []
    for b in books:
        book_id = str(b["id"])
        cover_url = f"/api/v1/ebooks/{book_id}/cover" if b.get("cover_key") else None
        desc = b.get("description") or ""
        short_desc = b.get("short_description") or (desc[:160] + "..." if len(desc) > 160 else desc)
        items.append({
            "id": book_id,
            "slug": b.get("slug"),
            "title": b.get("title"),
            "author": b.get("author"),
            "description": desc,
            "shortDescription": short_desc,
            "category": b.get("category", "General"),
            "tags": b.get("tags") or [],
            "pageCount": b.get("page_count", 1),
            "coverUrl": cover_url,
            "isFeatured": bool(b.get("is_featured", False)),
            "isPinned": bool(b.get("is_pinned", False)),
            "readsCount": b.get("reads_count", 0),
            "averageRating": float(b.get("average_rating") or 5.0),
            "ratingsCount": b.get("ratings_count", 0),
            "allowDownload": bool(b.get("allow_download", False)),
            "freePreviewLimit": FREE_PREVIEW_PAGE_LIMIT,
        })

    cat_items = [{"id": str(c["id"]), "slug": c["slug"], "name": c["name"], "description": c.get("description"), "icon": c.get("icon")} for c in categories]

    return {
        "success": True,
        "data": items,
        "meta": {
            "total": total,
            "page": page,
            "limit": limit,
            "categories": cat_items,
        },
    }


@router.get("/categories")
async def list_categories() -> dict[str, Any]:
    await ensure_categories_seeded()
    cats = await EbookRepository.list_categories()
    return {
        "success": True,
        "data": [{"id": str(c["id"]), "slug": c["slug"], "name": c["name"], "description": c.get("description"), "icon": c.get("icon")} for c in cats],
    }


@router.get("/{ebook_id}")
async def get_ebook_details(ebook_id: str, request: Request) -> dict[str, Any]:
    """Public details view for an eBook."""
    try:
        book = await EbookRepository.get_by_id(ebook_id)
    except Exception:
        raise NotFound("E-Book not found.")

    if not book:
        raise NotFound("E-Book not found.")

    ctx = await optional_user(request)

    # If not published, only uploader or Super Admin can view
    if str(book.get("status", "")).upper() != "PUBLISHED":
        if not ctx:
            raise NotFound("This eBook is not currently published.")
        if ctx.role != "SUPER_ADMIN" and str(book.get("uploaded_by", "")) != str(ctx.user_id):
            raise ScopeForbidden("This eBook is pending review or unpublished.")

    user_prog = None
    is_bookmarked = False
    if ctx and ctx.user_id:
        user_prog = await EbookRepository.get_user_progress(ebook_id, ctx.user_id)
        is_bookmarked = await EbookRepository.is_bookmarked(ebook_id, ctx.user_id)

    cover_url = f"/api/v1/ebooks/{str(book['id'])}/cover" if book.get("cover_key") else None
    reviews = await EbookRepository.list_reviews(ebook_id, limit=10)

    rev_items = []
    for r in reviews:
        rev_items.append({
            "id": str(r["id"]),
            "ebookId": str(r["ebook_id"]),
            "userId": str(r["user_id"]),
            "userName": r.get("user_name", "Learner"),
            "userRole": r.get("user_role", "STUDENT"),
            "rating": r.get("rating", 5),
            "comment": r.get("comment", ""),
            "createdAt": r["created_at"].isoformat() if r.get("created_at") else None,
        })

    return {
        "success": True,
        "data": {
            "id": str(book["id"]),
            "slug": book.get("slug"),
            "title": book.get("title"),
            "author": book.get("author"),
            "description": book.get("description"),
            "shortDescription": book.get("short_description"),
            "category": book.get("category", "General"),
            "tags": book.get("tags") or [],
            "pageCount": book.get("page_count", 1),
            "fileSizeBytes": book.get("file_size_bytes", 0),
            "coverUrl": cover_url,
            "status": book.get("status", "PUBLISHED"),
            "published": book.get("published", True),
            "isFeatured": bool(book.get("is_featured", False)),
            "isPinned": bool(book.get("is_pinned", False)),
            "allowDownload": bool(book.get("allow_download", False)),
            "freePreviewLimit": FREE_PREVIEW_PAGE_LIMIT,
            "readsCount": book.get("reads_count", 0),
            "averageRating": float(book.get("average_rating") or 5.0),
            "ratingsCount": book.get("ratings_count", 0),
            "createdAt": book["created_at"].isoformat() if book.get("created_at") else None,
            "publishedAt": book["published_at"].isoformat() if book.get("published_at") else None,
            "userProgress": {
                "currentPage": user_prog.get("current_page", 1) if user_prog else 1,
                "progressPercent": float(user_prog.get("progress_percent") or 0.0) if user_prog else 0.0,
                "completed": user_prog.get("completed", False) if user_prog else False,
            } if user_prog else None,
            "isBookmarked": is_bookmarked,
            "reviews": rev_items,
        },
    }


@router.get("/{ebook_id}/cover")
async def get_ebook_cover(ebook_id: str) -> Response:
    """Delivers the eBook cover image with public caching."""
    try:
        book = await EbookRepository.get_by_id(ebook_id)
    except Exception:
        raise NotFound("E-Book cover not found.")

    if not book or not book.get("cover_key"):
        raise NotFound("No cover image available.")

    storage = get_storage()
    if not await storage.exists(book["cover_key"]):
        raise NotFound("Cover image file missing.")

    data = await storage.get(book["cover_key"])
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/{ebook_id}/preview")
async def get_ebook_preview_pdf(ebook_id: str) -> Response:
    """CRITICAL SECURITY ENDPOINT:
    Delivers ONLY the first 5 pages of the PDF.
    Pages 6+ are physically stripped and absent from the delivered byte stream.
    """
    try:
        book = await EbookRepository.get_by_id(ebook_id)
    except Exception:
        raise NotFound("E-Book not found.")

    if not book or str(book.get("status", "")).upper() != "PUBLISHED":
        raise NotFound("E-Book not available for public preview.")

    preview_bytes = await get_or_create_preview_slice(book)
    await EbookRepository.increment_reads_count(book["id"])

    return Response(
        content=preview_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{book.get("slug", "preview")}_preview.pdf"',
            "X-Preview-Pages": str(FREE_PREVIEW_PAGE_LIMIT),
            "Cache-Control": "private, no-cache",
        },
    )


@router.get("/{ebook_id}/read")
async def get_authenticated_pdf(ebook_id: str, ctx: ScopeContext = Depends(require_auth)) -> Response:
    """Delivers the full PDF to authenticated and authorized users."""
    try:
        book = await EbookRepository.get_by_id(ebook_id)
    except Exception:
        raise NotFound("E-Book not found.")

    if not book:
        raise NotFound("E-Book not found.")

    if str(book.get("status", "")).upper() != "PUBLISHED":
        if ctx.role != "SUPER_ADMIN" and str(book.get("uploaded_by", "")) != str(ctx.user_id):
            raise ScopeForbidden("This eBook has not been published yet.")

    if str(book.get("visibility", "")).upper() == "COURSE_RESTRICTED" and book.get("course_id"):
        if ctx.role != "SUPER_ADMIN" and str(book.get("uploaded_by", "")) != str(ctx.user_id):
            if ctx.role == "STUDENT":
                enrolled = await EbookRepository.check_course_enrollment(ctx.user_id, book["course_id"])
                if not enrolled:
                    raise ScopeForbidden("This eBook is restricted to students enrolled in this course.")

    storage = get_storage()
    file_key = book.get("file_key")
    if not file_key or not await storage.exists(file_key):
        raise NotFound("Original PDF file is missing.")

    pdf_bytes = await storage.get(file_key)
    await EbookRepository.increment_reads_count(book["id"])

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{book.get("slug", "ebook")}.pdf"',
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/{ebook_id}/download")
async def download_ebook_pdf(ebook_id: str, ctx: ScopeContext = Depends(require_auth)) -> Response:
    """Secure PDF download (only allowed when allowDownload is true, or for Super Admin)."""
    try:
        book = await EbookRepository.get_by_id(ebook_id)
    except Exception:
        raise NotFound("E-Book not found.")

    if not book:
        raise NotFound("E-Book not found.")

    if not book.get("allow_download", False) and ctx.role != "SUPER_ADMIN":
        raise ScopeForbidden("Downloading is disabled for this eBook. You can read it online.")

    storage = get_storage()
    file_key = book.get("file_key")
    if not file_key or not await storage.exists(file_key):
        raise NotFound("PDF file is unavailable.")

    pdf_bytes = await storage.get(file_key)
    safe_name = f"{book.get('title', 'eBook')}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Cache-Control": "private, no-store",
        },
    )


# --------------------------------------------------------------------------- Reviews & Reports
@router.post("/{ebook_id}/reviews")
async def submit_review(
    ebook_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = Depends(require_auth),
) -> dict[str, Any]:
    try:
        book = await EbookRepository.get_by_id(ebook_id)
    except Exception:
        raise NotFound("E-Book not found.")

    if not book or str(book.get("status", "")).upper() != "PUBLISHED":
        raise NotFound("E-Book not found.")

    rating = int(payload.get("rating", 5))
    if rating < 1 or rating > 5:
        raise ValidationError("Rating must be between 1 and 5 stars.")

    comment = str(payload.get("comment", "")).strip()
    avg_rating = await EbookRepository.submit_review(
        ebook_id=book["id"],
        user_id=ctx.user_id,
        rating=rating,
        comment=comment,
    )

    return {"success": True, "message": "Review submitted successfully.", "averageRating": avg_rating}


@router.post("/{ebook_id}/reports")
async def report_ebook(
    ebook_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = Depends(require_auth),
) -> dict[str, Any]:
    try:
        book = await EbookRepository.get_by_id(ebook_id)
    except Exception:
        raise NotFound("E-Book not found.")

    if not book:
        raise NotFound("E-Book not found.")

    reason = str(payload.get("reason", "")).strip()
    if not reason:
        raise ValidationError("Please provide a reason for the report.")

    details = str(payload.get("details", "")).strip()

    await EbookRepository.report_ebook(
        ebook_id=book["id"],
        title=book.get("title"),
        reported_by=ctx.user_id,
        reporter_name=ctx.user_name,
        reporter_role=ctx.role,
        reason=reason,
        details=details,
    )

    return {"success": True, "message": "Thank you for reporting. Super Admin will review this content."}


# --------------------------------------------------------------------------- Bookmarks
@router.get("/{ebook_id}/bookmarks")
async def list_bookmarks(ebook_id: str, ctx: ScopeContext = Depends(require_auth)) -> dict[str, Any]:
    try:
        items = await EbookRepository.list_bookmarks(ebook_id, ctx.user_id)
    except Exception:
        raise NotFound("E-Book not found.")

    return {
        "success": True,
        "data": [
            {
                "id": str(b["id"]),
                "ebookId": str(b["ebook_id"]),
                "pageNumber": b["page_number"],
                "title": b.get("title"),
                "note": b.get("note"),
                "createdAt": b["created_at"].isoformat() if b.get("created_at") else None,
            }
            for b in items
        ],
    }


@router.post("/{ebook_id}/bookmarks")
async def add_bookmark(ebook_id: str, payload: dict[str, Any], ctx: ScopeContext = Depends(require_auth)) -> dict[str, Any]:
    page_number = int(payload.get("pageNumber", 1))
    note = str(payload.get("note", "")).strip()
    await EbookRepository.add_bookmark(ebook_id, ctx.user_id, page_number, note)
    return {"success": True, "message": "Bookmark saved"}


@router.delete("/{ebook_id}/bookmarks/{page_number}")
async def remove_bookmark(ebook_id: str, page_number: int, ctx: ScopeContext = Depends(require_auth)) -> dict[str, Any]:
    await EbookRepository.remove_bookmark(ebook_id, ctx.user_id, page_number)
    return {"success": True, "message": "Bookmark removed"}
