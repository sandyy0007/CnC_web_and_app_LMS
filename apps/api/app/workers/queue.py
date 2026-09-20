"""Redis-backed job queue.

Deliberately small and dependency-free: a Redis list is the ready queue, a sorted set holds
delayed retries, and a processing list gives at-least-once delivery if a worker dies mid-job.
Jobs that exhaust their attempts land in a dead-letter list so nothing fails silently.

`QUEUE_EAGER=true` runs handlers inline — used by the test suite so job behaviour is asserted
without a worker process.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis_client import get_redis

log = get_logger("app.queue")

Handler = Callable[[dict[str, Any]], Awaitable[Any]]
_handlers: dict[str, Handler] = {}


def job_handler(name: str) -> Callable[[Handler], Handler]:
    def register(fn: Handler) -> Handler:
        _handlers[name] = fn
        return fn

    return register


def registered_handlers() -> dict[str, Handler]:
    return dict(_handlers)


@dataclass
class Job:
    name: str
    payload: dict[str, Any]
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    attempts: int = 0
    #: Read at creation time (not frozen at import) so the limit stays configurable.
    max_attempts: int = field(default_factory=lambda: settings.JOB_MAX_ATTEMPTS)
    enqueued_at: float = field(default_factory=time.time)

    def to_json(self) -> str:
        return json.dumps(
            {
                "id": self.id,
                "name": self.name,
                "payload": self.payload,
                "attempts": self.attempts,
                "maxAttempts": self.max_attempts,
                "enqueuedAt": self.enqueued_at,
            },
            default=str,
        )

    @staticmethod
    def from_json(raw: str) -> "Job":
        data = json.loads(raw)
        return Job(
            id=data["id"],
            name=data["name"],
            payload=data.get("payload", {}),
            attempts=data.get("attempts", 0),
            max_attempts=data.get("maxAttempts") or settings.JOB_MAX_ATTEMPTS,
            enqueued_at=data.get("enqueuedAt", time.time()),
        )


READY = lambda: settings.QUEUE_NAME  # noqa: E731
DELAYED = lambda: f"{settings.QUEUE_NAME}:delayed"  # noqa: E731
PROCESSING = lambda: f"{settings.QUEUE_NAME}:processing"  # noqa: E731
DEAD = lambda: f"{settings.QUEUE_NAME}:dead"  # noqa: E731
STATS = lambda: f"{settings.QUEUE_NAME}:stats"  # noqa: E731


async def enqueue(name: str, payload: dict[str, Any] | None = None, *, delay: int = 0) -> str:
    """Hand work to the background worker. Never raises into the caller's request path."""
    job = Job(name=name, payload=payload or {})

    if settings.QUEUE_EAGER:
        await _run_inline(job)
        return job.id

    try:
        redis = get_redis()
        if delay > 0:
            await redis.zadd(DELAYED(), {job.to_json(): time.time() + delay})
        else:
            await redis.lpush(READY(), job.to_json())
        await redis.hincrby(STATS(), "enqueued", 1)
        log.info("job_enqueued", extra={"job": name, "job_id": job.id, "delay": delay})
    except Exception as exc:  # pragma: no cover - queue outage must not break the request
        log.error("job_enqueue_failed_running_inline", extra={"job": name, "error": str(exc)})
        await _run_inline(job)
    return job.id


async def _run_inline(job: Job) -> None:
    handler = _handlers.get(job.name)
    if not handler:
        log.error("job_handler_missing", extra={"job": job.name})
        return
    try:
        await handler(job.payload)
    except Exception as exc:
        log.error("inline_job_failed", extra={"job": job.name, "error": str(exc)})


async def reserve(timeout: int = 5) -> Job | None:
    """Block for the next ready job, promoting any due delayed jobs first."""
    redis = get_redis()
    await promote_delayed()
    raw = await redis.brpoplpush(READY(), PROCESSING(), timeout=timeout)
    return Job.from_json(raw) if raw else None


async def promote_delayed() -> int:
    redis = get_redis()
    due = await redis.zrangebyscore(DELAYED(), 0, time.time())
    for raw in due:
        removed = await redis.zrem(DELAYED(), raw)
        if removed:
            await redis.lpush(READY(), raw)
    return len(due)


async def acknowledge(job: Job) -> None:
    redis = get_redis()
    await redis.lrem(PROCESSING(), 1, job.to_json())
    await redis.hincrby(STATS(), "completed", 1)


async def fail(job: Job, error: str) -> None:
    """Bounded retry with backoff, then dead-letter + a visible failure (SRS §13.2)."""
    redis = get_redis()
    await redis.lrem(PROCESSING(), 1, job.to_json())
    job.attempts += 1
    if job.attempts >= job.max_attempts:
        await redis.lpush(DEAD(), json.dumps({"job": json.loads(job.to_json()), "error": error}))
        await redis.hincrby(STATS(), "dead", 1)
        log.error("job_dead_lettered", extra={"job": job.name, "job_id": job.id, "error": error})
        handler = _handlers.get(f"{job.name}:on_dead")
        if handler:
            try:
                await handler({**job.payload, "error": error})
            except Exception:  # pragma: no cover
                log.exception("dead_letter_handler_failed")
        return
    backoff = min(300, 5 * (2 ** (job.attempts - 1)))
    await redis.zadd(DELAYED(), {job.to_json(): time.time() + backoff})
    await redis.hincrby(STATS(), "retried", 1)
    log.warning(
        "job_retry_scheduled",
        extra={"job": job.name, "attempts": job.attempts, "in_seconds": backoff, "error": error},
    )


async def requeue_stalled() -> int:
    """Recover jobs whose worker died while holding them."""
    redis = get_redis()
    count = 0
    while await redis.rpoplpush(PROCESSING(), READY()):
        count += 1
        if count > 500:  # pragma: no cover
            break
    if count:
        log.warning("stalled_jobs_requeued", extra={"count": count})
    return count


async def queue_stats() -> dict[str, Any]:
    try:
        redis = get_redis()
        counters = await redis.hgetall(STATS()) or {}
        return {
            "eager": settings.QUEUE_EAGER,
            "ready": await redis.llen(READY()),
            "delayed": await redis.zcard(DELAYED()),
            "processing": await redis.llen(PROCESSING()),
            "dead": await redis.llen(DEAD()),
            "enqueued": int(counters.get("enqueued", 0)),
            "completed": int(counters.get("completed", 0)),
            "retried": int(counters.get("retried", 0)),
            "handlers": sorted(k for k in _handlers if ":on_dead" not in k),
            "checkedAt": datetime.now(timezone.utc),
        }
    except Exception as exc:  # pragma: no cover
        return {"error": str(exc), "eager": settings.QUEUE_EAGER}
