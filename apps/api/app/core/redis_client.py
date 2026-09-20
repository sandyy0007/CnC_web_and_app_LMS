"""Redis: refresh-token/session tracking, revocation, OTP, rate limits, cache, job queue."""
from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.redis")
_client: Any = None


def _build_client() -> Any:
    if settings.USE_FAKE_REDIS:
        import fakeredis.aioredis

        log.warning("using in-process fake Redis (development/test only)")
        return fakeredis.aioredis.FakeRedis(decode_responses=True)
    import redis.asyncio as aioredis

    return aioredis.from_url(
        settings.REDIS_URL, decode_responses=True, health_check_interval=30, socket_timeout=5
    )


def get_redis() -> Any:
    global _client
    if _client is None:
        _client = _build_client()
    return _client


async def ping_redis() -> bool:
    try:
        return bool(await get_redis().ping())
    except Exception as exc:  # pragma: no cover - infra path
        log.error("redis_ping_failed", extra={"error": str(exc)})
        return False


async def close_redis() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:  # pragma: no cover
            pass
        _client = None


def reset_redis_for_tests() -> None:
    global _client
    _client = None


# ------------------------------------------------------------------ key namespace
class K:
    @staticmethod
    def session(user_id: str, session_id: str) -> str:
        return f"sess:{user_id}:{session_id}"

    @staticmethod
    def session_index(user_id: str) -> str:
        return f"sess:index:{user_id}"

    @staticmethod
    def refresh(jti: str) -> str:
        return f"rt:{jti}"

    @staticmethod
    def refresh_family(family_id: str) -> str:
        return f"rtfam:{family_id}"

    @staticmethod
    def denylist(jti: str) -> str:
        return f"deny:{jti}"

    @staticmethod
    def user_revoked_at(user_id: str) -> str:
        return f"revoked_at:{user_id}"

    @staticmethod
    def otp(purpose: str, subject: str) -> str:
        return f"otp:{purpose}:{subject.lower()}"

    @staticmethod
    def otp_sends(purpose: str, subject: str) -> str:
        return f"otp:sends:{purpose}:{subject.lower()}"

    @staticmethod
    def failed_logins(subject: str) -> str:
        return f"login:failed:{subject.lower()}"

    @staticmethod
    def lockout(subject: str) -> str:
        return f"login:lock:{subject.lower()}"

    @staticmethod
    def rate(bucket: str, subject: str) -> str:
        return f"rate:{bucket}:{subject}"

    @staticmethod
    def cache(name: str, digest: str) -> str:
        return f"cache:{name}:{digest}"

    @staticmethod
    def scope_denials(user_id: str) -> str:
        return f"anomaly:scope:{user_id}"
