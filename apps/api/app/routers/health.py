"""Liveness and readiness."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.core.redis_client import ping_redis
from app.db.postgres import are_migrations_ready, ping_postgres
from app.services.ai_provider import provider_health
from app.services.storage import get_storage
from app.workers.queue import queue_stats

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.ENV, "version": "1.0.0"}


@router.get("/health/ready")
async def ready() -> dict:
    pg_ok = await ping_postgres()
    redis_ok = await ping_redis()
    migrations_ok = are_migrations_ready()
    return {
        "status": "ok" if (pg_ok and redis_ok and migrations_ok) else "degraded",
        "checks": {
            "postgres": {"ok": pg_ok, "migrations_ready": migrations_ok},
            "redis": {"ok": redis_ok},
            "storage": {"driver": get_storage().name},
            "ai": provider_health(),
            "queue": await queue_stats(),
        },
    }
