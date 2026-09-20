"""AI endpoints: provider health and the grounded student coach."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.authz.context import ScopeContext
from app.authz.guards import CurrentUser, require_role
from app.authz.roles import Role
from app.repositories.collections import AiScoreRepo, PracticeSessionRepo
from app.schemas.requests import CoachRequest
from app.services.ai_provider import get_evaluation_provider, provider_health

router = APIRouter()


@router.get("/providers/health")
async def providers(ctx: CurrentUser) -> dict[str, Any]:
    return {"success": True, "data": provider_health()}


@router.post("/coach")
async def coach(
    payload: CoachRequest, ctx: ScopeContext = Depends(require_role(Role.STUDENT))
) -> dict[str, Any]:
    """RAG-style grounding: the coach may only answer from this student's own session evidence.

    Nothing is fabricated — if there is no evidence, the coach says so rather than inventing it.
    """
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
