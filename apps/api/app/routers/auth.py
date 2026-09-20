"""Authentication — one reusable system for all eight roles.

Everything the requirements ask for lands here: signup with institution context, OTP + link email
verification, login by email *or* institution ID, short-lived access tokens with rotating refresh
tokens in an HttpOnly cookie, Redis session tracking, lockout, rate limiting, password reset that
invalidates existing sessions, and logout-all.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.authz.audit import write_audit, write_security_event
from app.authz.context import ScopeContext
from app.authz.guards import CurrentUser, assert_dev_endpoints_enabled, get_scope_context
from app.authz.roles import COLLEGE_BOUND, DEPARTMENT_BOUND, ROLE_HOME, ROLE_LABEL, Role, parse_role
from app.core.config import settings
from app.core.errors import (
    Conflict,
    NotFound,
    RoleForbidden,
    Unauthenticated,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.security import (
    assert_password_policy,
    create_purpose_token,
    decode_token,
    hash_password,
    needs_rehash,
    password_strength,
    verify_password,
)
from app.db.mongo import get_db, serialize
from app.schemas.requests import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResendOtpRequest,
    ResetPasswordRequest,
    SignupRequest,
    VerifyEmailRequest,
)
from app.services import rate_limit, session_service
from app.services.email_service import (
    ConsoleEmailProvider,
    send_password_reset_email,
    send_verification_email,
)

router = APIRouter()
log = get_logger("app.auth")

VERIFY, RESET = "verify", "reset"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )


def _set_refresh_cookie(response: Response, token: str, *, remember: bool = False) -> None:
    """Refresh token lives only in an HttpOnly cookie — never readable by JavaScript."""
    max_age = settings.REFRESH_TOKEN_TTL_DAYS * 86400 * (2 if remember else 1)
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
        domain=settings.COOKIE_DOMAIN,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        domain=settings.COOKIE_DOMAIN,
    )


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    role = parse_role(user["role"])
    return {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "institutionId": user.get("institutionId"),
        "role": str(role),
        "roleLabel": ROLE_LABEL.get(role, str(role)),
        "collegeId": str(user["collegeId"]) if user.get("collegeId") else None,
        "collegeName": user.get("collegeName"),
        "departmentId": str(user["departmentId"]) if user.get("departmentId") else None,
        "departmentName": user.get("departmentName"),
        "emailVerified": bool(user.get("emailVerified")),
        "status": user.get("status"),
        "avatarColor": user.get("avatarColor"),
        "mustChangePassword": bool(user.get("mustChangePassword")),
        "home": ROLE_HOME.get(role, "/"),
        "preferences": user.get("preferences") or {},
    }


from app.repositories.user_repo import UserRepository


async def _find_user_by_identifier(identifier: str) -> dict[str, Any] | None:
    value = identifier.strip()
    if settings.USE_POSTGRES:
        try:
            pg_user = await UserRepository.get_by_email(value)
            if pg_user:
                return {
                    "_id": str(pg_user["id"]),
                    "id": str(pg_user["id"]),
                    "email": pg_user["email"],
                    "passwordHash": pg_user["password_hash"],
                    "name": pg_user["name"],
                    "role": pg_user["role"],
                    "collegeId": str(pg_user["institution_id"]) if pg_user.get("institution_id") else None,
                    "departmentId": str(pg_user["department_id"]) if pg_user.get("department_id") else None,
                    "institutionId": str(pg_user["institution_id"]) if pg_user.get("institution_id") else None,
                    "status": str(pg_user["status"]).lower(),
                    "emailVerified": True,
                }
        except Exception:
            pass
    return await get_db().users.find_one(
        {"$or": [{"email": value.lower()}, {"institutionId": value.upper()}]}
    )


# --------------------------------------------------------------------------- signup
@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, request: Request) -> dict[str, Any]:
    """Create an account. Uniqueness is enforced by unique indexes, not just by this check."""
    if not settings.PUBLIC_SIGNUP_ENABLED:
        raise RoleForbidden("Public registration is disabled for this institution")

    role = parse_role(payload.role)
    if str(role) not in settings.self_signup_roles:
        raise RoleForbidden(
            f"{ROLE_LABEL.get(role, role)} accounts are created by your institution administrator, "
            "not through public signup."
        )

    await rate_limit.enforce_rate_limit("signup", _client_ip(request) or "anon", "10/hour")
    assert_password_policy(payload.password)

    db = get_db()
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise Conflict("An account with this email already exists. Try signing in instead.")
    if payload.institutionId:
        if await db.users.find_one({"institutionId": payload.institutionId.upper()}):
            raise Conflict("This institution ID is already registered")

    college = None
    if payload.collegeCode:
        college = await db.colleges.find_one(
            {"code": payload.collegeCode.upper(), "deletedAt": None}
        )
        if not college:
            raise ValidationError("We couldn't find an institution with that code")
    if role in COLLEGE_BOUND and role is not Role.STUDENT and not college:
        raise ValidationError("Please select your institution to continue")

    department = None
    if payload.departmentCode and college:
        department = await db.departments.find_one(
            {
                "collegeId": college["_id"],
                "code": payload.departmentCode.upper(),
                "deletedAt": None,
            }
        )
        if not department:
            raise ValidationError("We couldn't find that department in the selected institution")
    if role in DEPARTMENT_BOUND and role is not Role.STUDENT and not department:
        raise ValidationError("Please select your department to continue")

    document = {
        "name": payload.name,
        "email": email,
        # Omitted rather than null: `institutionId` has a sparse unique index, and a sparse
        # index skips absent fields but still indexes explicit nulls.
        **({"institutionId": payload.institutionId.upper()} if payload.institutionId else {}),
        "passwordHash": hash_password(payload.password),
        "role": str(role),
        "collegeId": college["_id"] if college else None,
        "collegeName": college.get("name") if college else "Winners Creek Online Platform",
        "departmentId": department["_id"] if department else None,
        "departmentName": department.get("name") if department else None,
        "phone": payload.phone,
        # The account stays unverified until the code or link is used.
        "emailVerified": False,
        "status": "active",
        "avatarColor": f"#{abs(hash(email)) % 0xFFFFFF:06X}",
        "acceptedTermsAt": _now() if payload.acceptedTerms else None,
        "preferences": {
            "emailNotifications": True,
            "pushNotifications": True,
            "smsNotifications": False,
        },
        "createdAt": _now(),
        "updatedAt": _now(),
        "deletedAt": None,
        "version": 1,
    }
    try:
        result = await db.users.insert_one(document)
    except Exception as exc:
        # The unique index is the real guard against a race between two concurrent signups.
        raise Conflict("An account with these details already exists") from exc

    if role is Role.STUDENT:
        await db.student_profiles.insert_one(
            {
                "userId": result.inserted_id,
                "name": payload.name,
                "email": email,
                "rollNumber": (payload.institutionId or f"{'COL' if college else 'ONL'}{str(result.inserted_id)[-6:]}").upper(),
                "collegeId": college["_id"] if college else None,
                "collegeName": college.get("name") if college else "Winners Creek Online Platform",
                "departmentId": department["_id"] if department else None,
                "departmentName": department.get("name") if department else None,
                "isOnlineDirect": college is None,
                "batchId": None,
                "batchName": None,
                "profileCompleteness": 35,
                "status": "active",
                "createdAt": _now(),
                "updatedAt": _now(),
                "deletedAt": None,
                "version": 1,
            }
        )

    otp = await rate_limit.issue_otp(VERIFY, email)
    link_token = create_purpose_token(
        user_id=str(result.inserted_id), purpose="verify", ttl_minutes=60 * 24
    )
    await send_verification_email(to=email, name=payload.name, otp=otp, link_token=link_token)
    await write_audit(
        None,
        action="create",
        entity_type="users",
        entity_id=result.inserted_id,
        after={"email": email, "role": str(role)},
        detail="self-service signup",
        actor_label=f"{payload.name} (signup)",
        college_id=college["_id"] if college else None,
        department_id=department["_id"] if department else None,
    )
    log.info("signup", extra={"email": email, "role": str(role)})

    return {
        "success": True,
        "message": "Account created. Check your email for the verification code.",
        "data": {
            "userId": str(result.inserted_id),
            "email": email,
            "verificationRequired": True,
            "otpExpiresInMinutes": settings.OTP_TTL_MINUTES,
            "passwordStrength": password_strength(payload.password),
        },
    }


# --------------------------------------------------------------------------- verification
@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, request: Request) -> dict[str, Any]:
    """Accepts either the emailed OTP or the one-click link token."""
    db = get_db()

    if payload.token:
        claims = decode_token(payload.token, expected_type="verify")
        user = await db.users.find_one({"_id": ObjectId(str(claims["sub"]))})
        if not user:
            raise NotFound("Account not found")
    else:
        if not payload.email or not payload.otp:
            raise ValidationError("Enter the 6-digit code we emailed you")
        await rate_limit.enforce_rate_limit("verify", payload.email.lower(), "15/hour")
        user = await db.users.find_one({"email": payload.email.lower()})
        if not user:
            raise NotFound("Account not found")
        if not await rate_limit.verify_otp(VERIFY, payload.email.lower(), payload.otp):
            await write_security_event(
                kind="otp_invalid",
                user_id=user["_id"],
                detail="invalid or expired email-verification code",
                ip=_client_ip(request),
                college_id=user.get("collegeId"),
                department_id=user.get("departmentId"),
            )
            raise ValidationError("That code is invalid or has expired. Request a new one.")

    if user.get("emailVerified"):
        return {"success": True, "message": "This email is already verified.", "data": {"alreadyVerified": True}}

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"emailVerified": True, "emailVerifiedAt": _now(), "updatedAt": _now()}},
    )
    await write_audit(
        None,
        action="update",
        entity_type="users",
        entity_id=user["_id"],
        after={"emailVerified": True},
        detail="email verified",
        actor_label=f"{user.get('name')} (self)",
        college_id=user.get("collegeId"),
        department_id=user.get("departmentId"),
    )
    return {
        "success": True,
        "message": "Email verified. You can sign in now.",
        "data": {"email": user.get("email")},
    }


@router.post("/resend-otp")
async def resend_otp(payload: ResendOtpRequest) -> dict[str, Any]:
    db = get_db()
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    # Always answer the same way so the endpoint cannot enumerate accounts.
    generic = {
        "success": True,
        "message": "If that account exists, a new code is on its way.",
        "data": {"otpExpiresInMinutes": settings.OTP_TTL_MINUTES},
    }
    if not user:
        return generic
    if payload.purpose == VERIFY and user.get("emailVerified"):
        return generic

    purpose = VERIFY if payload.purpose == VERIFY else RESET
    otp = await rate_limit.issue_otp(purpose, email)
    link_token = create_purpose_token(
        user_id=str(user["_id"]),
        purpose="verify" if purpose == VERIFY else "reset",
        ttl_minutes=60 if purpose == RESET else 60 * 24,
    )
    if purpose == VERIFY:
        await send_verification_email(
            to=email, name=user.get("name", ""), otp=otp, link_token=link_token
        )
    else:
        await send_password_reset_email(
            to=email, name=user.get("name", ""), otp=otp, link_token=link_token
        )
    return generic


# --------------------------------------------------------------------------- account activation (Super Admin provisioned accounts)
@router.get("/verify-activation-token")
async def verify_activation_token(token: str = Query(...)) -> dict[str, Any]:
    """Verify single-use activation token for provisioned users (ADMIN, HOD, TRAINER)."""
    db = get_db()
    now = _now()
    user = await db.users.find_one({
        "activationToken": token.strip(),
        "activationTokenExpiresAt": {"$gt": now},
        "deletedAt": None,
    })
    if not user:
        raise ValidationError("Invalid or expired activation link. Please contact your administrator.")

    role = parse_role(user["role"])
    return {
        "success": True,
        "data": {
            "name": user.get("name"),
            "email": user.get("email"),
            "role": str(role),
            "roleLabel": ROLE_LABEL.get(role, str(role)),
            "collegeName": user.get("collegeName", "Platform"),
            "departmentName": user.get("departmentName"),
        }
    }


@router.post("/activate")
async def activate_account(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    """Activate account using token and set a permanent password."""
    token = (payload.get("token") or "").strip()
    new_password = payload.get("newPassword") or payload.get("password") or ""
    if not token or not new_password:
        raise ValidationError("Activation token and a new password are required.")

    assert_password_policy(new_password)
    db = get_db()
    now = _now()
    user = await db.users.find_one({
        "activationToken": token,
        "activationTokenExpiresAt": {"$gt": now},
        "deletedAt": None,
    })
    if not user:
        raise ValidationError("Invalid or expired activation link. Please contact your administrator.")

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "passwordHash": hash_password(new_password),
                "status": "active",
                "accountStatus": "active",
                "emailVerified": True,
                "emailVerifiedAt": now,
                "mustChangePassword": False,
                "activationToken": None,
                "activatedAt": now,
                "passwordChangedAt": now,
                "updatedAt": now,
            }
        },
    )

    await write_security_event(
        kind="account_activated",
        user_id=user["_id"],
        detail="provisioned account activated and password initialized",
        ip=_client_ip(request),
        college_id=user.get("collegeId"),
        department_id=user.get("departmentId"),
    )

    role = parse_role(user["role"])
    return {
        "success": True,
        "message": "Account successfully activated! You can now log in.",
        "data": {
            "email": user.get("email"),
            "role": str(role),
            "redirectTo": "/login",
        },
    }


# --------------------------------------------------------------------------- login
@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response) -> dict[str, Any]:
    identifier = payload.identifier.strip().lower()
    ip = _client_ip(request)

    await rate_limit.enforce_rate_limit("login-ip", ip or "anon", "30/minute")
    await rate_limit.enforce_rate_limit("login-id", identifier, settings.LOGIN_RATE_LIMIT)
    await rate_limit.assert_not_locked(identifier)

    user = await _find_user_by_identifier(payload.identifier)

    # One generic message for wrong identifier and wrong password alike.
    if not user or not verify_password(payload.password, user.get("passwordHash", "")):
        attempts = await rate_limit.record_failed_login(identifier)
        await write_security_event(
            kind="login_failed",
            user_id=user["_id"] if user else None,
            detail=f"failed sign-in attempt {attempts}/{settings.MAX_FAILED_LOGINS}",
            ip=ip,
            metadata={"identifier": identifier},
            # Unknown identifier: the attempt belongs to no institution, so it stays untenanted
            # and only SUPER_ADMIN sees it.
            college_id=user.get("collegeId") if user else None,
            department_id=user.get("departmentId") if user else None,
        )
        remaining = max(0, settings.MAX_FAILED_LOGINS - attempts)
        message = "The email/ID or password is incorrect."
        if 0 < remaining <= 2:
            message += f" {remaining} attempt(s) remaining before the account is locked."
        raise Unauthenticated(message)

    if user.get("status") == "deactivated":
        raise Unauthenticated(
            "This account has been deactivated. Contact your institution administrator."
        )
    if user.get("status") != "active":
        raise Unauthenticated("This account is not active")

    if not user.get("emailVerified"):
        otp = await rate_limit.issue_otp(VERIFY, user["email"])
        link_token = create_purpose_token(
            user_id=str(user["_id"]), purpose="verify", ttl_minutes=60 * 24
        )
        await send_verification_email(
            to=user["email"], name=user.get("name", ""), otp=otp, link_token=link_token
        )
        return {
            "success": False,
            "message": "Please verify your email to continue. We've sent you a fresh code.",
            "data": {"verificationRequired": True, "email": user["email"]},
        }

    role = parse_role(user["role"])
    if role in DEPARTMENT_BOUND and not user.get("departmentId"):
        raise Unauthenticated(
            "Your account is not assigned to a department yet. Contact your administrator."
        )

    await rate_limit.clear_failed_logins(identifier)
    tokens = await session_service.open_session(
        user=user,
        ip=ip,
        user_agent=request.headers.get("user-agent"),
        remember_me=payload.rememberMe,
    )
    _set_refresh_cookie(response, tokens["refreshToken"], remember=payload.rememberMe)

    db = get_db()
    await db.users.update_one(
        {"_id": user["_id"]}, {"$set": {"lastActiveAt": _now(), "lastLoginIp": ip}}
    )
    if needs_rehash(user.get("passwordHash", "")):
        await db.users.update_one(
            {"_id": user["_id"]}, {"$set": {"passwordHash": hash_password(payload.password)}}
        )
    await write_audit(
        None,
        action="login",
        entity_type="users",
        entity_id=user["_id"],
        detail=f"signed in from {ip or 'unknown ip'}",
        actor_label=f"{user.get('name')} ({role})",
        college_id=user.get("collegeId"),
        department_id=user.get("departmentId"),
    )

    return {
        "success": True,
        "message": f"Welcome back, {str(user.get('name', '')).split(' ')[0]}",
        "data": {
            "accessToken": tokens["accessToken"],
            "accessTokenExpiresAt": tokens["accessTokenExpiresAt"],
            "user": _public_user(user),
            "redirectTo": ROLE_HOME.get(role, "/"),
        },
    }


@router.post("/refresh")
async def refresh(request: Request, response: Response) -> dict[str, Any]:
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not token:
        raise Unauthenticated("No active session")
    result = await session_service.rotate_session(token, ip=_client_ip(request))
    _set_refresh_cookie(response, result["refreshToken"])
    return {
        "success": True,
        "data": {
            "accessToken": result["accessToken"],
            "accessTokenExpiresAt": result["accessTokenExpiresAt"],
            "user": _public_user(result["user"]),
        },
    }


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict[str, Any]:
    """Invalidates the refresh token server-side, not just the cookie."""
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if token:
        try:
            claims = decode_token(token, expected_type="refresh")
            await session_service.close_session(str(claims["sub"]), str(claims["sid"]))
            await write_audit(
                None,
                action="logout",
                entity_type="users",
                entity_id=ObjectId(str(claims["sub"])),
                detail="signed out",
                actor_label="self",
            )
        except Unauthenticated:
            pass
    _clear_refresh_cookie(response)
    return {"success": True, "message": "Signed out"}


@router.post("/logout-all")
async def logout_all(
    response: Response, ctx: ScopeContext = Depends(get_scope_context)
) -> dict[str, Any]:
    count = await session_service.revoke_all_sessions(str(ctx.user_id))
    _clear_refresh_cookie(response)
    await write_audit(
        ctx,
        action="logout",
        entity_type="users",
        entity_id=ctx.user_id,
        detail=f"signed out of {count} device(s)",
    )
    return {
        "success": True,
        "message": f"Signed out of {count} device(s)",
        "data": {"sessionsRevoked": count},
    }


# --------------------------------------------------------------------------- password reset
@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request) -> dict[str, Any]:
    email = payload.email.lower()
    await rate_limit.enforce_rate_limit("forgot", _client_ip(request) or "anon", "10/hour")
    user = await get_db().users.find_one({"email": email})
    # Identical response whether or not the account exists.
    if user and user.get("status") == "active":
        otp = await rate_limit.issue_otp(RESET, email)
        link_token = create_purpose_token(
            user_id=str(user["_id"]), purpose="reset", ttl_minutes=60
        )
        await send_password_reset_email(
            to=email, name=user.get("name", ""), otp=otp, link_token=link_token
        )
    return {
        "success": True,
        "message": "If that account exists, we've sent reset instructions.",
        "data": {"otpExpiresInMinutes": settings.OTP_TTL_MINUTES},
    }


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest, request: Request, response: Response
) -> dict[str, Any]:
    assert_password_policy(payload.password)
    db = get_db()

    if payload.token:
        claims = decode_token(payload.token, expected_type="reset")
        user = await db.users.find_one({"_id": ObjectId(str(claims["sub"]))})
    else:
        if not payload.email or not payload.otp:
            raise ValidationError("Enter the code we emailed you")
        await rate_limit.enforce_rate_limit("reset", payload.email.lower(), "15/hour")
        user = await db.users.find_one({"email": payload.email.lower()})
        if user and not await rate_limit.verify_otp(RESET, payload.email.lower(), payload.otp):
            await write_security_event(
                kind="reset_otp_invalid",
                user_id=user["_id"],
                detail="invalid or expired password-reset code",
                ip=_client_ip(request),
                college_id=user.get("collegeId"),
                department_id=user.get("departmentId"),
            )
            raise ValidationError("That code is invalid or has expired. Request a new one.")
    if not user:
        raise ValidationError("That code is invalid or has expired. Request a new one.")

    if verify_password(payload.password, user.get("passwordHash", "")):
        raise ValidationError("Choose a password you haven't used before")

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "passwordHash": hash_password(payload.password),
                "passwordChangedAt": _now(),
                "mustChangePassword": False,
                "updatedAt": _now(),
            }
        },
    )
    # Every existing session is invalidated after a reset.
    revoked = await session_service.revoke_all_sessions(str(user["_id"]), reason="password_reset")
    await rate_limit.clear_failed_logins(str(user.get("email", "")))
    _clear_refresh_cookie(response)
    await write_security_event(
        kind="password_reset",
        user_id=user["_id"],
        detail=f"password reset; {revoked} session(s) invalidated",
        ip=_client_ip(request),
        college_id=user.get("collegeId"),
        department_id=user.get("departmentId"),
    )
    await write_audit(
        None,
        action="update",
        entity_type="users",
        entity_id=user["_id"],
        after={"passwordChanged": True},
        detail="password reset",
        actor_label=f"{user.get('name')} (self)",
        college_id=user.get("collegeId"),
        department_id=user.get("departmentId"),
    )
    return {
        "success": True,
        "message": "Password updated. Please sign in with your new password.",
        "data": {"sessionsInvalidated": revoked},
    }


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest, ctx: ScopeContext = Depends(get_scope_context)
) -> dict[str, Any]:
    db = get_db()
    user = await db.users.find_one({"_id": ctx.user_id})
    if not user or not verify_password(payload.currentPassword, user.get("passwordHash", "")):
        raise ValidationError("Your current password is incorrect")
    assert_password_policy(payload.password)
    if verify_password(payload.password, user.get("passwordHash", "")):
        raise ValidationError("Choose a password you haven't used before")

    await db.users.update_one(
        {"_id": ctx.user_id},
        {
            "$set": {
                "passwordHash": hash_password(payload.password),
                "passwordChangedAt": _now(),
                "mustChangePassword": False,
                "updatedAt": _now(),
            }
        },
    )
    await write_audit(
        ctx, action="update", entity_type="users", entity_id=ctx.user_id, detail="password changed"
    )
    return {"success": True, "message": "Password updated"}


# --------------------------------------------------------------------------- session info
@router.get("/me")
async def me(ctx: CurrentUser) -> dict[str, Any]:
    user = await get_db().users.find_one({"_id": ctx.user_id})
    if not user:
        raise Unauthenticated("Account not found")
    data = _public_user(user)
    if ctx.role is Role.TRAINER:
        data["assignedBatchIds"] = [str(b) for b in ctx.batch_ids]
        data["assignedDepartmentIds"] = [str(d) for d in ctx.department_ids]
    if ctx.role is Role.PARENT:
        data["linkedStudentIds"] = [str(s) for s in ctx.linked_student_ids]
    if ctx.role is Role.STUDENT:
        profile = await get_db().student_profiles.find_one({"userId": ctx.user_id})
        data["profile"] = serialize(profile) if profile else None
    return {"success": True, "data": data}


@router.get("/sessions")
async def sessions(ctx: CurrentUser) -> dict[str, Any]:
    return {
        "success": True,
        "data": serialize(
            await session_service.list_active_sessions(str(ctx.user_id), ctx.session_id)
        ),
    }


@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, ctx: CurrentUser) -> dict[str, Any]:
    record = await get_db().refresh_sessions.find_one(
        {"sessionId": session_id, "userId": ctx.user_id}
    )
    if not record:
        raise NotFound("Session not found")
    await session_service.close_session(str(ctx.user_id), session_id)
    await write_audit(
        ctx,
        action="logout",
        entity_type="refresh_sessions",
        entity_id=record["_id"],
        detail="device signed out remotely",
    )
    return {"success": True, "message": "That device has been signed out"}


@router.get("/password-strength")
async def strength(password: str = "") -> dict[str, Any]:
    from app.core.security import password_problems

    return {
        "success": True,
        "data": {"score": password_strength(password), "problems": password_problems(password)},
    }


# --------------------------------------------------------------------------- dev helper
@router.get("/dev/otp/{email}")
async def dev_peek_otp(email: str) -> dict[str, Any]:
    """Development convenience so email verification works with no SMTP server.

    Disabled whenever `ALLOW_DEV_ENDPOINTS` is false, and always in production.
    """
    assert_dev_endpoints_enabled()
    target = email.lower()
    messages = [m for m in ConsoleEmailProvider.outbox if m.to.lower() == target]
    if not messages:
        raise NotFound("No development email has been sent to that address")
    latest = messages[-1]
    code = next(
        (
            part.strip().rstrip(".")
            for part in latest.body.replace("\n", " ").split()
            if part.strip().rstrip(".").isdigit() and len(part.strip().rstrip(".")) == 6
        ),
        None,
    )
    return {
        "success": True,
        "data": {"email": latest.to, "subject": latest.subject, "otp": code, "body": latest.body},
    }
