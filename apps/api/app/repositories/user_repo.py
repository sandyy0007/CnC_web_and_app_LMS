"""User and Profile PostgreSQL repository."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection


class UserRepository:
    @staticmethod
    async def get_by_id(user_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, password_hash, name, role, institution_id, department_id,
                       phone, status, last_login_at, created_at
                FROM users
                WHERE id = $1 AND deleted_at IS NULL
                """,
                UUID(str(user_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_email(email: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, password_hash, name, role, institution_id, department_id,
                       phone, status, last_login_at, created_at
                FROM users
                WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
                """,
                email.strip(),
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_identifier(identifier: str) -> dict[str, Any] | None:
        """Find user by email or by college roll number."""
        clean_id = identifier.strip()
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.password_hash, u.name, u.role, u.institution_id, u.department_id,
                       u.phone, u.status, u.last_login_at, u.created_at, sp.roll_number
                FROM users u
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                WHERE (LOWER(u.email) = LOWER($1) OR UPPER(sp.roll_number) = UPPER($1))
                  AND u.deleted_at IS NULL
                LIMIT 1
                """,
                clean_id,
            )
            return dict(row) if row else None

    @staticmethod
    async def create_user(
        email: str,
        password_hash: str,
        name: str,
        role: str = "STUDENT",
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        phone: str | None = None,
    ) -> dict[str, Any]:
        inst_uuid = UUID(str(institution_id)) if institution_id else None
        dept_uuid = UUID(str(department_id)) if department_id else None
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO users (email, password_hash, name, role, institution_id, department_id, phone)
                VALUES (LOWER($1), $2, $3, $4, $5, $6, $7)
                RETURNING id, email, name, role, institution_id, department_id, phone, status, created_at
                """,
                email.strip(),
                password_hash,
                name.strip(),
                role,
                inst_uuid,
                dept_uuid,
                phone,
            )
            return dict(row)

    @staticmethod
    async def update_last_login(user_id: UUID | str) -> None:
        async with get_pg_connection() as conn:
            await conn.execute(
                "UPDATE users SET last_login_at = $1 WHERE id = $2",
                datetime.now(timezone.utc),
                UUID(str(user_id)),
            )

    @staticmethod
    async def create_student_profile(
        user_id: UUID | str,
        roll_number: str,
        institution_id: UUID | str,
        department_id: UUID | str,
        batch_id: UUID | str | None = None,
        avatar_url: str | None = None,
    ) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO student_profiles (user_id, roll_number, institution_id, department_id, batch_id, avatar_url)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, user_id, roll_number, institution_id, department_id, batch_id, avatar_url, created_at
                """,
                UUID(str(user_id)),
                roll_number.strip(),
                UUID(str(institution_id)),
                UUID(str(department_id)),
                UUID(str(batch_id)) if batch_id else None,
                avatar_url,
            )
            return dict(row)

    @staticmethod
    async def get_student_profile(user_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT sp.id, sp.user_id, sp.roll_number, sp.institution_id, sp.department_id, sp.batch_id,
                       sp.avatar_url, u.name, u.email, u.phone, i.name as institution_name,
                       d.name as department_name, b.name as batch_name
                FROM student_profiles sp
                JOIN users u ON u.id = sp.user_id
                LEFT JOIN institutions i ON i.id = sp.institution_id
                LEFT JOIN departments d ON d.id = sp.department_id
                LEFT JOIN batches b ON b.id = sp.batch_id
                WHERE sp.user_id = $1
                """,
                UUID(str(user_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def list_by_scope(
        role: str | None = None,
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conditions = ["u.deleted_at IS NULL"]
        params: list[Any] = []

        if role:
            params.append(role)
            conditions.append(f"u.role = ${len(params)}")
        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"u.institution_id = ${len(params)}")
        if department_id:
            params.append(UUID(str(department_id)))
            conditions.append(f"u.department_id = ${len(params)}")
        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)})")

        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT u.id, u.email, u.name, u.role, u.institution_id, u.department_id, u.status,
                   u.created_at, i.name as institution_name, d.name as department_name
            FROM users u
            LEFT JOIN institutions i ON i.id = u.institution_id
            LEFT JOIN departments d ON d.id = u.department_id
            WHERE {' AND '.join(conditions)}
            ORDER BY u.name ASC
            {limit_clause} {offset_clause}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def count_by_scope(
        role: str | None = None,
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
    ) -> int:
        conditions = ["deleted_at IS NULL"]
        params: list[Any] = []

        if role:
            params.append(role)
            conditions.append(f"role = ${len(params)}")
        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"institution_id = ${len(params)}")
        if department_id:
            params.append(UUID(str(department_id)))
            conditions.append(f"department_id = ${len(params)}")

        query = f"SELECT COUNT(*) FROM users WHERE {' AND '.join(conditions)}"
        async with get_pg_connection() as conn:
            return await conn.fetchval(query, *params) or 0

