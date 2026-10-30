"""Production Live Class & Virtual Classroom endpoints and WebSocket signaling server."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Any, Literal
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context, require_role
from app.authz.roles import Role
from app.core.errors import NotFound, RoleForbidden, ScopeForbidden, Unauthenticated
from app.core.security import decode_token
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
from app.repositories.live_class_repo import LiveClassRepository
from app.repositories.user_repo import UserRepository
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


def _serialize_doc(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not doc:
        return None
    out = {}
    for k, v in doc.items():
        if isinstance(v, UUID):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, list):
            out[k] = [
                str(x) if isinstance(x, UUID) else (x.isoformat() if isinstance(x, datetime) else x)
                for x in v
            ]
        elif isinstance(v, dict):
            out[k] = _serialize_doc(v)
        else:
            out[k] = v
    if "id" in out and "_id" not in out:
        out["_id"] = out["id"]
    return out


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@router.get("/my")
async def get_my_live_classes(ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Retrieve all classes the authenticated user is strictly authorized to access."""
    if ctx.role is Role.STUDENT:
        classes = await live_class_service.get_eligible_classes_for_student(ctx)
    elif ctx.role is Role.TRAINER:
        classes = await live_class_service.get_classes_for_trainer(ctx)
    elif ctx.role is Role.SUPER_ADMIN:
        classes = await LiveClassRepository.list_classes()
    else:
        # ADMIN / HOD: College / department scoped
        classes = await LiveClassRepository.list_classes(
            institution_id=ctx.college_id,
            department_id=ctx.department_id if ctx.role is Role.HOD else None,
            exclude_trainer_meetings=True,
        )

    serialized = [_serialize_doc(c) for c in classes]

    for item in serialized:
        if not item:
            continue
        item["isLiveNow"] = item.get("status") == ClassStatus.LIVE.value
        item["isUpcoming"] = item.get("status") == ClassStatus.SCHEDULED.value

    return {"success": True, "data": serialized}


@router.get("/recordings/my")
async def get_my_recordings(ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Retrieve all available recordings eligible for the authenticated user."""
    if ctx.role is Role.STUDENT:
        classes = await live_class_service.get_eligible_classes_for_student(ctx)
        eligible_class_ids = [c["id"] for c in classes]
        recordings = await LiveClassRepository.get_recordings(eligible_class_ids=eligible_class_ids)
    else:
        recordings = await LiveClassRepository.get_recordings()

    return {"success": True, "data": [_serialize_doc(r) for r in recordings]}


@router.post("")
async def create_live_class(
    payload: LiveClassCreateRequest, ctx: ScopeContext = StaffCtx
) -> dict[str, Any]:
    """Schedule a new live class or trainer meeting."""
    if payload.meetingType == MeetingType.TRAINER_MEETING and ctx.role is not Role.SUPER_ADMIN:
        raise RoleForbidden("Only Super Admin can schedule administrative trainer meetings")

    room_id = str(uuid.uuid4())

    doc: dict[str, Any] = {
        "title": payload.title,
        "description": payload.description,
        "meetingType": payload.meetingType.value,
        "provider": payload.provider.value,
        "roomId": room_id,
        "courseId": payload.courseId,
        "courseMode": payload.courseMode,
        "collegeId": payload.collegeId if payload.collegeId else ctx.college_id,
        "departmentId": payload.departmentId if payload.departmentId else (
            ctx.department_id if ctx.role is Role.HOD else None
        ),
        "batchId": payload.batchId,
        "batchName": payload.batchName,
        "trainerUserId": ctx.user_id if ctx.role is Role.TRAINER else None,
        "trainerName": ctx.name or ctx.email or "Trainer",
        "meetingUrl": payload.meetingUrl,
        "passcode": payload.passcode,
        "startsAt": payload.startsAt,
        "endsAt": payload.endsAt,
        "status": ClassStatus.SCHEDULED.value,
        "attendanceThreshold": payload.attendanceThreshold,
        "allowedTrainerIds": payload.allowedTrainerIds,
        "createdBy": ctx.user_id,
    }

    result = await LiveClassRepository.create_live_class(doc)
    return {"success": True, "data": _serialize_doc(result)}


@router.get("/{class_id}")
async def get_live_class(class_id: str, ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Get single class details with security checks."""
    if ctx.role is Role.STUDENT:
        allowed, reason, class_doc = await live_class_service.can_student_access_live_class(ctx.user_id, class_id)
        if not allowed or not class_doc:
            raise ScopeForbidden(reason)
    else:
        class_doc = await LiveClassRepository.get_by_id(class_id)
        if not class_doc:
            raise NotFound("Live class not found")

        if class_doc.get("meeting_type") == MeetingType.TRAINER_MEETING.value:
            allowed_trainers = [str(t) for t in (class_doc.get("allowed_trainer_ids") or [])]
            if ctx.role is not Role.SUPER_ADMIN and str(ctx.user_id) not in allowed_trainers:
                raise ScopeForbidden("Not authorized to view this private trainer meeting")

    return {"success": True, "data": _serialize_doc(class_doc)}


@router.patch("/{class_id}")
async def update_live_class(
    class_id: str, payload: LiveClassPatchRequest, ctx: ScopeContext = StaffCtx
) -> dict[str, Any]:
    """Update class details."""
    existing = await LiveClassRepository.get_by_id(class_id)
    if not existing:
        raise NotFound("Live class not found")

    if ctx.role is Role.TRAINER and str(existing.get("trainer_user_id")) != str(ctx.user_id):
        raise ScopeForbidden("You can only modify classes you conduct")

    updates = payload.model_dump(exclude_unset=True)
    updated = await LiveClassRepository.update_live_class(class_id, updates)
    return {"success": True, "data": _serialize_doc(updated)}


@router.post("/{class_id}/start")
async def start_live_class(class_id: str, ctx: ScopeContext = StaffCtx) -> dict[str, Any]:
    """Host starts live class."""
    cls = await LiveClassRepository.get_by_id(class_id)
    if not cls:
        raise NotFound("Live class not found")

    res = await LiveClassRepository.start_live_class(class_id)
    await manager.broadcast_to_room(class_id, {"type": "class_started", "timestamp": res["actualStartsAt"]})
    return {"success": True, "data": res}


@router.post("/{class_id}/end")
async def end_live_class(class_id: str, ctx: ScopeContext = StaffCtx) -> dict[str, Any]:
    """Host concludes live class and finalizes attendance."""
    summary = await live_class_service.finalize_class_attendance(class_id, ctx.user_id)
    await manager.broadcast_to_room(class_id, {"type": "class_ended", "summary": summary})
    return {"success": True, "data": summary}


@router.post("/{class_id}/join")
async def join_class(class_id: str, ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Register join session segment and verify access."""
    if ctx.role is Role.STUDENT:
        allowed, reason, cls = await live_class_service.can_student_access_live_class(ctx.user_id, class_id)
        if not allowed or not cls:
            raise ScopeForbidden(reason)
    else:
        cls = await LiveClassRepository.get_by_id(class_id)
        if not cls:
            raise NotFound("Live class not found")

    user_name = ctx.name or ctx.email or "Participant"
    res = await live_class_service.join_live_class(class_id, ctx.user_id, user_name, ctx.role.value)

    return {
        "success": True,
        "data": {
            **res,
            "provider": cls.get("provider", ClassProvider.WINNERS_CREEK.value),
            "meetingUrl": cls.get("meeting_url"),
            "passcode": cls.get("passcode"),
            "roomId": cls.get("room_id"),
            "title": cls.get("title"),
        },
    }


@router.post("/{class_id}/leave")
async def leave_class(class_id: str, ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Register leave event and close connection segment."""
    res = await live_class_service.leave_live_class(class_id, ctx.user_id)
    return {"success": True, "data": res}


@router.post("/{class_id}/heartbeat")
async def heartbeat(
    class_id: str, payload: HeartbeatRequest, ctx: ScopeContext = AnyAuthCtx
) -> dict[str, Any]:
    """Record participant heartbeat ping."""
    user_name = ctx.name or ctx.email or "Participant"
    res = await live_class_service.record_heartbeat(
        class_id,
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
    report = await live_class_service.get_class_attendance_summary(class_id)
    return {"success": True, "data": report}


@router.get("/{class_id}/recordings")
async def get_class_recordings(class_id: str, ctx: ScopeContext = AnyAuthCtx) -> dict[str, Any]:
    """Get recordings for a specific live class."""
    if ctx.role is Role.STUDENT:
        allowed, reason, _ = await live_class_service.can_student_access_live_class(ctx.user_id, class_id)
        if not allowed:
            raise ScopeForbidden(reason)

    recordings = await LiveClassRepository.get_recordings(class_id=class_id)
    return {"success": True, "data": [_serialize_doc(r) for r in recordings]}


@router.post("/{class_id}/recordings")
async def create_class_recording(
    class_id: str, payload: RecordingCreateRequest, ctx: ScopeContext = StaffCtx
) -> dict[str, Any]:
    """Upload/attach recording metadata to live class."""
    cls = await LiveClassRepository.get_by_id(class_id)
    if not cls:
        raise NotFound("Live class not found")

    title = f"Recording: {cls.get('title')}"
    rec = await LiveClassRepository.create_recording(
        class_id=class_id,
        title=title,
        recording_url=payload.videoUrl,
        duration_seconds=payload.durationSeconds or 0,
    )
    return {"success": True, "data": _serialize_doc(rec)}


# ---------------------------------------------------------------------------
# Native Virtual Classroom WebSocket Signaling Server
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, dict[str, WebSocket]] = {}
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
    try:
        payload = decode_token(token, expected_type="access")
        user_id_raw = payload.get("sub")
        user = await UserRepository.get_by_id(user_id_raw)
        if not user or str(user.get("status", "")).upper() != "ACTIVE":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        role_str = str(user.get("role", "STUDENT"))
        if role_str == Role.STUDENT.value:
            allowed, _, cls = await live_class_service.can_student_access_live_class(user["id"], class_id)
            if not allowed or not cls:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        else:
            cls = await LiveClassRepository.get_by_id(class_id)
            if not cls:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    peer_id = str(user["id"])
    user_name = user.get("name") or user.get("email") or "User"
    is_host = role_str in (Role.TRAINER.value, Role.SUPER_ADMIN.value) or (
        str(cls.get("trainer_user_id")) == str(user["id"])
    )

    metadata = {
        "userName": user_name,
        "role": role_str,
        "isHost": is_host,
        "handRaised": False,
    }

    await manager.connect(class_id, peer_id, websocket, metadata)
    await live_class_service.join_live_class(class_id, user["id"], user_name, role_str)

    try:
        while True:
            text = await websocket.receive_text()
            data = json.loads(text)
            msg_type = data.get("type")

            if msg_type == "signal":
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
                    await manager.broadcast_to_room(
                        class_id,
                        {
                            "type": "chat",
                            "senderId": peer_id,
                            "senderName": user_name,
                            "senderRole": role_str,
                            "message": msg_text,
                            "createdAt": _now().isoformat(),
                        },
                    )

            elif msg_type == "hand_raise":
                raised = bool(data.get("raised", True))
                if class_id in manager.meta and peer_id in manager.meta[class_id]:
                    manager.meta[class_id][peer_id]["handRaised"] = raised
                await manager.broadcast_to_room(
                    class_id,
                    {"type": "hand_raise", "peerId": peer_id, "raised": raised},
                )

            elif msg_type == "media_state":
                await manager.broadcast_to_room(
                    class_id,
                    {
                        "type": "media_state",
                        "peerId": peer_id,
                        "audio": data.get("audio", True),
                        "video": data.get("video", True),
                        "screen": data.get("screen", False),
                    },
                    exclude_peer_id=peer_id,
                )

            elif msg_type == "mute_user" and is_host:
                target_peer = data.get("targetPeerId")
                if target_peer:
                    await manager.send_direct(class_id, target_peer, {"type": "force_mute"})

            elif msg_type == "kick_user" and is_host:
                target_peer = data.get("targetPeerId")
                if target_peer:
                    await manager.send_direct(class_id, target_peer, {"type": "kicked"})

    except WebSocketDisconnect:
        manager.disconnect(class_id, peer_id)
        await manager.broadcast_to_room(
            class_id,
            {"type": "peer_left", "peerId": peer_id, "userName": user_name},
        )
        await live_class_service.leave_live_class(class_id, user["id"])
    except Exception:
        manager.disconnect(class_id, peer_id)
