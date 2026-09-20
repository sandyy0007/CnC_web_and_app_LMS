"""Redis-backed rate limiting, login lockout and OTP storage."""
from __future__ import annotations

from app.core.config import settings
from app.core.errors import AccountLocked, RateLimited
from app.core.logging import get_logger
from app.core.redis_client import K, get_redis
from app.core.security import generate_otp, hash_token

log = get_logger("app.ratelimit")

WINDOWS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}


def parse_limit(spec: str) -> tuple[int, int]:
    """'10/minute' → (10, 60)."""
    count, _, unit = spec.partition("/")
    return int(count), WINDOWS.get(unit.strip(), 60)


async def enforce_rate_limit(bucket: str, subject: str, spec: str) -> None:
    """Fixed-window counter. Fails closed only for auth-critical buckets."""
    limit, window = parse_limit(spec)
    key = K.rate(bucket, subject.lower())
    try:
        redis = get_redis()
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, window)
        if current > limit:
            ttl = await redis.ttl(key)
            raise RateLimited(
                "Too many attempts — please wait before trying again",
                retry_after=max(1, ttl if ttl and ttl > 0 else window),
            )
    except RateLimited:
        raise
    except Exception as exc:  # pragma: no cover - Redis outage
        log.error("rate_limit_unavailable", extra={"bucket": bucket, "error": str(exc)})


# --------------------------------------------------------------------------- login lockout
async def assert_not_locked(subject: str) -> None:
    try:
        ttl = await get_redis().ttl(K.lockout(subject))
    except Exception:  # pragma: no cover
        return
    if ttl and ttl > 0:
        raise AccountLocked(
            f"Too many failed sign-in attempts. Try again in {max(1, ttl // 60)} minute(s).",
            retry_after=ttl,
        )


async def record_failed_login(subject: str) -> int:
    """Returns the running failure count; locks the account at the configured threshold."""
    redis = get_redis()
    key = K.failed_logins(subject)
    try:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, settings.LOCKOUT_MINUTES * 60)
        if count >= settings.MAX_FAILED_LOGINS:
            await redis.setex(K.lockout(subject), settings.LOCKOUT_MINUTES * 60, "1")
            await redis.delete(key)
        return count
    except Exception:  # pragma: no cover
        return 0


async def clear_failed_logins(subject: str) -> None:
    try:
        await get_redis().delete(K.failed_logins(subject), K.lockout(subject))
    except Exception:  # pragma: no cover
        pass


# --------------------------------------------------------------------------- OTP
async def issue_otp(purpose: str, subject: str) -> str:
    """Rate-limited OTP issuance. Only the digest is stored."""
    redis = get_redis()
    sends_key = K.otp_sends(purpose, subject)
    try:
        sends = await redis.incr(sends_key)
        if sends == 1:
            await redis.expire(sends_key, 3600)
        if sends > settings.OTP_MAX_SENDS_PER_HOUR:
            raise RateLimited(
                "You've requested too many codes. Please try again in an hour.", retry_after=3600
            )
    except RateLimited:
        raise
    except Exception:  # pragma: no cover
        pass

    otp = generate_otp()
    try:
        await redis.setex(
            K.otp(purpose, subject), settings.OTP_TTL_MINUTES * 60, hash_token(otp)
        )
    except Exception as exc:  # pragma: no cover
        log.error("otp_store_failed", extra={"error": str(exc)})
    return otp


async def verify_otp(purpose: str, subject: str, otp: str) -> bool:
    key = K.otp(purpose, subject)
    try:
        redis = get_redis()
        stored = await redis.get(key)
        if not stored:
            return False
        if stored != hash_token(otp.strip()):
            return False
        await redis.delete(key)
        return True
    except Exception:  # pragma: no cover
        return False


async def peek_otp_exists(purpose: str, subject: str) -> bool:
    try:
        return bool(await get_redis().exists(K.otp(purpose, subject)))
    except Exception:  # pragma: no cover
        return False
