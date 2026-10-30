"""E-Book processing, security validation, thumbnail generation, and page-slicing service."""
from __future__ import annotations

import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Tuple
from bson import ObjectId

import pymupdf  # PyMuPDF
from pypdf import PdfReader, PdfWriter

from app.core.errors import NotFound, ValidationError
from app.core.logging import get_logger
from app.repositories.ebook_repo import EbookRepository
from app.services.storage import Keys, get_storage

log = get_logger("app.services.ebook")

MAX_EBOOK_FILE_BYTES = 100 * 1024 * 1024  # 100 MB max PDF size
FREE_PREVIEW_PAGE_LIMIT = 5

DEFAULT_CATEGORIES = [
    {"slug": "programming", "name": "Programming", "description": "Core programming languages, syntax & software development guides."},
    {"slug": "dsa", "name": "DSA", "description": "Data structures, algorithms and coding interview patterns."},
    {"slug": "web-development", "name": "Web Development", "description": "Frontend, backend, APIs and modern full-stack frameworks."},
    {"slug": "ai-ml", "name": "AI/ML", "description": "Artificial intelligence, machine learning, and deep learning references."},
    {"slug": "cloud-computing", "name": "Cloud Computing", "description": "AWS, GCP, Azure, DevOps and cloud infrastructure handbooks."},
    {"slug": "cyber-security", "name": "Cyber Security", "description": "Ethical hacking, network security and defensive architecture."},
    {"slug": "data-science", "name": "Data Science", "description": "Data analytics, statistics, pandas and visual intelligence."},
    {"slug": "interview-preparation", "name": "Interview Preparation", "description": "STAR behavioural frameworks, HR round scripts and placement roadmaps."},
    {"slug": "academic", "name": "Academic", "description": "University curricula, semester syllabus notes and engineering fundamentals."},
    {"slug": "career", "name": "Career", "description": "Resume writing, career navigation and workplace professionalism."},
    {"slug": "general", "name": "General", "description": "Broad technical references and student publications."},
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    return re.sub(r"[-\s]+", "-", cleaned) or f"ebook-{uuid.uuid4().hex[:8]}"


def validate_pdf_bytes(pdf_bytes: bytes) -> Tuple[int, int]:
    """Strictly validates that data is a real, valid PDF file.
    
    Checks:
    - Magic bytes signature (%PDF-)
    - Maximum size
    - PDF structure & validity via PyMuPDF / pypdf
    - Returns (page_count, file_size_bytes)
    """
    if not pdf_bytes:
        raise ValidationError("File is empty.")

    if len(pdf_bytes) > MAX_EBOOK_FILE_BYTES:
        raise ValidationError(f"PDF exceeds the maximum allowed size of {MAX_EBOOK_FILE_BYTES // (1024 * 1024)}MB.")

    # Validate Magic Bytes (ISO 32000-1 allows %PDF- header within the first 1024 bytes)
    header_idx = pdf_bytes[:1024].find(b"%PDF-")
    if header_idx == -1:
        raise ValidationError("Invalid file format. Uploaded file is not a valid PDF.")

    try:
        stream_data = pdf_bytes[header_idx:] if header_idx > 0 else pdf_bytes
        doc = pymupdf.open(stream=stream_data, filetype="pdf")
        page_count = doc.page_count
        doc.close()
    except Exception as exc:
        log.warning("pdf_validation_failed", extra={"error": str(exc)})
        raise ValidationError(f"Corrupt or invalid PDF file: {exc}")

    if page_count < 1:
        raise ValidationError("PDF has 0 pages.")

    return page_count, len(pdf_bytes)


def extract_cover_from_pdf(pdf_bytes: bytes) -> bytes:
    """Renders the first page of the PDF as a high quality WebP/JPEG thumbnail."""
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        first_page = doc[0]
        # Render at 1.5x resolution for crisp high-DPI display
        matrix = pymupdf.Matrix(1.5, 1.5)
        pix = first_page.get_pixmap(matrix=matrix, alpha=False)
        img_bytes = pix.tobytes("jpeg")
        doc.close()
        return img_bytes
    except Exception as exc:
        log.warning("pdf_cover_extraction_failed", extra={"error": str(exc)})
        return b""


def create_pdf_slice(pdf_bytes: bytes, max_pages: int = FREE_PREVIEW_PAGE_LIMIT) -> bytes:
    """Extracts only the first `max_pages` into a standalone, safe preview PDF.
    
    Guarantees page 6+ content is physically stripped and never leaves the server
    for unauthenticated preview access.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        total = len(reader.pages)
        limit = min(total, max_pages)

        for i in range(limit):
            writer.add_page(reader.pages[i])

        out_buffer = io.BytesIO()
        writer.write(out_buffer)
        return out_buffer.getvalue()
    except Exception as exc:
        log.error("pdf_slice_creation_failed", extra={"error": str(exc)})
        raise ValidationError("Could not generate PDF preview.")


async def ensure_categories_seeded() -> None:
    """Ensures standard eBook categories exist in the database."""
    await EbookRepository.ensure_categories_seeded()


async def get_or_create_preview_slice(ebook_doc: dict[str, Any]) -> bytes:
    """Retrieves or generates the 5-page preview slice for an eBook."""
    preview_key = ebook_doc.get("previewKey")
    storage = get_storage()

    if preview_key and await storage.exists(preview_key):
        return await storage.get(preview_key)

    file_key = ebook_doc.get("fileKey")
    if not file_key or not await storage.exists(file_key):
        raise NotFound("PDF file is currently unavailable.")

    original_bytes = await storage.get(file_key)
    sliced_bytes = create_pdf_slice(original_bytes, max_pages=FREE_PREVIEW_PAGE_LIMIT)

    # Cache sliced preview in storage
    ebook_id = str(ebook_doc["_id"])
    new_preview_key = Keys.ebook_file(ebook_id, "preview_5pages.pdf")
    await storage.put(new_preview_key, sliced_bytes, "application/pdf")

    # Update document with previewKey
    eb_id = ebook_doc.get("id") or ebook_doc.get("_id")
    await EbookRepository.update_preview_key(eb_id, new_preview_key)

    return sliced_bytes
