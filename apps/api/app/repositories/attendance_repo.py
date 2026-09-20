"""Attendance PostgreSQL repository."""
from __future__ import annotations

from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection


class AttendanceRepository:
    @staticmethod
    async def record_attendance(
        session_id: UUID | str,
        participant_id: UUID | str,
        status: str = "PRESENT",
        marked_by: UUID | str | None = None,
        remarks: str | None = None,
    ) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO attendance_records (session_id, participant_user_id, status, marked_by, remarks)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (session_id, participant_user_id)
                DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, remarks = EXCLUDED.remarks, marked_at = NOW()
                RETURNING id, session_id, participant_user_id, status, marked_at, remarks
                """,
                UUID(str(session_id)),
                UUID(str(participant_id)),
                status,
                UUID(str(marked_by)) if marked_by else None,
                remarks,
            )
            return dict(row)

    @staticmethod
    async def get_participant_attendance_stats(participant_id: UUID | str) -> dict[str, Any]:
        """Returns exact counts: total, attended, percentage.
        Returns percentage as None (rendered as N/A) if total == 0, never a fake number.
        """
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_sessions,
                    COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as attended_sessions
                FROM attendance_records
                WHERE participant_user_id = $1
                """,
                UUID(str(participant_id)),
            )
            total = row["total_sessions"] if row else 0
            attended = row["attended_sessions"] if row else 0
            pct = round((attended / total) * 100.0, 1) if total > 0 else None
            return {
                "totalSessions": total,
                "attendedSessions": attended,
                "percentage": pct,
                "hasData": total > 0,
            }

    @staticmethod
    async def get_institution_average_attendance(institution_id: UUID | str | None = None) -> float | None:
        query = """
            SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END) as attended
            FROM attendance_records ar
            JOIN training_sessions ts ON ts.id = ar.session_id
        """
        params: list[Any] = []
        if institution_id:
            params.append(UUID(str(institution_id)))
            query += " WHERE ts.institution_id = $1"

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(query, *params)
            if not row or row["total"] == 0:
                return None
            return round((row["attended"] / row["total"]) * 100.0, 1)

