"""Production Live Class & Virtual Classroom endpoints and WebSocket signaling server."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Any, Literal
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context, require_role
from app.authz.roles import Role
from app.core.errors import NotFound, RoleForbidden, ScopeForbidden, Unauthenticated
from app.core.security import decode_token
from app.db.mongo import get_db
from app.models.live_class import (
    AttendanceStatus,
    ClassProvider,
    ClassStatus,
    HeartbeatRequest,
    LiveClassCreateRequest,
    LiveClassPatchRequest,
    MeetingType,
    RecordingCreateRequest,
)
from app.services import live_class_service

router = APIRouter()

AnyAuthCtx = Depends(
    require_role(Role.STUDENT, Role.TRAINER, Role.ADMIN, Role.SUPER_ADMIN, Role.HOD)
)
StaffCtx = Depends(require_role(Role.TRAINER, Role.ADMIN, Role.SUPER_ADMIN, Role.HOD))
AdminOrSuperCtx = Depends(require_role(Role.ADMIN, Role.SUPER_ADMIN))
SuperAdminCtx = Depends(require_role(Role.SUPER_ADMIN))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_oid(val: Any) -> Any:
    if not val:
        return None
    if isinstance(val, uuid.UUID):
        return str(val)
    try:
        return ObjectId(str(val))
    except Exception:
        return str(val)


def _serialize_doc(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not doc:
        return None
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, list):
            out[k] = [
                str(x) if isinstance(x, ObjectId) else (x.isoformat() if isinstance(x, datetime) else x)
                for x in v
            ]
        elif isinstance(v, dict):
            out[k] = _serialize_doc(v)
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@router.get("/my")
async def get_my_live_classes(ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Retrieve all classes the authenticated user is strictly authorized to access."""
    db = get_db()
    
    if ctx.role is Role.STUDENT:
        classes = await live_class_service.get_eligible_classes_for_student(ctx)
    elif ctx.role is Role.TRAINER:
        classes = await live_class_service.get_classes_for_trainer(ctx)
    elif ctx.role is Role.SUPER_ADMIN:
        classes = await db.live_classes.find({"deletedAt": None}).sort("startsAt", -1).to_list(200)
    else:
        # ADMIN / HOD: College / department scoped
        q: dict[str, Any] = {"deletedAt": None, "meetingType": {"$ne": MeetingType.TRAINER_MEETING.value}}
        if ctx.college_id:
            q["collegeId"] = ctx.college_id
        if ctx.role is Role.HOD and ctx.department_id:
            q["departmentId"] = ctx.department_id
        classes = await db.live_classes.find(q).sort("startsAt", -1).to_list(150)

    now = _now()
    serialized = [_serialize_doc(c) for c in classes]

    # Compute live state indicators
    for item in serialized:
        if not item:
            continue
        starts_str = item.get("startsAt")
        ends_str = item.get("endsAt")
        item["isLiveNow"] = item.get("status") == ClassStatus.LIVE.value
        item["isUpcoming"] = item.get("status") == ClassStatus.SCHEDULED.value

    return {"success": True, "data": serialized}


@router.get("/recordings/my")
async def get_my_recordings(ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Retrieve all available recordings eligible for the authenticated user."""
    db = get_db()
    if ctx.role is Role.STUDENT:
        classes = await live_class_service.get_eligible_classes_for_student(ctx)
        eligible_class_ids = [c["_id"] for c in classes]
        recordings = await db.live_recordings.find(
            {"liveClassId": {"$in": eligible_class_ids}, "deletedAt": None}
        ).sort("createdAt", -1).to_list(100)
    else:
        recordings = await db.live_recordings.find({"deletedAt": None}).sort("createdAt", -1).to_list(100)

    return {"success": True, "data": [_serialize_doc(r) for r in recordings]}


@router.post("")
async def create_live_class(
    payload: LiveClassCreateRequest, ctx: ScopeContext = StaffCtx
) -> dict[str, Any]:
    """Schedule a new live class or trainer meeting."""
    db = get_db()
    now = _now()

    # RBAC Validation
    if payload.meetingType == MeetingType.TRAINER_MEETING and ctx.role is not Role.SUPER_ADMIN:
        raise RoleForbidden("Only Super Admin can schedule administrative trainer meetings")

    # Room ID for Native Virtual Classroom
    room_id = str(uuid.uuid4())

    doc: dict[str, Any] = {
        "title": payload.title,
        "description": payload.description,
        "meetingType": payload.meetingType.value,
        "provider": payload.provider.value,
        "roomId": room_id,
        "courseId": _safe_oid(payload.courseId),
        "courseMode": payload.courseMode,
        "collegeId": _safe_oid(payload.collegeId) if payload.collegeId else ctx.college_id,
        "departmentId": _safe_oid(payload.departmentId) if payload.departmentId else (
            ctx.department_id if ctx.role is Role.HOD else None
        ),
        "batchId": _safe_oid(payload.batchId),
        "batchName": payload.batchName,
        "trainerUserId": ctx.user_id if ctx.role is Role.TRAINER else None,
        "trainerName": ctx.name or ctx.email or "Trainer",
        "meetingUrl": payload.meetingUrl,
        "passcode": payload.passcode,
        "startsAt": payload.startsAt,
        "endsAt": payload.endsAt,
        "status": ClassStatus.SCHEDULED.value,
        "attendanceThreshold": payload.attendanceThreshold,
        "attendanceFinalized": False,
        "allowedTrainerIds": [_safe_oid(t) for t in payload.allowedTrainerIds],
        "createdAt": now,
        "updatedAt": now,
        "createdBy": ctx.user_id,
        "deletedAt": None,
    }

    # If trainer is creating for an offline batch, lookup batch and course details
    if payload.batchId and not payload.batchName:
        batch = None
        try:
            batch = await db.batches.find_one({"_id": ObjectId(payload.batchId)})
        except Exception:
            batch = await db.batches.find_one({"_id": str(payload.batchId)})
        if batch:
            doc["batchName"] = batch.get("name")
            if not doc.get("collegeId"):
                doc["collegeId"] = batch.get("collegeId")
            if not doc.get("departmentId"):
                doc["departmentId"] = batch.get("departmentId")

    from app.repositories.base import _clean_doc
    res = await db.live_classes.insert_one(_clean_doc(doc))
    doc["_id"] = res.inserted_id
    return {"success": True, "data": _serialize_doc(doc)}


@router.get("/{class_id}")
async def get_live_class(class_id: str, ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Get single class details with security checks."""
    db = get_db()
    oid = ObjectId(class_id)

    if ctx.role is Role.STUDENT:
        allowed, reason, class_doc = await live_class_service.can_student_access_live_class(ctx.user_id, oid)
        if not allowed or not class_doc:
            raise ScopeForbidden(reason)
    else:
        class_doc = await db.live_classes.find_one({"_id": oid, "deletedAt": None})
        if not class_doc:
            raise NotFound("Live class not found")

        if class_doc.get("meetingType") == MeetingType.TRAINER_MEETING.value:
            if ctx.role is not Role.SUPER_ADMIN and ctx.user_id not in class_doc.get("allowedTrainerIds", []):
                raise ScopeForbidden("Not authorized to view this private trainer meeting")

    return {"success": True, "data": _serialize_doc(class_doc)}


@router.patch("/{class_id}")
async def update_live_class(
    class_id: str, payload: LiveClassPatchRequest, ctx: ScopeContext = StaffCtx
) -> dict[str, Any]:
    """Update class details."""
    db = get_db()
    oid = ObjectId(class_id)
    existing = await db.live_classes.find_one({"_id": oid, "deletedAt": None})
    if not existing:
        raise NotFound("Live class not found")

    if ctx.role is Role.TRAINER and existing.get("trainerUserId") != ctx.user_id:
        raise ScopeForbidden("You can only modify classes you conduct")

    update_fields: dict[str, Any] = {"updatedAt": _now()}
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None:
            update_fields[k] = v.value if hasattr(v, "value") else v

    await db.live_classes.update_one({"_id": oid}, {"$set": update_fields})
    updated = await db.live_classes.find_one({"_id": oid})
    return {"success": True, "data": _serialize_doc(updated)}


@router.post("/{class_id}/start")
async def start_live_class(class_id: str, ctx: ScopeContext = StaffCtx) -> dict[str, Any]:
    """Host starts live class."""
    db = get_db()
    oid = ObjectId(class_id)
    cls = await db.live_classes.find_one({"_id": oid, "deletedAt": None})
    if not cls:
        raise NotFound("Live class not found")

    now = _now()
    await db.live_classes.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": ClassStatus.LIVE.value,
                "actualStartsAt": now,
                "updatedAt": now,
            }
        },
    )
    # Broadcast to room if connected
    await manager.broadcast_to_room(class_id, {"type": "class_started", "timestamp": now.isoformat()})
    return {"success": True, "data": {"status": "LIVE", "actualStartsAt": now.isoformat()}}


@router.post("/{class_id}/end")
async def end_live_class(class_id: str, ctx: ScopeContext = StaffCtx) -> dict[str, Any]:
    """Host concludes live class and finalizes attendance."""
    oid = ObjectId(class_id)
    summary = await live_class_service.finalize_class_attendance(oid, ctx.user_id)
    await manager.broadcast_to_room(class_id, {"type": "class_ended", "summary": summary})
    return {"success": True, "data": summary}


@router.post("/{class_id}/join")
async def join_class(class_id: str, ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Register join session segment and verify access."""
    oid = ObjectId(class_id)
    if ctx.role is Role.STUDENT:
        allowed, reason, cls = await live_class_service.can_student_access_live_class(ctx.user_id, oid)
        if not allowed or not cls:
            raise ScopeForbidden(reason)
    else:
        db = get_db()
        cls = await db.live_classes.find_one({"_id": oid, "deletedAt": None})
        if not cls:
            raise NotFound("Live class not found")

    user_name = ctx.name or ctx.email or "Participant"
    res = await live_class_service.join_live_class(oid, ctx.user_id, user_name, ctx.role.value)
    
    return {
        "success": True,
        "data": {
            **res,
            "provider": cls.get("provider", ClassProvider.WINNERS_CREEK.value),
            "meetingUrl": cls.get("meetingUrl"),
            "passcode": cls.get("passcode"),
            "roomId": cls.get("roomId"),
            "title": cls.get("title"),
        },
    }


@router.post("/{class_id}/leave")
async def leave_class(class_id: str, ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Register leave event and close connection segment."""
    oid = ObjectId(class_id)
    res = await live_class_service.leave_live_class(oid, ctx.user_id)
    return {"success": True, "data": res}


@router.post("/{class_id}/heartbeat")
async def heartbeat(
    class_id: str, payload: HeartbeatRequest, ctx: ScopeContext = AnyAuthCtx
) -> dict[str, Any]:
    """Record participant heartbeat ping."""
    oid = ObjectId(class_id)
    user_name = ctx.name or ctx.email or "Participant"
    res = await live_class_service.record_heartbeat(
        oid,
        ctx.user_id,
        user_name,
        ctx.role.value,
        audio_active=payload.audioActive,
        video_active=payload.videoActive,
        screen_active=payload.screenShareActive,
    )
    return {"success": True, "data": res}


@router.get("/{class_id}/attendance")
async def get_attendance_report(class_id: str, ctx: ScopeContext = StaffCtx) -> dict[str, Any]:
    """Get live or finalized attendance report for trainer/admin."""
    oid = ObjectId(class_id)
    report = await live_class_service.get_class_attendance_summary(oid)
    return {"success": True, "data": report}


@router.get("/{class_id}/recordings")
async def get_class_recordings(class_id: str, ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Get recordings for a specific live class."""
    oid = ObjectId(class_id)
    if ctx.role is Role.STUDENT:
        allowed, reason, _ = await live_class_service.can_student_access_live_class(ctx.user_id, oid)
        if not allowed:
            raise ScopeForbidden(reason)

    db = get_db()
    recordings = await db.live_recordings.find({"liveClassId": oid, "deletedAt": None}).to_list(20)
    return {"success": True, "data": [_serialize_doc(r) for r in recordings]}


@router.post("/{class_id}/recordings")
async def create_class_recording(
    class_id: str, payload: RecordingCreateRequest, ctx: ScopeContext = StaffCtx
) -> dict[str, Any]:
    """Upload/attach recording metadata to live class."""
    db = get_db()
    oid = ObjectId(class_id)
    cls = await db.live_classes.find_one({"_id": oid, "deletedAt": None})
    if not cls:
        raise NotFound("Live class not found")

    now = _now()
    doc = {
        "liveClassId": oid,
        "title": f"Recording: {cls.get('title')}",
        "videoUrl": payload.videoUrl,
        "thumbnailUrl": payload.thumbnailUrl,
        "durationSeconds": payload.durationSeconds,
        "notes": payload.notes,
        "courseId": cls.get("courseId"),
        "batchId": cls.get("batchId"),
        "collegeId": cls.get("collegeId"),
        "createdBy": ctx.user_id,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }
    res = await db.live_recordings.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"success": True, "data": _serialize_doc(doc)}


# ---------------------------------------------------------------------------
# Native Virtual Classroom WebSocket Signaling Server
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self) -> None:
        # room_id -> { peer_id: WebSocket }
        self.rooms: dict[str, dict[str, WebSocket]] = {}
        # room_id -> { peer_id: { userName, role, isHost, handRaised } }
        self.meta: dict[str, dict[str, Any]] = {}

    async def connect(
        self, room_id: str, peer_id: str, websocket: WebSocket, metadata: dict[str, Any]
    ) -> None:
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
            self.meta[room_id] = {}
        self.rooms[room_id][peer_id] = websocket
        self.meta[room_id][peer_id] = metadata

        # Notify existing peers that new peer joined
        await self.broadcast_to_room(
            room_id,
            {
                "type": "peer_joined",
                "peerId": peer_id,
                "userName": metadata.get("userName"),
                "role": metadata.get("role"),
                "isHost": metadata.get("isHost", False),
            },
            exclude_peer_id=peer_id,
        )

        # Send initial room state to newly joined peer
        peer_list = [
            {
                "peerId": p,
                "userName": m.get("userName"),
                "role": m.get("role"),
                "isHost": m.get("isHost", False),
                "handRaised": m.get("handRaised", False),
            }
            for p, m in self.meta[room_id].items()
        ]
        await websocket.send_text(
            json.dumps({"type": "room_state", "myPeerId": peer_id, "peers": peer_list})
        )

    def disconnect(self, room_id: str, peer_id: str) -> None:
        if room_id in self.rooms:
            self.rooms[room_id].pop(peer_id, None)
            self.meta[room_id].pop(peer_id, None)
            if not self.rooms[room_id]:
                self.rooms.pop(room_id, None)
                self.meta.pop(room_id, None)

    async def broadcast_to_room(
        self, room_id: str, message: dict[str, Any], exclude_peer_id: str | None = None
    ) -> None:
        if room_id not in self.rooms:
            return
        payload = json.dumps(message)
        for pid, ws in list(self.rooms[room_id].items()):
            if exclude_peer_id and pid == exclude_peer_id:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    async def send_direct(self, room_id: str, target_peer_id: str, message: dict[str, Any]) -> None:
        if room_id in self.rooms and target_peer_id in self.rooms[room_id]:
            ws = self.rooms[room_id][target_peer_id]
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                pass


manager = ConnectionManager()


@router.websocket("/ws/{class_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    class_id: str,
    token: str = Query(...),
) -> None:
    """Real-time WebRTC mesh signaling, chat, participant status, and host controls."""
    db = get_db()
    
    # Authenticate via JWT token
    try:
        payload = decode_token(token, expected_type="access")
        user_id_raw = payload.get("sub")
        user_id = ObjectId(str(user_id_raw))
        user = await db.users.find_one({"_id": user_id, "deletedAt": None})
        if not user or user.get("status") != "active":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Validate class eligibility
    try:
        oid = ObjectId(class_id)
        role_str = user.get("role", "STUDENT")
        if role_str == Role.STUDENT.value:
            allowed, _, cls = await live_class_service.can_student_access_live_class(user_id, oid)
            if not allowed or not cls:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        else:
            cls = await db.live_classes.find_one({"_id": oid, "deletedAt": None})
            if not cls:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    peer_id = str(user_id)
    user_name = user.get("name") or user.get("email") or "User"
    is_host = role_str in (Role.TRAINER.value, Role.SUPER_ADMIN.value) or (
        cls.get("trainerUserId") == user_id
    )

    metadata = {
        "userName": user_name,
        "role": role_str,
        "isHost": is_host,
        "handRaised": False,
    }

    await manager.connect(class_id, peer_id, websocket, metadata)

    # Initial join record
    await live_class_service.join_live_class(oid, user_id, user_name, role_str)

    try:
        while True:
            text = await websocket.receive_text()
            data = json.loads(text)
            msg_type = data.get("type")

            if msg_type == "signal":
                # Forward WebRTC signaling (SDP offer/answer, ICE candidate) to specific peer
                target_peer = data.get("toPeerId")
                if target_peer:
                    await manager.send_direct(
                        class_id,
                        target_peer,
                        {
                            "type": "signal",
                            "fromPeerId": peer_id,
                            "signal": data.get("signal"),
                        },
                    )

            elif msg_type == "chat":
                msg_text = str(data.get("message", "")).strip()
                if msg_text:
                    chat_doc = {
                        "liveClassId": oid,
                        "senderId": user_id,
                        "senderName": user_name,
                        "senderRole": role_str,
                        "message": msg_text,
                        "createdAt": _now(),
                    }
                    await db.live_chat_messages.insert_one(chat_doc)
                    await manager.broadcast_to_room(
                        class_id,
                        {
                            "type": "chat",
                            "fromPeerId": peer_id,
                            "senderName": user_name,
                            "senderRole": role_str,
                            "message": msg_text,
                            "timestamp": chat_doc["createdAt"].isoformat(),
                        },
                    )

            elif msg_type == "raise_hand":
                raised = bool(data.get("raised", True))
                if class_id in manager.meta and peer_id in manager.meta[class_id]:
                    manager.meta[class_id][peer_id]["handRaised"] = raised
                await manager.broadcast_to_room(
                    class_id,
                    {
                        "type": "hand_raise",
                        "peerId": peer_id,
                        "userName": user_name,
                        "handRaised": raised,
                    },
                )

            elif msg_type == "host_control" and is_host:
                # Host controls: mute user, mute all, lower hand
                action = data.get("action")
                target = data.get("targetPeerId")
                if action == "lower_hand" and target:
                    if class_id in manager.meta and target in manager.meta[class_id]:
                        manager.meta[class_id][target]["handRaised"] = False
                    await manager.broadcast_to_room(
                        class_id,
                        {"type": "hand_raise", "peerId": target, "handRaised": False},
                    )
                elif action == "mute_user" and target:
                    await manager.send_direct(class_id, target, {"type": "host_command", "command": "mute"})
                elif action == "mute_all":
                    await manager.broadcast_to_room(
                        class_id,
                        {"type": "host_command", "command": "mute"},
                        exclude_peer_id=peer_id,
                    )

            elif msg_type == "heartbeat":
                # WebSocket heartbeat ping
                await live_class_service.record_heartbeat(
                    oid,
                    user_id,
                    user_name,
                    role_str,
                    audio_active=data.get("audioActive", False),
                    video_active=data.get("videoActive", False),
                    screen_active=data.get("screenActive", False),
                )

    except WebSocketDisconnect:
        manager.disconnect(class_id, peer_id)
        await live_class_service.leave_live_class(oid, user_id)
        await manager.broadcast_to_room(
            class_id,
            {"type": "peer_left", "peerId": peer_id, "userName": user_name},
        )
    except Exception:
        manager.disconnect(class_id, peer_id)
        await live_class_service.leave_live_class(oid, user_id)

