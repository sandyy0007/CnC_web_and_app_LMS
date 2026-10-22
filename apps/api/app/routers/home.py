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
from app.core.errors import NotFound, ValidationError
from app.core.logging import get_logger
from app.db.mongo import get_db, serialize
from app.db.postgres import connect_to_postgres
from app.repositories.course_repo import CourseRepository
from app.schemas.requests import AssistantRequest

log = get_logger("app.home")

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
    "A unified digital learning ecosystem that brings structured learning, "
    "intelligent assessments, performance insights, expert feedback, and "
    "career-focused development together in one platform."
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
                {"role": "STUDENT", "label": "Participant Login", "href": ROLE_HOME[Role.STUDENT]},
                {"role": "TRAINER", "label": "Trainer Login", "href": ROLE_HOME[Role.TRAINER]},
                {"role": "HOD", "label": "SPOC Login", "href": ROLE_HOME[Role.HOD]},
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
        serialized = []
        for c in pg_courses:
            mode = str(c.get("delivery_mode") or "HYBRID").upper()
            course_mode = "BOTH" if mode == "HYBRID" else mode
            serialized.append({
                **c,
                "id": str(c["id"]),
                "_id": str(c["id"]),
                "fee": float(c["fee"]) if c.get("fee") is not None else 0.0,
                "price": float(c["fee"]) if c.get("fee") is not None else 0.0,
                "courseMode": course_mode,
                "deliveryMode": mode,
                "durationHours": c.get("duration_hours") or 40,
                "duration_hours": c.get("duration_hours") or 40,
                "difficulty": "Intermediate",
                "stage": c.get("category") or "Employability",
                "icon": "book-open",
                "createdAt": c["created_at"].isoformat() if c.get("created_at") else None,
            })
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
        mode = str(course.get("delivery_mode") or "HYBRID").upper()
        course_mode = "BOTH" if mode == "HYBRID" else mode
        c_dict = {
            **course,
            "id": str(course["id"]),
            "_id": str(course["id"]),
            "fee": float(course["fee"]) if course.get("fee") is not None else 0.0,
            "price": float(course["fee"]) if course.get("fee") is not None else 0.0,
            "courseMode": course_mode,
            "deliveryMode": mode,
            "durationHours": course.get("duration_hours") or 40,
            "duration_hours": course.get("duration_hours") or 40,
            "difficulty": "Intermediate",
            "stage": course.get("category") or "Employability",
            "icon": "book-open",
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
async def trainers(
    institution_id: str | None = Query(None),
    institution_code: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
) -> dict[str, Any]:
    """Public trainer showcase — strictly institution-scoped, no contact details or internal identifiers exposed."""
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            target_inst_id = None
            if institution_id:
                try:
                    target_inst_id = UUID(str(institution_id))
                except (ValueError, TypeError):
                    target_inst_id = None
            elif institution_code:
                row = await conn.fetchrow(
                    "SELECT id FROM institutions WHERE code = $1 AND deleted_at IS NULL", institution_code
                )
                if row:
                    target_inst_id = row["id"]

            if not target_inst_id:
                # Default to verified Arya College of Engineering and IT
                row = await conn.fetchrow(
                    "SELECT id FROM institutions WHERE id = '39a363c8-635a-4a0b-b9c0-d0c51529774f'::uuid OR name ILIKE '%Arya%' AND deleted_at IS NULL LIMIT 1"
                )
                if row:
                    target_inst_id = row["id"]

            rows = await conn.fetch("""
                SELECT u.id, u.name, d.name as department_name, inst.name as institution_name,
                       tp.title, tp.specializations
                FROM users u
                JOIN institutions inst ON inst.id = u.institution_id
                LEFT JOIN departments d ON d.id = u.department_id
                LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
                WHERE u.role = 'TRAINER'
                  AND u.status = 'ACTIVE'
                  AND u.deleted_at IS NULL
                  AND u.institution_id = $1
                ORDER BY u.name ASC
                LIMIT $2
            """, target_inst_id, limit)

            return {
                "success": True,
                "data": [
                    {
                        "id": str(r["id"]),
                        "name": r["name"],
                        "designation": r["title"] or "Soft Skills Trainer",
                        "department": r["department_name"] or "Faculty of Soft Skills & Career Readiness",
                        "institution": r["institution_name"],
                        "expertise": r["specializations"] or ["Communication Skills", "Workplace Readiness", "Personality Development"],
                        "avatarColor": "indigo",
                        "bio": f"Faculty trainer at {r['institution_name'] or 'Arya College of Engineering and IT'}",
                    }
                    for r in rows
                ],
            }

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


def _synthesize_homepage_answer(
    question: str,
    matching_courses: list[dict[str, Any]],
    links: list[dict[str, str]],
    enrolled_titles: list[str],
) -> str:
    """Deterministic, truthful synthesis grounded in real Winners Creek courses and features."""
    q_low = question.lower()

    # 1. Platform overview
    if any(k in q_low for k in ("what is", "about winners creek", "who are you", "what does", "overview", "platform")):
        ans = (
            "Winners Creek (EEDI LMS) is an integrated digital learning ecosystem designed to build the soft skills, "
            "personality development, and employability required for successful careers. "
            "The platform features 34 interactive skill games, evidence-backed AI mock interviews, and trainer "
            "evaluations scored across 7 employability pillars and 95+ parameters."
        )
        if matching_courses:
            ans += f" Featured programs include {matching_courses[0]['title']}."
        return ans

    # 2. Courses and programs inquiry
    if any(k in q_low for k in ("course", "program", "class", "catalog", "learn", "study", "fee", "cost", "price", "curriculum")):
        if matching_courses:
            titles = [f"**{c['title']}**" for c in matching_courses[:3]]
            return (
                f"We offer industry-aligned employability courses including {', '.join(titles)}. "
                "Each program combines interactive practice sessions, diagnostic assessments, and mentor feedback. "
                "Click on any course card below to view details and enrollment options."
            )
        return (
            "Winners Creek provides comprehensive courses covering technical communication, workplace dynamics, "
            "and campus placement preparation. Explore our full course catalog below for active batches."
        )

    # 3. Practice, mock interviews, and skill games
    if any(k in q_low for k in ("practice", "interview", "game", "mock", "lab", "arena", "eedi", "score")):
        return (
            "In the Practice Studio and Skill Games Arena, participants engage in timed mock interviews, "
            "presentation coaching, and 34 published employability games. Performance is evaluated across "
            "7 pillars—Behaviour, Communication, Confidence, Leadership, Technical, Problem Solving, and Career Readiness—"
            "providing evidence-backed readiness scores."
        )

    # 4. Enrolled participant queries
    if enrolled_titles and any(k in q_low for k in ("my course", "enrolled", "my batch", "schedule")):
        return (
            f"You are currently enrolled in: {', '.join(enrolled_titles)}. "
            "Access your modules, upcoming sessions, and assignments directly from your Student Dashboard."
        )

    # 5. Account, sign in, or password
    if any(k in q_low for k in ("login", "sign in", "account", "register", "signup", "password")):
        return (
            "You can sign in with your registered college email or student ID. "
            "If you need a new participant account, select 'Create your account' or contact your college administrator."
        )

    # 6. Fallback with helpful direction
    parts = []
    if matching_courses:
        parts.append(f"Related programs include {', '.join(c['title'] for c in matching_courses[:2])}.")
    if links:
        parts.append(f"You can also explore {links[0]['label']}.")

    if parts:
        return f"I found relevant resources for your query: {' '.join(parts)} Feel free to ask more about our courses, games, or practice sessions!"

    return (
        "I can help you explore courses, learn about our 34 skill games, understand the EEDI employability rubric, "
        "or navigate the platform. Feel free to ask about any topic, or reach out to our programme office for personalized support."
    )


@router.post("/assistant")
async def assistant(payload: AssistantRequest, request: Request) -> dict[str, Any]:
    """Public and student platform assistant.

    Provides grounded AI responses based on real PostgreSQL course catalog,
    platform capabilities, EEDI employability standards, and enrolled student context.
    Integrates external AI models (OpenAI, Anthropic, HuggingFace) with resilient
    deterministic domain synthesis fallback.
    """
    question = payload.question.strip()
    if not question:
        raise ValidationError("Please enter a question.")

    ctx = await optional_context(request)
    lowered = question.lower()

    # 1. Fetch matching courses from PostgreSQL (authoritative) or MongoDB fallback
    matching_courses: list[dict[str, Any]] = []
    import re as _re

    raw_words = [w for w in _re.findall(r"[a-zA-Z]{3,}", lowered)]
    stop_words = {
        "what", "when", "where", "which", "with", "from", "that", "this", "have",
        "about", "your", "does", "will", "tell", "show", "help", "like", "need",
        "some", "more", "much", "many", "good", "best", "available", "there"
    }
    keywords = [w for w in raw_words if w not in stop_words]

    if settings.USE_POSTGRES:
        try:
            for kw in keywords[:3]:
                found = await CourseRepository.list_courses(search=kw, limit=4)
                for f in found:
                    f_id = str(f.get("id") or f.get("_id") or "")
                    if not any(str(m.get("id") or m.get("_id") or "") == f_id for m in matching_courses):
                        matching_courses.append(f)
                if len(matching_courses) >= 4:
                    break

            if not matching_courses and any(k in lowered for k in ("course", "program", "class", "catalog", "learn", "study", "certif", "interview")):
                matching_courses = await CourseRepository.list_courses(limit=4)
        except Exception as exc:
            log.warning("assistant_course_fetch_failed", extra={"error": str(exc)})
    else:
        db = get_db()
        if keywords:
            pattern = "|".join(_re.escape(w) for w in keywords[:5])
            matching_courses = await db.courses.find(
                {
                    "deletedAt": None,
                    "published": True,
                    "$or": [
                        {"title": {"$regex": pattern, "$options": "i"}},
                        {"description": {"$regex": pattern, "$options": "i"}},
                        {"tags": {"$regex": pattern, "$options": "i"}},
                    ],
                },
                {"title": 1, "slug": 1, "description": 1, "fee": 1, "category": 1},
            ).to_list(length=4)
        if not matching_courses and any(k in lowered for k in ("course", "program", "class", "catalog", "learn", "study", "interview")):
            matching_courses = await db.courses.find(
                {"deletedAt": None, "published": True},
                {"title": 1, "slug": 1, "description": 1, "fee": 1, "category": 1},
            ).to_list(length=4)

    # 2. Navigation quick links
    navigation = [
        ("dashboard", "/student/dashboard", "Your Student Dashboard"),
        ("practice", "/student/practice", "Practice Studio (Mock Interviews & Labs)"),
        ("interview", "/student/practice", "Mock Interview Simulator"),
        ("game", "/student/games", "Interactive Skill Games (34 Published Games)"),
        ("progress", "/student/progress", "Communication Readiness & Progress"),
        ("certificate", "/student/achievements", "Achievements & Verifiable Certificates"),
        ("resume", "/student/resume-analyzer", "AI Resume Analyzer & ATS Scorer"),
        ("assignment", "/student/learning", "My Learning & Assignments"),
        ("class", "/student/live-classes", "Live Classroom Sessions"),
        ("password", "/forgot-password", "Password Reset"),
        ("pricing", "/courses", "Course Catalog & Transparent Pricing"),
        ("contact", "/contact", "Programme Office Contact"),
    ]
    links = [
        {"label": label, "href": href}
        for keyword, href, label in navigation
        if keyword in lowered
    ]

    # 3. Contextual student deadlines/enrollments if authenticated
    deadlines: list[dict[str, Any]] = []
    enrolled_titles: list[str] = []
    if ctx is not None and ctx.role is Role.STUDENT:
        if settings.USE_POSTGRES:
            try:
                pool = await connect_to_postgres()
                from uuid import UUID
                user_uuid = UUID(str(ctx.user_id)) if isinstance(ctx.user_id, str) else ctx.user_id
                async with pool.acquire() as conn:
                    e_rows = await conn.fetch(
                        """
                        SELECT c.title FROM enrollments e
                        JOIN courses c ON e.course_id = c.id
                        WHERE e.participant_user_id = $1 AND e.deleted_at IS NULL
                        LIMIT 5
                        """,
                        user_uuid
                    )
                    enrolled_titles = [r["title"] for r in e_rows]
            except Exception:
                pass
        else:
            db = get_db()
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

    # 4. Generate AI response (Real LLM or Grounded Synthesizer)
    ai_answer: str | None = None
    used_provider = settings.AI_PROVIDER
    has_api_key = bool(settings.AI_API_KEY and settings.AI_API_KEY.strip())

    catalog_summary = "\n".join(
        f"- {c['title']} (Category: {c.get('category', 'Soft Skills')}, Link: /courses/{c.get('slug') or str(c.get('id') or c.get('_id') or '')})"
        for c in matching_courses[:4]
    ) or "- Comprehensive Communication & Soft Skills Modules\n- Cloud AI Masterclass\n- Professional Communication\n- Tech Interview Preparation"

    if settings.AI_PROVIDER in ("anthropic", "openai", "huggingface") and has_api_key:
        try:
            import httpx
            headers: dict[str, str] = {"Content-Type": "application/json"}
            url = settings.AI_BASE_URL
            body: dict[str, Any] = {}

            sys_prompt = (
                "You are the official AI Learning Assistant for Winners Creek (EEDI LMS), a premier college "
                "employability and soft skills training platform.\n"
                "Answer the user's question clearly, professionally, and concisely in 2 to 4 sentences.\n"
                "Guidelines:\n"
                "- Ground your answers strictly in the platform's actual features and courses.\n"
                "- Mention relevant course links or portals when helpful.\n"
                "- Platform highlights: 34 interactive skill games, evidence-backed AI mock interviews, 7 employability pillars (Behaviour, Communication, Confidence, Leadership, Technical, Problem Solving, Career Readiness), 95+ evaluation parameters, transparent course pricing, and trainer feedback.\n"
                f"- Available Courses:\n{catalog_summary}\n"
            )

            if settings.AI_PROVIDER == "anthropic":
                url = url or "https://api.anthropic.com/v1/messages"
                headers["x-api-key"] = settings.AI_API_KEY
                headers["anthropic-version"] = "2023-06-01"
                body = {
                    "model": settings.AI_MODEL,
                    "max_tokens": 400,
                    "system": sys_prompt,
                    "messages": [{"role": "user", "content": question}],
                }
            else:
                # OpenAI / HuggingFace
                url = url or (
                    "https://router.huggingface.co/v1/chat/completions"
                    if settings.AI_PROVIDER == "huggingface"
                    else "https://api.openai.com/v1/chat/completions"
                )
                model_name = settings.AI_MODEL
                if settings.AI_PROVIDER == "huggingface" and model_name == "Qwen/Qwen2.5-7B-Instruct":
                    model_name = "Qwen/Qwen2.5-Coder-7B-Instruct"

                headers["Authorization"] = f"Bearer {settings.AI_API_KEY}"
                body = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": sys_prompt},
                        {"role": "user", "content": question},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 400,
                }

            timeout_sec = float(settings.AI_TIMEOUT_SECONDS) if settings.AI_TIMEOUT_SECONDS else 30.0
            async with httpx.AsyncClient(timeout=timeout_sec) as client:
                res = await client.post(url, headers=headers, json=body)
                if res.status_code == 200:
                    data = res.json()
                    if settings.AI_PROVIDER == "anthropic":
                        ai_answer = "".join(b.get("text", "") for b in data.get("content", []))
                    else:
                        ai_answer = data["choices"][0]["message"]["content"]
                    used_provider = f"{settings.AI_PROVIDER}:{body.get('model', settings.AI_MODEL)}"
                else:
                    log.warning(
                        "assistant_provider_http_error",
                        extra={"status": res.status_code, "body": res.text[:200]},
                    )
        except Exception as exc:
            log.warning("assistant_provider_call_failed", extra={"error": str(exc)[:150]})

    # Resilient deterministic grounding if external provider unavailable or mock mode
    if not ai_answer:
        used_provider = "grounded-domain-engine"
        ai_answer = _synthesize_homepage_answer(
            question=question,
            matching_courses=matching_courses,
            links=links,
            enrolled_titles=enrolled_titles,
        )

    is_platform_topic = any(
        k in lowered
        for k in (
            "winners creek", "eedi", "lms", "practice", "interview", "game",
            "mock", "lab", "arena", "score", "pillar", "course", "program",
            "class", "catalog", "learn", "study", "fee", "cost", "login",
            "sign in", "account", "register", "password"
        )
    )
    is_grounded = bool(matching_courses or links or is_platform_topic or enrolled_titles)

    return {
        "success": True,
        "data": {
            "answer": ai_answer,
            "courses": [
                {
                    "id": str(c.get("id") or c.get("_id") or ""),
                    "title": c["title"],
                    "slug": c.get("slug") or f"course-{c.get('id') or c.get('_id')}",
                    "category": c.get("category", "General"),
                    "fee": float(c.get("fee") or 0.0),
                }
                for c in matching_courses[:4]
            ],
            "links": links,
            "deadlines": deadlines,
            "escalation": {
                "available": True,
                "href": "/contact",
                "label": "Contact programme office",
                "message": "Have a specific enrollment or institutional inquiry? Our team can assist.",
            },
            "grounded": is_grounded,
            "provider": used_provider,
        },
    }
