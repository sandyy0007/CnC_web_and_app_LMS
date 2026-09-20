"""Data models and schemas for Winners Creek Production Live Class & Virtual Classroom System."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ObjectIdStr = Annotated[str, Field(pattern=r"^[a-fA-F0-9]{24}$")]
Str1 = Annotated[str, Field(min_length=1, max_length=200)]


class MeetingType(str, Enum):
    CLASS_SESSION = "CLASS_SESSION"
    TRAINER_MEETING = "TRAINER_MEETING"


class ClassProvider(str, Enum):
    WINNERS_CREEK = "WINNERS_CREEK"
    GOOGLE_MEET = "GOOGLE_MEET"
    ZOOM = "ZOOM"
    TEAMS = "TEAMS"
    EXTERNAL = "EXTERNAL"


class ClassStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    LIVE = "LIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class AttendanceStatus(str, Enum):
    PRESENT = "PRESENT"
    PARTIAL = "PARTIAL"
    LATE = "LATE"
    ABSENT = "ABSENT"


class Base(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class LiveClassCreateRequest(Base):
    title: Str1
    description: Annotated[str, Field(max_length=2000)] | None = None
    meetingType: MeetingType = MeetingType.CLASS_SESSION
    provider: ClassProvider = ClassProvider.WINNERS_CREEK
    courseId: ObjectIdStr | None = None
    courseMode: Literal["ONLINE", "OFFLINE"] = "ONLINE"
    collegeId: ObjectIdStr | None = None
    departmentId: ObjectIdStr | None = None
    batchId: ObjectIdStr | None = None
    batchName: Annotated[str, Field(max_length=100)] | None = None
    meetingUrl: Annotated[str, Field(max_length=1000)] | None = None
    passcode: Annotated[str, Field(max_length=100)] | None = None
    startsAt: datetime
    endsAt: datetime
    attendanceThreshold: Annotated[float, Field(ge=1.0, le=100.0)] = 75.0
    allowedTrainerIds: list[ObjectIdStr] = Field(default_factory=list)

    @field_validator("endsAt")
    @classmethod
    def _validate_dates(cls, value: datetime, info: Any) -> datetime:
        starts = info.data.get("startsAt")
        if starts and value <= starts:
            raise ValueError("endsAt must be after startsAt")
        return value


class LiveClassPatchRequest(Base):
    title: Str1 | None = None
    description: Annotated[str, Field(max_length=2000)] | None = None
    provider: ClassProvider | None = None
    meetingUrl: Annotated[str, Field(max_length=1000)] | None = None
    passcode: Annotated[str, Field(max_length=100)] | None = None
    startsAt: datetime | None = None
    endsAt: datetime | None = None
    attendanceThreshold: Annotated[float, Field(ge=1.0, le=100.0)] | None = None
    status: ClassStatus | None = None


class HeartbeatRequest(Base):
    audioActive: bool = False
    videoActive: bool = False
    screenShareActive: bool = False


class LiveChatMessageRequest(Base):
    message: Annotated[str, Field(min_length=1, max_length=1000)]


class RecordingCreateRequest(Base):
    videoUrl: Annotated[str, Field(min_length=1, max_length=1000)]
    durationSeconds: Annotated[int, Field(ge=1)]
    thumbnailUrl: Annotated[str, Field(max_length=1000)] | None = None
    notes: Annotated[str, Field(max_length=2000)] | None = None

