"""Institution and Department PostgreSQL repository."""
from __future__ import annotations

from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection


class InstitutionRepository:
    @staticmethod
    async def get_by_id(institution_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, name, code, institution_type, training_type, address, city, state, country,
                       contact_email, contact_phone, status, created_at, updated_at
                FROM institutions
                WHERE id = $1 AND deleted_at IS NULL
                """,
                UUID(str(institution_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_code(code: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, name, code, institution_type, training_type, address, city, state, country,
                       contact_email, contact_phone, status, created_at, updated_at
                FROM institutions
                WHERE UPPER(code) = UPPER($1) AND deleted_at IS NULL
                """,
                code.strip(),
            )
            return dict(row) if row else None

    @staticmethod
    async def create(
        name: str,
        code: str,
        institution_type: str = "COLLEGE",
        training_type: str = "COLLEGE",
        address: str | None = None,
        city: str | None = None,
        state: str | None = None,
        country: str = "India",
        contact_email: str | None = None,
        contact_phone: str | None = None,
    ) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO institutions (name, code, institution_type, training_type, address, city, state, country, contact_email, contact_phone)
                VALUES ($1, UPPER($2), $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, name, code, institution_type, training_type, address, city, state, country, contact_email, contact_phone, status, created_at
                """,
                name.strip(),
                code.strip(),
                institution_type,
                training_type,
                address,
                city,
                state,
                country,
                contact_email,
                contact_phone,
            )
            return dict(row)

    @staticmethod
    async def list_all(
        institution_type: str | None = None,
        training_type: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conditions = ["deleted_at IS NULL"]
        params: list[Any] = []

        if institution_type:
            params.append(institution_type)
            conditions.append(f"institution_type = ${len(params)}")
        if training_type:
            params.append(training_type)
            conditions.append(f"training_type = ${len(params)}")
        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(name ILIKE ${len(params)} OR code ILIKE ${len(params)})")

        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT id, name, code, institution_type, training_type, city, state, status, created_at
            FROM institutions
            WHERE {' AND '.join(conditions)}
            ORDER BY name ASC
            {limit_clause} {offset_clause}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def count_all(
        institution_type: str | None = None,
        training_type: str | None = None,
    ) -> int:
        conditions = ["deleted_at IS NULL"]
        params: list[Any] = []
        if institution_type:
            params.append(institution_type)
            conditions.append(f"institution_type = ${len(params)}")
        if training_type:
            params.append(training_type)
            conditions.append(f"training_type = ${len(params)}")

        query = f"SELECT COUNT(*) FROM institutions WHERE {' AND '.join(conditions)}"
        async with get_pg_connection() as conn:
            return await conn.fetchval(query, *params) or 0

    @staticmethod
    async def get_departments(institution_id: UUID | str) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id, institution_id, name, code, status, created_at
                FROM departments
                WHERE institution_id = $1 AND deleted_at IS NULL
                ORDER BY name ASC
                """,
                UUID(str(institution_id)),
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def create_department(institution_id: UUID | str, name: str, code: str) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO departments (institution_id, name, code)
                VALUES ($1, $2, UPPER($3))
                RETURNING id, institution_id, name, code, status, created_at
                """,
                UUID(str(institution_id)),
                name.strip(),
                code.strip(),
            )
            return dict(row)

