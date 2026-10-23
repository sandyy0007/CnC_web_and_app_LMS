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
        receipt_url: str | None = None,
        payer_upi_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        import json
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO payments (
                    enrollment_id, participant_user_id, course_id, semester,
                    amount, currency, transaction_ref, payment_method, status,
                    receipt_url, payer_upi_id, metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
                RETURNING id, enrollment_id, participant_user_id, course_id, semester,
                          amount, currency, transaction_ref, payment_method, status,
                          receipt_url, payer_upi_id, metadata, created_at
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
                receipt_url,
                payer_upi_id,
                json.dumps(metadata or {}),
            )
            return dict(row)

    @staticmethod
    async def verify_payment(
        payment_id: UUID | str,
        verified_by: UUID | str,
        notes: str | None = None,
        activate_access: bool = False,
    ) -> dict[str, Any]:
        """Atomically marks payment VERIFIED, and optionally activates enrollment access and converts trials."""
        from app.core.errors import Conflict, NotFound
        async with pg_transaction() as conn:
            pid = UUID(str(payment_id))
            orig = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", pid)
            if not orig:
                raise NotFound("Payment not found.")

            current_status = str(orig["status"]).upper()
            if current_status == "VERIFIED":
                raise Conflict("Payment is already verified.")
            if current_status == "REFUNDED":
                raise Conflict("Cannot verify a refunded payment.")
            if current_status == "REJECTED":
                raise Conflict("Cannot verify a rejected payment.")

            v_uid = UUID(str(verified_by))
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
                pid,
                v_uid,
                notes,
            )

            if activate_access:
                # Update corresponding enrollment payment_status to VERIFIED and access to ACTIVE (lifetime access without trial date expiry)
                await conn.execute(
                    """
                    UPDATE enrollments
                    SET payment_status = 'VERIFIED',
                        access_status = 'ACTIVE',
                        enrollment_status = 'ACTIVE',
                        activated_by = $2,
                        activated_at = NOW(),
                        access_start_date = COALESCE(access_start_date, CURRENT_DATE),
                        access_end_date = NULL,
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    p_row["enrollment_id"],
                    v_uid,
                )

                # Convert any trial (active or expired) for this participant and course
                await conn.execute(
                    """
                    UPDATE course_trials
                    SET status = 'CONVERTED',
                        converted_at = NOW(),
                        updated_at = NOW()
                    WHERE participant_user_id = $1 AND course_id = $2
                    """,
                    p_row["participant_user_id"],
                    p_row["course_id"],
                )
            else:
                # Update enrollment payment_status only; access remains managed by institutional admin
                await conn.execute(
                    """
                    UPDATE enrollments
                    SET payment_status = 'VERIFIED',
                        updated_at = NOW()
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

    @staticmethod
    async def list_admin_payments(
        institution_id: UUID | str | None = None,
        status: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conditions = []
        params: list[Any] = []

        if institution_id:
            from app.repositories.game_repo import _safe_uuid
            inst_uuid = _safe_uuid(institution_id)
            if inst_uuid:
                params.append(inst_uuid)
                conditions.append(f"(e.institution_id = ${len(params)} OR u.institution_id = ${len(params)})")

        if status and status.lower() != "all":
            s_val = status.upper()
            if s_val == "SUCCESS" or s_val == "COMPLETED":
                s_val = "VERIFIED"
            params.append(s_val)
            conditions.append(f"p.status = ${len(params)}")

        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)} OR p.transaction_ref ILIKE ${len(params)})")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT p.id, p.enrollment_id, p.participant_user_id, p.course_id, p.semester,
                   p.amount, p.currency, p.transaction_ref, p.payment_method, p.status,
                   p.verified_at, p.created_at,
                   u.name as student_name, u.email as student_email,
                   c.title as course_title,
                   d.name as department_name,
                   i.name as institution_name
            FROM payments p
            JOIN users u ON u.id = p.participant_user_id
            JOIN courses c ON c.id = p.course_id
            LEFT JOIN enrollments e ON e.id = p.enrollment_id
            LEFT JOIN institutions i ON i.id = COALESCE(e.institution_id, u.institution_id)
            LEFT JOIN departments d ON d.id = u.department_id
            {where}
            ORDER BY p.created_at DESC
            {limit_clause} {offset_clause}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def count_admin_payments(
        institution_id: UUID | str | None = None,
        status: str | None = None,
        search: str | None = None,
    ) -> int:
        conditions = []
        params: list[Any] = []

        if institution_id:
            from app.repositories.game_repo import _safe_uuid
            inst_uuid = _safe_uuid(institution_id)
            if inst_uuid:
                params.append(inst_uuid)
                conditions.append(f"(e.institution_id = ${len(params)} OR u.institution_id = ${len(params)})")

        if status and status.lower() != "all":
            s_val = status.upper()
            if s_val == "SUCCESS" or s_val == "COMPLETED":
                s_val = "VERIFIED"
            params.append(s_val)
            conditions.append(f"p.status = ${len(params)}")

        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)} OR p.transaction_ref ILIKE ${len(params)})")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT COUNT(*)
            FROM payments p
            JOIN users u ON u.id = p.participant_user_id
            LEFT JOIN enrollments e ON e.id = p.enrollment_id
            {where}
        """
        async with get_pg_connection() as conn:
            return await conn.fetchval(query, *params) or 0

    @staticmethod
    async def get_admin_summary(institution_id: UUID | str | None = None) -> dict[str, Any]:
        conditions = []
        params: list[Any] = []
        if institution_id:
            from app.repositories.game_repo import _safe_uuid
            inst_uuid = _safe_uuid(institution_id)
            if inst_uuid:
                params.append(inst_uuid)
                conditions.append(f"(e.institution_id = ${len(params)} OR u.institution_id = ${len(params)})")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT 
                COUNT(*) as total_txns,
                COUNT(*) FILTER (WHERE p.status = 'VERIFIED') as verified_txns,
                COUNT(*) FILTER (WHERE p.status = 'PENDING') as pending_txns,
                COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'VERIFIED'), 0) as verified_volume,
                COALESCE(SUM(p.amount), 0) as total_volume
            FROM payments p
            JOIN users u ON u.id = p.participant_user_id
            LEFT JOIN enrollments e ON e.id = p.enrollment_id
            {where}
        """
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(query, *params)
            if not row:
                return {
                    "totalRevenue": 0.0,
                    "currency": "INR",
                    "totalTransactions": 0,
                    "successfulTransactions": 0,
                    "pendingTransactions": 0,
                    "refundedTransactions": 0,
                    "refundedVolume": 0.0,
                    "paymentMethods": [],
                }
            v_vol = float(row["verified_volume"])
            v_txns = int(row["verified_txns"])
            p_txns = int(row["pending_txns"])
            t_txns = int(row["total_txns"])
            return {
                "totalRevenue": round(v_vol, 2),
                "currency": "INR",
                "totalTransactions": t_txns,
                "successfulTransactions": v_txns,
                "pendingTransactions": p_txns,
                "refundedTransactions": 0,
                "refundedVolume": 0.0,
                "paymentMethods": [{"method": "Official Fee Receipt", "count": v_txns}],
            }

    @staticmethod
    async def reject_payment(
        payment_id: UUID | str,
        rejected_by: UUID | str,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Atomically marks payment REJECTED and leaves enrollment unactivated."""
        from app.core.errors import Conflict, NotFound
        async with pg_transaction() as conn:
            pid = UUID(str(payment_id))
            orig = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", pid)
            if not orig:
                raise NotFound("Payment not found.")

            current_status = str(orig["status"]).upper()
            if current_status == "VERIFIED":
                raise Conflict("Cannot reject a verified payment; issue a refund instead.")
            if current_status == "REFUNDED":
                raise Conflict("Payment has already been refunded.")
            if current_status == "REJECTED":
                raise Conflict("Payment is already rejected.")

            p_row = await conn.fetchrow(
                """
                UPDATE payments
                SET status = 'REJECTED',
                    verified_by = $2,
                    rejection_reason = $3,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, enrollment_id, participant_user_id, course_id, semester, amount, status, rejection_reason;
                """,
                pid,
                UUID(str(rejected_by)),
                reason,
            )

            # Update enrollment payment_status to REJECTED and ensure access is INACTIVE
            await conn.execute(
                """
                UPDATE enrollments
                SET payment_status = 'REJECTED',
                    access_status = 'INACTIVE',
                    updated_at = NOW()
                WHERE id = $1
                """,
                p_row["enrollment_id"],
            )
            return dict(p_row)

    @staticmethod
    async def refund_payment(
        payment_id: UUID | str,
        refunded_by: UUID | str,
        amount: float | Decimal | None = None,
        refund_ref: str | None = None,
        reason: str = "Admin approved refund",
    ) -> dict[str, Any]:
        """Atomically refunds a verified transaction and revokes enrollment access."""
        from app.core.errors import Conflict, NotFound, ValidationError
        async with pg_transaction() as conn:
            pid = UUID(str(payment_id))
            orig = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", pid)
            if not orig:
                raise NotFound("Payment not found.")

            current_status = str(orig["status"]).upper()
            if current_status == "REFUNDED":
                raise Conflict("Payment has already been refunded.")
            if current_status != "VERIFIED":
                raise Conflict("Only verified payments can be refunded.")

            ref_amount = Decimal(str(amount)) if amount is not None else orig["amount"]
            if ref_amount <= 0 or ref_amount > orig["amount"]:
                raise ValidationError("Refund amount must be greater than zero and cannot exceed original payment amount.")

            r_by = UUID(str(refunded_by))
            r_ref = refund_ref or f"REF-{str(payment_id)[:8].upper()}"

            p_row = await conn.fetchrow(
                """
                UPDATE payments
                SET status = 'REFUNDED',
                    refunded_at = NOW(),
                    refunded_by = $2,
                    refund_amount = $3,
                    refund_ref = $4,
                    refund_reason = $5,
                    notes = COALESCE(notes, '') || ' [Refunded: ' || $5 || ']',
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, enrollment_id, participant_user_id, course_id, semester, amount,
                          refund_amount, refund_ref, refunded_at, status;
                """,
                pid,
                r_by,
                ref_amount,
                r_ref,
                reason,
            )

            # Revoke enrollment access
            await conn.execute(
                """
                UPDATE enrollments
                SET payment_status = 'REFUNDED',
                    access_status = 'INACTIVE',
                    enrollment_status = 'CANCELLED',
                    deactivated_at = NOW(),
                    deactivation_reason = $2,
                    updated_at = NOW()
                WHERE id = $1
                """,
                orig["enrollment_id"],
                f"Payment refunded: {reason}",
            )
            return dict(p_row)

    @staticmethod
    async def get_course_revenue_summary(course_id: UUID | str) -> dict[str, Any]:
        """Calculates exact, reconciled financial metrics for a single course."""
        cid = UUID(str(course_id))
        async with get_pg_connection() as conn:
            # Course info
            course = await conn.fetchrow("SELECT id, title, slug, fee FROM courses WHERE id = $1", cid)
            if not course:
                raise ValueError("Course not found")

            # Financial metrics
            stats = await conn.fetchrow(
                """
                SELECT 
                    COUNT(*) as total_txns,
                    COUNT(*) FILTER (WHERE status = 'VERIFIED') as verified_txns,
                    COUNT(*) FILTER (WHERE status = 'PENDING') as pending_txns,
                    COUNT(*) FILTER (WHERE status IN ('FAILED', 'REJECTED')) as failed_rejected_txns,
                    COUNT(*) FILTER (WHERE status = 'REFUNDED') as refunded_txns,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'VERIFIED'), 0) as gross_verified_revenue,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) as pending_amount,
                    COALESCE(SUM(refund_amount) FILTER (WHERE status = 'REFUNDED'), 0) as refund_total
                FROM payments
                WHERE course_id = $1;
                """,
                cid,
            )

            gross = float(stats["gross_verified_revenue"])
            refunds = float(stats["refund_total"])
            net = round(gross - refunds, 2)

            # Enrollments & Trials
            paid_enrolled = await conn.fetchval(
                "SELECT count(*) FROM enrollments WHERE course_id = $1 AND payment_status = 'VERIFIED' AND access_status = 'ACTIVE'",
                cid,
            ) or 0

            trial_starts = await conn.fetchval(
                "SELECT count(*) FROM course_trials WHERE course_id = $1", cid
            ) or 0

            trial_expirations = await conn.fetchval(
                "SELECT count(*) FROM course_trials WHERE course_id = $1 AND (status = 'EXPIRED' OR expires_at < NOW())",
                cid,
            ) or 0

            return {
                "courseId": str(course["id"]),
                "courseTitle": course["title"],
                "courseSlug": course["slug"],
                "publishedPrice": float(course["fee"] or 0.0),
                "currency": "INR",
                "totalTransactions": int(stats["total_txns"]),
                "verifiedTransactions": int(stats["verified_txns"]),
                "grossVerifiedRevenue": gross,
                "refundTotal": refunds,
                "netRevenue": net,
                "pendingPaymentCount": int(stats["pending_txns"]),
                "pendingPaymentAmount": float(stats["pending_amount"]),
                "failedRejectedPaymentCount": int(stats["failed_rejected_txns"]),
                "trialStarts": trial_starts,
                "trialExpirations": trial_expirations,
                "paidEnrollments": paid_enrolled,
            }

    @staticmethod
    async def list_course_transactions(
        course_id: UUID | str,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        cid = UUID(str(course_id))
        conditions = ["p.course_id = $1"]
        params: list[Any] = [cid]

        if status and status.upper() != "ALL":
            params.append(status.upper())
            conditions.append(f"p.status = ${len(params)}")

        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT p.id, p.enrollment_id, p.participant_user_id, p.course_id, p.semester,
                   p.amount, p.currency, p.transaction_ref, p.payment_method, p.status,
                   p.verified_at, p.receipt_url, p.payer_upi_id, p.rejection_reason,
                   p.refunded_at, p.refund_amount, p.refund_ref, p.created_at,
                   u.name as student_name, u.email as student_email
            FROM payments p
            JOIN users u ON u.id = p.participant_user_id
            WHERE {' AND '.join(conditions)}
            ORDER BY p.created_at DESC
            {limit_clause} {offset_clause};
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def get_college_revenue_summary(institution_id: UUID | str) -> dict[str, Any]:
        """College-level revenue aggregated strictly across that college's enrolled participants."""
        inst_id = UUID(str(institution_id))
        async with get_pg_connection() as conn:
            inst = await conn.fetchrow("SELECT id, name, code FROM institutions WHERE id = $1", inst_id)
            if not inst:
                raise ValueError("Institution not found")

            # Totals
            totals = await conn.fetchrow(
                """
                SELECT 
                    COUNT(*) as total_txns,
                    COUNT(*) FILTER (WHERE p.status = 'VERIFIED') as verified_txns,
                    COUNT(*) FILTER (WHERE p.status = 'PENDING') as pending_txns,
                    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'VERIFIED'), 0) as gross_verified_revenue,
                    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PENDING'), 0) as pending_amount,
                    COALESCE(SUM(p.refund_amount) FILTER (WHERE p.status = 'REFUNDED'), 0) as refund_total
                FROM payments p
                JOIN enrollments e ON e.id = p.enrollment_id
                WHERE e.institution_id = $1;
                """,
                inst_id,
            )

            # Course-wise breakdown within college
            course_breakdown = await conn.fetch(
                """
                SELECT c.id as course_id, c.title as course_title,
                       COUNT(p.id) FILTER (WHERE p.status = 'VERIFIED') as verified_count,
                       COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'VERIFIED'), 0) as verified_revenue
                FROM payments p
                JOIN enrollments e ON e.id = p.enrollment_id
                JOIN courses c ON c.id = p.course_id
                WHERE e.institution_id = $1
                GROUP BY c.id, c.title
                ORDER BY verified_revenue DESC;
                """,
                inst_id,
            )

            gross = float(totals["gross_verified_revenue"])
            refunds = float(totals["refund_total"])
            return {
                "collegeId": str(inst["id"]),
                "collegeName": inst["name"],
                "collegeCode": inst["code"],
                "totalTransactions": int(totals["total_txns"]),
                "verifiedTransactions": int(totals["verified_txns"]),
                "grossVerifiedRevenue": gross,
                "refundTotal": refunds,
                "netRevenue": round(gross - refunds, 2),
                "pendingPaymentCount": int(totals["pending_txns"]),
                "pendingPaymentAmount": float(totals["pending_amount"]),
                "courses": [
                    {
                        "courseId": str(cb["course_id"]),
                        "courseTitle": cb["course_title"],
                        "verifiedCount": int(cb["verified_count"]),
                        "revenue": float(cb["verified_revenue"]),
                    }
                    for cb in course_breakdown
                ],
            }


