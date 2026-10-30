"""FastAPI application factory."""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.gzip import GZipMiddleware
from bson.errors import InvalidId

from app.core.config import settings
from app.core.errors import (
    AppError,
    app_error_handler,
    error_body,
    http_exception_handler,
    invalid_id_handler,
    unhandled_exception_handler,
    validation_error_handler,
)
from app.core.logging import configure_logging, get_logger
from app.core.redis_client import close_redis, ping_redis
# MongoDB indexes removed - PostgreSQL is single persistent store
# MongoDB driver removed
from app.db.postgres import close_postgres, connect_to_postgres, ping_postgres, run_migrations
from app.routers import (
    admin,
    ai,
    auth,
    ebooks,
    files,
    gamification,
    health,
    home,
    hod,
    live_classes,
    notifications,
    reports,
    student,
    super_admin,
    trainer,
)
from app.services import report_datasets  # noqa: F401  (registers report builders)
from app.workers import jobs  # noqa: F401  (registers job handlers)

log = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings.assert_production_safe()
    try:
        await connect_to_postgres()
        pg_ok = await ping_postgres()
        if not pg_ok:
            raise RuntimeError("PostgreSQL ping failed after connecting pool.")
        applied = await run_migrations()
        log.info("postgres_lifecycle_ready", extra={"connected": True, "migrations_applied": len(applied)})
    except Exception as err:
        log.error("postgres_startup_failed", extra={"error": str(err)})
        raise RuntimeError(f"PostgreSQL connection is required for operation: {err}") from err

    # MongoDB connection removed
    # MongoDB indexes removed
    # Production policy: Do not auto-seed synthetic demo institutions or users into any store.
    redis_ok = await ping_redis()
    log.info(
        "api_started",
        extra={
            "env": settings.ENV,
            "database": "postgresql",
            "postgres": settings.USE_POSTGRES,
            "postgres": True,
            "redis": redis_ok,
        },
    )
    if not redis_ok:
        log.warning("redis_unreachable_sessions_and_queue_degraded")
    yield
    await close_postgres()
    # PostgreSQL pool closed
    # MongoDB closed
    await close_redis()
    log.info("api_stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        description=(
            "Winners Creek — college soft-skills, personality development and employability platform.\n\n"
            "**Practise → Assess → Improve → Become Employable**\n\n"
            "Every endpoint independently verifies authentication, role, tenant scope and "
            "resource scope. Client-supplied scope parameters are never trusted."
        ),
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Idempotency-Key"],
        expose_headers=["X-Request-Id", "Retry-After"],
        max_age=600,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        """Correlation id + timing + baseline security headers."""
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:
            log.exception(
                "unhandled_middleware_exception",
                extra={"path": request.url.path, "request_id": request_id},
            )
            response = JSONResponse(
                status_code=500,
                content=error_body("INTERNAL_ERROR", "Something went wrong", request_id),
            )
        duration_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms}ms"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if duration_ms > 2000:
            log.warning(
                "slow_request",
                extra={"path": request.url.path, "ms": duration_ms, "request_id": request_id},
            )
        return response

    app.add_exception_handler(InvalidId, invalid_id_handler)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    prefix = settings.API_V1_PREFIX
    app.include_router(health.router)
    app.include_router(auth.router, prefix=f"{prefix}/auth", tags=["auth"])
    app.include_router(home.router, prefix=f"{prefix}/home", tags=["home"])

    @app.get(f"{prefix}/courses", tags=["courses"])
    async def get_courses_alias(
        search: str | None = None,
        category: str | None = None,
        limit: int = 12,
    ):
        return await home.courses(search=search, category=category, limit=limit)

    app.include_router(student.router, prefix=f"{prefix}/student", tags=["student"])
    app.include_router(trainer.router, prefix=f"{prefix}/trainer", tags=["trainer"])
    app.include_router(hod.router, prefix=f"{prefix}/hod", tags=["hod"])
    app.include_router(admin.router, prefix=f"{prefix}/admin", tags=["admin"])
    app.include_router(
        notifications.router, prefix=f"{prefix}/notifications", tags=["notifications"]
    )
    app.include_router(reports.router, prefix=f"{prefix}/reports", tags=["reports"])
    app.include_router(ai.router, prefix=f"{prefix}/ai", tags=["ai"])
    app.include_router(files.router, prefix=f"{prefix}/files", tags=["files"])
    app.include_router(ebooks.router, prefix=f"{prefix}/ebooks", tags=["ebooks"])
    app.include_router(
        super_admin.router, prefix=f"{prefix}/super-admin", tags=["super-admin"]
    )
    app.include_router(gamification.router, prefix=f"{prefix}", tags=["gamification"])
    app.include_router(
        live_classes.router, prefix=f"{prefix}/live-classes", tags=["live-classes"]
    )
    return app


app = create_app()
