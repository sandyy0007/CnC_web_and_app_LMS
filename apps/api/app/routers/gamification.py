"""Gamification, Adaptive Engine, Question Sets, and EEDI API Router.

Strict PostgreSQL `cnc` data layer integration.
Role-based access control: SUPER_ADMIN, TRAINER, PARTICIPANT (STUDENT).
Participant and SPOC terminology compliant.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel, Field

from app.authz.context import ScopeContext
from app.authz.guards import require_role
from app.authz.roles import Role
from app.core.errors import AppError, Conflict, NotFound, RoleForbidden, ScopeForbidden, ValidationError
from app.repositories.game_repo import GameRepository
from app.services.game_csv_service import GameCSVService
from app.services.game_engine import GameEngine
from app.db.postgres import get_pg_connection

router = APIRouter()

StudentCtx = Depends(require_role(Role.STUDENT))
TrainerCtx = Depends(require_role(Role.TRAINER, Role.SUPER_ADMIN))
SuperAdminCtx = Depends(require_role(Role.SUPER_ADMIN))
AdminCtx = Depends(require_role(Role.ADMIN, Role.SUPER_ADMIN))


# -----------------------------------------------------------------------------
# Request & Response Schemas
# -----------------------------------------------------------------------------

class AnswerSubmissionRequest(BaseModel):
    question_id: str
    selected_option: int = Field(..., ge=0, le=3)
    response_time_ms: int = Field(0, ge=0)


class FinishAttemptRequest(BaseModel):
    duration_seconds: int = Field(0, ge=0)


class GameEventRequest(BaseModel):
    event_type: str | None = None
    type: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class GameAssignmentRequest(BaseModel):
    game_id: str | None = None
    gameCode: str | None = None
    batch_id: str | None = None
    batchId: str | None = None
    batch_ids: list[str] | None = None
    batchIds: list[str] | None = None
    question_set_id: str | None = None
    questionSetId: str | None = None
    deadline: str | None = None
    dueDate: str | None = None
    max_attempts: int = Field(3, ge=1, le=20)
    notes: str | None = None
    eedi_config: dict[str, Any] | None = None
    eediConfig: dict[str, Any] | None = None


class UpdateGameStatusRequest(BaseModel):
    status: str = Field(..., description="DRAFT, UNDER_REVIEW, APPROVED, PUBLISHED, UNPUBLISHED, ARCHIVED")


class CreateGameRequest(BaseModel):
    code: str
    title: str
    description: str
    category: str = "Reading Comprehension"
    supported_parameters: list[str] = ["COM04", "COM06"]
    duration_minutes: int = 10
    xp_reward: int = 150
    config: dict[str, Any] = {}


# =============================================================================
# PARTICIPANT / STUDENT GAME RUNNER ENDPOINTS
# =============================================================================

@router.get("/student/games")
async def participant_list_games(
    category: str | None = Query(None),
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """List all PUBLISHED games along with participant's personal best scores and attempts."""
    games = await GameRepository.list_games(status="PUBLISHED", category=category)
    history = await GameRepository.get_participant_game_history(ctx.user_id, limit=50)

    # Compute best scores and attempts per game
    stats_by_game: dict[str, dict[str, Any]] = {}
    for h in history:
        gid = str(h.get("game_id"))
        if gid not in stats_by_game:
            stats_by_game[gid] = {"best_score": 0, "attempts": 0}
        stats_by_game[gid]["attempts"] += 1
        score = h.get("raw_score") or 0
        if score > stats_by_game[gid]["best_score"]:
            stats_by_game[gid]["best_score"] = score

    items = []
    for g in games:
        gid = str(g["id"])
        st = stats_by_game.get(gid, {"best_score": 0, "attempts": 0})
        # Check active assignment for participant
        assignment = await GameRepository.get_participant_assignment(ctx.user_id, g["id"])
        best_score = st["best_score"] if st["attempts"] > 0 else None
        max_att = assignment.get("max_attempts") or 3 if assignment else 3
        prog = min(100, int((st["attempts"] / max_att) * 100)) if st["attempts"] > 0 else 0
        params_list = g.get("supported_parameters") or []

        items.append({
            "id": gid,
            "code": g["code"],
            "title": g["title"],
            "description": g.get("description") or "",
            "category": g.get("category") or "General",
            "difficulty": g.get("difficulty") or "Medium",
            "version": g.get("version") or "1.0.0",
            "status": g.get("status") or "PUBLISHED",
            "durationMinutes": g.get("duration_minutes") or 10,
            "xpReward": g.get("xp_reward") or 100,
            "skills": params_list,
            "skillsTrained": params_list,
            "supportedParameters": params_list,
            "bestScore": best_score,
            "attempts": st["attempts"],
            "progressPercent": prog,
            "isAssigned": assignment is not None,
            "assignment": {
                "deadline": assignment["deadline"].isoformat() if assignment and assignment.get("deadline") else None,
                "maxAttempts": max_att,
                "notes": assignment.get("notes"),
            } if assignment else None,
            "config": g.get("config") or {},
        })

    categories = sorted(list({g.get("category") for g in games if g.get("category")}))

    # Badges for participant
    badges = []
    try:
        from app.routers.student import _earned_badges
        badges = await _earned_badges(ctx)
    except Exception:
        pass

    now = datetime.now(timezone.utc)
    ends_at = (now + timedelta(days=(6 - now.weekday()))).replace(hour=23, minute=59, second=59)

    return {
        "success": True,
        "data": {
            "games": items,
            "categories": categories,
            "totalPlayed": len(history),
            "xp": {"total": sum(h.get("xp_earned") or 0 for h in history), "level": 1, "levelFloor": 0, "levelCeiling": 500},
            "streak": {"days": 1},
            "weeklyQuest": {
                "earned": 120,
                "target": 500,
                "percent": 24.0,
                "endsAt": ends_at.isoformat(),
            },
            "badges": badges,
            "leaderboard": [],
        }
    }


@router.get("/student/games/{game_id}")
async def participant_get_game(
    game_id: str,
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Get single game metadata and active question set summary."""
    try:
        g = await GameRepository.get_game_by_id(game_id)
    except Exception:
        g = await GameRepository.get_game_by_code(game_id)

    if not g:
        raise NotFound(f"Game '{game_id}' not found.")

    if g["status"] not in ("PUBLISHED", "APPROVED") and ctx.role not in ("SUPER_ADMIN", "ADMIN"):
        raise RoleForbidden("This game is not currently published.")

    qset = await GameRepository.get_active_question_set(g["id"])
    assignment = await GameRepository.get_participant_assignment(ctx.user_id, g["id"])
    history = await GameRepository.get_participant_game_history(ctx.user_id, limit=10)
    game_history = [h for h in history if str(h["game_id"]) == str(g["id"])]

    # Dynamic indicator metadata and rubric instructions
    indicator_codes = g.get("supported_parameters") or []
    eedi_cfg = (assignment.get("eedi_config") or {}) if assignment else {}
    if isinstance(eedi_cfg, str):
        import json
        try:
            eedi_cfg = json.loads(eedi_cfg)
        except Exception:
            eedi_cfg = {}
    cfg_weights = eedi_cfg.get("weights") or {}
    cfg_rubric = eedi_cfg.get("rubric") or {
        "scale": "1-5 per question normalized to 0-100 overall",
        "description": "Adaptive rubric weighting questions by difficulty and parameter impact."
    }

    indicators = []
    async with get_pg_connection() as conn:
        if indicator_codes:
            rows = await conn.fetch(
                "SELECT code, label, pillar, description FROM evaluation_parameters WHERE code = ANY($1)",
                indicator_codes
            )
            for r in rows:
                code = r["code"]
                indicators.append({
                    "code": code,
                    "name": r["label"],
                    "label": r["label"],
                    "pillar": r["pillar"],
                    "description": r["description"],
                    "weight": float(cfg_weights.get(code, 1.0))
                })

    max_att = assignment.get("max_attempts") if assignment else 3
    dur_min = g.get("duration_minutes") or 10

    instructions = {
        "eediIndicators": indicators,
        "configuredWeights": cfg_weights,
        "scoringRubric": cfg_rubric,
        "mapping": {
            "COM": "Communication",
            "BEH": "Behaviour",
            "CNF": "Confidence",
            "INT": "Interview",
            "PRB": "Problem Solving",
            "CAR": "Career Readiness",
            "LDR": "Leadership",
            "TEC": "Technical",
        },
        "attemptRules": {
            "maxAttempts": max_att,
            "durationMinutes": dur_min,
            "lives": 3,
            "passingScore": float(eedi_cfg.get("pass_score", 60.0)),
        }
    }

    return {
        "success": True,
        "data": {
            "id": str(g["id"]),
            "code": g["code"],
            "title": g["title"],
            "description": g["description"],
            "category": g["category"],
            "version": g["version"],
            "status": g["status"],
            "durationMinutes": dur_min,
            "xpReward": g["xp_reward"],
            "skills": g["supported_parameters"],
            "config": g["config"],
            "questionSet": {
                "id": str(qset["id"]),
                "version": qset["version"],
                "totalQuestions": qset["total_questions"],
            } if qset else None,
            "isAssigned": assignment is not None,
            "assignment": assignment,
            "instructions": instructions,
            "attemptsCount": len(game_history),
            "bestScore": max([h["raw_score"] for h in game_history], default=0),
        }
    }


@router.get("/student/games/{game_id}/instructions")
async def participant_get_instructions(
    game_id: str,
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Return explicit instructions, rubric, and indicator measurement settings for a game."""
    game_res = await participant_get_game(game_id=game_id, ctx=ctx)
    return {
        "success": True,
        "data": game_res["data"]["instructions"]
    }


@router.post("/student/games/{game_id}/start")
async def participant_start_attempt(
    game_id: str,
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Initialize a game attempt, enforce assignment limits, and return the first adaptive question."""
    try:
        g = await GameRepository.get_game_by_id(game_id)
    except Exception:
        g = await GameRepository.get_game_by_code(game_id)

    if not g:
        raise NotFound(f"Game '{game_id}' not found.")

    # 1. Resolve participant assignment first
    assignment = await GameRepository.get_participant_assignment(ctx.user_id, g["id"])

    # 2. Check for an existing IN_PROGRESS attempt to resume
    past_attempts = await GameRepository.get_participant_game_history(ctx.user_id, limit=50)
    game_attempts = [a for a in past_attempts if str(a.get("game_id")) == str(g["id"])]
    in_progress = next((a for a in game_attempts if a.get("status") == "IN_PROGRESS"), None)
    if in_progress:
        qset = await GameRepository.get_question_set_by_id(in_progress["question_set_id"])
        first_question = await GameEngine.get_next_question(in_progress["id"])
        return {
            "success": True,
            "data": {
                "attemptId": str(in_progress["id"]),
                "gameId": str(g["id"]),
                "gameCode": g["code"],
                "gameTitle": g["title"],
                "questionSetId": str(qset["id"]) if qset else None,
                "livesRemaining": in_progress["lives_remaining"],
                "currentDifficulty": in_progress["current_difficulty"],
                "firstQuestion": first_question,
                "timeLimitSeconds": g.get("duration_minutes", 10) * 60,
                "config": g.get("config", {}),
            }
        }

    # 3. Check attempt limit for assignment (only completed / finalized attempts count)
    if assignment:
        matching_finished = [
            a for a in past_attempts
            if str(a.get("assignment_id")) == str(assignment["id"]) and a.get("status") in ("COMPLETED", "FAILED")
        ]
        if len(matching_finished) >= assignment["max_attempts"]:
            raise ValidationError(f"Maximum attempt limit ({assignment['max_attempts']}) reached for this assignment.")

    # 4. Authoritative question set resolution: priority to assignment.question_set_id
    qset = None
    if assignment and assignment.get("question_set_id"):
        qset = await GameRepository.get_question_set_by_id(assignment["question_set_id"])
        if not qset:
            raise NotFound("Assigned question set could not be found.")
        if str(qset["game_id"]) != str(g["id"]):
            raise ValidationError("Assigned question set does not belong to this game.")

    # Fallback to active question set if no specific question set assigned
    if not qset:
        qset = await GameRepository.get_active_question_set(g["id"])

    if not qset:
        raise ValidationError("No active or assigned question set available for this game.")

    attempt = await GameRepository.create_attempt(
        game_id=g["id"],
        question_set_id=qset["id"],
        participant_id=ctx.user_id,
        assignment_id=assignment["id"] if assignment else None,
        institution_id=ctx.college_id,
        department_id=ctx.department_id
    )

    first_question = await GameEngine.get_next_question(attempt["id"])

    return {
        "success": True,
        "data": {
            "attemptId": str(attempt["id"]),
            "gameId": str(g["id"]),
            "gameCode": g["code"],
            "gameTitle": g["title"],
            "questionSetId": str(qset["id"]),
            "livesRemaining": attempt["lives_remaining"],
            "currentDifficulty": attempt["current_difficulty"],
            "firstQuestion": first_question,
            "timeLimitSeconds": g.get("duration_minutes", 10) * 60,
            "config": g.get("config", {}),
        }
    }


@router.get("/student/games/{attempt_id}/next-question")
async def participant_next_question(
    attempt_id: str,
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Fetch next adaptive unconsumed question for this attempt."""
    attempt = await GameRepository.get_attempt(attempt_id)
    if not attempt:
        raise NotFound("Attempt not found.")

    if str(attempt["participant_user_id"]) != str(ctx.user_id) and ctx.role != "SUPER_ADMIN":
        raise RoleForbidden("Access denied to this attempt.")

    question = await GameEngine.get_next_question(attempt_id)
    return {
        "success": True,
        "data": {
            "question": question,
            "isCompleted": question is None,
            "livesRemaining": attempt["lives_remaining"],
            "rawScore": attempt["raw_score"],
            "currentDifficulty": attempt["current_difficulty"]
        }
    }


@router.post("/student/games/{attempt_id}/submit")
async def participant_submit_answer(
    attempt_id: str,
    payload: AnswerSubmissionRequest,
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Submit answer server-side, evaluate correctness, calculate score, and adapt difficulty."""
    attempt = await GameRepository.get_attempt(attempt_id)
    if not attempt:
        raise NotFound("Attempt not found.")

    if str(attempt["participant_user_id"]) != str(ctx.user_id) and ctx.role != "SUPER_ADMIN":
        raise RoleForbidden("Access denied to this attempt.")

    try:
        result = await GameEngine.submit_answer(
            attempt_id=attempt_id,
            question_id=payload.question_id,
            selected_option=payload.selected_option,
            response_time_ms=payload.response_time_ms
        )
    except ValueError as e:
        raise ValidationError(str(e))

    return {
        "success": True,
        "data": result
    }


@router.post("/student/games/{attempt_id}/finish")
async def participant_finish_attempt(
    attempt_id: str,
    payload: FinishAttemptRequest,
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Conclude attempt, calculate real traceable EEDI scores and award XP."""
    attempt = await GameRepository.get_attempt(attempt_id)
    if not attempt:
        raise NotFound("Attempt not found.")

    if str(attempt["participant_user_id"]) != str(ctx.user_id) and ctx.role != "SUPER_ADMIN":
        raise RoleForbidden("Access denied to this attempt.")

    report = await GameEngine.finish_attempt(
        attempt_id=attempt_id,
        duration_seconds=payload.duration_seconds
    )

    return {
        "success": True,
        "data": report
    }


@router.post("/student/games/{attempt_id}/event")
async def participant_record_event(
    attempt_id: str,
    payload: GameEventRequest,
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Persist a runtime game event for audit, anti-cheat, and gameplay traceability."""
    attempt = await GameRepository.get_attempt(attempt_id)
    if not attempt:
        raise NotFound("Attempt not found.")

    if str(attempt["participant_user_id"]) != str(ctx.user_id) and ctx.role != "SUPER_ADMIN":
        raise RoleForbidden("Access denied to this attempt.")

    if attempt["status"] != "IN_PROGRESS":
        raise ValidationError("Cannot log events for a concluded attempt.")

    event_type = (payload.event_type or payload.type or "").strip()
    if not event_type:
        raise ValidationError("event_type is required.")

    # Disallow overriding authoritative scores or EEDI via event payload
    event_payload = dict(payload.payload or {})
    event_payload.pop("final_eedi", None)
    event_payload.pop("raw_score", None)
    event_payload.pop("xp_earned", None)

    saved = await GameRepository.record_event(
        attempt_id=attempt_id,
        event_type=event_type,
        payload=event_payload
    )

    return {
        "success": True,
        "data": {
            "eventId": str(saved["id"]) if saved.get("id") else None,
            "eventType": event_type,
            "recorded": True
        }
    }


@router.get("/student/games/{attempt_id}/report")
async def participant_get_report(
    attempt_id: str,
    ctx: ScopeContext = StudentCtx
) -> dict[str, Any]:
    """Retrieve full traceable evaluation report for an attempt."""
    attempt = await GameRepository.get_attempt(attempt_id)
    if not attempt:
        raise NotFound("Attempt not found.")

    if str(attempt["participant_user_id"]) != str(ctx.user_id) and ctx.role not in ("SUPER_ADMIN", "TRAINER", "ADMIN"):
        raise RoleForbidden("Access denied to this attempt report.")

    answers = await GameRepository.get_attempt_answers(attempt_id)

    return {
        "success": True,
        "data": {
            "attempt": attempt,
            "answers": answers,
            "metrics": attempt.get("performance_metrics", {}),
            "finalEedi": float(attempt["final_eedi"]) if attempt.get("final_eedi") else 0.0,
            "rawScore": attempt["raw_score"],
            "xpEarned": attempt["xp_earned"],
            "status": attempt["status"],
            "completedAt": attempt["completed_at"].isoformat() if attempt.get("completed_at") else None,
        }
    }


# =============================================================================
# TRAINER QUESTION CSV WORKFLOW & ASSIGNMENT ENDPOINTS
# =============================================================================

@router.get("/trainer/games")
async def trainer_list_games(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """List games and question set status for Trainer."""
    games = await GameRepository.list_games(status="PUBLISHED")
    out = []
    for g in games:
        qset = await GameRepository.get_active_question_set(g["id"])
        params_list = g.get("supported_parameters") or []
        out.append({
            "id": str(g["id"]),
            "code": g["code"],
            "title": g["title"],
            "description": g.get("description") or "",
            "category": g.get("category") or "General",
            "version": g.get("version") or "1.0.0",
            "durationMinutes": g.get("duration_minutes") or 10,
            "xpReward": g.get("xp_reward") or 100,
            "supportedParameters": params_list,
            "skillsTrained": params_list,
            "skills": params_list,
            "active": bool(qset),
            "activeQuestionSet": {
                "id": str(qset["id"]),
                "version": qset["version"],
                "totalQuestions": qset["total_questions"],
            } if qset else None,
        })
    return {"success": True, "data": out}


@router.post("/trainer/games/validate-csv")
async def trainer_validate_csv(
    file: UploadFile = File(...),
    ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Validate question CSV file without saving to database. Provides instant row-by-row feedback."""
    content = await file.read()
    report = await GameCSVService.validate_csv(content)
    return {
        "success": True,
        "data": report
    }


@router.post("/trainer/games/{game_id}/questions/csv")
async def trainer_upload_questions_csv(
    game_id: str,
    file: UploadFile = File(...),
    title: str = Form("Trainer Uploaded Question Set"),
    description: str | None = Form(None),
    activate: bool = Form(True),
    ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Upload, server-validate, and activate question CSV for a game."""
    try:
        g = await GameRepository.get_game_by_id(game_id)
    except Exception:
        g = await GameRepository.get_game_by_code(game_id)

    if not g:
        raise NotFound(f"Game '{game_id}' not found.")

    content = await file.read()
    report = await GameCSVService.validate_csv(content)

    if not report["is_valid"]:
        raise ValidationError(
            f"CSV validation failed with {report['invalid_count']} error(s). Please review row-level errors."
        )

    # Ingest validated rows
    qset = await GameRepository.create_question_set(
        game_id=g["id"],
        trainer_id=ctx.user_id,
        institution_id=ctx.college_id,
        title=title,
        description=description,
        questions=report["valid_rows"],
        activate_immediately=activate
    )

    return {
        "success": True,
        "message": f"Successfully imported and activated {len(report['valid_rows'])} questions for {g['title']}.",
        "data": {
            "questionSetId": str(qset["id"]),
            "version": qset["version"],
            "totalQuestions": qset["total_questions"],
            "isActive": qset["is_active"]
        }
    }


@router.get("/trainer/games/{game_id}/question-sets")
async def trainer_list_question_sets(
    game_id: str,
    ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """List all question sets created for a game."""
    try:
        g = await GameRepository.get_game_by_id(game_id)
    except Exception:
        g = await GameRepository.get_game_by_code(game_id)

    if not g:
        raise NotFound(f"Game '{game_id}' not found.")

    qsets = await GameRepository.list_question_sets_for_game(g["id"])
    return {
        "success": True,
        "data": [
            {
                "id": str(qs["id"]),
                "version": qs["version"],
                "title": qs["title"],
                "description": qs["description"],
                "isActive": qs["is_active"],
                "totalQuestions": qs["total_questions"],
                "trainerName": qs.get("trainer_name"),
                "createdAt": qs["created_at"].isoformat() if qs.get("created_at") else None,
            }
            for qs in qsets
        ]
    }


@router.post("/trainer/games/assign")
async def trainer_assign_game(
    payload: GameAssignmentRequest,
    ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Assign game and active question set to one or multiple authorized participant batches."""
    from app.db.postgres import get_pg_connection

    gid = payload.game_id or payload.gameCode
    if not gid:
        raise ValidationError("game_id or gameCode is required.")
    
    target_batches = []
    if payload.batch_ids or payload.batchIds:
        target_batches = [str(b).strip() for b in (payload.batch_ids or payload.batchIds) if str(b).strip()]
    elif payload.batch_id or payload.batchId:
        target_batches = [str(payload.batch_id or payload.batchId).strip()]

    if not target_batches:
        raise ValidationError("At least one batch_id is required.")

    g = await GameRepository.get_game_by_id(gid)
    if not g:
        g = await GameRepository.get_game_by_code(gid)

    if not g:
        raise NotFound(f"Game '{gid}' not found.")

    if g.get("status") != "PUBLISHED":
        raise ValidationError("Only published games can be assigned to batches.")

    trainer_uuid = UUID(str(ctx.user_id))
    dl = payload.deadline or payload.dueDate
    dl_parsed = None
    if dl:
        try:
            dl_parsed = datetime.fromisoformat(str(dl).replace("Z", "+00:00"))
        except Exception:
            dl_parsed = None

    eedi_cfg = payload.eedi_config or payload.eediConfig or {}
    created_assignments = []

    async with get_pg_connection() as conn:
        for bid in target_batches:
            batch_uuid = UUID(str(bid))
            batch_row = await conn.fetchrow(
                "SELECT id, institution_id, department_id, status, name FROM batches WHERE id = $1 AND deleted_at IS NULL",
                batch_uuid
            )
            if not batch_row:
                raise NotFound(f"Batch '{bid}' not found.")
            if str(batch_row["status"]) != "ACTIVE":
                raise ValidationError(f"Batch '{batch_row['name']}' is not active.")

            # Check trainer assigned to this batch with active status & valid date window
            is_assigned = await conn.fetchval(
                """
                SELECT 1 FROM batch_trainers 
                WHERE batch_id = $1 AND trainer_user_id = $2
                  AND (status IS NULL OR status = 'ACTIVE')
                  AND (start_date IS NULL OR start_date <= CURRENT_DATE)
                  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
                """,
                batch_uuid, trainer_uuid
            )
            if not is_assigned and ctx.role != "SUPER_ADMIN":
                raise ScopeForbidden(f"Trainer is not actively assigned to batch '{batch_row['name']}'.")

            # Check duplicate active assignment
            existing = await conn.fetchval(
                "SELECT 1 FROM game_assignments WHERE game_id = $1 AND batch_id = $2 AND status = 'ACTIVE'",
                g["id"], batch_uuid
            )
            if existing:
                if len(target_batches) == 1:
                    raise Conflict(f"This game is already assigned to batch '{batch_row['name']}'.")
                continue

            assignment = await GameRepository.create_game_assignment(
                game_id=g["id"],
                question_set_id=payload.question_set_id or payload.questionSetId,
                trainer_id=ctx.user_id,
                institution_id=batch_row["institution_id"] or ctx.college_id,
                department_id=batch_row["department_id"] or ctx.department_id,
                batch_id=batch_uuid,
                deadline=dl_parsed,
                max_attempts=payload.max_attempts,
                notes=payload.notes,
                eedi_config=eedi_cfg
            )
            created_assignments.append({
                "id": str(assignment["id"]),
                "assignmentId": str(assignment["id"]),
                "gameId": str(g["id"]),
                "questionSetId": str(assignment["question_set_id"]) if assignment.get("question_set_id") else None,
                "batchId": str(assignment["batch_id"]),
                "batchName": batch_row["name"],
                "maxAttempts": assignment["max_attempts"],
                "notes": assignment.get("notes"),
                "eediConfig": eedi_cfg
            })

    if not created_assignments and target_batches:
        raise Conflict("All selected batches already have active assignments for this game.")

    first_item = created_assignments[0] if created_assignments else {}
    return {
        "success": True,
        "message": f"Game '{g['title']}' successfully assigned to {len(created_assignments)} batch(es).",
        "data": {
            **first_item,
            "assignments": created_assignments,
            "assignedBatchCount": len(created_assignments)
        }
    }


@router.get("/trainer/games/analytics")
async def trainer_game_analytics(
    game_id: str | None = None,
    batchId: str | None = Query(None),
    ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Aggregate analytics for Trainer."""
    analytics = await GameRepository.get_game_analytics(
        game_id=game_id,
        institution_id=ctx.college_id,
        batch_id=batchId
    )
    return {
        "success": True,
        "data": analytics
    }


# =============================================================================
# SUPER ADMIN LIFECYCLE & GOVERNANCE ENDPOINTS
# =============================================================================




@router.patch("/super-admin/games/{game_id}/status")
async def super_admin_update_status(
    game_id: str,
    payload: UpdateGameStatusRequest,
    ctx: ScopeContext = SuperAdminCtx
) -> dict[str, Any]:
    """
    Transition game lifecycle state:
    DRAFT -> UNDER_REVIEW -> APPROVED -> PUBLISHED -> UNPUBLISHED -> ARCHIVED.
    """
    allowed_statuses = {"DRAFT", "UNDER_REVIEW", "APPROVED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"}
    target_status = payload.status.upper()
    if target_status not in allowed_statuses:
        raise ValidationError(f"Invalid status '{payload.status}'. Allowed: {', '.join(allowed_statuses)}")

    try:
        g = await GameRepository.get_game_by_id(game_id)
    except Exception:
        g = await GameRepository.get_game_by_code(game_id)

    if not g:
        raise NotFound(f"Game '{game_id}' not found.")

    updated = await GameRepository.update_game_status(g["id"], target_status)

    return {
        "success": True,
        "message": f"Game '{g['title']}' status updated to {target_status}.",
        "data": {
            "id": str(updated["id"]),
            "code": updated["code"],
            "status": updated["status"]
        }
    }
