"""AI endpoints: provider health, grounded student coach, Agentic RAG chat, and EEDI Assessment evaluation."""
from __future__ import annotations

import re
from typing import Any
from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends

from app.authz.context import ScopeContext
from app.authz.guards import CurrentUser, require_role
from app.authz.roles import Role
from app.repositories.collections import AiScoreRepo, PracticeSessionRepo
from app.schemas.requests import CoachRequest
from app.services.ai_provider import get_evaluation_provider, provider_health
from app.services.chatbot_service import answer_ai_query
from app.services.roles_data import EEDI_DEFAULT_WEIGHTS, ROLES_DATABASE

router = APIRouter()


class ChatQueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1500)
    conversationId: str | None = None


class AssessmentEvaluationRequest(BaseModel):
    roleKey: str = Field("data-science-ai", max_length=60)
    questionId: str = Field("ds-q1", max_length=60)
    questionText: str = Field(..., min_length=5, max_length=1000)
    studentResponse: str = Field(..., min_length=2, max_length=5000)
    studentName: str | None = None
    customWeights: dict[str, float] | None = None


@router.get("/providers/health")
async def providers(ctx: CurrentUser) -> dict[str, Any]:
    return {"success": True, "data": provider_health()}


@router.get("/roles")
async def get_roles(ctx: CurrentUser) -> dict[str, Any]:
    """Return standard role database and default EEDI weights."""
    return {
        "success": True,
        "data": {
            "roles": ROLES_DATABASE,
            "defaultWeights": EEDI_DEFAULT_WEIGHTS,
        }
    }


@router.post("/chat")
async def ai_chat(
    payload: ChatQueryRequest, ctx: ScopeContext = Depends(require_role(Role.STUDENT, Role.TRAINER, Role.HOD, Role.ADMIN, Role.SUPER_ADMIN))
) -> dict[str, Any]:
    """Execute authenticated RAG knowledge assistant query."""
    return await answer_ai_query(ctx, payload.question, payload.conversationId)


@router.post("/assess")
async def evaluate_assessment(
    payload: AssessmentEvaluationRequest,
    ctx: ScopeContext = Depends(require_role(Role.STUDENT, Role.TRAINER, Role.HOD, Role.ADMIN, Role.SUPER_ADMIN))
) -> dict[str, Any]:
    """Evaluate candidate response using EEDI 5-parameter weighted rules and expected key points."""
    resp = payload.studentResponse.strip()
    resp_lower = resp.lower()
    q_lower = payload.questionText.lower()

    # Find expected key points if in question bank
    role = ROLES_DATABASE.get(payload.roleKey, {})
    q_bank = role.get("questionBank", [])
    matching_q = next((q for q in q_bank if q.get("id") == payload.questionId), None)

    keywords = matching_q.get("keywords", []) if matching_q else []
    expected_answer = matching_q.get("expectedAnswer", "") if matching_q else ""

    # Strict check: echo prompt or completely off-topic
    words = re.findall(r"\b\w+\b", resp_lower)
    word_count = len(words)

    is_echo = len(resp) > 20 and (resp_lower in q_lower or q_lower in resp_lower)
    
    # Check for keyword coverage
    matched_kws = [k for k in keywords if k.lower() in resp_lower]
    coverage_ratio = len(matched_kws) / max(1, len(keywords)) if keywords else 0.5

    # Check for off-topic indicators (e.g. talking about laptop shutdown, server cooking, random chatter)
    is_off_topic = False
    off_topic_reason = None

    if matching_q and matching_q.get("id") == "ds-q1":
        # Question is about supervised vs unsupervised
        if not any(k in resp_lower for k in ("supervised", "unsupervised", "label", "cluster", "learn")):
            is_off_topic = True
            off_topic_reason = "Response lacks any mention of supervised or unsupervised learning paradigms."
    elif is_echo:
        is_off_topic = True
        off_topic_reason = "Response appears to echo or rephrase the question prompt without answering."

    weights = payload.customWeights or EEDI_DEFAULT_WEIGHTS
    w_tech = weights.get("technical", 30) / 100.0
    w_prob = weights.get("problemSolving", 25) / 100.0
    w_comm = weights.get("communication", 20) / 100.0
    w_crit = weights.get("criticalThinking", 15) / 100.0
    w_prof = weights.get("professionalism", 10) / 100.0

    if is_off_topic:
        dim_scores = {
            "technical": 15,
            "problemSolving": 20,
            "communication": 45,
            "criticalThinking": 20,
            "professionalism": 70,
        }
        penalty_alert = {
            "detected": True,
            "title": "Severe Off-Topic / Echo Detected",
            "description": off_topic_reason or "The submitted response diverged substantially from the expected topic."
        }
    else:
        # Base scores calculated from keyword grounding and response depth
        base = min(96, int(60 + coverage_ratio * 35))
        dim_scores = {
            "technical": base,
            "problemSolving": max(50, min(95, base - 5 + (5 if word_count > 30 else -10))),
            "communication": max(60, min(96, 75 + (15 if word_count >= 25 else -10))),
            "criticalThinking": max(55, min(92, base - 8 + (8 if len(matched_kws) >= 3 else 0))),
            "professionalism": 92 if word_count > 15 else 75,
        }
        penalty_alert = {"detected": False, "title": "", "description": ""}

    overall = round(
        dim_scores["technical"] * w_tech
        + dim_scores["problemSolving"] * w_prob
        + dim_scores["communication"] * w_comm
        + dim_scores["criticalThinking"] * w_crit
        + dim_scores["professionalism"] * w_prof
    )

    if overall >= 85:
        verdict = ("Mastery Level: Advanced", "Strong analytical reasoning with accurate technical definitions.")
    elif overall >= 70:
        verdict = ("Mastery Level: Proficient", "Good conceptual foundation with opportunity for deeper quantification.")
    else:
        verdict = ("Mastery Level: Developing", "Requires foundational reinforcement in core concepts and terminology.")

    feedback_text = (
        f"Your response demonstrates a score of {overall}/100 based on EEDI weighted parameters. "
        f"Matched {len(matched_kws)} of {len(keywords)} core concepts. "
    )
    if matching_q and matching_q.get("conditionCorrect") and not is_off_topic:
        feedback_text += f"Key strength: {matching_q['conditionCorrect']} "
    
    next_action = "Expand with concrete quantitative benchmarks and edge case analysis to reach maximum mastery."

    return {
        "success": True,
        "data": {
            "overallScore": overall,
            "verdictTitle": verdict[0],
            "verdictDesc": verdict[1],
            "dimensionScores": dim_scores,
            "weights": weights,
            "penaltyAlert": penalty_alert,
            "matchedKeywords": matched_kws,
            "feedback": feedback_text,
            "nextAction": next_action,
        }
    }


@router.post("/coach")
async def coach(
    payload: CoachRequest, ctx: ScopeContext = Depends(require_role(Role.STUDENT))
) -> dict[str, Any]:
    """RAG-style grounding: the coach may only answer from this student's own session evidence."""
    scores = await AiScoreRepo(ctx).find_all(
        {"studentUserId": ctx.user_id}, limit=8, sort=[("createdAt", -1)]
    )
    session_ids = [s["practiceSessionId"] for s in scores]
    sessions = {
        s["_id"]: s
        for s in await PracticeSessionRepo(ctx).find_all(
            {"_id": {"$in": session_ids}}, limit=20
        )
    }

    grounding: list[dict[str, Any]] = []
    for score in scores:
        session = sessions.get(score["practiceSessionId"], {})
        for dimension in score.get("dimensions", []):
            evidence = dimension.get("evidence") or []
            span = evidence[0].get("span") if evidence else None
            if not span:
                continue
            grounding.append(
                {
                    "sessionId": str(score["practiceSessionId"]),
                    "sessionTitle": session.get("practiceModeTitle"),
                    "dimension": dimension.get("label"),
                    "score": dimension.get("score"),
                    "span": span,
                    "at": score.get("createdAt"),
                }
            )

    result = await get_evaluation_provider().coach(
        question=payload.question, grounding=grounding, student_name=ctx.name or ""
    )
    return {
        "success": True,
        "data": {
            **result,
            "evidenceCount": len(grounding),
            "notice": (
                "The AI Coach answers only from your own practice sessions. If it has no "
                "evidence for something, it will tell you rather than guess."
            ),
        },
    }
