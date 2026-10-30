"""PostgreSQL connection and connection pool management using asyncpg.

Primary production database driver for Winners Creek / EEDI LMS.
Serves relational data models, transactions, foreign key enforcement, and audit logs.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator
import asyncpg

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.postgres")

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Set up JSON codecs and session configuration per connection."""
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def connect_to_postgres() -> asyncpg.Pool:
    """Initialize asyncpg connection pool."""
    global _pool
    import asyncio
    current_loop = asyncio.get_running_loop()

    if _pool is not None:
        if getattr(_pool, "_loop", None) is current_loop and not getattr(_pool, "_closed", False):
            return _pool
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None

    log.info("postgres_connecting", extra={"url": settings.DATABASE_URL.split("@")[-1]})
    try:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=settings.PG_POOL_MIN_SIZE,
            max_size=settings.PG_POOL_MAX_SIZE,
            init=_init_connection,
            timeout=10.0,
            command_timeout=30.0,
        )
        log.info("postgres_connected", extra={"database": "cnc"})
        return _pool
    except Exception as exc:
        log.error("postgres_connection_failed", extra={"error": str(exc)})
        raise RuntimeError(f"Cannot connect to PostgreSQL at {settings.DATABASE_URL}: {exc}") from exc


async def get_or_create_pg_pool() -> asyncpg.Pool:
    """Ensure a valid connection pool bound to the currently running event loop."""
    global _pool
    import asyncio
    current_loop = asyncio.get_running_loop()

    if _pool is not None and not getattr(_pool, "_closed", False):
        if getattr(_pool, "_loop", None) is current_loop:
            return _pool
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None

    _pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        min_size=settings.PG_POOL_MIN_SIZE,
        max_size=settings.PG_POOL_MAX_SIZE,
        init=_init_connection,
        timeout=10.0,
        command_timeout=30.0,
    )
    return _pool


def get_pg_pool() -> asyncpg.Pool:
    """Retrieve the global connection pool."""
    if _pool is None or getattr(_pool, "_closed", False):
        raise RuntimeError("PostgreSQL connection pool not initialized. Call connect_to_postgres() first.")
    return _pool


async def close_postgres() -> None:
    """Close the global connection pool on application shutdown."""
    global _pool
    if _pool is not None and not getattr(_pool, "_closed", False):
        await _pool.close()
        _pool = None
        log.info("postgres_pool_closed")


async def ping_postgres() -> bool:
    """Health check for PostgreSQL."""
    try:
        pool = await get_or_create_pg_pool()
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT 1")
            return val == 1
    except Exception:
        return False


@asynccontextmanager
async def get_pg_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Context manager for acquiring a connection from the pool."""
    pool = await get_or_create_pg_pool()
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def pg_transaction() -> AsyncGenerator[asyncpg.Connection, None]:
    """Context manager providing an atomic database transaction."""
    pool = await get_or_create_pg_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


ADVISORY_LOCK_ID = 847291048  # Arbitrary 64-bit integer lock for migrations


async def run_migrations() -> list[str]:
    """Run pending database migrations safely using PostgreSQL advisory locks.

    Guarantees concurrency safety across multiple API replicas and worker instances.
    Each migration file is executed once inside an atomic transaction.
    """
    from pathlib import Path

    possible_paths = [
        Path("apps/api/migrations"),
        Path("migrations"),
        Path(__file__).resolve().parent.parent.parent / "migrations",
    ]
    migrations_dir: Path | None = None
    for p in possible_paths:
        if p.is_dir():
            migrations_dir = p
            break

    if not migrations_dir:
        log.warning("migrations_dir_not_found")
        return []

    applied_migrations: list[str] = []
    pool = await get_or_create_pg_pool()

    async with pool.acquire() as conn:
        # Acquire advisory lock to prevent race conditions during multi-instance boot
        await conn.execute("SELECT pg_advisory_lock($1)", ADVISORY_LOCK_ID)
        try:
            # Ensure migration tracking table exists
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(255) PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )

            # Get all applied versions
            rows = await conn.fetch("SELECT version FROM schema_migrations")
            already_applied = {r["version"] for r in rows}

            # Discover all .sql files sorted by filename
            sql_files = sorted(migrations_dir.glob("*.sql"))

            for sql_file in sql_files:
                version_name = sql_file.name
                if version_name in already_applied:
                    continue

                log.info("applying_migration", extra={"version": version_name})
                sql_content = sql_file.read_text(encoding="utf-8")

                async with conn.transaction():
                    await conn.execute(sql_content)
                    await conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES ($1)",
                        version_name,
                    )

                applied_migrations.append(version_name)
                log.info("migration_applied", extra={"version": version_name})

        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", ADVISORY_LOCK_ID)

    return applied_migrations
