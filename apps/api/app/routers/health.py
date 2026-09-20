"""Liveness and readiness."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.core.redis_client import ping_redis
from app.db.mongo import is_inmemory, ping_mongo
from app.services.ai_provider import provider_health
from app.services.storage import get_storage
from app.workers.queue import queue_stats

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.ENV, "version": "1.0.0"}


@router.get("/health/ready")
async def ready() -> dict:
    mongo_ok = await ping_mongo()
    redis_ok = await ping_redis()
    return {
        "status": "ok" if (mongo_ok and redis_ok) else "degraded",
        "checks": {
            "mongo": {"ok": mongo_ok, "usingDevelopmentFallback": is_inmemory()},
            "redis": {"ok": redis_ok},
            "storage": {"driver": get_storage().name},
            "ai": provider_health(),
            "queue": await queue_stats(),
        },
    }
