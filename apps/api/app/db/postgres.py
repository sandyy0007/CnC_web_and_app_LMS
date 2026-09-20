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
