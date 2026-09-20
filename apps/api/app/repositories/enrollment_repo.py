"""Enrollment and Semester Lifecycle PostgreSQL repository."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection, pg_transaction


class EnrollmentRepository:
    @staticmethod
    async def get_by_id(enrollment_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT e.id, e.participant_user_id, e.course_id, e.institution_id, e.department_id,
                       e.batch_id, e.current_semester, e.enrollment_status, e.payment_status,
                       e.access_status, e.access_start_date, e.access_end_date, e.activated_by,
                       e.activated_at, e.deactivated_at, e.deactivation_reason, e.created_at,
                       u.name as participant_name, u.email as participant_email,
                       c.title as course_title, c.fee as course_fee
                FROM enrollments e
                JOIN users u ON u.id = e.participant_user_id
                JOIN courses c ON c.id = e.course_id
                WHERE e.id = $1
                """,
                UUID(str(enrollment_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_participant_and_course(
        participant_id: UUID | str, course_id: UUID | str
    ) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT e.id, e.participant_user_id, e.course_id, e.institution_id, e.department_id,
                       e.batch_id, e.current_semester, e.enrollment_status, e.payment_status,
                       e.access_status, e.access_start_date, e.access_end_date, e.activated_by,
                       e.activated_at, e.deactivated_at, e.created_at, c.title as course_title
                FROM enrollments e
                JOIN courses c ON c.id = e.course_id
                WHERE e.participant_user_id = $1 AND e.course_id = $2
                """,
                UUID(str(participant_id)),
                UUID(str(course_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def create_enrollment(
        participant_id: UUID | str,
        course_id: UUID | str,
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        batch_id: UUID | str | None = None,
        semester: int = 1,
        access_start_date: date | None = None,
        access_end_date: date | None = None,
        payment_status: str = "PENDING",
        enrollment_status: str = "PENDING",
        access_status: str = "INACTIVE",
    ) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO enrollments (
                    participant_user_id, course_id, institution_id, department_id, batch_id,
                    current_semester, enrollment_status, payment_status, access_status,
                    access_start_date, access_end_date
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id, participant_user_id, course_id, institution_id, department_id,
                          current_semester, enrollment_status, payment_status, access_status,
                          access_start_date, access_end_date, created_at
                """,
                UUID(str(participant_id)),
                UUID(str(course_id)),
                UUID(str(institution_id)) if institution_id else None,
                UUID(str(department_id)) if department_id else None,
                UUID(str(batch_id)) if batch_id else None,
                semester,
                enrollment_status,
                payment_status,
                access_status,
                access_start_date,
                access_end_date,
            )
            return dict(row)

    @staticmethod
    async def activate_enrollment(
        enrollment_id: UUID | str,
        activated_by: UUID | str,
        start_date: date,
        end_date: date,
    ) -> dict[str, Any]:
        """Admin activates participant semester access after payment verification."""
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                UPDATE enrollments
                SET access_status = 'ACTIVE',
                    enrollment_status = 'ACTIVE',
                    access_start_date = $2,
                    access_end_date = $3,
                    activated_by = $4,
                    activated_at = NOW(),
                    deactivated_at = NULL,
                    deactivation_reason = NULL
                WHERE id = $1
                RETURNING id, participant_user_id, course_id, current_semester, enrollment_status,
                          payment_status, access_status, access_start_date, access_end_date, activated_at
                """,
                UUID(str(enrollment_id)),
                start_date,
                end_date,
                UUID(str(activated_by)),
            )
            if not row:
                raise ValueError("Enrollment not found")
            return dict(row)

    @staticmethod
    async def deactivate_enrollment(
        enrollment_id: UUID | str,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Manually deactivate participant access."""
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                UPDATE enrollments
                SET access_status = 'INACTIVE',
                    deactivated_at = NOW(),
                    deactivation_reason = $2
                WHERE id = $1
                RETURNING id, participant_user_id, course_id, current_semester, enrollment_status,
                          payment_status, access_status, deactivated_at, deactivation_reason
                """,
                UUID(str(enrollment_id)),
                reason,
            )
            if not row:
                raise ValueError("Enrollment not found")
            return dict(row)

    @staticmethod
    async def update_access_status(
        enrollment_id: UUID | str,
        access_status: str,
    ) -> dict[str, Any]:
        """Update access status (e.g. EXPIRED, ACTIVE, INACTIVE, SUSPENDED)."""
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                UPDATE enrollments
                SET access_status = $2, updated_at = NOW()
                WHERE id = $1
                RETURNING id, access_status, access_start_date, access_end_date
                """,
                UUID(str(enrollment_id)),
                access_status,
            )
            if not row:
                raise ValueError("Enrollment not found")
            return dict(row)

    @staticmethod
    async def renew_enrollment(
        enrollment_id: UUID | str,
        new_semester: int,
        new_start_date: date,
        new_end_date: date,
        activated_by: UUID | str | None = None,
    ) -> dict[str, Any]:
        """Non-destructive semester renewal.
        1. Archives old semester period into enrollment_periods table.
        2. Updates enrollments with new semester, new dates, and resets payment/access status.
        """
        async with pg_transaction() as conn:
            current = await conn.fetchrow(
                """
                SELECT id, participant_user_id, course_id, current_semester, access_start_date,
                       access_end_date, access_status, payment_status, activated_by, activated_at
                FROM enrollments
                WHERE id = $1
                FOR UPDATE
                """,
                UUID(str(enrollment_id)),
            )
            if not current:
                raise ValueError("Enrollment not found")

            # 1. Archive current period if dates exist
            if current["access_start_date"] and current["access_end_date"]:
                await conn.execute(
                    """
                    INSERT INTO enrollment_periods (
                        enrollment_id, participant_user_id, course_id, semester,
                        start_date, end_date, access_status, payment_status,
                        activated_by, activated_at, completed_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                    ON CONFLICT (enrollment_id, semester)
                    DO UPDATE SET
                        start_date = EXCLUDED.start_date,
                        end_date = EXCLUDED.end_date,
                        completed_at = NOW()
                    """,
                    current["id"],
                    current["participant_user_id"],
                    current["course_id"],
                    current["current_semester"],
                    current["access_start_date"],
                    current["access_end_date"],
                    current["access_status"],
                    current["payment_status"],
                    current["activated_by"],
                    current["activated_at"],
                )

            # 2. Update to new semester
            act_uuid = UUID(str(activated_by)) if activated_by else None
            updated = await conn.fetchrow(
                """
                UPDATE enrollments
                SET current_semester = $2,
                    access_start_date = $3,
                    access_end_date = $4,
                    payment_status = 'PENDING',
                    enrollment_status = 'ACTIVE',
                    access_status = 'INACTIVE',
                    activated_by = $5::uuid,
                    activated_at = CASE WHEN $5::uuid IS NOT NULL THEN NOW() ELSE NULL END,
                    deactivated_at = NULL,
                    deactivation_reason = NULL
                WHERE id = $1
                RETURNING id, participant_user_id, course_id, current_semester, enrollment_status,
                          payment_status, access_status, access_start_date, access_end_date, activated_at
                """,
                current["id"],
                new_semester,
                new_start_date,
                new_end_date,
                act_uuid,
            )
            return dict(updated)

    @staticmethod
    async def get_periods_history(enrollment_id: UUID | str) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id, enrollment_id, participant_user_id, course_id, semester,
                       start_date, end_date, access_status, payment_status, activated_at, completed_at
                FROM enrollment_periods
                WHERE enrollment_id = $1
                ORDER BY semester DESC, end_date DESC
                """,
                UUID(str(enrollment_id)),
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def list_by_scope(
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conditions = []
        params: list[Any] = []

        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"e.institution_id = ${len(params)}")
        if department_id:
            params.append(UUID(str(department_id)))
            conditions.append(f"e.department_id = ${len(params)}")
        if status:
            params.append(status)
            conditions.append(f"e.access_status = ${len(params)}")

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT e.id, e.participant_user_id, e.course_id, e.institution_id, e.department_id,
                   e.current_semester, e.enrollment_status, e.payment_status, e.access_status,
                   e.access_start_date, e.access_end_date, e.activated_at,
                   u.name as participant_name, u.email as participant_email,
                   c.title as course_title, c.fee as course_fee,
                   d.name as department_name, b.name as batch_name
            FROM enrollments e
            JOIN users u ON u.id = e.participant_user_id
            JOIN courses c ON c.id = e.course_id
            LEFT JOIN departments d ON d.id = e.department_id
            LEFT JOIN batches b ON b.id = e.batch_id
            {where_clause}
            ORDER BY e.created_at DESC
            {limit_clause} {offset_clause}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]
