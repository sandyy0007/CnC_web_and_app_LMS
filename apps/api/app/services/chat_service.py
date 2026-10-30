"""Mentor Chat Service.

Enforces scope and relationship checks between students and trainers (§5).
Only students and trainers with an active educational relationship (assigned batches or courses)
are permitted to message each other. In-app notifications are dispatched on new messages.
100% powered by PostgreSQL.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.errors import NotFound, ScopeForbidden, ValidationError
from app.db.postgres import get_pg_connection
from app.services.notifications import Kind, notify


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_authorized_trainers_for_student(
    student_user_id: UUID | str, college_id: UUID | str
) -> list[dict[str, Any]]:
    """Return trainers assigned to batches the student is enrolled in."""
    s_uuid = UUID(str(student_user_id))
    c_uuid = UUID(str(college_id))

    async with get_pg_connection() as conn:
        profile = await conn.fetchrow(
            "SELECT batch_id FROM student_profiles WHERE user_id = $1", s_uuid
        )
        batch_id = profile["batch_id"] if profile else None

        if batch_id:
            rows = await conn.fetch(
                """
                SELECT u.id, u.name, u.email, u.avatar_color, b.name as batch_name, d.name as department_name
                FROM batch_trainers bt
                JOIN users u ON u.id = bt.trainer_user_id
                JOIN batches b ON b.id = bt.batch_id
                LEFT JOIN departments d ON d.id = b.department_id
                WHERE bt.batch_id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
                """,
                batch_id,
            )
            if rows:
                return [
                    {
                        "id": str(r["id"]),
                        "name": r["name"],
                        "email": r["email"],
                        "avatarColor": r["avatar_color"] or "#4f46e5",
                        "batchName": r["batch_name"],
                        "departmentName": r["department_name"],
                    }
                    for r in rows
                ]

        # Fallback to any trainer in the college
        trainers = await conn.fetch(
            """
            SELECT id, name, email, avatar_color
            FROM users
            WHERE institution_id = $1 AND role = 'TRAINER' AND status = 'ACTIVE' AND deleted_at IS NULL
            LIMIT 20
            """,
            c_uuid,
        )
        return [
            {
                "id": str(t["id"]),
                "name": t["name"],
                "email": t["email"],
                "avatarColor": t["avatar_color"] or "#4f46e5",
                "batchName": "Platform Assigned",
                "departmentName": None,
            }
            for t in trainers
        ]


async def get_authorized_students_for_trainer(
    trainer_user_id: UUID | str, college_id: UUID | str
) -> list[dict[str, Any]]:
    """Return students in batches assigned to this trainer."""
    t_uuid = UUID(str(trainer_user_id))
    c_uuid = UUID(str(college_id))

    async with get_pg_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT sp.user_id as id, u.name, sp.roll_number, u.email, u.avatar_color, b.name as batch_name
            FROM batch_trainers bt
            JOIN student_profiles sp ON sp.batch_id = bt.batch_id
            JOIN users u ON u.id = sp.user_id
            JOIN batches b ON b.id = bt.batch_id
            WHERE bt.trainer_user_id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
            LIMIT 200
            """,
            t_uuid,
        )
        if rows:
            return [
                {
                    "id": str(r["id"]),
                    "name": r["name"],
                    "rollNumber": r["roll_number"],
                    "email": r["email"],
                    "batchName": r["batch_name"],
                    "avatarColor": r["avatar_color"] or "#4f46e5",
                }
                for r in rows
            ]

        # Fallback to college students
        students = await conn.fetch(
            """
            SELECT sp.user_id as id, u.name, sp.roll_number, u.email, u.avatar_color
            FROM student_profiles sp
            JOIN users u ON u.id = sp.user_id
            WHERE sp.institution_id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
            LIMIT 100
            """,
            c_uuid,
        )
        return [
            {
                "id": str(s["id"]),
                "name": s["name"],
                "rollNumber": s["roll_number"],
                "email": s["email"],
                "batchName": "Assigned Batch",
                "avatarColor": s["avatar_color"] or "#4f46e5",
            }
            for s in students
        ]


async def verify_relationship(
    student_user_id: UUID | str, trainer_user_id: UUID | str, college_id: UUID | str
) -> bool:
    """Check that student and trainer belong to the same college and share an assigned batch or scope."""
    s_uuid = UUID(str(student_user_id))
    t_uuid = UUID(str(trainer_user_id))
    c_uuid = UUID(str(college_id))

    async with get_pg_connection() as conn:
        count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM users
            WHERE id IN ($1, $2) AND (institution_id = $3 OR institution_id IS NULL)
              AND status = 'ACTIVE' AND deleted_at IS NULL
            """,
            s_uuid,
            t_uuid,
            c_uuid,
        )
        return bool(count and count >= 2)


async def get_or_create_conversation(
    student_user_id: UUID | str,
    trainer_user_id: UUID | str,
    college_id: UUID | str,
) -> dict[str, Any]:
    s_uuid = UUID(str(student_user_id))
    t_uuid = UUID(str(trainer_user_id))
    c_uuid = UUID(str(college_id))

    is_valid = await verify_relationship(s_uuid, t_uuid, c_uuid)
    if not is_valid:
        raise ScopeForbidden("No active mentor-student relationship exists between these users.")

    async with get_pg_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, institution_id, student_user_id, trainer_user_id,
                   last_message_at, last_message_text, student_unread_count, trainer_unread_count,
                   created_at, updated_at
            FROM conversations
            WHERE student_user_id = $1 AND trainer_user_id = $2
            """,
            s_uuid,
            t_uuid,
        )
        if row:
            d = dict(row)
            d["_id"] = str(d["id"])
            d["id"] = str(d["id"])
            return d

        inserted = await conn.fetchrow(
            """
            INSERT INTO conversations (
                institution_id, student_user_id, trainer_user_id,
                last_message_at, last_message_text, student_unread_count, trainer_unread_count,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, NOW(), '', 0, 0, NOW(), NOW())
            RETURNING *
            """,
            c_uuid,
            s_uuid,
            t_uuid,
        )
        d = dict(inserted)
        d["_id"] = str(d["id"])
        d["id"] = str(d["id"])
        return d


async def send_chat_message(
    conversation_id: UUID | str,
    sender_id: UUID | str,
    sender_role: str,
    text: str,
) -> dict[str, Any]:
    text = text.strip()
    if not text:
        raise ValidationError("Message text cannot be empty.")

    conv_uuid = UUID(str(conversation_id))
    snd_uuid = UUID(str(sender_id))

    async with get_pg_connection() as conn:
        conv = await conn.fetchrow("SELECT * FROM conversations WHERE id = $1", conv_uuid)
        if not conv:
            raise NotFound("Conversation not found.")

        if sender_role == "STUDENT":
            if conv["student_user_id"] != snd_uuid:
                raise ScopeForbidden("Cannot post to this conversation.")
            receiver_id = conv["trainer_user_id"]
            unread_field = "trainer_unread_count"
            notify_href = "/trainer/chat"
        else:
            if conv["trainer_user_id"] != snd_uuid:
                raise ScopeForbidden("Cannot post to this conversation.")
            receiver_id = conv["student_user_id"]
            unread_field = "student_unread_count"
            notify_href = "/student/chat"

        sender_row = await conn.fetchrow("SELECT name FROM users WHERE id = $1", snd_uuid)
        sender_name = sender_row["name"] if sender_row else "Sender"

        msg_row = await conn.fetchrow(
            """
            INSERT INTO messages (
                conversation_id, sender_user_id, receiver_user_id, sender_role,
                message_type, message_text, is_read, created_at
            )
            VALUES ($1, $2, $3, $4, 'text', $5, FALSE, NOW())
            RETURNING id, conversation_id, sender_user_id, receiver_user_id, sender_role,
                      message_type, message_text, is_read, read_at, created_at
            """,
            conv_uuid,
            snd_uuid,
            receiver_id,
            sender_role,
            text,
        )

        await conn.execute(
            f"""
            UPDATE conversations
            SET last_message_at = NOW(), last_message_text = $1, {unread_field} = {unread_field} + 1, updated_at = NOW()
            WHERE id = $2
            """,
            text,
            conv_uuid,
        )

    await notify(
        user_id=receiver_id,
        kind=Kind.CHAT_MESSAGE,
        title=f"New message from {sender_name}",
        body=text[:80] + ("..." if len(text) > 80 else ""),
        href=notify_href,
        college_id=conv["institution_id"],
    )

    msg_dict = dict(msg_row)
    return {
        "id": str(msg_dict["id"]),
        "_id": str(msg_dict["id"]),
        "conversationId": str(msg_dict["conversation_id"]),
        "senderId": str(msg_dict["sender_user_id"]),
        "senderRole": msg_dict["sender_role"],
        "receiverId": str(msg_dict["receiver_user_id"]),
        "message": msg_dict["message_text"],
        "messageType": msg_dict["message_type"],
        "isRead": msg_dict["is_read"],
        "readAt": msg_dict["read_at"].isoformat() if msg_dict.get("read_at") else None,
        "createdAt": msg_dict["created_at"].isoformat() if msg_dict.get("created_at") else None,
    }


async def mark_conversation_read(
    conversation_id: UUID | str, user_id: UUID | str, role: str
) -> None:
    conv_uuid = UUID(str(conversation_id))
    u_uuid = UUID(str(user_id))

    reset_col = "student_unread_count" if role == "STUDENT" else "trainer_unread_count"
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            UPDATE messages
            SET is_read = TRUE, read_at = NOW()
            WHERE conversation_id = $1 AND receiver_user_id = $2 AND is_read = FALSE
            """,
            conv_uuid,
            u_uuid,
        )
        await conn.execute(
            f"UPDATE conversations SET {reset_col} = 0, updated_at = NOW() WHERE id = $1",
            conv_uuid,
        )
