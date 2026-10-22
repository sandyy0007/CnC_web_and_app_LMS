"""Course, Module, and Lesson PostgreSQL repository."""
from __future__ import annotations

from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection


class CourseRepository:
    @staticmethod
    async def list_courses(
        search: str | None = None,
        category: str | None = None,
        training_type: str | None = None,
        delivery_mode: str | None = None,
        published_only: bool = True,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conditions = ["deleted_at IS NULL"]
        params: list[Any] = []

        if published_only:
            conditions.append("published = TRUE")
        if category and category.lower() != "all":
            params.append(category)
            conditions.append(f"category = ${len(params)}")
        if training_type:
            params.append(training_type)
            conditions.append(f"training_type = ${len(params)}")
        if delivery_mode:
            params.append(delivery_mode)
            conditions.append(f"delivery_mode = ${len(params)}")
        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(title ILIKE ${len(params)} OR description ILIKE ${len(params)})")

        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT id, title, slug, code, description, category, training_type, delivery_mode,
                   duration_hours, fee, published, order_index, created_at,
                   trial_duration_days, trial_enabled, payment_methods, upi_id, merchant_name,
                   qr_code_url, payment_instructions, refund_policy, enrollment_open, status
            FROM courses
            WHERE {' AND '.join(conditions)}
            ORDER BY order_index ASC, created_at DESC
            {limit_clause} {offset_clause}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def get_by_id(course_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, title, slug, code, description, category, training_type, delivery_mode,
                       duration_hours, fee, published, order_index, created_at,
                       trial_duration_days, trial_enabled, payment_methods, upi_id, merchant_name,
                       qr_code_url, payment_instructions, refund_policy, enrollment_open, status
                FROM courses
                WHERE id = $1 AND deleted_at IS NULL
                """,
                UUID(str(course_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_slug(slug: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, title, slug, code, description, category, training_type, delivery_mode,
                       duration_hours, fee, published, order_index, created_at,
                       trial_duration_days, trial_enabled, payment_methods, upi_id, merchant_name,
                       qr_code_url, payment_instructions, refund_policy, enrollment_open, status
                FROM courses
                WHERE LOWER(slug) = LOWER($1) AND deleted_at IS NULL
                """,
                slug.strip(),
            )
            return dict(row) if row else None

    @staticmethod
    async def count_courses(published_only: bool = True) -> int:
        cond = "WHERE deleted_at IS NULL"
        if published_only:
            cond += " AND published = TRUE"
        query = f"SELECT COUNT(*) FROM courses {cond}"
        async with get_pg_connection() as conn:
            return await conn.fetchval(query) or 0

    @staticmethod
    async def get_categories() -> list[str]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT category FROM courses WHERE deleted_at IS NULL AND published = TRUE ORDER BY category ASC"
            )
            return [r["category"] for r in rows if r["category"]]

    @staticmethod
    async def get_modules_with_lessons(course_id: UUID | str) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            modules = await conn.fetch(
                """
                SELECT id, course_id, title, slug, order_index, description
                FROM modules
                WHERE course_id = $1 AND deleted_at IS NULL
                ORDER BY order_index ASC
                """,
                UUID(str(course_id)),
            )
            res = []
            for m in modules:
                m_dict = dict(m)
                lessons = await conn.fetch(
                    """
                    SELECT id, module_id, title, slug, order_index, content_type, duration_minutes, content
                    FROM lessons
                    WHERE module_id = $1 AND deleted_at IS NULL
                    ORDER BY order_index ASC
                    """,
                    m["id"],
                )
                m_dict["lessons"] = [dict(l) for l in lessons]
                res.append(m_dict)
            return res

    @staticmethod
    async def update_payment_config(course_id: UUID | str, config: dict[str, Any]) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            cid = UUID(str(course_id))
            set_clauses = []
            params: list[Any] = [cid]

            fields = [
                ("fee", "fee"),
                ("trialDurationDays", "trial_duration_days"),
                ("trialEnabled", "trial_enabled"),
                ("paymentMethods", "payment_methods"),
                ("upiId", "upi_id"),
                ("merchantName", "merchant_name"),
                ("qrCodeUrl", "qr_code_url"),
                ("paymentInstructions", "payment_instructions"),
                ("refundPolicy", "refund_policy"),
                ("enrollmentOpen", "enrollment_open"),
                ("status", "status"),
            ]
            for in_key, col in fields:
                if in_key in config:
                    params.append(config[in_key])
                    set_clauses.append(f"{col} = ${len(params)}")

            if not set_clauses:
                return await CourseRepository.get_by_id(cid)

            set_clauses.append("updated_at = NOW()")
            query = f"""
                UPDATE courses
                SET {', '.join(set_clauses)}
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING *;
            """
            row = await conn.fetchrow(query, *params)
            return dict(row) if row else None

    @staticmethod
    async def get_course_trainers(course_id: UUID | str) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT ct.id, ct.course_id, ct.trainer_user_id, ct.assigned_at,
                       u.name as trainer_name, u.email as trainer_email,
                       tp.title as trainer_title, tp.rating as trainer_rating
                FROM course_trainers ct
                JOIN users u ON u.id = ct.trainer_user_id
                LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
                WHERE ct.course_id = $1
                ORDER BY ct.assigned_at ASC
                """,
                UUID(str(course_id)),
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def assign_course_trainer(course_id: UUID | str, trainer_user_id: UUID | str) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO course_trainers (course_id, trainer_user_id)
                VALUES ($1, $2)
                ON CONFLICT (course_id, trainer_user_id) DO UPDATE SET assigned_at = NOW()
                RETURNING id, course_id, trainer_user_id, assigned_at;
                """,
                UUID(str(course_id)),
                UUID(str(trainer_user_id)),
            )
            return dict(row)

    @staticmethod
    async def remove_course_trainer(course_id: UUID | str, trainer_user_id: UUID | str) -> bool:
        async with get_pg_connection() as conn:
            res = await conn.execute(
                "DELETE FROM course_trainers WHERE course_id = $1 AND trainer_user_id = $2",
                UUID(str(course_id)),
                UUID(str(trainer_user_id)),
            )
            return "DELETE 1" in res

