"""Course Free Trial Service.

Manages the 7-day free trial lifecycle (§8).
A student is granted exactly one 7-day trial per course.
The backend calculates expiry from the activation timestamp, preventing client-side clock tampering.
Upon expiry, access to gated content requires course purchase without automatic recurring billing.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from bson import ObjectId

from app.core.errors import Conflict, NotFound, ValidationError
from app.db.mongo import get_db, serialize


def _now() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_TRIAL_DAYS = 7


async def activate_course_trial(
    student_user_id: ObjectId,
    college_id: ObjectId,
    course_id: ObjectId,
) -> dict[str, Any]:
    db = get_db()
    course = await db.courses.find_one({"_id": course_id})
    if not course:
        raise NotFound("Course not found.")

    # Check if student is already enrolled (purchased)
    enrollment = await db.enrollments.find_one({
        "studentUserId": student_user_id,
        "courseId": course_id,
        "status": "active",
        "deletedAt": None,
    })
    if enrollment and enrollment.get("enrollmentType") == "paid":
        raise Conflict("You are already enrolled in this course as a paid member.")

    # Check if a trial record already exists for this student + course (anti-abuse)
    existing_trial = await db.course_trials.find_one({
        "studentUserId": student_user_id,
        "courseId": course_id,
    })
    if existing_trial:
        raise Conflict("A free trial has already been used for this course.")

    now = _now()
    duration_days = int(course.get("trialDurationDays", DEFAULT_TRIAL_DAYS))
    expires_at = now + timedelta(days=duration_days)

    trial_doc = {
        "collegeId": college_id,
        "studentUserId": student_user_id,
        "courseId": course_id,
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


async def get_student_trials(student_user_id: ObjectId) -> list[dict[str, Any]]:
    db = get_db()
    trials = await db.course_trials.find({"studentUserId": student_user_id}).sort("startedAt", -1).to_list(100)
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
        remaining_days = max(0, diff.days if diff.total_seconds() > 0 else 0)
        remaining_hours = max(0, int(diff.total_seconds() // 3600)) if remaining_days == 0 and diff.total_seconds() > 0 else 0

        results.append({
            "id": str(t["_id"]),
            "courseId": str(t["courseId"]),
            "courseTitle": t.get("courseTitle"),
            "courseSlug": t.get("courseSlug"),
            "startedAt": t["startedAt"].isoformat(),
            "expiresAt": t["expiresAt"].isoformat(),
            "durationDays": t.get("durationDays", DEFAULT_TRIAL_DAYS),
            "status": status,
            "remainingDays": remaining_days,
            "remainingHours": remaining_hours,
        })
    return results


async def check_course_access(student_user_id: ObjectId, course_id: ObjectId) -> dict[str, Any]:
    """Check if the student has access to the course content via paid enrollment or active trial."""
    db = get_db()
    enrollment = await db.enrollments.find_one({
        "studentUserId": student_user_id,
        "courseId": course_id,
        "status": "active",
        "deletedAt": None,
    })
    if enrollment:
        return {"hasAccess": True, "accessType": "paid", "trial": None}

    trial = await db.course_trials.find_one({
        "studentUserId": student_user_id,
        "courseId": course_id,
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

