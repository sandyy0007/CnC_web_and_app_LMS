"""Student portal API.

The improvement loop the requirements describe is implemented end to end:
PRACTISE → AI ASSESSMENT → EXPLAINABLE FEEDBACK → TRAINER REVIEW → PERSONALISED EXERCISE →
PROGRESS TRACKING. Every practice attempt persists a session; recordings go to private storage;
scoring happens in the background so the upload response is immediate.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.authz.guards import require_role
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import BusinessRuleViolation, Conflict, NotFound, ValidationError
from app.db.mongo import as_utc, get_db, serialize
from app.repositories.base import _clean_doc
from app.repositories.collections import (
    AchievementRepo,
    AiScoreRepo,
    AssignmentRepo,
    AssignmentSubmissionRepo,
    CertificateRepo,
    CourseProgressRepo,
    CourseRepo,
    EediScoreRepo,
    ExerciseLibraryRepo,
    GameAttemptRepo,
    GameDefinitionRepo,
    LiveClassRepo,
    PlacementGoalRepo,
    PracticeModeRepo,
    PracticeSessionRepo,
    QuizAttemptRepo,
    QuizRepo,
    RecommendationRepo,
    RecordingRepo,
    ResumeDocumentRepo,
    StudentProfileRepo,
    TranscriptRepo,
    TrainerFeedbackRepo,
    XpEventRepo,
    EbookRepo,
    EbookProgressRepo,
    EbookBookmarkRepo,
    PaymentRepo,
    InvoiceRepo,
    CourseTrialRepo,
)
from app.schemas.requests import (
    CompletePracticeRequest,
    GameAttemptRequest,
    ProfileUpdate,
    ProgressUpdate,
    QuizAttemptRequest,
    PlacementGoalRequest as GoalReq,
    SettingsUpdate,
    StartPracticeRequest,
)
from app.services import analytics, chat_service, payment_service, trial_service
from app.services.ai_provider import FEEDBACK_DIMENSIONS, READINESS_DIMENSIONS
from app.services.scoring import PILLAR_LABELS, PILLARS, band_for
from app.services.storage import Keys, get_storage, put_object, signed_url
from app.services.resume_ats_service import analyze_resume_ats
from app.services.recommendation_engine import compute_course_recommendations, compute_skill_gaps
from app.workers.queue import enqueue

router = APIRouter()
StudentCtx = Depends(require_role(Role.STUDENT))

MAX_RECORDING_BYTES = 120 * 1024 * 1024
ALLOWED_MEDIA = (
    "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav",
    "video/webm", "video/mp4",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _profile(ctx: ScopeContext) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("""
                SELECT u.id, u.name, u.email, u.phone, u.institution_id, u.department_id,
                       sp.roll_number, sp.batch_id, sp.avatar_url,
                       d.name as department_name, inst.name as institution_name,
                       b.name as batch_name, b.code as batch_code,
                       COALESCE(e.current_semester, b.semester, 1) as semester,
                       b.academic_year
                FROM users u
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                LEFT JOIN departments d ON d.id = u.department_id
                LEFT JOIN institutions inst ON inst.id = u.institution_id
                LEFT JOIN batches b ON b.id = sp.batch_id
                LEFT JOIN enrollments e ON e.participant_user_id = u.id AND e.enrollment_status = 'ACTIVE'
                WHERE u.id = $1::uuid
            """, uuid.UUID(str(ctx.user_id)))
            if row:
                parts = (row["name"] or "Student").split(" ", 1)
                batch_name = row["batch_name"]
                batch_code = row["batch_code"]
                section = None
                if batch_name and " - " in batch_name:
                    section = batch_name.split(" - ")[-1].strip()
                elif batch_code and len(batch_code) > 2:
                    section = batch_code[-1]

                dept_name = row["department_name"] or "Computer Science & Engineering"
                program = f"B.Tech - {dept_name}" if dept_name else "B.Tech"

                return {
                    "id": str(row["id"]),
                    "userId": str(row["id"]),
                    "name": row["name"],
                    "firstName": parts[0],
                    "lastName": parts[1] if len(parts) > 1 else "",
                    "email": row["email"],
                    "phone": row["phone"],
                    "rollNumber": row["roll_number"] or "N/A",
                    "batchId": str(row["batch_id"]) if row.get("batch_id") else None,
                    "batchName": batch_name,
                    "batchCode": batch_code,
                    "semester": row["semester"] if batch_name else None,
                    "academicYear": row["academic_year"],
                    "section": section,
                    "program": program,
                    "departmentId": str(row["department_id"]) if row["department_id"] else None,
                    "departmentName": dept_name,
                    "institutionId": str(row["institution_id"]) if row["institution_id"] else None,
                    "institutionName": row["institution_name"] or "Institution",
                    "avatarUrl": row.get("avatar_url"),
                }
    profile = await StudentProfileRepo(ctx).find_one({"userId": ctx.user_id})
    if not profile:
        raise NotFound("Your student profile has not been set up yet")
    return profile


# --------------------------------------------------------------------------- dashboard pieces
async def _streak(ctx: ScopeContext) -> dict[str, Any]:
    """Consecutive days with any XP-earning activity."""
    events = await XpEventRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, projection={"at": 1}, limit=400, sort=[("at", -1)]
    )
    days = sorted({e["at"].date() for e in events if e.get("at")}, reverse=True)
    if not days:
        return {"days": 0, "lastActiveOn": None}
    today = _now().date()
    if (today - days[0]).days > 1:
        return {"days": 0, "lastActiveOn": days[0]}
    streak, cursor = 1, days[0]
    for day in days[1:]:
        if (cursor - day).days == 1:
            streak += 1
            cursor = day
        elif (cursor - day).days > 1:
            break
    return {"days": streak, "lastActiveOn": days[0]}


async def _total_xp(ctx: ScopeContext) -> dict[str, Any]:
    rows = await XpEventRepo(ctx).aggregate(
        [
            {"$match": {"studentUserId": ctx.user_id}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
    )
    total = rows[0]["total"] if rows else 0
    week_rows = await XpEventRepo(ctx).aggregate(
        [
            {"$match": {"studentUserId": ctx.user_id, "at": {"$gte": _now() - timedelta(days=7)}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
    )
    level = max(1, total // 150 + 1)
    return {
        "total": total,
        "thisWeek": week_rows[0]["total"] if week_rows else 0,
        "level": level,
        "levelFloor": (level - 1) * 150,
        "levelCeiling": level * 150,
    }


async def _learning_hours(ctx: ScopeContext, *, days: int = 7) -> float:
    rows = await CourseProgressRepo(ctx).aggregate(
        [
            {
                "$match": {
                    "studentUserId": ctx.user_id,
                    "lastAccessedAt": {"$gte": _now() - timedelta(days=days)},
                }
            },
            {"$group": {"_id": None, "minutes": {"$sum": "$minutesSpentRecent"}}},
        ]
    )
    minutes = rows[0]["minutes"] if rows and rows[0].get("minutes") else 0
    return round(minutes / 60, 1)


async def build_continue_learning(ctx: ScopeContext) -> dict[str, Any] | None:
    """Most recently touched course + the next lesson to resume."""
    progress = await CourseProgressRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=1, sort=[("lastAccessedAt", -1)]
    )
    if not progress:
        course = await CourseRepo(ctx).find_one({"published": True})
        if not course:
            return None
        return {
            "courseId": str(course["_id"]),
            "courseTitle": course.get("title"),
            "slug": course.get("slug"),
            "icon": course.get("icon"),
            "percent": 0,
            "nextLesson": None,
            "moduleLabel": "Not started",
            "trainerName": course.get("trainerName"),
            "state": "not_started",
        }

    row = progress[0]
    db = get_db()
    course = await db.courses.find_one({"_id": row["courseId"]})
    next_lesson = None
    module_label = None
    if row.get("nextLessonId"):
        lesson = await db.lessons.find_one({"_id": row["nextLessonId"]})
        if lesson:
            next_lesson = {"id": str(lesson["_id"]), "title": lesson.get("title")}
            module = await db.modules.find_one({"_id": lesson.get("moduleId")})
            if module:
                module_label = f"Module {module.get('order', 1)} · {module.get('title')}"
    return {
        "courseId": str(row["courseId"]),
        "courseTitle": (course or {}).get("title"),
        "slug": (course or {}).get("slug"),
        "icon": (course or {}).get("icon"),
        "percent": round(row.get("percent", 0), 1),
        "nextLesson": next_lesson,
        "moduleLabel": module_label or (course or {}).get("category"),
        "trainerName": (course or {}).get("trainerName"),
        "timeRemainingMinutes": row.get("timeRemainingMinutes"),
        "state": "in_progress",
    }


async def _daily_quest(ctx: ScopeContext) -> dict[str, Any]:
    """Three small tasks that reset daily; completion is derived from today's real activity."""
    start_of_day = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    db = get_db()
    watched = await db.course_progress.count_documents(
        {"studentUserId": ctx.user_id, "lastAccessedAt": {"$gte": start_of_day}}
    )
    practised = await db.practice_sessions.count_documents(
        {"studentUserId": ctx.user_id, "createdAt": {"$gte": start_of_day}}
    )
    quizzed = await db.assessment_attempts.count_documents(
        {"studentUserId": ctx.user_id, "createdAt": {"$gte": start_of_day}}
    )
    tasks = [
        {"code": "watch", "label": "Watch: Active Listening", "xp": 20, "icon": "play",
         "done": watched > 0, "href": "/student/learning"},
        {"code": "practice", "label": "Practice: Elevator Pitch", "xp": 15, "icon": "target",
         "done": practised > 0, "href": "/student/practice"},
        {"code": "quiz", "label": "Quiz: Grammar Check", "xp": 15, "icon": "help-circle",
         "done": quizzed > 0, "href": "/student/assessments"},
    ]
    done = sum(1 for t in tasks if t["done"])
    return {
        "tasks": tasks,
        "completed": done,
        "total": len(tasks),
        "totalXp": sum(t["xp"] for t in tasks),
        "earnedXp": sum(t["xp"] for t in tasks if t["done"]),
        "resetsAt": start_of_day + timedelta(days=1),
    }


async def _skill_breakdown(ctx: ScopeContext) -> list[dict[str, Any]]:
    """The 7-pillar breakdown, ordered as the dashboard shows it."""
    score = await EediScoreRepo(ctx).find_one({"studentUserId": ctx.user_id}) or {}
    pillars = score.get("pillarScores") or {}
    return [
        {
            "code": code,
            "label": label,
            "score": round(pillars[code], 1) if code in pillars else None,
            "band": band_for(pillars.get(code)),
            "hasData": code in pillars,
        }
        for code, label in PILLARS
    ]


async def _upcoming_session(ctx: ScopeContext, profile: dict[str, Any]) -> dict[str, Any] | None:
    rows = await LiveClassRepo(ctx).find_all(
        {"batchId": profile.get("batchId"), "startsAt": {"$gte": _now()}},
        limit=1,
        sort=[("startsAt", 1)],
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "id": str(row["_id"]),
        "title": row.get("title"),
        "trainerName": row.get("trainerName"),
        "startsAt": row.get("startsAt"),
        "endsAt": row.get("endsAt"),
        "joinUrl": row.get("joinUrl"),
    }


async def _week_at_a_glance(ctx: ScopeContext, profile: dict[str, Any]) -> list[dict[str, Any]]:
    """One entry per day for the current week, merging classes, assessments and deadlines."""
    today = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=7)
    batch_id = profile.get("batchId")

    classes = await LiveClassRepo(ctx).find_all(
        {"batchId": batch_id, "startsAt": {"$gte": start, "$lt": end}}, limit=100
    )
    quizzes = await QuizRepo(ctx).find_all(
        {"batchId": batch_id, "opensAt": {"$gte": start, "$lt": end}}, limit=100
    )
    assignments = await AssignmentRepo(ctx).find_all(
        {"batchId": batch_id, "dueAt": {"$gte": start, "$lt": end}}, limit=100
    )
    practice = await PracticeSessionRepo(ctx).find_all(
        {"studentUserId": ctx.user_id, "createdAt": {"$gte": start, "$lt": end}}, limit=100
    )

    days: list[dict[str, Any]] = []
    for offset in range(7):
        day = start + timedelta(days=offset)
        items: list[dict[str, Any]] = []
        for row in classes:
            if row["startsAt"].date() == day.date():
                items.append({"kind": "live_class", "label": "Live Class",
                              "title": row.get("title"), "at": row["startsAt"]})
        for row in quizzes:
            if row.get("opensAt") and row["opensAt"].date() == day.date():
                items.append({"kind": "assessment", "label": "Assessment",
                              "title": row.get("title"), "at": row["opensAt"]})
        for row in assignments:
            if row.get("dueAt") and row["dueAt"].date() == day.date():
                items.append({"kind": "deadline", "label": "Deadline",
                              "title": row.get("title"), "at": row["dueAt"]})
        for row in practice:
            if row.get("createdAt") and row["createdAt"].date() == day.date():
                items.append({"kind": "practice", "label": "Practice",
                              "title": row.get("practiceModeTitle"), "at": row["createdAt"]})
        days.append(
            {
                "date": day,
                "label": day.strftime("%a %d"),
                "isToday": day.date() == _now().date(),
                "items": sorted(items, key=lambda i: i["at"]),
                "restDay": not items,
            }
        )
    return days


async def _coach_insight(ctx: ScopeContext) -> dict[str, Any] | None:
    """A short, grounded observation — the dashboard's AI Coach card."""
    score = await EediScoreRepo(ctx).find_one({"studentUserId": ctx.user_id})
    if not score:
        return None
    focus = score.get("focusPillar")
    delta = score.get("delta")
    history = score.get("history") or []
    observation = None
    if delta and delta > 0:
        observation = f"Your readiness score is up {delta:+} points since the last recalculation."
    elif len(history) >= 2:
        observation = "Your score is holding steady — a new practice attempt will move it."
    else:
        observation = "Complete a practice attempt to start tracking your improvement."
    recommendation = await RecommendationRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "state": "active"}
    )
    return {
        "observation": observation,
        "focusArea": PILLAR_LABELS.get(focus or "", None),
        "recommendedPractice": (recommendation or {}).get("exerciseTitle"),
        "href": "/student/practice",
    }


# --------------------------------------------------------------------------- dashboard
@router.get("/dashboard")
async def dashboard(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.stats_repo import StatsRepository
        try:
            pg_data = await StatsRepository.get_student_dashboard_data(ctx.user_id)
            pg_data.setdefault("learningHoursThisWeek", 0.0)
            pg_data.setdefault("pendingTasks", {"total": 0, "assignments": 0, "awaitingTrainerReview": 0})
            pg_data.setdefault("continueLearning", None)
            pg_data.setdefault("dailyQuest", None)
            pg_data.setdefault("upcomingLiveSession", None)
            pg_data.setdefault("skillBreakdown", [])
            pg_data.setdefault("recommendedActivity", None)
            pg_data.setdefault("weekAtAGlance", [])
            pg_data.setdefault("leaderboard", {"myRank": None, "outOf": None, "top": []})
            return {"success": True, "data": pg_data}
        except Exception:
            pass

    profile = await _profile(ctx)
    score = await EediScoreRepo(ctx).find_one({"studentUserId": ctx.user_id}) or {}

    db = get_db()
    pending_assignments = 0
    if profile.get("batchId"):
        submitted = set(
            await db.assignment_submissions.distinct(
                "assignmentId", {"studentUserId": ctx.user_id}
            )
        )
        open_assignments = await db.assignments.find(
            {"batchId": profile["batchId"], "deletedAt": None, "dueAt": {"$gte": _now()}},
            {"_id": 1},
        ).to_list(length=200)
        pending_assignments = len([a for a in open_assignments if a["_id"] not in submitted])

    unreviewed = await AiScoreRepo(ctx).count(
        {"studentUserId": ctx.user_id, "trainerReviewState": "pending"}
    )
    recommendation = await RecommendationRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "state": "active"}
    )
    rank = await analytics.student_rank(ctx, ctx.user_id, batch_id=profile.get("batchId"))

    return {
        "success": True,
        "data": {
            "student": {
                "name": profile.get("name"),
                "firstName": str(profile.get("name", "")).split(" ")[0],
                "rollNumber": profile.get("rollNumber"),
                "batchName": profile.get("batchName"),
                "departmentName": profile.get("departmentName"),
                "avatarColor": profile.get("avatarColor"),
            },
            "streak": await _streak(ctx),
            "readiness": {
                "score": score.get("finalScore"),
                "outOf": 100,
                "delta": score.get("delta"),
                "hasData": score.get("finalScore") is not None,
                "trainerComponent": score.get("trainerComponent"),
                "aiComponent": score.get("aiComponent"),
                "scoringVersion": score.get("scoringVersion"),
            },
            "learningHoursThisWeek": await _learning_hours(ctx),
            "pendingTasks": {
                "total": pending_assignments + unreviewed,
                "assignments": pending_assignments,
                "awaitingTrainerReview": unreviewed,
            },
            "continueLearning": await build_continue_learning(ctx),
            "dailyQuest": await _daily_quest(ctx),
            "upcomingLiveSession": await _upcoming_session(ctx, profile),
            "skillBreakdown": await _skill_breakdown(ctx),
            "recommendedActivity": serialize(recommendation),
            "weekAtAGlance": serialize(await _week_at_a_glance(ctx, profile)),
            "leaderboard": {
                "myRank": rank.get("rank"),
                "outOf": rank.get("outOf"),
                "top": serialize(
                    await analytics.leaderboard(ctx, limit=5, batch_id=profile.get("batchId"))
                ),
            },
            "coachInsight": await _coach_insight(ctx),
            "xp": await _total_xp(ctx),
        },
    }


# --------------------------------------------------------------------------- my learning
@router.get("/learning-path")
async def learning_path(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    stages = ("Foundation", "Communication", "Technical", "Interview Ready")
    progress = await CourseProgressRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=200
    )
    courses = {
        c["_id"]: c
        for c in await CourseRepo(ctx).find_all(
            {"_id": {"$in": [p["courseId"] for p in progress]}}, limit=200
        )
    }
    by_stage: dict[str, list[float]] = {s: [] for s in stages}
    for row in progress:
        stage = (courses.get(row["courseId"]) or {}).get("stage")
        if stage in by_stage:
            by_stage[stage].append(row.get("percent", 0))

    out = []
    for index, stage in enumerate(stages):
        values = by_stage[stage]
        average = round(sum(values) / len(values), 1) if values else 0.0
        state = "completed" if average >= 99 else ("in_progress" if average > 0 else "upcoming")
        if state == "upcoming" and index > 0 and out[index - 1]["state"] == "completed":
            state = "in_progress" if average > 0 else "upcoming"
        out.append({"stage": stage, "percent": average, "state": state, "courses": len(values)})

    overall = (
        round(sum(s["percent"] for s in out) / len(out), 1) if out else 0.0
    )
    return {"success": True, "data": {"stages": out, "overallPercent": overall}}


@router.get("/courses")
async def my_courses(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            trainer_row = await conn.fetchrow("""
                SELECT u.name as trainer_name
                FROM student_profiles sp
                JOIN batch_trainers bt ON bt.batch_id = sp.batch_id
                JOIN users u ON u.id = bt.trainer_user_id
                WHERE sp.user_id = $1::uuid AND u.deleted_at IS NULL
                LIMIT 1;
            """, uuid.UUID(str(ctx.user_id)))
            student_trainer = trainer_row["trainer_name"] if trainer_row else "Winners Creek Faculty"

            rows = await conn.fetch("""
                SELECT c.id, c.title, c.slug, c.code, c.description, c.category, c.training_type,
                       c.delivery_mode, c.duration_hours, c.fee, c.published, c.order_index,
                       e.enrollment_status, e.access_status, e.current_semester
                FROM courses c
                LEFT JOIN enrollments e ON e.course_id = c.id AND e.participant_user_id = $1::uuid AND e.enrollment_status = 'ACTIVE'
                WHERE c.published = TRUE AND c.deleted_at IS NULL
                ORDER BY c.order_index ASC, c.created_at DESC;
            """, uuid.UUID(str(ctx.user_id)))
            items = []
            for r in rows:
                enrolled = r["enrollment_status"] == "ACTIVE"
                items.append({
                    "id": str(r["id"]),
                    "title": r["title"],
                    "slug": r["slug"],
                    "code": r["code"],
                    "icon": "book-open",
                    "category": r["category"] or "Soft Skills",
                    "stage": "foundation" if "Old" in r["title"] or "Communication" in r["title"] else "placement",
                    "trainerName": student_trainer,
                    "difficulty": "Intermediate",
                    "durationHours": r["duration_hours"] or 40,
                    "percent": 0.0,
                    "state": "not_started",
                    "nextLesson": None,
                    "timeRemainingMinutes": (r["duration_hours"] or 40) * 60,
                    "enrolled": enrolled,
                    "accessStatus": r["access_status"] or ("ACTIVE" if enrolled else "INACTIVE")
                })
            return {"success": True, "data": items}

    progress_rows = await CourseProgressRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=200, sort=[("lastAccessedAt", -1)]
    )
    by_course = {row["courseId"]: row for row in progress_rows}
    courses = await CourseRepo(ctx).find_all({"published": True}, limit=200, sort=[("order", 1)])

    db = get_db()
    items = []
    for course in courses:
        row = by_course.get(course["_id"])
        next_lesson = None
        if row and row.get("nextLessonId"):
            lesson = await db.lessons.find_one({"_id": row["nextLessonId"]}, {"title": 1})
            next_lesson = (lesson or {}).get("title")
        items.append(
            {
                "id": str(course["_id"]),
                "title": course.get("title"),
                "slug": course.get("slug"),
                "icon": course.get("icon"),
                "category": course.get("category"),
                "stage": course.get("stage"),
                "trainerName": course.get("trainerName"),
                "difficulty": course.get("difficulty"),
                "durationHours": course.get("durationHours"),
                "percent": round((row or {}).get("percent", 0), 1),
                "state": (row or {}).get("state", "not_started"),
                "nextLesson": next_lesson,
                "timeRemainingMinutes": (row or {}).get("timeRemainingMinutes"),
                "enrolled": row is not None,
            }
        )
    return {"success": True, "data": items}


@router.get("/courses/{course_id}")
async def course_detail(course_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        try:
            cid = uuid.UUID(str(course_id))
        except ValueError:
            cid = None
        if cid:
            async with get_pg_connection() as conn:
                course = await conn.fetchrow("""
                    SELECT id, title, slug, code, description, category, training_type,
                           delivery_mode, duration_hours, fee, published,
                           trial_duration_days, trial_enabled, payment_methods, upi_id, merchant_name,
                           qr_code_url, payment_instructions, refund_policy, enrollment_open, status
                    FROM courses WHERE id = $1 AND deleted_at IS NULL;
                """, cid)
                if course:
                    modules = await conn.fetch("""
                        SELECT id, title, slug, description, order_index
                        FROM modules WHERE course_id = $1 AND deleted_at IS NULL
                        ORDER BY order_index ASC;
                    """, cid)
                    m_ids = [m["id"] for m in modules]
                    lessons = await conn.fetch("""
                        SELECT id, module_id, title, slug, duration_minutes, order_index, content_type
                        FROM lessons WHERE module_id = ANY($1::uuid[]) AND deleted_at IS NULL
                        ORDER BY order_index ASC;
                    """, m_ids) if m_ids else []
                    
                    lessons_by_m: dict[str, list[dict[str, Any]]] = {}
                    for l in lessons:
                        mid = str(l["module_id"])
                        lessons_by_m.setdefault(mid, []).append({
                            "id": str(l["id"]),
                            "title": l["title"],
                            "slug": l["slug"],
                            "durationMinutes": l["duration_minutes"],
                            "order": l["order_index"],
                            "completed": False
                        })
                    
                    serialized_modules = [
                        {
                            "id": str(m["id"]),
                            "title": m["title"],
                            "slug": m["slug"],
                            "description": m["description"],
                            "order": m["order_index"],
                            "lessons": lessons_by_m.get(str(m["id"]), [])
                        }
                        for m in modules
                    ]

                    # Check participant access entitlement
                    access_info = await trial_service.check_course_access(ctx.user_id, cid) if ctx.user_id else {"hasAccess": False}

                    return {
                        "success": True,
                        "data": {
                            "id": str(course["id"]),
                            "_id": str(course["id"]),
                            "title": course["title"],
                            "slug": course["slug"],
                            "code": course["code"],
                            "description": course["description"],
                            "category": course["category"],
                            "durationHours": course["duration_hours"],
                            "fee": float(course["fee"]) if course["fee"] is not None else 0.0,
                            "published": course["published"],
                            "status": course.get("status") or ("PUBLISHED" if course["published"] else "DRAFT"),
                            "trialDurationDays": course.get("trial_duration_days") or 3,
                            "trialEnabled": course.get("trial_enabled", True),
                            "paymentMethods": course.get("payment_methods") or ["UPI", "GATEWAY"],
                            "upiId": course.get("upi_id") or "",
                            "merchantName": course.get("merchant_name") or "Winners Creek",
                            "qrCodeUrl": course.get("qr_code_url") or "",
                            "paymentInstructions": course.get("payment_instructions") or "Scan the UPI QR code or pay to the UPI ID. Enter the 12-digit transaction UTR reference to verify.",
                            "refundPolicy": course.get("refund_policy") or "Full refund within 7 days of course purchase if less than 20% course completed.",
                            "enrollmentOpen": course.get("enrollment_open", True),
                            "access": access_info,
                            "modules": serialized_modules,
                            "progress": {"completedLessonIds": [], "percent": 0.0}
                        }
                    }

    course = await CourseRepo(ctx).get(course_id)
    db = get_db()
    modules = await db.modules.find({"courseId": course["_id"], "deletedAt": None}).sort(
        "order", 1
    ).to_list(length=100)
    progress = await CourseProgressRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "courseId": course["_id"]}
    )
    completed = set((progress or {}).get("completedLessonIds", []))
    for module in modules:
        lessons = await db.lessons.find(
            {"moduleId": module["_id"], "deletedAt": None}
        ).sort("order", 1).to_list(length=200)
        for lesson in lessons:
            lesson["completed"] = lesson["_id"] in completed
        module["lessons"] = lessons
    return {
        "success": True,
        "data": {
            **serialize(course),
            "modules": serialize(modules),
            "progress": serialize(progress),
        },
    }


@router.post("/courses/{course_id}/progress")
async def update_progress(
    course_id: str, payload: ProgressUpdate, ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    course = await CourseRepo(ctx).get(course_id)
    db = get_db()
    existing = await CourseProgressRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "courseId": course["_id"]}
    )
    completed = list((existing or {}).get("completedLessonIds", []))
    if payload.lessonId:
        lesson_oid = ObjectId(payload.lessonId)
        lesson = await db.lessons.find_one({"_id": lesson_oid})
        if not lesson:
            raise NotFound("Lesson not found")
        if payload.percent >= 100 and lesson_oid not in completed:
            completed.append(lesson_oid)

    total_lessons = await db.lessons.count_documents(
        {"courseId": course["_id"], "deletedAt": None}
    )
    percent = (
        round(len(completed) / total_lessons * 100, 1)
        if total_lessons
        else round(payload.percent, 1)
    )
    next_lesson = await db.lessons.find_one(
        {"courseId": course["_id"], "_id": {"$nin": completed}, "deletedAt": None},
        sort=[("order", 1)],
    )
    minutes = payload.minutesSpent

    await db.course_progress.update_one(
        {"studentUserId": ctx.user_id, "courseId": course["_id"]},
        {
            "$set": {
                "studentUserId": ctx.user_id,
                "courseId": course["_id"],
                "collegeId": ctx.college_id,
                "departmentId": ctx.department_id,
                "percent": percent,
                "completedLessonIds": completed,
                "nextLessonId": (next_lesson or {}).get("_id"),
                "state": "completed" if percent >= 100 else "in_progress",
                "lastAccessedAt": _now(),
                "minutesSpentRecent": minutes,
                "updatedAt": _now(),
            },
            "$inc": {"minutesSpent": minutes},
            "$setOnInsert": {"createdAt": _now(), "deletedAt": None, "version": 1},
        },
        upsert=True,
    )
    if minutes:
        await _award_xp(ctx, amount=min(20, minutes), source="learning", label=course.get("title"))
    return {"success": True, "data": {"percent": percent, "completedLessons": len(completed)}}


# --------------------------------------------------------------------------- XP helper
async def _award_xp(
    ctx: ScopeContext, *, amount: int, source: str, label: str | None = None
) -> None:
    if amount <= 0:
        return
    await get_db().xp_events.insert_one(
        _clean_doc(
            {
                "studentUserId": ctx.user_id,
                "collegeId": ctx.college_id,
                "departmentId": ctx.department_id,
                "amount": int(amount),
                "source": source,
                "label": label,
                "at": _now(),
            }
        )
    )


# --------------------------------------------------------------------------- games
@router.get("/games")
async def games(
    category: str | None = Query(None, max_length=40), ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.routers.gamification import participant_list_games
        return await participant_list_games(category=category, ctx=ctx)
    filters: dict[str, Any] = {"published": True}
    if category and category != "all":
        filters["category"] = category
    definitions = await GameDefinitionRepo(ctx).find_all(filters, limit=100, sort=[("order", 1)])
    attempts = await GameAttemptRepo(ctx).aggregate(
        [
            {"$match": {"studentUserId": ctx.user_id}},
            {
                "$group": {
                    "_id": "$gameId",
                    "best": {"$max": "$score"},
                    "attempts": {"$sum": 1},
                    "lastLevel": {"$max": "$level"},
                    "completedLevels": {"$addToSet": {"$cond": ["$completed", "$level", None]}},
                }
            },
        ]
    )
    stats = {row["_id"]: row for row in attempts}

    items = []
    for definition in definitions:
        stat = stats.get(definition["_id"], {})
        levels = len(definition.get("levels", [])) or 1
        done = len([level for level in stat.get("completedLevels", []) if level])
        items.append(
            {
                "id": str(definition["_id"]),
                "code": definition.get("code"),
                "title": definition.get("title"),
                "description": definition.get("description"),
                "category": definition.get("category"),
                "difficulty": definition.get("difficulty"),
                "icon": definition.get("icon"),
                "thumbnail": definition.get("thumbnail"),
                "gameUrl": definition.get("gameUrl") or definition.get("launchUrl"),
                "launchUrl": definition.get("launchUrl") or definition.get("gameUrl"),
                "courseId": str(definition.get("courseId")) if definition.get("courseId") else None,
                "durationMinutes": definition.get("durationMinutes"),
                "xpReward": definition.get("xpReward"),
                "levels": levels,
                "bestScore": stat.get("best"),
                "attempts": stat.get("attempts", 0),
                "progressPercent": round(done / levels * 100, 1) if levels else 0,
                "skills": definition.get("skillMap", []),
            }
        )

    xp = await _total_xp(ctx)
    streak = await _streak(ctx)
    weekly_target = 500
    return {
        "success": True,
        "data": {
            "games": items,
            "categories": sorted({d.get("category") for d in definitions if d.get("category")}),
            "xp": xp,
            "streak": streak,
            "weeklyQuest": {
                "earned": xp["thisWeek"],
                "target": weekly_target,
                "percent": round(min(100, xp["thisWeek"] / weekly_target * 100), 1),
                "endsAt": (_now() + timedelta(days=7 - _now().weekday())).replace(
                    hour=0, minute=0, second=0, microsecond=0
                ),
            },
            "badges": serialize(await _earned_badges(ctx, limit=4)),
            "leaderboard": serialize(await analytics.leaderboard(ctx, limit=4)),
        },
    }


@router.get("/games/{game_id}")
async def game_detail(game_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Returns the playable scenario, with the *correct* answers withheld."""
    if settings.USE_POSTGRES:
        from app.routers.gamification import participant_get_game
        return await participant_get_game(game_id=game_id, ctx=ctx)
    definition = await GameDefinitionRepo(ctx).get(game_id)
    levels = []
    for index, level in enumerate(definition.get("levels", []), start=1):
        levels.append(
            {
                "level": index,
                "title": level.get("title"),
                "scenario": level.get("scenario"),
                "dialogue": level.get("dialogue", []),
                "question": level.get("question", "How would you respond?"),
                "options": [
                    {
                        "id": option.get("id"),
                        "text": option.get("text"),
                        "tag": option.get("tag"),
                        "skills": option.get("skills", []),
                    }
                    for option in level.get("options", [])
                ],
                "objectives": level.get("objectives", []),
                "hint": level.get("hint"),
                "timeLimitSeconds": level.get("timeLimitSeconds", 420),
                "skillsAssessed": level.get("skillsAssessed", []),
            }
        )
    attempts = await GameAttemptRepo(ctx).find_all(
        {"studentUserId": ctx.user_id, "gameId": definition["_id"]}, limit=20
    )
    return {
        "success": True,
        "data": {
            "id": str(definition["_id"]),
            "code": definition.get("code"),
            "title": definition.get("title"),
            "category": definition.get("category"),
            "thumbnail": definition.get("thumbnail"),
            "gameUrl": definition.get("gameUrl") or definition.get("launchUrl"),
            "launchUrl": definition.get("launchUrl") or definition.get("gameUrl"),
            "courseId": str(definition.get("courseId")) if definition.get("courseId") else None,
            "xpReward": definition.get("xpReward"),
            "levels": levels,
            "accessibility": {
                "screenReaderFriendly": True,
                "keyboardShortcuts": [
                    {"keys": "1–4", "action": "Select option"},
                    {"keys": "Enter", "action": "Submit"},
                    {"keys": "H", "action": "Show hint"},
                    {"keys": "Esc", "action": "Exit game"},
                ],
            },
            "myAttempts": serialize(attempts),
        },
    }


@router.post("/games/{game_id}/launch")
async def launch_game(game_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Records game launch event for student learning engagement tracking."""
    if settings.USE_POSTGRES:
        from app.repositories.game_repo import GameRepository
        try:
            g = await GameRepository.get_game_by_id(game_id)
        except Exception:
            g = await GameRepository.get_game_by_code(game_id)
        if not g:
            raise NotFound(f"Game '{game_id}' not found.")
        code = g.get("code") or str(g["id"])
        return {
            "success": True,
            "message": "Game launch recorded",
            "data": {
                "gameUrl": f"/student/games/{code}/play",
                "launchUrl": f"/student/games/{code}/play",
            }
        }
    definition = await GameDefinitionRepo(ctx).get(game_id)
    db = get_db()
    await db.game_definitions.update_one(
        {"_id": definition["_id"]},
        {"$inc": {"launches": 1}}
    )
    await write_audit(
        ctx,
        action="launch_game",
        entity_type="game_definitions",
        entity_id=definition["_id"],
        detail=f"Student launched game {definition.get('code')}"
    )
    return {
        "success": True,
        "message": "Game launch recorded",
        "data": {
            "gameUrl": definition.get("gameUrl") or definition.get("launchUrl"),
            "launchUrl": definition.get("launchUrl") or definition.get("gameUrl"),
        }
    }


@router.post("/games/{game_id}/attempts", status_code=status.HTTP_201_CREATED)
async def submit_game_attempt(
    game_id: str, payload: GameAttemptRequest, ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Games are not decorative: attempts, scores, XP and skill deltas are all persisted."""
    definition = await GameDefinitionRepo(ctx).get(game_id)
    levels = definition.get("levels", [])
    if payload.level > max(1, len(levels)):
        raise ValidationError("That level does not exist in this game")
    level = levels[payload.level - 1] if levels else {}
    options = {o.get("id"): o for o in level.get("options", [])}

    score, skill_deltas, evaluated = 0, {}, []
    for choice in payload.choices:
        option = options.get(choice.get("optionId"))
        if not option:
            continue
        delta = int(option.get("delta", 0))
        score += delta
        for skill in option.get("skills", []):
            skill_deltas[skill] = skill_deltas.get(skill, 0) + delta
        evaluated.append(
            {
                "optionId": option.get("id"),
                "text": option.get("text"),
                "tag": option.get("tag"),
                "delta": delta,
                "feedback": option.get("feedback"),
                "best": bool(option.get("best")),
            }
        )

    combo_bonus = min(payload.comboMax, 5) * 10
    hint_penalty = payload.hintsUsed * 5
    score = max(0, score + combo_bonus - hint_penalty)
    xp = int(definition.get("xpReward", 50)) if payload.completed else int(score / 10)

    document = {
        "studentUserId": ctx.user_id,
        "collegeId": ctx.college_id,
        "departmentId": ctx.department_id,
        "gameId": definition["_id"],
        "gameCode": definition.get("code"),
        "gameTitle": definition.get("title"),
        "category": definition.get("category"),
        "level": payload.level,
        "score": score,
        "xpEarned": xp,
        "comboMax": payload.comboMax,
        "hintsUsed": payload.hintsUsed,
        "durationSeconds": payload.durationSeconds,
        "choices": evaluated,
        "skillDeltas": skill_deltas,
        "completed": payload.completed,
        "createdAt": _now(),
        "updatedAt": _now(),
        "deletedAt": None,
        "version": 1,
    }
    document = _clean_doc(document)
    result = await get_db().game_attempts.insert_one(document)
    await _award_xp(ctx, amount=xp, source="game", label=definition.get("title"))

    next_level = payload.level + 1 if payload.level < len(levels) else None
    return {
        "success": True,
        "data": {
            "attemptId": str(result.inserted_id),
            "score": score,
            "xpEarned": xp,
            "skillDeltas": skill_deltas,
            "choices": evaluated,
            "nextLevel": next_level,
            "levelsTotal": len(levels),
        },
    }


async def _earned_badges(ctx: ScopeContext, *, limit: int = 20) -> list[dict[str, Any]]:
    catalogue = await AchievementRepo(ctx).find_all(limit=100, sort=[("order", 1)])
    score = await EediScoreRepo(ctx).find_one({"studentUserId": ctx.user_id}) or {}
    streak = await _streak(ctx)
    xp = await _total_xp(ctx)
    db = get_db()
    practice_count = await db.practice_sessions.count_documents(
        {"studentUserId": ctx.user_id, "state": "scored"}
    )
    pillars = score.get("pillarScores") or {}

    out = []
    for badge in catalogue:
        rule = badge.get("rule") or {}
        earned, progress = False, 0.0
        kind = rule.get("kind")
        if kind == "streak":
            target = rule.get("days", 7)
            earned = streak["days"] >= target
            progress = min(100.0, streak["days"] / target * 100)
        elif kind == "pillar_score":
            target, code = rule.get("score", 80), rule.get("pillar", "communication")
            current = pillars.get(code, 0)
            earned = current >= target
            progress = min(100.0, current / target * 100) if target else 0
        elif kind == "practice_count":
            target = rule.get("count", 3)
            earned = practice_count >= target
            progress = min(100.0, practice_count / target * 100)
        elif kind == "xp":
            target = rule.get("xp", 1000)
            earned = xp["total"] >= target
            progress = min(100.0, xp["total"] / target * 100)
        out.append(
            {
                "id": str(badge["_id"]),
                "code": badge.get("code"),
                "title": badge.get("title"),
                "description": badge.get("description"),
                "icon": badge.get("icon"),
                "color": badge.get("color"),
                "earned": earned,
                "progressPercent": round(progress, 1),
            }
        )
    out.sort(key=lambda b: (not b["earned"], -b["progressPercent"]))
    return out[:limit]


@router.get("/achievements")
async def achievements(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    certificates = await CertificateRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=50
    )
    enriched = []
    for certificate in certificates:
        row = serialize(certificate)
        if certificate.get("storageKey") and certificate.get("status") == "issued":
            row["downloadUrl"] = await signed_url(
                certificate["storageKey"],
                filename=f"{certificate.get('certificateNo', 'certificate')}.pdf",
            )
        enriched.append(row)
    return {
        "success": True,
        "data": {
            "badges": await _earned_badges(ctx),
            "certificates": enriched,
            "xp": await _total_xp(ctx),
            "streak": await _streak(ctx),
        },
    }


# --------------------------------------------------------------------------- practice
@router.get("/practice/modes")
async def practice_modes(
    category: str | None = Query(None, max_length=40),
    difficulty: str | None = Query(None, max_length=20),
    search: str | None = Query(None, max_length=80),
    ctx: ScopeContext = StudentCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if category and category != "all":
        filters["category"] = category
    if difficulty and difficulty != "all":
        filters["difficulty"] = difficulty
    repo = PracticeModeRepo(ctx)
    modes = await repo.list(filters=filters, search=search, page=1, page_size=50)

    scores = await AiScoreRepo(ctx).aggregate(
        [
            {"$match": {"studentUserId": ctx.user_id}},
            {
                "$group": {
                    "_id": "$practiceModeId",
                    "last": {"$max": "$createdAt"},
                    "best": {"$max": "$overall"},
                    "attempts": {"$sum": 1},
                }
            },
        ]
    )
    by_mode = {row["_id"]: row for row in scores}
    latest = {}
    for row in await AiScoreRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=200, sort=[("createdAt", -1)]
    ):
        latest.setdefault(row.get("practiceModeId"), row.get("overall"))

    items = []
    for mode in modes.items:
        stat = by_mode.get(mode["_id"], {})
        items.append(
            {
                **serialize(mode),
                "attempts": stat.get("attempts", 0),
                "lastScore": latest.get(mode["_id"]),
                "bestScore": stat.get("best"),
            }
        )

    recommendation = await RecommendationRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "state": "active"}
    )
    weekly_target = 5
    done_this_week = await PracticeSessionRepo(ctx).count(
        {"studentUserId": ctx.user_id, "createdAt": {"$gte": _now() - timedelta(days=7)}}
    )
    recent = await PracticeSessionRepo(ctx).find_all(
        {"studentUserId": ctx.user_id, "state": "scored"}, limit=4, sort=[("createdAt", -1)]
    )
    return {
        "success": True,
        "data": {
            "modes": items,
            "categories": ["Speaking", "Writing", "Interview", "Teamwork"],
            "difficulties": ["beginner", "intermediate", "advanced"],
            "recommended": serialize(recommendation),
            "weeklyProgress": {
                "completed": done_this_week,
                "target": weekly_target,
                "resetsAt": (_now() + timedelta(days=7 - _now().weekday())).replace(
                    hour=0, minute=0, second=0, microsecond=0
                ),
            },
            "streak": await _streak(ctx),
            "recentAttempts": serialize(recent),
        },
    }


@router.post("/practice/sessions", status_code=status.HTTP_201_CREATED)
async def start_practice(
    payload: StartPracticeRequest, ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Every attempt creates a persisted session before any media is captured."""
    profile = await _profile(ctx)
    mode = await PracticeModeRepo(ctx).find_one({"code": payload.practiceModeCode})
    if not mode:
        raise NotFound("That practice mode is not available")

    if payload.idempotencyKey:
        existing = await PracticeSessionRepo(ctx).find_one(
            {"studentUserId": ctx.user_id, "idempotencyKey": payload.idempotencyKey}
        )
        if existing:
            # A retried "start" must not create a duplicate attempt (§10).
            return {"success": True, "data": serialize(existing), "meta": {"idempotentReplay": True}}

    attempt_number = (
        await PracticeSessionRepo(ctx).count(
            {"studentUserId": ctx.user_id, "practiceModeId": mode["_id"]}
        )
        + 1
    )
    questions = mode.get("questions") or [
        {"text": mode.get("defaultPrompt", "Tell me about yourself."), "guidance": None}
    ]
    document = {
        "studentUserId": ctx.user_id,
        "studentName": profile.get("name"),
        "rollNumber": profile.get("rollNumber"),
        "collegeId": ctx.college_id,
        "departmentId": ctx.department_id,
        "batchId": profile.get("batchId"),
        "practiceModeId": mode["_id"],
        "practiceModeCode": mode.get("code"),
        "practiceModeTitle": mode.get("title"),
        "kind": mode.get("kind", "interview"),
        "difficulty": payload.difficulty or mode.get("difficulty"),
        "state": "draft",
        "questions": questions,
        "currentQuestionIndex": 0,
        "attemptNumber": attempt_number,
        "recordingConsent": payload.recordingConsent,
        "idempotencyKey": payload.idempotencyKey or uuid.uuid4().hex,
        "startedAt": _now(),
        "createdAt": _now(),
        "updatedAt": _now(),
        "deletedAt": None,
        "version": 1,
    }
    document = _clean_doc(document)
    try:
        result = await get_db().practice_sessions.insert_one(document)
    except Exception as exc:
        raise Conflict("That practice attempt was already started") from exc
    document["_id"] = result.inserted_id

    return {
        "success": True,
        "data": {
            **serialize(document),
            "privacyNotice": (
                "Your audio and video are private and encrypted. They are used only to generate "
                "your AI feedback and are visible to you and your trainer."
            ),
            "checklist": [
                {"code": "warmup", "label": "Warm-up", "state": "pending"},
                {"code": "questions", "label": "Interview questions", "state": "pending"},
                {"code": "review", "label": "Review & summary", "state": "pending"},
                {"code": "feedback", "label": "AI feedback", "state": "pending"},
            ],
        },
    }


@router.get("/practice/sessions")
async def list_practice_sessions(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    state: str | None = Query(None, max_length=20),
    ctx: ScopeContext = StudentCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {"studentUserId": ctx.user_id}
    if state and state != "all":
        filters["state"] = state
    page_result = await PracticeSessionRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize
    )
    return {"success": True, **page_result.to_response()}


@router.get("/practice/sessions/{session_id}")
async def practice_session(session_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    session = await PracticeSessionRepo(ctx).get(session_id)
    recording = await RecordingRepo(ctx).find_one({"practiceSessionId": session["_id"]})
    transcript = await TranscriptRepo(ctx).find_one({"practiceSessionId": session["_id"]})
    data = serialize(session)
    data["recording"] = serialize(recording)
    data["transcript"] = serialize(transcript)
    if recording and recording.get("storageKey"):
        data["recording"]["playbackUrl"] = await signed_url(recording["storageKey"])
    return {"success": True, "data": data}


@router.post("/practice/sessions/{session_id}/upload-url")
async def practice_upload_url(
    session_id: str,
    mediaType: str = Query("audio", pattern="^(audio|video)$"),
    contentType: str = Query("audio/webm", max_length=60),
    ctx: ScopeContext = StudentCtx,
) -> dict[str, Any]:
    """Pre-signed direct upload (S3) so large media never transits the API."""
    session = await PracticeSessionRepo(ctx).get(session_id)
    key = (
        Keys.practice_audio(str(ctx.user_id), str(session["_id"]))
        if mediaType == "audio"
        else Keys.practice_video(str(ctx.user_id), str(session["_id"]))
    )
    upload = await get_storage().signed_upload(
        key, ttl=settings.SIGNED_URL_TTL_SECONDS, content_type=contentType
    )
    return {"success": True, "data": {"key": key, **upload}}


@router.post("/practice/upload")
async def practice_upload(
    sessionId: str = Form(...),
    mediaType: str = Form("audio"),
    durationSeconds: int = Form(0),
    partial: bool = Form(False),
    file: UploadFile = File(...),
    ctx: ScopeContext = StudentCtx,
) -> dict[str, Any]:
    """Direct upload path. Stores the media privately and records upload state + checksum."""
    session = await PracticeSessionRepo(ctx).get(sessionId)
    if not session.get("recordingConsent", True):
        raise BusinessRuleViolation(
            "Recording consent has not been given for this session. Enable it in Privacy settings."
        )

    content_type = (file.content_type or "application/octet-stream").split(";")[0]
    if content_type not in ALLOWED_MEDIA:
        raise ValidationError(
            f"'{content_type}' is not a supported recording format. Use WebM, MP4, OGG or WAV."
        )
    data = await file.read()
    if not data:
        raise ValidationError("The recording was empty — nothing was captured")
    if len(data) > MAX_RECORDING_BYTES:
        raise ValidationError("That recording is too large. Keep responses under 120 MB.")

    key = (
        Keys.practice_audio(str(ctx.user_id), str(session["_id"]))
        if mediaType == "audio"
        else Keys.practice_video(str(ctx.user_id), str(session["_id"]))
    )
    stored = await put_object(key, data, content_type)

    db = get_db()
    await db.recordings.update_one(
        {"practiceSessionId": session["_id"], "mediaType": mediaType},
        {
            "$set": {
                "practiceSessionId": session["_id"],
                "studentUserId": ctx.user_id,
                "collegeId": ctx.college_id,
                "departmentId": ctx.department_id,
                "mediaType": mediaType,
                "storageKey": stored.key,
                "bytes": stored.bytes,
                "checksum": stored.checksum,
                "contentType": content_type,
                "durationSeconds": durationSeconds,
                "uploadState": "partial" if partial else "uploaded",
                "updatedAt": _now(),
            },
            "$setOnInsert": {"createdAt": _now(), "deletedAt": None},
        },
        upsert=True,
    )
    await db.practice_sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {"state": "uploaded", "hasRecording": True, "updatedAt": _now()}},
    )
    return {
        "success": True,
        "data": {
            "key": stored.key,
            "bytes": stored.bytes,
            "checksum": stored.checksum,
            "uploadState": "partial" if partial else "uploaded",
        },
        "message": "Recording saved privately. Finish the session to get your AI feedback.",
    }


@router.post("/practice/sessions/{session_id}/complete")
async def complete_practice(
    session_id: str, payload: CompletePracticeRequest, ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Finish an attempt.

    The response returns immediately; transcription and scoring run in the background so the
    student is never left waiting on an AI call (§30).
    """
    session = await PracticeSessionRepo(ctx).get(session_id)
    if session.get("state") == "scored":
        raise Conflict("This attempt has already been scored")

    db = get_db()
    has_recording = bool(await db.recordings.find_one({"practiceSessionId": session["_id"]}))
    if not has_recording and not payload.transcriptOverride:
        raise BusinessRuleViolation(
            "There's nothing to score yet — record a response (or type one) before finishing."
        )

    if payload.transcriptOverride:
        # Written practice modes submit text rather than audio.
        text = payload.transcriptOverride.strip()
        await db.transcripts.update_one(
            {"practiceSessionId": session["_id"]},
            {
                "$set": {
                    "practiceSessionId": session["_id"],
                    "studentUserId": str(ctx.user_id),
                    "collegeId": ctx.college_id,
                    "departmentId": ctx.department_id,
                    "provider": "student_submitted",
                    "language": "en",
                    "text": text,
                    "segments": [
                        {"start": 0.0, "end": max(1.0, len(text.split()) / 2.2), "text": text}
                    ],
                    "wordCount": len(text.split()),
                    "updatedAt": _now(),
                },
                "$setOnInsert": {"createdAt": _now(), "deletedAt": None},
            },
            upsert=True,
        )

    await db.practice_sessions.update_one(
        {"_id": session["_id"]},
        {
            "$set": {
                "state": "queued_for_scoring",
                "completedAt": _now(),
                "answeredQuestions": payload.answeredQuestions,
                "durationSeconds": payload.durationSeconds,
                "partial": payload.partial,
                "updatedAt": _now(),
            }
        },
    )
    await _award_xp(ctx, amount=25, source="practice", label=session.get("practiceModeTitle"))
    await enqueue("practice.process", {"sessionId": str(session["_id"])})

    return {
        "success": True,
        "message": "Your response is being analysed — feedback usually arrives within a few seconds.",
        "data": {
            "sessionId": str(session["_id"]),
            "state": "queued_for_scoring",
            "feedbackHref": f"/student/practice/session/{session['_id']}/feedback",
        },
    }


@router.get("/practice/sessions/{session_id}/feedback")
async def practice_feedback(session_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Evidence-backed AI feedback for one attempt."""
    session = await PracticeSessionRepo(ctx).get(session_id)
    score = await AiScoreRepo(ctx).find_one({"practiceSessionId": session["_id"]})
    transcript = await TranscriptRepo(ctx).find_one({"practiceSessionId": session["_id"]})

    if not score:
        return {
            "success": True,
            "data": {
                "state": session.get("state"),
                "ready": False,
                "session": serialize(session),
                "message": (
                    "We couldn't score this attempt — please try again."
                    if session.get("state") == "failed"
                    else "Your feedback is still being generated."
                ),
            },
        }

    recording = await RecordingRepo(ctx).find_one({"practiceSessionId": session["_id"]})
    playback = (
        await signed_url(recording["storageKey"])
        if recording and recording.get("storageKey")
        else None
    )
    trainer_comment = await TrainerFeedbackRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "practiceSessionId": session["_id"]}
    )
    override = score.get("trainerOverride") or {}

    return {
        "success": True,
        "data": {
            "ready": True,
            "state": session.get("state"),
            "session": serialize(session),
            "overall": score.get("overall"),
            "delta": score.get("delta"),
            "previousOverall": score.get("previousOverall"),
            "dimensions": score.get("dimensions", []),
            "dimensionRubric": [
                {"code": d.code, "label": d.label, "weight": d.weight, "description": d.description}
                for d in FEEDBACK_DIMENSIONS
            ],
            "strengths": score.get("strengths", []),
            "focusNext": score.get("focusNext", []),
            "improvementChecklist": score.get("improvementChecklist", []),
            "personalizedExercise": score.get("personalizedExercise"),
            "metrics": score.get("metrics", {}),
            "transcript": serialize(transcript),
            "playbackUrl": playback,
            "grounded": score.get("grounded", False),
            "modelVersion": score.get("modelVersion"),
            "trainerReview": {
                "state": score.get("trainerReviewState", "pending"),
                "comment": (trainer_comment or {}).get("feedbackText"),
                "rating": (trainer_comment or {}).get("rating"),
                "reviewedBy": override.get("byLabel") or (trainer_comment or {}).get("trainerName"),
                "overridden": bool(override.get("dimensions")),
                "overrideReason": override.get("reason"),
            },
            "privacyNotice": (
                "This recording is private to you and your trainer, stored encrypted, and is "
                "never shared without your consent."
            ),
        },
    }


@router.get("/practice/sessions/{session_id}/compare")
async def compare_attempts(session_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Compare this attempt against the previous one for the same practice mode."""
    session = await PracticeSessionRepo(ctx).get(session_id)
    current = await AiScoreRepo(ctx).find_one({"practiceSessionId": session["_id"]})
    if not current:
        raise NotFound("This attempt has not been scored yet")
    previous_rows = await AiScoreRepo(ctx).find_all(
        {
            "studentUserId": ctx.user_id,
            "practiceModeId": session.get("practiceModeId"),
            "createdAt": {"$lt": current.get("createdAt")},
        },
        limit=1,
        sort=[("createdAt", -1)],
    )
    previous = previous_rows[0] if previous_rows else None
    current_dims = {d["code"]: d for d in current.get("dimensions", [])}
    previous_dims = {d["code"]: d for d in (previous or {}).get("dimensions", [])}
    return {
        "success": True,
        "data": {
            "current": {"overall": current.get("overall"), "at": current.get("createdAt")},
            "previous": (
                {"overall": previous.get("overall"), "at": previous.get("createdAt")}
                if previous
                else None
            ),
            "dimensions": [
                {
                    "code": dim.code,
                    "label": dim.label,
                    "current": current_dims.get(dim.code, {}).get("score"),
                    "previous": previous_dims.get(dim.code, {}).get("score"),
                    "delta": (
                        current_dims.get(dim.code, {}).get("score", 0)
                        - previous_dims[dim.code]["score"]
                        if dim.code in previous_dims and dim.code in current_dims
                        else None
                    ),
                }
                for dim in FEEDBACK_DIMENSIONS
            ],
        },
    }


@router.get("/recommendations")
async def recommendations(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    active = await RecommendationRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "state": "active"}
    )
    history = await RecommendationRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=10, sort=[("createdAt", -1)]
    )
    exercises = await ExerciseLibraryRepo(ctx).find_all(limit=40, sort=[("order", 1)])
    return {
        "success": True,
        "data": {
            "active": serialize(active),
            "history": serialize(history),
            "exerciseLibrary": serialize(exercises),
            "readinessDimensions": [
                {"code": d.code, "label": d.label, "weight": d.weight} for d in READINESS_DIMENSIONS
            ],
        },
    }


@router.get("/recommendations/courses")
async def get_course_recommendations(
    limit: int = Query(6, ge=1, le=20),
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Deterministic, explainable course recommendations based on EEDI & verified skill gaps."""
    return await compute_course_recommendations(ctx, limit=limit)


@router.get("/skill-gaps")
async def get_skill_gaps(
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Diagnosed skill gaps, weakest pillar, and EEDI competency ratings."""
    return {
        "success": True,
        "data": await compute_skill_gaps(ctx)
    }


# --------------------------------------------------------------------------- progress
@router.get("/progress")
async def progress(
    weeks: int = Query(8, ge=1, le=52), ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    profile = await _profile(ctx)
    score = await EediScoreRepo(ctx).find_one({"studentUserId": ctx.user_id}) or {}
    history = score.get("history") or []
    since = _now() - timedelta(weeks=weeks)
    trend = [
        {
            "at": as_utc(entry.get("computedAt")),
            "score": entry.get("finalScore"),
            "reason": entry.get("reason"),
        }
        for entry in history
        if entry.get("computedAt")
        and as_utc(entry["computedAt"]) >= since
        and entry.get("finalScore")
    ]

    practice_count = await PracticeSessionRepo(ctx).count(
        {"studentUserId": ctx.user_id, "state": "scored", "createdAt": {"$gte": since}}
    )
    quiz_attempts = await QuizAttemptRepo(ctx).count({"studentUserId": ctx.user_id})
    xp = await _total_xp(ctx)
    rank = await analytics.student_rank(ctx, ctx.user_id, batch_id=profile.get("batchId"))

    recent_scores = await AiScoreRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=8, sort=[("createdAt", -1)]
    )
    sessions = {
        s["_id"]: s
        for s in await PracticeSessionRepo(ctx).find_all(
            {"_id": {"$in": [r["practiceSessionId"] for r in recent_scores]}}, limit=20
        )
    }
    recent_assessments = [
        {
            "at": row.get("createdAt"),
            "activity": (sessions.get(row["practiceSessionId"]) or {}).get(
                "practiceModeTitle", "Practice"
            ),
            "score": row.get("overall"),
            "delta": row.get("delta"),
            "trainerReviewed": row.get("trainerReviewState") == "reviewed",
        }
        for row in recent_scores
    ]

    first = history[0] if history else {}
    breakdown = await _skill_breakdown(ctx)
    with_data = [b for b in breakdown if b["hasData"]]

    semester_tracking = []
    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            pg_evals = await conn.fetch("""
                SELECT ee.semester, ee.eedi_score, ee.employment_score, ee.status, ee.submitted_at,
                       c.title as course_title, c.code as course_code
                FROM eedi_evaluations ee
                LEFT JOIN courses c ON ee.course_id = c.id
                WHERE ee.participant_user_id = $1::uuid
                ORDER BY ee.semester ASC;
            """, uuid.UUID(str(ctx.user_id)))
            eval_by_sem = {r["semester"]: dict(r) for r in pg_evals}
            
            # Attendance count in Postgres
            att_cnt = await conn.fetchval("""
                SELECT count(*) FROM attendance_records WHERE participant_user_id = $1::uuid;
            """, uuid.UUID(str(ctx.user_id)))
            if att_cnt:
                practice_count = att_cnt

            current_sem = profile.get("semester") or (profile.get("current_semester") or 1)
            grad_year = profile.get("academicYear") or "2025-2029"
            
            for sem in range(1, 9):
                ev = eval_by_sem.get(sem)
                if ev and ev.get("eedi_score") is not None:
                    sem_status = "COMPLETED" if sem < current_sem else "ACTIVE"
                    score_val = float(ev["eedi_score"])
                    sem_label = f"Evaluated ({score_val:.1f} EEDI)"
                elif sem < current_sem:
                    sem_status = "NOT_EVALUATED"
                    score_val = None
                    if "2025" in str(grad_year) and sem in (1, 2):
                        sem_label = "Not Evaluated / Baseline Cohort Entry at Sem 3"
                    else:
                        sem_label = "Not Evaluated"
                elif sem == current_sem:
                    sem_status = "ACTIVE"
                    score_val = None
                    sem_label = "Active (In Progress)"
                else:
                    sem_status = "UPCOMING"
                    score_val = None
                    sem_label = "Upcoming"
                    
                semester_tracking.append({
                    "semester": sem,
                    "status": sem_status,
                    "score": score_val,
                    "label": sem_label,
                    "isCurrent": (sem == current_sem),
                    "courseTitle": ev.get("course_title") if ev else "Soft Skills – Arya Old",
                    "submittedAt": ev["submitted_at"].isoformat() if ev and ev.get("submitted_at") else None,
                })

            if eval_by_sem:
                latest_eval = max(eval_by_sem.values(), key=lambda x: x["semester"])
                if latest_eval.get("eedi_score") is not None:
                    score["finalScore"] = float(latest_eval["eedi_score"])

    return {
        "success": True,
        "data": {
            "readiness": {
                "score": score.get("finalScore"),
                "delta": score.get("delta"),
                "hasData": score.get("finalScore") is not None,
            },
            "practiceSessions": practice_count,
            "streak": await _streak(ctx),
            "batchRank": rank,
            "trend": trend,
            "skillBreakdown": breakdown,
            "semesterTracking": semester_tracking,
            "dayOneVsToday": {
                "rows": [
                    {
                        "metric": "EEDI Readiness Score",
                        "dayOne": first.get("finalScore"),
                        "today": score.get("finalScore"),
                    },
                    {
                        "metric": "Practice sessions completed",
                        "dayOne": (first.get("inputs") or {}).get("aiScoreCount", 0),
                        "today": practice_count,
                    },
                    {"metric": "Quizzes attempted", "dayOne": 0, "today": quiz_attempts},
                    {"metric": "XP earned", "dayOne": 0, "today": xp["total"]},
                ],
                "dayOneAt": first.get("computedAt"),
            },
            "strongestSkill": max(with_data, key=lambda b: b["score"]) if with_data else None,
            "focusArea": min(with_data, key=lambda b: b["score"]) if with_data else None,
            "nextRecommendedActivity": serialize(
                await RecommendationRepo(ctx).find_one(
                    {"studentUserId": ctx.user_id, "state": "active"}
                )
            ),
            "achievements": (await _earned_badges(ctx, limit=4)),
            "recentAssessments": recent_assessments,
        },
    }


@router.get("/attendance")
async def student_attendance(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Retrieve authentic attendance history strictly for the authenticated student."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        s_uuid = UUID(str(ctx.user_id))
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT ar.id, ar.status, ar.marked_at, ar.remarks,
                       ts.topic, ts.room, ts.session_date,
                       u.name as trainer_name, b.name as batch_name
                FROM attendance_records ar
                JOIN training_sessions ts ON ar.session_id = ts.id
                LEFT JOIN users u ON ts.trainer_user_id = u.id
                LEFT JOIN batches b ON ts.batch_id = b.id
                WHERE ar.participant_user_id = $1
                ORDER BY ts.session_date DESC, ar.marked_at DESC
                """,
                s_uuid,
            )
            records = [
                {
                    "id": str(r["id"]),
                    "status": (r["status"] or "PRESENT").lower(),
                    "date": r["session_date"].isoformat() if r["session_date"] else None,
                    "topic": r["topic"],
                    "room": r["room"],
                    "trainerName": r["trainer_name"],
                    "batchName": r["batch_name"],
                    "remark": r["remarks"],
                    "markedAt": r["marked_at"].isoformat() if r["marked_at"] else None,
                }
                for r in rows
            ]
            total = len(records)
            present_cnt = sum(1 for r in records if r["status"] == "present")
            pct_val = round((present_cnt / total) * 100.0, 1) if total > 0 else 0.0
            return {
                "success": True,
                "data": {
                    "records": records,
                    "totalSessions": total,
                    "presentCount": present_cnt,
                    "attendancePercent": pct_val,
                },
            }

    # Mongo fallback
    rows = await get_db().attendance.find({"studentUserId": ctx.user_id}).sort("date", -1).to_list(100)
    return {"success": True, "data": {"records": serialize(rows)}}


@router.post("/reports/progress")
async def export_progress(
    fmt: str = Query("pdf", pattern="^(pdf|xlsx|csv)$"), ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    from app.services.reports import request_report

    result = await request_report(ctx, report_type="student_progress", fmt=fmt)
    return {"success": True, "data": result}


# --------------------------------------------------------------------------- assessments & classes
@router.get("/assessments")
async def assessments(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    profile = await _profile(ctx)
    quizzes = await QuizRepo(ctx).find_all(
        {"batchId": profile.get("batchId")}, limit=100, sort=[("opensAt", -1)]
    )
    attempts = {
        row["assessmentId"]: row
        for row in await QuizAttemptRepo(ctx).find_all(
            {"studentUserId": ctx.user_id}, limit=200, sort=[("createdAt", -1)]
        )
    }
    items = []
    for quiz in quizzes:
        attempt = attempts.get(quiz["_id"])
        opens = quiz.get("opensAt")
        closes = quiz.get("closesAt")
        state = "available"
        if attempt:
            state = "completed"
        elif opens and as_utc(opens) > _now():
            state = "upcoming"
        elif closes and as_utc(closes) < _now():
            state = "closed"
        items.append(
            {
                "id": str(quiz["_id"]),
                "title": quiz.get("title"),
                "kind": quiz.get("kind", "quiz"),
                "questions": len(quiz.get("questions", [])),
                "durationMinutes": quiz.get("durationMinutes"),
                "opensAt": opens,
                "closesAt": closes,
                "state": state,
                "myScore": (attempt or {}).get("score"),
                "maxScore": quiz.get("maxScore", 100),
            }
        )
    return {"success": True, "data": items}


@router.get("/assessments/{quiz_id}")
async def assessment_detail(quiz_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    quiz = await QuizRepo(ctx).get(quiz_id)
    attempt = await QuizAttemptRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "assessmentId": quiz["_id"]}
    )
    questions = [
        {
            "id": question.get("id"),
            "text": question.get("text"),
            "options": [
                {"id": o.get("id"), "text": o.get("text")} for o in question.get("options", [])
            ],
            "marks": question.get("marks", 1),
        }
        for question in quiz.get("questions", [])
    ]
    return {
        "success": True,
        "data": {
            "id": str(quiz["_id"]),
            "title": quiz.get("title"),
            "durationMinutes": quiz.get("durationMinutes"),
            "questions": questions,
            "alreadyAttempted": attempt is not None,
            "myAttempt": serialize(attempt),
        },
    }


@router.post("/assessments/{quiz_id}/attempts", status_code=status.HTTP_201_CREATED)
async def submit_assessment(
    quiz_id: str, payload: QuizAttemptRequest, ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    quiz = await QuizRepo(ctx).get(quiz_id)
    if quiz.get("closesAt") and as_utc(quiz["closesAt"]) < _now():
        raise BusinessRuleViolation("This assessment has closed")
    existing = await QuizAttemptRepo(ctx).find_one(
        {"studentUserId": ctx.user_id, "assessmentId": quiz["_id"]}
    )
    if existing and not quiz.get("allowRetake"):
        raise Conflict("You have already submitted this assessment")

    by_question = {q.get("id"): q for q in quiz.get("questions", [])}
    earned, possible, reviewed = 0.0, 0.0, []
    for question in quiz.get("questions", []):
        possible += float(question.get("marks", 1))
    for answer in payload.answers:
        question = by_question.get(answer.get("questionId"))
        if not question:
            continue
        correct_ids = {o.get("id") for o in question.get("options", []) if o.get("correct")}
        chosen = answer.get("optionId")
        is_correct = chosen in correct_ids
        if is_correct:
            earned += float(question.get("marks", 1))
        reviewed.append(
            {
                "questionId": question.get("id"),
                "chosen": chosen,
                "correct": is_correct,
                "explanation": question.get("explanation"),
            }
        )

    score = round(earned / possible * 100, 1) if possible else 0.0
    document = {
        "assessmentId": quiz["_id"],
        "assessmentTitle": quiz.get("title"),
        "studentUserId": ctx.user_id,
        "collegeId": ctx.college_id,
        "departmentId": ctx.department_id,
        "answers": reviewed,
        "earned": earned,
        "possible": possible,
        "score": score,
        "durationSeconds": payload.durationSeconds,
        "createdAt": _now(),
        "updatedAt": _now(),
        "deletedAt": None,
        "version": 1,
    }
    document = _clean_doc(document)
    result = await get_db().assessment_attempts.insert_one(document)
    await _award_xp(ctx, amount=int(score / 5), source="quiz", label=quiz.get("title"))
    return {
        "success": True,
        "data": {
            "attemptId": str(result.inserted_id),
            "score": score,
            "earned": earned,
            "possible": possible,
            "answers": reviewed,
        },
    }


@router.get("/live-classes")
async def live_classes(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    profile = await _profile(ctx)
    upcoming = await LiveClassRepo(ctx).find_all(
        {"batchId": profile.get("batchId"), "startsAt": {"$gte": _now() - timedelta(hours=2)}},
        limit=50,
        sort=[("startsAt", 1)],
    )
    past = await LiveClassRepo(ctx).find_all(
        {"batchId": profile.get("batchId"), "startsAt": {"$lt": _now() - timedelta(hours=2)}},
        limit=30,
        sort=[("startsAt", -1)],
    )
    return {"success": True, "data": {"upcoming": serialize(upcoming), "past": serialize(past)}}


@router.get("/leaderboard")
async def leaderboard(
    scope: str = Query("batch", pattern="^(batch|department)$"),
    limit: int = Query(10, ge=3, le=50),
    ctx: ScopeContext = StudentCtx,
) -> dict[str, Any]:
    profile = await _profile(ctx)
    batch_id = profile.get("batchId") if scope == "batch" else None
    rows = await analytics.leaderboard(ctx, limit=limit, batch_id=batch_id)
    rank = await analytics.student_rank(ctx, ctx.user_id, batch_id=batch_id)
    return {
        "success": True,
        "data": {
            "scope": scope,
            "rows": serialize(rows),
            "me": rank,
            "percentile": (
                round(100 - (rank["rank"] / rank["outOf"] * 100), 1)
                if rank.get("rank") and rank.get("outOf")
                else None
            ),
        },
    }


# --------------------------------------------------------------------------- profile & plan
@router.get("/profile")
async def get_profile(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    profile = await _profile(ctx)
    user = None
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            u_row = await conn.fetchrow("SELECT id, name, email, phone, created_at FROM users WHERE id = $1::uuid", uuid.UUID(str(ctx.user_id)))
            if u_row:
                user = dict(u_row)
    if not user:
        user = await get_db().users.find_one({"_id": ctx.user_id})
    score = await EediScoreRepo(ctx).find_one({"studentUserId": ctx.user_id}) or {}
    goal = await PlacementGoalRepo(ctx).find_one({"studentUserId": ctx.user_id})
    resume = await ResumeDocumentRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=1, sort=[("createdAt", -1)]
    )
    certificates = await CertificateRepo(ctx).find_all(
        {"studentUserId": ctx.user_id, "status": "issued"}, limit=20
    )
    from app.services import session_service

    breakdown = await _skill_breakdown(ctx)
    with_data = [b for b in breakdown if b["hasData"]]
    gaps = sorted(with_data, key=lambda b: b["score"])[:2]

    return {
        "success": True,
        "data": {
            "profile": serialize(profile),
            "account": {
                "name": (user or {}).get("name"),
                "email": (user or {}).get("email"),
                "phone": (user or {}).get("phone"),
                "lastPasswordChangeAt": (user or {}).get("passwordChangedAt"),
                "twoFactorEnabled": bool((user or {}).get("twoFactorEnabled")),
            },
            "readiness": {"score": score.get("finalScore"), "delta": score.get("delta")},
            "profileCompleteness": profile.get("profileCompleteness", 0),
            "resume": {
                "status": "updated" if resume else "missing",
                "lastUpdatedAt": resume[0].get("createdAt") if resume else None,
            },
            "weekSchedule": serialize(await _week_at_a_glance(ctx, profile)),
            "placementGoal": serialize(goal),
            "skillGaps": [
                {
                    "label": gap["label"],
                    "score": gap["score"],
                    "priority": "High" if index == 0 else "Medium",
                }
                for index, gap in enumerate(gaps)
            ],
            "roadmap": (goal or {}).get("roadmap", []),
            "certificates": serialize(certificates),
            "preferences": (user or {}).get("preferences", {}),
            "sessions": serialize(
                await session_service.list_active_sessions(str(ctx.user_id), ctx.session_id)
            ),
            "coachInsight": await _coach_insight(ctx),
        },
    }


@router.patch("/profile")
async def update_profile(
    payload: ProfileUpdate, ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        raise ValidationError("Nothing to update")

    db = get_db()
    profile_fields = {
        k: v for k, v in updates.items() if k in ("section", "program", "bio", "name")
    }
    if payload.guardianName or payload.guardianPhone:
        profile_fields["guardianInfo"] = {
            "name": payload.guardianName,
            "phone": payload.guardianPhone,
        }
    if profile_fields:
        profile = await _profile(ctx)
        filled = sum(
            1
            for key in ("section", "program", "bio", "guardianInfo")
            if profile_fields.get(key) or profile.get(key)
        )
        profile_fields["profileCompleteness"] = min(100, 60 + filled * 10)
        await StudentProfileRepo(ctx).update(profile["_id"], profile_fields)

    user_fields = {k: v for k, v in updates.items() if k in ("name", "phone")}
    if user_fields:
        await db.users.update_one(
            {"_id": ctx.user_id}, {"$set": {**user_fields, "updatedAt": _now()}}
        )
    await write_audit(
        ctx, action="update", entity_type="student_profiles", entity_id=ctx.user_id,
        after=updates, detail="profile updated by student",
    )
    return {"success": True, "message": "Profile updated"}


@router.get("/placement-goal")
async def get_goal(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    goal = await PlacementGoalRepo(ctx).find_one({"studentUserId": ctx.user_id})
    return {"success": True, "data": serialize(goal)}


@router.put("/placement-goal")
async def set_goal(payload: GoalReq, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    score = await EediScoreRepo(ctx).find_one({"studentUserId": ctx.user_id}) or {}
    current = score.get("finalScore") or 0
    breakdown = [b for b in await _skill_breakdown(ctx) if b["hasData"]]
    gaps = sorted(breakdown, key=lambda b: b["score"])[:3]
    roadmap = [
        {
            "step": index + 1,
            "title": f"Strengthen {gap['label']}",
            "detail": f"Currently {gap['score']}/100 — targeted practice and trainer review.",
            "percent": round(min(100, gap["score"] / max(1, payload.targetScore) * 100), 1),
            "state": "in_progress" if index == 0 else "not_started",
        }
        for index, gap in enumerate(gaps)
    ]
    document = {
        "studentUserId": ctx.user_id,
        "collegeId": ctx.college_id,
        "departmentId": ctx.department_id,
        "targetRole": payload.targetRole,
        "targetScore": payload.targetScore,
        "targetDate": datetime.combine(payload.targetDate, datetime.min.time(), tzinfo=timezone.utc),
        "focusAreas": payload.focusAreas or [g["label"] for g in gaps],
        "currentScore": current,
        "skillGaps": [{"label": g["label"], "score": g["score"]} for g in gaps],
        "roadmap": roadmap,
        "updatedAt": _now(),
    }
    await get_db().placement_goals.update_one(
        {"studentUserId": ctx.user_id},
        {"$set": document, "$setOnInsert": {"createdAt": _now(), "deletedAt": None, "version": 1}},
        upsert=True,
    )
    return {"success": True, "data": serialize(document), "message": "Placement goal saved"}


@router.get("/settings")
async def get_settings(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    user = await get_db().users.find_one({"_id": ctx.user_id}, {"preferences": 1})
    from app.services import session_service

    return {
        "success": True,
        "data": {
            "preferences": (user or {}).get("preferences", {}),
            "sessions": serialize(
                await session_service.list_active_sessions(str(ctx.user_id), ctx.session_id)
            ),
        },
    }


@router.patch("/settings")
async def update_settings(
    payload: SettingsUpdate, ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise ValidationError("Nothing to update")
    await get_db().users.update_one(
        {"_id": ctx.user_id},
        {"$set": {**{f"preferences.{k}": v for k, v in updates.items()}, "updatedAt": _now()}},
    )
    await write_audit(
        ctx, action="update", entity_type="users", entity_id=ctx.user_id,
        after=updates, detail="notification/privacy preferences updated",
    )
    return {"success": True, "message": "Preferences saved", "data": updates}


# --------------------------------------------------------------------------- resume
@router.post("/resume")
async def upload_resume(
    file: UploadFile = File(...),
    roleKey: str = Form("senior-python-backend"),
    customJd: str | None = Form(None),
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    allowed = (
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    content_type = (file.content_type or "").split(";")[0]
    if content_type not in allowed and not file.filename.endswith((".pdf", ".doc", ".docx")):
        raise ValidationError("Upload your resume as a PDF or Word document")
    data = await file.read()
    if not data:
        raise ValidationError("That file is empty")
    if len(data) > 10 * 1024 * 1024:
        raise ValidationError("Keep your resume under 10 MB")

    filename = (file.filename or "resume.pdf").replace("/", "_")[:120]
    stored = await put_object(Keys.resume(str(ctx.user_id), filename), data, content_type)

    text = ""
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        try:
            from pypdf import PdfReader  # type: ignore
            import io as _io

            reader = PdfReader(_io.BytesIO(data))
            text = "\n".join((page.extract_text() or "") for page in reader.pages[:10])
        except Exception:
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(stream=data, filetype="pdf")
                text = "\n".join(page.get_text() for page in doc)
            except Exception:
                text = ""
    elif filename.lower().endswith(".docx"):
        try:
            import zipfile
            import io as _io
            import xml.etree.ElementTree as ET

            with zipfile.ZipFile(_io.BytesIO(data)) as zf:
                xml_content = zf.read("word/document.xml")
                root = ET.fromstring(xml_content)
                namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                paragraphs = []
                for p in root.iterfind(".//w:p", namespaces):
                    texts = [t.text for t in p.iterfind(".//w:t", namespaces) if t.text]
                    if texts:
                        paragraphs.append("".join(texts))
                text = "\n".join(paragraphs)
        except Exception:
            text = ""
    elif filename.lower().endswith((".txt", ".md")):
        try:
            text = data.decode("utf-8", errors="ignore")
        except Exception:
            text = ""

    # Execute role-grounded ATS analysis
    ats_analysis = analyze_resume_ats(text, role_key=roleKey, custom_jd=customJd)
    
    # Merge standard structural flags for backward compatibility
    legacy_analysis = _analyse_resume(text)
    analysis = {**legacy_analysis, **ats_analysis}

    inserted_doc = await ResumeDocumentRepo(ctx).insert(
        {
            "studentUserId": ctx.user_id,
            "filename": filename,
            "storageKey": stored.key,
            "bytes": stored.bytes,
            "contentType": content_type,
            "extractedCharacters": len(text),
            "targetRole": roleKey,
            "analysis": analysis,
            "version": 2,
        }
    )
    target_role_title = ats_analysis.get("targetRoleTitle") or "Target Role"
    return {
        "success": True,
        "data": {
            "id": str(inserted_doc["_id"]),
            "analysis": analysis,
            "overallScore": ats_analysis.get("overallScore", 0),
            "matchLevel": ats_analysis.get("matchLevel", "Entry"),
            "matchedSkills": ats_analysis.get("matchedSkills", []),
            "missingSkills": ats_analysis.get("missingSkills", []),
            "targetRole": roleKey,
            "targetRoleTitle": target_role_title,
        },
        "message": f"Resume uploaded and analyzed against {target_role_title}",
    }


def _analyse_resume(text: str) -> dict[str, Any]:
    """Structural resume analysis from the extracted text.

    Section detection and measurable signals only — no invented claims about the candidate.
    """
    lowered = text.lower()
    sections = {
        "contact": any(k in lowered for k in ("email", "@", "phone", "linkedin")),
        "education": "education" in lowered or "b.tech" in lowered or "bachelor" in lowered,
        "experience": any(k in lowered for k in ("experience", "internship", "worked")),
        "projects": "project" in lowered,
        "skills": "skill" in lowered or "technologies" in lowered,
        "achievements": any(k in lowered for k in ("achievement", "award", "certification")),
    }
    action_verbs = (
        "built", "led", "designed", "improved", "reduced", "delivered", "implemented",
        "automated", "increased", "mentored", "launched", "optimised", "optimized",
    )
    verb_hits = sum(1 for verb in action_verbs if verb in lowered)
    import re as _re

    quantified = len(_re.findall(r"\b\d+(?:\.\d+)?%|\b\d{2,}\b", text))
    present = sum(1 for value in sections.values() if value)

    score = 0
    score += present / len(sections) * 45
    score += min(verb_hits, 8) / 8 * 30
    score += min(quantified, 6) / 6 * 15
    score += 10 if len(text) > 900 else (5 if len(text) > 300 else 0)

    gaps: list[str] = []
    for name, found in sections.items():
        if not found:
            gaps.append(f"Add a clear {name} section")
    if verb_hits < 4:
        gaps.append("Start bullet points with strong action verbs (built, led, reduced)")
    if quantified < 3:
        gaps.append("Quantify your impact with numbers or percentages")
    if not text:
        gaps = [
            "We couldn't extract text from this file — upload a text-based PDF rather than a scan"
        ]
        score = 0

    return {
        "score": round(min(100, score)),
        "sectionsFound": [k for k, v in sections.items() if v],
        "sectionsMissing": [k for k, v in sections.items() if not v],
        "actionVerbCount": verb_hits,
        "quantifiedClaims": quantified,
        "gaps": gaps[:6],
        "analysedAt": _now(),
        "basis": "structural analysis of the extracted resume text",
    }


@router.get("/resume/analysis")
async def resume_analysis(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    rows = await ResumeDocumentRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=5, sort=[("createdAt", -1)]
    )
    latest = rows[0] if rows else None
    data = serialize(latest)
    if latest and latest.get("storageKey"):
        data["downloadUrl"] = await signed_url(
            latest["storageKey"], filename=latest.get("filename")
        )
    return {"success": True, "data": data, "meta": {"history": serialize(rows[1:])}}


@router.get("/certificates")
async def student_certificates(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    rows = await CertificateRepo(ctx).find_all({"studentUserId": ctx.user_id}, limit=50)
    out = []
    for row in rows:
        item = serialize(row)
        if row.get("storageKey") and row.get("status") == "issued":
            item["downloadUrl"] = await signed_url(
                row["storageKey"], filename=f"{row.get('certificateNo', 'certificate')}.pdf"
            )
        out.append(item)
    return {"success": True, "data": out}


@router.get("/assignments")
async def student_assignments(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    profile = await _profile(ctx)
    assignments = await AssignmentRepo(ctx).find_all(
        {"batchId": profile.get("batchId")}, limit=100, sort=[("dueAt", 1)]
    )
    submissions = {
        row["assignmentId"]: row
        for row in await AssignmentSubmissionRepo(ctx).find_all(
            {"studentUserId": ctx.user_id}, limit=200
        )
    }
    items = []
    for assignment in assignments:
        submission = submissions.get(assignment["_id"])
        items.append(
            {
                **serialize(assignment),
                "submission": serialize(submission),
                "state": (
                    "graded"
                    if submission and submission.get("grade") is not None
                    else "submitted"
                    if submission
                    else "pending"
                ),
                "daysLeft": (
                    (as_utc(assignment["dueAt"]) - _now()).days
                    if assignment.get("dueAt")
                    else None
                ),
            }
        )
    return {"success": True, "data": items}


@router.post("/assignments/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: str,
    note: str = Form(""),
    file: UploadFile | None = File(None),
    ctx: ScopeContext = StudentCtx,
) -> dict[str, Any]:
    assignment = await AssignmentRepo(ctx).get(assignment_id)
    due_at = as_utc(assignment.get("dueAt"))
    if due_at and due_at < _now() and not assignment.get("allowLate"):
        raise BusinessRuleViolation("The deadline for this assignment has passed")

    files: list[dict[str, Any]] = []
    if file is not None:
        data = await file.read()
        if data:
            if len(data) > 25 * 1024 * 1024:
                raise ValidationError("Keep submissions under 25 MB")
            filename = (file.filename or "submission").replace("/", "_")[:120]
            stored = await put_object(
                Keys.submission(str(assignment["_id"]), str(ctx.user_id), filename),
                data,
                (file.content_type or "application/octet-stream").split(";")[0],
            )
            files.append(
                {"filename": filename, "storageKey": stored.key, "bytes": stored.bytes}
            )

    if not files and not note.strip():
        raise ValidationError("Attach a file or add a note before submitting")

    await get_db().assignment_submissions.update_one(
        {"assignmentId": assignment["_id"], "studentUserId": ctx.user_id},
        {
            "$set": {
                "assignmentId": assignment["_id"],
                "assignmentTitle": assignment.get("title"),
                "studentUserId": ctx.user_id,
                "collegeId": ctx.college_id,
                "departmentId": ctx.department_id,
                "batchId": assignment.get("batchId"),
                "note": note.strip() or None,
                "files": files,
                "state": "submitted",
                "submittedAt": _now(),
                "late": bool(due_at and due_at < _now()),
                "updatedAt": _now(),
            },
            "$setOnInsert": {"createdAt": _now(), "deletedAt": None, "version": 1, "grade": None},
        },
        upsert=True,
    )
    await _award_xp(ctx, amount=20, source="assignment", label=assignment.get("title"))
    return {"success": True, "message": "Assignment submitted"}


# --------------------------------------------------------------------------- E-Books
@router.get("/ebooks")
async def list_ebooks(
    ctx: ScopeContext = StudentCtx,
    category: str | None = None,
    search: str | None = None,
    course_id: str | None = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {"published": True}
    if category and category != "all":
        query["category"] = category
    if course_id:
        query["courseId"] = ObjectId(course_id)

    books = await EbookRepo(ctx).find_all(query, limit=100)
    if search:
        s = search.lower().strip()
        books = [b for b in books if s in b.get("title", "").lower() or s in b.get("author", "").lower()]

    progress_docs = await EbookProgressRepo(ctx).find_all({"studentUserId": ctx.user_id})
    progress_map = {str(p["ebookId"]): p for p in progress_docs}

    bookmarks = await EbookBookmarkRepo(ctx).find_all({"studentUserId": ctx.user_id})
    bookmark_set = {str(b["ebookId"]) for b in bookmarks}

    items = []
    for b in books:
        bid = str(b["_id"])
        prog = progress_map.get(bid, {})
        cover_url = None
        if b.get("coverKey"):
            cover_url = await signed_url(b["coverKey"], ttl=3600)

        items.append({
            "id": bid,
            "title": b.get("title"),
            "author": b.get("author"),
            "description": b.get("description"),
            "category": b.get("category", "General"),
            "coverUrl": cover_url,
            "pageCount": b.get("pageCount", 120),
            "fileSizeBytes": b.get("fileSizeBytes", 0),
            "courseId": str(b["courseId"]) if b.get("courseId") else None,
            "courseTitle": b.get("courseTitle"),
            "tags": b.get("tags", []),
            "currentPage": prog.get("currentPage", 0),
            "progressPercent": prog.get("totalProgressPct", 0),
            "completed": prog.get("completed", False),
            "isBookmarked": bid in bookmark_set,
            "lastReadAt": prog.get("lastReadAt").isoformat() if prog.get("lastReadAt") else None,
        })

    return {"success": True, "data": items}


@router.get("/ebooks/my-uploads")
async def student_my_uploads(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Returns all eBooks uploaded by the current student with publication request statuses."""
    db = get_db()
    books = await db.ebooks.find({"uploadedBy": ctx.user_id, "deletedAt": None}).sort("createdAt", -1).to_list(100)
    items = []
    for b in books:
        req = await db.ebook_publish_requests.find_one({"ebookId": b["_id"]}, sort=[("createdAt", -1)])
        cover_url = f"/api/v1/ebooks/{str(b['_id'])}/cover" if b.get("coverKey") else None
        items.append({
            "id": str(b["_id"]),
            "slug": b.get("slug"),
            "title": b.get("title"),
            "category": b.get("category"),
            "pageCount": b.get("pageCount", 1),
            "fileSizeBytes": b.get("fileSizeBytes", 0),
            "status": b.get("status", "DRAFT"),
            "published": b.get("published", False),
            "coverUrl": cover_url,
            "rejectionReason": b.get("rejectionReason") or (req.get("rejectionReason") if req else None),
            "createdAt": b.get("createdAt").isoformat() if b.get("createdAt") else None,
            "hasPendingRequest": bool(req and req.get("status") == "PENDING"),
        })
    return {"success": True, "data": items}


@router.post("/ebooks/upload")
async def student_upload_ebook(
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form("General"),
    author: str = Form(""),
    tags: str = Form(""),
    file: UploadFile = File(...),
    cover: UploadFile | None = File(None),
    ctx: ScopeContext = StudentCtx,
) -> dict[str, Any]:
    """Upload a PDF eBook by a student."""
    from app.services.ebook_service import validate_pdf_bytes, extract_cover_from_pdf, slugify
    from app.services.storage import Keys, get_storage

    if not title.strip():
        raise ValidationError("Title is required.")

    pdf_bytes = await file.read()
    page_count, file_size = validate_pdf_bytes(pdf_bytes)

    now = _now()
    ebook_id = ObjectId()
    str_id = str(ebook_id)
    storage = get_storage()

    # Save PDF to private storage
    pdf_key = Keys.ebook_file(str_id, f"{slugify(title)}.pdf")
    await storage.put(pdf_key, pdf_bytes, "application/pdf")

    # Cover handling: use provided cover image or extract from PDF page 1
    cover_key = None
    if cover and cover.size and cover.size > 0:
        c_bytes = await cover.read()
        cover_key = Keys.ebook_cover(str_id, "cover.jpg")
        await storage.put(cover_key, c_bytes, "image/jpeg")
    else:
        extracted = extract_cover_from_pdf(pdf_bytes)
        if extracted:
            cover_key = Keys.ebook_cover(str_id, "cover.jpg")
            await storage.put(cover_key, extracted, "image/jpeg")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    doc = {
        "_id": ebook_id,
        "slug": f"{slugify(title)}-{str_id[-6:]}",
        "title": title.strip(),
        "description": description.strip(),
        "shortDescription": description.strip()[:140] + ("..." if len(description.strip()) > 140 else ""),
        "category": category.strip() or "General",
        "author": author.strip() or ctx.name or "Student Author",
        "uploadedBy": ctx.user_id,
        "uploaderRole": "STUDENT",
        "collegeId": ctx.college_id,
        "fileKey": pdf_key,
        "coverKey": cover_key,
        "pageCount": page_count,
        "fileSizeBytes": file_size,
        "tags": tag_list,
        "status": "DRAFT",
        "published": False,
        "visibility": "PUBLIC",
        "isFeatured": False,
        "isPinned": False,
        "displayOrder": 0,
        "allowDownload": False,
        "readsCount": 0,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }
    await get_db().ebooks.insert_one(doc)

    return {"success": True, "data": serialize(doc), "message": "eBook uploaded successfully as Draft."}


@router.get("/ebooks/{ebook_id}")
async def get_ebook_details(ebook_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    if not ObjectId.is_valid(ebook_id):
        raise NotFound("E-Book not found.")
    oid = ObjectId(ebook_id)
    book = await EbookRepo(ctx).find_one({"_id": oid, "published": True})
    if not book:
        raise NotFound("E-Book not found or not published.")

    # Increment reads count
    await get_db().ebooks.update_one({"_id": oid}, {"$inc": {"readsCount": 1}})

    prog = await EbookProgressRepo(ctx).find_one({"ebookId": oid, "studentUserId": ctx.user_id})
    is_bookmarked = bool(await EbookBookmarkRepo(ctx).find_one({"ebookId": oid, "studentUserId": ctx.user_id}))

    file_url = None
    if book.get("fileKey"):
        file_url = await signed_url(book["fileKey"], ttl=7200, filename=f"{book.get('title', 'book')}.pdf")

    cover_url = None
    if book.get("coverKey"):
        cover_url = await signed_url(book["coverKey"], ttl=7200)

    return {
        "success": True,
        "data": {
            "id": str(book["_id"]),
            "title": book.get("title"),
            "author": book.get("author"),
            "description": book.get("description"),
            "category": book.get("category"),
            "coverUrl": cover_url,
            "fileUrl": file_url,
            "pageCount": book.get("pageCount", 120),
            "courseTitle": book.get("courseTitle"),
            "tags": book.get("tags", []),
            "currentPage": prog.get("currentPage", 0) if prog else 0,
            "progressPercent": prog.get("totalProgressPct", 0) if prog else 0,
            "completed": prog.get("completed", False) if prog else False,
            "isBookmarked": is_bookmarked,
        },
    }


@router.post("/ebooks/{ebook_id}/progress")
async def update_ebook_progress(ebook_id: str, payload: dict[str, Any], ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    if not ObjectId.is_valid(ebook_id):
        raise NotFound("E-Book not found.")
    oid = ObjectId(ebook_id)
    current_page = int(payload.get("currentPage", 1))
    total_pages = int(payload.get("totalPages", 100))
    completed = bool(payload.get("completed", False)) or (current_page >= total_pages)
    pct = min(100.0, round((current_page / max(1, total_pages)) * 100, 1))

    now = _now()
    await get_db().ebook_progress.update_one(
        {"ebookId": oid, "studentUserId": ctx.user_id},
        {
            "$set": {
                "ebookId": oid,
                "studentUserId": ctx.user_id,
                "collegeId": ctx.college_id,
                "currentPage": current_page,
                "totalPages": total_pages,
                "totalProgressPct": pct,
                "completed": completed,
                "lastReadAt": now,
                "updatedAt": now,
            },
            "$setOnInsert": {"createdAt": now},
        },
        upsert=True,
    )

    if completed:
        await get_db().ebooks.update_one({"_id": oid}, {"$inc": {"completionsCount": 1}})
        await _award_xp(ctx, amount=15, source="ebook", label=f"Completed {payload.get('title', 'E-Book')}")

    return {"success": True, "progressPercent": pct, "completed": completed}


@router.post("/ebooks/{ebook_id}/bookmark")
async def toggle_ebook_bookmark(ebook_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    if not ObjectId.is_valid(ebook_id):
        raise NotFound("E-Book not found.")
    oid = ObjectId(ebook_id)
    col = get_db().ebook_bookmarks
    existing = await col.find_one({"ebookId": oid, "studentUserId": ctx.user_id})
    if existing:
        await col.delete_one({"_id": existing["_id"]})
        return {"success": True, "bookmarked": False}
    else:
        await col.insert_one({
            "ebookId": oid,
            "studentUserId": ctx.user_id,
            "collegeId": ctx.college_id,
            "createdAt": _now(),
        })
        return {"success": True, "bookmarked": True}


@router.post("/ebooks/{ebook_id}/request-publish")
async def student_request_publish(
    ebook_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = StudentCtx,
) -> dict[str, Any]:
    """Student requests their uploaded eBook to be reviewed and published publicly by Super Admin."""
    db = get_db()
    oid = ObjectId(ebook_id)
    book = await db.ebooks.find_one({"_id": oid, "uploadedBy": ctx.user_id, "deletedAt": None})
    if not book:
        raise NotFound("eBook not found.")

    if book.get("status") == "PUBLISHED":
        return {"success": True, "message": "eBook is already published."}

    now = _now()
    message = str(payload.get("message", "")).strip()

    # Update eBook status to PENDING_REVIEW
    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"status": "PENDING_REVIEW", "updatedAt": now}},
    )

    # Insert publish request record
    req_doc = {
        "ebookId": oid,
        "ebookTitle": book.get("title"),
        "requestedBy": ctx.user_id,
        "requesterName": ctx.name or "Student",
        "requesterRole": "STUDENT",
        "collegeId": ctx.college_id,
        "requestMessage": message,
        "status": "PENDING",
        "createdAt": now,
        "updatedAt": now,
    }
    await db.ebook_publish_requests.insert_one(req_doc)

    return {"success": True, "message": "Publishing request submitted for Super Admin review."}


# --------------------------------------------------------------------------- Mentor Chat
@router.get("/chat/mentors")
async def list_chat_mentors(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    mentors = await chat_service.get_authorized_trainers_for_student(ctx.user_id, ctx.college_id)
    return {"success": True, "data": mentors}


@router.get("/chat/conversations")
async def list_student_conversations(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    convs = await get_db().conversations.find({"studentUserId": ctx.user_id, "collegeId": ctx.college_id}).sort("lastMessageAt", -1).to_list(100)
    return {"success": True, "data": serialize(convs)}


@router.post("/chat/conversations/start")
async def start_student_conversation(payload: dict[str, Any], ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    trainer_id = ObjectId(payload["trainerUserId"])
    conv = await chat_service.get_or_create_conversation(ctx.user_id, trainer_id, ctx.college_id)
    return {"success": True, "data": serialize(conv)}


@router.get("/chat/conversations/{conv_id}/messages")
async def get_student_chat_messages(conv_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    cid = ObjectId(conv_id)
    conv = await get_db().conversations.find_one({"_id": cid, "studentUserId": ctx.user_id})
    if not conv:
        raise NotFound("Conversation not found.")

    msgs = await get_db().messages.find({"conversationId": cid}).sort("createdAt", 1).limit(200).to_list(200)
    await chat_service.mark_conversation_read(cid, ctx.user_id, "STUDENT")
    return {"success": True, "data": serialize(msgs)}


@router.post("/chat/conversations/{conv_id}/messages")
async def send_student_chat_message(conv_id: str, payload: dict[str, Any], ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    cid = ObjectId(conv_id)
    msg = await chat_service.send_chat_message(cid, ctx.user_id, "STUDENT", payload.get("message", ""))
    return {"success": True, "data": msg}


@router.post("/chat/conversations/{conv_id}/read")
async def mark_student_chat_read(conv_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    cid = ObjectId(conv_id)
    await chat_service.mark_conversation_read(cid, ctx.user_id, "STUDENT")
    return {"success": True}


# --------------------------------------------------------------------------- Payments
@router.get("/payments")
async def list_student_payments(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            try:
                user_uuid = uuid.UUID(str(ctx.user_id))
            except Exception:
                user_uuid = None
            if user_uuid:
                rows = await conn.fetch('''
                    SELECT 
                        p.id,
                        p.enrollment_id,
                        p.course_id,
                        p.semester,
                        p.amount,
                        p.currency,
                        p.transaction_ref,
                        p.payment_method,
                        p.status,
                        p.verified_by,
                        p.verified_at,
                        p.notes,
                        p.created_at,
                        c.title as course_title,
                        c.code as course_code,
                        c.delivery_mode as course_mode
                    FROM payments p
                    LEFT JOIN courses c ON p.course_id = c.id
                    WHERE p.participant_user_id = $1
                    ORDER BY p.created_at DESC
                ''', user_uuid)
                out = []
                for r in rows:
                    pid = str(r["id"])
                    st = str(r["status"]).lower()
                    out.append({
                        "id": pid,
                        "courseTitle": r["course_title"] or f"Semester {r['semester']} Curriculum Fee",
                        "courseId": str(r["course_id"]) if r["course_id"] else "",
                        "courseMode": str(r["course_mode"] or "ONLINE").upper(),
                        "amount": float(r["amount"]) if r["amount"] is not None else 0.0,
                        "currency": r["currency"] or "INR",
                        "status": st,
                        "paymentMethod": r["payment_method"] or "Official Institutional Fee",
                        "transactionId": r["transaction_ref"],
                        "invoiceNumber": f"INV-{r['transaction_ref'] or pid[:8].upper()}",
                        "paidAt": r["verified_at"].isoformat() if r["verified_at"] else (r["created_at"].isoformat() if r["created_at"] else None),
                        "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                        "invoice": {
                            "invoiceNumber": f"INV-{r['transaction_ref'] or pid[:8].upper()}",
                            "status": st,
                            "amount": float(r["amount"]) if r["amount"] is not None else 0.0,
                        },
                    })
                return {"success": True, "data": out, "payments": out}
        return {"success": True, "data": [], "payments": []}

    payments = await get_db().payments.find({"studentUserId": ctx.user_id}).sort("createdAt", -1).to_list(100)
    invoices = await get_db().invoices.find({"collegeId": ctx.college_id}).to_list(100)
    inv_map = {str(i.get("paymentId")): i for i in invoices}

    out = []
    for p in payments:
        pid = str(p["_id"])
        inv = inv_map.get(pid, {})
        out.append({
            "id": pid,
            "courseTitle": p.get("courseTitle", "Course"),
            "courseId": str(p.get("courseId", "")),
            "courseMode": p.get("courseMode", "ONLINE"),
            "amount": p.get("amount", 0.0),
            "currency": p.get("currency", "INR"),
            "status": p.get("status", "completed"),
            "paymentMethod": p.get("paymentMethod", "Card"),
            "transactionId": p.get("transactionId"),
            "invoiceNumber": p.get("invoiceNumber"),
            "paidAt": p.get("createdAt").isoformat() if p.get("createdAt") else None,
            "invoice": serialize(inv) if inv else None,
        })
    return {"success": True, "data": out, "payments": out}


@router.post("/payments/checkout")
async def checkout_course(payload: dict[str, Any], ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    raw_course_id = payload.get("courseId") or payload.get("course_id")
    if not raw_course_id:
        raise ValidationError("courseId is required")

    course_mode = (payload.get("courseMode") or payload.get("course_mode") or "ONLINE").strip().upper()
    res = await payment_service.create_course_payment(
        student_user_id=ctx.user_id,
        college_id=ctx.college_id,
        course_id=raw_course_id,
        course_mode=course_mode,
        payment_method=payload.get("paymentMethod") or payload.get("payment_method") or "UPI",
        idempotency_key=payload.get("idempotencyKey") or payload.get("idempotency_key"),
        transaction_ref=payload.get("transactionRef") or payload.get("transaction_ref") or payload.get("utr"),
        payer_upi_id=payload.get("payerUpiId") or payload.get("payer_upi_id"),
        receipt_url=payload.get("receiptUrl") or payload.get("receipt_url"),
    )
    return {"success": True, "data": res}


@router.get("/payments/{payment_id}/invoice")
async def get_payment_invoice(payment_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            try:
                pid_uuid = uuid.UUID(payment_id)
                uid_uuid = uuid.UUID(str(ctx.user_id))
            except Exception:
                raise NotFound("Invoice not found.")
            row = await conn.fetchrow('''
                SELECT 
                    p.id,
                    p.amount,
                    p.currency,
                    p.transaction_ref,
                    p.payment_method,
                    p.status,
                    p.verified_at,
                    p.created_at,
                    p.semester,
                    c.title as course_title,
                    u.name as student_name,
                    inst.name as institution_name
                FROM payments p
                LEFT JOIN courses c ON p.course_id = c.id
                LEFT JOIN users u ON p.participant_user_id = u.id
                LEFT JOIN institutions inst ON u.institution_id = inst.id
                WHERE p.id = $1 AND p.participant_user_id = $2
            ''', pid_uuid, uid_uuid)
            if not row:
                raise NotFound("Invoice not found.")

            st = str(row["status"]).lower()
            inv_num = f"INV-{row['transaction_ref'] or str(row['id'])[:8].upper()}"
            issued = row["verified_at"] or row["created_at"]
            amount = float(row["amount"]) if row["amount"] is not None else 0.0
            desc = f"{row['course_title'] or 'Curriculum Enrollment'} (Semester {row['semester'] or 1})"

            inv = {
                "invoiceNumber": inv_num,
                "issuedAt": issued.isoformat() if issued else _now().isoformat(),
                "studentName": row["student_name"] or "Student",
                "collegeName": row["institution_name"] or "Arya College of Engineering and IT",
                "items": [{"description": desc, "amount": amount}],
                "total": amount,
                "status": st,
                "paymentMethod": row["payment_method"] or "Electronic",
            }
            return {"success": True, "invoice": inv, "data": {"invoice": inv}}

    pid = ObjectId(payment_id)
    inv = await get_db().invoices.find_one({"paymentId": pid})
    if not inv:
        raise NotFound("Invoice not found.")
    return {"success": True, "data": serialize(inv)}


# --------------------------------------------------------------------------- Free Trials & Entitlements
@router.post("/courses/{course_id}/start-trial")
async def start_course_trial(course_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    trial = await trial_service.activate_course_trial(ctx.user_id, ctx.college_id, course_id)
    return {"success": True, "data": trial}


@router.get("/trials")
async def list_student_trials(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    trials = await trial_service.get_student_trials(ctx.user_id)
    return {"success": True, "data": trials}


@router.get("/courses/{course_id}/access")
async def get_course_access(course_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    access = await trial_service.check_course_access(ctx.user_id, course_id)
    return {"success": True, "data": access}


# --------------------------------------------------------------------------- Student Course Learning Content (Phases 5-8)
@router.get("/courses/{course_id}/materials")
async def get_student_course_materials(course_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Retrieves class notes, slides, and exercise documents for authorized learners."""
    from app.services.content_auth_service import authorize_course_content_access
    await authorize_course_content_access(ctx, course_id, resource_type="materials")
    from app.repositories.learning_content_repo import LearningContentRepository
    materials = await LearningContentRepository.get_course_materials(course_id, published_only=True)
    out = [
        {
            "id": str(m["id"]),
            "courseId": str(m["course_id"]),
            "title": m["title"],
            "description": m.get("description"),
            "materialType": m["material_type"],
            "fileUrl": m["file_url"],
            "fileSizeBytes": m.get("file_size_bytes", 0),
            "createdAt": m["created_at"].isoformat() if m.get("created_at") else None,
            "trainerName": m.get("trainer_name"),
        }
        for m in materials
    ]
    return {"success": True, "data": out}


@router.get("/courses/{course_id}/recordings")
async def get_student_course_recordings(course_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Retrieves class recordings for authorized learners."""
    from app.services.content_auth_service import authorize_course_content_access
    await authorize_course_content_access(ctx, course_id, resource_type="recordings")
    from app.repositories.learning_content_repo import LearningContentRepository
    recordings = await LearningContentRepository.get_course_recordings(course_id, published_only=True)
    out = [
        {
            "id": str(r["id"]),
            "courseId": str(r["course_id"]),
            "title": r["title"],
            "recordingUrl": r["recording_url"],
            "durationSeconds": r.get("duration_seconds", 0),
            "createdAt": r["created_at"].isoformat() if r.get("created_at") else None,
            "trainerName": r.get("trainer_name"),
        }
        for r in recordings
    ]
    return {"success": True, "data": out}


@router.get("/courses/{course_id}/sessions")
async def get_student_course_sessions(course_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Retrieves live class schedule. Meeting links are strictly shielded unless actively enrolled/trialing."""
    from app.services.content_auth_service import authorize_course_content_access
    has_access = False
    try:
        await authorize_course_content_access(ctx, course_id, resource_type="sessions")
        has_access = True
    except Exception:
        has_access = False

    from app.repositories.learning_content_repo import LearningContentRepository
    sessions = await LearningContentRepository.get_course_sessions(course_id, published_only=True)
    out = []
    for s in sessions:
        out.append({
            "id": str(s["id"]),
            "courseId": str(s["course_id"]),
            "topic": s["topic"],
            "date": str(s.get("session_date") or s.get("date") or "") if (s.get("session_date") or s.get("date")) else None,
            "startTime": s["starts_at"].strftime("%H:%M") if s.get("starts_at") else None,
            "endTime": s["ends_at"].strftime("%H:%M") if s.get("ends_at") else None,
            "meetingLink": s.get("meeting_link") if has_access else None,
            "meetingPassword": s.get("meeting_password") if has_access else None,
            "isLocked": not has_access,
        })
    return {"success": True, "data": out, "hasAccess": has_access}


@router.post("/courses/{course_id}/enroll", status_code=status.HTTP_201_CREATED)
async def enroll_course(course_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Enroll student in a course with database persistence."""
    if not ctx.user_id:
        raise ValidationError("Authentication required")

    student_uid = uuid.UUID(str(ctx.user_id))

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        try:
            cid = uuid.UUID(str(course_id))
        except ValueError:
            raise NotFound("Course not found")

        async with get_pg_connection() as conn:
            # 1. Verify course exists and is published
            course = await conn.fetchrow("SELECT * FROM courses WHERE id = $1 AND deleted_at IS NULL", cid)
            if not course:
                raise NotFound("Course not found")
            if not course["published"]:
                raise BusinessRuleViolation("Course is not currently published for enrollment")

            # 2. Check duplicate enrollment
            existing = await conn.fetchrow("""
                SELECT id, enrollment_status, access_status 
                FROM enrollments 
                WHERE participant_user_id = $1 AND course_id = $2 AND enrollment_status = 'ACTIVE'
            """, student_uid, cid)
            if existing:
                raise Conflict("You are already enrolled in this course")

            # 3. Retrieve student's profile details
            profile = await conn.fetchrow("""
                SELECT u.institution_id, u.department_id, sp.batch_id, sp.current_semester
                FROM users u
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                WHERE u.id = $1
            """, student_uid)

            inst_id = profile["institution_id"] if profile else None
            dept_id = profile["department_id"] if profile else None
            batch_id = profile["batch_id"] if profile else None
            semester = (profile["current_semester"] if profile and profile.get("current_semester") else 1) or 1

            # 4. Insert enrollment
            enrollment_id = uuid.uuid4()
            await conn.execute("""
                INSERT INTO enrollments (
                    id, participant_user_id, course_id, institution_id, department_id, batch_id,
                    current_semester, enrollment_status, payment_status, access_status,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, 'ACTIVE'::enrollment_status_enum, 'VERIFIED'::payment_status_enum, 'ACTIVE'::access_status_enum,
                    NOW(), NOW()
                )
            """, enrollment_id, student_uid, cid, inst_id, dept_id, batch_id, semester)

            await write_audit(ctx, action="enroll", entity_type="enrollments", entity_id=str(enrollment_id), detail=f"Enrolled in course {course['title']}")

            return {
                "success": True,
                "message": f"Successfully enrolled in {course['title']}",
                "data": {
                    "enrollmentId": str(enrollment_id),
                    "courseId": str(cid),
                    "courseTitle": course["title"],
                    "status": "ACTIVE",
                    "accessStatus": "ACTIVE",
                }
            }

    db = get_db()
    cid_oid = ObjectId(course_id)
    course = await db.courses.find_one({"_id": cid_oid, "deletedAt": None})
    if not course:
        raise NotFound("Course not found")
    if not course.get("published", True):
        raise BusinessRuleViolation("Course is not currently published for enrollment")

    existing = await db.enrollments.find_one({"studentUserId": ctx.user_id, "courseId": cid_oid, "status": "active"})
    if existing:
        raise Conflict("You are already enrolled in this course")

    doc = {
        "studentUserId": ctx.user_id,
        "courseId": cid_oid,
        "collegeId": ctx.college_id,
        "departmentId": ctx.department_id,
        "status": "active",
        "accessStatus": "active",
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    res = await db.enrollments.insert_one(doc)
    return {
        "success": True,
        "data": {
            "enrollmentId": str(res.inserted_id),
            "courseId": str(cid_oid),
            "status": "active"
        }
    }



# --------------------------------------------------------------------------- Evaluation Reports
@router.get("/evaluations/reports/latest")
async def student_get_latest_evaluation_report(ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Requirement 26: Participant views own latest complete evaluation report."""
    from app.services.evaluation_report_service import get_latest_participant_report

    report = await get_latest_participant_report(ctx, ctx.user_id)
    if not report:
        return {"success": True, "data": None, "message": "No evaluation report available yet."}
    return {"success": True, "data": report}


@router.get("/evaluations/reports/{report_id}")
async def student_get_evaluation_report(report_id: str, ctx: ScopeContext = StudentCtx) -> dict[str, Any]:
    """Requirement 26: Participant views specific evaluation report."""
    from app.services.evaluation_report_service import get_evaluation_report

    report = await get_evaluation_report(ctx, report_id)
    return {"success": True, "data": report}


