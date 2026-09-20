"""Payment PostgreSQL repository."""
from __future__ import annotations

from typing import Any
from uuid import UUID
from decimal import Decimal
from app.db.postgres import get_pg_connection, pg_transaction


class PaymentRepository:
    @staticmethod
    async def create_payment(
        enrollment_id: UUID | str,
        participant_id: UUID | str,
        course_id: UUID | str,
        amount: float | Decimal,
        transaction_ref: str,
        semester: int = 1,
        currency: str = "INR",
        method: str = "GATEWAY",
        status: str = "PENDING",
    ) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO payments (
                    enrollment_id, participant_user_id, course_id, semester,
                    amount, currency, transaction_ref, payment_method, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, enrollment_id, participant_user_id, course_id, semester,
                          amount, currency, transaction_ref, payment_method, status, created_at
                """,
                UUID(str(enrollment_id)),
                UUID(str(participant_id)),
                UUID(str(course_id)),
                semester,
                Decimal(str(amount)),
                currency,
                transaction_ref.strip(),
                method,
                status,
            )
            return dict(row)

    @staticmethod
    async def verify_payment(
        payment_id: UUID | str,
        verified_by: UUID | str,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Atomically marks payment VERIFIED and updates enrollment payment_status to VERIFIED."""
        async with pg_transaction() as conn:
            p_row = await conn.fetchrow(
                """
                UPDATE payments
                SET status = 'VERIFIED',
                    verified_by = $2,
                    verified_at = NOW(),
                    notes = COALESCE($3, notes)
                WHERE id = $1
                RETURNING id, enrollment_id, participant_user_id, course_id, semester, amount, status, verified_at
                """,
                UUID(str(payment_id)),
                UUID(str(verified_by)),
                notes,
            )
            if not p_row:
                raise ValueError("Payment not found")

            # Update corresponding enrollment payment_status to VERIFIED
            await conn.execute(
                """
                UPDATE enrollments
                SET payment_status = 'VERIFIED'
                WHERE id = $1
                """,
                p_row["enrollment_id"],
            )

            return dict(p_row)

    @staticmethod
    async def list_by_participant(participant_id: UUID | str) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id, p.enrollment_id, p.course_id, p.semester, p.amount, p.currency,
                       p.transaction_ref, p.payment_method, p.status, p.verified_at, p.created_at,
                       c.title as course_title
                FROM payments p
                JOIN courses c ON c.id = p.course_id
                WHERE p.participant_user_id = $1
                ORDER BY p.created_at DESC
                """,
                UUID(str(participant_id)),
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def get_total_revenue(institution_id: UUID | str | None = None) -> float:
        query = """
            SELECT COALESCE(SUM(p.amount), 0)
            FROM payments p
            JOIN enrollments e ON e.id = p.enrollment_id
            WHERE p.status = 'VERIFIED'
        """
        params: list[Any] = []
        if institution_id:
            params.append(UUID(str(institution_id)))
            query += " AND e.institution_id = $1"

        async with get_pg_connection() as conn:
            val = await conn.fetchval(query, *params)
            return float(val) if val is not None else 0.0

    @staticmethod
    async def count_by_status(status: str | None = None, institution_id: UUID | str | None = None) -> int:
        conditions = []
        params: list[Any] = []
        if status:
            params.append(status)
            conditions.append(f"p.status = ${len(params)}")
        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"e.institution_id = ${len(params)}")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT COUNT(*)
            FROM payments p
            JOIN enrollments e ON e.id = p.enrollment_id
            {where}
        """
        async with get_pg_connection() as conn:
            return await conn.fetchval(query, *params) or 0

