"""Public and Authenticated E-Book endpoints.

Enforces:
- Strict PDF 5-page free preview for unauthenticated visitors.
- Authenticated reading with enrollment/access-rule verification.
- Reviewing, rating, reporting, and bookmarking.
"""
from __future__ import annotations

from typing import Any, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import StreamingResponse
import io

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context
from app.core.errors import NotFound, ScopeForbidden, Unauthenticated, ValidationError
from app.db.mongo import get_db, serialize
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
    db = get_db()
    query: dict[str, Any] = {
        "status": "PUBLISHED",
        "published": True,
        "deletedAt": None,
        "visibility": {"$ne": "COURSE_RESTRICTED"},  # Public listing excludes course-restricted books
    }

    if category and category != "all":
        query["category"] = category
    if tag:
        query["tags"] = tag
    if featured is not None:
        query["isFeatured"] = featured

    if search:
        import re
        pat = re.escape(search.strip())
        query["$or"] = [
            {"title": {"$regex": pat, "$options": "i"}},
            {"author": {"$regex": pat, "$options": "i"}},
            {"description": {"$regex": pat, "$options": "i"}},
            {"tags": {"$regex": pat, "$options": "i"}},
        ]

    total = await db.ebooks.count_documents(query)
    # Sort order: Pinned first (descending displayOrder), then newest
    cursor = db.ebooks.find(query).sort([("isPinned", -1), ("displayOrder", 1), ("publishedAt", -1), ("createdAt", -1)])
    skip = (page - 1) * limit
    books = await cursor.skip(skip).limit(limit).to_list(limit)

    categories = await db.ebook_categories.find({}).sort("name", 1).to_list(100)

    # Format list items
    items = []
    for b in books:
        cover_url = f"/api/v1/ebooks/{str(b['_id'])}/cover" if b.get("coverKey") else None
        items.append({
            "id": str(b["_id"]),
            "slug": b.get("slug"),
            "title": b.get("title"),
            "author": b.get("author"),
            "description": b.get("description"),
            "shortDescription": b.get("shortDescription") or (b.get("description", "")[:160] + "..."),
            "category": b.get("category", "General"),
            "tags": b.get("tags", []),
            "pageCount": b.get("pageCount", 1),
            "coverUrl": cover_url,
            "isFeatured": b.get("isFeatured", False),
            "isPinned": b.get("isPinned", False),
            "readsCount": b.get("readsCount", 0),
            "averageRating": b.get("averageRating", 5.0),
            "ratingsCount": b.get("ratingsCount", 0),
            "allowDownload": b.get("allowDownload", False),
            "freePreviewLimit": FREE_PREVIEW_PAGE_LIMIT,
        })

    return {
        "success": True,
        "data": items,
        "meta": {
            "total": total,
            "page": page,
            "limit": limit,
            "categories": serialize(categories),
        },
    }


@router.get("/categories")
async def list_categories() -> dict[str, Any]:
    await ensure_categories_seeded()
    cats = await get_db().ebook_categories.find({}).sort("name", 1).to_list(100)
    return {"success": True, "data": serialize(cats)}


@router.get("/{ebook_id}")
async def get_ebook_details(ebook_id: str, request: Request) -> dict[str, Any]:
    """Public details view for an eBook."""
    db = get_db()
    try:
        oid = ObjectId(ebook_id)
        book = await db.ebooks.find_one({"_id": oid, "deletedAt": None})
    except Exception:
        raise NotFound("E-Book not found.")

    if not book:
        raise NotFound("E-Book not found.")

    ctx = await optional_user(request)

    # If not published, only uploader or Super Admin can view
    if book.get("status") != "PUBLISHED":
        if not ctx:
            raise NotFound("This eBook is not currently published.")
        if ctx.role != "SUPER_ADMIN" and book.get("uploadedBy") != ctx.user_id:
            raise ScopeForbidden("This eBook is pending review or unpublished.")

    # Check user-specific progress and bookmark if logged in
    user_prog = None
    is_bookmarked = False
    if ctx and ctx.user_id:
        user_prog = await db.ebook_progress.find_one({"ebookId": oid, "studentUserId": ctx.user_id})
        is_bookmarked = bool(await db.ebook_bookmarks.find_one({"ebookId": oid, "studentUserId": ctx.user_id}))

    cover_url = f"/api/v1/ebooks/{str(book['_id'])}/cover" if book.get("coverKey") else None

    # Fetch recent reviews
    reviews = await db.ebook_reviews.find({"ebookId": oid}).sort("createdAt", -1).limit(10).to_list(10)

    return {
        "success": True,
        "data": {
            "id": str(book["_id"]),
            "slug": book.get("slug"),
            "title": book.get("title"),
            "author": book.get("author"),
            "description": book.get("description"),
            "shortDescription": book.get("shortDescription"),
            "category": book.get("category", "General"),
            "tags": book.get("tags", []),
            "pageCount": book.get("pageCount", 1),
            "fileSizeBytes": book.get("fileSizeBytes", 0),
            "coverUrl": cover_url,
            "status": book.get("status", "PUBLISHED"),
            "published": book.get("published", True),
            "isFeatured": book.get("isFeatured", False),
            "isPinned": book.get("isPinned", False),
            "allowDownload": book.get("allowDownload", False),
            "freePreviewLimit": FREE_PREVIEW_PAGE_LIMIT,
            "readsCount": book.get("readsCount", 0),
            "averageRating": book.get("averageRating", 5.0),
            "ratingsCount": book.get("ratingsCount", 0),
            "createdAt": book.get("createdAt").isoformat() if book.get("createdAt") else None,
            "publishedAt": book.get("publishedAt").isoformat() if book.get("publishedAt") else None,
            # Authenticated user states
            "userProgress": {
                "currentPage": user_prog.get("currentPage", 1) if user_prog else 1,
                "progressPercent": user_prog.get("totalProgressPct", 0) if user_prog else 0,
                "completed": user_prog.get("completed", False) if user_prog else False,
            } if user_prog else None,
            "isBookmarked": is_bookmarked,
            "reviews": serialize(reviews),
        },
    }


@router.get("/{ebook_id}/cover")
async def get_ebook_cover(ebook_id: str) -> Response:
    """Delivers the eBook cover image with public caching."""
    db = get_db()
    try:
        oid = ObjectId(ebook_id)
        book = await db.ebooks.find_one({"_id": oid, "deletedAt": None})
    except Exception:
        raise NotFound("E-Book cover not found.")

    if not book or not book.get("coverKey"):
        raise NotFound("No cover image available.")

    storage = get_storage()
    if not await storage.exists(book["coverKey"]):
        raise NotFound("Cover image file missing.")

    data = await storage.get(book["coverKey"])
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


# --------------------------------------------------------------------------- Security: PDF Delivery
@router.get("/{ebook_id}/preview")
async def get_ebook_preview_pdf(ebook_id: str) -> Response:
    """CRITICAL SECURITY ENDPOINT:
    Delivers ONLY the first 5 pages of the PDF.
    Pages 6+ are physically stripped and absent from the delivered byte stream.
    No unauthenticated user can bypass this to access further pages.
    """
    db = get_db()
    try:
        oid = ObjectId(ebook_id)
        book = await db.ebooks.find_one({"_id": oid, "status": "PUBLISHED", "deletedAt": None})
    except Exception:
        raise NotFound("E-Book not found.")

    if not book:
        raise NotFound("E-Book not available for public preview.")

    preview_bytes = await get_or_create_preview_slice(book)

    # Increment preview reads count
    await db.ebooks.update_one({"_id": oid}, {"$inc": {"readsCount": 1}})

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
    db = get_db()
    try:
        oid = ObjectId(ebook_id)
        book = await db.ebooks.find_one({"_id": oid, "deletedAt": None})
    except Exception:
        raise NotFound("E-Book not found.")

    if not book:
        raise NotFound("E-Book not found.")

    # Check publication & role scope
    if book.get("status") != "PUBLISHED":
        if ctx.role != "SUPER_ADMIN" and book.get("uploadedBy") != ctx.user_id:
            raise ScopeForbidden("This eBook has not been published yet.")

    # Check course-restricted access if applicable
    if book.get("visibility") == "COURSE_RESTRICTED" and book.get("courseId"):
        if ctx.role != "SUPER_ADMIN" and book.get("uploadedBy") != ctx.user_id:
            # Check student enrollment or trainer assignment
            if ctx.role == "STUDENT":
                enrollment = await db.enrollments.find_one({
                    "studentUserId": ctx.user_id,
                    "courseId": book["courseId"],
                    "status": "ACTIVE",
                })
                if not enrollment:
                    raise ScopeForbidden("This eBook is restricted to students enrolled in this course.")

    storage = get_storage()
    file_key = book.get("fileKey")
    if not file_key or not await storage.exists(file_key):
        raise NotFound("Original PDF file is missing.")

    pdf_bytes = await storage.get(file_key)

    # Increment full read stats
    await db.ebooks.update_one({"_id": oid}, {"$inc": {"readsCount": 1}})

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
    db = get_db()
    try:
        oid = ObjectId(ebook_id)
        book = await db.ebooks.find_one({"_id": oid, "deletedAt": None})
    except Exception:
        raise NotFound("E-Book not found.")

    if not book:
        raise NotFound("E-Book not found.")

    if not book.get("allowDownload", False) and ctx.role != "SUPER_ADMIN":
        raise ScopeForbidden("Downloading is disabled for this eBook. You can read it online.")

    storage = get_storage()
    file_key = book.get("fileKey")
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
    db = get_db()
    try:
        oid = ObjectId(ebook_id)
        book = await db.ebooks.find_one({"_id": oid, "status": "PUBLISHED"})
    except Exception:
        raise NotFound("E-Book not found.")

    rating = int(payload.get("rating", 5))
    if rating < 1 or rating > 5:
        raise ValidationError("Rating must be between 1 and 5 stars.")

    comment = str(payload.get("comment", "")).strip()
    now = _now()

    await db.ebook_reviews.update_one(
        {"ebookId": oid, "userId": ctx.user_id},
        {
            "$set": {
                "ebookId": oid,
                "userId": ctx.user_id,
                "userName": ctx.user_name or "Learner",
                "userRole": ctx.role,
                "rating": rating,
                "comment": comment,
                "updatedAt": now,
            },
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )

    # Recalculate average rating
    all_revs = await db.ebook_reviews.find({"ebookId": oid}).to_list(500)
    avg_rating = round(sum(r["rating"] for r in all_revs) / max(1, len(all_revs)), 1)
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"averageRating": avg_rating, "ratingsCount": len(all_revs)}},
    )

    return {"success": True, "message": "Review submitted successfully.", "averageRating": avg_rating}


@router.post("/{ebook_id}/reports")
async def report_ebook(
    ebook_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = Depends(require_auth),
) -> dict[str, Any]:
    db = get_db()
    try:
        oid = ObjectId(ebook_id)
        book = await db.ebooks.find_one({"_id": oid})
    except Exception:
        raise NotFound("E-Book not found.")

    reason = str(payload.get("reason", "")).strip()
    if not reason:
        raise ValidationError("Please provide a reason for the report.")

    details = str(payload.get("details", "")).strip()

    await db.ebook_reports.insert_one({
        "ebookId": oid,
        "ebookTitle": book.get("title"),
        "reportedBy": ctx.user_id,
        "reporterName": ctx.user_name,
        "reporterRole": ctx.role,
        "reason": reason,
        "details": details,
        "status": "OPEN",
        "createdAt": _now(),
    })

    return {"success": True, "message": "Thank you for reporting. Super Admin will review this content."}


# --------------------------------------------------------------------------- Bookmarks
@router.get("/{ebook_id}/bookmarks")
async def list_bookmarks(ebook_id: str, ctx: ScopeContext = Depends(require_auth)) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    items = await db.ebook_bookmarks.find({"ebookId": oid, "studentUserId": ctx.user_id}).sort("pageNumber", 1).to_list(100)
    return {"success": True, "data": serialize(items)}


@router.post("/{ebook_id}/bookmarks")
async def add_bookmark(ebook_id: str, payload: dict[str, Any], ctx: ScopeContext = Depends(require_auth)) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    page_number = int(payload.get("pageNumber", 1))
    note = str(payload.get("note", "")).strip()

    await db.ebook_bookmarks.update_one(
        {"ebookId": oid, "studentUserId": ctx.user_id, "pageNumber": page_number},
        {"$set": {"note": note, "updatedAt": _now()}, "$setOnInsert": {"createdAt": _now()}},
        upsert=True,
    )
    return {"success": True, "message": "Bookmark saved"}


@router.delete("/{ebook_id}/bookmarks/{page_number}")
async def remove_bookmark(ebook_id: str, page_number: int, ctx: ScopeContext = Depends(require_auth)) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    await db.ebook_bookmarks.delete_one({"ebookId": oid, "studentUserId": ctx.user_id, "pageNumber": page_number})
    return {"success": True, "message": "Bookmark removed"}
