"""Report dataset builders.

Each builder runs real scoped queries and returns (columns, rows, title). Registering them here
means HOD, Trainer and Admin share one implementation per report — the caller's scope decides
what the rows contain.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId

from app.authz.context import ScopeContext
from app.core.config import settings
from app.repositories.collections import (
    AuditLogRepo,
    CertificateRepo,
    EnrollmentRepo,
    PracticeSessionRepo,
    SkillAssessmentRepo,
    StudentProfileRepo,
    TrainerAssignmentRepo,
    TrainerFeedbackRepo,
    TrainingSessionRepo,
    UserRepo,
)
from app.services import analytics
from app.services.reports import dataset
from app.services.scoring import PILLAR_LABELS, band_for


def _fmt(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.strftime("%d %b %Y %H:%M")
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v) for v in value)
    if isinstance(value, dict):
        return ", ".join(f"{k}={v}" for k, v in value.items())
    return value


def _date_range(filters: dict[str, Any]) -> dict[str, Any]:
    """`from`/`to` are validated: start must be ≤ end (SRS §12)."""
    from app.core.errors import ValidationError

    query: dict[str, Any] = {}
    start = filters.get("from")
    end = filters.get("to")
    parsed_start = parsed_end = None
    if start:
        parsed_start = datetime.fromisoformat(str(start)).replace(tzinfo=timezone.utc)
    if end:
        parsed_end = datetime.fromisoformat(str(end)).replace(tzinfo=timezone.utc)
    if parsed_start and parsed_end and parsed_start > parsed_end:
        raise ValidationError("The start date must be on or before the end date")
    if parsed_start:
        query["$gte"] = parsed_start
    if parsed_end:
        query["$lte"] = parsed_end + timedelta(days=1)
    return query


def _scope_filters(filters: dict[str, Any], ctx: ScopeContext) -> dict[str, Any]:
    """Caller filters are narrowed through the scope context — they can never widen it."""
    requested = {
        k: v
        for k, v in filters.items()
        if k in ("batchId", "departmentId", "trainingModuleId", "status", "enrollmentType")
        and v not in (None, "", "all")
    }
    return ctx.narrow(**requested)


# --------------------------------------------------------------------------- attendance
async def attendance_report(ctx: ScopeContext, filters: dict[str, Any]):
    scoped = _scope_filters(filters, ctx)
    extra = {k: v for k, v in scoped.items() if k in ("batchId", "trainingModuleId")}
    date_range = _date_range(filters)
    if date_range:
        extra["date"] = date_range

    per_student = await analytics.attendance_by(ctx, "studentUserId", filters=extra)
    profiles = await StudentProfileRepo(ctx).find_all(
        projection={"userId": 1, "name": 1, "rollNumber": 1, "batchName": 1, "batchId": 1}
    )
    stats = {r["key"]: r for r in per_student}

    rows: list[list[Any]] = []
    for profile in sorted(profiles, key=lambda p: str(p.get("rollNumber") or "")):
        stat = stats.get(profile["userId"], {"percentage": 0, "present": 0, "total": 0})
        rows.append(
            [
                profile.get("rollNumber"),
                profile.get("name"),
                profile.get("batchName"),
                stat["total"],
                stat["present"],
                stat["total"] - stat["present"],
                f"{stat['percentage']}%",
                "Defaulter" if stat["total"] and stat["percentage"] < settings.ATTENDANCE_DEFAULTER_THRESHOLD else "OK",
            ]
        )
    return (
        ["Roll No.", "Participant", "Batch", "Sessions", "Present", "Absent", "Attendance %", "Flag"],
        rows,
        "Session Attendance",
    )


async def defaulters_report(ctx: ScopeContext, filters: dict[str, Any]):
    threshold = float(filters.get("threshold") or settings.ATTENDANCE_DEFAULTER_THRESHOLD)
    scoped = _scope_filters(filters, ctx)
    extra = {k: v for k, v in scoped.items() if k in ("batchId", "trainingModuleId")}
    date_range = _date_range(filters)
    if date_range:
        extra["date"] = date_range
    flagged = await analytics.attendance_defaulters(ctx, threshold=threshold, filters=extra)
    rows = [
        [
            row["rollNumber"], row["name"], row["batchName"],
            f"{row['attendancePct']}%", row["sessionsAttended"], row["sessionsTotal"],
            f"below {threshold}%",
        ]
        for row in flagged
    ]
    return (
        ["Roll No.", "Participant", "Batch", "Attendance %", "Attended", "Total", "Reason"],
        rows,
        "Attendance Defaulters",
    )


# --------------------------------------------------------------------------- assessments
async def assessment_report(ctx: ScopeContext, filters: dict[str, Any]):
    scoped = _scope_filters(filters, ctx)
    extra = {k: v for k, v in scoped.items() if k in ("batchId", "trainingModuleId")}
    extra["state"] = "submitted"
    date_range = _date_range(filters)
    if date_range:
        extra["createdAt"] = date_range

    records = await SkillAssessmentRepo(ctx).find_all(extra, limit=20000)
    rows: list[list[Any]] = []
    for record in records:
        pillars = record.get("pillarScores") or {}
        rows.append(
            [
                record.get("rollNumber"),
                record.get("studentName"),
                record.get("batchName"),
                record.get("trainingModuleName"),
                record.get("semesterLabel"),
                record.get("totalScore"),
                record.get("maxScore", 100),
                band_for(record.get("totalScore")),
                _fmt({PILLAR_LABELS.get(k, k): v for k, v in pillars.items()}),
                record.get("assessedByLabel"),
                _fmt(record.get("createdAt")),
                record.get("version", 1),
            ]
        )
    return (
        ["Roll No.", "Participant", "Batch", "Module", "Semester", "Score", "Max",
         "Proficiency", "Pillar scores", "Assessed by", "Assessed at", "Version"],
        rows,
        "Skill Assessment",
    )


# --------------------------------------------------------------------------- enrollment
async def enrollment_report(ctx: ScopeContext, filters: dict[str, Any]):
    scoped = _scope_filters(filters, ctx)
    extra = {k: v for k, v in scoped.items() if k in ("batchId", "status", "enrollmentType")}
    date_range = _date_range(filters)
    if date_range:
        extra["enrolledAt"] = date_range
    records = await EnrollmentRepo(ctx).find_all(extra, limit=20000, sort=[("enrolledAt", -1)])
    rows = [
        [
            record.get("rollNumber"),
            record.get("studentName"),
            record.get("batchName"),
            record.get("enrollmentType", "").title(),
            record.get("status", "").replace("_", "-").title(),
            record.get("enrolledByLabel"),
            _fmt(record.get("enrolledAt")),
            str(record.get("previousEnrollmentId") or "—"),
        ]
        for record in records
    ]
    return (
        ["Roll No.", "Participant", "Batch", "Type", "Status", "Enrolled by",
         "Enrolled at", "Previous enrollment"],
        rows,
        "Enrollment Records",
    )


# --------------------------------------------------------------------------- certification
async def certification_report(ctx: ScopeContext, filters: dict[str, Any]):
    scoped = _scope_filters(filters, ctx)
    extra = {k: v for k, v in scoped.items() if k in ("batchId", "status")}
    records = await CertificateRepo(ctx).find_all(extra, limit=20000)
    rows = [
        [
            record.get("rollNumber"),
            record.get("studentName"),
            record.get("batchName"),
            f"{record.get('attendancePct', 0)}%",
            record.get("avgScore"),
            record.get("status", "").replace("_", " ").title(),
            _fmt(record.get("eligibilityMet")),
            record.get("reason") or "—",
            record.get("certificateNo") or "—",
            _fmt(record.get("issuedAt")),
        ]
        for record in records
    ]
    return (
        ["Roll No.", "Participant", "Batch", "Attendance", "Avg. score", "Status",
         "Eligible", "Reason (if not issued)", "Certificate no.", "Issued at"],
        rows,
        "Certification Status",
    )


# --------------------------------------------------------------------------- feedback & trainers
async def feedback_report(ctx: ScopeContext, filters: dict[str, Any]):
    extra: dict[str, Any] = {}
    date_range = _date_range(filters)
    if date_range:
        extra["createdAt"] = date_range
    records = await TrainerFeedbackRepo(ctx).find_all(extra, limit=20000)
    rows = [
        [
            record.get("studentName"),
            record.get("rollNumber"),
            record.get("sessionLabel"),
            record.get("trainingModuleName"),
            record.get("trainerName"),
            record.get("rating"),
            record.get("feedbackText"),
            _fmt(record.get("createdAt")),
        ]
        for record in records
    ]
    return (
        ["Participant", "Roll No.", "Session", "Module", "Trainer", "Rating", "Remarks", "Recorded at"],
        rows,
        "Trainer Feedback",
    )


async def trainer_report(ctx: ScopeContext, filters: dict[str, Any]):
    from app.authz.roles import Role

    trainers = await UserRepo(ctx).find_all(
        {"role": str(Role.TRAINER)}, projection={"name": 1, "email": 1, "status": 1}, limit=2000
    )
    assignments = await TrainerAssignmentRepo(ctx).find_all({"active": True}, limit=5000)
    sessions = await TrainingSessionRepo(ctx).aggregate(
        [{"$group": {"_id": "$trainerUserId", "sessions": {"$sum": 1}}}]
    )
    session_counts = {row["_id"]: row["sessions"] for row in sessions}
    feedback = await TrainerFeedbackRepo(ctx).aggregate(
        [{"$group": {"_id": "$trainerUserId", "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}}]
    )
    ratings = {row["_id"]: row for row in feedback}

    by_trainer: dict[ObjectId, list[str]] = {}
    for assignment in assignments:
        by_trainer.setdefault(assignment["trainerUserId"], []).append(
            assignment.get("trainingModuleName") or "—"
        )

    rows = []
    for trainer in trainers:
        rating = ratings.get(trainer["_id"], {})
        modules = sorted(set(by_trainer.get(trainer["_id"], [])))
        conducted = session_counts.get(trainer["_id"], 0)
        rows.append(
            [
                trainer.get("name"),
                trainer.get("email"),
                ", ".join(modules) or "—",
                conducted,
                round(rating.get("avg", 0), 1) if rating.get("avg") else "—",
                rating.get("n", 0),
                f"{round(conducted * 1.5, 1)} hrs/wk" if conducted else "0 hrs/wk",
                trainer.get("status", "").title(),
            ]
        )
    return (
        ["Trainer", "Email", "Modules assigned", "Sessions conducted", "Avg. feedback",
         "Feedback entries", "Workload", "Status"],
        rows,
        "Trainer Roster & Workload",
    )


# --------------------------------------------------------------------------- audit
async def audit_report(ctx: ScopeContext, filters: dict[str, Any]):
    extra: dict[str, Any] = {}
    date_range = _date_range(filters)
    if date_range:
        extra["at"] = date_range
    for key in ("action", "entityType"):
        if filters.get(key) and filters[key] != "all":
            extra[key] = filters[key]
    records = await AuditLogRepo(ctx).find_all(extra, limit=20000, sort=[("at", -1)])
    rows = [
        [
            _fmt(record.get("at")),
            record.get("actorLabel"),
            record.get("actorRole"),
            record.get("action"),
            record.get("entityType"),
            str(record.get("entityId") or "—"),
            record.get("detail") or "—",
        ]
        for record in records
    ]
    return (
        ["Timestamp", "Actor", "Role", "Action", "Entity", "Record ID", "Detail"],
        rows,
        "Audit Trail",
    )


# --------------------------------------------------------------------------- learning & practice
async def learning_report(ctx: ScopeContext, filters: dict[str, Any]):
    from app.repositories.collections import CourseProgressRepo, EediScoreRepo

    profiles = await StudentProfileRepo(ctx).find_all(
        projection={"userId": 1, "name": 1, "rollNumber": 1, "batchName": 1}, limit=20000
    )
    ids = [p["userId"] for p in profiles]
    progress_rows = await CourseProgressRepo(ctx).col.aggregate(
        [
            {"$match": {"studentUserId": {"$in": ids}}},
            {
                "$group": {
                    "_id": "$studentUserId",
                    "avgPercent": {"$avg": "$percent"},
                    "courses": {"$sum": 1},
                    "minutes": {"$sum": "$minutesSpent"},
                }
            },
        ]
    ).to_list(length=20000)
    progress = {row["_id"]: row for row in progress_rows}
    scores = {
        row["studentUserId"]: row
        for row in await EediScoreRepo(ctx).find_all(
            {"studentUserId": {"$in": ids}}, projection={"studentUserId": 1, "finalScore": 1}, limit=20000
        )
    }
    rows = []
    for profile in profiles:
        row = progress.get(profile["userId"], {})
        rows.append(
            [
                profile.get("rollNumber"),
                profile.get("name"),
                profile.get("batchName"),
                row.get("courses", 0),
                round(row.get("avgPercent", 0) or 0, 1),
                round((row.get("minutes", 0) or 0) / 60, 1),
                scores.get(profile["userId"], {}).get("finalScore") or "—",
            ]
        )
    return (
        ["Roll No.", "Participant", "Batch", "Courses", "Avg. completion %",
         "Learning hours", "EEDI readiness"],
        rows,
        "Learning Hours & Completion",
    )


async def practice_report(ctx: ScopeContext, filters: dict[str, Any]):
    extra: dict[str, Any] = {}
    date_range = _date_range(filters)
    if date_range:
        extra["createdAt"] = date_range
    sessions = await PracticeSessionRepo(ctx).find_all(extra, limit=20000, sort=[("createdAt", -1)])
    rows = [
        [
            session.get("studentName"),
            session.get("rollNumber"),
            session.get("practiceModeTitle"),
            session.get("kind"),
            session.get("state"),
            session.get("attemptNumber"),
            session.get("overallScore") or "—",
            _fmt(session.get("createdAt")),
            _fmt(session.get("completedAt")),
        ]
        for session in sessions
    ]
    return (
        ["Participant", "Roll No.", "Practice mode", "Type", "State", "Attempt",
         "AI score", "Started", "Completed"],
        rows,
        "Practice & AI Activity",
    )


async def prediction_report(ctx: ScopeContext, filters: dict[str, Any]):
    """At-risk participants derived from attendance + score trend, with the reason stated."""
    from app.repositories.collections import EediScoreRepo

    attendance = await analytics.student_attendance_map(ctx)
    profiles = await StudentProfileRepo(ctx).find_all(
        projection={"userId": 1, "name": 1, "rollNumber": 1, "batchName": 1}, limit=20000
    )
    scores = {
        row["studentUserId"]: row
        for row in await EediScoreRepo(ctx).find_all(
            projection={"studentUserId": 1, "finalScore": 1, "delta": 1, "focusPillar": 1}, limit=20000
        )
    }
    rows = []
    for profile in profiles:
        att = attendance.get(profile["userId"], {})
        score = scores.get(profile["userId"], {})
        reasons = []
        if att.get("percentage") is not None and att["percentage"] < settings.ATTENDANCE_DEFAULTER_THRESHOLD:
            reasons.append(f"attendance {att['percentage']}%")
        if (score.get("finalScore") or 100) < settings.CERTIFICATE_MIN_AVG_SCORE:
            reasons.append(f"readiness {score.get('finalScore')}")
        if (score.get("delta") or 0) < -3:
            reasons.append(f"trend {score.get('delta')}")
        if not reasons:
            continue
        rows.append(
            [
                profile.get("rollNumber"),
                profile.get("name"),
                profile.get("batchName"),
                att.get("percentage", 0),
                score.get("finalScore") or "—",
                score.get("delta") or "—",
                PILLAR_LABELS.get(score.get("focusPillar") or "", "—"),
                "; ".join(reasons),
                "High" if len(reasons) > 1 else "Medium",
            ]
        )
    rows.sort(key=lambda r: (r[8] != "High", r[3]))
    return (
        ["Roll No.", "Participant", "Batch", "Attendance %", "EEDI readiness", "Trend",
         "Focus pillar", "Risk reason", "Risk level"],
        rows,
        "Risk & Prediction",
    )


# --------------------------------------------------------------------------- admin-only
async def users_report(ctx: ScopeContext, filters: dict[str, Any]):
    extra: dict[str, Any] = {}
    if filters.get("role") and filters["role"] != "all":
        extra["role"] = str(filters["role"]).upper()
    if filters.get("status") and filters["status"] != "all":
        extra["status"] = filters["status"]
    users = await UserRepo(ctx).find_all(
        extra,
        projection={
            "name": 1, "email": 1, "institutionId": 1, "role": 1, "status": 1,
            "departmentName": 1, "emailVerified": 1, "lastActiveAt": 1, "createdAt": 1,
        },
        limit=50000,
    )
    rows = [
        [
            user.get("name"), user.get("email"), user.get("institutionId") or "—",
            user.get("role"), user.get("departmentName") or "—",
            user.get("status", "").title(), _fmt(user.get("emailVerified")),
            _fmt(user.get("lastActiveAt")), _fmt(user.get("createdAt")),
        ]
        for user in users
    ]
    return (
        ["Name", "Email", "Institution ID", "Role", "Department", "Status",
         "Verified", "Last active", "Created"],
        rows,
        "Users & Roles",
    )


async def system_report(ctx: ScopeContext, filters: dict[str, Any]):
    from app.repositories.collections import AiUsageRepo

    rows_raw = await AiUsageRepo(ctx).aggregate(
        [
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$at"}},
                    "calls": {"$sum": 1},
                    "tokens": {"$sum": "$tokens"},
                    "avgLatency": {"$avg": "$latencyMs"},
                    "failures": {"$sum": {"$cond": ["$failed", 1, 0]}},
                }
            },
            {"$sort": {"_id": -1}},
        ]
    )
    rows = [
        [
            row["_id"], row["calls"], row.get("tokens", 0),
            round(row.get("avgLatency") or 0), row.get("failures", 0),
        ]
        for row in rows_raw
    ]
    return (["Date", "AI calls", "Tokens", "Avg latency (ms)", "Failures"], rows, "AI & System Usage")


async def placement_report(ctx: ScopeContext, filters: dict[str, Any]):
    from app.repositories.collections import EediScoreRepo, PlacementGoalRepo

    goals = await PlacementGoalRepo(ctx).find_all(limit=20000)
    profiles = {
        p["userId"]: p
        for p in await StudentProfileRepo(ctx).find_all(
            projection={"userId": 1, "name": 1, "rollNumber": 1, "batchName": 1}, limit=20000
        )
    }
    scores = {
        s["studentUserId"]: s
        for s in await EediScoreRepo(ctx).find_all(
            projection={"studentUserId": 1, "finalScore": 1}, limit=20000
        )
    }
    rows = []
    for goal in goals:
        profile = profiles.get(goal["studentUserId"])
        if not profile:
            continue
        current = scores.get(goal["studentUserId"], {}).get("finalScore")
        target = goal.get("targetScore")
        rows.append(
            [
                profile.get("rollNumber"), profile.get("name"), profile.get("batchName"),
                goal.get("targetRole"), target, current or "—",
                (round(target - current, 1) if target and current else "—"),
                _fmt(goal.get("targetDate")),
                "On track" if current and target and current >= target * 0.9 else "Needs work",
            ]
        )
    return (
        ["Roll No.", "Participant", "Batch", "Target role", "Target score",
         "Current readiness", "Gap", "Target date", "Status"],
        rows,
        "Placement Readiness",
    )


async def student_progress_report(ctx: ScopeContext, filters: dict[str, Any]):
    """A student's own exportable progress report (§9 Progress & Insights → Export report)."""
    from app.repositories.collections import AiScoreRepo, EediScoreRepo, PracticeSessionRepo

    score = await EediScoreRepo(ctx).find_one({"studentUserId": ctx.user_id}) or {}
    sessions = await PracticeSessionRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=500, sort=[("createdAt", -1)]
    )
    ai_scores = {
        s["practiceSessionId"]: s
        for s in await AiScoreRepo(ctx).find_all({"studentUserId": ctx.user_id}, limit=500)
    }
    rows: list[list[Any]] = [
        ["EEDI readiness score", score.get("finalScore") or "—"],
        ["Trainer component", score.get("trainerComponent") or "—"],
        ["AI component", score.get("aiComponent") or "—"],
        ["Strongest pillar", PILLAR_LABELS.get(score.get("strongestPillar") or "", "—")],
        ["Focus pillar", PILLAR_LABELS.get(score.get("focusPillar") or "", "—")],
        ["Practice sessions", len(sessions)],
        ["Scoring version", score.get("scoringVersion") or settings.SCORING_VERSION],
        ["", ""],
        ["Attempt", "Score"],
    ]
    for session in sessions[:60]:
        ai = ai_scores.get(session["_id"], {})
        rows.append(
            [
                f"{session.get('practiceModeTitle')} · {_fmt(session.get('createdAt'))}",
                ai.get("overall") or "—",
            ]
        )
    return (["Metric", "Value"], rows, "My Progress Report")
