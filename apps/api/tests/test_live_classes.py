"""Automated test suite for Winners Creek Production Live Class & Virtual Classroom System."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
from bson import ObjectId

from app.models.live_class import ClassProvider, ClassStatus, MeetingType


def _future(minutes: int = 60) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def _past(minutes: int = 60) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


@pytest.mark.asyncio
async def test_live_class_creation_and_student_access(client, trainer, student, seeded_db):
    """Trainer schedules an online class; eligible student can see and join it."""
    # Find or enroll student in an active course
    student_user_id = ObjectId(student.user["id"])
    course = await seeded_db.courses.find_one({})
    assert course is not None
    course_id = str(course["_id"])

    await seeded_db.enrollments.update_one(
        {"studentUserId": student_user_id, "courseId": course["_id"]},
        {
            "$set": {
                "studentUserId": student_user_id,
                "courseId": course["_id"],
                "courseMode": "ONLINE",
                "status": "active",
                "enrolledAt": datetime.now(timezone.utc),
                "deletedAt": None,
            }
        },
        upsert=True,
    )

    # Trainer creates an online live class
    res = await trainer.post(
        "/live-classes",
        json={
            "title": "Interactive React 19 Mastery",
            "description": "Deep dive into server components and hooks",
            "meetingType": "CLASS_SESSION",
            "provider": "WINNERS_CREEK",
            "courseId": course_id,
            "courseMode": "ONLINE",
            "startsAt": _future(10),
            "endsAt": _future(70),
            "attendanceThreshold": 75.0,
        },
    )
    assert res.status_code == 200, res.text
    created = res.json()["data"]
    class_id = created["id"]
    assert created["title"] == "Interactive React 19 Mastery"
    assert created["status"] == "SCHEDULED"

    # Enrolled student fetches my live classes
    my_res = await student.get("/live-classes/my")
    assert my_res.status_code == 200
    classes = my_res.json()["data"]
    class_ids = [c["id"] for c in classes]
    assert class_id in class_ids

    # Student joins the class
    join_res = await student.post(f"/live-classes/{class_id}/join")
    assert join_res.status_code == 200
    join_data = join_res.json()["data"]
    assert join_data["status"] == "joined"
    assert join_data["provider"] == "WINNERS_CREEK"


@pytest.mark.asyncio
async def test_live_class_unenrolled_student_access_denied(client, trainer, seeded_db):
    """A student NOT enrolled in the course must be denied access with 403."""
    # Create an arbitrary course
    course_res = await seeded_db.courses.insert_one({
        "title": "Quantum Computing 101",
        "slug": "quantum-computing-101",
        "description": "Exclusive quantum physics course",
        "courseMode": "ONLINE",
        "published": True,
        "createdAt": datetime.now(timezone.utc),
    })
    course_id = str(course_res.inserted_id)

    # Trainer creates class for Quantum Computing
    res = await trainer.post(
        "/live-classes",
        json={
            "title": "Quantum Entanglement Live Session",
            "meetingType": "CLASS_SESSION",
            "provider": "WINNERS_CREEK",
            "courseId": course_id,
            "courseMode": "ONLINE",
            "startsAt": _future(10),
            "endsAt": _future(70),
            "attendanceThreshold": 75.0,
        },
    )
    assert res.status_code == 200
    class_id = res.json()["data"]["id"]

    # Student tries to join
    from tests.conftest import ACCOUNTS, login
    student_session = await login(client, ACCOUNTS["student"])
    join_res = await student_session.post(f"/live-classes/{class_id}/join")
    assert join_res.status_code == 403, "Unenrolled student must receive 403 Forbidden"


@pytest.mark.asyncio
async def test_super_admin_trainer_meeting_isolation(client, super_admin, trainer, student):
    """Super Admin schedules private TRAINER_MEETING. Student is forbidden; invited trainer has access."""
    trainer_user_id = trainer.user["id"]

    # Super Admin creates private TRAINER_MEETING
    res = await super_admin.post(
        "/live-classes",
        json={
            "title": "Q3 Pedagogical Strategy Review",
            "description": "Private administrative sync with trainers",
            "meetingType": "TRAINER_MEETING",
            "provider": "WINNERS_CREEK",
            "startsAt": _future(30),
            "endsAt": _future(90),
            "allowedTrainerIds": [trainer_user_id],
        },
    )
    assert res.status_code == 200, res.text
    meeting_id = res.json()["data"]["id"]

    # Student attempts to view or join meeting -> MUST receive 403 Forbidden
    student_view = await student.get(f"/live-classes/{meeting_id}")
    assert student_view.status_code == 403

    student_join = await student.post(f"/live-classes/{meeting_id}/join")
    assert student_join.status_code == 403

    # Student's /live-classes/my MUST NOT leak the meeting
    student_list = await student.get("/live-classes/my")
    assert student_list.status_code == 200
    for item in student_list.json()["data"]:
        assert item["id"] != meeting_id, "Student list must not leak TRAINER_MEETING"

    # Trainer CAN see and join the meeting
    trainer_view = await trainer.get(f"/live-classes/{meeting_id}")
    assert trainer_view.status_code == 200
    assert trainer_view.json()["data"]["title"] == "Q3 Pedagogical Strategy Review"


@pytest.mark.asyncio
async def test_heartbeat_and_attendance_finalization(client, trainer, student, seeded_db):
    """Tests continuous heartbeats, total duration calculation, and finalization into PRESENT/ABSENT."""
    student_user_id = ObjectId(student.user["id"])
    course = await seeded_db.courses.find_one({})
    assert course is not None
    course_id = str(course["_id"])

    await seeded_db.enrollments.update_one(
        {"studentUserId": student_user_id, "courseId": course["_id"]},
        {
            "$set": {
                "studentUserId": student_user_id,
                "courseId": course["_id"],
                "courseMode": "ONLINE",
                "status": "active",
                "enrolledAt": datetime.now(timezone.utc),
                "deletedAt": None,
            }
        },
        upsert=True,
    )

    # Create class
    res = await trainer.post(
        "/live-classes",
        json={
            "title": "Algorithms Deep Dive",
            "meetingType": "CLASS_SESSION",
            "provider": "WINNERS_CREEK",
            "courseId": course_id,
            "courseMode": "ONLINE",
            "startsAt": _past(30),  # started 30 mins ago
            "endsAt": _future(30),  # scheduled for 60 mins total
            "attendanceThreshold": 50.0,
        },
    )
    assert res.status_code == 200
    class_id = res.json()["data"]["id"]

    # Trainer starts class
    start_res = await trainer.post(f"/live-classes/{class_id}/start")
    assert start_res.status_code == 200
    assert start_res.json()["data"]["status"] == "LIVE"

    # Student joins
    join_res = await student.post(f"/live-classes/{class_id}/join")
    assert join_res.status_code == 200

    # Student sends heartbeat
    hb_res = await student.post(
        f"/live-classes/{class_id}/heartbeat",
        json={"audioActive": True, "videoActive": True, "screenShareActive": False},
    )
    assert hb_res.status_code == 200
    assert hb_res.json()["data"]["status"] == "ok"

    # Simulate participant duration in DB for test precision
    await seeded_db.live_participations.update_one(
        {"liveClassId": ObjectId(class_id), "userId": student_user_id},
        {"$set": {"totalSeconds": 2400}},  # 40 mins in 60 min class = 66.6% (> 50% threshold)
    )

    # Trainer ends class -> finalizes attendance
    end_res = await trainer.post(f"/live-classes/{class_id}/end")
    assert end_res.status_code == 200
    summary = end_res.json()["data"]
    assert summary["totalParticipants"] >= 1
    assert summary["present"] >= 1

    # Check attendance report
    att_res = await trainer.get(f"/live-classes/{class_id}/attendance")
    assert att_res.status_code == 200
    report = att_res.json()["data"]
    assert len(report["participants"]) >= 1
    student_rec = next(p for p in report["participants"] if p["userId"] == str(student_user_id))
    assert student_rec["attendanceStatus"] == "PRESENT"
    assert student_rec["attendancePercentage"] >= 50.0
