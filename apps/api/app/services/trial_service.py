"""Course Free Trial Service.

Manages the 3-day (72-hour) free trial lifecycle (Phase 3 requirements).
A student is granted exactly one trial per course.
The backend calculates expiry from the server-side timestamp, preventing client-side tampering.
Upon expiry, access to gated content requires course purchase without automatic recurring billing.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from bson import ObjectId

from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationError
from app.db.mongo import get_db, serialize
from app.db.postgres import get_pg_connection, pg_transaction


def _now() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_TRIAL_DAYS = 3


def _to_uuid(val: Any) -> uuid.UUID | None:
    if not val:
        return None
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


async def activate_course_trial(
    student_user_id: Any,
    college_id: Any,
    course_id: Any,
) -> dict[str, Any]:
    """Activates exactly one 3-day (72-hour) free trial for a participant on a course."""
    uid = _to_uuid(student_user_id)
    cid = _to_uuid(course_id)
    inst_id = _to_uuid(college_id)

    if settings.USE_POSTGRES and uid and cid:
        async with pg_transaction() as conn:
            # 1. Fetch course
            course = await conn.fetchrow(
                "SELECT * FROM courses WHERE id = $1 AND deleted_at IS NULL", cid
            )
            if not course:
                raise NotFound("Course not found.")
            if not course["published"]:
                raise ValidationError("Course is not currently open for enrollment.")
            if not course["trial_enabled"]:
                raise ValidationError("Free trials are not enabled for this course.")

            # 2. Check if already purchased/verified
            existing_paid = await conn.fetchrow(
                """
                SELECT id FROM enrollments
                WHERE participant_user_id = $1 AND course_id = $2
                  AND payment_status = 'VERIFIED' AND access_status = 'ACTIVE'
                """,
                uid,
                cid,
            )
            if existing_paid:
                raise Conflict("You are already enrolled in this course as a verified paid member.")

            # 3. Check if trial already exists (anti-abuse)
            existing_trial = await conn.fetchrow(
                "SELECT * FROM course_trials WHERE participant_user_id = $1 AND course_id = $2",
                uid,
                cid,
            )
            if existing_trial:
                raise Conflict("A free trial has already been used for this course.")

            # 4. Compute server-side 72-hour timestamps
            now = _now()
            duration_days = int(course["trial_duration_days"] or DEFAULT_TRIAL_DAYS)
            duration_hours = duration_days * 24
            expires_at = now + timedelta(hours=duration_hours)

            # Resolve institution / department / batch from user profile if not provided
            profile = await conn.fetchrow(
                "SELECT institution_id, department_id, batch_id, current_semester FROM student_profiles WHERE user_id = $1",
                uid,
            )
            resolved_inst = inst_id or (profile["institution_id"] if profile else None)
            resolved_dept = profile["department_id"] if profile else None
            resolved_batch = profile["batch_id"] if profile else None
            resolved_sem = profile["current_semester"] if profile and profile["current_semester"] else 1

            # 5. Insert persistent trial record
            trial_row = await conn.fetchrow(
                """
                INSERT INTO course_trials (
                    participant_user_id, course_id, institution_id,
                    started_at, expires_at, duration_hours, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
                RETURNING id, participant_user_id, course_id, started_at, expires_at, duration_hours, status, created_at;
                """,
                uid,
                cid,
                resolved_inst,
                now,
                expires_at,
                duration_hours,
            )

            # 6. Ensure enrollment record exists and grant active trial access
            enrollment = await conn.fetchrow(
                "SELECT id FROM enrollments WHERE participant_user_id = $1 AND course_id = $2",
                uid,
                cid,
            )
            if enrollment:
                await conn.execute(
                    """
                    UPDATE enrollments
                    SET access_status = 'ACTIVE',
                        enrollment_status = 'ACTIVE',
                        access_start_date = $2,
                        access_end_date = $3,
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    enrollment["id"],
                    now.date(),
                    expires_at.date(),
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO enrollments (
                        participant_user_id, course_id, institution_id, department_id, batch_id,
                        current_semester, enrollment_status, payment_status, access_status,
                        access_start_date, access_end_date, created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5,
                        $6, 'ACTIVE', 'PENDING', 'ACTIVE',
                        $7, $8, NOW(), NOW()
                    )
                    """,
                    uid,
                    cid,
                    resolved_inst,
                    resolved_dept,
                    resolved_batch,
                    resolved_sem,
                    now.date(),
                    expires_at.date(),
                )

            return {
                "id": str(trial_row["id"]),
                "courseId": str(cid),
                "courseTitle": course["title"],
                "courseSlug": course["slug"],
                "startedAt": trial_row["started_at"].isoformat(),
                "expiresAt": trial_row["expires_at"].isoformat(),
                "durationDays": duration_days,
                "durationHours": duration_hours,
                "status": "active",
                "remainingDays": duration_days,
                "remainingHours": duration_hours,
            }

    # Fallback to Mongo (dev/test environments without PostgreSQL)
    db = get_db()
    c_oid = ObjectId(str(course_id)) if not isinstance(course_id, ObjectId) else course_id
    u_oid = ObjectId(str(student_user_id)) if not isinstance(student_user_id, ObjectId) else student_user_id
    course = await db.courses.find_one({"_id": c_oid})
    if not course:
        raise NotFound("Course not found.")

    enrollment = await db.enrollments.find_one({
        "studentUserId": u_oid,
        "courseId": c_oid,
        "status": "active",
        "deletedAt": None,
    })
    if enrollment and enrollment.get("enrollmentType") == "paid":
        raise Conflict("You are already enrolled in this course as a paid member.")

    existing_trial = await db.course_trials.find_one({
        "studentUserId": u_oid,
        "courseId": c_oid,
    })
    if existing_trial:
        raise Conflict("A free trial has already been used for this course.")

    now = _now()
    duration_days = int(course.get("trialDurationDays", DEFAULT_TRIAL_DAYS))
    expires_at = now + timedelta(days=duration_days)

    trial_doc = {
        "collegeId": college_id,
        "studentUserId": u_oid,
        "courseId": c_oid,
        "courseTitle": course.get("title"),
        "courseSlug": course.get("slug"),
        "startedAt": now,
        "expiresAt": expires_at,
        "durationDays": duration_days,
        "status": "active",
        "createdAt": now,
        "updatedAt": now,
    }
    res = await db.course_trials.insert_one(trial_doc)
    trial_doc["_id"] = res.inserted_id

    return serialize(trial_doc)


async def get_student_trials(student_user_id: Any) -> list[dict[str, Any]]:
    """Returns all trial records for a student with remaining time calculation and paid conversion detection."""
    uid = _to_uuid(student_user_id)
    if settings.USE_POSTGRES and uid:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT ct.id, ct.participant_user_id, ct.course_id, ct.started_at,
                       ct.expires_at, ct.duration_hours, ct.status,
                       c.title as course_title, c.slug as course_slug,
                       (SELECT 1 FROM payments p WHERE p.participant_user_id = ct.participant_user_id AND p.course_id = ct.course_id AND p.status = 'VERIFIED' LIMIT 1) as has_verified_pay,
                       (SELECT 1 FROM enrollments e WHERE e.participant_user_id = ct.participant_user_id AND e.course_id = ct.course_id AND e.payment_status = 'VERIFIED' AND e.access_status = 'ACTIVE' LIMIT 1) as has_verified_enr
                FROM course_trials ct
                JOIN courses c ON c.id = ct.course_id
                WHERE ct.participant_user_id = $1
                ORDER BY ct.started_at DESC;
                """,
                uid,
            )
            now = _now()
            results = []
            for r in rows:
                status = str(r["status"]).lower()
                is_paid = bool(r["has_verified_pay"] or r["has_verified_enr"])
                if is_paid and status != "converted":
                    status = "converted"
                    await conn.execute(
                        "UPDATE course_trials SET status = 'CONVERTED', converted_at = NOW(), updated_at = NOW() WHERE id = $1",
                        r["id"],
                    )

                expires_at = r["expires_at"]
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)

                diff = expires_at - now
                is_expired = diff.total_seconds() <= 0
                if status == "active" and is_expired:
                    status = "expired"
                    await conn.execute(
                        "UPDATE course_trials SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1",
                        r["id"],
                    )

                is_active = (status == "active") and not is_expired
                remaining_days = max(0, diff.days if is_active else 0)
                remaining_hours = max(0, int(diff.total_seconds() // 3600)) if is_active else 0

                results.append({
                    "id": str(r["id"]),
                    "courseId": str(r["course_id"]),
                    "courseTitle": r["course_title"],
                    "courseName": r["course_title"],
                    "courseSlug": r["course_slug"],
                    "startedAt": r["started_at"].isoformat(),
                    "expiresAt": expires_at.isoformat(),
                    "durationDays": int(r["duration_hours"] // 24) if r["duration_hours"] else DEFAULT_TRIAL_DAYS,
                    "durationHours": r["duration_hours"],
                    "status": status,
                    "isActive": is_active,
                    "isPaid": is_paid or (status == "converted"),
                    "remainingDays": remaining_days,
                    "daysRemaining": remaining_days,
                    "remainingHours": remaining_hours,
                    "hoursRemaining": remaining_hours,
                })
            return results

    # Mongo fallback
    db = get_db()
    u_oid = ObjectId(str(student_user_id)) if not isinstance(student_user_id, ObjectId) else student_user_id
    trials = await db.course_trials.find({"studentUserId": u_oid}).sort("startedAt", -1).to_list(100)
    now = _now()
    results = []
    for t in trials:
        status = t.get("status", "active")
        expires_at = t["expiresAt"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if status == "active" and now >= expires_at:
            status = "expired"
            await db.course_trials.update_one({"_id": t["_id"]}, {"$set": {"status": "expired"}})

        diff = expires_at - now
        is_active = (status == "active") and (diff.total_seconds() > 0)
        remaining_days = max(0, diff.days if is_active else 0)
        remaining_hours = max(0, int(diff.total_seconds() // 3600)) if remaining_days == 0 and is_active else 0

        results.append({
            "id": str(t["_id"]),
            "courseId": str(t["courseId"]),
            "courseTitle": t.get("courseTitle"),
            "courseName": t.get("courseTitle"),
            "courseSlug": t.get("courseSlug"),
            "startedAt": t["startedAt"].isoformat(),
            "expiresAt": t["expiresAt"].isoformat(),
            "durationDays": t.get("durationDays", DEFAULT_TRIAL_DAYS),
            "status": status,
            "isActive": is_active,
            "isPaid": status == "converted",
            "remainingDays": remaining_days,
            "daysRemaining": remaining_days,
            "remainingHours": remaining_hours,
            "hoursRemaining": remaining_hours,
        })
    return results


async def check_course_access(student_user_id: Any, course_id: Any) -> dict[str, Any]:
    """Check if the student has access to course content via verified enrollment or active trial."""
    uid = _to_uuid(student_user_id)
    cid = _to_uuid(course_id)

    if settings.USE_POSTGRES and uid:
        async with get_pg_connection() as conn:
            if not cid:
                slug_row = await conn.fetchrow(
                    "SELECT id FROM courses WHERE LOWER(slug) = LOWER($1) AND deleted_at IS NULL",
                    str(course_id).strip(),
                )
                if slug_row:
                    cid = slug_row["id"]
            if not cid:
                return {"hasAccess": False, "accessType": "none", "trial": None}

            # Free course check
            course = await conn.fetchrow(
                "SELECT id, fee, published, status FROM courses WHERE id = $1 AND deleted_at IS NULL", cid
            )
            if not course:
                return {"hasAccess": False, "accessType": "none", "trial": None}

            fee = float(course["fee"] or 0.0)
            if fee == 0.0:
                return {"hasAccess": True, "accessType": "free", "trial": None}

            # 1. Paid enrollment check
            paid_enr = await conn.fetchrow(
                """
                SELECT id, access_status, payment_status, access_end_date
                FROM enrollments
                WHERE participant_user_id = $1 AND course_id = $2
                  AND payment_status = 'VERIFIED' AND access_status = 'ACTIVE'
                """,
                uid,
                cid,
            )
            if not paid_enr:
                # Also check payments table directly for verified payment
                paid_payment = await conn.fetchrow(
                    """
                    SELECT id FROM payments
                    WHERE participant_user_id = $1 AND course_id = $2 AND status = 'VERIFIED'
                    """,
                    uid,
                    cid,
                )
                if paid_payment:
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
                    return {"hasAccess": True, "accessType": "paid", "trial": None}
            else:
                # If access_end_date was left at an expired trial date, clear it for verified paid member
                if paid_enr["access_end_date"] and paid_enr["access_end_date"] < _now().date():
                    await conn.execute(
                        "UPDATE enrollments SET access_end_date = NULL, updated_at = NOW() WHERE id = $1",
                        paid_enr["id"]
                    )
                return {"hasAccess": True, "accessType": "paid", "trial": None}

            # 2. Free trial check
            trial = await conn.fetchrow(
                """
                SELECT id, started_at, expires_at, duration_hours, status
                FROM course_trials
                WHERE participant_user_id = $1 AND course_id = $2
                """,
                uid,
                cid,
            )
            if not trial:
                return {"hasAccess": False, "accessType": "none", "trial": None}

            now = _now()
            expires_at = trial["expires_at"]
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            diff = expires_at - now
            is_active = (str(trial["status"]).upper() == "ACTIVE") and (diff.total_seconds() > 0)
            remaining_days = max(0, diff.days if is_active else 0)
            remaining_hours = max(0, int(diff.total_seconds() // 3600)) if is_active else 0

            if is_active:
                return {
                    "hasAccess": True,
                    "accessType": "trial",
                    "trialExpired": False,
                    "trial": {
                        "id": str(trial["id"]),
                        "expiresAt": expires_at.isoformat(),
                        "remainingDays": remaining_days,
                        "daysRemaining": remaining_days,
                        "remainingHours": remaining_hours,
                        "hoursRemaining": remaining_hours,
                        "status": "active",
                    },
                }

            return {
                "hasAccess": False,
                "accessType": "expired_trial",
                "trialExpired": True,
                "trial": {
                    "id": str(trial["id"]),
                    "expiresAt": expires_at.isoformat(),
                    "remainingDays": 0,
                    "daysRemaining": 0,
                    "remainingHours": 0,
                    "hoursRemaining": 0,
                    "status": "expired",
                },
            }

    # Mongo fallback
    db = get_db()
    c_oid = ObjectId(str(course_id)) if not isinstance(course_id, ObjectId) else course_id
    u_oid = ObjectId(str(student_user_id)) if not isinstance(student_user_id, ObjectId) else student_user_id

    enrollment = await db.enrollments.find_one({
        "studentUserId": u_oid,
        "courseId": c_oid,
        "status": "active",
        "deletedAt": None,
    })
    if enrollment:
        return {"hasAccess": True, "accessType": "paid", "trial": None}

    trial = await db.course_trials.find_one({
        "studentUserId": u_oid,
        "courseId": c_oid,
    })
    if not trial:
        return {"hasAccess": False, "accessType": "none", "trial": None}

    now = _now()
    expires_at = trial["expiresAt"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if trial.get("status") == "active" and now < expires_at:
        remaining_days = max(0, (expires_at - now).days)
        return {
            "hasAccess": True,
            "accessType": "trial",
            "trial": {
                "id": str(trial["_id"]),
                "expiresAt": expires_at.isoformat(),
                "remainingDays": remaining_days,
                "status": "active",
            },
        }

    return {
        "hasAccess": False,
        "accessType": "expired_trial",
        "trial": {
            "id": str(trial["_id"]),
            "expiresAt": expires_at.isoformat(),
            "remainingDays": 0,
            "status": "expired",
        },
    }
