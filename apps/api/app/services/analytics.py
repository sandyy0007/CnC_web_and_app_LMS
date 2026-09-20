"""Shared analytics.

Every dashboard number on every portal is produced here by a real aggregation against the
collections — nothing is hard-coded in a component (§26, §37). All functions take a
`ScopeContext` and go through the scoped repositories, so an analytics query cannot see outside
the caller's tenant.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from bson import ObjectId

from app.authz.context import ScopeContext
from app.core.config import settings
from app.db.mongo import is_inmemory
from app.repositories.collections import (
    AttendanceRepo,
    CertificateRepo,
    EnrollmentRepo,
    SkillAssessmentRepo,
    StudentProfileRepo,
    TrainerFeedbackRepo,
    TrainingSessionRepo,
    UserRepo,
)
from app.services.scoring import PILLAR_LABELS, proficiency_level

PRESENT_STATES = ("present", "late")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pct(present: int, total: int) -> float:
    return round(present / total * 100, 1) if total else 0.0


def week_bounds(weeks: int) -> datetime:
    return _now() - timedelta(weeks=weeks)


# --------------------------------------------------------------------------- attendance
ATTENDANCE_FACET = {
    "$group": {
        "_id": None,
        "total": {"$sum": 1},
        "present": {"$sum": {"$cond": [{"$in": ["$status", list(PRESENT_STATES)]}, 1, 0]}},
    }
}


async def attendance_overall(
    ctx: ScopeContext, *, filters: dict[str, Any] | None = None
) -> dict[str, Any]:
    if is_inmemory():
        repo = AttendanceRepo(ctx)
        docs = await repo.col.find(repo.scope_filter(filters), {"status": 1}).to_list(length=None)
        if not docs:
            return {"percentage": 0.0, "present": 0, "total": 0, "hasData": False}
        total = len(docs)
        present = sum(1 for d in docs if d.get("status") in PRESENT_STATES)
        return {
            "percentage": _pct(present, total),
            "present": present,
            "total": total,
            "hasData": total > 0,
        }
    rows = await AttendanceRepo(ctx).aggregate([ATTENDANCE_FACET], extra_match=filters)
    if not rows:
        return {"percentage": 0.0, "present": 0, "total": 0, "hasData": False}
    row = rows[0]
    return {
        "percentage": _pct(row["present"], row["total"]),
        "present": row["present"],
        "total": row["total"],
        "hasData": row["total"] > 0,
    }


async def attendance_by(
    ctx: ScopeContext, field: str, *, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Group attendance by any scope field — batchId, trainingModuleId, studentUserId."""
    if is_inmemory():
        repo = AttendanceRepo(ctx)
        docs = await repo.col.find(repo.scope_filter(filters), {field: 1, "status": 1}).to_list(length=None)
        groups: dict[Any, dict[str, int]] = {}
        for d in docs:
            val = d.get(field)
            if val is None:
                continue
            if val not in groups:
                groups[val] = {"total": 0, "present": 0}
            groups[val]["total"] += 1
            if d.get("status") in PRESENT_STATES:
                groups[val]["present"] += 1
        sorted_keys = sorted(groups.keys(), key=lambda k: str(k))
        return [
            {
                "key": k,
                "total": groups[k]["total"],
                "present": groups[k]["present"],
                "percentage": _pct(groups[k]["present"], groups[k]["total"]),
            }
            for k in sorted_keys
        ]
    pipeline = [
        {
            "$group": {
                "_id": f"${field}",
                "total": {"$sum": 1},
                "present": {
                    "$sum": {"$cond": [{"$in": ["$status", list(PRESENT_STATES)]}, 1, 0]}
                },
            }
        },
        {"$sort": {"_id": 1}},
    ]
    rows = await AttendanceRepo(ctx).aggregate(pipeline, extra_match=filters)
    return [
        {
            "key": row["_id"],
            "total": row["total"],
            "present": row["present"],
            "percentage": _pct(row["present"], row["total"]),
        }
        for row in rows
        if row["_id"] is not None
    ]


async def attendance_daily(
    ctx: ScopeContext, *, since: datetime, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Attendance grouped per calendar day.

    Days are the smallest portable grouping (`$isoWeek` is not available on every deployment),
    so weekly/monthly roll-ups are derived from this in Python — one query, several shapes.
    """
    if is_inmemory():
        repo = AttendanceRepo(ctx)
        extra = {"date": {"$gte": since}}
        if filters:
            extra.update(filters)
        docs = await repo.col.find(repo.scope_filter(extra), {"date": 1, "status": 1}).to_list(length=None)
        groups: dict[str, dict[str, int]] = {}
        for d in docs:
            dt = d.get("date")
            if not dt:
                continue
            day_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
            if day_str not in groups:
                groups[day_str] = {"total": 0, "present": 0}
            groups[day_str]["total"] += 1
            if d.get("status") in PRESENT_STATES:
                groups[day_str]["present"] += 1
        sorted_days = sorted(groups.keys())
        return [
            {"day": k, "total": groups[k]["total"], "present": groups[k]["present"]}
            for k in sorted_days
        ]
    pipeline = [
        {"$match": {"date": {"$gte": since}}},
        {
            "$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$date"}},
                "total": {"$sum": 1},
                "present": {
                    "$sum": {"$cond": [{"$in": ["$status", list(PRESENT_STATES)]}, 1, 0]}
                },
            }
        },
        {"$sort": {"_id": 1}},
    ]
    rows = await AttendanceRepo(ctx).aggregate(pipeline, extra_match=filters)
    return [
        {"day": row["_id"], "total": row["total"], "present": row["present"]}
        for row in rows
        if row["_id"]
    ]


async def attendance_trend(
    ctx: ScopeContext, *, weeks: int = 8, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Weekly attendance percentage.

    A week with no scheduled session is reported with `hasSession: false` rather than 0% —
    missing sessions are excluded from the denominator, never counted as absence (SRS §9).
    """
    since = week_bounds(weeks)
    daily = await attendance_daily(ctx, since=since, filters=filters)
    start = since.date()
    buckets: list[dict[str, int]] = [{"total": 0, "present": 0} for _ in range(weeks)]
    for row in daily:
        day = date.fromisoformat(row["day"])
        index = min(weeks - 1, max(0, (day - start).days // 7))
        buckets[index]["total"] += row["total"]
        buckets[index]["present"] += row["present"]

    out: list[dict[str, Any]] = []
    for index, bucket in enumerate(buckets):
        out.append(
            {
                "label": f"W{index + 1}",
                "weekStart": (start + timedelta(days=index * 7)).isoformat(),
                "percentage": _pct(bucket["present"], bucket["total"]),
                "sessions": bucket["total"],
                "hasSession": bucket["total"] > 0,
            }
        )
    return out


async def attendance_monthly_trend(
    ctx: ScopeContext, *, months: int = 6, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    since = _now() - timedelta(days=months * 31)
    pipeline = [
        {"$match": {"date": {"$gte": since}}},
        {
            "$group": {
                "_id": {"y": {"$year": "$date"}, "m": {"$month": "$date"}},
                "total": {"$sum": 1},
                "present": {
                    "$sum": {"$cond": [{"$in": ["$status", list(PRESENT_STATES)]}, 1, 0]}
                },
                "first": {"$min": "$date"},
            }
        },
        {"$sort": {"first": 1}},
    ]
    rows = await AttendanceRepo(ctx).aggregate(pipeline, extra_match=filters)
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return [
        {
            "label": names[row["_id"]["m"] - 1],
            "percentage": _pct(row["present"], row["total"]),
            "sessions": row["total"],
        }
        for row in rows
    ]


async def student_attendance_map(
    ctx: ScopeContext, *, filters: dict[str, Any] | None = None
) -> dict[ObjectId, dict[str, Any]]:
    rows = await attendance_by(ctx, "studentUserId", filters=filters)
    return {
        row["key"]: {
            "percentage": row["percentage"],
            "present": row["present"],
            "total": row["total"],
        }
        for row in rows
    }


async def attendance_defaulters(
    ctx: ScopeContext,
    *,
    threshold: float | None = None,
    filters: dict[str, Any] | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """Auto-flag participants below the configured threshold (FR-06)."""
    limit_pct = threshold if threshold is not None else settings.ATTENDANCE_DEFAULTER_THRESHOLD
    per_student = await attendance_by(ctx, "studentUserId", filters=filters)
    flagged = [r for r in per_student if r["total"] > 0 and r["percentage"] < limit_pct]
    flagged.sort(key=lambda r: r["percentage"])
    flagged = flagged[:limit]
    if not flagged:
        return []

    profiles = await StudentProfileRepo(ctx).find_all(
        {"userId": {"$in": [r["key"] for r in flagged]}},
        projection={"userId": 1, "name": 1, "rollNumber": 1, "batchId": 1, "batchName": 1},
    )
    by_user = {p["userId"]: p for p in profiles}
    out = []
    for row in flagged:
        profile = by_user.get(row["key"])
        if not profile:
            continue
        out.append(
            {
                "studentUserId": row["key"],
                "name": profile.get("name"),
                "rollNumber": profile.get("rollNumber"),
                "batchId": profile.get("batchId"),
                "batchName": profile.get("batchName"),
                "attendancePct": row["percentage"],
                "sessionsAttended": row["present"],
                "sessionsTotal": row["total"],
                "threshold": limit_pct,
            }
        )
    return out


async def sessions_without_attendance(
    ctx: ScopeContext, *, filters: dict[str, Any] | None = None
) -> int:
    """Sessions with no attendance recorded — surfaced, and excluded from the denominator."""
    sessions = await TrainingSessionRepo(ctx).find_all(
        filters, projection={"_id": 1}, limit=5000
    )
    if not sessions:
        return 0
    session_ids = [s["_id"] for s in sessions]
    recorded = await AttendanceRepo(ctx).distinct("trainingSessionId", {"trainingSessionId": {"$in": session_ids}})
    return max(0, len(session_ids) - len(set(recorded)))


# --------------------------------------------------------------------------- assessments
async def assessment_summary(
    ctx: ScopeContext, *, filters: dict[str, Any] | None = None
) -> dict[str, Any]:
    if is_inmemory():
        repo = SkillAssessmentRepo(ctx)
        match = {"state": "submitted", **(filters or {})}
        docs = await repo.col.find(repo.scope_filter(match), {"totalScore": 1}).to_list(length=None)
        if not docs:
            return {"average": None, "count": 0, "hasData": False}
        scores = [d["totalScore"] for d in docs if d.get("totalScore") is not None]
        if not scores:
            return {"average": None, "count": 0, "hasData": False}
        return {
            "average": round(sum(scores) / len(scores), 1),
            "count": len(scores),
            "min": min(scores),
            "max": max(scores),
            "hasData": True,
        }
    match = {"state": "submitted", **(filters or {})}
    rows = await SkillAssessmentRepo(ctx).aggregate(
        [
            {
                "$group": {
                    "_id": None,
                    "avg": {"$avg": "$totalScore"},
                    "count": {"$sum": 1},
                    "min": {"$min": "$totalScore"},
                    "max": {"$max": "$totalScore"},
                }
            }
        ],
        extra_match=match,
    )
    if not rows or not rows[0].get("count"):
        return {"average": None, "count": 0, "hasData": False}
    row = rows[0]
    return {
        "average": round(row["avg"], 1) if row.get("avg") is not None else None,
        "count": row["count"],
        "min": row.get("min"),
        "max": row.get("max"),
        "hasData": True,
    }


async def assessment_by_module(
    ctx: ScopeContext, *, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    if is_inmemory():
        repo = SkillAssessmentRepo(ctx)
        match = {"state": "submitted", **(filters or {})}
        docs = await repo.col.find(repo.scope_filter(match), {"trainingModuleName": 1, "totalScore": 1}).to_list(length=None)
        groups: dict[str, list[float]] = {}
        for d in docs:
            mod = d.get("trainingModuleName") or "Unassigned"
            if mod not in groups:
                groups[mod] = []
            if d.get("totalScore") is not None:
                groups[mod].append(d["totalScore"])
        sorted_mods = sorted(groups.keys())
        return [
            {
                "module": m,
                "average": round(sum(groups[m]) / len(groups[m]), 1) if groups[m] else 0,
                "count": len(groups[m]),
            }
            for m in sorted_mods
        ]
    match = {"state": "submitted", **(filters or {})}
    rows = await SkillAssessmentRepo(ctx).aggregate(
        [
            {
                "$group": {
                    "_id": "$trainingModuleName",
                    "avg": {"$avg": "$totalScore"},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ],
        extra_match=match,
    )
    return [
        {
            "module": row["_id"] or "Unassigned",
            "average": round(row["avg"], 1) if row.get("avg") is not None else 0,
            "count": row["count"],
        }
        for row in rows
    ]


async def assessment_by_batch(
    ctx: ScopeContext, *, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    match = {"state": "submitted", **(filters or {})}
    rows = await SkillAssessmentRepo(ctx).aggregate(
        [
            {
                "$group": {
                    "_id": {"id": "$batchId", "name": "$batchName"},
                    "avg": {"$avg": "$totalScore"},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id.name": 1}},
        ],
        extra_match=match,
    )
    return [
        {
            "batchId": str(row["_id"].get("id")) if row["_id"].get("id") else None,
            "batch": row["_id"].get("name") or "Unassigned",
            "average": round(row["avg"], 1) if row.get("avg") is not None else 0,
            "count": row["count"],
        }
        for row in rows
    ]


async def rubric_breakdown(
    ctx: ScopeContext, *, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Average score per rubric criterion, module-wise (HOD Skill Assessment screen)."""
    match = {"state": "submitted", **(filters or {})}
    rows = await SkillAssessmentRepo(ctx).aggregate(
        [
            {"$unwind": "$rubricScores"},
            {
                "$group": {
                    "_id": "$rubricScores.criterion",
                    "avg": {"$avg": "$rubricScores.score"},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ],
        extra_match=match,
    )
    return [
        {
            "criterion": row["_id"],
            "average": round(row["avg"], 1) if row.get("avg") is not None else 0,
            "count": row["count"],
        }
        for row in rows
    ]


async def proficiency_distribution(
    ctx: ScopeContext, *, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Expert / Advanced / Intermediate / Beginner split per rubric criterion."""
    match = {"state": "submitted", **(filters or {})}
    rows = await SkillAssessmentRepo(ctx).aggregate(
        [{"$unwind": "$rubricScores"}, {"$project": {"criterion": "$rubricScores.criterion", "score": "$rubricScores.score"}}],
        extra_match=match,
    )
    buckets: dict[str, dict[str, int]] = {}
    for row in rows:
        criterion = row.get("criterion") or "Unknown"
        level = proficiency_level(row.get("score"))
        bucket = buckets.setdefault(
            criterion, {"Expert": 0, "Advanced": 0, "Intermediate": 0, "Beginner": 0}
        )
        bucket[level] += 1
    return [
        {"criterion": criterion, **counts, "total": sum(counts.values())}
        for criterion, counts in sorted(buckets.items())
    ]


# --------------------------------------------------------------------------- participants
async def participant_counts(ctx: ScopeContext) -> dict[str, Any]:
    repo = StudentProfileRepo(ctx)
    total = await repo.count()
    month_start = _now() - timedelta(days=30)
    added = await repo.count({"createdAt": {"$gte": month_start}})
    return {"total": total, "addedThisMonth": added}


async def trainer_counts(ctx: ScopeContext) -> dict[str, Any]:
    from app.authz.roles import Role

    repo = UserRepo(ctx)
    active = await repo.count({"role": str(Role.TRAINER), "status": "active"})
    return {"total": active}


async def enrollment_status_counts(ctx: ScopeContext) -> dict[str, int]:
    rows = await EnrollmentRepo(ctx).aggregate(
        [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    )
    counts = {row["_id"]: row["count"] for row in rows if row["_id"]}
    for state in ("active", "on_hold", "completed", "dropped", "transferred"):
        counts.setdefault(state, 0)
    return counts


async def certificate_counts(ctx: ScopeContext) -> dict[str, int]:
    rows = await CertificateRepo(ctx).aggregate(
        [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    )
    counts = {row["_id"]: row["count"] for row in rows if row["_id"]}
    for state in ("issued", "pending", "revoked", "not_eligible"):
        counts.setdefault(state, 0)
    return counts


async def feedback_summary(ctx: ScopeContext) -> dict[str, Any]:
    rows = await TrainerFeedbackRepo(ctx).aggregate(
        [{"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}}]
    )
    if not rows or not rows[0].get("count"):
        return {"average": None, "count": 0}
    return {"average": round(rows[0]["avg"], 1), "count": rows[0]["count"]}


async def low_score_count(ctx: ScopeContext, *, threshold: float = 60.0) -> int:
    return await SkillAssessmentRepo(ctx).count(
        {"state": "submitted", "totalScore": {"$lt": threshold}}
    )


# --------------------------------------------------------------------------- skills
async def department_pillar_averages(ctx: ScopeContext) -> list[dict[str, Any]]:
    from app.repositories.collections import EediScoreRepo

    rows = await EediScoreRepo(ctx).find_all(projection={"pillarScores": 1}, limit=5000)
    buckets: dict[str, list[float]] = {}
    for row in rows:
        for code, value in (row.get("pillarScores") or {}).items():
            buckets.setdefault(code, []).append(float(value))
    return [
        {
            "code": code,
            "label": PILLAR_LABELS.get(code, code),
            "average": round(sum(values) / len(values), 1),
            "count": len(values),
        }
        for code, values in buckets.items()
        if values
    ]


async def average_eedi_score(ctx: ScopeContext) -> dict[str, Any]:
    from app.repositories.collections import EediScoreRepo

    rows = await EediScoreRepo(ctx).aggregate(
        [
            {
                "$group": {
                    "_id": None,
                    "avg": {"$avg": "$finalScore"},
                    "count": {"$sum": 1},
                    "prevAvg": {"$avg": "$previousFinalScore"},
                }
            }
        ]
    )
    if not rows or not rows[0].get("count"):
        return {"average": None, "count": 0, "delta": None, "hasData": False}
    row = rows[0]
    average = round(row["avg"], 1) if row.get("avg") is not None else None
    previous = round(row["prevAvg"], 1) if row.get("prevAvg") is not None else None
    return {
        "average": average,
        "count": row["count"],
        "delta": (round(average - previous, 1) if average is not None and previous else None),
        "hasData": True,
    }


async def leaderboard(
    ctx: ScopeContext, *, limit: int = 10, batch_id: Any = None
) -> list[dict[str, Any]]:
    from app.repositories.collections import EediScoreRepo, XpEventRepo

    repo = EediScoreRepo(ctx)
    # The leaderboard reads across the student's own batch/department — never wider.
    match: dict[str, Any] = {}
    if batch_id:
        match["batchId"] = ObjectId(str(batch_id))
    rows = await repo.col.find(
        {**repo.ctx.base_filter(), **match, "deletedAt": None},
        {"studentUserId": 1, "finalScore": 1},
    ).sort("finalScore", -1).to_list(length=max(limit, 200))

    if not rows:
        return []
    ids = [r["studentUserId"] for r in rows]
    profiles = await StudentProfileRepo(ctx).find_all(
        {"userId": {"$in": ids}}, projection={"userId": 1, "name": 1, "avatarColor": 1}
    )
    names = {p["userId"]: p for p in profiles}

    xp_rows = await XpEventRepo(ctx).aggregate(
        [
            {"$match": {"studentUserId": {"$in": ids}}},
            {"$group": {"_id": "$studentUserId", "xp": {"$sum": "$amount"}}},
        ]
    )
    xp = {r["_id"]: r["xp"] for r in xp_rows}

    ranked = sorted(rows, key=lambda r: (-(xp.get(r["studentUserId"], 0)), -(r.get("finalScore") or 0)))
    out = []
    for index, row in enumerate(ranked[:limit], start=1):
        profile = names.get(row["studentUserId"], {})
        out.append(
            {
                "rank": index,
                "studentUserId": row["studentUserId"],
                "name": profile.get("name", "Participant"),
                "avatarColor": profile.get("avatarColor"),
                "xp": xp.get(row["studentUserId"], 0),
                "readinessScore": row.get("finalScore"),
            }
        )
    return out


async def student_rank(ctx: ScopeContext, student_user_id: Any, *, batch_id: Any = None) -> dict[str, Any]:
    from app.repositories.collections import EediScoreRepo, XpEventRepo

    repo = EediScoreRepo(ctx)
    match: dict[str, Any] = {**repo.ctx.base_filter(), "deletedAt": None}
    match.pop("studentUserId", None)
    if batch_id:
        match["batchId"] = ObjectId(str(batch_id))
    rows = await repo.col.find(match, {"studentUserId": 1, "finalScore": 1}).to_list(length=5000)
    if not rows:
        return {"rank": None, "outOf": 0}

    ids = [r["studentUserId"] for r in rows]
    xp_rows = await XpEventRepo(ctx).col.aggregate(
        [
            {"$match": {"studentUserId": {"$in": ids}}},
            {"$group": {"_id": "$studentUserId", "xp": {"$sum": "$amount"}}},
        ]
    ).to_list(length=5000)
    xp = {r["_id"]: r["xp"] for r in xp_rows}
    ranked = sorted(rows, key=lambda r: (-(xp.get(r["studentUserId"], 0)), -(r.get("finalScore") or 0)))
    target = ObjectId(str(student_user_id))
    for index, row in enumerate(ranked, start=1):
        if row["studentUserId"] == target:
            return {"rank": index, "outOf": len(ranked)}
    return {"rank": None, "outOf": len(ranked)}
