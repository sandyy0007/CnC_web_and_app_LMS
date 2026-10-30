"""Live Class & Virtual Classroom PostgreSQL Repository."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.db.postgres import get_pg_connection


def _now() -> datetime:
    return datetime.now(timezone.utc)


class LiveClassRepository:
    @staticmethod
    async def get_by_id(class_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, institution_id, department_id, batch_id, trainer_user_id,
                       course_id, title, description, meeting_link, meeting_url, room_id,
                       passcode, provider, meeting_type, course_mode, allowed_trainer_ids,
                       starts_at, ends_at, actual_starts_at, actual_ends_at, duration_minutes,
                       status, attendance_threshold, attendance_finalized, ended_by,
                       recording_url, created_by, created_at, updated_at
                FROM live_classes
                WHERE id = $1 AND deleted_at IS NULL
                """,
                UUID(str(class_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def can_student_access_live_class(
        student_user_id: UUID | str, class_id: UUID | str
    ) -> tuple[bool, str, dict[str, Any] | None]:
        s_uuid = UUID(str(student_user_id))
        c_uuid = UUID(str(class_id))
        cls = await LiveClassRepository.get_by_id(c_uuid)
        if not cls:
            return False, "Live class not found", None

        if cls.get("meeting_type") == "TRAINER_MEETING":
            return False, "Access restricted to trainers and administrators", None

        if cls.get("status") == "CANCELLED":
            return False, "This live class has been cancelled", None

        async with get_pg_connection() as conn:
            profile = await conn.fetchrow(
                "SELECT institution_id, department_id, batch_id FROM student_profiles WHERE user_id = $1",
                s_uuid,
            )

            course_id = cls.get("course_id")
            course_mode = cls.get("course_mode", "ONLINE")

            if course_id:
                enrolled = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM enrollments
                    WHERE participant_user_id = $1 AND course_id = $2
                      AND (access_status = 'GRANTED' OR enrollment_status = 'ACTIVE')
                    """,
                    s_uuid,
                    course_id,
                )
                if not enrolled or enrolled == 0:
                    return False, "You are not enrolled in the course for this live class", None

            if course_mode == "OFFLINE":
                if not profile:
                    return False, "Student institutional profile not found", None
                if cls.get("institution_id") and profile["institution_id"] != cls["institution_id"]:
                    return False, "This class is scoped to a different college", None
                if cls.get("department_id") and profile["department_id"] != cls["department_id"]:
                    return False, "This class is scoped to a different department", None
                if cls.get("batch_id") and profile["batch_id"] != cls["batch_id"]:
                    return False, "This class is scoped to a different batch", None

            elif course_mode == "ONLINE" and cls.get("batch_id"):
                batch_match = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM enrollments
                    WHERE participant_user_id = $1 AND batch_id = $2
                      AND (access_status = 'GRANTED' OR enrollment_status = 'ACTIVE')
                    """,
                    s_uuid,
                    cls["batch_id"],
                )
                profile_batch = profile["batch_id"] if profile else None
                if (not batch_match or batch_match == 0) and profile_batch != cls["batch_id"]:
                    return False, "You are not part of the scheduled batch for this online class", None

        return True, "Authorized", cls

    @staticmethod
    async def get_eligible_classes_for_student(
        student_user_id: UUID | str,
        college_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
    ) -> list[dict[str, Any]]:
        s_uuid = UUID(str(student_user_id))
        async with get_pg_connection() as conn:
            profile = await conn.fetchrow(
                "SELECT institution_id, department_id, batch_id FROM student_profiles WHERE user_id = $1",
                s_uuid,
            )
            c_id = profile["institution_id"] if profile and profile["institution_id"] else (UUID(str(college_id)) if college_id else None)
            d_id = profile["department_id"] if profile and profile["department_id"] else (UUID(str(department_id)) if department_id else None)
            b_id = profile["batch_id"] if profile and profile["batch_id"] else None

            # Get enrolled courses and batches
            enrollment_rows = await conn.fetch(
                """
                SELECT course_id, batch_id FROM enrollments
                WHERE participant_user_id = $1 AND (access_status = 'GRANTED' OR enrollment_status = 'ACTIVE')
                """,
                s_uuid,
            )
            enrolled_course_ids = [r["course_id"] for r in enrollment_rows if r["course_id"]]
            enrolled_batch_ids = [r["batch_id"] for r in enrollment_rows if r["batch_id"]]
            if b_id and b_id not in enrolled_batch_ids:
                enrolled_batch_ids.append(b_id)

            conditions = [
                "deleted_at IS NULL",
                "meeting_type != 'TRAINER_MEETING'",
                "status != 'CANCELLED'",
            ]

            scope_or = []
            params: list[Any] = []

            if c_id:
                params.append(c_id)
                idx = len(params)
                if b_id:
                    params.append(b_id)
                    b_idx = len(params)
                    scope_or.append(f"(course_mode = 'OFFLINE' AND institution_id = ${idx} AND (batch_id = ${b_idx} OR batch_id IS NULL))")
                else:
                    scope_or.append(f"(course_mode = 'OFFLINE' AND institution_id = ${idx})")

            if enrolled_course_ids:
                params.append(enrolled_course_ids)
                c_idx = len(params)
                if enrolled_batch_ids:
                    params.append(enrolled_batch_ids)
                    eb_idx = len(params)
                    scope_or.append(f"(course_mode = 'ONLINE' AND course_id = ANY(${c_idx}) AND (batch_id = ANY(${eb_idx}) OR batch_id IS NULL))")
                else:
                    scope_or.append(f"(course_mode = 'ONLINE' AND course_id = ANY(${c_idx}))")

            if not scope_or:
                return []

            conditions.append(f"({' OR '.join(scope_or)})")
            query = f"""
                SELECT * FROM live_classes
                WHERE {' AND '.join(conditions)}
                ORDER BY starts_at ASC
                LIMIT 150
            """
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def get_classes_for_trainer(
        trainer_user_id: UUID | str, batch_ids: list[UUID | str]
    ) -> list[dict[str, Any]]:
        t_uuid = UUID(str(trainer_user_id))
        b_uuids = [UUID(str(b)) for b in batch_ids] if batch_ids else []

        async with get_pg_connection() as conn:
            if b_uuids:
                rows = await conn.fetch(
                    """
                    SELECT * FROM live_classes
                    WHERE deleted_at IS NULL
                      AND (trainer_user_id = $1 OR allowed_trainer_ids @> $2::jsonb OR batch_id = ANY($3))
                    ORDER BY starts_at DESC
                    LIMIT 200
                    """,
                    t_uuid,
                    json.dumps([str(t_uuid)]),
                    b_uuids,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM live_classes
                    WHERE deleted_at IS NULL
                      AND (trainer_user_id = $1 OR allowed_trainer_ids @> $2::jsonb)
                    ORDER BY starts_at DESC
                    LIMIT 200
                    """,
                    t_uuid,
                    json.dumps([str(t_uuid)]),
                )
            return [dict(r) for r in rows]

    @staticmethod
    async def list_classes(
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        exclude_trainer_meetings: bool = False,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        conditions = ["deleted_at IS NULL"]
        params: list[Any] = []

        if exclude_trainer_meetings:
            conditions.append("meeting_type != 'TRAINER_MEETING'")
        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"institution_id = ${len(params)}")
        if department_id:
            params.append(UUID(str(department_id)))
            conditions.append(f"department_id = ${len(params)}")

        params.append(limit)
        limit_idx = len(params)

        query = f"""
            SELECT * FROM live_classes
            WHERE {' AND '.join(conditions)}
            ORDER BY starts_at DESC
            LIMIT ${limit_idx}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def create_live_class(data: dict[str, Any]) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            inst_id = UUID(str(data["collegeId"])) if data.get("collegeId") else None
            dept_id = UUID(str(data["departmentId"])) if data.get("departmentId") else None
            batch_id = UUID(str(data["batchId"])) if data.get("batchId") else None
            trainer_id = UUID(str(data["trainerUserId"])) if data.get("trainerUserId") else None
            course_id = UUID(str(data["courseId"])) if data.get("courseId") else None
            created_by = UUID(str(data["createdBy"])) if data.get("createdBy") else None

            allowed_trainers = json.dumps([str(t) for t in data.get("allowedTrainerIds", [])])

            row = await conn.fetchrow(
                """
                INSERT INTO live_classes (
                    institution_id, department_id, batch_id, trainer_user_id, course_id,
                    title, description, meeting_link, meeting_url, room_id, passcode,
                    provider, meeting_type, course_mode, allowed_trainer_ids,
                    starts_at, ends_at, duration_minutes, status, attendance_threshold,
                    created_by, created_at, updated_at
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10, $11,
                    $12, $13, $14, $15::jsonb,
                    $16, $17, $18, $19, $20,
                    $21, NOW(), NOW()
                )
                RETURNING *
                """,
                inst_id,
                dept_id,
                batch_id,
                trainer_id,
                course_id,
                data["title"],
                data.get("description"),
                data.get("meetingUrl") or "",
                data.get("meetingUrl"),
                data.get("roomId"),
                data.get("passcode"),
                data.get("provider", "WINNERS_CREEK"),
                data.get("meetingType", "BATCH_CLASS"),
                data.get("courseMode", "ONLINE"),
                allowed_trainers,
                data["startsAt"],
                data.get("endsAt"),
                int(data.get("durationMinutes", 60)),
                data.get("status", "SCHEDULED"),
                float(data.get("attendanceThreshold", 75.0)),
                created_by,
            )
            return dict(row)

    @staticmethod
    async def update_live_class(class_id: UUID | str, updates: dict[str, Any]) -> dict[str, Any] | None:
        c_uuid = UUID(str(class_id))
        set_clauses = ["updated_at = NOW()"]
        params: list[Any] = [c_uuid]

        field_map = {
            "title": "title",
            "description": "description",
            "meetingUrl": "meeting_url",
            "passcode": "passcode",
            "startsAt": "starts_at",
            "endsAt": "ends_at",
            "status": "status",
            "recordingUrl": "recording_url",
            "attendanceThreshold": "attendance_threshold",
        }

        for model_k, col in field_map.items():
            if model_k in updates and updates[model_k] is not None:
                params.append(updates[model_k])
                set_clauses.append(f"{col} = ${len(params)}")

        query = f"""
            UPDATE live_classes
            SET {', '.join(set_clauses)}
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING *
        """
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(query, *params)
            return dict(row) if row else None

    @staticmethod
    async def start_live_class(class_id: UUID | str) -> dict[str, Any]:
        c_uuid = UUID(str(class_id))
        now = _now()
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE live_classes
                SET status = 'LIVE', actual_starts_at = $1, updated_at = $1
                WHERE id = $2
                """,
                now,
                c_uuid,
            )
            return {"status": "LIVE", "actualStartsAt": now.isoformat()}

    @staticmethod
    async def join_live_class(
        class_id: UUID | str, user_id: UUID | str, user_name: str, role: str
    ) -> dict[str, Any]:
        c_uuid = UUID(str(class_id))
        u_uuid = UUID(str(user_id))
        now = _now()
        new_segment = json.dumps([{"joinedAt": now.isoformat(), "leftAt": None, "lastHeartbeat": now.isoformat()}])

        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO live_participations (
                    live_class_id, user_id, user_name, user_role, joined_at, last_heartbeat,
                    total_seconds, segments, attendance_percentage, attendance_status, finalized, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $5, 0, $6::jsonb, 0.0, 'ABSENT', FALSE, $5, $5)
                ON CONFLICT (live_class_id, user_id)
                DO UPDATE SET last_heartbeat = $5, updated_at = $5
                """,
                c_uuid,
                u_uuid,
                user_name,
                role,
                now,
                new_segment,
            )
            return {"status": "joined", "timestamp": now.isoformat()}

    @staticmethod
    async def record_heartbeat(
        class_id: UUID | str, user_id: UUID | str, user_name: str, role: str
    ) -> dict[str, Any]:
        c_uuid = UUID(str(class_id))
        u_uuid = UUID(str(user_id))
        now = _now()

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                "SELECT id, total_seconds, last_heartbeat FROM live_participations WHERE live_class_id = $1 AND user_id = $2",
                c_uuid,
                u_uuid,
            )
            if not row:
                await LiveClassRepository.join_live_class(c_uuid, u_uuid, user_name, role)
                row = await conn.fetchrow(
                    "SELECT id, total_seconds, last_heartbeat FROM live_participations WHERE live_class_id = $1 AND user_id = $2",
                    c_uuid,
                    u_uuid,
                )

            total_seconds = row["total_seconds"] if row else 0
            last_hb = row["last_heartbeat"] if row else None
            delta = int((now - last_hb).total_seconds()) if last_hb else 20
            if 0 < delta <= 50:
                total_seconds += delta

            await conn.execute(
                """
                UPDATE live_participations
                SET last_heartbeat = $1, total_seconds = $2, updated_at = $1
                WHERE live_class_id = $3 AND user_id = $4
                """,
                now,
                total_seconds,
                c_uuid,
                u_uuid,
            )
            return {"status": "ok", "totalSeconds": total_seconds}

    @staticmethod
    async def leave_live_class(class_id: UUID | str, user_id: UUID | str) -> dict[str, Any]:
        c_uuid = UUID(str(class_id))
        u_uuid = UUID(str(user_id))
        now = _now()
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE live_participations
                SET left_at = $1, updated_at = $1
                WHERE live_class_id = $2 AND user_id = $3
                """,
                now,
                c_uuid,
                u_uuid,
            )
            return {"status": "left", "timestamp": now.isoformat()}

    @staticmethod
    async def finalize_class_attendance(class_id: UUID | str, ended_by: UUID | str) -> dict[str, Any]:
        c_uuid = UUID(str(class_id))
        end_uuid = UUID(str(ended_by))
        now = _now()

        async with get_pg_connection() as conn:
            cls = await conn.fetchrow("SELECT * FROM live_classes WHERE id = $1", c_uuid)
            if not cls:
                return {"totalParticipants": 0, "present": 0, "partial": 0, "absent": 0}

            starts_at = cls["actual_starts_at"] or cls["starts_at"]
            duration = max(60, int((now - starts_at).total_seconds())) if starts_at else 3600
            threshold = float(cls.get("attendance_threshold") or 75.0)

            parts = await conn.fetch(
                "SELECT id, total_seconds FROM live_participations WHERE live_class_id = $1",
                c_uuid,
            )

            summary = {"totalParticipants": len(parts), "present": 0, "partial": 0, "absent": 0}

            for p in parts:
                tot = p["total_seconds"]
                pct = round(min(100.0, (tot / duration) * 100.0), 1)
                if pct >= threshold:
                    st = "PRESENT"
                    summary["present"] += 1
                elif pct >= 30.0:
                    st = "PARTIAL"
                    summary["partial"] += 1
                else:
                    st = "ABSENT"
                    summary["absent"] += 1

                await conn.execute(
                    """
                    UPDATE live_participations
                    SET attendance_percentage = $1, attendance_status = $2, finalized = TRUE, updated_at = $3
                    WHERE id = $4
                    """,
                    pct,
                    st,
                    now,
                    p["id"],
                )

            await conn.execute(
                """
                UPDATE live_classes
                SET status = 'COMPLETED', actual_ends_at = $1, attendance_finalized = TRUE, ended_by = $2, updated_at = $1
                WHERE id = $3
                """,
                now,
                end_uuid,
                c_uuid,
            )

            return summary

    @staticmethod
    async def get_class_attendance_summary(class_id: UUID | str) -> dict[str, Any]:
        c_uuid = UUID(str(class_id))
        async with get_pg_connection() as conn:
            cls = await conn.fetchrow("SELECT title, attendance_threshold, status FROM live_classes WHERE id = $1", c_uuid)
            if not cls:
                return {"liveClassId": str(c_uuid), "participants": []}

            parts = await conn.fetch(
                """
                SELECT user_id, user_name, user_role, total_seconds, attendance_percentage,
                       attendance_status, joined_at, last_heartbeat
                FROM live_participations
                WHERE live_class_id = $1
                ORDER BY joined_at ASC
                """,
                c_uuid,
            )

            return {
                "liveClassId": str(c_uuid),
                "title": cls["title"],
                "threshold": float(cls["attendance_threshold"] or 75.0),
                "status": cls["status"],
                "participants": [
                    {
                        "userId": str(p["user_id"]),
                        "userName": p.get("user_name", "Student"),
                        "role": p.get("user_role", "STUDENT"),
                        "totalSeconds": p.get("total_seconds", 0),
                        "totalMinutes": round(p.get("total_seconds", 0) / 60, 1),
                        "attendancePercentage": float(p.get("attendance_percentage") or 0.0),
                        "attendanceStatus": p.get("attendance_status", "ABSENT"),
                        "joinedAt": p["joined_at"].isoformat() if p.get("joined_at") else None,
                        "lastHeartbeat": p["last_heartbeat"].isoformat() if p.get("last_heartbeat") else None,
                    }
                    for p in parts
                ],
            }

    @staticmethod
    async def get_recordings(
        class_id: UUID | str | None = None, eligible_class_ids: list[UUID | str] | None = None
    ) -> list[dict[str, Any]]:
        conditions = ["deleted_at IS NULL"]
        params: list[Any] = []

        if class_id:
            params.append(UUID(str(class_id)))
            conditions.append(f"live_class_id = ${len(params)}")
        elif eligible_class_ids is not None:
            if not eligible_class_ids:
                return []
            uuids = [UUID(str(c)) for c in eligible_class_ids]
            params.append(uuids)
            conditions.append(f"live_class_id = ANY(${len(params)})")

        query = f"""
            SELECT id, live_class_id, title, recording_url, duration_seconds, file_size_bytes, created_at
            FROM live_recordings
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            LIMIT 100
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def create_recording(
        class_id: UUID | str, title: str, recording_url: str, duration_seconds: int = 0
    ) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO live_recordings (live_class_id, title, recording_url, duration_seconds, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING *
                """,
                UUID(str(class_id)),
                title,
                recording_url,
                duration_seconds,
            )
            return dict(row)

