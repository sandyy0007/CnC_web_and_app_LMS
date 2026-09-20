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
                   duration_hours, fee, published, order_index, created_at
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
                       duration_hours, fee, published, order_index, created_at
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
                       duration_hours, fee, published, order_index, created_at
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
                "SELECT DISTINCT category FROM courses WHERE deleted_at IS NULL ORDER BY category ASC"
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

