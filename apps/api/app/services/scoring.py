"""The EEDI score engine.

Two independent signals feed one score:

* **trainer-entered** rubric parameters, grouped into the 7 pillars
* **AI-evaluated** practice dimensions, mapped onto the same pillars

The engine is deliberately *configurable* rather than opinionated — the source requirements never
specify a single formula, so nothing is invented here. Weights come from configuration, every
computation stores its inputs, its `scoringVersion` and a timestamp, and each recomputation appends
to `history` instead of overwriting. Trainer overrides of an AI result keep the original value, the
override, and the reason — which is exactly the dataset needed to improve the model later.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from bson import ObjectId

from app.core.config import settings
from app.core.logging import get_logger
from app.db.mongo import as_utc, get_db
from app.services.ai_provider import (
    FEEDBACK_TO_READINESS,
    PILLARS,
    READINESS_DIMENSIONS,
)

log = get_logger("app.scoring")

PILLAR_CODES = tuple(code for code, _ in PILLARS)
PILLAR_LABELS = dict(PILLARS)

#: Which readiness dimension contributes to which pillar (AI side of the blend).
READINESS_TO_PILLAR: dict[str, str] = {
    "verbal_fluency": "communication",
    "confidence_presentation": "confidence",
    "behaviour_professionalism": "behaviour",
    "leadership_teamwork": "leadership",
    "interview_readiness": "career_readiness",
    "professional_writing": "communication",
}

PROFICIENCY_BANDS: tuple[tuple[int, str], ...] = (
    (85, "Excellent"),
    (75, "Strong"),
    (60, "Good"),
    (50, "Average"),
    (0, "Needs Work"),
)


def band_for(score: float | None) -> str:
    if score is None:
        return "No data"
    for threshold, label in PROFICIENCY_BANDS:
        if score >= threshold:
            return label
    return "Needs Work"


def proficiency_level(score: float | None) -> str:
    """HOD proficiency distribution buckets."""
    if score is None:
        return "Beginner"
    if score >= 85:
        return "Expert"
    if score >= 70:
        return "Advanced"
    if score >= 55:
        return "Intermediate"
    return "Beginner"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _avg(values: Iterable[float]) -> float | None:
    items = [v for v in values if v is not None]
    return round(sum(items) / len(items), 2) if items else None


# --------------------------------------------------------------------------- trainer side
def pillar_scores_from_parameters(
    parameter_scores: list[dict[str, Any]], definitions: list[dict[str, Any]]
) -> dict[str, float]:
    """Roll the 95+ trainer-rated parameters up into the 7 pillars.

    Each parameter is normalised to a percentage of its own `maxScore` and averaged inside its
    pillar using the parameter's configured weight.
    """
    by_code = {d["code"]: d for d in definitions}
    buckets: dict[str, list[tuple[float, float]]] = {code: [] for code in PILLAR_CODES}
    for entry in parameter_scores:
        definition = by_code.get(entry.get("code"))
        if not definition:
            continue
        pillar = definition.get("pillar")
        if pillar not in buckets:
            continue
        max_score = float(definition.get("maxScore", 5) or 5)
        weight = float(definition.get("weight", 1) or 1)
        raw = entry.get("score")
        if raw is None:
            continue
        buckets[pillar].append((min(100.0, float(raw) / max_score * 100), weight))

    out: dict[str, float] = {}
    for pillar, entries in buckets.items():
        if not entries:
            continue
        total_weight = sum(w for _, w in entries) or 1
        out[pillar] = round(sum(v * w for v, w in entries) / total_weight, 2)
    return out


def trainer_component(pillar_scores: dict[str, float]) -> float | None:
    return _avg(pillar_scores.values())


# --------------------------------------------------------------------------- AI side
def readiness_from_ai_scores(ai_scores: list[dict[str, Any]]) -> dict[str, float]:
    """Aggregate per-attempt feedback dimensions into the weighted readiness model.

    Recent attempts count for more: the most recent attempt of a dimension carries full weight and
    older ones decay, so improvement shows up quickly without discarding history.
    """
    buckets: dict[str, list[tuple[float, float]]] = {d.code: [] for d in READINESS_DIMENSIONS}
    # `as_utc` keeps the sort total: a naive and an aware datetime cannot be compared.
    ordered = sorted(
        ai_scores, key=lambda s: as_utc(s.get("createdAt")) or _now(), reverse=True
    )
    for index, score in enumerate(ordered):
        recency = 1.0 / (1 + index * 0.35)
        for dimension in score.get("dimensions", []):
            target = FEEDBACK_TO_READINESS.get(dimension.get("code", ""))
            if not target or dimension.get("score") is None:
                continue
            buckets[target].append((float(dimension["score"]), recency))

    out: dict[str, float] = {}
    for code, entries in buckets.items():
        if entries:
            total = sum(w for _, w in entries) or 1
            out[code] = round(sum(v * w for v, w in entries) / total, 2)
    return out


def ai_component(readiness: dict[str, float]) -> float | None:
    """Weighted readiness score using the documented dimension weights (25/20/15/15/15/10)."""
    present = [(d, readiness[d.code]) for d in READINESS_DIMENSIONS if d.code in readiness]
    if not present:
        return None
    total_weight = sum(d.weight for d, _ in present)
    return round(sum(score * d.weight for d, score in present) / total_weight, 2)


def readiness_to_pillars(readiness: dict[str, float]) -> dict[str, float]:
    buckets: dict[str, list[float]] = {}
    for code, score in readiness.items():
        pillar = READINESS_TO_PILLAR.get(code)
        if pillar:
            buckets.setdefault(pillar, []).append(score)
    return {pillar: round(sum(v) / len(v), 2) for pillar, v in buckets.items() if v}


# --------------------------------------------------------------------------- blend
def blend(
    trainer: float | None, ai: float | None, *, trainer_weight: float, ai_weight: float
) -> float | None:
    """Blend whichever signals exist. A missing signal never drags the score down."""
    if trainer is None and ai is None:
        return None
    if trainer is None:
        return ai
    if ai is None:
        return trainer
    total = trainer_weight + ai_weight or 1
    return round((trainer * trainer_weight + ai * ai_weight) / total, 2)


def merge_pillars(
    trainer_pillars: dict[str, float],
    ai_pillars: dict[str, float],
    *,
    trainer_weight: float,
    ai_weight: float,
) -> dict[str, float]:
    out: dict[str, float] = {}
    for code in PILLAR_CODES:
        merged = blend(
            trainer_pillars.get(code),
            ai_pillars.get(code),
            trainer_weight=trainer_weight,
            ai_weight=ai_weight,
        )
        if merged is not None:
            out[code] = merged
    return out


# --------------------------------------------------------------------------- recomputation
async def recompute_eedi_score(student_user_id: Any, *, reason: str = "recalculation") -> dict[str, Any]:
    """Recompute and persist one student's EEDI score.

    Called from the background worker — never inline with an evaluation save, so a trainer's
    submit is never blocked on AI work (§12, §30).
    """
    db = get_db()
    student_id = ObjectId(str(student_user_id))

    profile = await db.student_profiles.find_one(
        {"userId": student_id}, {"collegeId": 1, "departmentId": 1, "batchId": 1}
    )
    if not profile:
        log.warning("recompute_skipped_no_profile", extra={"student": str(student_id)})
        return {"skipped": True, "reason": "no_student_profile"}

    definitions = await db.skill_assessment_definitions.find(
        {"collegeId": profile["collegeId"], "deletedAt": None}
    ).to_list(length=500)

    assessments = await (
        db.skill_assessments.find(
            {"studentUserId": student_id, "state": "submitted", "deletedAt": None}
        )
        .sort("createdAt", -1)
        .to_list(length=50)
    )
    trainer_pillars_all: dict[str, list[float]] = {}
    for assessment in assessments:
        pillars = assessment.get("pillarScores") or pillar_scores_from_parameters(
            assessment.get("parameterScores", []), definitions
        )
        for code, value in pillars.items():
            trainer_pillars_all.setdefault(code, []).append(float(value))
    trainer_pillars = {
        code: round(sum(v) / len(v), 2) for code, v in trainer_pillars_all.items() if v
    }

    ai_scores = await (
        db.ai_scores.find({"studentUserId": student_id}).sort("createdAt", -1).to_list(length=40)
    )
    # A trainer override replaces the AI value for scoring purposes, with the original retained.
    effective_ai: list[dict[str, Any]] = []
    for score in ai_scores:
        override = score.get("trainerOverride") or {}
        if override.get("dimensions"):
            effective_ai.append({**score, "dimensions": override["dimensions"]})
        else:
            effective_ai.append(score)

    readiness = readiness_from_ai_scores(effective_ai)
    ai_pillars = readiness_to_pillars(readiness)

    trainer_value = trainer_component(trainer_pillars)
    ai_value = ai_component(readiness)
    pillar_scores = merge_pillars(
        trainer_pillars,
        ai_pillars,
        trainer_weight=settings.EEDI_TRAINER_WEIGHT,
        ai_weight=settings.EEDI_AI_WEIGHT,
    )
    final = blend(
        trainer_value,
        ai_value,
        trainer_weight=settings.EEDI_TRAINER_WEIGHT,
        ai_weight=settings.EEDI_AI_WEIGHT,
    )

    existing = await db.eedi_scores.find_one({"studentUserId": student_id})
    previous_final = existing.get("finalScore") if existing else None
    history_entry = {
        "finalScore": final,
        "trainerComponent": trainer_value,
        "aiComponent": ai_value,
        "pillarScores": pillar_scores,
        "readiness": readiness,
        "scoringVersion": settings.SCORING_VERSION,
        "reason": reason,
        "computedAt": _now(),
        "inputs": {
            "assessmentCount": len(assessments),
            "aiScoreCount": len(ai_scores),
            "trainerWeight": settings.EEDI_TRAINER_WEIGHT,
            "aiWeight": settings.EEDI_AI_WEIGHT,
        },
    }

    document = {
        "studentUserId": student_id,
        "collegeId": profile["collegeId"],
        "departmentId": profile["departmentId"],
        "batchId": profile.get("batchId"),
        "finalScore": final,
        "previousFinalScore": previous_final,
        "delta": (round(final - previous_final, 2) if final is not None and previous_final is not None else None),
        "trainerComponent": trainer_value,
        "aiComponent": ai_value,
        "pillarScores": pillar_scores,
        "readiness": readiness,
        "strongestPillar": (
            max(pillar_scores, key=pillar_scores.get) if pillar_scores else None
        ),
        "focusPillar": (min(pillar_scores, key=pillar_scores.get) if pillar_scores else None),
        "scoringVersion": settings.SCORING_VERSION,
        "computedAt": _now(),
        "updatedAt": _now(),
    }

    await db.eedi_scores.update_one(
        {"studentUserId": student_id},
        {
            "$set": document,
            "$setOnInsert": {"createdAt": _now(), "deletedAt": None, "version": 1},
            "$push": {"history": {"$each": [history_entry], "$slice": -60}},
        },
        upsert=True,
    )
    log.info(
        "eedi_score_recomputed",
        extra={"student": str(student_id), "final": final, "reason": reason},
    )
    return document


async def refresh_recommendation(student_user_id: Any) -> dict[str, Any] | None:
    """Pick one targeted exercise for the student's weakest dimension (§10)."""
    db = get_db()
    student_id = ObjectId(str(student_user_id))
    score = await db.eedi_scores.find_one({"studentUserId": student_id})
    readiness = (score or {}).get("readiness") or {}
    if not readiness:
        return None

    weakest_code = min(readiness, key=readiness.get)
    weakest_label = next(
        (d.label for d in READINESS_DIMENSIONS if d.code == weakest_code), weakest_code
    )
    exercise = await db.exercise_library.find_one(
        {"targetDimension": weakest_code, "deletedAt": None}
    ) or await db.exercise_library.find_one({"deletedAt": None})
    if not exercise:
        return None

    profile = await db.student_profiles.find_one(
        {"userId": student_id}, {"collegeId": 1, "departmentId": 1}
    )
    document = {
        "studentUserId": student_id,
        "collegeId": (profile or {}).get("collegeId"),
        "departmentId": (profile or {}).get("departmentId"),
        "weakestDimension": weakest_code,
        "weakestDimensionLabel": weakest_label,
        "weakestScore": readiness[weakest_code],
        "exerciseId": exercise["_id"],
        "exerciseCode": exercise.get("code"),
        "exerciseTitle": exercise.get("title"),
        "practiceModeCode": exercise.get("practiceModeCode"),
        "estimatedMinutes": exercise.get("estimatedMinutes", 20),
        "xpReward": exercise.get("xpReward", 30),
        "reason": (
            f"{weakest_label} is your lowest readiness dimension at "
            f"{readiness[weakest_code]}/100 — this exercise targets it directly."
        ),
        "state": "active",
        "createdAt": _now(),
        "updatedAt": _now(),
        "deletedAt": None,
        "version": 1,
    }
    await db.recommendations.update_many(
        {"studentUserId": student_id, "state": "active"}, {"$set": {"state": "superseded"}}
    )
    await db.recommendations.insert_one(document)
    return document


async def detect_weak_pillars(
    student_user_id: Any, *, threshold: float | None = None
) -> list[dict[str, Any]]:
    """Threshold-based weak-student detection used for trainer/HOD alerts (§11)."""
    limit = threshold if threshold is not None else settings.WEAK_STUDENT_THRESHOLD
    score = await get_db().eedi_scores.find_one({"studentUserId": ObjectId(str(student_user_id))})
    pillars = (score or {}).get("pillarScores") or {}
    return [
        {
            "pillar": code,
            "pillarLabel": PILLAR_LABELS.get(code, code),
            "score": value,
            "threshold": limit,
        }
        for code, value in sorted(pillars.items(), key=lambda kv: kv[1])
        if value < limit
    ]
