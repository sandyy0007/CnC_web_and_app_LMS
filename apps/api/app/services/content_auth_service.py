"""Central Course Content Authorization Service (Phase 5).

Guarantees server-side content authorization for all lessons, materials, recordings,
assignments, and live meeting links based on:
1. Authenticated user validity.
2. User account active status (non-suspended).
3. Institution active status (non-suspended).
4. Course publication status.
5. Participant entitlement: verified paid enrollment, active free trial (within 72 hours), or free course.
6. Tenant and role boundaries.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import NotFound, RoleForbidden, ScopeForbidden
from app.db.postgres import get_pg_connection
from app.services import trial_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_uuid(val: Any) -> uuid.UUID | None:
    if not val:
        return None
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


async def authorize_course_content_access(
    ctx: ScopeContext,
    course_id: uuid.UUID | str,
    *,
    resource_type: str = "content",
) -> dict[str, Any]:
    """Central server-side entitlement check for any course learning resource.

    Returns dict with entitlement details or raises ScopeForbidden / RoleForbidden / NotFound.
    """
    if not ctx or not ctx.user_id:
        raise ScopeForbidden("Authentication required to access course content.")

    # 1. Super Admin has universal platform oversight
    if ctx.role is Role.SUPER_ADMIN:
        return {
            "authorized": True,
            "accessType": "super_admin",
            "reason": "Super Admin platform authority",
            "courseId": str(course_id),
        }

    uid = _to_uuid(ctx.user_id)
    if not uid:
        raise ScopeForbidden("Authentication required to access course content.")

    cid = _to_uuid(course_id)

    if not settings.USE_POSTGRES:
        # Mongo fallback
        access = await trial_service.check_course_access(ctx.user_id, course_id)
        if not access.get("hasAccess"):
            raise ScopeForbidden("Access denied: Active course enrollment or free trial required.")
        return {
            "authorized": True,
            "accessType": access.get("accessType"),
            "reason": "Active entitlement",
            "courseId": str(course_id),
        }

    async with get_pg_connection() as conn:
        if not cid:
            slug_row = await conn.fetchrow(
                "SELECT id FROM courses WHERE LOWER(slug) = LOWER($1) AND deleted_at IS NULL",
                str(course_id).strip(),
            )
            if slug_row:
                cid = slug_row["id"]
        if not cid:
            raise NotFound("Course not found.")

        # 2. Check user account active status
        user = await conn.fetchrow("SELECT id, status, institution_id, role FROM users WHERE id = $1", uid)
        if not user or str(user["status"]).upper() != "ACTIVE":
            raise ScopeForbidden("Your user account is suspended or inactive.")

        # 3. Check institution status if user belongs to an institution
        if user["institution_id"]:
            inst = await conn.fetchrow("SELECT id, status FROM institutions WHERE id = $1", user["institution_id"])
            if inst and str(inst["status"]).upper() != "ACTIVE":
                raise ScopeForbidden("Your institution workspace is currently suspended.")

        # 4. Check course exists and is published
        course = await conn.fetchrow(
            "SELECT id, title, published, status, fee, delivery_mode FROM courses WHERE id = $1 AND deleted_at IS NULL",
            cid,
        )
        if not course:
            raise NotFound("Course not found.")

        # Non-staff roles cannot access unpublished or archived courses
        is_staff = ctx.role in (Role.TRAINER, Role.ADMIN, Role.HOD)
        if not is_staff:
            if not course["published"] or str(course["status"]).upper() in ("DRAFT", "ARCHIVED", "SUSPENDED"):
                raise ScopeForbidden(f"This course is currently {course['status'].lower()} and inaccessible.")

        # 5. Trainer authorization
        if ctx.role is Role.TRAINER:
            # Check explicit course-trainer link or batch-based assignment
            is_assigned = await conn.fetchrow(
                """
                SELECT 1 FROM course_trainers WHERE course_id = $1 AND trainer_user_id = $2
                UNION
                SELECT 1 FROM batch_trainers bt
                JOIN enrollments e ON e.batch_id = bt.batch_id
                WHERE e.course_id = $1 AND bt.trainer_user_id = $2
                LIMIT 1;
                """,
                cid,
                uid,
            )
            if not is_assigned:
                raise ScopeForbidden("You are not assigned to instruct this course.")
            return {
                "authorized": True,
                "accessType": "trainer",
                "reason": "Assigned Course Instructor",
                "courseId": str(cid),
            }

        # 6. Admin / HOD authorization (scoped to their institution)
        if ctx.role in (Role.ADMIN, Role.HOD):
            inst_uuid = user["institution_id"]
            if not inst_uuid:
                raise ScopeForbidden("Institution scope required.")
            # Check if any students in their institution are enrolled in this course
            has_cohort = await conn.fetchrow(
                "SELECT 1 FROM enrollments WHERE course_id = $1 AND institution_id = $2 LIMIT 1",
                cid,
                inst_uuid,
            )
            if not has_cohort:
                raise ScopeForbidden("This course is not part of your institution's active programs.")
            return {
                "authorized": True,
                "accessType": "institution_admin",
                "reason": "Authorized Institution Administrator",
                "courseId": str(cid),
            }

        # 7. Participant / Student entitlement check
        fee = float(course["fee"] or 0.0)
        if fee == 0.0:
            return {
                "authorized": True,
                "accessType": "free",
                "reason": "Free course curriculum",
                "courseId": str(cid),
            }

        # 7a. Verified paid enrollment
        paid_enr = await conn.fetchrow(
            """
            SELECT id, access_status, payment_status
            FROM enrollments
            WHERE participant_user_id = $1 AND course_id = $2
              AND payment_status = 'VERIFIED' AND access_status = 'ACTIVE'
            """,
            uid,
            cid,
        )
        if not paid_enr:
            # Check payments table for verified transaction
            paid_pay = await conn.fetchrow(
                """
                SELECT id FROM payments
                WHERE participant_user_id = $1 AND course_id = $2 AND status = 'VERIFIED'
                """,
                uid,
                cid,
            )
            if paid_pay:
                # Auto heal enrollment access
                await conn.execute(
                    """
                    UPDATE enrollments
                    SET payment_status = 'VERIFIED',
                        access_status = 'ACTIVE',
                        enrollment_status = 'ACTIVE',
                        access_start_date = COALESCE(access_start_date, CURRENT_DATE),
                        access_end_date = NULL,
                        updated_at = NOW()
                    WHERE participant_user_id = $1 AND course_id = $2
                    """,
                    uid,
                    cid,
                )
                paid_enr = {"id": paid_pay["id"]}

        if paid_enr:
            return {
                "authorized": True,
                "accessType": "paid",
                "reason": "Active verified enrollment",
                "courseId": str(cid),
            }

        # 7b. Active 3-day (72-hour) free trial
        trial = await conn.fetchrow(
            """
            SELECT id, started_at, expires_at, status
            FROM course_trials
            WHERE participant_user_id = $1 AND course_id = $2
            """,
            uid,
            cid,
        )
        if trial:
            now = _now()
            expires_at = trial["expires_at"]
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            if str(trial["status"]).upper() == "ACTIVE" and now < expires_at:
                diff = expires_at - now
                return {
                    "authorized": True,
                    "accessType": "trial",
                    "reason": "Active 3-day free trial",
                    "trialId": str(trial["id"]),
                    "expiresAt": expires_at.isoformat(),
                    "remainingHours": max(0, int(diff.total_seconds() // 3600)),
                    "courseId": str(cid),
                }
            raise ScopeForbidden(
                "Your 3-day free trial has expired. Please complete course enrollment to continue learning."
            )

        # 7c. No active enrollment or trial
        raise ScopeForbidden(
            "Access to this course requires an active enrollment or a 3-day free trial."
        )

