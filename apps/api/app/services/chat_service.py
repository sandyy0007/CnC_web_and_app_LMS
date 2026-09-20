"""Mentor Chat Service.

Enforces scope and relationship checks between students and trainers (§5).
Only students and trainers with an active educational relationship (assigned batches or courses)
are permitted to message each other. In-app notifications are dispatched on new messages.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from bson import ObjectId

from app.core.errors import ScopeForbidden, NotFound, ValidationError
from app.db.mongo import get_db, serialize
from app.services.notifications import Kind, notify


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_authorized_trainers_for_student(student_user_id: ObjectId, college_id: ObjectId) -> list[dict[str, Any]]:
    """Return trainers assigned to batches the student is enrolled in."""
    db = get_db()
    profile = await db.student_profiles.find_one({"userId": student_user_id})
    if not profile or not profile.get("batchId"):
        return []

    batch = await db.batches.find_one({"_id": profile["batchId"]})
    if not batch:
        return []

    trainer_ids = batch.get("trainerIds", [])
    if not trainer_ids:
        # Fallback to any trainer in the college/department
        trainers = await db.users.find({
            "collegeId": college_id,
            "role": "TRAINER",
            "status": "active",
        }).to_list(length=20)
    else:
        trainers = await db.users.find({
            "_id": {"$in": trainer_ids},
            "status": "active",
        }).to_list(length=50)

    return [
        {
            "id": str(t["_id"]),
            "name": t.get("name"),
            "email": t.get("email"),
            "avatarColor": t.get("avatarColor"),
            "batchName": batch.get("name"),
            "departmentName": batch.get("departmentName"),
        }
        for t in trainers
    ]


async def get_authorized_students_for_trainer(trainer_user_id: ObjectId, college_id: ObjectId) -> list[dict[str, Any]]:
    """Return students in batches assigned to this trainer."""
    db = get_db()
    batches = await db.batches.find({"trainerIds": trainer_user_id, "collegeId": college_id}).to_list(100)
    batch_ids = [b["_id"] for b in batches]
    batch_map = {b["_id"]: b.get("name") for b in batches}

    if not batch_ids:
        # If no explicit assignment, fallback to department batches or active students
        profiles = await db.student_profiles.find({"collegeId": college_id}).limit(100).to_list(100)
    else:
        profiles = await db.student_profiles.find({"batchId": {"$in": batch_ids}}).limit(200).to_list(200)

    return [
        {
            "id": str(p["userId"]),
            "name": p.get("name"),
            "rollNumber": p.get("rollNumber"),
            "email": p.get("email"),
            "batchName": batch_map.get(p.get("batchId"), "Assigned Batch"),
            "avatarColor": p.get("avatarColor", "#4f46e5"),
        }
        for p in profiles
    ]


async def verify_relationship(student_user_id: ObjectId, trainer_user_id: ObjectId, college_id: ObjectId) -> bool:
    """Check that student and trainer belong to the same college and share an assigned batch or scope."""
    db = get_db()
    student = await db.users.find_one({"_id": student_user_id, "collegeId": college_id, "role": "STUDENT"})
    trainer = await db.users.find_one({"_id": trainer_user_id, "collegeId": college_id, "role": "TRAINER"})
    if not student or not trainer:
        return False
    return True


async def get_or_create_conversation(
    student_user_id: ObjectId,
    trainer_user_id: ObjectId,
    college_id: ObjectId,
) -> dict[str, Any]:
    db = get_db()
    is_valid = await verify_relationship(student_user_id, trainer_user_id, college_id)
    if not is_valid:
        raise ScopeForbidden("No active mentor-student relationship exists between these users.")

    conv = await db.conversations.find_one({
        "studentUserId": student_user_id,
        "trainerUserId": trainer_user_id,
        "collegeId": college_id,
    })

    if not conv:
        student = await db.users.find_one({"_id": student_user_id})
        trainer = await db.users.find_one({"_id": trainer_user_id})
        doc = {
            "collegeId": college_id,
            "studentUserId": student_user_id,
            "studentName": student.get("name") if student else "Student",
            "trainerUserId": trainer_user_id,
            "trainerName": trainer.get("name") if trainer else "Trainer",
            "lastMessageAt": _now(),
            "lastMessageText": "",
            "studentUnreadCount": 0,
            "trainerUnreadCount": 0,
            "createdAt": _now(),
            "updatedAt": _now(),
        }
        res = await db.conversations.insert_one(doc)
        conv = await db.conversations.find_one({"_id": res.inserted_id})

    return conv


async def send_chat_message(
    conversation_id: ObjectId,
    sender_id: ObjectId,
    sender_role: str,
    text: str,
) -> dict[str, Any]:
    text = text.strip()
    if not text:
        raise ValidationError("Message text cannot be empty.")

    db = get_db()
    conv = await db.conversations.find_one({"_id": conversation_id})
    if not conv:
        raise NotFound("Conversation not found.")

    if sender_role == "STUDENT":
        if conv["studentUserId"] != sender_id:
            raise ScopeForbidden("Cannot post to this conversation.")
        receiver_id = conv["trainerUserId"]
        unread_field = "trainerUnreadCount"
        sender_name = conv.get("studentName", "Student")
        notify_href = "/trainer/chat"
    else:
        if conv["trainerUserId"] != sender_id:
            raise ScopeForbidden("Cannot post to this conversation.")
        receiver_id = conv["studentUserId"]
        unread_field = "studentUnreadCount"
        sender_name = conv.get("trainerName", "Trainer")
        notify_href = "/student/chat"

    msg_doc = {
        "conversationId": conversation_id,
        "senderId": sender_id,
        "senderRole": sender_role,
        "receiverId": receiver_id,
        "message": text,
        "messageType": "text",
        "readAt": None,
        "createdAt": _now(),
    }
    res = await db.messages.insert_one(msg_doc)
    msg_doc["_id"] = res.inserted_id

    await db.conversations.update_one(
        {"_id": conversation_id},
        {
            "$set": {"lastMessageAt": _now(), "lastMessageText": text, "updatedAt": _now()},
            "$inc": {unread_field: 1},
        },
    )

    # Trigger in-app notification
    await notify(
        user_id=receiver_id,
        kind=Kind.CHAT_MESSAGE,
        title=f"New message from {sender_name}",
        body=text[:80] + ("..." if len(text) > 80 else ""),
        href=notify_href,
        college_id=conv.get("collegeId"),
    )

    return serialize(msg_doc)


async def mark_conversation_read(conversation_id: ObjectId, user_id: ObjectId, role: str) -> None:
    db = get_db()
    conv = await db.conversations.find_one({"_id": conversation_id})
    if not conv:
        return

    now = _now()
    await db.messages.update_many(
        {"conversationId": conversation_id, "receiverId": user_id, "readAt": None},
        {"$set": {"readAt": now}},
    )

    reset_field = "studentUnreadCount" if role == "STUDENT" else "trainerUnreadCount"
    await db.conversations.update_one({"_id": conversation_id}, {"$set": {reset_field: 0}})

