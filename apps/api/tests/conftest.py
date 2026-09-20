"""Test harness.

The environment is configured **before** any application module is imported so the cached
`Settings` picks up test values: in-process MongoDB-compatible store, fake Redis, eager job queue
(so background work is asserted inline), local storage and the deterministic AI provider.
"""
from __future__ import annotations

import os

os.environ.update(
    {
        "ENV": "test",
        "USE_INMEMORY_DB": "true",
        "USE_FAKE_REDIS": "true",
        "QUEUE_EAGER": "true",
        "STORAGE_DRIVER": "local",
        "LOCAL_STORAGE_ROOT": "./.storage-test",
        "AI_PROVIDER": "mock",
        "STT_PROVIDER": "mock",
        "EMAIL_PROVIDER": "console",
        "JWT_SECRET": "test-secret-not-used-in-production-000000",
        "ALLOW_DEV_ENDPOINTS": "true",
        "LOGIN_RATE_LIMIT": "500/minute",
        "MONGODB_DB": "eedi_lms_test",
        "LOG_LEVEL": "WARNING",
    }
)

from typing import Any, AsyncIterator  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.logging import configure_logging  # noqa: E402
from app.core.redis_client import get_redis, reset_redis_for_tests  # noqa: E402
from app.db.mongo import connect_to_mongo, get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.seed.run import DEMO_PASSWORD  # noqa: E402
from app.seed.run import seed as run_seed  # noqa: E402
from app.services.ai_provider import reset_ai_for_tests  # noqa: E402
from app.services.email_service import reset_email_for_tests  # noqa: E402
from app.services.notifications import reset_push_for_tests  # noqa: E402
from app.services.storage import purge_local_storage, reset_storage_for_tests  # noqa: E402

configure_logging()

API = "/api/v1"

#: Seeded demo accounts.
ACCOUNTS = {
    "student": "alex.johnson@eedi.com",
    "trainer": "r.bose@abcengg.edu",
    "hod": "priya.kulkarni@abcengg.edu",
    "admin": "rishabh.kumawat@abcengg.edu",
    "super_admin": "superadmin@eedilms.app",
    "other_hod": "priya.kumawat@abcengg.edu",  # AI/Data Science — used for isolation tests
    "other_trainer": "aids.trainer1@abcengg.edu",
}


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def seeded_db() -> AsyncIterator[Any]:
    """One seeded database for the whole session — seeding is deterministic and read-heavy."""
    await connect_to_mongo()
    reset_redis_for_tests()
    reset_storage_for_tests()
    reset_ai_for_tests()
    reset_push_for_tests()
    reset_email_for_tests()
    purge_local_storage()
    await run_seed(reset=True)
    yield get_db()
    purge_local_storage()


@pytest_asyncio.fixture
async def client(seeded_db) -> AsyncIterator[AsyncClient]:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://testserver", follow_redirects=True
    ) as http:
        yield http


@pytest_asyncio.fixture(autouse=True)
async def _clear_rate_limits(seeded_db) -> AsyncIterator[None]:
    """Rate-limit and lockout counters must not leak between tests."""
    redis = get_redis()
    for pattern in ("rate:*", "login:*", "anomaly:*", "otp:*"):
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
    yield


# --------------------------------------------------------------------------- helpers
class Session:
    """A signed-in API session: attaches the bearer token to every request."""

    def __init__(self, http: AsyncClient, token: str, user: dict[str, Any]) -> None:
        self._http = http
        self.token = token
        self.user = user

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    async def get(self, url: str, **kwargs):
        return await self._http.get(f"{API}{url}", headers=self.headers, **kwargs)

    async def post(self, url: str, **kwargs):
        return await self._http.post(f"{API}{url}", headers=self.headers, **kwargs)

    async def patch(self, url: str, **kwargs):
        return await self._http.patch(f"{API}{url}", headers=self.headers, **kwargs)

    async def put(self, url: str, **kwargs):
        return await self._http.put(f"{API}{url}", headers=self.headers, **kwargs)

    async def delete(self, url: str, **kwargs):
        return await self._http.delete(f"{API}{url}", headers=self.headers, **kwargs)


async def login(http: AsyncClient, identifier: str, password: str = DEMO_PASSWORD) -> Session:
    response = await http.post(
        f"{API}/auth/login", json={"identifier": identifier, "password": password}
    )
    assert response.status_code == 200, f"login failed for {identifier}: {response.text}"
    body = response.json()
    assert body["success"] is True, body
    return Session(http, body["data"]["accessToken"], body["data"]["user"])


@pytest_asyncio.fixture
async def student(client: AsyncClient) -> Session:
    return await login(client, ACCOUNTS["student"])


@pytest_asyncio.fixture
async def trainer(client: AsyncClient) -> Session:
    return await login(client, ACCOUNTS["trainer"])


@pytest_asyncio.fixture
async def hod(client: AsyncClient) -> Session:
    return await login(client, ACCOUNTS["hod"])


@pytest_asyncio.fixture
async def other_hod(client: AsyncClient) -> Session:
    return await login(client, ACCOUNTS["other_hod"])


@pytest_asyncio.fixture
async def other_trainer(client: AsyncClient) -> Session:
    return await login(client, ACCOUNTS["other_trainer"])


@pytest_asyncio.fixture
async def admin(client: AsyncClient) -> Session:
    return await login(client, ACCOUNTS["admin"])


@pytest_asyncio.fixture
async def super_admin(client: AsyncClient) -> Session:
    return await login(client, ACCOUNTS["super_admin"])


def error_code(response) -> str:
    body = response.json()
    return (body.get("error") or {}).get("code", "")
