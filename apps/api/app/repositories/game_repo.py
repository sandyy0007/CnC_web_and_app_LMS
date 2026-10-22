"""Game & Adaptive Learning Engine Repository for PostgreSQL `cnc`."""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection, pg_transaction


def _safe_uuid(val: Any) -> UUID | None:
    """Safely convert any identifier (UUID, str, or MongoDB ObjectId hex) to a PostgreSQL UUID."""
    if val is None:
        return None
    if isinstance(val, UUID):
        return val
    s = str(val).strip()
    if not s:
        return None
    try:
        return UUID(s)
    except Exception:
        # If it's a 24-character hexadecimal ObjectId, pad it to 32 hex characters
        if len(s) == 24 and all(c in "0123456789abcdefABCDEF" for c in s):
            try:
                return UUID(s + "00000000")
            except Exception:
                pass
        return None


class GameRepository:
    @staticmethod
    async def list_games(status: str | None = None, category: str | None = None) -> list[dict[str, Any]]:
        """List games with optional filtering by lifecycle status and category."""
        async with get_pg_connection() as conn:
            query = "SELECT * FROM games WHERE 1=1"
            params: list[Any] = []
            if status:
                params.append(status)
                query += f" AND status = ${len(params)}::game_status_enum"
            if category and category.lower() != "all":
                params.append(category)
                query += f" AND category = ${len(params)}"
            query += " ORDER BY created_at ASC"
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def get_game_by_code(code: str) -> dict[str, Any] | None:
        """Fetch game by unique code."""
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("SELECT * FROM games WHERE code = $1", code)
            return dict(row) if row else None

    @staticmethod
    async def get_game_by_id(game_id: UUID | str) -> dict[str, Any] | None:
        """Fetch game by primary key UUID or code fallback."""
        g_uuid = _safe_uuid(game_id)
        if not g_uuid:
            return await GameRepository.get_game_by_code(str(game_id))
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("SELECT * FROM games WHERE id = $1", g_uuid)
            if row:
                return dict(row)
            return await GameRepository.get_game_by_code(str(game_id))

    @staticmethod
    async def update_game_status(game_id: UUID | str, status: str) -> dict[str, Any] | None:
        """Update game lifecycle status (DRAFT, UNDER_REVIEW, APPROVED, PUBLISHED, UNPUBLISHED, ARCHIVED)."""
        g_uuid = _safe_uuid(game_id)
        if not g_uuid:
            return None
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                UPDATE games
                SET status = $2::game_status_enum, updated_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                g_uuid, status
            )
            return dict(row) if row else None

    @staticmethod
    async def get_active_question_set(game_id: UUID | str) -> dict[str, Any] | None:
        """Get currently active question set for a game."""
        g_uuid = _safe_uuid(game_id)
        if not g_uuid:
            g = await GameRepository.get_game_by_code(str(game_id))
            if not g:
                return None
            g_uuid = g["id"]

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM game_question_sets
                WHERE game_id = $1 AND is_active = TRUE
                ORDER BY version DESC LIMIT 1
                """,
                g_uuid
            )
            return dict(row) if row else None

    @staticmethod
    async def get_question_set_by_id(question_set_id: UUID | str) -> dict[str, Any] | None:
        """Fetch question set by ID."""
        qs_uuid = _safe_uuid(question_set_id)
        if not qs_uuid:
            return None
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("SELECT * FROM game_question_sets WHERE id = $1", qs_uuid)
            return dict(row) if row else None

    @staticmethod
    async def list_question_sets_for_game(game_id: UUID | str) -> list[dict[str, Any]]:
        """List all question sets created for a game."""
        g_uuid = _safe_uuid(game_id)
        if not g_uuid:
            return []
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT qs.*, u.name as trainer_name
                FROM game_question_sets qs
                LEFT JOIN users u ON qs.trainer_user_id = u.id
                WHERE qs.game_id = $1
                ORDER BY qs.created_at DESC
                """,
                g_uuid
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def get_questions_by_set(question_set_id: UUID | str) -> list[dict[str, Any]]:
        """Fetch all questions belonging to a question set."""
        qs_uuid = _safe_uuid(question_set_id)
        if not qs_uuid:
            return []
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                "SELECT * FROM game_questions WHERE question_set_id = $1 ORDER BY created_at ASC",
                qs_uuid
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def create_question_set(
        game_id: UUID | str,
        trainer_id: UUID | str | None,
        institution_id: UUID | str | None,
        title: str,
        description: str | None,
        questions: list[dict[str, Any]],
        activate_immediately: bool = True
    ) -> dict[str, Any]:
        """Atomically create a question set and its questions."""
        async with pg_transaction() as conn:
            g_uuid = _safe_uuid(game_id)
            t_uuid = _safe_uuid(trainer_id) if trainer_id else None
            i_uuid = _safe_uuid(institution_id) if institution_id else None

            # Get next version number
            latest_version = await conn.fetchval(
                "SELECT COALESCE(MAX(version), 0) FROM game_question_sets WHERE game_id = $1",
                g_uuid
            )
            new_version = latest_version + 1

            if activate_immediately:
                await conn.execute(
                    "UPDATE game_question_sets SET is_active = FALSE WHERE game_id = $1",
                    g_uuid
                )

            qset_row = await conn.fetchrow(
                """
                INSERT INTO game_question_sets (
                    game_id, trainer_user_id, institution_id, title, description,
                    version, is_active, total_questions
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                """,
                g_uuid, t_uuid, i_uuid, title, description, new_version, activate_immediately, len(questions)
            )
            qset_id = qset_row["id"]

            for q in questions:
                diff = q.get("difficulty", "INTERMEDIATE").upper()
                if diff not in ("BEGINNER", "INTERMEDIATE", "ADVANCED"):
                    diff = "INTERMEDIATE"

                await conn.execute(
                    """
                    INSERT INTO game_questions (
                        question_set_id, difficulty, question,
                        option_a, option_b, option_c, option_d, answer_index,
                        tag, eedi_parameter, weight, explanation, scenario, passage, lock_type
                    )
                    VALUES ($1, $2::game_difficulty_enum, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    """,
                    qset_id, diff, q["question"],
                    q["option_a"], q["option_b"], q["option_c"], q["option_d"],
                    int(q["answer_index"]), q.get("tag", "General"),
                    q["eedi_parameter"], Decimal(str(q.get("weight", 1.0))),
                    q.get("explanation"), q.get("scenario"), q.get("passage"), q.get("lock_type")
                )

            return dict(qset_row)

    @staticmethod
    async def create_game_assignment(
        game_id: UUID | str,
        question_set_id: UUID | str | None,
        trainer_id: UUID | str,
        institution_id: UUID | str,
        department_id: UUID | str | None,
        batch_id: UUID | str,
        deadline: Any | None = None,
        max_attempts: int = 3,
        notes: str | None = None,
        eedi_config: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Assign game to batch with duplicate active assignment protection."""
        from app.core.errors import Conflict
        async with get_pg_connection() as conn:
            g_uuid = _safe_uuid(game_id)
            b_uuid = _safe_uuid(batch_id)
            t_uuid = _safe_uuid(trainer_id)

            # Check if active assignment already exists for this game and batch
            existing = await conn.fetchval(
                """
                SELECT id FROM game_assignments
                WHERE game_id = $1 AND batch_id = $2 AND status = 'ACTIVE'
                """,
                g_uuid, b_uuid
            )
            if existing:
                raise Conflict("This game is already assigned to this batch.")

            qs_uuid = _safe_uuid(question_set_id) if question_set_id else None
            if not qs_uuid:
                # Fallback to active set
                qs_uuid = await conn.fetchval(
                    "SELECT id FROM game_question_sets WHERE game_id = $1 AND is_active = TRUE ORDER BY version DESC LIMIT 1",
                    g_uuid
                )

            row = await conn.fetchrow(
                """
                INSERT INTO game_assignments (
                    game_id, question_set_id, trainer_user_id, institution_id,
                    department_id, batch_id, deadline, max_attempts, notes, status, eedi_config
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', $10::jsonb)
                RETURNING *
                """,
                g_uuid, qs_uuid, t_uuid, _safe_uuid(institution_id),
                _safe_uuid(department_id) if department_id else None,
                b_uuid, deadline, max_attempts, notes,
                json.dumps(eedi_config or {})
            )
            return dict(row)

    @staticmethod
    async def get_participant_assignment(participant_id: UUID | str, game_id: UUID | str) -> dict[str, Any] | None:
        """Find active assignment for participant via their enrollment batch or profile."""
        p_uuid = _safe_uuid(participant_id)
        g_uuid = _safe_uuid(game_id)
        if not p_uuid or not g_uuid:
            return None
        async with get_pg_connection() as conn:
            # 1. Direct or enrollment batch
            row = await conn.fetchrow(
                """
                SELECT ga.*
                FROM enrollments e
                JOIN game_assignments ga ON ga.batch_id = e.batch_id
                WHERE e.participant_user_id = $1 AND ga.game_id = $2
                  AND ga.status = 'ACTIVE'
                  AND (ga.deadline IS NULL OR ga.deadline > NOW())
                ORDER BY ga.created_at DESC LIMIT 1
                """,
                p_uuid, g_uuid
            )
            if row:
                return dict(row)

            # 2. Check via student_profiles
            row = await conn.fetchrow(
                """
                SELECT ga.*
                FROM student_profiles sp
                JOIN game_assignments ga ON ga.batch_id = sp.batch_id
                WHERE sp.user_id = $1 AND ga.game_id = $2
                  AND ga.status = 'ACTIVE'
                  AND (ga.deadline IS NULL OR ga.deadline > NOW())
                ORDER BY ga.created_at DESC LIMIT 1
                """,
                p_uuid, g_uuid
            )
            return dict(row) if row else None

    @staticmethod
    async def create_attempt(
        game_id: UUID | str,
        question_set_id: UUID | str,
        participant_id: UUID | str,
        assignment_id: UUID | str | None = None,
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None
    ) -> dict[str, Any]:
        """Create new attempt record."""
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO game_attempts (
                    game_id, question_set_id, participant_user_id, assignment_id,
                    institution_id, department_id, current_difficulty, highest_difficulty
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'BEGINNER', 'BEGINNER')
                RETURNING *
                """,
                _safe_uuid(game_id), _safe_uuid(question_set_id), _safe_uuid(participant_id),
                _safe_uuid(assignment_id) if assignment_id else None,
                _safe_uuid(institution_id) if institution_id else None,
                _safe_uuid(department_id) if department_id else None
            )
            return dict(row)

    @staticmethod
    async def get_attempt(attempt_id: UUID | str) -> dict[str, Any] | None:
        """Fetch attempt by ID."""
        a_uuid = _safe_uuid(attempt_id)
        if not a_uuid:
            return None
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("SELECT * FROM game_attempts WHERE id = $1", a_uuid)
            return dict(row) if row else None

    @staticmethod
    async def get_consumed_question_ids(attempt_id: UUID | str) -> set[UUID]:
        """Get set of question IDs already answered in this attempt to enforce NO-REPEAT."""
        a_uuid = _safe_uuid(attempt_id)
        if not a_uuid:
            return set()
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                "SELECT question_id FROM game_attempt_answers WHERE attempt_id = $1",
                a_uuid
            )
            return {r["question_id"] for r in rows}

    @staticmethod
    async def get_available_questions(
        question_set_id: UUID | str,
        difficulty: str,
        excluded_ids: set[UUID]
    ) -> list[dict[str, Any]]:
        """Fetch unconsumed questions for a question set and target difficulty."""
        qs_uuid = _safe_uuid(question_set_id)
        if not qs_uuid:
            return []
        async with get_pg_connection() as conn:
            if excluded_ids:
                rows = await conn.fetch(
                    """
                    SELECT * FROM game_questions
                    WHERE question_set_id = $1
                      AND difficulty = $2::game_difficulty_enum
                      AND id NOT IN (SELECT unnest($3::uuid[]))
                    ORDER BY created_at ASC
                    """,
                    qs_uuid, difficulty, list(excluded_ids)
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM game_questions
                    WHERE question_set_id = $1
                      AND difficulty = $2::game_difficulty_enum
                    ORDER BY created_at ASC
                    """,
                    qs_uuid, difficulty
                )
            return [dict(r) for r in rows]

    @staticmethod
    async def record_answer(
        attempt_id: UUID | str,
        question_id: UUID | str,
        selected_option: int,
        is_correct: bool,
        response_time_ms: int,
        difficulty: str,
        eedi_parameter: str,
        weight: float,
        earned_score: int
    ) -> dict[str, Any]:
        """Record an individual answered question in this attempt."""
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO game_attempt_answers (
                    attempt_id, question_id, selected_option, is_correct,
                    response_time_ms, difficulty_at_submission, eedi_parameter,
                    weight, earned_score
                )
                VALUES ($1, $2, $3, $4, $5, $6::game_difficulty_enum, $7, $8, $9)
                RETURNING *
                """,
                _safe_uuid(attempt_id), _safe_uuid(question_id), selected_option, is_correct,
                response_time_ms, difficulty, eedi_parameter, Decimal(str(weight)), earned_score
            )
            return dict(row)

    @staticmethod
    async def get_attempt_answers(attempt_id: UUID | str) -> list[dict[str, Any]]:
        """Get all answers for an attempt in submission order."""
        a_uuid = _safe_uuid(attempt_id)
        if not a_uuid:
            return []
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT a.*, q.question, q.explanation, q.tag, q.answer_index
                FROM game_attempt_answers a
                JOIN game_questions q ON a.question_id = q.id
                WHERE a.attempt_id = $1
                ORDER BY a.created_at ASC
                """,
                a_uuid
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def update_attempt_state(
        attempt_id: UUID | str,
        current_difficulty: str,
        highest_difficulty: str,
        raw_score: int,
        total_questions: int,
        correct_answers: int,
        lives_remaining: int
    ) -> None:
        """Update live running attempt stats."""
        a_uuid = _safe_uuid(attempt_id)
        if not a_uuid:
            return
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE game_attempts
                SET current_difficulty = $2::game_difficulty_enum,
                    highest_difficulty = $3::game_difficulty_enum,
                    raw_score = $4,
                    total_questions = $5,
                    correct_answers = $6,
                    lives_remaining = $7
                WHERE id = $1
                """,
                a_uuid, current_difficulty, highest_difficulty,
                raw_score, total_questions, correct_answers, lives_remaining
            )

    @staticmethod
    async def complete_attempt(
        attempt_id: UUID | str,
        status: str,
        raw_score: int,
        final_eedi: float,
        xp_earned: int,
        duration_seconds: int,
        performance_metrics: dict[str, Any]
    ) -> dict[str, Any]:
        """Finalize attempt with calculated EEDI, XP, and detailed metrics."""
        a_uuid = _safe_uuid(attempt_id)
        if not a_uuid:
            return {}
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                UPDATE game_attempts
                SET status = $2::game_attempt_status_enum,
                    raw_score = $3,
                    final_eedi = $4,
                    xp_earned = $5,
                    duration_seconds = $6,
                    performance_metrics = $7::jsonb,
                    completed_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                a_uuid, status, raw_score, Decimal(str(round(final_eedi, 2))),
                xp_earned, duration_seconds, json.dumps(performance_metrics)
            )
            return dict(row)

    @staticmethod
    async def get_participant_game_history(participant_id: UUID | str, limit: int = 20) -> list[dict[str, Any]]:
        """Get participant's previous game attempts."""
        p_uuid = _safe_uuid(participant_id)
        if not p_uuid:
            return []
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT ga.*, g.title as game_title, g.code as game_code, g.category
                FROM game_attempts ga
                JOIN games g ON ga.game_id = g.id
                WHERE ga.participant_user_id = $1
                ORDER BY ga.started_at DESC
                LIMIT $2
                """,
                p_uuid, limit
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def get_game_analytics(
        game_id: UUID | str | None = None,
        institution_id: UUID | str | None = None,
        batch_id: UUID | str | None = None
    ) -> dict[str, Any]:
        """Aggregate analytics across attempts for trainers and super admins."""
        g_uuid = _safe_uuid(game_id) if game_id else None
        i_uuid = _safe_uuid(institution_id) if institution_id else None
        b_uuid = _safe_uuid(batch_id) if batch_id else None

        async with get_pg_connection() as conn:
            query = """
                SELECT
                    count(*) as total_attempts,
                    count(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_attempts,
                    COALESCE(AVG(raw_score), 0) as avg_score,
                    COALESCE(AVG(final_eedi), 0) as avg_eedi,
                    COALESCE(AVG(duration_seconds), 0) as avg_duration_sec,
                    COALESCE(SUM(xp_earned), 0) as total_xp_awarded,
                    count(DISTINCT participant_user_id) as total_students_played
                FROM game_attempts ga
                WHERE 1=1
            """
            params: list[Any] = []
            if g_uuid:
                params.append(g_uuid)
                query += f" AND ga.game_id = ${len(params)}"
            if i_uuid:
                params.append(i_uuid)
                query += f" AND ga.institution_id = ${len(params)}"
            if b_uuid:
                params.append(b_uuid)
                query += f" AND ga.participant_user_id IN (SELECT user_id FROM student_profiles WHERE batch_id = ${len(params)})"

            row = await conn.fetchrow(query, *params)
            base_metrics = dict(row) if row else {}

            total_attempts = int(base_metrics.get("total_attempts", 0) or 0)
            completed_attempts = int(base_metrics.get("completed_attempts", 0) or 0)
            avg_score = float(base_metrics.get("avg_score", 0) or 0)
            avg_eedi = float(base_metrics.get("avg_eedi", 0) or 0)
            avg_duration_sec = int(base_metrics.get("avg_duration_sec", 0) or 0)
            total_xp = int(base_metrics.get("total_xp_awarded", 0) or 0)
            total_students = int(base_metrics.get("total_students_played", 0) or 0)
            completion_rate = round((completed_attempts / max(1, total_attempts)) * 100, 1)

            # Query weak skills
            weak_skills_query = """
                SELECT
                    gaa.eedi_parameter as skill,
                    COALESCE(AVG(gaa.earned_score), 0) as avg_score,
                    count(DISTINCT ga.participant_user_id) as student_count
                FROM game_attempt_answers gaa
                JOIN game_attempts ga ON gaa.attempt_id = ga.id
                WHERE 1=1
            """
            ws_params: list[Any] = []
            if g_uuid:
                ws_params.append(g_uuid)
                weak_skills_query += f" AND ga.game_id = ${len(ws_params)}"
            if i_uuid:
                ws_params.append(i_uuid)
                weak_skills_query += f" AND ga.institution_id = ${len(ws_params)}"
            if b_uuid:
                ws_params.append(b_uuid)
                weak_skills_query += f" AND ga.participant_user_id IN (SELECT user_id FROM student_profiles WHERE batch_id = ${len(ws_params)})"
            weak_skills_query += " GROUP BY gaa.eedi_parameter ORDER BY avg_score ASC LIMIT 5"
            try:
                ws_rows = await conn.fetch(weak_skills_query, *ws_params)
                weak_skills = [
                    {
                        "skill": r["skill"] or "General",
                        "avgScore": round(float(r["avg_score"] or 0), 1),
                        "studentCount": int(r["student_count"] or 0),
                    }
                    for r in ws_rows
                ]
            except Exception:
                weak_skills = []

            # Query top scorers
            top_scorers_query = """
                SELECT
                    ga.participant_user_id as student_id,
                    COALESCE(u.name, 'Participant') as student_name,
                    ga.raw_score as score,
                    g.title as game_title
                FROM game_attempts ga
                JOIN games g ON ga.game_id = g.id
                LEFT JOIN users u ON ga.participant_user_id = u.id
                WHERE ga.status = 'COMPLETED'
            """
            ts_params: list[Any] = []
            if g_uuid:
                ts_params.append(g_uuid)
                top_scorers_query += f" AND ga.game_id = ${len(ts_params)}"
            if i_uuid:
                ts_params.append(i_uuid)
                top_scorers_query += f" AND ga.institution_id = ${len(ts_params)}"
            if b_uuid:
                ts_params.append(b_uuid)
                top_scorers_query += f" AND ga.participant_user_id IN (SELECT user_id FROM student_profiles WHERE batch_id = ${len(ts_params)})"
            top_scorers_query += " ORDER BY ga.raw_score DESC, ga.completed_at DESC LIMIT 5"
            try:
                ts_rows = await conn.fetch(top_scorers_query, *ts_params)
                top_scorers = [
                    {
                        "studentId": str(r["student_id"]),
                        "studentName": r["student_name"],
                        "score": int(r["score"] or 0),
                        "gameTitle": r["game_title"],
                    }
                    for r in ts_rows
                ]
            except Exception:
                top_scorers = []

            return {
                # CamelCase fields for Next.js Trainer UI
                "totalPlays": total_attempts,
                "completedAttempts": completed_attempts,
                "totalStudentsPlayed": total_students,
                "avgScore": round(avg_score, 1),
                "completionRate": completion_rate,
                "weakSkills": weak_skills,
                "topScorers": top_scorers,
                # Snake_case fields for backend compatibility
                "total_attempts": total_attempts,
                "completed_attempts": completed_attempts,
                "avg_score": round(avg_score, 1),
                "avg_eedi": round(avg_eedi, 1),
                "avg_duration_sec": avg_duration_sec,
                "total_xp_awarded": total_xp,
            }

    @staticmethod
    async def record_event(
        attempt_id: UUID | str,
        event_type: str,
        payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Persist a validated gameplay event into game_events."""
        a_uuid = _safe_uuid(attempt_id)
        if not a_uuid:
            return {}
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO game_events (attempt_id, event_type, payload)
                VALUES ($1, $2, $3::jsonb)
                RETURNING *
                """,
                a_uuid, event_type, json.dumps(payload or {})
            )
            return dict(row) if row else {}

    @staticmethod
    async def get_attempt_events(attempt_id: UUID | str) -> list[dict[str, Any]]:
        """Fetch all events logged for an attempt in chronological order."""
        a_uuid = _safe_uuid(attempt_id)
        if not a_uuid:
            return []
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM game_events
                WHERE attempt_id = $1
                ORDER BY created_at ASC
                """,
                a_uuid
            )
            return [dict(r) for r in rows]

