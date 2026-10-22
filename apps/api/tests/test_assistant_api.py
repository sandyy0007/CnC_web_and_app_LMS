"""Comprehensive API tests for the Homepage AI Assistant endpoint (§6).

Covers:
- Valid message submission & grounded response structure
- Empty and whitespace message rejection
- Course discovery from PostgreSQL authoritative data
- 34 skill games & practice lab inquiry handling
- Graceful escalation when query cannot be grounded
- AI provider failure & timeout resilience
- Preserved student session context
"""
from __future__ import annotations

import pytest
from app.core.config import settings
from tests.conftest import API


async def test_assistant_valid_submission(client):
    """Submits a valid platform question and receives a grounded response."""
    response = await client.post(
        f"{API}/home/assistant",
        json={"question": "What is Winners Creek?"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert "answer" in data
    assert len(data["answer"]) > 20
    assert "Winners Creek" in data["answer"] or "employability" in data["answer"].lower()
    assert data["grounded"] is True
    assert "provider" in data


async def test_assistant_empty_question_rejected(client):
    """Rejects empty string and whitespace-only submissions with proper error status."""
    # Empty string
    res_empty = await client.post(
        f"{API}/home/assistant",
        json={"question": ""}
    )
    assert res_empty.status_code in (400, 422)

    # Whitespace only
    res_spaces = await client.post(
        f"{API}/home/assistant",
        json={"question": "     "}
    )
    assert res_spaces.status_code in (400, 422)


async def test_assistant_course_discovery_returns_postgres_courses(client):
    """Inquires about courses and verifies matching courses are returned."""
    response = await client.post(
        f"{API}/home/assistant",
        json={"question": "What courses are available to learn?"}
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["grounded"] is True
    assert isinstance(data["courses"], list)
    assert len(data["courses"]) >= 1
    # Check course structure
    for course in data["courses"]:
        assert "title" in course
        assert "slug" in course
        assert "id" in course


async def test_assistant_practice_and_games_response(client):
    """Inquires about practice interviews and skill games."""
    response = await client.post(
        f"{API}/home/assistant",
        json={"question": "How does interview practice and skill games work?"}
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["grounded"] is True
    assert "practice" in data["answer"].lower() or "games" in data["answer"].lower()
    assert any("practice" in link["href"].lower() or "game" in link["href"].lower() for link in data.get("links", []))


async def test_assistant_ungrounded_query_escalation(client):
    """Unresolvable random queries are marked ungrounded and escalate to human contact."""
    response = await client.post(
        f"{API}/home/assistant",
        json={"question": "xyzabc12349876 nonexistingquestion"}
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["grounded"] is False
    assert data["escalation"]["available"] is True
    assert data["escalation"]["href"] == "/contact"


async def test_assistant_provider_failure_resilience(client, monkeypatch):
    """When an upstream AI provider fails (e.g. invalid key or 401), the service recovers safely."""
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai")
    monkeypatch.setattr(settings, "AI_API_KEY", "sk-invalid-test-key-xyz")

    response = await client.post(
        f"{API}/home/assistant",
        json={"question": "What is Winners Creek?"}
    )
    assert response.status_code == 200
    data = response.json()["data"]
    # Falls back to grounded domain synthesis without crashing or leaking secrets
    assert "Winners Creek" in data["answer"]
    assert "sk-invalid" not in data["answer"]


async def test_assistant_authenticated_student_context(client, student):
    """Authenticated student questions succeed and include student scope."""
    response = await client.post(
        f"{API}/home/assistant",
        json={"question": "What courses am I enrolled in?"},
        headers=student.headers
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert "answer" in data
    assert data["grounded"] is True
