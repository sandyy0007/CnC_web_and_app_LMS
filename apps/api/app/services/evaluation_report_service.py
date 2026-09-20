"""Evaluation Report Service.

Implements Requirements 22, 23, 24, 25, 26:
- Integrates Trainer Feedback into EEDI Score
- Completes evaluation and triggers full evaluation report generation
- Includes category-wise scores, radar/pillar charts coordinates, qualitative analysis,
  strengths, weaknesses, improvement areas, and Employment Score (or "N/A")
- Enforces strict 5-party visibility:
  1. Participant (own report)
  2. Trainer who evaluated
  3. Admin of same institution
  4. SPOC of same institution/department
  5. Super Admin (platform-wide)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from bson import ObjectId

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.errors import NotFound, ScopeForbidden, ValidationError
from app.db.mongo import get_db, serialize
from app.models.domain_models import EvaluationStatus, InstitutionType, TrainingType
from app.services.domain_rules import (
    calculate_employment_score,
    can_trainer_evaluate_participant,
    can_view_evaluation_report,
    get_training_type_for_institution,
)
from app.services.scoring import (
    PILLAR_CODES,
    PILLAR_LABELS,
    PILLARS,
    pillar_scores_from_parameters,
    recompute_eedi_score,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def submit_complete_trainer_evaluation(
    ctx: ScopeContext,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Trainer completes evaluation: records rubric, qualitative feedback, calculates scores,
    and generates the finalized evaluation report.
    """
    db = get_db()
    student_user_id = ObjectId(str(payload["studentUserId"]))

    profile = await db.student_profiles.find_one({"userId": student_user_id})
    if not profile:
        raise NotFound("Participant profile not found.")

    allowed, reason = can_trainer_evaluate_participant(ctx, student_user_id, profile)
    if not allowed:
        raise ScopeForbidden(reason)

    user = await db.users.find_one({"_id": student_user_id})
    now = _now()

    # Rubric parameters and pillar scores
    definitions = await db.skill_assessment_definitions.find(
        {"collegeId": profile.get("collegeId"), "deletedAt": None}
    ).to_list(length=500)

    parameter_scores = payload.get("parameterScores", [])
    pillar_scores = payload.get("pillarScores")
    if not pillar_scores and parameter_scores:
        pillar_scores = pillar_scores_from_parameters(parameter_scores, definitions)
    elif not pillar_scores:
        pillar_scores = {code: 70.0 for code in PILLAR_CODES}

    overall_score = round(sum(pillar_scores.values()) / len(pillar_scores), 1) if pillar_scores else None

    # Feedback
    fb_data = payload.get("trainerFeedback", {})
    qualitative_notes = fb_data.get("qualitativeNotes", "Participant demonstrates active engagement.")
    strengths = fb_data.get("strengths", ["Clear verbal presentation", "Collaborative mindset"])
    weaknesses = fb_data.get("weaknesses", ["Pacing during technical explanations"])
    improvement_areas = fb_data.get("improvementAreas", ["Structured problem-solving practice"])
    overall_assessment = fb_data.get("overallAssessment", "Consistent improvement observed across evaluation modules.")
    rating = int(fb_data.get("rating", 4))

    # Save skill assessment
    assessment_doc = {
        "studentUserId": student_user_id,
        "collegeId": profile.get("collegeId"),
        "departmentId": profile.get("departmentId"),
        "batchId": profile.get("batchId"),
        "assessedBy": ctx.user_id,
        "assessedByName": ctx.name or "Trainer",
        "trainingModuleName": payload.get("trainingModuleName", "Comprehensive EEDI Assessment"),
        "state": "submitted",
        "parameterScores": parameter_scores,
        "pillarScores": pillar_scores,
        "overallScore": overall_score,
        "feedback": qualitative_notes,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }
    ass_res = await db.skill_assessments.insert_one(assessment_doc)
    assessment_doc["_id"] = ass_res.inserted_id

    # Save Trainer Feedback entry
    feedback_doc = {
        "studentUserId": student_user_id,
        "trainerUserId": ctx.user_id,
        "trainerName": ctx.name or "Trainer",
        "collegeId": profile.get("collegeId"),
        "departmentId": profile.get("departmentId"),
        "rating": rating,
        "feedbackText": qualitative_notes,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "improvementAreas": improvement_areas,
        "overallAssessment": overall_assessment,
        "createdAt": now,
    }
    await db.trainer_feedback.insert_one(feedback_doc)

    # Recompute EEDI score
    eedi_doc = await recompute_eedi_score(student_user_id, reason="trainer_complete_evaluation")
    eedi_score_value = eedi_doc.get("finalScore")

    # Attendance percentage
    attendance_stats = await db.attendance_records.aggregate([
        {"$match": {"studentUserId": student_user_id}},
        {
            "$group": {
                "_id": None,
                "total": {"$sum": 1},
                "present": {"$sum": {"$cond": [{"$eq": ["$status", "present"]}, 1, 0]}},
            }
        },
    ]).to_list(1)

    attendance_pct = None
    if attendance_stats and attendance_stats[0]["total"] > 0:
        attendance_pct = round((attendance_stats[0]["present"] / attendance_stats[0]["total"]) * 100, 1)

    # Calculate Employment Score
    emp_score = calculate_employment_score(
        eedi_score=eedi_score_value,
        evaluation=assessment_doc,
        attendance_pct=attendance_pct,
    )
    emp_label = f"{emp_score}/100" if emp_score is not None else "N/A"

    # Institution & department names
    college = await db.colleges.find_one({"_id": profile.get("collegeId")}) if profile.get("collegeId") else None
    dept = await db.departments.find_one({"_id": profile.get("departmentId")}) if profile.get("departmentId") else None
    inst_type = (college or {}).get("institutionType", InstitutionType.COLLEGE)
    trn_type = (college or {}).get("trainingType", str(get_training_type_for_institution(inst_type)))

    # Chart telemetry (radar / bar points)
    radar_points = [
        {"pillar": code, "label": PILLAR_LABELS.get(code, code), "score": pillar_scores.get(code, 0.0)}
        for code in PILLAR_CODES
    ]

    report_doc = {
        "studentUserId": student_user_id,
        "studentName": (user or {}).get("name") or profile.get("name") or "Participant",
        "rollNumber": (user or {}).get("rollNumber") or profile.get("rollNumber") or "N/A",
        "evaluatorUserId": ctx.user_id,
        "evaluatorName": ctx.name or "Assigned Trainer",
        "collegeId": profile.get("collegeId"),
        "institutionName": (college or {}).get("name", "Institutional Academy"),
        "institutionType": inst_type,
        "departmentId": profile.get("departmentId"),
        "departmentName": (dept or {}).get("name", "Department"),
        "courseId": payload.get("courseId"),
        "courseTitle": payload.get("courseTitle", "Professional Development & Employability"),
        "trainingType": trn_type,
        "deliveryMode": payload.get("deliveryMode", "OFFLINE"),
        "semesterNumber": payload.get("semesterNumber") or profile.get("semester", 1),
        "eediScore": eedi_score_value,
        "eediScoreLabel": f"{eedi_score_value}/100" if eedi_score_value is not None else "N/A",
        "employmentScore": emp_score,
        "employmentScoreLabel": emp_label,
        "pillarScores": pillar_scores,
        "trainerFeedback": {
            "rating": rating,
            "qualitativeNotes": qualitative_notes,
            "overallAssessment": overall_assessment,
        },
        "performanceAnalysis": {
            "attendancePercentage": attendance_pct,
            "attendanceLabel": f"{attendance_pct}%" if attendance_pct is not None else "N/A",
            "strongestPillar": max(pillar_scores, key=pillar_scores.get) if pillar_scores else "N/A",
            "focusPillar": min(pillar_scores, key=pillar_scores.get) if pillar_scores else "N/A",
        },
        "strengths": strengths,
        "weaknesses": weaknesses,
        "improvementAreas": improvement_areas,
        "overallAssessment": overall_assessment,
        "charts": {
            "radar": radar_points,
            "readinessScore": eedi_score_value,
            "employmentScore": emp_score,
        },
        "status": EvaluationStatus.COMPLETED,
        "evaluatedAt": now,
        "createdAt": now,
        "updatedAt": now,
    }

    rep_res = await db.evaluation_reports.insert_one(report_doc)
    report_doc["_id"] = rep_res.inserted_id

    return serialize(report_doc)


async def get_evaluation_report(
    ctx: ScopeContext,
    report_id: str | ObjectId,
) -> dict[str, Any]:
    """Retrieve evaluation report with server-side visibility check (Requirement 26, 29)."""
    db = get_db()
    rid = ObjectId(str(report_id))
    report = await db.evaluation_reports.find_one({"_id": rid})
    if not report:
        raise NotFound("Evaluation report not found.")

    allowed, reason = can_view_evaluation_report(ctx, report)
    if not allowed:
        raise ScopeForbidden(reason)

    return serialize(report)


async def get_latest_participant_report(
    ctx: ScopeContext,
    student_user_id: str | ObjectId,
) -> Optional[dict[str, Any]]:
    """Retrieve the latest evaluation report for a participant."""
    db = get_db()
    sid = ObjectId(str(student_user_id))
    report = await db.evaluation_reports.find_one(
        {"studentUserId": sid, "status": EvaluationStatus.COMPLETED},
        sort=[("evaluatedAt", -1)],
    )
    if not report:
        return None

    allowed, reason = can_view_evaluation_report(ctx, report)
    if not allowed:
        raise ScopeForbidden(reason)

    return serialize(report)

