"""Domain models, enums, and schemas for Winners Creek / EEDI LMS.

Pre-database domain architecture establishing core operational entities:
- Institution Types & Training Types
- Separated Payment, Enrollment, and Access Lifecycles
- Explicit Semester Access Periods
- Integrated Trainer EEDI Evaluation & Reports
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Optional
from pydantic import BaseModel, Field


class InstitutionType(StrEnum):
    COLLEGE = "COLLEGE"
    COMPANY = "COMPANY"
    SCHOOL = "SCHOOL"


class TrainingType(StrEnum):
    COLLEGE = "COLLEGE"
    COOPERATIVE = "COOPERATIVE"
    SCHOOL = "SCHOOL"
    ONLINE = "ONLINE"


class DeliveryMode(StrEnum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    HYBRID = "HYBRID"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    VERIFIED = "VERIFIED"
    FAILED = "FAILED"
    REJECTED = "REJECTED"
    REFUNDED = "REFUNDED"


class EnrollmentStatus(StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"
    SUSPENDED = "SUSPENDED"


class AccessStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    EXPIRED = "EXPIRED"
    SUSPENDED = "SUSPENDED"


class EvaluationStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    COMPLETED = "COMPLETED"


class SemesterAccessPeriod(BaseModel):
    semesterNumber: int
    semesterLabel: str = "Semester"
    startDate: datetime
    endDate: datetime
    accessStatus: AccessStatus = AccessStatus.INACTIVE
    paymentStatus: PaymentStatus = PaymentStatus.PENDING
    enrollmentStatus: EnrollmentStatus = EnrollmentStatus.PENDING
    activatedBy: Optional[str] = None
    activatedAt: Optional[datetime] = None
    deactivatedBy: Optional[str] = None
    deactivatedAt: Optional[datetime] = None
    deactivationReason: Optional[str] = None
    notes: Optional[str] = None


class TrainerFeedbackPayload(BaseModel):
    qualitativeNotes: str = Field(..., min_length=5, description="Specific feedback on participant conduct and progress")
    strengths: list[str] = Field(default_factory=list, description="Key strengths observed by trainer")
    weaknesses: list[str] = Field(default_factory=list, description="Areas where participant struggles")
    improvementAreas: list[str] = Field(default_factory=list, description="Actionable recommendations")
    overallAssessment: str = Field(..., min_length=5, description="Overall performance assessment")
    rating: int = Field(default=4, ge=1, le=5)


class CompleteTrainerEvaluationRequest(BaseModel):
    studentUserId: str
    courseId: Optional[str] = None
    batchId: Optional[str] = None
    semesterNumber: Optional[int] = None
    parameterScores: list[dict[str, Any]] = Field(default_factory=list)
    pillarScores: Optional[dict[str, float]] = None
    trainerFeedback: TrainerFeedbackPayload


class EvaluationReportData(BaseModel):
    id: str
    studentUserId: str
    studentName: str
    rollNumber: Optional[str] = None
    evaluatorUserId: str
    evaluatorName: str
    collegeId: Optional[str] = None
    institutionName: Optional[str] = None
    institutionType: InstitutionType = InstitutionType.COLLEGE
    departmentId: Optional[str] = None
    departmentName: Optional[str] = None
    courseId: Optional[str] = None
    courseTitle: Optional[str] = None
    trainingType: TrainingType = TrainingType.COLLEGE
    deliveryMode: DeliveryMode = DeliveryMode.OFFLINE
    semesterNumber: Optional[int] = None
    eediScore: Optional[float] = None
    employmentScore: Optional[float] = None
    employmentScoreLabel: str = "N/A"
    pillarScores: dict[str, float] = Field(default_factory=dict)
    trainerFeedback: dict[str, Any] = Field(default_factory=dict)
    performanceAnalysis: dict[str, Any] = Field(default_factory=dict)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvementAreas: list[str] = Field(default_factory=list)
    overallAssessment: str = ""
    charts: dict[str, Any] = Field(default_factory=dict)
    status: EvaluationStatus = EvaluationStatus.COMPLETED
    evaluatedAt: datetime
    createdAt: datetime

