"""Password hashing, complexity policy, and JWT access/refresh token handling."""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings
from app.core.errors import Unauthenticated, ValidationError

_ph = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2)

TokenType = Literal["access", "refresh", "verify", "reset"]


# --------------------------------------------------------------------------- passwords
def hash_password(plain: str) -> str:
    """Argon2id. Passwords are never stored or logged in plaintext."""
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        # Legacy bcrypt hashes (e.g. imported data) stay verifiable.
        if hashed.startswith(("$2a$", "$2b$", "$2y$")):
            try:
                import bcrypt

                return bcrypt.checkpw(plain.encode(), hashed.encode())
            except Exception:
                return False
        return False


def needs_rehash(hashed: str) -> bool:
    try:
        return _ph.check_needs_rehash(hashed)
    except Exception:
        return True


PASSWORD_RULES = (
    (lambda p: len(p) >= settings.PASSWORD_MIN_LENGTH,
     f"at least {settings.PASSWORD_MIN_LENGTH} characters"),
    (lambda p: bool(re.search(r"[A-Z]", p)), "one uppercase letter"),
    (lambda p: bool(re.search(r"[a-z]", p)), "one lowercase letter"),
    (lambda p: bool(re.search(r"\d", p)), "one number"),
    (lambda p: bool(re.search(r"[^\w\s]", p)), "one special character"),
)


def password_problems(plain: str) -> list[str]:
    return [msg for rule, msg in PASSWORD_RULES if not rule(plain)]


def assert_password_policy(plain: str) -> None:
    problems = password_problems(plain)
    if problems:
        raise ValidationError(
            "Password must contain " + ", ".join(problems),
            details=[{"field": "password", "message": f"missing: {p}"} for p in problems],
        )


def password_strength(plain: str) -> int:
    """0–4 score mirrored by the frontend strength meter."""
    satisfied = sum(1 for rule, _ in PASSWORD_RULES if rule(plain))
    score = max(0, satisfied - 1)
    if len(plain) >= 12 and satisfied == len(PASSWORD_RULES):
        score = 4
    return min(score, 4)


# --------------------------------------------------------------------------- tokens
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(
    *,
    user_id: str,
    role: str,
    college_id: str | None,
    department_id: str | None,
    session_id: str,
    extra: dict[str, Any] | None = None,
) -> tuple[str, datetime]:
    """Access token carries the full authorization context (SRS §14.2)."""
    issued = _now()
    expires = issued + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES)
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "college_id": college_id,
        "department_id": department_id,
        "sid": session_id,
        "typ": "access",
        "jti": uuid.uuid4().hex,
        "iat": int(issued.timestamp()),
        "exp": int(expires.timestamp()),
    }
    if extra:
        payload.update(extra)
    return _encode(payload), expires


def create_refresh_token(
    *, user_id: str, session_id: str, family_id: str
) -> tuple[str, str, datetime]:
    """Returns (token, jti, expiry). Rotation is tracked per family for reuse detection."""
    issued = _now()
    expires = issued + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS)
    jti = uuid.uuid4().hex
    token = _encode(
        {
            "sub": user_id,
            "sid": session_id,
            "fam": family_id,
            "typ": "refresh",
            "jti": jti,
            "iat": int(issued.timestamp()),
            "exp": int(expires.timestamp()),
        }
    )
    return token, jti, expires


def create_purpose_token(*, user_id: str, purpose: TokenType, ttl_minutes: int) -> str:
    return _encode(
        {
            "sub": user_id,
            "typ": purpose,
            "jti": uuid.uuid4().hex,
            "iat": int(_now().timestamp()),
            "exp": int((_now() + timedelta(minutes=ttl_minutes)).timestamp()),
        }
    )


def decode_token(token: str, *, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise Unauthenticated("Your session has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise Unauthenticated("Invalid authentication token") from exc
    if payload.get("typ") != expected_type:
        raise Unauthenticated("Invalid authentication token")
    return payload


# --------------------------------------------------------------------------- misc
def generate_otp(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_token(token: str) -> str:
    """Store only digests of OTPs/refresh tokens so a store leak is not directly usable."""
    return hashlib.sha256(f"{settings.JWT_SECRET}:{token}".encode()).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def sign_payload(payload: str, ttl_seconds: int) -> str:
    """HMAC-signed, expiring token used by the local storage driver's signed URLs."""
    expiry = int((_now() + timedelta(seconds=ttl_seconds)).timestamp())
    body = f"{payload}|{expiry}"
    mac = hmac.new(settings.JWT_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{body}|{mac}"


def verify_signed_payload(token: str) -> str:
    try:
        payload, expiry_raw, mac = token.rsplit("|", 2)
    except ValueError as exc:
        raise Unauthenticated("Invalid download link") from exc
    body = f"{payload}|{expiry_raw}"
    expected = hmac.new(settings.JWT_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(mac, expected):
        raise Unauthenticated("Invalid download link")
    if int(expiry_raw) < int(_now().timestamp()):
        raise Unauthenticated("This download link has expired")
    return payload
