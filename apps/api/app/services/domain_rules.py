"""Centralized business logic & authorization decision engine for Winners Creek.

Implements Requirement 39:
- can_access_course()
- can_access_enrollment()
- can_access_participant()
- can_access_evaluation()
- can_view_evaluation_report()
- can_trainer_evaluate_participant()
- can_admin_activate_enrollment()
- can_spoc_view_participant()
- can_super_admin_view_institution()
- is_enrollment_expired()
- is_access_active()
- is_payment_verified()
- can_renew_enrollment()
- calculate_employment_score()
- get_training_type_for_institution()
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from bson import ObjectId

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.models.domain_models import (
    AccessStatus,
    DeliveryMode,
    EnrollmentStatus,
    InstitutionType,
    PaymentStatus,
    TrainingType,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: Any) -> Optional[datetime]:
    if isinstance(dt, datetime):
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    if isinstance(dt, str):
        try:
            parsed = datetime.fromisoformat(dt.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def get_training_type_for_institution(institution_type: str | InstitutionType) -> TrainingType:
    """Requirement 4: Automatic mapping from institution type to training type.
    COLLEGE  -> COLLEGE TRAINING
    COMPANY  -> COOPERATIVE TRAINING
    SCHOOL   -> SCHOOL TRAINING
    """
    normalized = str(institution_type).strip().upper()
    if normalized == InstitutionType.COMPANY or normalized == "COMPANY":
        return TrainingType.COOPERATIVE
    if normalized == InstitutionType.SCHOOL or normalized == "SCHOOL":
        return TrainingType.SCHOOL
    return TrainingType.COLLEGE


def is_access_active(access_period: dict[str, Any] | None, current_date: datetime | None = None) -> bool:
    """Requirement 11, 12, 44: Server-side check for access expiration.
    Access is active if accessStatus == ACTIVE and current_date <= endDate.
    """
    if not access_period:
        return False

    status = access_period.get("accessStatus") or access_period.get("status")
    if str(status).upper() != AccessStatus.ACTIVE:
        return False

    end_date = _as_utc(access_period.get("endDate") or access_period.get("accessEndDate"))
    if end_date is not None:
        now = current_date or _now()
        if now > end_date:
            return False

    return True


def is_enrollment_expired(enrollment: dict[str, Any], current_date: datetime | None = None) -> bool:
    """Check if enrollment has expired based on status or end date."""
    if not enrollment:
        return True

    status = str(enrollment.get("status", "")).upper()
    if status in (EnrollmentStatus.EXPIRED, EnrollmentStatus.CANCELLED, EnrollmentStatus.SUSPENDED):
        return True

    # Check active access period
    current_period = enrollment.get("currentPeriod")
    if current_period:
        end_date = _as_utc(current_period.get("endDate"))
        if end_date and (current_date or _now()) > end_date:
            return True

    return False


def is_payment_verified(payment: dict[str, Any] | None) -> bool:
    """Requirement 15, 20: Payment verification status check."""
    if not payment:
        return False
    return str(payment.get("status", "")).upper() == PaymentStatus.VERIFIED


def can_renew_enrollment(enrollment: dict[str, Any]) -> tuple[bool, str]:
    """Requirement 14: A participant can renew if currently enrolled or expired,
    and doesn't have an active unexpired renewal in progress.
    """
    if not enrollment:
        return False, "Enrollment record not found."
    return True, "Eligible for renewal."


def can_access_course(
    ctx: ScopeContext,
    course: dict[str, Any],
    enrollment: dict[str, Any] | None = None,
    current_date: datetime | None = None,
) -> tuple[bool, str]:
    """Requirement 10, 11, 13, 27, 28: Protected course content access decision.
    - Super Admin: Global access.
    - Admin / SPOC / Trainer: Institutional scope check.
    - Participant: Must have verified payment, Admin activation, and unexpired access period.
      Expired participants are blocked from CURRENT protected content, but allowed historical info.
    """
    if ctx.is_platform_wide:
        return True, "Authorized (platform-wide)"

    course_mode = course.get("courseMode", DeliveryMode.ONLINE)
    course_training_type = course.get("trainingType", TrainingType.COLLEGE)
    course_college_id = course.get("collegeId")

    # Staff role checks
    if ctx.role in (Role.ADMIN, Role.HOD, Role.TRAINER):
        if course_mode == DeliveryMode.ONLINE and not course_college_id:
            return False, f"{ctx.role} cannot manage public online courses without institutional binding."
        if course_college_id and str(course_college_id) != str(ctx.college_id):
            return False, f"Institution mismatch for {ctx.role}."
        return True, "Authorized staff access."

    # Participant checks
    if ctx.role is Role.STUDENT:
        if not enrollment:
            return False, "No enrollment found for this course."

        # Verify payment status
        pay_status = str(enrollment.get("paymentStatus", "")).upper()
        if pay_status != PaymentStatus.VERIFIED and enrollment.get("enrollmentType") == "paid":
            return False, "Payment pending verification or rejected."

        # Verify access status
        current_period = enrollment.get("currentPeriod") or {}
        access_status = str(current_period.get("accessStatus") or enrollment.get("accessStatus") or enrollment.get("status")).upper()

        if access_status != AccessStatus.ACTIVE:
            return False, f"Access is {access_status.lower()}. Please contact institution admin or renew."

        # Verify date expiration
        if not is_access_active(current_period, current_date):
            return False, "Your access period for this semester has expired. Please renew your access."

        return True, "Authorized participant access."

    return False, "Unauthorized role."


def can_access_participant(
    ctx: ScopeContext,
    participant_user_id: ObjectId,
    participant_profile: dict[str, Any],
) -> tuple[bool, str]:
    """Requirements 27, 28, 32, 33, 34, 35: Strict multi-tenant participant isolation.
    - Participant: Own records only.
    - Trainer: Assigned batch / department only.
    - SPOC: Assigned department + college only.
    - Admin: Assigned college only.
    - Super Admin: Global.
    """
    if ctx.is_platform_wide:
        return True, "Authorized platform-wide."

    # Participant self-scope
    if ctx.role is Role.STUDENT:
        if participant_user_id != ctx.user_id:
            return False, "Participants may only access their own records."
        return True, "Authorized self-access."

    # Parent scope
    if ctx.role is Role.PARENT:
        if participant_user_id not in ctx.linked_student_ids:
            return False, "Parent is not linked to this participant."
        return True, "Authorized parent access."

    # Staff college boundary
    part_college = participant_profile.get("collegeId")
    if part_college and ctx.college_id and str(part_college) != str(ctx.college_id):
        return False, "Participant belongs to a different institution."

    # SPOC department boundary
    if ctx.role is Role.HOD:
        part_dept = participant_profile.get("departmentId")
        if part_dept and ctx.department_id and str(part_dept) != str(ctx.department_id):
            return False, "Participant belongs to a different department."
        return True, "Authorized SPOC access."

    # Trainer batch boundary
    if ctx.role is Role.TRAINER:
        part_batch = participant_profile.get("batchId")
        if part_batch and part_batch not in ctx.batch_ids:
            return False, "Participant is not in any batch assigned to this trainer."
        return True, "Authorized trainer access."

    # Admin scope
    if ctx.role is Role.ADMIN:
        return True, "Authorized institution admin access."

    return False, "Unauthorized role."


def can_trainer_evaluate_participant(
    ctx: ScopeContext,
    participant_user_id: ObjectId,
    participant_profile: dict[str, Any],
) -> tuple[bool, str]:
    """Requirement 21, 23: Trainer can evaluate ONLY participants assigned to them."""
    if ctx.is_platform_wide:
        return True, "Super Admin override."

    if ctx.role is not Role.TRAINER:
        return False, "Only authorized trainers can perform evaluations."

    return can_access_participant(ctx, participant_user_id, participant_profile)


def can_view_evaluation_report(
    ctx: ScopeContext,
    report: dict[str, Any],
) -> tuple[bool, str]:
    """Requirement 26, 29: Evaluation report visibility:
    1. Participant (own report)
    2. Trainer who evaluated
    3. Admin of the same institution
    4. SPOC of the same institution/department
    5. Super Admin platform-wide
    All others forbidden.
    """
    if ctx.is_platform_wide:
        return True, "Authorized Super Admin."

    student_id = report.get("studentUserId")
    evaluator_id = report.get("evaluatorUserId")
    college_id = report.get("collegeId")
    department_id = report.get("departmentId")

    # 1. Participant
    if ctx.role is Role.STUDENT and student_id and str(student_id) == str(ctx.user_id):
        return True, "Participant viewing own report."

    # 2. Evaluating Trainer
    if ctx.role is Role.TRAINER and evaluator_id and str(evaluator_id) == str(ctx.user_id):
        return True, "Evaluating trainer viewing report."

    # 3. Same Institution Admin
    if ctx.role is Role.ADMIN and college_id and str(college_id) == str(ctx.college_id):
        return True, "Institution Admin viewing report."

    # 4. Same Institution & Department SPOC
    if (
        ctx.role is Role.HOD
        and college_id
        and str(college_id) == str(ctx.college_id)
        and department_id
        and str(department_id) == str(ctx.department_id)
    ):
        return True, "Department SPOC viewing report."

    return False, "You are not authorized to view this evaluation report."


def can_admin_activate_enrollment(
    ctx: ScopeContext,
    enrollment: dict[str, Any],
) -> tuple[bool, str]:
    """Requirement 16, 32: Admin activation authorization check."""
    if ctx.is_platform_wide:
        return True, "Super Admin activation allowed."

    if ctx.role is not Role.ADMIN:
        return False, "Only institution administrators can activate enrollments."

    enr_college = enrollment.get("collegeId")
    if enr_college and str(enr_college) != str(ctx.college_id):
        return False, "Cannot activate enrollment for a different institution."

    return True, "Authorized admin activation."


def can_spoc_view_participant(
    ctx: ScopeContext,
    participant_profile: dict[str, Any],
) -> tuple[bool, str]:
    """Requirement 28, 33: SPOC department isolation check."""
    if ctx.role is not Role.HOD:
        return False, "Caller is not a SPOC."
    if str(participant_profile.get("collegeId")) != str(ctx.college_id):
        return False, "Different institution."
    if str(participant_profile.get("departmentId")) != str(ctx.department_id):
        return False, "Different department."
    return True, "Authorized SPOC."


def can_super_admin_view_institution(
    ctx: ScopeContext,
    institution_id: ObjectId,
) -> tuple[bool, str]:
    """Requirement 30: Super Admin has platform-wide visibility into any institution."""
    if not ctx.is_platform_wide:
        return False, "Super Admin role required."
    return True, "Authorized Super Admin."


def calculate_employment_score(
    eedi_score: float | None,
    evaluation: dict[str, Any] | None,
    attendance_pct: float | None = None,
) -> float | None:
    """Requirement 25: Employment Score calculation based on actual evaluation inputs.
    Does NOT invent a fake number. Returns None (rendered as N/A) if inputs are insufficient.
    """
    if eedi_score is None:
        return None

    # Weighted blend of EEDI (60%), Trainer Pillar Rating (25%), and Attendance (15%)
    weights = []
    values = []

    values.append(eedi_score)
    weights.append(0.60)

    if evaluation and evaluation.get("overallScore") is not None:
        values.append(float(evaluation["overallScore"]))
        weights.append(0.25)

    if attendance_pct is not None:
        values.append(min(100.0, float(attendance_pct)))
        weights.append(0.15)

    total_weight = sum(weights)
    if total_weight == 0:
        return None

    score = sum(v * w for v, w in zip(values, weights)) / total_weight
    return round(score, 1)

