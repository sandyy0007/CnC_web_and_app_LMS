"""Live Class & Virtual Classroom business logic and authorization service."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.errors import NotFound, RoleForbidden, ScopeForbidden
from app.db.mongo import get_db
from app.models.live_class import AttendanceStatus, ClassStatus, MeetingType


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def can_student_access_live_class(
    student_user_id: ObjectId, live_class_id: ObjectId
) -> tuple[bool, str, dict[str, Any] | None]:
    """Central server-side live class eligibility check.
    
    A student must satisfy:
    1. Class exists and is not deleted.
    2. Class is NOT a TRAINER_MEETING.
    3. Class is not CANCELLED.
    4. Student has an active enrollment or valid trial in the associated course (if course-bound).
    5. If OFFLINE: student's collegeId, departmentId (if set), and batchId (if set) must match.
    6. If ONLINE: student must be actively enrolled in the course.
    """
    db = get_db()
    live_class = await db.live_classes.find_one({"_id": live_class_id, "deletedAt": None})
    if not live_class:
        return False, "Live class not found", None

    if live_class.get("meetingType") == MeetingType.TRAINER_MEETING.value:
        return False, "Access restricted to trainers and administrators", None

    if live_class.get("status") == ClassStatus.CANCELLED.value:
        return False, "This live class has been cancelled", None

    # Fetch student profile
    profile = await db.student_profiles.find_one({"userId": student_user_id})

    course_id = live_class.get("courseId")
    course_mode = live_class.get("courseMode", "ONLINE")

    if course_id:
        course_oid = ObjectId(str(course_id)) if not isinstance(course_id, ObjectId) else course_id
        enrollment = await db.enrollments.find_one({
            "studentUserId": student_user_id,
            "courseId": course_oid,
            "status": "active",
            "deletedAt": None,
        })
        if not enrollment:
            # Check trial
            trial = await db.course_trials.find_one({
                "studentUserId": student_user_id,
                "courseId": course_oid,
                "status": "active",
            })
            if not trial:
                return False, "You are not enrolled in the course for this live class", None
            expires_at = trial.get("expiresAt")
            if expires_at and (
                expires_at.replace(tzinfo=timezone.utc) if expires_at.tzinfo is None else expires_at
            ) < _now():
                return False, "Your trial for this course has expired", None

    if course_mode == "OFFLINE":
        if not profile:
            return False, "Student institutional profile not found", None
        
        target_college = live_class.get("collegeId")
        if target_college and profile.get("collegeId") != target_college:
            return False, "This class is scoped to a different college", None

        target_dept = live_class.get("departmentId")
        if target_dept and profile.get("departmentId") != target_dept:
            return False, "This class is scoped to a different department", None

        target_batch = live_class.get("batchId")
        if target_batch and profile.get("batchId") != target_batch:
            return False, "This class is scoped to a different batch", None

    elif course_mode == "ONLINE":
        target_batch = live_class.get("batchId")
        if target_batch:
            # Check if student's enrollment or profile matches batch
            batch_oid = ObjectId(str(target_batch)) if not isinstance(target_batch, ObjectId) else target_batch
            user_enrolled_batches = await db.enrollments.distinct(
                "batchId", {"studentUserId": student_user_id, "status": "active"}
            )
            profile_batch = profile.get("batchId") if profile else None
            all_batches = {b for b in user_enrolled_batches if b is not None}
            if profile_batch:
                all_batches.add(profile_batch)
            if batch_oid not in all_batches:
                return False, "You are not part of the scheduled batch for this online class", None

    return True, "Authorized", live_class


async def get_eligible_classes_for_student(ctx: ScopeContext) -> list[dict[str, Any]]:
    """Retrieve all classes the authenticated student is strictly eligible to see."""
    db = get_db()
    profile = await db.student_profiles.find_one({"userId": ctx.user_id}) or {}
    college_id = profile.get("collegeId") or ctx.college_id
    dept_id = profile.get("departmentId") or ctx.department_id
    batch_id = profile.get("batchId")

    # Get student active course enrollments
    active_enrollments = await db.enrollments.find(
        {"studentUserId": ctx.user_id, "status": "active", "deletedAt": None},
        {"courseId": 1, "courseMode": 1, "batchId": 1},
    ).to_list(100)

    enrolled_course_ids = [e["courseId"] for e in active_enrollments if "courseId" in e]
    enrolled_batch_ids = [e["batchId"] for e in active_enrollments if e.get("batchId")]
    if batch_id:
        enrolled_batch_ids.append(batch_id)

    # Active trials
    trials = await db.course_trials.find(
        {"studentUserId": ctx.user_id, "status": "active", "expiresAt": {"$gte": _now()}},
        {"courseId": 1},
    ).to_list(50)
    enrolled_course_ids.extend([t["courseId"] for t in trials if "courseId" in t])

    # Build query filter
    filters = []
    
    # Offline college scope
    if college_id:
        offline_q: dict[str, Any] = {
            "courseMode": "OFFLINE",
            "collegeId": college_id,
        }
        if batch_id:
            offline_q["$or"] = [{"batchId": batch_id}, {"batchId": None}]
        filters.append(offline_q)

    # Online enrolled courses scope
    if enrolled_course_ids:
        online_q: dict[str, Any] = {
            "courseMode": "ONLINE",
            "courseId": {"$in": enrolled_course_ids},
        }
        if enrolled_batch_ids:
            online_q["$or"] = [
                {"batchId": {"$in": enrolled_batch_ids}},
                {"batchId": None},
            ]
        filters.append(online_q)

    if not filters:
        # If student has neither institutional profile nor enrollments
        return []

    query: dict[str, Any] = {
        "deletedAt": None,
        "meetingType": {"$ne": MeetingType.TRAINER_MEETING.value},
        "status": {"$ne": ClassStatus.CANCELLED.value},
        "$or": filters,
    }

    rows = await db.live_classes.find(query).sort("startsAt", 1).to_list(150)
    return rows


async def get_classes_for_trainer(ctx: ScopeContext) -> list[dict[str, Any]]:
    """Retrieve all classes conducted or assigned to the trainer, including assigned batches and meetings."""
    db = get_db()
    trainer_user_id = ctx.user_id
    batch_ids = list(ctx.batch_ids)

    query: dict[str, Any] = {
        "deletedAt": None,
        "$or": [
            {"trainerUserId": trainer_user_id},
            {"allowedTrainerIds": trainer_user_id},
        ],
    }
    if batch_ids:
        query["$or"].append({"batchId": {"$in": batch_ids}})

    rows = await db.live_classes.find(query).sort("startsAt", 1).to_list(200)
    return rows


async def join_live_class(
    live_class_id: ObjectId, user_id: ObjectId, user_name: str, role: str
) -> dict[str, Any]:
    """Record participant join event and initialize session segment."""
    db = get_db()
    now = _now()

    # Find existing participation
    part = await db.live_participations.find_one({"liveClassId": live_class_id, "userId": user_id})
    new_segment = {"joinedAt": now, "leftAt": None, "lastHeartbeat": now}

    if not part:
        doc = {
            "liveClassId": live_class_id,
            "userId": user_id,
            "userName": user_name,
            "role": role,
            "joinedAt": now,
            "lastHeartbeat": now,
            "totalSeconds": 0,
            "segments": [new_segment],
            "attendancePercentage": 0.0,
            "attendanceStatus": AttendanceStatus.ABSENT.value,
            "finalized": False,
            "createdAt": now,
            "updatedAt": now,
        }
        await db.live_participations.insert_one(doc)
    else:
        # Check if last segment is open
        segments = part.get("segments", [])
        if segments and segments[-1].get("leftAt") is None:
            # Segment is already open, just update lastHeartbeat
            await db.live_participations.update_one(
                {"_id": part["_id"]},
                {
                    "$set": {
                        "lastHeartbeat": now,
                        "updatedAt": now,
                        f"segments.{len(segments) - 1}.lastHeartbeat": now,
                    }
                },
            )
        else:
            # Append new segment
            await db.live_participations.update_one(
                {"_id": part["_id"]},
                {
                    "$set": {"lastHeartbeat": now, "updatedAt": now},
                    "$push": {"segments": new_segment},
                },
            )

    return {"status": "joined", "timestamp": now.isoformat()}


async def record_heartbeat(
    live_class_id: ObjectId,
    user_id: ObjectId,
    user_name: str,
    role: str,
    audio_active: bool = False,
    video_active: bool = False,
    screen_active: bool = False,
) -> dict[str, Any]:
    """Record anti-cheat heartbeat and compute connected duration accurately across reconnections."""
    db = get_db()
    now = _now()

    part = await db.live_participations.find_one({"liveClassId": live_class_id, "userId": user_id})
    if not part:
        # Implicit join if heartbeat arrived first
        await join_live_class(live_class_id, user_id, user_name, role)
        part = await db.live_participations.find_one({"liveClassId": live_class_id, "userId": user_id})

    segments = part.get("segments", [])
    total_seconds = part.get("totalSeconds", 0)

    if segments and segments[-1].get("leftAt") is None:
        last_hb = segments[-1].get("lastHeartbeat") or segments[-1].get("joinedAt")
        if last_hb and last_hb.tzinfo is None:
            last_hb = last_hb.replace(tzinfo=timezone.utc)

        delta = (now - last_hb).total_seconds() if last_hb else 20
        
        # If heartbeat received within reasonable window (< 50 seconds), accumulate time
        if 0 < delta <= 50:
            total_seconds += int(delta)
            await db.live_participations.update_one(
                {"_id": part["_id"]},
                {
                    "$set": {
                        "lastHeartbeat": now,
                        "totalSeconds": total_seconds,
                        "updatedAt": now,
                        "audioActive": audio_active,
                        "videoActive": video_active,
                        "screenActive": screen_active,
                        f"segments.{len(segments) - 1}.lastHeartbeat": now,
                    }
                },
            )
        else:
            # Reconnection after gap! Close previous segment with its last known heartbeat
            await db.live_participations.update_one(
                {"_id": part["_id"]},
                {
                    "$set": {
                        f"segments.{len(segments) - 1}.leftAt": last_hb or now,
                        "updatedAt": now,
                    },
                    "$push": {
                        "segments": {"joinedAt": now, "leftAt": None, "lastHeartbeat": now}
                    },
                },
            )
    else:
        # Segment was closed, start new one
        await db.live_participations.update_one(
            {"_id": part["_id"]},
            {
                "$set": {"lastHeartbeat": now, "updatedAt": now},
                "$push": {"segments": {"joinedAt": now, "leftAt": None, "lastHeartbeat": now}},
            },
        )

    return {"status": "ok", "totalSeconds": total_seconds}


async def leave_live_class(live_class_id: ObjectId, user_id: ObjectId) -> dict[str, Any]:
    """Record participant leave event and close the active session segment."""
    db = get_db()
    now = _now()

    part = await db.live_participations.find_one({"liveClassId": live_class_id, "userId": user_id})
    if part:
        segments = part.get("segments", [])
        if segments and segments[-1].get("leftAt") is None:
            last_hb = segments[-1].get("lastHeartbeat")
            if last_hb and last_hb.tzinfo is None:
                last_hb = last_hb.replace(tzinfo=timezone.utc)
            delta = (now - last_hb).total_seconds() if last_hb else 0
            additional = int(delta) if 0 < delta <= 45 else 0

            await db.live_participations.update_one(
                {"_id": part["_id"]},
                {
                    "$set": {
                        f"segments.{len(segments) - 1}.leftAt": now,
                        "totalSeconds": part.get("totalSeconds", 0) + additional,
                        "updatedAt": now,
                    }
                },
            )

    return {"status": "left", "timestamp": now.isoformat()}


async def finalize_class_attendance(
    live_class_id: ObjectId, ended_by: ObjectId
) -> dict[str, Any]:
    """Idempotently finalize attendance records for all participants upon class conclusion."""
    db = get_db()
    now = _now()

    live_class = await db.live_classes.find_one({"_id": live_class_id})
    if not live_class:
        raise NotFound("Live class not found")

    # Determine class duration
    starts_at = live_class.get("actualStartsAt") or live_class.get("startsAt")
    if starts_at and starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)

    scheduled_ends = live_class.get("endsAt")
    if scheduled_ends and scheduled_ends.tzinfo is None:
        scheduled_ends = scheduled_ends.replace(tzinfo=timezone.utc)

    # Class total duration in seconds
    actual_duration = int((now - starts_at).total_seconds()) if starts_at else 3600
    scheduled_duration = int((scheduled_ends - starts_at).total_seconds()) if (starts_at and scheduled_ends) else actual_duration
    class_duration = max(60, min(actual_duration, scheduled_duration))

    threshold = float(live_class.get("attendanceThreshold", 75.0))

    # Fetch all participants
    participations = await db.live_participations.find({"liveClassId": live_class_id}).to_list(1000)

    summary = {"totalParticipants": len(participations), "present": 0, "partial": 0, "absent": 0}

    for p in participations:
        # Close open segment if any
        segments = p.get("segments", [])
        total_seconds = p.get("totalSeconds", 0)
        if segments and segments[-1].get("leftAt") is None:
            last_hb = segments[-1].get("lastHeartbeat")
            if last_hb and last_hb.tzinfo is None:
                last_hb = last_hb.replace(tzinfo=timezone.utc)
            delta = (now - last_hb).total_seconds() if last_hb else 0
            if 0 < delta <= 45:
                total_seconds += int(delta)
            await db.live_participations.update_one(
                {"_id": p["_id"], f"segments.{len(segments) - 1}.leftAt": None},
                {"$set": {f"segments.{len(segments) - 1}.leftAt": now}},
            )

        pct = round(min(100.0, (total_seconds / class_duration) * 100.0), 1)

        if pct >= threshold:
            status = AttendanceStatus.PRESENT.value
            summary["present"] += 1
        elif pct >= 30.0:
            status = AttendanceStatus.PARTIAL.value
            summary["partial"] += 1
        else:
            status = AttendanceStatus.ABSENT.value
            summary["absent"] += 1

        await db.live_participations.update_one(
            {"_id": p["_id"]},
            {
                "$set": {
                    "totalSeconds": total_seconds,
                    "attendancePercentage": pct,
                    "attendanceStatus": status,
                    "finalized": True,
                    "updatedAt": now,
                }
            },
        )

    # Mark class as completed
    await db.live_classes.update_one(
        {"_id": live_class_id},
        {
            "$set": {
                "status": ClassStatus.COMPLETED.value,
                "actualEndsAt": now,
                "attendanceFinalized": True,
                "endedBy": ended_by,
                "updatedAt": now,
            }
        },
    )

    return summary


async def get_class_attendance_summary(live_class_id: ObjectId) -> dict[str, Any]:
    """Retrieve detailed attendance list for a live class."""
    db = get_db()
    live_class = await db.live_classes.find_one({"_id": live_class_id})
    if not live_class:
        raise NotFound("Live class not found")

    records = await db.live_participations.find({"liveClassId": live_class_id}).to_list(1000)
    return {
        "liveClassId": str(live_class_id),
        "title": live_class.get("title"),
        "threshold": live_class.get("attendanceThreshold", 75.0),
        "status": live_class.get("status"),
        "participants": [
            {
                "userId": str(r["userId"]),
                "userName": r.get("userName", "Student"),
                "role": r.get("role", "STUDENT"),
                "totalSeconds": r.get("totalSeconds", 0),
                "totalMinutes": round(r.get("totalSeconds", 0) / 60, 1),
                "attendancePercentage": r.get("attendancePercentage", 0.0),
                "attendanceStatus": r.get("attendanceStatus", AttendanceStatus.ABSENT.value),
                "joinedAt": r.get("joinedAt"),
                "lastHeartbeat": r.get("lastHeartbeat"),
            }
            for r in records
        ],
    }

