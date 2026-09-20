"""Seed script.

    python -m app.seed.run            # create demo data (refuses if data exists)
    python -m app.seed.run --reset    # wipe the seeded collections first
    python -m app.seed.run --minimal  # catalogues + accounts only, no cohort

Everything here is **demo data**. It is shaped to match the supplied screenshots (428 CSE
participants, 12 trainers, ~82.6% attendance, department average ~74/100, Batch A/B/C, the named
participants and trainers) so the dashboards, charts, tables, trends and reports are all
populated and testable — but no value is hard-coded into a UI component. Every figure the app
displays is computed from these rows at request time.

Generation is deterministic (fixed RNG seed), so a re-seed produces the same database.
"""
from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.security import hash_password
from app.db.indexes import ALL_COLLECTIONS, ensure_indexes
from app.db.mongo import connect_to_mongo, get_db, is_inmemory
from app.seed import catalogues as cat

log = get_logger("app.seed")
RNG = random.Random(20260910)

NOW = datetime.now(timezone.utc)
TODAY = NOW.replace(hour=0, minute=0, second=0, microsecond=0)

#: Sessions generated per batch. A real MongoDB deployment gets the full training cycle; the
#: in-process development store gets a lighter one so `--reset` stays fast there.
SESSIONS_PER_BATCH_FULL = {"primary": 49, "other": 21}
SESSIONS_PER_BATCH_LIGHT = {"primary": 18, "other": 8}

DEMO_PASSWORD = "Eedi@2026"

COLLEGE = {"name": "ABC Engineering College", "code": "ABC"}

DEPARTMENTS = [
    ("Computer Science", "CSE", 428),
    ("Electronics & Communication", "ECE", 96),
    ("Mechanical Engineering", "MECH", 84),
    ("AI / Data Science", "AIDS", 72),
    ("Information Technology", "IT", 78),
    ("Civil Engineering", "CIVIL", 60),
    ("Electrical Engineering", "EEE", 66),
]

#: CSE trainers, matching the Trainer Roster screenshot plus the master-prompt examples.
CSE_TRAINERS = [
    ("Dr. R. Bose", "r.bose", "Associate Professor", ["Communication", "Teamwork"], 42, 4.7),
    ("Prof. A. Kapoor", "a.kapoor", "Assistant Professor", ["Leadership"], 28, 4.3),
    ("Dr. S. Nair", "s.nair", "Professor", ["Presentation Skills"], 35, 4.5),
    ("Prof. M. Iyer", "m.iyer", "Assistant Professor", ["Teamwork", "Leadership"], 31, 4.1),
    ("Dr. K. Sharma", "k.sharma", "Associate Professor", ["Communication"], 39, 4.8),
    ("Prof. Alan Walker", "alan.walker", "Professor", ["Communication"], 26, 4.6),
    ("Prof. Rohan Mehta", "rohan.mehta", "Associate Professor", ["Presentation Skills"], 24, 4.4),
    ("Dr. Neha Sharma", "neha.sharma", "Professor", ["Leadership"], 22, 4.7),
    ("Dr. P. Menon", "p.menon", "Assistant Professor", ["Teamwork"], 19, 4.2),
    ("Prof. V. Rao", "v.rao", "Assistant Professor", ["Communication"], 17, 4.0),
    ("Dr. S. Banerjee", "s.banerjee", "Associate Professor", ["Leadership"], 15, 4.3),
    ("Prof. L. DSouza", "l.dsouza", "Assistant Professor", ["Presentation Skills"], 13, 4.1),
]

#: Participants shown in the HOD screenshots — seeded with their exact displayed figures.
NAMED_PARTICIPANTS: list[tuple[str, str, str, float, float]] = [
    # (name, rollNumber, batch, attendancePct, avgScore)
    ("Rahul Sharma", "CSE21B045", "C", 94, 88),
    ("Ananya Iyer", "CSE21B012", "A", 61, 72),
    ("Vikram Nair", "CSE21B078", "B", 88, 91),
    ("Sneha Reddy", "CSE21B033", "A", 45, 58),
    ("Karan Mehta", "CSE21B091", "C", 79, 84),
    ("Divya Menon", "CSE21B056", "B", 96, 93),
    ("Arjun Verma", "CSE21B019", "A", 68, 76),
    ("Priyanka Das", "CSE21B064", "C", 52, 61),
    ("Rohit Bansal", "CSE21B027", "B", 58, 64),
    ("Meera Pillai", "CSE21B071", "C", 63, 69),
]

FIRST_NAMES = (
    "Aarav Aditi Advait Akash Ananya Anika Arjun Aryan Bhavya Chirag Darshan Deepika Dhruv Esha "
    "Farhan Gaurav Harsh Ishaan Isha Jatin Kavya Kiran Lakshya Manish Meher Naveen Nikhil Nisha "
    "Omkar Pooja Pranav Priya Rahul Rajat Riya Rohan Sahil Sanya Shreya Siddharth Simran Tanvi "
    "Tarun Uday Varun Vidya Vikas Yash Zara Neeraj Swara Aniket Kritika Rachit Mitali Pavan "
    "Shruti Kunal Devika Tejas"
).split()
LAST_NAMES = (
    "Sharma Verma Iyer Nair Reddy Mehta Menon Das Bansal Pillai Gupta Singh Patel Rao Joshi Kulkarni "
    "Kumawat Bose Kapoor Banerjee Chatterjee Desai Ghosh Hegde Jain Khanna Malhotra Naidu Pandey "
    "Saxena Trivedi Varma"
).split()

BATCH_BASE_SCORE = {"A": 68.0, "B": 76.0, "C": 81.0}
MODULE_OFFSET = {"Communication": 3.0, "Teamwork": 0.0, "Leadership": -7.0, "Presentation Skills": 5.0}

TARGET_ATTENDANCE_MEAN = 82.6
TARGET_DEFAULTERS = 47
TARGET_LOW_SCORES = 23
TARGET_PENDING_CERTIFICATES = 38

SEED_MARKER = "eedi-seed-v1"


def _avatar_colour(seed: str) -> str:
    palette = ("#4B3FE4", "#1E9E6B", "#DB4437", "#F2A93B", "#8B5CF6", "#0EA5A0", "#2F6FE4")
    return palette[abs(hash(seed)) % len(palette)]


def _doc(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "createdAt": NOW,
        "updatedAt": NOW,
        "deletedAt": None,
        "version": 1,
        "seedMarker": SEED_MARKER,
        **(extra or {}),
    }


async def _insert_many(collection: str, docs: list[dict[str, Any]], chunk: int = 2000) -> int:
    if not docs:
        return 0
    db = get_db()
    for start in range(0, len(docs), chunk):
        await db[collection].insert_many(docs[start : start + chunk], ordered=False)
    return len(docs)


# --------------------------------------------------------------------------- distributions
def _attendance_targets(count: int, named: list[float]) -> list[float]:
    """Attendance percentages that hit the demo mean with the intended defaulter count."""
    values = list(named)
    named_defaulters = sum(1 for v in named if v < settings.ATTENDANCE_DEFAULTER_THRESHOLD)
    remaining = count - len(named)
    extra_defaulters = max(0, TARGET_DEFAULTERS - named_defaulters)

    for _ in range(extra_defaulters):
        values.append(round(RNG.uniform(42, 74), 1))
    for _ in range(remaining - extra_defaulters):
        values.append(round(RNG.uniform(76, 97), 1))

    # Nudge the non-defaulter pool so the cohort mean lands on the demo target.
    current = sum(values) / len(values)
    delta = TARGET_ATTENDANCE_MEAN - current
    adjustable = [
        i
        for i, v in enumerate(values)
        if i >= len(named) and v >= settings.ATTENDANCE_DEFAULTER_THRESHOLD
    ]
    if adjustable and abs(delta) > 0.05:
        per = delta * len(values) / len(adjustable)
        for i in adjustable:
            values[i] = round(min(99.0, max(75.5, values[i] + per)), 1)
    return values


def _score_targets(count: int, named: list[float], batches: list[str]) -> list[float]:
    """Average skill scores per participant, biased by batch (A < B < C)."""
    values = list(named)
    for index in range(len(named), count):
        base = BATCH_BASE_SCORE[batches[index]]
        values.append(round(min(98.0, max(35.0, RNG.gauss(base, 7.5))), 1))

    named_low = sum(1 for v in named if v < 60)
    low_needed = max(0, TARGET_LOW_SCORES - named_low)
    candidates = sorted(range(len(named), count), key=lambda i: values[i])
    for i in candidates[:low_needed]:
        values[i] = round(RNG.uniform(41, 59), 1)
    for i in candidates[low_needed:]:
        if values[i] < 60:
            values[i] = round(RNG.uniform(60.5, 70), 1)
    return values


# --------------------------------------------------------------------------- seeding
async def seed(reset: bool = False, minimal: bool = False) -> dict[str, Any]:
    db = await connect_to_mongo()

    if reset:
        for collection in ALL_COLLECTIONS:
            await db[collection].delete_many({})
        log.info("seed_reset_complete", extra={"collections": len(ALL_COLLECTIONS)})
    elif await db.colleges.count_documents({}) > 0:
        raise SystemExit(
            "The database already contains data. Re-run with --reset to wipe and re-seed."
        )

    summary: dict[str, Any] = {}

    # ---------------------------------------------------------------- college & departments
    college_id = (
        await db.colleges.insert_one(
            _doc(
                {
                    "name": COLLEGE["name"],
                    "code": COLLEGE["code"],
                    "address": "Plot 14, Education City, Bengaluru, Karnataka 560100",
                    "contact": {"email": "office@abcengg.edu", "phone": "+91 80 4000 1000"},
                    "status": "active",
                    "timezone": settings.INSTITUTION_TIMEZONE,
                }
            )
        )
    ).inserted_id

    department_ids: dict[str, ObjectId] = {}
    for name, code, _ in DEPARTMENTS:
        department_ids[code] = (
            await db.departments.insert_one(
                _doc(
                    {
                        "name": name,
                        "code": code,
                        "collegeId": college_id,
                        "hodUserId": None,
                        "description": f"{name} — soft-skills and employability training programme",
                        "status": "active",
                    }
                )
            )
        ).inserted_id
    summary["departments"] = len(department_ids)

    # ---------------------------------------------------------------- catalogues
    await _insert_many(
        "skill_assessment_definitions",
        [
            _doc(
                {
                    "collegeId": college_id,
                    "pillar": pillar,
                    "code": code,
                    "label": label,
                    "description": description,
                    "maxScore": max_score,
                    "weight": weight,
                    "semesterFrom": sem_from,
                    "semesterTo": sem_to,
                    "scale": f"0-{max_score}",
                    "order": index,
                }
            )
            for index, (pillar, code, label, description, max_score, weight, sem_from, sem_to)
            in enumerate(cat.EVALUATION_PARAMETERS)
        ],
    )
    summary["evaluationParameters"] = len(cat.EVALUATION_PARAMETERS)

    # Every department gets its own copy of the module catalogue. Modules are department-scoped
    # in the data model, so a shared CSE-only catalogue would leave every other department's
    # sessions and evaluations pointing at a module their own trainers are refused access to.
    module_ids_by_department: dict[tuple[str, str], ObjectId] = {}
    for department_code in (code for _, code, _ in DEPARTMENTS):
        for module in cat.TRAINING_MODULES:
            module_ids_by_department[(department_code, module["name"])] = (
                await db.training_modules.insert_one(
                    _doc(
                        {
                            **module,
                            "code": f"{department_code}-{module['code']}"
                            if module.get("code")
                            else None,
                            "collegeId": college_id,
                            "departmentId": department_ids[department_code],
                            "departmentCode": department_code,
                            "rubricCriteria": list(cat.RUBRIC_CRITERIA),
                            "status": "active",
                        }
                    )
                )
            ).inserted_id

    def module_id_for(department_code: str, module_name: str) -> ObjectId:
        return module_ids_by_department[(department_code, module_name)]

    #: CSE is the demo department the screenshots are taken from; most seeding below is CSE.
    module_ids: dict[str, ObjectId] = {
        module["name"]: module_id_for("CSE", module["name"]) for module in cat.TRAINING_MODULES
    }

    # Courses → modules → lessons
    course_count = lesson_count = 0
    for course in cat.COURSES:
        course_id = (
            await db.courses.insert_one(
                _doc(
                    {
                        **{k: v for k, v in course.items() if k != "modules"},
                        "published": True,
                        "enrollmentOpen": True,
                        "trainerName": course.get("trainerName", "EEDI Faculty"),
                    }
                )
            )
        ).inserted_id
        course_count += 1
        for order, (module_title, lessons) in enumerate(course["modules"], start=1):
            module_id = (
                await db.modules.insert_one(
                    _doc({"courseId": course_id, "title": module_title, "order": order})
                )
            ).inserted_id
            await _insert_many(
                "lessons",
                [
                    _doc(
                        {
                            "courseId": course_id,
                            "moduleId": module_id,
                            "title": title,
                            "order": index,
                            "durationMinutes": RNG.choice([8, 12, 15, 18, 22]),
                            "kind": "video" if index % 2 else "reading",
                        }
                    )
                    for index, title in enumerate(lessons, start=1)
                ],
            )
            lesson_count += len(lessons)
    summary["courses"] = course_count
    summary["lessons"] = lesson_count

    await _insert_many(
        "practice_modes", [_doc(dict(mode)) for mode in cat.PRACTICE_MODES]
    )
    await _insert_many("game_definitions", [_doc({**game, "published": True}) for game in cat.GAMES])
    await _insert_many("exercise_library", [_doc(dict(x)) for x in cat.EXERCISES])
    await _insert_many("achievements", [_doc(dict(a)) for a in cat.ACHIEVEMENTS])
    await _insert_many("faqs", [_doc(dict(f)) for f in cat.FAQS])
    await _insert_many("testimonials", [_doc(dict(t)) for t in cat.TESTIMONIALS])
    await _insert_many(
        "announcements",
        [
            _doc(
                {
                    **announcement,
                    "collegeId": college_id,
                    "publishedAt": NOW - timedelta(days=index * 3),
                    "author": "EEDI Programme Office",
                }
            )
            for index, announcement in enumerate(cat.ANNOUNCEMENT_TEMPLATES)
        ],
    )
    summary["practiceModes"] = len(cat.PRACTICE_MODES)
    summary["games"] = len(cat.GAMES)

    sample_ebooks = [
        {
            "collegeId": college_id,
            "title": "The Tech Interview Playbook",
            "author": "Dr. Arvind Rao",
            "description": "Comprehensive guide to behavioural STAR stories, whiteboard interviews, and modern hiring rounds.",
            "category": "Interview",
            "pageCount": 184,
            "fileSizeBytes": 4820000,
            "tags": ["interview", "hr", "star", "placements"],
            "slug": "the-tech-interview-playbook",
            "status": "PUBLISHED",
            "published": True,
            "visibility": "PUBLIC",
            "isFeatured": True,
            "isPinned": True,
            "displayOrder": 1,
            "allowDownload": True,
            "averageRating": 4.9,
            "ratingsCount": 28,
            "readsCount": 142,
            "completionsCount": 38,
            "coverKey": None,
            "fileKey": None,
            "createdAt": NOW - timedelta(days=20),
            "updatedAt": NOW - timedelta(days=20),
            "deletedAt": None,
        },
        {
            "collegeId": college_id,
            "title": "Mastering Professional Communication",
            "author": "Pooja Sharma",
            "description": "Crisp verbal articulation, email etiquette, and persuasive presentations for engineering graduates.",
            "category": "Communication",
            "pageCount": 142,
            "fileSizeBytes": 3950000,
            "tags": ["speaking", "writing", "listening", "emails"],
            "slug": "mastering-professional-communication",
            "status": "PUBLISHED",
            "published": True,
            "visibility": "PUBLIC",
            "isFeatured": True,
            "isPinned": False,
            "displayOrder": 2,
            "allowDownload": True,
            "averageRating": 4.8,
            "ratingsCount": 42,
            "readsCount": 218,
            "completionsCount": 64,
            "coverKey": None,
            "fileKey": None,
            "createdAt": NOW - timedelta(days=25),
            "updatedAt": NOW - timedelta(days=25),
            "deletedAt": None,
        },
        {
            "collegeId": college_id,
            "title": "Data Structures & Algorithms in Practice",
            "author": "Rajesh Bose",
            "description": "Essential patterns for technical problem-solving rounds: two pointers, graphs, dynamic programming.",
            "category": "Technical",
            "pageCount": 260,
            "fileSizeBytes": 7200000,
            "tags": ["dsa", "coding", "technical", "algorithms"],
            "slug": "data-structures-algorithms-in-practice",
            "status": "PUBLISHED",
            "published": True,
            "visibility": "PUBLIC",
            "isFeatured": True,
            "isPinned": True,
            "displayOrder": 3,
            "allowDownload": True,
            "averageRating": 5.0,
            "ratingsCount": 56,
            "readsCount": 310,
            "completionsCount": 89,
            "coverKey": None,
            "fileKey": None,
            "createdAt": NOW - timedelta(days=15),
            "updatedAt": NOW - timedelta(days=15),
            "deletedAt": None,
        },
        {
            "collegeId": college_id,
            "title": "Essential Aptitude for Campus Placements",
            "author": "Kiran Deshmukh",
            "description": "Speed math, probability, logical seating arrangements, and data interpretation drills.",
            "category": "Problem Solving",
            "pageCount": 210,
            "fileSizeBytes": 5100000,
            "tags": ["quant", "aptitude", "logical"],
            "slug": "essential-aptitude-for-campus-placements",
            "status": "PUBLISHED",
            "published": True,
            "visibility": "PUBLIC",
            "isFeatured": False,
            "isPinned": False,
            "displayOrder": 4,
            "allowDownload": False,
            "averageRating": 4.7,
            "ratingsCount": 19,
            "readsCount": 175,
            "completionsCount": 42,
            "coverKey": None,
            "fileKey": None,
            "createdAt": NOW - timedelta(days=30),
            "updatedAt": NOW - timedelta(days=30),
            "deletedAt": None,
        },
        {
            "collegeId": college_id,
            "title": "Leadership Dynamics for Young Engineers",
            "author": "Anita Sen",
            "description": "Leading cross-functional teams, handling disagreements constructively, and demonstrating ownership.",
            "category": "Behaviour",
            "pageCount": 156,
            "fileSizeBytes": 4100000,
            "tags": ["leadership", "teamwork", "ownership"],
            "slug": "leadership-dynamics-for-young-engineers",
            "status": "PUBLISHED",
            "published": True,
            "visibility": "PUBLIC",
            "isFeatured": False,
            "isPinned": False,
            "displayOrder": 5,
            "allowDownload": True,
            "averageRating": 4.6,
            "ratingsCount": 14,
            "readsCount": 98,
            "completionsCount": 21,
            "coverKey": None,
            "fileKey": None,
            "createdAt": NOW - timedelta(days=10),
            "updatedAt": NOW - timedelta(days=10),
            "deletedAt": None,
        },
        {
            "collegeId": college_id,
            "title": "Confidence Under Pressure",
            "author": "Vikram Mehta",
            "description": "Overcoming public speaking anxiety, voice projection techniques, and confident body language.",
            "category": "Confidence",
            "pageCount": 128,
            "fileSizeBytes": 3400000,
            "tags": ["confidence", "body language", "public speaking"],
            "slug": "confidence-under-pressure",
            "status": "PUBLISHED",
            "published": True,
            "visibility": "PUBLIC",
            "isFeatured": False,
            "isPinned": False,
            "displayOrder": 6,
            "allowDownload": False,
            "averageRating": 4.9,
            "ratingsCount": 31,
            "readsCount": 164,
            "completionsCount": 55,
            "coverKey": None,
            "fileKey": None,
            "deletedAt": None,
        },
    ]

    # Generate real, valid PDFs and covers for seed eBooks
    import io
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from app.services.storage import get_storage, Keys
    from app.services.ebook_service import extract_cover_from_pdf, create_pdf_slice

    storage = get_storage()
    for b in sample_ebooks:
        doc_id = b.setdefault("_id", ObjectId())
        str_id = str(doc_id)
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        num_pages = 10
        for p in range(1, num_pages + 1):
            c.setFont("Helvetica-Bold", 22)
            c.drawString(72, 720, b["title"])
            c.setFont("Helvetica", 14)
            c.drawString(72, 690, f"By {b['author']} · Winners Creek Publishing Platform")
            c.setStrokeColorRGB(0.2, 0.3, 0.8)
            c.setLineWidth(2)
            c.line(72, 675, 540, 675)
            c.setFont("Helvetica-Bold", 16)
            c.drawString(72, 640, f"Chapter {p}: Core Concepts & Real-World Applications")
            c.setFont("Helvetica", 12)
            for y_off, line in enumerate([
                f"Official material from Winners Creek: Page {p} of \"{b['title']}\".",
                "Winners Creek provides structured paths, AI assessment, and comprehensive technical handbooks.",
                "Students and trainers collaborate through this digital ecosystem to build verified skills.",
                "Review the key takeaways and practice STAR-format examples for upcoming interview rounds.",
            ]):
                c.drawString(72, 600 - y_off * 24, line)
            c.setFont("Helvetica-Oblique", 10)
            c.drawString(72, 50, f"Winners Creek Digital Library · Page {p} of {num_pages}")
            c.showPage()
        c.save()
        pdf_bytes = buf.getvalue()

        file_key = Keys.ebook_file(str_id, f"{b['slug']}.pdf")
        await storage.put(file_key, pdf_bytes, "application/pdf")
        cover_bytes = extract_cover_from_pdf(pdf_bytes)
        cover_key = Keys.ebook_cover(str_id, "cover.jpg")
        await storage.put(cover_key, cover_bytes, "image/jpeg")
        preview_bytes = create_pdf_slice(pdf_bytes, max_pages=5)
        preview_key = Keys.ebook_file(str_id, "preview_5pages.pdf")
        await storage.put(preview_key, preview_bytes, "application/pdf")

        b["fileKey"] = file_key
        b["coverKey"] = cover_key
        b["previewKey"] = preview_key
        b["fileSizeBytes"] = len(pdf_bytes)
        b["pageCount"] = num_pages

    await _insert_many("ebooks", [_doc(b) for b in sample_ebooks])
    summary["ebooks"] = len(sample_ebooks)

    certificate_template_id = (
        await db.certificate_templates.insert_one(
            _doc(
                {
                    "collegeId": college_id,
                    "name": "Soft-Skills & Employability Programme",
                    "code": "SSEP",
                    "criteria": {
                        "minAttendance": settings.CERTIFICATE_MIN_ATTENDANCE,
                        "minAvgScore": settings.CERTIFICATE_MIN_AVG_SCORE,
                    },
                    "active": True,
                    "status": "active",
                }
            )
        )
    ).inserted_id

    # ---------------------------------------------------------------- staff accounts
    password_hash = hash_password(DEMO_PASSWORD)

    async def make_user(
        *,
        name: str,
        email: str,
        role: str,
        department_code: str | None = None,
        designation: str | None = None,
        institution_id: str | None = None,
        expertise: list[str] | None = None,
        public: bool = False,
    ) -> ObjectId:
        department_id = department_ids.get(department_code) if department_code else None
        department_name = next(
            (n for n, c, _ in DEPARTMENTS if c == department_code), None
        )
        # `institutionId` carries a sparse unique index: the key is omitted rather than set to
        # null, because a sparse index skips missing fields but still indexes explicit nulls.
        return (
            await db.users.insert_one(
                _doc(
                    {
                        "name": name,
                        "email": email,
                        **({"institutionId": institution_id} if institution_id else {}),
                        "passwordHash": password_hash,
                        "role": role,
                        "collegeId": college_id,
                        "collegeName": COLLEGE["name"],
                        "departmentId": department_id,
                        "departmentName": department_name,
                        "designation": designation,
                        "expertise": expertise or [],
                        "showOnPublicSite": public,
                        "status": "active",
                        "emailVerified": True,
                        "avatarColor": _avatar_colour(email),
                        "lastActiveAt": NOW - timedelta(hours=RNG.randint(1, 60)),
                        "preferences": {
                            "emailNotifications": True,
                            "pushNotifications": True,
                            "smsNotifications": False,
                            "classRecordings": True,
                            "profileVisibleToRecruiters": True,
                            "recordingConsent": True,
                        },
                    }
                )
            )
        ).inserted_id

    admin_id = await make_user(
        name="Rishabh Kumawat", email="rishabh.kumawat@abcengg.edu", role="ADMIN",
        designation="Institution Admin",
    )
    await make_user(
        name="EEDI Platform Owner", email="superadmin@eedilms.app", role="SUPER_ADMIN"
    )
    await make_user(
        name="Placement Cell", email="placement@abcengg.edu", role="PLACEMENT_CELL",
        designation="Training & Placement Officer",
    )

    # One HOD per department. CSE gets Priya Kulkarni (as shown in the HOD screenshots);
    # Priya Kumawat (named in the master prompt) heads AI/Data Science so both examples exist.
    hod_names = {
        "CSE": ("Priya Kulkarni", "priya.kulkarni"),
        "ECE": ("Dr. S. Venkatesh", "s.venkatesh"),
        "MECH": ("Dr. A. Deshpande", "a.deshpande"),
        "AIDS": ("Priya Kumawat", "priya.kumawat"),
        "IT": ("Dr. M. Fernandes", "m.fernandes"),
        "CIVIL": ("Dr. R. Chauhan", "r.chauhan"),
        "EEE": ("Dr. T. Krishnan", "t.krishnan"),
    }
    hod_ids: dict[str, ObjectId] = {}
    for code, (name, handle) in hod_names.items():
        hod_id = await make_user(
            name=name, email=f"{handle}@abcengg.edu", role="HOD",
            department_code=code, designation="Head of Department",
        )
        hod_ids[code] = hod_id
        await db.departments.update_one(
            {"_id": department_ids[code]}, {"$set": {"hodUserId": hod_id}}
        )

    trainer_ids: dict[str, ObjectId] = {}
    trainer_meta: dict[ObjectId, dict[str, Any]] = {}
    for name, handle, designation, modules, sessions, rating in CSE_TRAINERS:
        trainer_id = await make_user(
            name=name, email=f"{handle}@abcengg.edu", role="TRAINER",
            department_code="CSE", designation=designation, expertise=modules, public=True,
        )
        trainer_ids[name] = trainer_id
        trainer_meta[trainer_id] = {
            "name": name, "modules": modules, "sessions": sessions, "rating": rating,
        }

    other_department_trainers: dict[str, list[ObjectId]] = {}
    for name, code, _ in DEPARTMENTS:
        if code == "CSE":
            continue
        ids = []
        for index in range(2):
            surname = LAST_NAMES[(hash(code) + index) % len(LAST_NAMES)]
            ids.append(
                await make_user(
                    name=f"Dr. {surname}",
                    email=f"{code.lower()}.trainer{index + 1}@abcengg.edu",
                    role="TRAINER", department_code=code, designation="Assistant Professor",
                    expertise=[cat.TRAINING_MODULES[index % 4]["name"]],
                )
            )
        other_department_trainers[code] = ids

    summary["staffAccounts"] = 3 + len(hod_ids) + len(trainer_ids) + sum(
        len(v) for v in other_department_trainers.values()
    )

    # ---------------------------------------------------------------- semesters & batches
    batch_ids: dict[tuple[str, str], ObjectId] = {}
    semester_ids: dict[str, ObjectId] = {}
    for code, department_id in department_ids.items():
        semester_ids[code] = (
            await db.semesters.insert_one(
                _doc(
                    {
                        "collegeId": college_id,
                        "departmentId": department_id,
                        "number": 6,
                        "label": "Semester 6",
                        "academicYear": "2026-27",
                        "active": True,
                        "status": "active",
                    }
                )
            )
        ).inserted_id
        letters = ("A", "B", "C") if code == "CSE" else ("A", "B")
        for letter in letters:
            batch_ids[(code, letter)] = (
                await db.batches.insert_one(
                    _doc(
                        {
                            "name": f"Batch {letter}",
                            "code": f"{code}-{letter}",
                            "collegeId": college_id,
                            "departmentId": department_id,
                            "departmentName": next(n for n, c, _ in DEPARTMENTS if c == code),
                            "semesterId": semester_ids[code],
                            "semesterNumber": 6,
                            "capacity": 160 if code == "CSE" else 60,
                            "status": "active",
                        }
                    )
                )
            ).inserted_id
    summary["batches"] = len(batch_ids)

    # ---------------------------------------------------------------- trainer assignments
    assignments: list[dict[str, Any]] = []
    for trainer_id, meta in trainer_meta.items():
        for module_name in meta["modules"]:
            for letter in ("A", "B", "C"):
                assignments.append(
                    _doc(
                        {
                            "trainerUserId": trainer_id,
                            "trainerName": meta["name"],
                            "collegeId": college_id,
                            "departmentId": department_ids["CSE"],
                            "batchId": batch_ids[("CSE", letter)],
                            "batchName": f"Batch {letter}",
                            "trainingModuleId": module_ids[module_name],
                            "trainingModuleName": module_name,
                            "academicYear": "2026-27",
                            "active": True,
                        }
                    )
                )
    for code, ids in other_department_trainers.items():
        for index, trainer_id in enumerate(ids):
            module_name = cat.TRAINING_MODULES[index % 4]["name"]
            for letter in ("A", "B"):
                assignments.append(
                    _doc(
                        {
                            "trainerUserId": trainer_id,
                            "collegeId": college_id,
                            "departmentId": department_ids[code],
                            "batchId": batch_ids[(code, letter)],
                            "batchName": f"Batch {letter}",
                            "trainingModuleId": module_id_for(code, module_name),
                            "trainingModuleName": module_name,
                            "academicYear": "2026-27",
                            "active": True,
                        }
                    )
                )
    await _insert_many("trainer_assignments", assignments)
    summary["trainerAssignments"] = len(assignments)

    if minimal:
        summary["indexes"] = await ensure_indexes(db)
        log.info("seed_minimal_complete", extra=summary)
        return _finish(summary, college_id, admin_id, hod_ids, trainer_ids, None)

    # ---------------------------------------------------------------- training sessions
    sessions_docs: list[dict[str, Any]] = []
    session_index: dict[tuple[str, str], list[dict[str, Any]]] = {}
    module_names = [m["name"] for m in cat.TRAINING_MODULES]

    per_batch_plan = SESSIONS_PER_BATCH_LIGHT if is_inmemory() else SESSIONS_PER_BATCH_FULL
    for (code, letter), batch_id in batch_ids.items():
        per_batch = per_batch_plan["primary" if code == "CSE" else "other"]
        bucket: list[dict[str, Any]] = []
        for n in range(per_batch):
            module_name = module_names[n % len(module_names)]
            if code == "CSE":
                trainer_pool = [
                    tid for tid, meta in trainer_meta.items() if module_name in meta["modules"]
                ] or list(trainer_ids.values())
            else:
                trainer_pool = other_department_trainers[code]
            trainer_id = trainer_pool[n % len(trainer_pool)]
            date = TODAY - timedelta(days=(per_batch - n) * 3 + RNG.randint(0, 1))
            document = _doc(
                {
                    "_id": ObjectId(),
                    "collegeId": college_id,
                    "departmentId": department_ids[code],
                    "batchId": batch_id,
                    "batchName": f"Batch {letter}",
                    "trainingModuleId": module_id_for(code, module_name),
                    "trainingModuleName": module_name,
                    "trainerUserId": trainer_id,
                    "trainerName": trainer_meta.get(trainer_id, {}).get("name"),
                    "date": date,
                    "endsAt": date + timedelta(hours=1, minutes=30),
                    "topic": f"{module_name} — Session {n + 1}",
                    "status": "completed" if date < TODAY else "scheduled",
                }
            )
            sessions_docs.append(document)
            bucket.append(document)
        session_index[(code, letter)] = bucket

    # A few sessions deliberately have no attendance recorded, so the "no attendance data"
    # counter and the "excluded from denominator" rule are both exercised.
    no_attendance_sessions = {
        session_index[("CSE", "A")][-1]["_id"],
        session_index[("CSE", "B")][-1]["_id"],
        session_index[("CSE", "C")][-1]["_id"],
    }

    # Today's classes for the trainer portal.
    for offset, letter in enumerate(("A", "B", "C")):
        module_name = module_names[offset % len(module_names)]
        trainer_id = trainer_ids["Dr. R. Bose"] if offset == 0 else trainer_ids["Dr. K. Sharma"]
        start = TODAY + timedelta(hours=10 + offset * 2)
        sessions_docs.append(
            _doc(
                {
                    "_id": ObjectId(),
                    "collegeId": college_id,
                    "departmentId": department_ids["CSE"],
                    "batchId": batch_ids[("CSE", letter)],
                    "batchName": f"Batch {letter}",
                    "trainingModuleId": module_ids[module_name],
                    "trainingModuleName": module_name,
                    "trainerUserId": trainer_id,
                    "trainerName": trainer_meta[trainer_id]["name"],
                    "date": start,
                    "endsAt": start + timedelta(hours=1, minutes=30),
                    "topic": f"{module_name} — today's session",
                    "status": "scheduled",
                }
            )
        )
    await _insert_many("training_sessions", sessions_docs)
    summary["trainingSessions"] = len(sessions_docs)

    # ---------------------------------------------------------------- participants
    used_emails: set[str] = set()
    used_rolls: set[str] = set()

    def unique_name(index: int) -> str:
        first = FIRST_NAMES[index % len(FIRST_NAMES)]
        last = LAST_NAMES[(index // len(FIRST_NAMES) + index) % len(LAST_NAMES)]
        return f"{first} {last}"

    student_users: list[dict[str, Any]] = []
    profiles: list[dict[str, Any]] = []
    enrollments: list[dict[str, Any]] = []
    enrollment_events: list[dict[str, Any]] = []
    cohort: list[dict[str, Any]] = []  # working set for downstream generation

    for name, code, size in DEPARTMENTS:
        letters = ("A", "B", "C") if code == "CSE" else ("A", "B")
        named = NAMED_PARTICIPANTS if code == "CSE" else []

        batch_assignment: list[str] = [p[2] for p in named]
        for index in range(len(named), size):
            batch_assignment.append(letters[index % len(letters)])

        attendance_targets = (
            _attendance_targets(size, [p[3] for p in named])
            if code == "CSE"
            else [round(RNG.uniform(62, 96), 1) for _ in range(size)]
        )
        score_targets = (
            _score_targets(size, [p[4] for p in named], batch_assignment)
            if code == "CSE"
            else [round(min(97, max(42, RNG.gauss(73, 9))), 1) for _ in range(size)]
        )

        for index in range(size):
            if index < len(named):
                person_name, roll = named[index][0], named[index][1]
            elif code == "CSE" and index == len(named):
                person_name, roll = "Alex Johnson", "CSE21B101"
            else:
                person_name = unique_name(index * 7 + hash(code) % 31)
                roll = f"{code}21B{index:03d}"
            while roll in used_rolls:
                roll = f"{code}21B{RNG.randint(200, 999)}"
            used_rolls.add(roll)

            handle = person_name.lower().replace(" ", ".").replace("'", "")
            email = f"{handle}@eedi.com" if person_name == "Alex Johnson" else f"{handle}.{roll.lower()}@abcengg.edu"
            while email in used_emails:
                email = f"{handle}.{RNG.randint(1000, 9999)}@abcengg.edu"
            used_emails.add(email)

            letter = batch_assignment[index]
            user_id = ObjectId()
            department_id = department_ids[code]
            batch_id = batch_ids[(code, letter)]

            student_users.append(
                _doc(
                    {
                        "_id": user_id,
                        "name": person_name,
                        "email": email,
                        "institutionId": roll,
                        "passwordHash": password_hash,
                        "role": "STUDENT",
                        "collegeId": college_id,
                        "collegeName": COLLEGE["name"],
                        "departmentId": department_id,
                        "departmentName": name,
                        "status": "active",
                        "emailVerified": True,
                        "avatarColor": _avatar_colour(email),
                        "lastActiveAt": NOW - timedelta(hours=RNG.randint(1, 120)),
                        "preferences": {
                            "emailNotifications": True,
                            "pushNotifications": True,
                            "smsNotifications": False,
                            "classRecordings": True,
                            "profileVisibleToRecruiters": True,
                            "recordingConsent": True,
                        },
                    }
                )
            )
            profiles.append(
                _doc(
                    {
                        "userId": user_id,
                        "name": person_name,
                        "email": email,
                        "rollNumber": roll,
                        "collegeId": college_id,
                        "departmentId": department_id,
                        "departmentName": name,
                        "batchId": batch_id,
                        "batchName": f"Batch {letter}",
                        "semester": 6,
                        "section": f"{code[:2]}-{letter}",
                        "program": f"B.Tech {name}",
                        "guardianInfo": {
                            "name": f"Guardian of {person_name.split()[0]}",
                            "phone": f"+91 98xxxxx{RNG.randint(100, 999)}",
                        },
                        "profileCompleteness": RNG.choice([62, 70, 78, 86, 94]),
                        "avatarColor": _avatar_colour(email),
                        "status": "active",
                    }
                )
            )

            # Enrollment status mix, matching the Enrollment Records screenshot.
            status, enrollment_type = "active", "regular"
            if code == "CSE":
                if person_name == "Vikram Nair":
                    status, enrollment_type = "on_hold", "transfer"
                elif person_name == "Ananya Iyer":
                    enrollment_type = "lateral"
                elif person_name == "Karan Mehta":
                    status = "completed"
                elif person_name == "Sneha Reddy":
                    status = "on_hold"
                elif index >= size - 5:
                    status = "dropped" if index % 2 else "transferred"
                elif size - 23 <= index < size - 5:
                    status = "completed"
                elif size - 30 <= index < size - 23:
                    status = "on_hold"
                elif index % 97 == 3:
                    enrollment_type = "lateral"

            enrollment_id = ObjectId()
            enrolled_at = TODAY - timedelta(days=RNG.randint(10, 60))
            enrolled_by_hod = RNG.random() < 0.45
            enrollments.append(
                _doc(
                    {
                        "_id": enrollment_id,
                        "studentUserId": user_id,
                        "studentName": person_name,
                        "rollNumber": roll,
                        "collegeId": college_id,
                        "departmentId": department_id,
                        "batchId": batch_id,
                        "batchName": f"Batch {letter}",
                        "enrolledBy": hod_ids[code] if enrolled_by_hod else admin_id,
                        "enrolledByLabel": (
                            f"HOD ({hod_names[code][0].split()[0]} "
                            f"{hod_names[code][0].split()[-1][0]})"
                            if enrolled_by_hod
                            else "College Admin"
                        ),
                        "enrolledAt": enrolled_at,
                        "enrollmentType": enrollment_type,
                        "courseMode": "OFFLINE",
                        "status": status,
                        "previousEnrollmentId": None,
                    }
                )
            )
            enrollment_events.append(
                _doc(
                    {
                        "enrollmentId": enrollment_id,
                        "studentUserId": user_id,
                        "collegeId": college_id,
                        "departmentId": department_id,
                        "fromStatus": None,
                        "toStatus": "active",
                        "reason": "Initial enrollment",
                        "actorId": hod_ids[code] if enrolled_by_hod else admin_id,
                        "actorLabel": "Enrolled by College Admin"
                        if not enrolled_by_hod
                        else f"HOD ({hod_names[code][0]})",
                        "at": enrolled_at,
                    }
                )
            )
            if status != "active":
                enrollment_events.append(
                    _doc(
                        {
                            "enrollmentId": enrollment_id,
                            "studentUserId": user_id,
                            "collegeId": college_id,
                            "departmentId": department_id,
                            "fromStatus": "active",
                            "toStatus": status,
                            "reason": {
                                "on_hold": "Transfer initiated — awaiting HOD confirmation",
                                "completed": "Programme cycle completed",
                                "dropped": "Withdrew from the programme",
                                "transferred": "Moved to another batch",
                            }[status],
                            "actorId": hod_ids[code],
                            "actorLabel": f"HOD ({hod_names[code][0]})",
                            "at": enrolled_at + timedelta(days=RNG.randint(3, 20)),
                        }
                    )
                )

            cohort.append(
                {
                    "userId": user_id,
                    "name": person_name,
                    "roll": roll,
                    "departmentCode": code,
                    "departmentId": department_id,
                    "departmentName": name,
                    "batchLetter": letter,
                    "batchId": batch_id,
                    "batchName": f"Batch {letter}",
                    "attendanceTarget": attendance_targets[index],
                    "scoreTarget": score_targets[index],
                    "enrollmentStatus": status,
                }
            )

    await _insert_many("users", student_users)
    await _insert_many("student_profiles", profiles)
    await _insert_many("enrollments", enrollments)
    await _insert_many("enrollment_events", enrollment_events)
    summary["participants"] = len(profiles)

    # ---------------------------------------------------------------- attendance
    attendance_docs: list[dict[str, Any]] = []
    for person in cohort:
        sessions = [
            s
            for s in session_index[(person["departmentCode"], person["batchLetter"])]
            if s["status"] == "completed" and s["_id"] not in no_attendance_sessions
        ]
        if not sessions:
            continue
        present_count = round(person["attendanceTarget"] / 100 * len(sessions))
        order = list(range(len(sessions)))
        RNG.shuffle(order)
        present_set = set(order[:present_count])
        for position, session in enumerate(sessions):
            if position in present_set:
                status = "late" if RNG.random() < 0.08 else "present"
            else:
                status = "leave" if RNG.random() < 0.12 else "absent"
            attendance_docs.append(
                {
                    "trainingSessionId": session["_id"],
                    "studentUserId": person["userId"],
                    "trainerUserId": session["trainerUserId"],
                    "collegeId": session["collegeId"],
                    "departmentId": session["departmentId"],
                    "batchId": session["batchId"],
                    "batchName": session["batchName"],
                    "trainingModuleId": session["trainingModuleId"],
                    "trainingModuleName": session["trainingModuleName"],
                    "date": session["date"],
                    "status": status,
                    "remark": None,
                    "createdAt": session["date"],
                    "updatedAt": session["date"],
                    "createdBy": session["trainerUserId"],
                    "seedMarker": SEED_MARKER,
                }
            )
    await _insert_many("attendance", attendance_docs)
    summary["attendanceRecords"] = len(attendance_docs)

    # ---------------------------------------------------------------- assessments
    definitions = await db.skill_assessment_definitions.find({}).to_list(length=500)
    by_pillar: dict[str, list[dict[str, Any]]] = {}
    for definition in definitions:
        by_pillar.setdefault(definition["pillar"], []).append(definition)

    assessment_docs: list[dict[str, Any]] = []
    eedi_docs: list[dict[str, Any]] = []
    certificate_docs: list[dict[str, Any]] = []
    feedback_docs: list[dict[str, Any]] = []

    issued_budget = 0
    eligible_people: list[dict[str, Any]] = []

    for person in cohort:
        base = person["scoreTarget"]
        pillar_scores: dict[str, float] = {}
        for pillar, items in by_pillar.items():
            offset = {
                "communication": 3.0, "behaviour": 4.0, "confidence": -2.0, "leadership": -5.0,
                "technical": 6.0, "problem_solving": -6.0, "career_readiness": 0.0,
            }.get(pillar, 0.0)
            pillar_scores[pillar] = round(
                min(98, max(30, base + offset + RNG.gauss(0, 3))), 1
            )

        module_totals: list[float] = []
        for module_name in module_ids:
            module_id = module_id_for(person["departmentCode"], module_name)
            total = round(
                min(98, max(30, base + MODULE_OFFSET.get(module_name, 0) + RNG.gauss(0, 2.5))), 1
            )
            module_totals.append(total)
            trainer_pool = (
                [tid for tid, meta in trainer_meta.items() if module_name in meta["modules"]]
                if person["departmentCode"] == "CSE"
                else other_department_trainers[person["departmentCode"]]
            ) or [admin_id]
            assessed_by = trainer_pool[hash(str(person["userId"])) % len(trainer_pool)]
            assessment_docs.append(
                _doc(
                    {
                        "studentUserId": person["userId"],
                        "studentName": person["name"],
                        "rollNumber": person["roll"],
                        "collegeId": college_id,
                        "departmentId": person["departmentId"],
                        "batchId": person["batchId"],
                        "batchName": person["batchName"],
                        "trainingModuleId": module_id,
                        "trainingModuleName": module_name,
                        "semesterId": semester_ids[person["departmentCode"]],
                        "semesterLabel": "Semester 6",
                        "rubricScores": [
                            {
                                "criterion": criterion,
                                "score": round(min(99, max(28, total + RNG.gauss(0, 4))), 1),
                                "maxScore": 100,
                            }
                            for criterion in cat.RUBRIC_CRITERIA
                        ],
                        "parameterScores": [
                            {
                                "code": definition["code"],
                                "score": round(
                                    min(
                                        definition["maxScore"],
                                        max(
                                            0,
                                            pillar_scores[definition["pillar"]]
                                            / 100
                                            * definition["maxScore"]
                                            + RNG.gauss(0, 0.4),
                                        ),
                                    ),
                                    1,
                                ),
                            }
                            for definition in definitions
                        ],
                        "pillarScores": pillar_scores,
                        "totalScore": total,
                        "maxScore": 100,
                        "state": "submitted",
                        "assessedBy": assessed_by,
                        "assessedByLabel": trainer_meta.get(assessed_by, {}).get("name", "Trainer"),
                        "completeness": 100.0,
                        "submittedAt": NOW - timedelta(days=RNG.randint(2, 30)),
                        "editWindowEndsAt": NOW - timedelta(days=1),
                    }
                )
            )

        average = round(sum(module_totals) / len(module_totals), 1)
        trainer_component = round(sum(pillar_scores.values()) / len(pillar_scores), 2)
        ai_component = round(min(98, max(30, trainer_component + RNG.gauss(2, 4))), 2)
        final = round(
            trainer_component * settings.EEDI_TRAINER_WEIGHT
            + ai_component * settings.EEDI_AI_WEIGHT,
            2,
        )
        if person["name"] == "Alex Johnson":
            # The Student Portal screenshots show a readiness score of 78 with +4 movement.
            final, ai_component, trainer_component = 78.0, 80.0, 76.67
            pillar_scores = {
                "behaviour": 85.0, "communication": 78.0, "confidence": 65.0,
                "leadership": 82.0, "technical": 90.0, "problem_solving": 45.0,
                "career_readiness": 72.0,
            }
        history = []
        running = max(40.0, final - 14)
        for step in range(8):
            history.append(
                {
                    "finalScore": round(running, 2),
                    "trainerComponent": round(running - 2, 2),
                    "aiComponent": round(running + 2, 2),
                    "pillarScores": pillar_scores,
                    "scoringVersion": settings.SCORING_VERSION,
                    "reason": "seed_history",
                    "computedAt": NOW - timedelta(weeks=8 - step),
                    "inputs": {"assessmentCount": 4, "aiScoreCount": step},
                }
            )
            running += (final - running) / max(1, (8 - step))
        history[-1]["finalScore"] = final

        eedi_docs.append(
            _doc(
                {
                    "studentUserId": person["userId"],
                    "collegeId": college_id,
                    "departmentId": person["departmentId"],
                    "batchId": person["batchId"],
                    "finalScore": final,
                    "previousFinalScore": round(history[-2]["finalScore"], 2),
                    "delta": round(final - history[-2]["finalScore"], 2),
                    "trainerComponent": trainer_component,
                    "aiComponent": ai_component,
                    "pillarScores": pillar_scores,
                    "readiness": {
                        "verbal_fluency": pillar_scores["communication"],
                        "confidence_presentation": pillar_scores["confidence"],
                        "behaviour_professionalism": pillar_scores["behaviour"],
                        "leadership_teamwork": pillar_scores["leadership"],
                        "interview_readiness": pillar_scores["career_readiness"],
                        "professional_writing": round(pillar_scores["communication"] - 2, 1),
                    },
                    "strongestPillar": max(pillar_scores, key=pillar_scores.get),
                    "focusPillar": min(pillar_scores, key=pillar_scores.get),
                    "scoringVersion": settings.SCORING_VERSION,
                    "computedAt": NOW,
                    "history": history,
                }
            )
        )

        eligible = (
            person["attendanceTarget"] >= settings.CERTIFICATE_MIN_ATTENDANCE
            and average >= settings.CERTIFICATE_MIN_AVG_SCORE
        )
        if eligible:
            eligible_people.append(
                {**person, "average": average, "issued": False}
            )
        else:
            attendance_ok = person["attendanceTarget"] >= settings.CERTIFICATE_MIN_ATTENDANCE
            score_ok = average >= settings.CERTIFICATE_MIN_AVG_SCORE
            reason = (
                "Attendance & score below threshold"
                if not attendance_ok and not score_ok
                else "Attendance below threshold"
                if not attendance_ok
                else "Score below threshold"
            )
            certificate_docs.append(
                _doc(
                    {
                        "studentUserId": person["userId"],
                        "studentName": person["name"],
                        "rollNumber": person["roll"],
                        "collegeId": college_id,
                        "departmentId": person["departmentId"],
                        "batchId": person["batchId"],
                        "batchName": person["batchName"],
                        "trainingProgramId": certificate_template_id,
                        "templateName": "Soft-Skills & Employability Programme",
                        "attendancePct": person["attendanceTarget"],
                        "avgScore": average,
                        "criteria": {
                            "minAttendance": settings.CERTIFICATE_MIN_ATTENDANCE,
                            "minAvgScore": settings.CERTIFICATE_MIN_AVG_SCORE,
                        },
                        "eligibilityMet": False,
                        "reason": reason,
                        "status": "not_eligible",
                        "issuedAt": None,  # certificateNo intentionally absent, not null
                    }
                )
            )

    # Eligible participants: most issued, a slice left pending review.
    RNG.shuffle(eligible_people)
    for index, person in enumerate(eligible_people):
        issued = index >= TARGET_PENDING_CERTIFICATES
        if issued:
            issued_budget += 1
        certificate_docs.append(
            _doc(
                {
                    "studentUserId": person["userId"],
                    "studentName": person["name"],
                    "rollNumber": person["roll"],
                    "collegeId": college_id,
                    "departmentId": person["departmentId"],
                    "batchId": person["batchId"],
                    "batchName": person["batchName"],
                    "trainingProgramId": certificate_template_id,
                    "templateName": "Soft-Skills & Employability Programme",
                    "attendancePct": person["attendanceTarget"],
                    "avgScore": person["average"],
                    "criteria": {
                        "minAttendance": settings.CERTIFICATE_MIN_ATTENDANCE,
                        "minAvgScore": settings.CERTIFICATE_MIN_AVG_SCORE,
                    },
                    "eligibilityMet": True,
                    "reason": None if issued else "Awaiting review",
                    "status": "issued" if issued else "pending",
                    **(
                        {
                            "certificateNo": f"EEDI-2026-"
                            f"{str(person['departmentId'])[-4:].upper()}-{index + 1:05d}"
                        }
                        if issued
                        else {}
                    ),
                    "issuedAt": NOW - timedelta(days=RNG.randint(1, 40)) if issued else None,
                    "issuedBy": admin_id if issued else None,
                    "issuedByLabel": "Rishabh Kumawat (Institution Admin)" if issued else None,
                }
            )
        )

    await _insert_many("skill_assessments", assessment_docs)
    await _insert_many("eedi_scores", eedi_docs)
    await _insert_many("certificates", certificate_docs)
    summary["skillAssessments"] = len(assessment_docs)
    summary["certificatesIssued"] = issued_budget

    # ---------------------------------------------------------------- trainer feedback
    feedback_remarks = [
        ("Excellent structuring and confident delivery.", 5.0),
        ("Strong collaborator, mentors peers well.", 4.8),
        ("Improving; needs more initiative in group tasks.", 3.6),
        ("Good initiative; needs to delegate more.", 4.2),
        ("Collaborative, supports peers well.", 4.6),
        ("Clear written work, could speak up more in sessions.", 4.0),
        ("Handles questions calmly under pressure.", 4.5),
    ]
    cse_cohort = [p for p in cohort if p["departmentCode"] == "CSE"]
    for person in cse_cohort[:180]:
        for slot in range(RNG.randint(1, 4)):
            remark, rating = feedback_remarks[(hash(person["roll"]) + slot) % len(feedback_remarks)]
            module_name = module_names[slot % len(module_names)]
            trainer_pool = [
                tid for tid, meta in trainer_meta.items() if module_name in meta["modules"]
            ] or list(trainer_ids.values())
            trainer_id = trainer_pool[slot % len(trainer_pool)]
            sessions = session_index[("CSE", person["batchLetter"])]
            session = sessions[(hash(person["roll"]) + slot) % len(sessions)]
            feedback_docs.append(
                _doc(
                    {
                        "studentUserId": person["userId"],
                        "studentName": person["name"],
                        "rollNumber": person["roll"],
                        "trainingSessionId": session["_id"],
                        "sessionLabel": f"Session {sessions.index(session) + 1}",
                        "trainingModuleName": module_name,
                        "trainerUserId": trainer_id,
                        "trainerName": trainer_meta[trainer_id]["name"],
                        "collegeId": college_id,
                        "departmentId": department_ids["CSE"],
                        "batchId": person["batchId"],
                        "rating": round(min(5.0, max(2.5, rating + RNG.gauss(0, 0.25))), 1),
                        "feedbackText": remark,
                    }
                )
            )
    await _insert_many("trainer_feedback", feedback_docs)
    summary["trainerFeedback"] = len(feedback_docs)

    # ---------------------------------------------------------------- live classes & quizzes
    live_docs: list[dict[str, Any]] = []
    for offset in range(-6, 10):
        module_name = module_names[abs(offset) % len(module_names)]
        masterclass = offset == 2
        trainer_id = trainer_ids["Dr. Neha Sharma"] if masterclass else trainer_ids["Dr. R. Bose"]
        starts = TODAY + timedelta(days=offset, hours=14)
        # The masterclass is open to every Semester 6 batch; ordinary classes rotate per batch.
        letters = ("A", "B", "C") if masterclass else (("A", "B", "C")[abs(offset) % 3],)
        for letter in letters:
            live_docs.append(
                _doc(
                    {
                        "collegeId": college_id,
                        "departmentId": department_ids["CSE"],
                        "batchId": batch_ids[("CSE", letter)],
                        "batchName": f"Batch {letter}",
                        "title": "Interview Techniques Masterclass"
                        if masterclass
                        else f"{module_name} live class",
                        "trainerUserId": trainer_id,
                        "trainerName": trainer_meta[trainer_id]["name"],
                        "startsAt": starts,
                        "endsAt": starts + timedelta(hours=1),
                        "joinUrl": "https://classes.eedilms.app/live/demo",
                        "status": "completed" if offset < 0 else "scheduled",
                        "reminderSentAt": None,
                    }
                )
            )
    await _insert_many("live_classes", live_docs)

    quiz_docs: list[dict[str, Any]] = []
    quiz_bank = [
        ("Business Communication Basics", [
            ("Which opening is most appropriate for a formal client email?",
             ["Hey there!", "Dear Mr Sharma,", "Yo team", "Hi hi"], 1,
             "Formal correspondence uses a courteous, named salutation."),
            ("What is the main purpose of a subject line?",
             ["Decoration", "To let the reader triage the message", "To repeat the body",
              "To include your signature"], 1,
             "A subject line tells the reader what the mail is about before they open it."),
            ("Which sentence is clearest?",
             ["The delay was caused by factors beyond control which were unforeseen",
              "We missed the date because the supplier shipped late",
              "Regrettably an unforeseen circumstance arose", "It got delayed"], 1,
             "Short, concrete cause-and-effect is clearest."),
        ]),
        ("Grammar Check", [
            ("Choose the correct sentence.",
             ["He don't know the answer", "He doesn't knows the answer",
              "He doesn't know the answer", "He not know the answer"], 2,
             "Third-person singular negative uses 'doesn't' + base verb."),
            ("Identify the correctly punctuated sentence.",
             ["Lets eat, grandma", "Let's eat, grandma", "Lets eat grandma",
              "Let's eat grandma"], 1, "The apostrophe marks the contraction and the comma the address."),
        ]),
        ("Aptitude — Quantitative", [
            ("If a task takes 6 people 4 days, how long for 8 people at the same rate?",
             ["3 days", "2 days", "5 days", "6 days"], 0, "6×4 = 24 person-days; 24/8 = 3 days."),
            ("What is 15% of 240?",
             ["36", "32", "40", "24"], 0, "10% is 24, 5% is 12, so 15% is 36."),
        ]),
    ]
    for index, (title, questions) in enumerate(quiz_bank):
        for letter in ("A", "B", "C"):
            quiz_docs.append(
                _doc(
                    {
                        "collegeId": college_id,
                        "departmentId": department_ids["CSE"],
                        "batchId": batch_ids[("CSE", letter)],
                        "title": title,
                        "kind": "quiz",
                        "durationMinutes": 15,
                        "maxScore": 100,
                        "allowRetake": False,
                        "opensAt": TODAY - timedelta(days=index * 5),
                        "closesAt": TODAY + timedelta(days=14 - index * 2),
                        "questions": [
                            {
                                "id": f"q{qi + 1}",
                                "text": text,
                                "marks": 1,
                                "explanation": explanation,
                                "options": [
                                    {
                                        "id": f"o{oi + 1}",
                                        "text": option,
                                        "correct": oi == correct,
                                    }
                                    for oi, option in enumerate(options)
                                ],
                            }
                            for qi, (text, options, correct, explanation) in enumerate(questions)
                        ],
                        "status": "active",
                    }
                )
            )
    await _insert_many("assessments", quiz_docs)

    # ---------------------------------------------------------------- assignments
    assignment_docs: list[dict[str, Any]] = []
    for letter in ("A", "B", "C"):
        for index, (title, module_name, days) in enumerate(
            [
                ("Communication Assignment — formal email & report", "Communication", 4),
                ("Team retrospective write-up", "Teamwork", 9),
                ("Leadership case study", "Leadership", -3),
            ]
        ):
            trainer_pool = [
                tid for tid, meta in trainer_meta.items() if module_name in meta["modules"]
            ] or list(trainer_ids.values())
            trainer_id = trainer_pool[index % len(trainer_pool)]
            assignment_docs.append(
                _doc(
                    {
                        "title": title,
                        "description": "Submit a formal email and a short accompanying report. "
                                       "Marks are awarded for structure, tone and clarity.",
                        "collegeId": college_id,
                        "departmentId": department_ids["CSE"],
                        "batchId": batch_ids[("CSE", letter)],
                        "batchName": f"Batch {letter}",
                        "trainerUserId": trainer_id,
                        "trainerName": trainer_meta[trainer_id]["name"],
                        "trainingModuleId": module_ids[module_name],
                        "trainingModuleName": module_name,
                        "dueAt": TODAY + timedelta(days=days, hours=23, minutes=59),
                        "maxScore": 100,
                        "attachments": [],
                        "status": "open" if days > 0 else "closed",
                        "reminderSentAt": None,
                    }
                )
            )
    await _insert_many("assignments", assignment_docs)

    # ---------------------------------------------------------------- Alex Johnson's journey
    alex = next(p for p in cohort if p["name"] == "Alex Johnson")
    practice_modes = await db.practice_modes.find({}).to_list(length=20)
    mode_by_code = {m["code"]: m for m in practice_modes}

    course_rows = await db.courses.find({}).to_list(length=50)
    progress_docs: list[dict[str, Any]] = []
    for course in course_rows:
        lessons = await db.lessons.find({"courseId": course["_id"]}).sort("order", 1).to_list(
            length=100
        )
        if not lessons:
            continue
        percent = {
            "business-communication": 60.0,
            "coding-and-dsa": 35.0,
            "professional-ethics": 80.0,
            "communication-skills": 100.0,
            "personality-development": 100.0,
            "aptitude-and-reasoning": 45.0,
        }.get(course["slug"], RNG.choice([0.0, 15.0, 40.0]))
        done = int(len(lessons) * percent / 100)
        progress_docs.append(
            _doc(
                {
                    "studentUserId": alex["userId"],
                    "courseId": course["_id"],
                    "collegeId": college_id,
                    "departmentId": alex["departmentId"],
                    "percent": percent,
                    "completedLessonIds": [lesson["_id"] for lesson in lessons[:done]],
                    "nextLessonId": lessons[done]["_id"] if done < len(lessons) else None,
                    "state": "completed" if percent >= 100 else ("in_progress" if percent else "not_started"),
                    "minutesSpent": int(percent * 3),
                    "minutesSpentRecent": RNG.randint(30, 150),
                    "timeRemainingMinutes": int((100 - percent) * 2.4),
                    "lastAccessedAt": NOW - timedelta(hours=RNG.randint(2, 60)),
                }
            )
        )
    # A handful of peers get progress too so the learning report is not single-row.
    for person in cse_cohort[:120]:
        if person["userId"] == alex["userId"]:
            continue
        for course in course_rows[:3]:
            progress_docs.append(
                _doc(
                    {
                        "studentUserId": person["userId"],
                        "courseId": course["_id"],
                        "collegeId": college_id,
                        "departmentId": person["departmentId"],
                        "percent": round(RNG.uniform(10, 100), 1),
                        "completedLessonIds": [],
                        "nextLessonId": None,
                        "state": "in_progress",
                        "minutesSpent": RNG.randint(40, 600),
                        "minutesSpentRecent": RNG.randint(0, 120),
                        "lastAccessedAt": NOW - timedelta(days=RNG.randint(0, 20)),
                    }
                )
            )
    await _insert_many("course_progress", progress_docs)

    # Practice sessions + evidence-backed AI scores for Alex.
    from app.services.ai_provider import MockEvaluationProvider, MockSpeechToTextProvider

    stt, evaluator = MockSpeechToTextProvider(), MockEvaluationProvider()
    practice_docs: list[dict[str, Any]] = []
    transcript_docs: list[dict[str, Any]] = []
    ai_docs: list[dict[str, Any]] = []
    xp_docs: list[dict[str, Any]] = []

    practice_plan = [
        ("mock-interview", 24, 72),
        ("presentation-coach", 18, 81),
        ("group-discussion-lab", 12, 68),
        ("ai-roleplay", 8, 72),
        ("workplace-writing", 5, 79),
        ("speaking-fluency", 3, 73),
        ("mock-interview", 1, 81),
    ]
    for attempt_number, (code, days_ago, _target) in enumerate(practice_plan, start=1):
        mode = mode_by_code[code]
        created = NOW - timedelta(days=days_ago)
        session_id = ObjectId()
        question = (mode.get("questions") or [{}])[0].get("text", "")
        transcript = await stt.transcribe(
            b"seed-audio" * (400 + attempt_number * 40),
            content_type="audio/webm",
            hint=f"{mode.get('kind')} {code}",
        )
        evaluation = await evaluator.evaluate(
            transcript=transcript, question=question, kind=mode.get("kind", "interview")
        )
        practice_docs.append(
            _doc(
                {
                    "_id": session_id,
                    "studentUserId": alex["userId"],
                    "studentName": alex["name"],
                    "rollNumber": alex["roll"],
                    "collegeId": college_id,
                    "departmentId": alex["departmentId"],
                    "batchId": alex["batchId"],
                    "practiceModeId": mode["_id"],
                    "practiceModeCode": code,
                    "practiceModeTitle": mode["title"],
                    "kind": mode.get("kind"),
                    "difficulty": mode.get("difficulty"),
                    "state": "scored",
                    "questions": mode.get("questions", []),
                    "attemptNumber": attempt_number,
                    "recordingConsent": True,
                    "hasRecording": True,
                    "overallScore": evaluation.overall,
                    "answeredQuestions": len(mode.get("questions", [])),
                    "durationSeconds": int(transcript.duration_seconds),
                    "idempotencyKey": f"seed-{code}-{attempt_number}",
                    "startedAt": created,
                    "completedAt": created + timedelta(minutes=6),
                    "scoredAt": created + timedelta(minutes=7),
                    "createdAt": created,
                    "updatedAt": created,
                }
            )
        )
        transcript_docs.append(
            _doc(
                {
                    "practiceSessionId": session_id,
                    "studentUserId": alex["userId"],
                    "collegeId": college_id,
                    "departmentId": alex["departmentId"],
                    "provider": transcript.provider,
                    "language": transcript.language,
                    "text": transcript.text,
                    "segments": [
                        {"start": s.start, "end": s.end, "text": s.text}
                        for s in transcript.segments
                    ],
                    "wordCount": transcript.word_count,
                }
            )
        )
        document = evaluation.to_document()
        previous = ai_docs[-1]["overall"] if ai_docs else None
        document.update(
            {
                "practiceSessionId": session_id,
                "studentUserId": alex["userId"],
                "collegeId": college_id,
                "departmentId": alex["departmentId"],
                "practiceModeId": mode["_id"],
                "question": question,
                "previousOverall": previous,
                "delta": (evaluation.overall - previous) if previous is not None else None,
                "trainerReviewState": "reviewed" if attempt_number <= 4 else "pending",
                "trainerOverride": None,
                "createdAt": created,
                "updatedAt": created,
                "deletedAt": None,
                "seedMarker": SEED_MARKER,
            }
        )
        ai_docs.append(document)

    await _insert_many("practice_sessions", practice_docs)
    await _insert_many("transcripts", transcript_docs)
    await _insert_many("ai_scores", ai_docs)

    # XP ledger — produces the streak, level and leaderboard numbers.
    for day_offset in range(0, 7):
        xp_docs.append(
            _doc(
                {
                    "studentUserId": alex["userId"],
                    "collegeId": college_id,
                    "departmentId": alex["departmentId"],
                    "amount": RNG.choice([20, 25, 30, 40]),
                    "source": RNG.choice(["practice", "game", "learning", "quiz"]),
                    "label": "Daily activity",
                    "at": NOW - timedelta(days=day_offset, hours=RNG.randint(1, 10)),
                }
            )
        )
    for extra in range(28):
        xp_docs.append(
            _doc(
                {
                    "studentUserId": alex["userId"],
                    "collegeId": college_id,
                    "departmentId": alex["departmentId"],
                    "amount": RNG.choice([15, 20, 30, 50, 60]),
                    "source": "game",
                    "label": "Skill game",
                    "at": NOW - timedelta(days=7 + extra // 2),
                }
            )
        )
    for person in cse_cohort[:150]:
        if person["userId"] == alex["userId"]:
            continue
        total = RNG.randint(200, 2100)
        chunks = max(1, total // 120)
        for chunk in range(chunks):
            xp_docs.append(
                _doc(
                    {
                        "studentUserId": person["userId"],
                        "collegeId": college_id,
                        "departmentId": person["departmentId"],
                        "amount": total // chunks,
                        "source": "game",
                        "label": "Skill game",
                        "at": NOW - timedelta(days=RNG.randint(0, 40)),
                    }
                )
            )
    await _insert_many("xp_events", xp_docs)

    # Game attempts
    game_rows = await db.game_definitions.find({}).to_list(length=20)
    game_attempts: list[dict[str, Any]] = []
    for game in game_rows:
        levels = game.get("levels", [])
        for level_index in range(len(levels)):
            best_option = next(
                (o for o in levels[level_index].get("options", []) if o.get("best")), None
            )
            game_attempts.append(
                _doc(
                    {
                        "studentUserId": alex["userId"],
                        "collegeId": college_id,
                        "departmentId": alex["departmentId"],
                        "gameId": game["_id"],
                        "gameCode": game["code"],
                        "gameTitle": game["title"],
                        "category": game["category"],
                        "level": level_index + 1,
                        "score": RNG.randint(900, 1450),
                        "xpEarned": game.get("xpReward", 50),
                        "comboMax": RNG.randint(1, 4),
                        "hintsUsed": RNG.randint(0, 1),
                        "durationSeconds": RNG.randint(200, 480),
                        "choices": (
                            [
                                {
                                    "optionId": best_option["id"],
                                    "text": best_option["text"],
                                    "tag": best_option["tag"],
                                    "delta": best_option["delta"],
                                    "feedback": best_option["feedback"],
                                    "best": True,
                                }
                            ]
                            if best_option
                            else []
                        ),
                        "skillDeltas": {s: RNG.randint(10, 40) for s in game.get("skillMap", [])},
                        "completed": True,
                    }
                )
            )
    await _insert_many("game_attempts", game_attempts)

    # Recommendation, placement goal, resume, quiz attempts for Alex
    weakest_exercise = await db.exercise_library.find_one({"targetDimension": "interview_readiness"})
    await db.recommendations.insert_one(
        _doc(
            {
                "studentUserId": alex["userId"],
                "collegeId": college_id,
                "departmentId": alex["departmentId"],
                "weakestDimension": "interview_readiness",
                "weakestDimensionLabel": "Interview Readiness",
                "weakestScore": 68.0,
                "exerciseId": weakest_exercise["_id"],
                "exerciseCode": weakest_exercise["code"],
                "exerciseTitle": "Conflict Resolution Role-play",
                "practiceModeCode": "ai-roleplay",
                "estimatedMinutes": 20,
                "xpReward": 30,
                "reason": "Practice handling workplace conflicts through real-life scenarios.",
                "state": "active",
            }
        )
    )
    await db.placement_goals.insert_one(
        _doc(
            {
                "studentUserId": alex["userId"],
                "collegeId": college_id,
                "departmentId": alex["departmentId"],
                "targetRole": "Software Engineer",
                "targetScore": 85.0,
                "targetDate": datetime(2026, 12, 31, tzinfo=timezone.utc),
                "focusAreas": ["Problem Solving", "Interview Confidence"],
                "currentScore": 78.0,
                "skillGaps": [
                    {"label": "Problem Solving", "score": 45.0},
                    {"label": "Confidence", "score": 65.0},
                ],
                "roadmap": [
                    {"step": 1, "title": "Strengthen Problem Solving",
                     "detail": "Complete 15 more medium-level DSA problems.",
                     "percent": 60.0, "state": "in_progress"},
                    {"step": 2, "title": "Improve Interview Confidence",
                     "detail": "Complete 2 mock interviews and review feedback.",
                     "percent": 40.0, "state": "in_progress"},
                    {"step": 3, "title": "Build System Design Skills",
                     "detail": "Complete 3 system design case studies.",
                     "percent": 0.0, "state": "not_started"},
                ],
            }
        )
    )

    quiz_rows = await db.assessments.find({"batchId": alex["batchId"]}).to_list(length=20)
    quiz_attempt_docs = []
    for index, quiz in enumerate(quiz_rows[:2]):
        quiz_attempt_docs.append(
            _doc(
                {
                    "assessmentId": quiz["_id"],
                    "assessmentTitle": quiz["title"],
                    "studentUserId": alex["userId"],
                    "collegeId": college_id,
                    "departmentId": alex["departmentId"],
                    "answers": [],
                    "earned": 2,
                    "possible": len(quiz.get("questions", [])) or 1,
                    "score": [79.0, 88.0][index],
                    "durationSeconds": 620,
                    "createdAt": NOW - timedelta(days=8 + index * 4),
                }
            )
        )
    await _insert_many("assessment_attempts", quiz_attempt_docs)

    # ---------------------------------------------------------------- ops data
    ai_usage_docs: list[dict[str, Any]] = []
    for hour in range(72):
        at = NOW - timedelta(hours=hour)
        for _ in range(RNG.randint(1, 7)):
            ai_usage_docs.append(
                _doc(
                    {
                        "collegeId": college_id,
                        "departmentId": department_ids["CSE"],
                        "kind": RNG.choice(
                            ["practice_evaluation", "coach", "trainer_override", "transcription"]
                        ),
                        "provider": "mock",
                        "modelVersion": "mock-eval-1.3.0",
                        "latencyMs": RNG.randint(400, 3800),
                        "tokens": RNG.randint(200, 2600),
                        "failed": RNG.random() < 0.03,
                        "at": at,
                    }
                )
            )
    await _insert_many("ai_usage_events", ai_usage_docs)

    audit_docs: list[dict[str, Any]] = []
    audit_samples = [
        ("update", "enrollments", "status: On-Hold → Active", hod_ids["CSE"], "Priya Kulkarni (HOD)", "HOD"),
        ("create", "attendance", "Session 12 attendance recorded (32 present)",
         trainer_ids["Dr. R. Bose"], "Dr. R. Bose (Trainer)", "TRAINER"),
        ("update", "certificates", "eligibility_met: false → true", None, "System (Scheduled Job)", "SYSTEM"),
        ("export", "report_jobs", "Attendance defaulters export requested", hod_ids["CSE"],
         "Priya Kulkarni (HOD)", "HOD"),
        ("export", "report_jobs", "Full program attendance export requested", hod_ids["CSE"],
         "Priya Kulkarni (HOD)", "HOD"),
        ("create", "enrollments", "Ananya Iyer enrolled — lateral transfer", admin_id,
         "College Admin (R. Fernandes)", "ADMIN"),
        ("update", "enrollments", "status: Active → On-Hold", hod_ids["CSE"],
         "Priya Kulkarni (HOD)", "HOD"),
        ("create", "assignments", "Communication Assignment created", trainer_ids["Dr. K. Sharma"],
         "Dr. K. Sharma (Trainer)", "TRAINER"),
        ("update", "skill_assessments", "Evaluation submitted for Batch C",
         trainer_ids["Prof. M. Iyer"], "Prof. M. Iyer (Trainer)", "TRAINER"),
        ("login", "users", "signed in", admin_id, "Rishabh Kumawat (ADMIN)", "ADMIN"),
    ]
    for index in range(140):
        action, entity, detail, actor, label, role = audit_samples[index % len(audit_samples)]
        audit_docs.append(
            {
                "actorId": actor,
                "actorLabel": label,
                "actorRole": role,
                "action": action,
                "entityType": entity,
                "entityId": ObjectId(),
                "before": None,
                "after": None,
                "detail": detail,
                "collegeId": college_id,
                "departmentId": department_ids["CSE"],
                "requestId": f"seed-{index}",
                "ip": "203.0.113.42",
                "at": NOW - timedelta(hours=index * 5 + RNG.randint(0, 4)),
                "seedMarker": SEED_MARKER,
            }
        )
    await _insert_many("audit_logs", audit_docs)
    summary["auditLogs"] = len(audit_docs)

    # Placement drives
    await _insert_many(
        "placement_drives",
        [
            _doc(
                {
                    "collegeId": college_id,
                    "company": "Infosys",
                    "title": "Infosys — Campus 2026",
                    "startsAt": NOW + timedelta(days=21),
                    "endsAt": NOW + timedelta(days=24),
                    "eligibleBatchIds": [batch_ids[("CSE", s)] for s in ("A", "B", "C")],
                    "minReadinessScore": 70,
                    "status": "open",
                    "recruiterEmails": ["campus@infosys.example"],
                }
            ),
            _doc(
                {
                    "collegeId": college_id,
                    "company": "TCS",
                    "title": "TCS — Digital Track",
                    "startsAt": NOW + timedelta(days=45),
                    "endsAt": NOW + timedelta(days=47),
                    "eligibleBatchIds": [batch_ids[("CSE", "B")], batch_ids[("CSE", "C")]],
                    "minReadinessScore": 75,
                    "status": "scheduling",
                    "recruiterEmails": ["hiring@tcs.example"],
                }
            ),
        ],
    )

    # A weak-student alert and a couple of notifications so those screens aren't empty.
    weak_person = next(p for p in cse_cohort if p["name"] == "Sneha Reddy")
    await db.weak_student_alerts.insert_one(
        _doc(
            {
                "studentUserId": weak_person["userId"],
                "studentName": weak_person["name"],
                "rollNumber": weak_person["roll"],
                "collegeId": college_id,
                "departmentId": department_ids["CSE"],
                "batchId": weak_person["batchId"],
                "trainerUserId": trainer_ids["Dr. R. Bose"],
                "pillar": "problem_solving",
                "pillarLabel": "Problem Solving",
                "score": 44.0,
                "threshold": settings.WEAK_STUDENT_THRESHOLD,
                "remark": "Problem Solving is well below threshold and attendance is 45%. "
                          "Recommend targeted practice and a guardian conversation.",
                "weakPillars": [
                    {"pillar": "problem_solving", "pillarLabel": "Problem Solving", "score": 44.0,
                     "threshold": settings.WEAK_STUDENT_THRESHOLD},
                ],
                "resolvedAt": None,
            }
        )
    )
    await _insert_many(
        "notifications",
        [
            _doc(
                {
                    "userId": hod_ids["CSE"],
                    "kind": "attendance_defaulter",
                    "icon": "calendar-x",
                    "title": f"{TARGET_DEFAULTERS} attendance defaulter(s) in Computer Science",
                    "body": f"Participants below the {settings.ATTENDANCE_DEFAULTER_THRESHOLD:g}% "
                            "threshold need review.",
                    "href": "/hod/attendance",
                    "collegeId": college_id,
                    "departmentId": department_ids["CSE"],
                    "read": False,
                }
            ),
            _doc(
                {
                    "userId": alex["userId"],
                    "kind": "assessment_feedback",
                    "icon": "message-square",
                    "title": "Your AI feedback is ready",
                    "body": "Mock Interview scored 81/100 — see the evidence-backed breakdown.",
                    "href": f"/student/practice/session/{practice_docs[-1]['_id']}/feedback",
                    "collegeId": college_id,
                    "departmentId": alex["departmentId"],
                    "read": False,
                }
            ),
            _doc(
                {
                    "userId": trainer_ids["Dr. R. Bose"],
                    "kind": "weak_student",
                    "icon": "alert-triangle",
                    "title": "Weak participant flagged",
                    "body": "Sneha Reddy (CSE21B033): Problem Solving at 44/100.",
                    "href": "/trainer/alerts",
                    "collegeId": college_id,
                    "departmentId": department_ids["CSE"],
                    "read": False,
                }
            ),
        ],
    )

    # Indexes last: this both builds them over the loaded data and acts as a self-check —
    # a duplicate produced by the generator would fail here rather than pass silently.
    summary["indexes"] = await ensure_indexes(db)

    log.info("seed_complete", extra=summary)
    return _finish(summary, college_id, admin_id, hod_ids, trainer_ids, alex)


def _finish(
    summary: dict[str, Any],
    college_id: ObjectId,
    admin_id: ObjectId,
    hod_ids: dict[str, ObjectId],
    trainer_ids: dict[str, ObjectId],
    alex: dict[str, Any] | None,
) -> dict[str, Any]:
    summary["collegeId"] = str(college_id)
    summary["logins"] = {
        "student": "alex.johnson@eedi.com" if alex else "—",
        "trainer": "r.bose@abcengg.edu",
        "hod": "priya.kulkarni@abcengg.edu",
        "admin": "rishabh.kumawat@abcengg.edu",
        "superAdmin": "superadmin@eedilms.app",
        "placementCell": "placement@abcengg.edu",
        "password": DEMO_PASSWORD,
    }
    return summary


async def _main() -> None:
    parser = argparse.ArgumentParser(description="Seed the EEDI LMS database with demo data")
    parser.add_argument("--reset", action="store_true", help="wipe seeded collections first")
    parser.add_argument("--minimal", action="store_true", help="catalogues and accounts only")
    args = parser.parse_args()

    configure_logging()
    summary = await seed(reset=args.reset, minimal=args.minimal)

    print("\n  EEDI LMS — seed complete\n" + "  " + "-" * 52)
    for key, value in summary.items():
        if key == "logins":
            continue
        print(f"  {key:<24} {value}")
    print("  " + "-" * 52)
    print("  Demo sign-ins (password: " + DEMO_PASSWORD + ")")
    for role, email in summary["logins"].items():
        if role != "password":
            print(f"    {role:<16} {email}")
    if is_inmemory():
        print(
            "\n  NOTE: no MongoDB server was reachable, so this ran against the in-process\n"
            "  development store and will not persist. Start MongoDB and re-run to seed for real."
        )
    print()


if __name__ == "__main__":  # pragma: no cover
    try:
        asyncio.run(_main())
    except SystemExit as exc:
        print(f"\n  {exc}\n", file=sys.stderr)
        raise
