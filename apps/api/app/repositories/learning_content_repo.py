"""Repository for Course Materials, Recordings, and Live Sessions (Phases 6, 7, 8)."""
from __future__ import annotations

import uuid
from typing import Any
from uuid import UUID

from app.db.postgres import get_pg_connection


class LearningContentRepository:
    @staticmethod
    async def is_trainer_assigned_to_course(trainer_user_id: UUID | str, course_id: UUID | str) -> bool:
        """Checks if a trainer is explicitly assigned to a course or via batch_trainers."""
        t_id = UUID(str(trainer_user_id))
        c_id = UUID(str(course_id))
        async with get_pg_connection() as conn:
            # 1. Direct course_trainers link
            direct = await conn.fetchval(
                "SELECT count(*) FROM course_trainers WHERE trainer_user_id = $1 AND course_id = $2",
                t_id, c_id
            )
            if direct and direct > 0:
                return True

            # 2. Batch-level assignment
            batch_linked = await conn.fetchval(
                """
                SELECT count(*) FROM batch_trainers bt
                JOIN enrollments e ON e.batch_id = bt.batch_id
                WHERE bt.trainer_user_id = $1 AND e.course_id = $2
                """,
                t_id, c_id
            )
            return bool(batch_linked and batch_linked > 0)

    @staticmethod
    async def get_trainer_assigned_courses(trainer_user_id: UUID | str) -> list[dict[str, Any]]:
        """Returns all courses assigned to a trainer with enrollment and session stats."""
        t_id = UUID(str(trainer_user_id))
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                WITH assigned_courses AS (
                    SELECT course_id FROM course_trainers WHERE trainer_user_id = $1
                    UNION
                    SELECT DISTINCT e.course_id 
                    FROM batch_trainers bt
                    JOIN enrollments e ON e.batch_id = bt.batch_id
                    WHERE bt.trainer_user_id = $1 AND e.course_id IS NOT NULL
                )
                SELECT 
                    c.id, c.title, c.slug, c.code, c.description, c.category, c.training_type,
                    c.delivery_mode, c.duration_hours, c.fee, c.published, c.status,
                    c.trial_duration_days, c.trial_enabled, c.payment_methods,
                    c.upi_id, c.merchant_name, c.qr_code_url, c.payment_instructions,
                    (SELECT count(DISTINCT e.batch_id) FROM enrollments e WHERE e.course_id = c.id) as batch_count,
                    (SELECT count(*) FROM enrollments e WHERE e.course_id = c.id AND e.enrollment_status = 'ACTIVE') as total_students,
                    (SELECT count(*) FROM enrollments e WHERE e.course_id = c.id AND e.payment_status = 'VERIFIED') as paid_students,
                    (SELECT count(*) FROM course_trials ct WHERE ct.course_id = c.id AND ct.status = 'ACTIVE' AND ct.expires_at > NOW()) as active_trials
                FROM courses c
                JOIN assigned_courses ac ON ac.course_id = c.id
                WHERE c.deleted_at IS NULL
                ORDER BY c.title ASC
                """,
                t_id
            )
            return [dict(r) for r in rows]

    # --- Materials ---
    @staticmethod
    async def get_course_materials(course_id: UUID | str, published_only: bool = True) -> list[dict[str, Any]]:
        c_id = UUID(str(course_id))
        cond = "WHERE cm.course_id = $1"
        if published_only:
            cond += " AND cm.published = TRUE"
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                f"""
                SELECT cm.id, cm.course_id, cm.session_id, cm.trainer_user_id, cm.batch_id,
                       cm.title, cm.description, cm.material_type, cm.file_url, cm.file_size_bytes,
                       cm.published, cm.created_at, cm.updated_at,
                       u.name as trainer_name,
                       ts.topic as session_topic
                FROM class_materials cm
                JOIN users u ON u.id = cm.trainer_user_id
                LEFT JOIN training_sessions ts ON ts.id = cm.session_id
                {cond}
                ORDER BY cm.created_at DESC
                """,
                c_id
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def create_course_material(
        *,
        course_id: UUID | str,
        trainer_user_id: UUID | str,
        title: str,
        file_url: str,
        description: str | None = None,
        material_type: str = "DOCUMENT",
        file_size_bytes: int = 0,
        session_id: UUID | str | None = None,
        batch_id: UUID | str | None = None,
        published: bool = True,
    ) -> dict[str, Any]:
        c_id = UUID(str(course_id))
        t_id = UUID(str(trainer_user_id))
        s_id = UUID(str(session_id)) if session_id else None
        b_id = UUID(str(batch_id)) if batch_id else None

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO class_materials (
                    course_id, trainer_user_id, session_id, batch_id,
                    title, description, material_type, file_url,
                    file_size_bytes, published, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
                RETURNING *;
                """,
                c_id, t_id, s_id, b_id, title, description, material_type, file_url, file_size_bytes, published
            )
            return dict(row)

    @staticmethod
    async def delete_course_material(material_id: UUID | str, trainer_user_id: UUID | str | None = None) -> bool:
        m_id = UUID(str(material_id))
        async with get_pg_connection() as conn:
            if trainer_user_id:
                t_id = UUID(str(trainer_user_id))
                res = await conn.execute(
                    "DELETE FROM class_materials WHERE id = $1 AND trainer_user_id = $2",
                    m_id, t_id
                )
            else:
                res = await conn.execute(
                    "DELETE FROM class_materials WHERE id = $1",
                    m_id
                )
            return "DELETE 1" in res

    # --- Recordings ---
    @staticmethod
    async def get_course_recordings(course_id: UUID | str, published_only: bool = True) -> list[dict[str, Any]]:
        c_id = UUID(str(course_id))
        cond = "WHERE cr.course_id = $1"
        if published_only:
            cond += " AND cr.status = 'PUBLISHED'"
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                f"""
                SELECT cr.id, cr.course_id, cr.session_id, cr.trainer_user_id, cr.batch_id,
                       cr.title, cr.recording_url, cr.duration_seconds, cr.status,
                       cr.created_at, cr.updated_at,
                       u.name as trainer_name,
                       ts.topic as session_topic
                FROM class_recordings cr
                JOIN users u ON u.id = cr.trainer_user_id
                LEFT JOIN training_sessions ts ON ts.id = cr.session_id
                {cond}
                ORDER BY cr.created_at DESC
                """,
                c_id
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def create_course_recording(
        *,
        course_id: UUID | str,
        trainer_user_id: UUID | str,
        title: str,
        recording_url: str,
        duration_seconds: int = 0,
        session_id: UUID | str | None = None,
        batch_id: UUID | str | None = None,
        status: str = "PUBLISHED",
    ) -> dict[str, Any]:
        c_id = UUID(str(course_id))
        t_id = UUID(str(trainer_user_id))
        s_id = UUID(str(session_id)) if session_id else None
        b_id = UUID(str(batch_id)) if batch_id else None

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO class_recordings (
                    course_id, trainer_user_id, session_id, batch_id,
                    title, recording_url, duration_seconds, status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                RETURNING *;
                """,
                c_id, t_id, s_id, b_id, title, recording_url, duration_seconds, status
            )
            return dict(row)

    @staticmethod
    async def update_course_recording(recording_id: UUID | str, updates: dict[str, Any]) -> dict[str, Any] | None:
        r_id = UUID(str(recording_id))
        allowed = {"title", "recording_url", "duration_seconds", "status"}
        clauses = []
        params: list[Any] = [r_id]
        for k, v in updates.items():
            if k in allowed:
                params.append(v)
                clauses.append(f"{k} = ${len(params)}")
        if not clauses:
            return None
        clauses.append("updated_at = NOW()")
        query = f"UPDATE class_recordings SET {', '.join(clauses)} WHERE id = $1 RETURNING *;"
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(query, *params)
            return dict(row) if row else None

    @staticmethod
    async def delete_course_recording(recording_id: UUID | str, trainer_user_id: UUID | str | None = None) -> bool:
        r_id = UUID(str(recording_id))
        async with get_pg_connection() as conn:
            if trainer_user_id:
                t_id = UUID(str(trainer_user_id))
                res = await conn.execute(
                    "DELETE FROM class_recordings WHERE id = $1 AND trainer_user_id = $2",
                    r_id, t_id
                )
            else:
                res = await conn.execute("DELETE FROM class_recordings WHERE id = $1", r_id)
            return "DELETE 1" in res

    # --- Live Sessions with Meeting Links ---
    @staticmethod
    async def get_course_sessions(course_id: UUID | str, published_only: bool = True) -> list[dict[str, Any]]:
        c_id = UUID(str(course_id))
        cond = "WHERE ts.course_id = $1"
        if published_only:
            cond += " AND ts.is_published = TRUE"
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                f"""
                SELECT ts.id, ts.course_id, ts.batch_id, ts.topic, ts.session_date,
                       ts.starts_at, ts.ends_at, ts.meeting_link, ts.meeting_password,
                       ts.is_published,
                       b.name as batch_name,
                       c.title as course_title
                FROM training_sessions ts
                LEFT JOIN batches b ON b.id = ts.batch_id
                LEFT JOIN courses c ON c.id = ts.course_id
                {cond}
                ORDER BY ts.session_date DESC, ts.starts_at DESC
                """,
                c_id
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def create_course_session(
        *,
        course_id: UUID | str,
        topic: str,
        session_date: Any,
        start_time: Any = None,
        end_time: Any = None,
        meeting_link: str,
        meeting_password: str | None = None,
        batch_id: UUID | str | None = None,
        trainer_user_id: UUID | str | None = None,
        is_published: bool = True,
    ) -> dict[str, Any]:
        c_id = UUID(str(course_id))
        b_id = UUID(str(batch_id)) if batch_id else None
        t_id = UUID(str(trainer_user_id)) if trainer_user_id else None

        import datetime as dt
        if isinstance(session_date, str):
            session_date = dt.date.fromisoformat(session_date)

        if isinstance(start_time, dt.time):
            starts_at = dt.datetime.combine(session_date, start_time, tzinfo=dt.timezone.utc)
        elif isinstance(start_time, dt.datetime):
            starts_at = start_time
        else:
            starts_at = dt.datetime.combine(session_date, dt.time(10, 0), tzinfo=dt.timezone.utc)

        if isinstance(end_time, dt.time):
            ends_at = dt.datetime.combine(session_date, end_time, tzinfo=dt.timezone.utc)
        elif isinstance(end_time, dt.datetime):
            ends_at = end_time
        else:
            ends_at = dt.datetime.combine(session_date, dt.time(11, 0), tzinfo=dt.timezone.utc)

        async with get_pg_connection() as conn:
            if not b_id:
                b_id = await conn.fetchval(
                    "SELECT batch_id FROM enrollments WHERE course_id = $1 AND batch_id IS NOT NULL LIMIT 1",
                    c_id
                )
            if not t_id:
                t_id = await conn.fetchval(
                    "SELECT trainer_user_id FROM course_trainers WHERE course_id = $1 LIMIT 1",
                    c_id
                )
            if not t_id and b_id:
                t_id = await conn.fetchval(
                    "SELECT trainer_user_id FROM batch_trainers WHERE batch_id = $1 LIMIT 1",
                    b_id
                )
            inst_id = None
            dept_id = None
            if b_id:
                batch_row = await conn.fetchrow("SELECT institution_id, department_id FROM batches WHERE id = $1", b_id)
                if batch_row:
                    inst_id = batch_row["institution_id"]
                    dept_id = batch_row["department_id"]

            row = await conn.fetchrow(
                """
                INSERT INTO training_sessions (
                    course_id, batch_id, trainer_user_id, institution_id, department_id,
                    topic, session_date, starts_at, ends_at,
                    meeting_link, meeting_password, is_published, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
                RETURNING *;
                """,
                c_id, b_id, t_id, inst_id, dept_id, topic, session_date, starts_at, ends_at, meeting_link, meeting_password, is_published
            )
            return dict(row)
