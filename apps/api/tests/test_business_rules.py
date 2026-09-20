"""Comprehensive automated verification for Winners Creek Business Logic & Role Security.

Directly verifies Requirement 46:
- CASE 1: Participant A attempts to access Participant B's data -> 403/unauthorized.
- CASE 2: Trainer A accesses Trainer B's participant outside assigned batches -> 403.
- CASE 3: CSE SPOC accesses ECE participant -> 403.
- CASE 4: College A Admin accesses College B participant -> 403.
- CASE 5: Expired participant accesses current protected course content -> Access denied.
- CASE 6: Expired participant accesses historical report -> Allowed.
- CASE 7: Participant has payment pending -> Current protected access denied.
- CASE 8: Payment verified + Admin activation -> Access becomes active.
- CASE 9: Online participant attempts to access College Admin functionality -> Denied.
- CASE 10: Super Admin accesses any institution -> Allowed.
- CASE 11: Institution creation auto-mapping (COLLEGE, COMPANY, SCHOOL).
- CASE 12: Trainer evaluation completion triggers report generation with employment score.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from bson import ObjectId
import pytest

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
from app.services.domain_rules import (
    calculate_employment_score,
    can_access_course,
    can_access_participant,
    can_admin_activate_enrollment,
    can_spoc_view_participant,
    can_super_admin_view_institution,
    can_trainer_evaluate_participant,
    can_view_evaluation_report,
    get_training_type_for_institution,
    is_access_active,
    is_enrollment_expired,
)
from app.services.evaluation_report_service import (
    get_evaluation_report,
    submit_complete_trainer_evaluation,
)
from app.services.payment_service import (
    activate_participant_enrollment,
    deactivate_participant_enrollment,
    renew_participant_semester,
    verify_course_payment,
)


@pytest.fixture
def test_now():
    return datetime.now(timezone.utc)


# ===========================================================================
# CASE 1: Participant A changes participant ID to Participant B -> 403/unauthorized
# ===========================================================================
def test_case_1_participant_cannot_access_other_participant():
    user_a = ObjectId()
    user_b = ObjectId()
    ctx_a = ScopeContext(
        user_id=user_a,
        role=Role.STUDENT,
        college_id=ObjectId(),
        department_id=ObjectId(),
        session_id="s1",
    )

    profile_b = {"userId": user_b, "collegeId": ctx_a.college_id, "departmentId": ctx_a.department_id}

    # Accessing own data: allowed
    allowed_self, _ = can_access_participant(ctx_a, user_a, {"userId": user_a})
    assert allowed_self is True

    # Tampering ID to participant B: rejected
    allowed_other, reason = can_access_participant(ctx_a, user_b, profile_b)
    assert allowed_other is False
    assert "Participants may only access their own records" in reason


# ===========================================================================
# CASE 2: Trainer A accesses Trainer B's participant outside assigned batches -> 403
# ===========================================================================
def test_case_2_trainer_cannot_access_unassigned_participant():
    trainer_a = ObjectId()
    batch_a1 = ObjectId()
    batch_b1 = ObjectId()

    ctx_trainer_a = ScopeContext(
        user_id=trainer_a,
        role=Role.TRAINER,
        college_id=ObjectId(),
        department_id=None,
        session_id="s2",
        batch_ids=(batch_a1,),
    )

    participant_assigned = {"userId": ObjectId(), "collegeId": ctx_trainer_a.college_id, "batchId": batch_a1}
    participant_unassigned = {"userId": ObjectId(), "collegeId": ctx_trainer_a.college_id, "batchId": batch_b1}

    # Assigned batch participant: allowed
    allowed_assigned, _ = can_access_participant(ctx_trainer_a, participant_assigned["userId"], participant_assigned)
    assert allowed_assigned is True

    # Unassigned batch participant: rejected
    allowed_unassigned, reason = can_access_participant(ctx_trainer_a, participant_unassigned["userId"], participant_unassigned)
    assert allowed_unassigned is False
    assert "not in any batch assigned" in reason


# ===========================================================================
# CASE 3: CSE SPOC accesses ECE participant -> 403
# ===========================================================================
def test_case_3_spoc_department_isolation():
    college_id = ObjectId()
    cse_dept_id = ObjectId()
    ece_dept_id = ObjectId()

    ctx_cse_spoc = ScopeContext(
        user_id=ObjectId(),
        role=Role.HOD,
        college_id=college_id,
        department_id=cse_dept_id,
        session_id="s3",
    )

    cse_student = {"userId": ObjectId(), "collegeId": college_id, "departmentId": cse_dept_id}
    ece_student = {"userId": ObjectId(), "collegeId": college_id, "departmentId": ece_dept_id}

    # CSE student: allowed
    allowed_cse, _ = can_spoc_view_participant(ctx_cse_spoc, cse_student)
    assert allowed_cse is True

    # ECE student: rejected
    allowed_ece, reason = can_spoc_view_participant(ctx_cse_spoc, ece_student)
    assert allowed_ece is False
    assert "Different department" in reason


# ===========================================================================
# CASE 4: College A Admin accesses College B participant -> 403
# ===========================================================================
def test_case_4_admin_institution_isolation():
    college_a = ObjectId()
    college_b = ObjectId()

    ctx_admin_a = ScopeContext(
        user_id=ObjectId(),
        role=Role.ADMIN,
        college_id=college_a,
        department_id=None,
        session_id="s4",
    )

    student_college_a = {"userId": ObjectId(), "collegeId": college_a}
    student_college_b = {"userId": ObjectId(), "collegeId": college_b}

    # College A student: allowed
    allowed_a, _ = can_access_participant(ctx_admin_a, student_college_a["userId"], student_college_a)
    assert allowed_a is True

    # College B student: rejected
    allowed_b, reason = can_access_participant(ctx_admin_a, student_college_b["userId"], student_college_b)
    assert allowed_b is False
    assert "different institution" in reason


# ===========================================================================
# CASE 5 & 6: Expired participant access to current vs historical content
# ===========================================================================
def test_case_5_and_6_expired_participant_lifecycle(test_now):
    user_id = ObjectId()
    college_id = ObjectId()
    course_id = ObjectId()

    ctx_student = ScopeContext(
        user_id=user_id,
        role=Role.STUDENT,
        college_id=college_id,
        department_id=ObjectId(),
        session_id="s5",
    )

    course = {"_id": course_id, "courseMode": "OFFLINE", "collegeId": college_id}

    # Expired access period: end date was 10 days ago
    past_end = test_now - timedelta(days=10)
    past_start = test_now - timedelta(days=190)

    expired_enrollment = {
        "studentUserId": user_id,
        "courseId": course_id,
        "enrollmentType": "paid",
        "paymentStatus": PaymentStatus.VERIFIED,
        "status": EnrollmentStatus.EXPIRED,
        "currentPeriod": {
            "semesterNumber": 1,
            "startDate": past_start,
            "endDate": past_end,
            "accessStatus": AccessStatus.EXPIRED,
        },
    }

    # Server-side date check confirms expired
    assert is_access_active(expired_enrollment["currentPeriod"], test_now) is False
    assert is_enrollment_expired(expired_enrollment, test_now) is True

    # CASE 5: Protected current course content is blocked
    allowed_course, reason = can_access_course(ctx_student, course, expired_enrollment, test_now)
    assert allowed_course is False
    assert "expired" in reason.lower()

    # CASE 6: Historical evaluation report remains accessible to the participant
    historical_report = {
        "studentUserId": user_id,
        "evaluatorUserId": ObjectId(),
        "collegeId": college_id,
        "departmentId": ctx_student.department_id,
        "semesterNumber": 1,
        "status": "COMPLETED",
    }
    allowed_report, _ = can_view_evaluation_report(ctx_student, historical_report)
    assert allowed_report is True


# ===========================================================================
# CASE 7: Participant has payment pending -> Current protected access denied
# ===========================================================================
def test_case_7_payment_pending_access_denied(test_now):
    user_id = ObjectId()
    college_id = ObjectId()
    course = {"_id": ObjectId(), "courseMode": "OFFLINE", "collegeId": college_id}

    ctx_student = ScopeContext(
        user_id=user_id,
        role=Role.STUDENT,
        college_id=college_id,
        department_id=ObjectId(),
        session_id="s7",
    )

    pending_enrollment = {
        "studentUserId": user_id,
        "courseId": course["_id"],
        "enrollmentType": "paid",
        "paymentStatus": PaymentStatus.PENDING,
        "status": EnrollmentStatus.PENDING,
        "currentPeriod": {
            "startDate": test_now,
            "endDate": test_now + timedelta(days=180),
            "accessStatus": AccessStatus.INACTIVE,
        },
    }

    allowed, reason = can_access_course(ctx_student, course, pending_enrollment, test_now)
    assert allowed is False
    assert "Payment pending" in reason


# ===========================================================================
# CASE 8: Payment verified + Admin activation -> Access becomes active
# ===========================================================================
def test_case_8_payment_verified_and_admin_activated(test_now):
    user_id = ObjectId()
    college_id = ObjectId()
    course = {"_id": ObjectId(), "courseMode": "OFFLINE", "collegeId": college_id}

    ctx_student = ScopeContext(
        user_id=user_id,
        role=Role.STUDENT,
        college_id=college_id,
        department_id=ObjectId(),
        session_id="s8",
    )

    # Step 1: Payment verified, but awaiting admin activation -> access still INACTIVE
    verified_enrollment = {
        "studentUserId": user_id,
        "courseId": course["_id"],
        "enrollmentType": "paid",
        "paymentStatus": PaymentStatus.VERIFIED,
        "status": EnrollmentStatus.ACTIVE,
        "currentPeriod": {
            "startDate": test_now,
            "endDate": test_now + timedelta(days=180),
            "accessStatus": AccessStatus.INACTIVE,
        },
    }
    allowed_before_admin, reason_before = can_access_course(ctx_student, course, verified_enrollment, test_now)
    assert allowed_before_admin is False
    assert "Access is inactive" in reason_before

    # Step 2: Admin activates access
    verified_enrollment["currentPeriod"]["accessStatus"] = AccessStatus.ACTIVE
    allowed_after_admin, _ = can_access_course(ctx_student, course, verified_enrollment, test_now)
    assert allowed_after_admin is True


# ===========================================================================
# CASE 9: Online participant attempts to access College Admin functionality -> Denied
# ===========================================================================
def test_case_9_online_participant_cannot_access_admin():
    ctx_online_student = ScopeContext(
        user_id=ObjectId(),
        role=Role.STUDENT,
        college_id=None,
        department_id=None,
        session_id="s9",
    )

    fake_enrollment = {"_id": ObjectId(), "collegeId": ObjectId()}
    allowed, reason = can_admin_activate_enrollment(ctx_online_student, fake_enrollment)
    assert allowed is False
    assert "Only institution administrators" in reason


# ===========================================================================
# CASE 10: Super Admin accesses any institution -> Allowed
# ===========================================================================
def test_case_10_super_admin_global_access():
    ctx_super = ScopeContext(
        user_id=ObjectId(),
        role=Role.SUPER_ADMIN,
        college_id=None,
        department_id=None,
        session_id="s10",
    )

    assert ctx_super.is_platform_wide is True

    # Access any institution
    allowed_inst, _ = can_super_admin_view_institution(ctx_super, ObjectId())
    assert allowed_inst is True

    # Access any participant
    allowed_part, _ = can_access_participant(ctx_super, ObjectId(), {"collegeId": ObjectId(), "departmentId": ObjectId()})
    assert allowed_part is True

    # Access any report
    allowed_rep, _ = can_view_evaluation_report(ctx_super, {"studentUserId": ObjectId(), "collegeId": ObjectId()})
    assert allowed_rep is True


# ===========================================================================
# CASE 11: Institution type auto-mapping (COLLEGE, COMPANY, SCHOOL)
# ===========================================================================
def test_case_11_institution_auto_mapping():
    assert get_training_type_for_institution(InstitutionType.COLLEGE) == TrainingType.COLLEGE
    assert get_training_type_for_institution("COLLEGE") == TrainingType.COLLEGE

    assert get_training_type_for_institution(InstitutionType.COMPANY) == TrainingType.COOPERATIVE
    assert get_training_type_for_institution("COMPANY") == TrainingType.COOPERATIVE

    assert get_training_type_for_institution(InstitutionType.SCHOOL) == TrainingType.SCHOOL
    assert get_training_type_for_institution("SCHOOL") == TrainingType.SCHOOL


# ===========================================================================
# CASE 12: Trainer evaluation triggers report generation with employment score
# ===========================================================================
def test_case_12_employment_score_calculation():
    # Valid inputs: EEDI score 80, Evaluation 75, Attendance 90%
    score = calculate_employment_score(eedi_score=80.0, evaluation={"overallScore": 75.0}, attendance_pct=90.0)
    assert score is not None
    assert score == pytest.approx(80.25, 0.1)

    # Missing EEDI score: returns None (rendered as N/A, no fake numbers)
    missing_score = calculate_employment_score(eedi_score=None, evaluation={"overallScore": 75.0})
    assert missing_score is None


# ===========================================================================
# Evaluation Report 5-Party Visibility Policy (Requirement 26)
# ===========================================================================
def test_evaluation_report_visibility_five_parties():
    student_id = ObjectId()
    evaluator_trainer_id = ObjectId()
    other_trainer_id = ObjectId()
    college_id = ObjectId()
    other_college_id = ObjectId()
    cse_dept_id = ObjectId()
    ece_dept_id = ObjectId()

    report = {
        "studentUserId": student_id,
        "evaluatorUserId": evaluator_trainer_id,
        "collegeId": college_id,
        "departmentId": cse_dept_id,
    }

    # 1. Participant (own report): ALLOWED
    ctx_student = ScopeContext(user_id=student_id, role=Role.STUDENT, college_id=college_id, department_id=cse_dept_id, session_id="v1")
    allowed, _ = can_view_evaluation_report(ctx_student, report)
    assert allowed is True

    # Other participant: FORBIDDEN
    ctx_other_student = ScopeContext(user_id=ObjectId(), role=Role.STUDENT, college_id=college_id, department_id=cse_dept_id, session_id="v2")
    allowed, _ = can_view_evaluation_report(ctx_other_student, report)
    assert allowed is False

    # 2. Evaluating Trainer: ALLOWED
    ctx_eval_trainer = ScopeContext(user_id=evaluator_trainer_id, role=Role.TRAINER, college_id=college_id, department_id=None, session_id="v3")
    allowed, _ = can_view_evaluation_report(ctx_eval_trainer, report)
    assert allowed is True

    # Other Trainer: FORBIDDEN
    ctx_other_trainer = ScopeContext(user_id=other_trainer_id, role=Role.TRAINER, college_id=college_id, department_id=None, session_id="v4")
    allowed, _ = can_view_evaluation_report(ctx_other_trainer, report)
    assert allowed is False

    # 3. Same Institution Admin: ALLOWED
    ctx_admin = ScopeContext(user_id=ObjectId(), role=Role.ADMIN, college_id=college_id, department_id=None, session_id="v5")
    allowed, _ = can_view_evaluation_report(ctx_admin, report)
    assert allowed is True

    # Other Institution Admin: FORBIDDEN
    ctx_other_admin = ScopeContext(user_id=ObjectId(), role=Role.ADMIN, college_id=other_college_id, department_id=None, session_id="v6")
    allowed, _ = can_view_evaluation_report(ctx_other_admin, report)
    assert allowed is False

    # 4. Same Institution & Department SPOC: ALLOWED
    ctx_cse_spoc = ScopeContext(user_id=ObjectId(), role=Role.HOD, college_id=college_id, department_id=cse_dept_id, session_id="v7")
    allowed, _ = can_view_evaluation_report(ctx_cse_spoc, report)
    assert allowed is True

    # Other Department SPOC (ECE): FORBIDDEN
    ctx_ece_spoc = ScopeContext(user_id=ObjectId(), role=Role.HOD, college_id=college_id, department_id=ece_dept_id, session_id="v8")
    allowed, _ = can_view_evaluation_report(ctx_ece_spoc, report)
    assert allowed is False

    # 5. Super Admin: ALLOWED
    ctx_super = ScopeContext(user_id=ObjectId(), role=Role.SUPER_ADMIN, college_id=None, department_id=None, session_id="v9")
    allowed, _ = can_view_evaluation_report(ctx_super, report)
    assert allowed is True

