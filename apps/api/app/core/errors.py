"""Consistent error envelope + typed application errors (§20, SRS §13)."""
from __future__ import annotations

from typing import Any

from fastapi import Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Base for every error the API deliberately returns."""

    code = "INTERNAL_ERROR"
    http_status = status.HTTP_500_INTERNAL_SERVER_ERROR
    message = "Something went wrong"

    def __init__(self, message: str | None = None, details: Any = None) -> None:
        self.message = message or self.message
        self.details = details
        super().__init__(self.message)


class ValidationError(AppError):
    code = "VALIDATION_ERROR"
    http_status = status.HTTP_400_BAD_REQUEST
    message = "The request could not be validated"


class Unauthenticated(AppError):
    code = "UNAUTHENTICATED"
    http_status = status.HTTP_401_UNAUTHORIZED
    message = "Authentication required"


class RoleForbidden(AppError):
    code = "ROLE_FORBIDDEN"
    http_status = status.HTTP_403_FORBIDDEN
    message = "Your role does not permit this action"


class ScopeForbidden(AppError):
    """Never leaks whether the out-of-scope resource exists (SRS §13.1)."""

    code = "SCOPE_FORBIDDEN"
    http_status = status.HTTP_403_FORBIDDEN
    message = "You don't have access to this resource"


class NotFound(AppError):
    code = "NOT_FOUND"
    http_status = status.HTTP_404_NOT_FOUND
    message = "Resource not found"


class Conflict(AppError):
    code = "CONFLICT"
    http_status = status.HTTP_409_CONFLICT
    message = "The resource conflicts with its current state"


class BusinessRuleViolation(AppError):
    code = "BUSINESS_RULE_VIOLATION"
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY
    message = "This action violates a business rule"


class RateLimited(AppError):
    code = "RATE_LIMITED"
    http_status = status.HTTP_429_TOO_MANY_REQUESTS
    message = "Too many requests — please retry shortly"

    def __init__(self, message: str | None = None, retry_after: int = 60, details: Any = None):
        super().__init__(message, details)
        self.retry_after = retry_after


class AccountLocked(RateLimited):
    code = "ACCOUNT_LOCKED"
    message = "Account temporarily locked after repeated failed attempts"


class ServiceUnavailable(AppError):
    code = "SERVICE_UNAVAILABLE"
    http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    message = "A dependent service is temporarily unavailable"


def error_body(code: str, message: str, request_id: str, details: Any = None) -> dict:
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "requestId": request_id,
            "details": jsonable_encoder(details) if details is not None else None,
        },
    }


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    headers = {}
    if isinstance(exc, RateLimited):
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse(
        status_code=exc.http_status,
        content=error_body(exc.code, exc.message, _request_id(request), exc.details),
        headers=headers,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [
        {"field": ".".join(str(p) for p in e.get("loc", ())[1:]) or "body", "message": e.get("msg", "")}
        for e in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=error_body(
            "VALIDATION_ERROR", "One or more fields are invalid", _request_id(request), fields
        ),
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    mapping = {
        401: "UNAUTHENTICATED",
        403: "SCOPE_FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        429: "RATE_LIMITED",
    }
    code = mapping.get(exc.status_code, "HTTP_ERROR" if exc.status_code < 500 else "INTERNAL_ERROR")
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(code, detail, _request_id(request)),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never expose stack traces, DB internals or secrets to the client (§20).
    from app.core.logging import get_logger

    get_logger("app.unhandled").exception(
        "unhandled_exception", extra={"request_id": _request_id(request), "path": request.url.path}
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_body("INTERNAL_ERROR", "Something went wrong", _request_id(request)),
    )


async def invalid_id_handler(request: Request, exc: Any) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content=error_body("NOT_FOUND", "Resource not found", _request_id(request)),
    )
