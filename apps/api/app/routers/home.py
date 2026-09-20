"""Public home page API.

Works without authentication, and becomes richer when a session is present (Continue Learning is
student-only). Statistics come from real counts — never hard-coded production numbers (§6, §26).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query, Request

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context
from app.authz.roles import ROLE_HOME, Role
from app.core.config import settings
from app.core.errors import NotFound
from app.db.mongo import get_db, serialize
from app.schemas.requests import AssistantRequest

router = APIRouter()

TAGLINE = "Learn, Practise and Build the Skills Required for Your Career."
PHILOSOPHY = ("Practise", "Assess", "Improve", "Become Employable")


async def optional_context(request: Request) -> ScopeContext | None:
    """Auth-aware but never auth-required."""
    if not request.headers.get("authorization"):
        return None
    try:
        return await get_scope_context(request)
    except Exception:
        return None


@router.get("/overview")
async def overview() -> dict[str, Any]:
    return {
        "success": True,
        "data": {
            "productName": "Winners Creek",
            "tagline": TAGLINE,
            "philosophy": list(PHILOSOPHY),
            "description": (
                "A college-focused soft-skills, personality development and employability "
                "platform that runs alongside your curriculum — structured learning, AI-assessed "
                "practice, trainer feedback and placement readiness in one place."
            ),
            "pillars": [
                {
                    "code": "structured_learning",
                    "title": "Structured learning",
                    "body": "Guided learning paths from foundation to interview-ready, with "
                            "modules, lessons and weekly goals.",
                    "icon": "book-open",
                },
                {
                    "code": "assessments",
                    "title": "Assessments",
                    "body": "Rubric-based skill assessments and quizzes that measure the seven "
                            "employability pillars.",
                    "icon": "clipboard-check",
                },
                {
                    "code": "assignments",
                    "title": "Assignments",
                    "body": "Trainer-set assignments with submissions, review and grading.",
                    "icon": "file-text",
                },
                {
                    "code": "performance",
                    "title": "Performance tracking",
                    "body": "One readiness score, tracked over time with a per-pillar "
                            "breakdown.",
                    "icon": "trending-up",
                },
                {
                    "code": "ai",
                    "title": "AI-powered learning",
                    "body": "Mock interviews, role-plays and presentations scored with "
                            "evidence-backed feedback drawn from your own transcript.",
                    "icon": "sparkles",
                },
                {
                    "code": "trainer_feedback",
                    "title": "Trainer feedback",
                    "body": "Faculty review AI results and add human feedback per session.",
                    "icon": "message-square",
                },
                {
                    "code": "department_analytics",
                    "title": "Department analytics",
                    "body": "Attendance, assessment and certification analytics for HODs and "
                            "administrators.",
                    "icon": "bar-chart-3",
                },
            ],
            "roleAccess": [
                {"role": "STUDENT", "label": "Student Login", "href": ROLE_HOME[Role.STUDENT]},
                {"role": "TRAINER", "label": "Trainer Login", "href": ROLE_HOME[Role.TRAINER]},
                {"role": "HOD", "label": "HOD Login", "href": ROLE_HOME[Role.HOD]},
                {"role": "ADMIN", "label": "Admin Login", "href": ROLE_HOME[Role.ADMIN]},
            ],
        },
    }


from app.repositories.course_repo import CourseRepository
from app.repositories.institution_repo import InstitutionRepository
from app.repositories.stats_repo import StatsRepository


@router.get("/stats")
async def stats() -> dict[str, Any]:
    """Live platform statistics computed from the database."""
    if settings.USE_POSTGRES:
        stats_data = await StatsRepository.get_home_public_stats()
        return {"success": True, "data": stats_data}

    db = get_db()
    learners = await db.student_profiles.count_documents({"deletedAt": None})
    trainers = await db.users.count_documents(
        {"role": "TRAINER", "status": "active", "deletedAt": None}
    )
    colleges = await db.colleges.count_documents({"deletedAt": None})
    courses = await db.courses.count_documents({"deletedAt": None, "published": True})
    practice_sessions = await db.practice_sessions.count_documents({"state": "scored"})
    certificates = await db.certificates.count_documents({"status": "issued"})

    readiness = await db.eedi_scores.aggregate(
        [{"$group": {"_id": None, "avg": {"$avg": "$finalScore"}}}]
    ).to_list(length=1)
    average = (
        round(readiness[0]["avg"], 1)
        if readiness and readiness[0].get("avg") is not None
        else None
    )
    return {
        "success": True,
        "data": {
            "learners": learners,
            "trainers": trainers,
            "institutions": colleges,
            "courses": courses,
            "practiceSessionsScored": practice_sessions,
            "certificatesIssued": certificates,
            "averageReadinessScore": average,
            "computedAt": datetime.now(timezone.utc),
            "source": "live-database",
        },
    }


@router.get("/courses")
async def courses(
    search: str | None = Query(None, max_length=120),
    category: str | None = Query(None, max_length=60),
    limit: int = Query(12, ge=1, le=50),
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        pg_courses = await CourseRepository.list_courses(search=search, category=category, limit=limit)
        categories = await CourseRepository.get_categories()
        # Ensure UUIDs/decimals serialize safely
        serialized = [
            {
                **c,
                "id": str(c["id"]),
                "_id": str(c["id"]),
                "fee": float(c["fee"]) if c.get("fee") is not None else 0.0,
                "createdAt": c["created_at"].isoformat() if c.get("created_at") else None,
            }
            for c in pg_courses
        ]
        return {
            "success": True,
            "data": serialized,
            "meta": {"categories": categories},
        }

    db = get_db()
    query: dict[str, Any] = {"deletedAt": None, "published": True}
    if category and category != "all":
        query["category"] = category
    if search:
        import re as _re

        pattern = _re.escape(search.strip())
        query["$or"] = [
            {"title": {"$regex": pattern, "$options": "i"}},
            {"description": {"$regex": pattern, "$options": "i"}},
        ]
    rows = await db.courses.find(query).sort("order", 1).to_list(length=limit)
    return {
        "success": True,
        "data": serialize(rows),
        "meta": {
            "categories": sorted(
                {c for c in await db.courses.distinct("category", {"deletedAt": None}) if c}
            )
        },
    }


@router.get("/courses/{slug}")
async def course_detail(slug: str) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        course = await CourseRepository.get_by_slug(slug)
        if not course:
            raise NotFound("We couldn't find that course")
        modules = await CourseRepository.get_modules_with_lessons(course["id"])
        c_dict = {
            **course,
            "id": str(course["id"]),
            "_id": str(course["id"]),
            "fee": float(course["fee"]) if course.get("fee") is not None else 0.0,
            "modules": [
                {
                    **m,
                    "id": str(m["id"]),
                    "courseId": str(m["course_id"]),
                    "lessons": [{**l, "id": str(l["id"]), "moduleId": str(l["module_id"])} for l in m.get("lessons", [])],
                }
                for m in modules
            ],
        }
        return {"success": True, "data": c_dict}

    db = get_db()
    course = await db.courses.find_one({"slug": slug, "deletedAt": None})
    if not course:
        raise NotFound("We couldn't find that course")
    modules = await db.modules.find({"courseId": course["_id"], "deletedAt": None}).sort(
        "order", 1
    ).to_list(length=100)
    for module in modules:
        module["lessons"] = await db.lessons.find(
            {"moduleId": module["_id"], "deletedAt": None}
        ).sort("order", 1).to_list(length=200)
    return {"success": True, "data": {**serialize(course), "modules": serialize(modules)}}


@router.get("/institutions")
async def institutions() -> dict[str, Any]:
    if settings.USE_POSTGRES:
        insts = await InstitutionRepository.list_all(limit=100)
        out = []
        for inst in insts:
            depts = await InstitutionRepository.get_departments(inst["id"])
            out.append(
                {
                    "code": inst.get("code"),
                    "name": inst.get("name"),
                    "city": inst.get("city"),
                    "institutionType": inst.get("institution_type"),
                    "trainingType": inst.get("training_type"),
                    "departments": [
                        {"code": d.get("code"), "name": d.get("name")} for d in depts
                    ],
                }
            )
        return {"success": True, "data": out}

    db = get_db()
    colleges = await db.colleges.find(
        {"deletedAt": None, "publicSignupEnabled": {"$ne": False}},
        {"name": 1, "code": 1, "city": 1},
    ).sort("name", 1).to_list(length=100)

    out = []
    for college in colleges:
        departments = await db.departments.find(
            {"collegeId": college["_id"], "deletedAt": None}, {"name": 1, "code": 1}
        ).sort("name", 1).to_list(length=60)
        out.append(
            {
                "code": college.get("code"),
                "name": college.get("name"),
                "city": college.get("city"),
                "departments": [
                    {"code": d.get("code"), "name": d.get("name")} for d in departments
                ],
            }
        )
    return {
        "success": True,
        "data": out,
        "meta": {"publicSignupEnabled": settings.PUBLIC_SIGNUP_ENABLED},
    }


@router.get("/trainers")
async def trainers(limit: int = Query(12, ge=1, le=50)) -> dict[str, Any]:
    """Public trainer showcase — no contact details or internal identifiers exposed."""
    db = get_db()
    rows = await db.users.find(
        {"role": "TRAINER", "status": "active", "deletedAt": None, "showOnPublicSite": True},
        {"name": 1, "designation": 1, "departmentName": 1, "expertise": 1, "avatarColor": 1, "bio": 1},
    ).to_list(length=limit)
    return {
        "success": True,
        "data": [
            {
                "id": str(row["_id"]),
                "name": row.get("name"),
                "designation": row.get("designation"),
                "department": row.get("departmentName"),
                "expertise": row.get("expertise", []),
                "avatarColor": row.get("avatarColor"),
                "bio": row.get("bio"),
            }
            for row in rows
        ],
    }


@router.get("/ebooks")
async def home_ebooks(limit: int = Query(8, ge=1, le=20)) -> dict[str, Any]:
    """Published eBooks for the Homepage showcase section."""
    db = get_db()
    query: dict[str, Any] = {
        "status": "PUBLISHED",
        "published": True,
        "deletedAt": None,
        "visibility": {"$ne": "COURSE_RESTRICTED"},
    }
    cursor = db.ebooks.find(query).sort([("isPinned", -1), ("isFeatured", -1), ("displayOrder", 1), ("createdAt", -1)])
    books = await cursor.limit(limit).to_list(limit)

    items = []
    for b in books:
        cover_url = f"/api/v1/ebooks/{str(b['_id'])}/cover" if b.get("coverKey") else None
        items.append({
            "id": str(b["_id"]),
            "slug": b.get("slug"),
            "title": b.get("title"),
            "author": b.get("author"),
            "description": b.get("description"),
            "shortDescription": b.get("shortDescription") or (b.get("description", "")[:120] + "..."),
            "category": b.get("category", "General"),
            "tags": b.get("tags", []),
            "pageCount": b.get("pageCount", 1),
            "coverUrl": cover_url,
            "isFeatured": b.get("isFeatured", False),
            "isPinned": b.get("isPinned", False),
            "readsCount": b.get("readsCount", 0),
            "averageRating": b.get("averageRating", 5.0),
        })

    return {"success": True, "data": items}


@router.get("/announcements")
async def announcements(
    limit: int = Query(8, ge=1, le=30), kind: str | None = Query(None, max_length=40)
) -> dict[str, Any]:
    db = get_db()
    query: dict[str, Any] = {"deletedAt": None, "public": True}
    if kind and kind != "all":
        query["kind"] = kind
    rows = await db.announcements.find(query).sort("publishedAt", -1).to_list(length=limit)
    return {
        "success": True,
        "data": serialize(rows),
        "meta": {"kinds": sorted({r.get("kind") for r in rows if r.get("kind")})},
    }


@router.get("/faqs")
async def faqs() -> dict[str, Any]:
    rows = await get_db().faqs.find({"deletedAt": None}).sort("order", 1).to_list(length=50)
    return {"success": True, "data": serialize(rows)}


@router.get("/testimonials")
async def testimonials(limit: int = Query(6, ge=1, le=20)) -> dict[str, Any]:
    """Seeded/demo success stories until real, consented data exists (§6)."""
    rows = await get_db().testimonials.find({"deletedAt": None}).sort("order", 1).to_list(
        length=limit
    )
    return {
        "success": True,
        "data": serialize(rows),
        "meta": {
            "notice": "Demo content — replaced by real, consented success stories once available."
        },
    }


@router.get("/continue-learning")
async def continue_learning(request: Request) -> dict[str, Any]:
    """Student-only section of the home page."""
    ctx = await optional_context(request)
    if ctx is None or ctx.role is not Role.STUDENT:
        return {"success": True, "data": None}

    from app.routers.student import build_continue_learning

    return {"success": True, "data": await build_continue_learning(ctx)}


@router.post("/assistant")
async def assistant(payload: AssistantRequest, request: Request) -> dict[str, Any]:
    """Platform assistant: course discovery, navigation, deadlines, support escalation.

    Answers from real platform data. It never invents a course, a date or a policy — anything it
    cannot ground is escalated to human support.
    """
    ctx = await optional_context(request)
    db = get_db()
    question = payload.question.strip()
    lowered = question.lower()

    import re as _re

    words = [w for w in _re.findall(r"[a-z]{4,}", lowered)]
    matches: list[dict[str, Any]] = []
    if words:
        pattern = "|".join(_re.escape(w) for w in words[:6])
        matches = await db.courses.find(
            {
                "deletedAt": None,
                "published": True,
                "$or": [
                    {"title": {"$regex": pattern, "$options": "i"}},
                    {"description": {"$regex": pattern, "$options": "i"}},
                    {"tags": {"$regex": pattern, "$options": "i"}},
                ],
            },
            {"title": 1, "slug": 1, "description": 1, "difficulty": 1, "durationHours": 1},
        ).to_list(length=4)

    navigation = [
        ("dashboard", "/student/dashboard", "your dashboard"),
        ("practice", "/student/practice", "Practice Studio"),
        ("interview", "/student/practice", "Mock Interview in Practice Studio"),
        ("game", "/student/games", "Skill Games"),
        ("progress", "/student/progress", "Progress & Insights"),
        ("certificate", "/student/achievements", "Achievements & certificates"),
        ("resume", "/student/resume-analyzer", "Resume Analyzer"),
        ("assignment", "/student/learning", "My Learning"),
        ("class", "/student/live-classes", "Live Classes"),
        ("password", "/forgot-password", "password reset"),
    ]
    links = [
        {"label": label, "href": href}
        for keyword, href, label in navigation
        if keyword in lowered
    ]

    deadlines: list[dict[str, Any]] = []
    if ctx is not None and ctx.role is Role.STUDENT:
        profile = await db.student_profiles.find_one({"userId": ctx.user_id}, {"batchId": 1})
        if profile and profile.get("batchId"):
            rows = await db.assignments.find(
                {
                    "batchId": profile["batchId"],
                    "deletedAt": None,
                    "dueAt": {"$gte": datetime.now(timezone.utc)},
                },
                {"title": 1, "dueAt": 1},
            ).sort("dueAt", 1).to_list(length=3)
            deadlines = [{"title": r.get("title"), "dueAt": r.get("dueAt")} for r in rows]

    parts: list[str] = []
    if matches:
        parts.append(
            "These programs look relevant: "
            + ", ".join(f"{m['title']}" for m in matches)
            + "."
        )
    if links:
        parts.append("You'll find that under " + ", ".join(link["label"] for link in links) + ".")
    if deadlines:
        parts.append(
            "Coming up: "
            + "; ".join(f"{d['title']} due {d['dueAt']:%d %b}" for d in deadlines)
            + "."
        )
    if not parts:
        parts.append(
            "I can help you find a course, navigate the platform, or check your deadlines. "
            "For anything account-specific I'd rather hand you to a human than guess — use "
            "Contact & Help and the support team will pick it up."
        )

    return {
        "success": True,
        "data": {
            "answer": " ".join(parts),
            "courses": serialize(matches),
            "links": links,
            "deadlines": deadlines,
            "escalation": {
                "available": True,
                "href": "/contact",
                "label": "Contact support",
            },
            "grounded": bool(matches or links or deadlines),
        },
    }
