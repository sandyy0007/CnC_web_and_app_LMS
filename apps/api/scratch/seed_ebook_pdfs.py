import asyncio
import io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from app.db.mongo import connect_to_mongo, get_db
from app.services.storage import get_storage, Keys
from app.services.ebook_service import extract_cover_from_pdf, create_pdf_slice, slugify

def make_sample_pdf(title: str, author: str, num_pages: int = 10) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    for p in range(1, num_pages + 1):
        c.setFont("Helvetica-Bold", 22)
        c.drawString(72, 720, title)
        c.setFont("Helvetica", 14)
        c.drawString(72, 690, f"By {author} · Winners Creek Publishing Platform")
        c.setStrokeColorRGB(0.2, 0.3, 0.8)
        c.setLineWidth(2)
        c.line(72, 675, 540, 675)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(72, 640, f"Chapter {p}: Core Concepts & Industry Insights")
        c.setFont("Helvetica", 12)
        text = [
            f"This is official content for Page {p} of \"{title}\".",
            "Winners Creek is a modern learning platform connecting students, trainers, colleges and digital learning experiences.",
            "Our structured modules and reference guides are designed to help students master technical mastery and interview communication.",
            "Every student should practice these principles rigorously during weekly training and mock interviews.",
            "Remember: excellence is built through continuous, deliberate daily habits.",
        ]
        y = 600
        for line in text:
            c.drawString(72, y, line)
            y -= 24
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(72, 50, f"Winners Creek Digital Library · Page {p} of {num_pages}")
        c.showPage()
    c.save()
    return buf.getvalue()

async def main():
    await connect_to_mongo()
    db = get_db()
    storage = get_storage()
    books = await db.ebooks.find({}).to_list(100)
    for b in books:
        str_id = str(b["_id"])
        slug = b.get("slug") or slugify(b["title"])
        pdf_bytes = make_sample_pdf(b["title"], b["author"], num_pages=10)
        file_key = Keys.ebook_file(str_id, f"{slug}.pdf")
        await storage.put(file_key, pdf_bytes, "application/pdf")
        cover_bytes = extract_cover_from_pdf(pdf_bytes)
        cover_key = Keys.ebook_cover(str_id, "cover.jpg")
        await storage.put(cover_key, cover_bytes, "image/jpeg")
        preview_bytes = create_pdf_slice(pdf_bytes, max_pages=5)
        preview_key = Keys.ebook_file(str_id, "preview_5pages.pdf")
        await storage.put(preview_key, preview_bytes, "application/pdf")
        await db.ebooks.update_one({"_id": b["_id"]}, {"$set": {
            "slug": slug,
            "status": "PUBLISHED",
            "published": True,
            "visibility": "PUBLIC",
            "allowDownload": True,
            "fileKey": file_key,
            "coverKey": cover_key,
            "previewKey": preview_key,
            "fileSizeBytes": len(pdf_bytes),
            "pageCount": 10,
        }})
    print(f"Successfully generated real PDFs, covers, and 5-page previews for {len(books)} eBooks.")

if __name__ == "__main__":
    asyncio.run(main())

