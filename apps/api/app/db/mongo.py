"""MongoDB access.

Primary driver is Motor against a real MongoDB deployment (the project's chosen primary database).
When `USE_INMEMORY_DB=true` — or when the configured server is unreachable in a non-production
environment — the same API is served by an in-process Mongo-compatible store so that the app,
the seed script and the test suite remain runnable without a local server. Production refuses
the fallback outright (`Settings.assert_production_safe`).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from app.core.config import settings
from app.core.errors import NotFound, ValidationError
from app.core.logging import get_logger

log = get_logger("app.mongo")

_client: Any = None
_db: Any = None
_is_inmemory = False


async def connect_to_mongo() -> Any:
    """Create the client and verify the connection. Called once on startup."""
    global _client, _db, _is_inmemory

    if settings.USE_INMEMORY_DB:
        _client, _is_inmemory = _make_inmemory(), True
    else:
        from motor.motor_asyncio import AsyncIOMotorClient

        candidate = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=3000,
            uuidRepresentation="standard",
            tz_aware=True,
        )
        try:
            await candidate.admin.command("ping")
            _client, _is_inmemory = candidate, False
            log.info("mongo_connected", extra={"db": settings.MONGODB_DB})
        except Exception as exc:
            if settings.is_production:
                raise RuntimeError(f"Cannot reach MongoDB at {settings.MONGODB_URL}: {exc}") from exc
            log.warning(
                "mongo_unreachable_using_inmemory_fallback",
                extra={"url": settings.MONGODB_URL, "error": str(exc)},
            )
            _client, _is_inmemory = _make_inmemory(), True

    _db = _client[settings.MONGODB_DB]
    return _db


def _make_inmemory() -> Any:
    from mongomock_motor import AsyncMongoMockClient

    log.warning("using in-process MongoDB-compatible store (development/test only)")
    return AsyncMongoMockClient()


def get_db() -> Any:
    if _db is None:
        raise RuntimeError("Database not initialised — call connect_to_mongo() first")
    return _db


def is_inmemory() -> bool:
    return _is_inmemory


async def close_mongo() -> None:
    global _client, _db
    if _client is not None and not _is_inmemory:
        _client.close()
    _client, _db = None, None


async def ping_mongo() -> bool:
    try:
        if _is_inmemory:
            await get_db().list_collection_names()
        else:
            await _client.admin.command("ping")
        return True
    except Exception:  # pragma: no cover - infra path
        return False


def set_db_for_tests(db: Any, inmemory: bool = True) -> None:
    global _db, _is_inmemory, _client
    _db, _is_inmemory, _client = db, inmemory, None


# ------------------------------------------------------------------ id helpers
def to_object_id(value: Any, field: str = "id") -> ObjectId:
    """Parse a client-supplied id. A malformed id is a validation error, never a 500."""
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError) as exc:
        raise ValidationError(f"'{field}' is not a valid identifier") from exc


def oid_or_none(value: Any) -> ObjectId | None:
    if value in (None, "", "null"):
        return None
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def serialize(doc: Any) -> Any:
    """Recursively convert ObjectId → str and normalise `_id` to `id` for API output."""
    if doc is None:
        return None
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, list):
        return [serialize(d) for d in doc]
    if isinstance(doc, dict):
        out: dict[str, Any] = {}
        for key, value in doc.items():
            out["id" if key == "_id" else key] = serialize(value)
        return out
    return doc


def require(doc: Any, message: str = "Resource not found") -> Any:
    if doc is None:
        raise NotFound(message)
    return doc


# ------------------------------------------------------------------ time helpers
def utcnow() -> datetime:
    """The single source of "now" — always timezone-aware UTC (SRS §9: store UTC, display local)."""
    return datetime.now(timezone.utc)


def as_utc(value: Any) -> Any:
    """Normalise a datetime read back from the database to timezone-aware UTC.

    BSON stores an instant with no zone, so whether a driver hands back an aware or a naive
    datetime depends on how it was constructed (`tz_aware`). Comparing the two raises, so every
    place that compares or subtracts a stored datetime routes through here.
    """
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
