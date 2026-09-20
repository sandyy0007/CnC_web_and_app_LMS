"""EEDI Evaluation and Detailed Report PostgreSQL repository."""
from __future__ import annotations

from typing import Any
from uuid import UUID
from decimal import Decimal
from app.db.postgres import get_pg_connection, pg_transaction


class EvaluationRepository:
    @staticmethod
    async def create_or_complete_evaluation(
        participant_id: UUID | str,
        trainer_id: UUID | str,
        institution_id: UUID | str | None,
        department_id: UUID | str | None,
        course_id: UUID | str,
        semester: int,
        eedi_score: float | None,
        employment_score: float | None,
        strengths: list[str],
        weaknesses: list[str],
        improvements: list[str],
        trainer_notes: str | None,
        pillar_scores: dict[str, float],
        parameter_scores: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        """Atomically inserts or updates evaluation and its dimensional pillar and parameter scores."""
        async with pg_transaction() as conn:
            inst_uuid = UUID(str(institution_id)) if institution_id else None
            dept_uuid = UUID(str(department_id)) if department_id else None
            eedi_dec = Decimal(str(round(eedi_score, 2))) if eedi_score is not None else None
            emp_dec = Decimal(str(round(employment_score, 2))) if employment_score is not None else None

            eval_row = await conn.fetchrow(
                """
                INSERT INTO eedi_evaluations (
                    participant_user_id, trainer_user_id, institution_id, department_id,
                    course_id, semester, status, eedi_score, employment_score,
                    strengths, weaknesses, improvements, trainer_notes, submitted_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, $9, $10, $11, $12, NOW())
                ON CONFLICT (participant_user_id, course_id, semester)
                DO UPDATE SET
                    trainer_user_id = EXCLUDED.trainer_user_id,
                    status = 'COMPLETED',
                    eedi_score = EXCLUDED.eedi_score,
                    employment_score = EXCLUDED.employment_score,
                    strengths = EXCLUDED.strengths,
                    weaknesses = EXCLUDED.weaknesses,
                    improvements = EXCLUDED.improvements,
                    trainer_notes = EXCLUDED.trainer_notes,
                    submitted_at = NOW()
                RETURNING id, participant_user_id, trainer_user_id, institution_id, department_id,
                          course_id, semester, status, eedi_score, employment_score,
                          strengths, weaknesses, improvements, trainer_notes, submitted_at, created_at
                """,
                UUID(str(participant_id)),
                UUID(str(trainer_id)),
                inst_uuid,
                dept_uuid,
                UUID(str(course_id)),
                semester,
                eedi_dec,
                emp_dec,
                strengths,
                weaknesses, improvements,
                trainer_notes,
            )
            eval_id = eval_row["id"]

            # Save pillar scores
            for pillar, score in pillar_scores.items():
                await conn.execute(
                    """
                    INSERT INTO evaluation_pillar_scores (evaluation_id, pillar, score, max_score, weight)
                    VALUES ($1, $2, $3, 100, 1.0)
                    ON CONFLICT (evaluation_id, pillar)
                    DO UPDATE SET score = EXCLUDED.score
                    """,
                    eval_id,
                    pillar,
                    Decimal(str(round(score, 2))),
                )

            # Save parameter scores if provided
            if parameter_scores:
                for code, score in parameter_scores.items():
                    await conn.execute(
                        """
                        INSERT INTO evaluation_parameter_scores (evaluation_id, parameter_code, score, max_score, weight)
                        VALUES ($1, $2, $3, 5.0, 1.0)
                        ON CONFLICT (evaluation_id, parameter_code)
                        DO UPDATE SET score = EXCLUDED.score
                        """,
                        eval_id,
                        code,
                        Decimal(str(round(score, 1))),
                    )

            return dict(eval_row)

    @staticmethod
    async def get_report_by_id(evaluation_id: UUID | str) -> dict[str, Any] | None:
        """Full evaluation report retrieval with participant, trainer, pillars, and parameters."""
        async with get_pg_connection() as conn:
            eval_row = await conn.fetchrow(
                """
                SELECT e.id, e.participant_user_id, e.trainer_user_id, e.institution_id, e.department_id,
                       e.course_id, e.semester, e.status, e.eedi_score, e.employment_score,
                       e.strengths, e.weaknesses, e.improvements, e.trainer_notes, e.submitted_at,
                       u_p.name as participant_name, u_p.email as participant_email,
                       sp.roll_number as participant_roll,
                       u_t.name as trainer_name,
                       c.title as course_title,
                       i.name as institution_name,
                       d.name as department_name,
                       b.name as batch_name
                FROM eedi_evaluations e
                JOIN users u_p ON u_p.id = e.participant_user_id
                LEFT JOIN student_profiles sp ON sp.user_id = e.participant_user_id
                LEFT JOIN batches b ON b.id = sp.batch_id
                JOIN users u_t ON u_t.id = e.trainer_user_id
                JOIN courses c ON c.id = e.course_id
                LEFT JOIN institutions i ON i.id = e.institution_id
                LEFT JOIN departments d ON d.id = e.department_id
                WHERE e.id = $1
                """,
                UUID(str(evaluation_id)),
            )
            if not eval_row:
                return None

            res = dict(eval_row)
            # Pillars
            pillars = await conn.fetch(
                """
                SELECT pillar, score, max_score, weight
                FROM evaluation_pillar_scores
                WHERE evaluation_id = $1
                ORDER BY pillar ASC
                """,
                res["id"],
            )
            res["pillars"] = [dict(p) for p in pillars]

            # Parameters
            params = await conn.fetch(
                """
                SELECT eps.parameter_code, eps.score, eps.max_score, eps.weight, eps.notes,
                       ep.pillar, ep.label, ep.description
                FROM evaluation_parameter_scores eps
                JOIN evaluation_parameters ep ON ep.code = eps.parameter_code
                WHERE eps.evaluation_id = $1
                ORDER BY ep.pillar, ep.code
                """,
                res["id"],
            )
            res["parameters"] = [dict(p) for p in params]
            return res

    @staticmethod
    async def get_latest_for_participant(participant_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            eval_row = await conn.fetchrow(
                """
                SELECT id
                FROM eedi_evaluations
                WHERE participant_user_id = $1 AND status = 'COMPLETED'
                ORDER BY submitted_at DESC, created_at DESC
                LIMIT 1
                """,
                UUID(str(participant_id)),
            )
            if not eval_row:
                return None
            return await EvaluationRepository.get_report_by_id(eval_row["id"])

    @staticmethod
    async def get_average_eedi_score(
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
    ) -> float | None:
        conditions = ["status = 'COMPLETED'", "eedi_score IS NOT NULL"]
        params: list[Any] = []
        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"institution_id = ${len(params)}")
        if department_id:
            params.append(UUID(str(department_id)))
            conditions.append(f"department_id = ${len(params)}")

        query = f"""
            SELECT AVG(eedi_score)
            FROM eedi_evaluations
            WHERE {' AND '.join(conditions)}
        """
        async with get_pg_connection() as conn:
            val = await conn.fetchval(query, *params)
            return round(float(val), 1) if val is not None else None

