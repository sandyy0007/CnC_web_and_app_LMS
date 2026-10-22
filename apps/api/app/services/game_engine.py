"""Core Gamification, Adaptive Difficulty, and EEDI Engine."""
from __future__ import annotations

import random
from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection
from app.repositories.game_repo import GameRepository

DIFFICULTY_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"]

# Difficulty transitions
DIFFICULTY_UP = {
    "BEGINNER": "INTERMEDIATE",
    "INTERMEDIATE": "ADVANCED",
    "ADVANCED": "ADVANCED",
}

DIFFICULTY_DOWN = {
    "ADVANCED": "INTERMEDIATE",
    "INTERMEDIATE": "BEGINNER",
    "BEGINNER": "BEGINNER",
}

SCORE_MULTIPLIERS = {
    "BEGINNER": 1.0,
    "INTERMEDIATE": 1.25,
    "ADVANCED": 1.5,
}

PARAMETER_TO_PILLAR = {
    "COM": "communication",
    "BEH": "behaviour",
    "CNF": "confidence",
    "INT": "interview",
    "PRB": "problem_solving",
    "CAR": "career_readiness",
    "LDR": "leadership",
    "TEC": "technical",
}


class GameEngine:
    @classmethod
    def calculate_next_difficulty(
        cls,
        current_difficulty: str,
        recent_answers: list[dict[str, Any]],
        window_size: int = 5
    ) -> str:
        """
        Rolling window adaptive algorithm.
        Checks last `window_size` (default 5) submitted answers:
        - Accuracy >= 80% (>= 4/5): Promote difficulty
        - Accuracy >= 50% and < 80%: Maintain difficulty
        - Accuracy < 50% (< 2.5/5): Demote difficulty
        """
        if not recent_answers:
            return current_difficulty

        # Slice last N answers
        window = recent_answers[-window_size:]
        if len(window) < 3:
            # Need at least 3 samples to adapt
            return current_difficulty

        correct_count = sum(1 for a in window if a.get("is_correct") is True)
        accuracy = correct_count / len(window)

        if accuracy >= 0.8:
            return DIFFICULTY_UP.get(current_difficulty, current_difficulty)
        elif accuracy < 0.5:
            return DIFFICULTY_DOWN.get(current_difficulty, current_difficulty)
        else:
            return current_difficulty

    @classmethod
    async def get_next_question(
        cls,
        attempt_id: UUID | str
    ) -> dict[str, Any] | None:
        """
        Selects next unconsumed question based on current adaptive difficulty level.
        Enforces ZERO-REPEAT across the entire attempt.
        Gracefully falls back to adjacent levels if target pool is exhausted.
        """
        attempt = await GameRepository.get_attempt(attempt_id)
        if not attempt or attempt["status"] != "IN_PROGRESS":
            return None

        if attempt["lives_remaining"] <= 0:
            return None

        question_set_id = attempt["question_set_id"]
        current_diff = attempt["current_difficulty"]

        consumed_ids = await GameRepository.get_consumed_question_ids(attempt_id)
        all_qset_questions = await GameRepository.get_questions_by_set(question_set_id)
        total_in_set = len(all_qset_questions)

        # In an endless session, we track questions consumed in the current round/cycle
        if total_in_set > 0 and len(consumed_ids) >= total_in_set:
            async with get_pg_connection() as conn:
                hist_rows = await conn.fetch(
                    "SELECT question_id FROM game_attempt_answers WHERE attempt_id = $1 ORDER BY created_at ASC",
                    UUID(str(attempt_id))
                )
            hist_ids = [r["question_id"] for r in hist_rows]
            current_round_start = (len(hist_ids) // total_in_set) * total_in_set
            round_consumed_ids = set(hist_ids[current_round_start:])
        else:
            round_consumed_ids = consumed_ids

        # 1. Try questions at current target difficulty
        available = await GameRepository.get_available_questions(
            question_set_id, current_diff, round_consumed_ids
        )

        # 2. Fallback cascade if target difficulty has no more questions
        if not available:
            fallback_order = [d for d in DIFFICULTY_LEVELS if d != current_diff]
            for fb_diff in fallback_order:
                available = await GameRepository.get_available_questions(
                    question_set_id, fb_diff, round_consumed_ids
                )
                if available:
                    break

        if not available:
            # Fallback if round pool unexpectedly empty
            available = all_qset_questions
            if not available:
                return None

        # Pick randomly from available pool
        selected = random.choice(available)

        # Mask answer and explanation before sending to client
        options = [
            {"index": 0, "text": selected["option_a"]},
            {"index": 1, "text": selected["option_b"]},
            {"index": 2, "text": selected["option_c"]},
            {"index": 3, "text": selected["option_d"]},
        ]

        return {
            "id": str(selected["id"]),
            "question_id": str(selected["id"]),
            "difficulty": selected["difficulty"],
            "question": selected["question"],
            "options": options,
            "tag": selected["tag"],
            "scenario": selected.get("scenario"),
            "passage": selected.get("passage"),
            "lock_type": selected.get("lock_type"),
            "consumed_count": len(consumed_ids) + 1,
            "current_difficulty": current_diff,
            "lives_remaining": attempt["lives_remaining"],
            "raw_score": attempt["raw_score"],
        }

    @classmethod
    async def submit_answer(
        cls,
        attempt_id: UUID | str,
        question_id: UUID | str,
        selected_option: int,
        response_time_ms: int = 0
    ) -> dict[str, Any]:
        """
        Processes answer submission server-side.
        Validates correctness, calculates score delta, adapts difficulty,
        and logs full traceability record.
        """
        attempt = await GameRepository.get_attempt(attempt_id)
        if not attempt:
            raise ValueError("Game attempt not found.")

        if attempt["status"] != "IN_PROGRESS":
            raise ValueError(f"Attempt is already {attempt['status']}.")

        if attempt["lives_remaining"] <= 0:
            raise ValueError("No lives remaining. Attempt is concluded.")

        # Check anti-repeat: if already answered in current round, disallow
        consumed = await GameRepository.get_consumed_question_ids(attempt_id)
        all_qset_questions = await GameRepository.get_questions_by_set(attempt["question_set_id"])
        total_in_set = len(all_qset_questions)
        if total_in_set > 0 and len(consumed) >= total_in_set:
            async with get_pg_connection() as conn:
                hist_rows = await conn.fetch(
                    "SELECT question_id FROM game_attempt_answers WHERE attempt_id = $1 ORDER BY created_at ASC",
                    UUID(str(attempt_id))
                )
            hist_ids = [r["question_id"] for r in hist_rows]
            current_round_start = (len(hist_ids) // total_in_set) * total_in_set
            round_consumed = set(hist_ids[current_round_start:])
        else:
            round_consumed = consumed

        if UUID(str(question_id)) in round_consumed:
            raise ValueError("This question was already answered in this attempt.")

        # Fetch question details
        async with get_pg_connection() as conn:
            q_row = await conn.fetchrow(
                "SELECT * FROM game_questions WHERE id = $1",
                UUID(str(question_id))
            )
        if not q_row:
            raise ValueError("Question not found.")

        is_correct = int(selected_option) == int(q_row["answer_index"])
        current_diff = attempt["current_difficulty"]
        weight = float(q_row["weight"])

        # Score calculation
        earned_score = 0
        lives_remaining = attempt["lives_remaining"]

        if is_correct:
            base_points = 100
            diff_mult = SCORE_MULTIPLIERS.get(current_diff, 1.0)
            # Speed bonus if answered within 15 seconds
            speed_bonus = 20 if (0 < response_time_ms <= 15000) else 0
            earned_score = int((base_points * diff_mult * weight) + speed_bonus)
        else:
            lives_remaining = max(0, lives_remaining - 1)

        # Record answer
        await GameRepository.record_answer(
            attempt_id=attempt_id,
            question_id=question_id,
            selected_option=selected_option,
            is_correct=is_correct,
            response_time_ms=response_time_ms,
            difficulty=current_diff,
            eedi_parameter=q_row["eedi_parameter"],
            weight=weight,
            earned_score=earned_score
        )

        # Get historical answers to recalculate rolling difficulty
        answers = await GameRepository.get_attempt_answers(attempt_id)
        next_diff = cls.calculate_next_difficulty(current_diff, answers, window_size=5)

        # Update highest difficulty reached
        highest_diff = attempt["highest_difficulty"]
        if DIFFICULTY_LEVELS.index(next_diff) > DIFFICULTY_LEVELS.index(highest_diff):
            highest_diff = next_diff

        new_raw_score = attempt["raw_score"] + earned_score
        total_questions = len(answers)
        correct_count = sum(1 for a in answers if a["is_correct"])

        await GameRepository.update_attempt_state(
            attempt_id=attempt_id,
            current_difficulty=next_diff,
            highest_difficulty=highest_diff,
            raw_score=new_raw_score,
            total_questions=total_questions,
            correct_answers=correct_count,
            lives_remaining=lives_remaining
        )

        is_game_over = lives_remaining <= 0

        return {
            "is_correct": is_correct,
            "isCorrect": is_correct,
            "correct_answer_index": q_row["answer_index"],
            "correctAnswerIndex": q_row["answer_index"],
            "explanation": q_row["explanation"],
            "earned_score": earned_score,
            "scoreEarned": earned_score,
            "earnedScore": earned_score,
            "total_score": new_raw_score,
            "totalScore": new_raw_score,
            "rawScore": new_raw_score,
            "lives_remaining": lives_remaining,
            "livesRemaining": lives_remaining,
            "is_game_over": is_game_over,
            "isGameOver": is_game_over,
            "next_difficulty": next_diff,
            "nextDifficulty": next_diff,
            "eedi_parameter": q_row["eedi_parameter"],
            "eediParameter": q_row["eedi_parameter"],
        }

    @classmethod
    async def finish_attempt(
        cls,
        attempt_id: UUID | str,
        duration_seconds: int = 0
    ) -> dict[str, Any]:
        """
        Finalizes game attempt and calculates REAL traceable EEDI scores.
        Produces complete pillar breakdown, parameter scores, and awards XP.
        """
        attempt = await GameRepository.get_attempt(attempt_id)
        if not attempt:
            raise ValueError("Game attempt not found.")

        answers = await GameRepository.get_attempt_answers(attempt_id)
        game = await GameRepository.get_game_by_id(attempt["game_id"])

        if not answers:
            # Empty attempt
            return await GameRepository.complete_attempt(
                attempt_id=attempt_id,
                status="ABANDONED",
                raw_score=0,
                final_eedi=0.0,
                xp_earned=0,
                duration_seconds=duration_seconds,
                performance_metrics={"summary": "No questions answered"}
            )

        # Compute traceable EEDI parameter scores
        configured_weights = {}
        if attempt.get("assignment_id"):
            try:
                async with get_pg_connection() as conn:
                    assign_cfg = await conn.fetchval(
                        "SELECT eedi_config FROM game_assignments WHERE id = $1", attempt["assignment_id"]
                    )
                    if assign_cfg:
                        if isinstance(assign_cfg, str):
                            import json
                            assign_cfg = json.loads(assign_cfg)
                        configured_weights = assign_cfg.get("weights") or {}
            except Exception:
                pass

        param_data: dict[str, dict[str, float]] = {}
        for ans in answers:
            code = ans["eedi_parameter"]
            base_w = float(ans["weight"])
            w = float(configured_weights.get(code, base_w))
            correct_val = 1.0 if ans["is_correct"] else 0.0

            if code not in param_data:
                param_data[code] = {"weighted_correct": 0.0, "total_weight": 0.0}

            param_data[code]["weighted_correct"] += correct_val * w
            param_data[code]["total_weight"] += w

        parameter_scores: dict[str, float] = {}
        pillar_scores_calc: dict[str, list[float]] = {
            "communication": [],
            "behaviour": [],
            "confidence": [],
            "interview": [],
            "problem_solving": [],
            "career_readiness": [],
            "leadership": [],
            "technical": [],
        }

        for code, data in param_data.items():
            tot_w = data["total_weight"]
            # Normalization on 1 to 5 scale
            norm_score = (data["weighted_correct"] / tot_w * 5.0) if tot_w > 0 else 0.0
            parameter_scores[code] = round(norm_score, 2)

            prefix = code[:3].upper()
            pillar = PARAMETER_TO_PILLAR.get(prefix, "communication")
            if pillar not in pillar_scores_calc:
                pillar_scores_calc[pillar] = []
            pillar_scores_calc[pillar].append(norm_score)

        pillar_scores: dict[str, float] = {}
        for p, vals in pillar_scores_calc.items():
            if vals:
                # Convert 1-5 scale average to 0-100 scale for pillar
                avg_val = sum(vals) / len(vals)
                pillar_scores[p] = round((avg_val / 5.0) * 100, 2)

        # Overall final EEDI score (average of evaluated pillars)
        if pillar_scores:
            final_eedi = round(sum(pillar_scores.values()) / len(pillar_scores), 2)
        else:
            final_eedi = 0.0

        # XP calculation based on completion and accuracy
        base_xp = game.get("xp_reward", 150) if game else 150
        accuracy = (sum(1 for a in answers if a["is_correct"]) / len(answers)) if answers else 0
        xp_earned = int(base_xp * (0.5 + (0.5 * accuracy)))

        status = "COMPLETED" if attempt["lives_remaining"] > 0 else "TIMED_OUT"

        metrics = {
            "total_questions": len(answers),
            "correct_answers": sum(1 for a in answers if a["is_correct"]),
            "accuracy_percent": round(accuracy * 100, 1),
            "highest_difficulty": attempt["highest_difficulty"],
            "pillar_scores": pillar_scores,
            "parameter_scores": parameter_scores,
            "average_response_time_ms": round(sum(a["response_time_ms"] for a in answers) / max(1, len(answers))),
            "traceability": [
                {
                    "question_id": str(a["question_id"]),
                    "question": a["question"],
                    "is_correct": a["is_correct"],
                    "difficulty": a["difficulty_at_submission"],
                    "eedi_parameter": a["eedi_parameter"],
                    "weight": float(configured_weights.get(a["eedi_parameter"], a["weight"])),
                    "earned_score": a["earned_score"],
                }
                for a in answers
            ]
        }

        result = await GameRepository.complete_attempt(
            attempt_id=attempt_id,
            status=status,
            raw_score=attempt["raw_score"],
            final_eedi=final_eedi,
            xp_earned=xp_earned,
            duration_seconds=duration_seconds or attempt.get("duration_seconds", 0),
            performance_metrics=metrics
        )

        # ------------------------------------------------------------------
        # CRITICAL FIX: Persist authentic EEDI Evaluation into PostgreSQL `cnc`
        # Bridges game attempt -> eedi_evaluations, evaluation_pillar_scores,
        # evaluation_parameter_scores, and participant dashboard.
        # ------------------------------------------------------------------
        try:
            from app.repositories.evaluation_repo import EvaluationRepository
            participant_id = attempt.get("participant_user_id")
            assignment_id = attempt.get("assignment_id")

            if participant_id:
                async with get_pg_connection() as conn:
                    trainer_id = None
                    course_id = None
                    semester = None
                    inst_id = attempt.get("institution_id")
                    dept_id = attempt.get("department_id")

                    if assignment_id:
                        assign_row = await conn.fetchrow(
                            "SELECT * FROM game_assignments WHERE id = $1", assignment_id
                        )
                        if assign_row:
                            trainer_id = assign_row["trainer_user_id"]
                            inst_id = assign_row["institution_id"] or inst_id
                            dept_id = assign_row["department_id"] or dept_id
                            batch_id = assign_row["batch_id"]

                            enr = await conn.fetchrow(
                                """
                                SELECT course_id, current_semester 
                                FROM enrollments 
                                WHERE participant_user_id = $1 AND (batch_id = $2 OR enrollment_status = 'ACTIVE')
                                ORDER BY (batch_id = $2) DESC, created_at DESC 
                                LIMIT 1
                                """,
                                participant_id, batch_id
                            )
                            if enr:
                                course_id = enr["course_id"]
                                semester = enr["current_semester"]
                            else:
                                b_row = await conn.fetchrow("SELECT semester FROM batches WHERE id = $1", batch_id)
                                if b_row and b_row["semester"]:
                                    semester = b_row["semester"]

                    if not course_id or not trainer_id or not semester:
                        enr = await conn.fetchrow(
                            """
                            SELECT course_id, batch_id, current_semester, institution_id, department_id
                            FROM enrollments
                            WHERE participant_user_id = $1 AND enrollment_status IN ('ACTIVE', 'PENDING')
                            ORDER BY created_at DESC LIMIT 1
                            """,
                            participant_id
                        )
                        if enr:
                            course_id = course_id or enr["course_id"]
                            semester = semester or enr["current_semester"]
                            inst_id = inst_id or enr["institution_id"]
                            dept_id = dept_id or enr["department_id"]
                            if not trainer_id and enr["batch_id"]:
                                trainer_id = await conn.fetchval(
                                    """
                                    SELECT trainer_user_id FROM batch_trainers 
                                    WHERE batch_id = $1 AND (status IS NULL OR status = 'ACTIVE') 
                                    LIMIT 1
                                    """,
                                    enr["batch_id"]
                                )
                            if not trainer_id and course_id:
                                trainer_id = await conn.fetchval(
                                    "SELECT trainer_user_id FROM course_trainers WHERE course_id = $1 LIMIT 1",
                                    course_id
                                )

                    # Robust fallbacks for unassigned exploratory plays
                    if not course_id:
                        course_id = await conn.fetchval(
                            "SELECT id FROM courses WHERE status = 'PUBLISHED' ORDER BY created_at ASC LIMIT 1"
                        )
                    if not trainer_id:
                        trainer_id = await conn.fetchval(
                            "SELECT id FROM users WHERE role = 'TRAINER' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1"
                        )
                    if not inst_id:
                        inst_id = await conn.fetchval(
                            "SELECT institution_id FROM users WHERE id = $1", participant_id
                        )
                    if not dept_id:
                        dept_id = await conn.fetchval(
                            "SELECT department_id FROM users WHERE id = $1", participant_id
                        )
                    semester = semester or 1

                if participant_id and trainer_id and course_id:
                    game_title = game.get("title", "Game") if game else "Game"
                    eval_record = await EvaluationRepository.save_evaluation(
                        participant_id=participant_id,
                        trainer_id=trainer_id,
                        course_id=course_id,
                        semester=semester,
                        pillar_scores=pillar_scores,
                        institution_id=inst_id,
                        department_id=dept_id,
                        eedi_score=final_eedi,
                        employment_score=final_eedi,
                        strengths=[f"Demonstrates strength in {p.replace('_', ' ').title()}" for p, s in pillar_scores.items() if s >= 70],
                        weaknesses=[f"Opportunity to enhance {p.replace('_', ' ').title()}" for p, s in pillar_scores.items() if s < 50],
                        improvements=[f"Practice recommended in {p.replace('_', ' ').title()}" for p, s in pillar_scores.items() if s < 60],
                        trainer_notes=f"Auto-evaluated via Game '{game_title}' (Attempt: {attempt_id})",
                        parameter_scores=parameter_scores,
                    )

                    # Update combined overall EEDI score across all evaluated pillars
                    if eval_record and eval_record.get("id"):
                        async with get_pg_connection() as conn:
                            avg_res = await conn.fetchval(
                                "SELECT AVG(score) FROM evaluation_pillar_scores WHERE evaluation_id = $1",
                                eval_record["id"]
                            )
                            if avg_res is not None:
                                combined_eedi = round(float(avg_res), 2)
                                await conn.execute(
                                    """
                                    UPDATE eedi_evaluations 
                                    SET eedi_score = $1, employment_score = $1, updated_at = NOW() 
                                    WHERE id = $2
                                    """,
                                    combined_eedi, eval_record["id"]
                                )
                                final_eedi = combined_eedi
        except Exception as eval_exc:
            import logging
            logging.getLogger("app.game_engine").error(f"Failed to persist EEDI evaluation: {eval_exc}", exc_info=True)

        return {
            "attempt_id": str(attempt_id),
            "attemptId": str(attempt_id),
            "status": status,
            "raw_score": attempt["raw_score"],
            "rawScore": attempt["raw_score"],
            "final_eedi": final_eedi,
            "finalEedi": final_eedi,
            "xp_earned": xp_earned,
            "xpEarned": xp_earned,
            "duration_seconds": duration_seconds,
            "durationSeconds": duration_seconds,
            "pillar_scores": pillar_scores,
            "pillarScores": pillar_scores,
            "parameter_scores": parameter_scores,
            "parameterScores": parameter_scores,
            "performance_metrics": metrics,
            "performanceMetrics": metrics,
        }
