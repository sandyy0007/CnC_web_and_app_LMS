"""Worker entrypoint.

    python -m app.workers.worker

Reserves jobs from Redis, runs the registered handler, acknowledges on success and schedules a
bounded retry on failure. Stalled jobs (worker killed mid-job) are recovered at startup.
"""
from __future__ import annotations

import asyncio
import signal
import time

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.redis_client import close_redis, ping_redis
from app.db.mongo import close_mongo, connect_to_mongo
from app.workers import jobs  # noqa: F401  (registers every handler)
from app.workers.queue import (
    acknowledge,
    fail,
    promote_delayed,
    registered_handlers,
    requeue_stalled,
    reserve,
)

log = get_logger("app.worker")
_stop = asyncio.Event()


def _install_signal_handlers() -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop.set)
        except NotImplementedError:  # pragma: no cover - non-POSIX
            pass


async def run_once(timeout: int = 5) -> bool:
    """Process at most one job. Returns True if a job was handled."""
    job = await reserve(timeout=timeout)
    if job is None:
        return False
    handler = registered_handlers().get(job.name)
    if handler is None:
        log.error("no_handler_registered", extra={"job": job.name, "job_id": job.id})
        await fail(job, f"no handler registered for '{job.name}'")
        return True

    started = time.perf_counter()
    try:
        await handler(job.payload)
        await acknowledge(job)
        log.info(
            "job_completed",
            extra={
                "job": job.name,
                "job_id": job.id,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )
    except Exception as exc:
        log.exception("job_failed", extra={"job": job.name, "job_id": job.id})
        await fail(job, f"{type(exc).__name__}: {exc}")
    return True


async def main() -> None:
    configure_logging()
    settings.assert_production_safe()
    await connect_to_mongo()
    if not await ping_redis():
        log.error("redis_unavailable_worker_cannot_start")
        return

    _install_signal_handlers()
    recovered = await requeue_stalled()
    log.info(
        "worker_started",
        extra={
            "queue": settings.QUEUE_NAME,
            "handlers": sorted(k for k in registered_handlers() if ":on_dead" not in k),
            "recovered": recovered,
        },
    )

    idle_ticks = 0
    while not _stop.is_set():
        try:
            handled = await run_once(timeout=2)
            idle_ticks = 0 if handled else idle_ticks + 1
            if idle_ticks % 15 == 0:
                await promote_delayed()
        except asyncio.CancelledError:  # pragma: no cover
            break
        except Exception:  # pragma: no cover - keep the worker alive
            log.exception("worker_loop_error")
            await asyncio.sleep(1)

    log.info("worker_stopping")
    await close_mongo()
    await close_redis()


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())
