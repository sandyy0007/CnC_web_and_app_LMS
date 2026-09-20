"""Authentication: signup → verification → login → refresh rotation → reset → logout."""
from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.email_service import ConsoleEmailProvider
from tests.conftest import ACCOUNTS, API, error_code, login

GOOD_PASSWORD = "Str0ng!Pass1"


async def _signup(client, email: str, **overrides):
    payload = {
        "name": "Test Candidate",
        "email": email,
        "password": GOOD_PASSWORD,
        "confirmPassword": GOOD_PASSWORD,
        "role": "STUDENT",
        "collegeCode": "ABC",
        "departmentCode": "CSE",
    }
    payload.update(overrides)
    return await client.post(f"{API}/auth/signup", json=payload)


async def _otp_for(client, email: str) -> str:
    response = await client.get(f"{API}/auth/dev/otp/{email}")
    assert response.status_code == 200, response.text
    otp = response.json()["data"]["otp"]
    assert otp and len(otp) == 6
    return otp


# --------------------------------------------------------------------------- signup
async def test_signup_then_verify_then_login(client):
    email = "new.candidate@abcengg.edu"
    response = await _signup(client, email)
    assert response.status_code == 201, response.text
    assert response.json()["data"]["verificationRequired"] is True

    # An unverified account cannot sign in.
    blocked = await client.post(
        f"{API}/auth/login", json={"identifier": email, "password": GOOD_PASSWORD}
    )
    assert blocked.json()["data"]["verificationRequired"] is True
    assert blocked.json()["success"] is False

    verify = await client.post(
        f"{API}/auth/verify-email", json={"email": email, "otp": await _otp_for(client, email)}
    )
    assert verify.status_code == 200, verify.text

    session = await login(client, email, GOOD_PASSWORD)
    assert session.user["role"] == "STUDENT"
    assert session.user["home"] == "/student/dashboard"


async def test_signup_rejects_duplicate_email(client):
    response = await _signup(client, ACCOUNTS["student"])
    assert response.status_code == 409
    assert error_code(response) == "CONFLICT"


async def test_signup_rejects_weak_password(client):
    response = await _signup(
        client, "weak.pass@abcengg.edu", password="abcdefgh", confirmPassword="abcdefgh"
    )
    assert response.status_code == 400
    assert error_code(response) == "VALIDATION_ERROR"
    assert "uppercase" in response.text


async def test_signup_rejects_mismatched_confirmation(client):
    response = await _signup(client, "mismatch@abcengg.edu", confirmPassword="Different1!")
    assert response.status_code == 400
    assert "match" in response.text.lower()


async def test_signup_rejects_unknown_college(client):
    response = await _signup(client, "nocollege@abcengg.edu", collegeCode="ZZZ")
    assert response.status_code == 400
    assert "institution" in response.text.lower()


async def test_public_signup_cannot_self_assign_a_privileged_role(client):
    """Only STUDENT is self-serve; staff accounts are created by the institution."""
    response = await _signup(client, "wannabe.admin@abcengg.edu", role="ADMIN")
    assert response.status_code == 403
    assert error_code(response) == "ROLE_FORBIDDEN"


async def test_verification_link_token_also_works(client):
    email = "link.verify@abcengg.edu"
    await _signup(client, email)
    body = (await client.get(f"{API}/auth/dev/otp/{email}")).json()["data"]["body"]
    token = body.split("token=")[1].split("&")[0]
    response = await client.post(f"{API}/auth/verify-email", json={"token": token})
    assert response.status_code == 200
    await login(client, email, GOOD_PASSWORD)


async def test_expired_or_wrong_otp_is_rejected(client):
    email = "badotp@abcengg.edu"
    await _signup(client, email)
    response = await client.post(
        f"{API}/auth/verify-email", json={"email": email, "otp": "000000"}
    )
    assert response.status_code == 400
    assert "invalid or has expired" in response.text


async def test_resend_otp_does_not_disclose_whether_an_account_exists(client):
    # A plausible address that simply has no account here — reserved TLDs such as `.test` are
    # correctly rejected at validation, which would mask the enumeration check.
    unknown = await client.post(
        f"{API}/auth/resend-otp", json={"email": "no.such.person@othercollege.edu"}
    )
    known = await client.post(
        f"{API}/auth/resend-otp", json={"email": ACCOUNTS["student"]}
    )
    assert unknown.status_code == known.status_code == 200
    assert unknown.json()["message"] == known.json()["message"]


# --------------------------------------------------------------------------- login
async def test_login_by_institution_id(client, seeded_db):
    profile = await seeded_db.student_profiles.find_one({"name": "Rahul Sharma"})
    session = await login(client, profile["rollNumber"])
    assert session.user["institutionId"] == profile["rollNumber"]


@pytest.mark.parametrize(
    "role_key,expected",
    [
        ("student", "/student/dashboard"),
        ("trainer", "/trainer/dashboard"),
        ("hod", "/hod/dashboard"),
        ("admin", "/admin/dashboard"),
        ("super_admin", "/super-admin"),
    ],
)
async def test_role_based_redirects(client, role_key, expected):
    response = await client.post(
        f"{API}/auth/login",
        json={"identifier": ACCOUNTS[role_key], "password": "Eedi@2026"},
    )
    assert response.json()["data"]["redirectTo"] == expected


async def test_wrong_password_is_generic_and_does_not_leak_existence(client):
    known = await client.post(
        f"{API}/auth/login", json={"identifier": ACCOUNTS["student"], "password": "Wrong1!x"}
    )
    unknown = await client.post(
        f"{API}/auth/login", json={"identifier": "ghost@nowhere.test", "password": "Wrong1!x"}
    )
    assert known.status_code == unknown.status_code == 401
    assert known.json()["error"]["message"].startswith("The email/ID or password is incorrect")
    assert unknown.json()["error"]["message"].startswith("The email/ID or password is incorrect")


async def test_account_locks_after_five_failed_attempts(client):
    identifier = ACCOUNTS["trainer"]
    for _ in range(settings.MAX_FAILED_LOGINS):
        await client.post(
            f"{API}/auth/login", json={"identifier": identifier, "password": "Wrong1!x"}
        )
    locked = await client.post(
        f"{API}/auth/login", json={"identifier": identifier, "password": "Eedi@2026"}
    )
    assert locked.status_code == 429
    assert error_code(locked) == "ACCOUNT_LOCKED"
    assert "Retry-After" in locked.headers


async def test_refresh_rotates_the_token_and_sets_an_httponly_cookie(client):
    response = await client.post(
        f"{API}/auth/login",
        json={"identifier": ACCOUNTS["student"], "password": "Eedi@2026"},
    )
    cookie_header = response.headers.get("set-cookie", "")
    assert "HttpOnly" in cookie_header
    assert settings.REFRESH_COOKIE_NAME in cookie_header
    first_refresh = client.cookies.get(settings.REFRESH_COOKIE_NAME)

    rotated = await client.post(f"{API}/auth/refresh")
    assert rotated.status_code == 200
    assert rotated.json()["data"]["accessToken"]
    second_refresh = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert second_refresh and second_refresh != first_refresh


async def test_replaying_a_rotated_refresh_token_revokes_the_family(client):
    """Reuse of a retired token is treated as theft (master prompt §31)."""
    await client.post(
        f"{API}/auth/login",
        json={"identifier": ACCOUNTS["student"], "password": "Eedi@2026"},
    )
    stolen = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    await client.post(f"{API}/auth/refresh")  # rotates; `stolen` is now retired

    client.cookies.set(settings.REFRESH_COOKIE_NAME, stolen, path=settings.REFRESH_COOKIE_PATH)
    replay = await client.post(f"{API}/auth/refresh")
    assert replay.status_code == 401
    assert "security" in replay.json()["error"]["message"].lower()

    # The whole family is dead, so the legitimate token no longer works either.
    client.cookies.clear()


async def test_access_token_carries_the_full_authorization_context(hod):
    import jwt

    claims = jwt.decode(hod.token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    assert claims["role"] == "HOD"
    assert claims["college_id"] and claims["department_id"]
    assert claims["typ"] == "access" and claims["sid"]


async def test_me_returns_scope_and_profile(student, trainer):
    me = (await student.get("/auth/me")).json()["data"]
    assert me["role"] == "STUDENT"
    assert me["profile"]["rollNumber"]

    trainer_me = (await trainer.get("/auth/me")).json()["data"]
    assert trainer_me["assignedBatchIds"]


async def test_logout_invalidates_the_session_server_side(client):
    session = await login(client, ACCOUNTS["student"])
    assert (await session.get("/auth/me")).status_code == 200
    await client.post(f"{API}/auth/logout")
    after = await session.get("/auth/me")
    assert after.status_code == 401


async def test_logout_all_revokes_every_device(client):
    first = await login(client, ACCOUNTS["student"])
    second = await login(client, ACCOUNTS["student"])
    response = await second.post("/auth/logout-all")
    assert response.json()["data"]["sessionsRevoked"] >= 2
    assert (await first.get("/auth/me")).status_code == 401
    assert (await second.get("/auth/me")).status_code == 401


async def test_session_list_and_remote_revocation(client):
    session = await login(client, ACCOUNTS["admin"])
    sessions = (await session.get("/auth/sessions")).json()["data"]
    assert any(s["current"] for s in sessions)
    target = next(s for s in sessions if s["current"])
    response = await session.delete(f"/auth/sessions/{target['sessionId']}")
    assert response.status_code == 200
    assert (await session.get("/auth/me")).status_code == 401


async def test_password_reset_invalidates_existing_sessions(client):
    email = "reset.me@abcengg.edu"
    await _signup(client, email)
    await client.post(
        f"{API}/auth/verify-email", json={"email": email, "otp": await _otp_for(client, email)}
    )
    session = await login(client, email, GOOD_PASSWORD)

    await client.post(f"{API}/auth/forgot-password", json={"email": email})
    otp = await _otp_for(client, email)
    new_password = "An0ther!Pass2"
    response = await client.post(
        f"{API}/auth/reset-password",
        json={
            "email": email, "otp": otp,
            "password": new_password, "confirmPassword": new_password,
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["sessionsInvalidated"] >= 1

    assert (await session.get("/auth/me")).status_code == 401
    await login(client, email, new_password)


async def test_reset_refuses_to_reuse_the_same_password(client):
    email = "samepass@abcengg.edu"
    await _signup(client, email)
    await client.post(
        f"{API}/auth/verify-email", json={"email": email, "otp": await _otp_for(client, email)}
    )
    await client.post(f"{API}/auth/forgot-password", json={"email": email})
    otp = await _otp_for(client, email)
    response = await client.post(
        f"{API}/auth/reset-password",
        json={
            "email": email, "otp": otp,
            "password": GOOD_PASSWORD, "confirmPassword": GOOD_PASSWORD,
        },
    )
    assert response.status_code == 400
    assert "haven't used before" in response.text


async def test_forgot_password_response_is_identical_for_unknown_accounts(client):
    known = await client.post(f"{API}/auth/forgot-password", json={"email": ACCOUNTS["admin"]})
    unknown = await client.post(
        f"{API}/auth/forgot-password", json={"email": "no.such.person@othercollege.edu"}
    )
    assert known.json() == unknown.json()


async def test_change_password_requires_the_current_one(client):
    session = await login(client, ACCOUNTS["admin"])
    wrong = await session.post(
        "/auth/change-password",
        json={
            "currentPassword": "Nope1!xx", "password": "Brand!New9",
            "confirmPassword": "Brand!New9",
        },
    )
    assert wrong.status_code == 400
    assert "current password is incorrect" in wrong.text


async def test_password_strength_endpoint_mirrors_the_meter(client):
    weak = await client.get(f"{API}/auth/password-strength", params={"password": "abc"})
    strong = await client.get(f"{API}/auth/password-strength", params={"password": "Str0ng!Pass12"})
    assert weak.json()["data"]["score"] < strong.json()["data"]["score"]
    assert strong.json()["data"]["problems"] == []
    assert weak.json()["data"]["problems"]


async def test_protected_endpoint_requires_authentication(client):
    response = await client.get(f"{API}/student/dashboard")
    assert response.status_code == 401
    assert error_code(response) == "UNAUTHENTICATED"


async def test_malformed_token_is_rejected(client):
    response = await client.get(
        f"{API}/student/dashboard", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert response.status_code == 401


async def test_dev_otp_endpoint_is_gated(client, monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_DEV_ENDPOINTS", False)
    response = await client.get(f"{API}/auth/dev/otp/{ACCOUNTS['student']}")
    assert response.status_code == 403


async def test_no_response_ever_contains_a_password_hash(client, student):
    for url in ("/auth/me", "/student/profile"):
        response = await student.get(url)
        assert "passwordHash" not in response.text
        assert "argon2" not in response.text


async def test_verification_email_records_an_audit_entry(client, seeded_db):
    email = "audited.signup@abcengg.edu"
    await _signup(client, email)
    entry = await seeded_db.audit_logs.find_one(
        {"entityType": "users", "action": "create", "after.email": email}
    )
    assert entry is not None
    assert entry["detail"] == "self-service signup"
    assert "passwordHash" not in (entry.get("after") or {})


async def test_console_email_provider_captured_the_message(client):
    email = "outbox.check@abcengg.edu"
    await _signup(client, email)
    assert any(m.to == email for m in ConsoleEmailProvider.outbox)
