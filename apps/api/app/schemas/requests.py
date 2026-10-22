"""Request/response schemas. Validation happens here before any handler runs."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Str1 = Annotated[str, Field(min_length=1, max_length=200)]
Text = Annotated[str, Field(min_length=1, max_length=4000)]
ObjectIdStr = Annotated[
    str,
    Field(
        pattern=r"^([a-fA-F0-9]{24}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$"
    ),
]


class Base(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


# --------------------------------------------------------------------------- auth
class SignupRequest(Base):
    name: Annotated[str, Field(min_length=2, max_length=120)]
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=128)]
    confirmPassword: Annotated[str, Field(min_length=8, max_length=128)]
    role: Literal["STUDENT", "TRAINER", "HOD", "ADMIN", "PARENT"] = "STUDENT"
    collegeCode: Annotated[str, Field(min_length=1, max_length=40)] | None = None
    institutionId: Annotated[str, Field(max_length=60)] | None = None
    departmentCode: Annotated[str, Field(max_length=40)] | None = None
    phone: Annotated[str, Field(max_length=24)] | None = None
    acceptedTerms: bool = True

    @field_validator("confirmPassword")
    @classmethod
    def _match(cls, value: str, info: Any) -> str:
        if info.data.get("password") and value != info.data["password"]:
            raise ValueError("Passwords do not match")
        return value


class LoginRequest(Base):
    # Either an email address or an institution ID.
    identifier: Annotated[str, Field(min_length=3, max_length=160)]
    password: Annotated[str, Field(min_length=1, max_length=128)]
    rememberMe: bool = False


class VerifyEmailRequest(Base):
    email: EmailStr | None = None
    otp: Annotated[str, Field(min_length=4, max_length=8)] | None = None
    token: str | None = None


class ResendOtpRequest(Base):
    email: EmailStr
    purpose: Literal["verify", "reset"] = "verify"


class ForgotPasswordRequest(Base):
    email: EmailStr


class ResetPasswordRequest(Base):
    email: EmailStr | None = None
    otp: Annotated[str, Field(min_length=4, max_length=8)] | None = None
    token: str | None = None
    password: Annotated[str, Field(min_length=8, max_length=128)]
    confirmPassword: Annotated[str, Field(min_length=8, max_length=128)]

    @field_validator("confirmPassword")
    @classmethod
    def _match(cls, value: str, info: Any) -> str:
        if info.data.get("password") and value != info.data["password"]:
            raise ValueError("Passwords do not match")
        return value


class ChangePasswordRequest(Base):
    currentPassword: Annotated[str, Field(min_length=1, max_length=128)]
    password: Annotated[str, Field(min_length=8, max_length=128)]
    confirmPassword: Annotated[str, Field(min_length=8, max_length=128)]

    @field_validator("confirmPassword")
    @classmethod
    def _match(cls, value: str, info: Any) -> str:
        if info.data.get("password") and value != info.data["password"]:
            raise ValueError("Passwords do not match")
        return value


# --------------------------------------------------------------------------- student
class ProgressUpdate(Base):
    lessonId: ObjectIdStr | None = None
    percent: Annotated[float, Field(ge=0, le=100)]
    minutesSpent: Annotated[int, Field(ge=0, le=600)] = 0


class StartPracticeRequest(Base):
    practiceModeCode: Str1
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None
    idempotencyKey: Annotated[str, Field(max_length=80)] | None = None
    recordingConsent: bool = True


class CompletePracticeRequest(Base):
    transcriptOverride: Annotated[str, Field(max_length=20000)] | None = None
    answeredQuestions: Annotated[int, Field(ge=0, le=50)] = 0
    durationSeconds: Annotated[int, Field(ge=0, le=7200)] = 0
    partial: bool = False


class GameAttemptRequest(Base):
    level: Annotated[int, Field(ge=1, le=20)] = 1
    choices: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    completed: bool = False
    comboMax: Annotated[int, Field(ge=0, le=99)] = 0
    durationSeconds: Annotated[int, Field(ge=0, le=7200)] = 0
    hintsUsed: Annotated[int, Field(ge=0, le=10)] = 0


class QuizAttemptRequest(Base):
    answers: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    durationSeconds: Annotated[int, Field(ge=0, le=14400)] = 0


class ProfileUpdate(Base):
    name: Annotated[str, Field(min_length=2, max_length=120)] | None = None
    phone: Annotated[str, Field(max_length=24)] | None = None
    section: Annotated[str, Field(max_length=24)] | None = None
    program: Annotated[str, Field(max_length=120)] | None = None
    guardianName: Annotated[str, Field(max_length=120)] | None = None
    guardianPhone: Annotated[str, Field(max_length=24)] | None = None
    bio: Annotated[str, Field(max_length=600)] | None = None


class PlacementGoalRequest(Base):
    targetRole: Str1
    targetScore: Annotated[float, Field(ge=0, le=100)]
    targetDate: date
    focusAreas: list[Str1] = Field(default_factory=list, max_length=8)


class SettingsUpdate(Base):
    emailNotifications: bool | None = None
    pushNotifications: bool | None = None
    smsNotifications: bool | None = None
    classRecordings: bool | None = None
    profileVisibleToRecruiters: bool | None = None
    recordingConsent: bool | None = None


class CoachRequest(Base):
    question: Annotated[str, Field(min_length=3, max_length=600)]


class AssistantRequest(Base):
    question: Annotated[str, Field(min_length=2, max_length=600)]


class DeviceTokenRequest(Base):
    token: Annotated[str, Field(min_length=8, max_length=400)]
    platform: Literal["web", "android", "ios"] = "web"


# --------------------------------------------------------------------------- trainer
class AttendanceEntry(Base):
    studentUserId: ObjectIdStr
    status: Literal["present", "absent", "late", "leave"]
    remark: Annotated[str, Field(max_length=300)] | None = None


class AttendanceRequest(Base):
    trainingSessionId: ObjectIdStr
    entries: list[AttendanceEntry] = Field(min_length=1, max_length=400)
    overwrite: bool = False


class ParameterScore(Base):
    code: Annotated[str, Field(min_length=1, max_length=60)]
    score: Annotated[float, Field(ge=0)]
    remark: Annotated[str, Field(max_length=300)] | None = None


class EvaluationRequest(Base):
    studentUserId: ObjectIdStr
    trainingModuleId: ObjectIdStr
    semesterId: ObjectIdStr | None = None
    parameterScores: list[ParameterScore] = Field(min_length=1, max_length=200)
    rubricScores: list[dict[str, Any]] = Field(default_factory=list, max_length=40)
    remarks: Annotated[str, Field(max_length=2000)] | None = None
    state: Literal["draft", "submitted"] = "draft"
    expectedVersion: int | None = None


class EvaluationPatch(Base):
    parameterScores: list[ParameterScore] | None = Field(default=None, max_length=200)
    rubricScores: list[dict[str, Any]] | None = Field(default=None, max_length=40)
    remarks: Annotated[str, Field(max_length=2000)] | None = None
    state: Literal["draft", "submitted"] | None = None
    expectedVersion: int | None = None
    editReason: Annotated[str, Field(max_length=300)] | None = None


class AiOverrideRequest(Base):
    dimensions: list[dict[str, Any]] = Field(min_length=1, max_length=12)
    reason: Annotated[str, Field(min_length=5, max_length=600)]


class FeedbackRequest(Base):
    studentUserId: ObjectIdStr
    trainingSessionId: ObjectIdStr | None = None
    rating: Annotated[float, Field(ge=0, le=5)]
    feedbackText: Annotated[str, Field(min_length=2, max_length=2000)]


class AssignmentRequest(Base):
    title: Str1
    description: Annotated[str, Field(max_length=4000)] | None = None
    batchId: ObjectIdStr
    dueAt: datetime
    trainingModuleId: ObjectIdStr | None = None
    maxScore: Annotated[float, Field(ge=1, le=1000)] = 100


class AssignmentPatch(Base):
    title: Str1 | None = None
    description: Annotated[str, Field(max_length=4000)] | None = None
    dueAt: datetime | None = None
    status: Literal["open", "closed", "archived"] | None = None
    maxScore: Annotated[float, Field(ge=1, le=1000)] | None = None


class SubmissionReview(Base):
    grade: Annotated[float, Field(ge=0, le=1000)] | None = None
    remarks: Annotated[str, Field(max_length=2000)] | None = None
    state: Literal["submitted", "reviewed", "returned"] = "reviewed"


class AlertPatch(Base):
    resolved: bool = True
    note: Annotated[str, Field(max_length=600)] | None = None


# --------------------------------------------------------------------------- HOD
class EnrollmentStatusPatch(Base):
    status: Literal["active", "on_hold", "transferred", "completed", "dropped"]
    reason: Annotated[str, Field(min_length=3, max_length=400)]
    expectedVersion: int | None = None


class ReassignmentRequest(Base):
    trainerUserId: ObjectIdStr
    reason: Annotated[str, Field(min_length=5, max_length=600)]
    requestedModules: list[Str1] = Field(default_factory=list, max_length=10)


class CertificateFlagRequest(Base):
    note: Annotated[str, Field(min_length=3, max_length=600)]


class ReportRequest(Base):
    reportType: Annotated[str, Field(min_length=2, max_length=60)]
    format: Literal["xlsx", "csv", "pdf"] = "xlsx"
    filters: dict[str, Any] = Field(default_factory=dict)
    forceAsync: bool = False


# --------------------------------------------------------------------------- admin
class DepartmentRequest(Base):
    name: Str1
    code: Annotated[str, Field(min_length=1, max_length=20)]
    hodUserId: ObjectIdStr | None = None
    description: Annotated[str, Field(max_length=600)] | None = None


class DepartmentPatch(Base):
    name: Str1 | None = None
    hodUserId: ObjectIdStr | None = None
    description: Annotated[str, Field(max_length=600)] | None = None
    status: Literal["active", "archived"] | None = None


class SemesterRequest(Base):
    departmentId: ObjectIdStr
    number: Annotated[int, Field(ge=1, le=12)]
    label: Str1 | None = None
    academicYear: Annotated[str, Field(max_length=20)] | None = None
    active: bool = True


class BatchRequest(Base):
    name: Str1
    code: Annotated[str, Field(min_length=1, max_length=24)]
    departmentId: ObjectIdStr
    semesterId: ObjectIdStr | None = None
    capacity: Annotated[int, Field(ge=1, le=500)] = 60
    status: Literal["active", "upcoming", "archived"] = "active"


class BatchPatch(Base):
    name: Str1 | None = None
    capacity: Annotated[int, Field(ge=1, le=500)] | None = None
    status: Literal["active", "upcoming", "archived"] | None = None
    semesterId: ObjectIdStr | None = None


class AssignStudentsRequest(Base):
    studentUserIds: list[ObjectIdStr] = Field(min_length=1, max_length=500)
    enrollmentType: Literal["regular", "lateral", "transfer"] = "regular"
    reason: Annotated[str, Field(max_length=300)] | None = None


class AssignTrainersRequest(Base):
    trainerUserIds: list[ObjectIdStr] = Field(min_length=1, max_length=50)
    trainingModuleId: ObjectIdStr | None = None
    startDate: date | None = None
    endDate: date | None = None
    weekdays: list[int] | None = None
    status: Literal["ACTIVE", "INACTIVE", "SUSPENDED"] = "ACTIVE"
    notes: Annotated[str, Field(max_length=500)] | None = None
    scheduleReference: Annotated[str, Field(max_length=200)] | None = None


class UpdateTrainerAssignmentRequest(Base):
    startDate: date | None = None
    endDate: date | None = None
    weekdays: list[int] | None = None
    status: Literal["ACTIVE", "INACTIVE", "SUSPENDED"] | None = None
    notes: Annotated[str, Field(max_length=500)] | None = None
    scheduleReference: Annotated[str, Field(max_length=200)] | None = None


class UserRequest(Base):
    name: Annotated[str, Field(min_length=2, max_length=120)]
    email: EmailStr
    role: Literal[
        "STUDENT", "TRAINER", "HOD", "ADMIN", "PLACEMENT_CELL", "RECRUITER", "PARENT"
    ]
    departmentId: ObjectIdStr | None = None
    institutionId: Annotated[str, Field(max_length=60)] | None = None
    phone: Annotated[str, Field(max_length=24)] | None = None
    designation: Annotated[str, Field(max_length=80)] | None = None
    temporaryPassword: Annotated[str, Field(min_length=8, max_length=128)] | None = None


class UserPatch(Base):
    name: Annotated[str, Field(min_length=2, max_length=120)] | None = None
    phone: Annotated[str, Field(max_length=24)] | None = None
    departmentId: ObjectIdStr | None = None
    designation: Annotated[str, Field(max_length=80)] | None = None


class RolePatch(Base):
    role: Literal[
        "STUDENT", "TRAINER", "HOD", "ADMIN", "PLACEMENT_CELL", "RECRUITER", "PARENT"
    ]
    reason: Annotated[str, Field(min_length=3, max_length=400)]
    departmentId: ObjectIdStr | None = None


class DeactivateRequest(Base):
    reason: Annotated[str, Field(min_length=3, max_length=400)]


class TrainerAccessPatch(Base):
    canMarkAttendance: bool = True
    canEvaluate: bool = True
    canCreateAssignments: bool = True
    canViewReports: bool = True


class PlacementDriveRequest(Base):
    company: Str1
    title: Str1
    startsAt: datetime
    endsAt: datetime | None = None
    eligibleBatchIds: list[ObjectIdStr] = Field(default_factory=list, max_length=100)
    minReadinessScore: Annotated[float, Field(ge=0, le=100)] = 0
    status: Literal["open", "scheduling", "closed"] = "scheduling"
    recruiterEmails: list[EmailStr] = Field(default_factory=list, max_length=20)

    @field_validator("endsAt")
    @classmethod
    def _range(cls, value: datetime | None, info: Any) -> datetime | None:
        start = info.data.get("startsAt")
        if value and start and value < start:
            raise ValueError("The end date must be on or after the start date")
        return value


class CertificateTemplateRequest(Base):
    name: Str1
    code: Annotated[str, Field(min_length=1, max_length=24)]
    minAttendance: Annotated[float, Field(ge=0, le=100)] = 75
    minAvgScore: Annotated[float, Field(ge=0, le=100)] = 60
    active: bool = True

    @field_validator("minAvgScore")
    @classmethod
    def _sane(cls, value: float) -> float:
        if value > 100:
            raise ValueError("A minimum average score above 100 can never be met")
        return value


class IssueCertificateRequest(Base):
    certificateId: ObjectIdStr
