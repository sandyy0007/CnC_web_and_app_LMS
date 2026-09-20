"""Trainer portal API.

Two rules shape everything here:

* **A trainer only ever sees or writes their own assigned data.** Scope comes from
  `trainer_assignments`, resolved server-side; attendance cannot be marked outside an assigned
  session, and evaluations cannot be entered for a student outside an assigned batch.
* **Saving is never blocked on AI.** Submitting an evaluation persists the raw trainer scores and
  enqueues the EEDI recalculation; the response returns immediately.
"""
from __future__ import annotations

import asyncio
import time

from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.authz.guards import (
    require_role,
    require_student_in_scope,
    require_trainer_batch_scope,
    require_trainer_session_scope,
)
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import BusinessRuleViolation, Conflict, NotFound, ValidationError
from app.db.mongo import as_utc, get_db, is_inmemory, serialize
from app.repositories.collections import (
    AiScoreRepo,
    AssessmentVersionRepo,
    AssignmentRepo,
    AssignmentSubmissionRepo,
    AttendanceRepo,
    BatchRepo,
    CourseProgressRepo,
    EediScoreRepo,
    SemesterRepo,
    SkillAssessmentDefinitionRepo,
    SkillAssessmentRepo,
    StudentProfileRepo,
    TrainerAssignmentRepo,
    TrainerFeedbackRepo,
    TrainingModuleRepo,
    TrainingSessionRepo,
    WeakStudentAlertRepo,
    EbookRepo,
    GameDefinitionRepo,
    GameAttemptRepo,
    GameAssignmentRepo,
    PaymentRepo,
)
from app.schemas.requests import (
    AiOverrideRequest,
    AlertPatch,
    AssignmentPatch,
    AssignmentRequest,
    AttendanceRequest,
    EvaluationPatch,
    EvaluationRequest,
    FeedbackRequest,
    ReportRequest,
    SubmissionReview,
)
from app.services import analytics
from app.services import analytics, chat_service
from app.services.notifications import Kind, notify
from app.services.scoring import PILLAR_LABELS, PILLARS, pillar_scores_from_parameters
from app.services.storage import signed_url
from app.services.storage import Keys, get_storage, put_object, signed_url
from app.workers.queue import enqueue

router = APIRouter()
TrainerCtx = Depends(require_role(Role.TRAINER))


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- dashboard
@router.get("/dashboard")
async def dashboard(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.stats_repo import StatsRepository
        try:
            pg_data = await StatsRepository.get_trainer_dashboard_data(ctx.user_id)
            return {"success": True, "data": pg_data}
        except Exception:
            pass

    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    # Independent reads, issued together instead of as eight sequential round-trips.
    (
        batches,
        students,
        attendance,
        assessments,
        pending_evaluations,
        alerts,
        todays_sessions,
        trend,
        module_scores,
    ) = await asyncio.gather(
        BatchRepo(ctx).find_all(limit=100),
        StudentProfileRepo(ctx).count(),
        analytics.attendance_overall(ctx),
        analytics.assessment_summary(ctx),
        SkillAssessmentRepo(ctx).count({"assessedBy": ctx.user_id, "state": "draft"}),
        WeakStudentAlertRepo(ctx).count({"resolvedAt": None}),
        TrainingSessionRepo(ctx).find_all(
            {"date": {"$gte": today_start, "$lt": today_start + timedelta(days=1)}},
            limit=20,
            sort=[("date", 1)],
        ),
        analytics.attendance_trend(ctx, weeks=8),
        analytics.assessment_by_module(ctx),
    )

    # One grouped read for "which of today's sessions have no attendance yet", rather than a
    # count per session — that loop was a query per class on a page trainers open every day.
    unmarked = len(todays_sessions)
    if todays_sessions:
        if is_inmemory():
            sess_ids = [s["_id"] for s in todays_sessions]
            marked_docs = await AttendanceRepo(ctx).col.find(
                AttendanceRepo(ctx).scope_filter({"trainingSessionId": {"$in": sess_ids}}),
                {"trainingSessionId": 1},
            ).to_list(length=None)
            with_attendance = {row["trainingSessionId"] for row in marked_docs}
            unmarked = sum(1 for s in todays_sessions if s["_id"] not in with_attendance)
        else:
            marked_rows = await AttendanceRepo(ctx).aggregate(
                [
                    {"$match": {"trainingSessionId": {"$in": [s["_id"] for s in todays_sessions]}}},
                    {"$group": {"_id": "$trainingSessionId", "marked": {"$sum": 1}}},
                ]
            )
            with_attendance = {row["_id"] for row in marked_rows if row.get("marked")}
            unmarked = sum(1 for s in todays_sessions if s["_id"] not in with_attendance)

    if is_inmemory():
        if ctx.department_ids:
            prog_docs = await CourseProgressRepo(ctx).col.find(
                {"departmentId": {"$in": list(ctx.department_ids)}}, {"percent": 1}
            ).to_list(length=None)
            vals = [p["percent"] for p in prog_docs if p.get("percent") is not None]
            progress_rows = [{"avg": sum(vals) / len(vals)}] if vals else []
        else:
            progress_rows = []
    else:
        progress_rows = await CourseProgressRepo(ctx).col.aggregate(
            [
                {"$match": {"departmentId": {"$in": list(ctx.department_ids)} if ctx.department_ids else None}},
                {"$group": {"_id": None, "avg": {"$avg": "$percent"}}},
            ]
            if ctx.department_ids
            else [{"$match": {"_id": None}}]
        ).to_list(length=1)

    return {
        "success": True,
        "data": {
            "assignedBatches": [
                {
                    "id": str(b["_id"]),
                    "name": b.get("name"),
                    "code": b.get("code"),
                    "departmentName": b.get("departmentName"),
                    "status": b.get("status"),
                }
                for b in batches
            ],
            "studentCount": students,
            "attendance": attendance,
            "assessments": assessments,
            "pendingEvaluations": pending_evaluations,
            "weakStudentAlerts": alerts,
            "todaysClasses": {
                "total": len(todays_sessions),
                "attendanceNotMarked": unmarked,
                "sessions": serialize(todays_sessions),
            },
            "courseCompletionPercent": (
                round(progress_rows[0]["avg"], 1)
                if progress_rows and progress_rows[0].get("avg") is not None
                else None
            ),
            "attendanceTrend": trend,
            "moduleScores": module_scores,
        },
    }


@router.get("/batches")
async def batches(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    rows = await BatchRepo(ctx).find_all(limit=100)
    if not rows:
        return {"success": True, "data": []}

    sem = asyncio.Semaphore(10)

    async def _fetch_batch(batch: dict[str, Any]) -> dict[str, Any]:
        async with sem:
            count, attendance, assessment = await asyncio.gather(
                StudentProfileRepo(ctx).count({"batchId": batch["_id"]}),
                analytics.attendance_overall(ctx, filters={"batchId": batch["_id"]}),
                analytics.assessment_summary(ctx, filters={"batchId": batch["_id"]}),
            )
            return {
                **serialize(batch),
                "studentCount": count,
                "attendancePercent": attendance["percentage"],
                "averageScore": assessment["average"],
            }

    out = await asyncio.gather(*[_fetch_batch(batch) for batch in rows])
    return {"success": True, "data": list(out)}


@router.get("/batches/{batch_id}/students")
async def batch_students(
    batch_id: str,
    search: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    resolved = await require_trainer_batch_scope(ctx, batch_id)
    page_result = await StudentProfileRepo(ctx).list(
        filters={"batchId": resolved}, search=search, page=page, page_size=pageSize
    )
    user_ids = [p["userId"] for p in page_result.items]
    attendance = await analytics.student_attendance_map(
        ctx, filters={"batchId": resolved, "studentUserId": {"$in": user_ids}}
    )
    scores = {
        row["studentUserId"]: row
        for row in await EediScoreRepo(ctx).find_all(
            {"batchId": resolved, "studentUserId": {"$in": user_ids}}, limit=len(user_ids) or 1
        )
    }
    items = []
    for profile in page_result.items:
        att = attendance.get(profile["userId"], {})
        score = scores.get(profile["userId"], {})
        items.append(
            {
                **serialize(profile),
                "attendancePercent": att.get("percentage"),
                "sessionsAttended": att.get("present"),
                "sessionsTotal": att.get("total"),
                "readinessScore": score.get("finalScore"),
                "focusPillar": PILLAR_LABELS.get(score.get("focusPillar") or "", None),
            }
        )
    response = page_result.to_response()
    response["items"] = items
    return {"success": True, **response}


@router.get("/students")
async def students(
    search: str | None = Query(None, max_length=80),
    batchId: str | None = Query(None),
    weakOnly: bool = Query(False),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if batchId:
        filters["batchId"] = await require_trainer_batch_scope(ctx, batchId)
    page_result = await StudentProfileRepo(ctx).list(
        filters=filters, search=search, page=page, page_size=pageSize
    )
    user_ids = [p["userId"] for p in page_result.items]
    scores = {
        row["studentUserId"]: row
        for row in await EediScoreRepo(ctx).find_all(
            {"studentUserId": {"$in": user_ids}}, limit=len(user_ids) or 1
        )
    }
    attendance = await analytics.student_attendance_map(
        ctx, filters={"studentUserId": {"$in": user_ids}}
    )
    items = []
    for profile in page_result.items:
        score = scores.get(profile["userId"], {})
        final = score.get("finalScore")
        if weakOnly and (final is None or final >= settings.WEAK_STUDENT_THRESHOLD):
            continue
        items.append(
            {
                **serialize(profile),
                "readinessScore": final,
                "focusPillar": PILLAR_LABELS.get(score.get("focusPillar") or "", None),
                "attendancePercent": attendance.get(profile["userId"], {}).get("percentage"),
                "weak": final is not None and final < settings.WEAK_STUDENT_THRESHOLD,
            }
        )
    response = page_result.to_response()
    response["items"] = items
    return {"success": True, **response}


@router.get("/students/{student_id}")
async def student_detail(student_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    resolved = await require_student_in_scope(ctx, student_id)
    profile = await StudentProfileRepo(ctx).find_one({"userId": resolved})
    if not profile:
        raise NotFound("Participant not found")
    attendance = await analytics.attendance_overall(ctx, filters={"studentUserId": resolved})
    assessments = await SkillAssessmentRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=50, sort=[("createdAt", -1)]
    )
    score = await EediScoreRepo(ctx).find_one({"studentUserId": resolved}) or {}
    ai_scores = await AiScoreRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=20, sort=[("createdAt", -1)]
    )
    feedback = await TrainerFeedbackRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=20, sort=[("createdAt", -1)]
    )
    return {
        "success": True,
        "data": {
            "profile": serialize(profile),
            "attendance": attendance,
            "assessments": serialize(assessments),
            "eediScore": serialize(score),
            "pillars": [
                {
                    "code": code,
                    "label": label,
                    "score": (score.get("pillarScores") or {}).get(code),
                }
                for code, label in PILLARS
            ],
            "aiScores": serialize(ai_scores),
            "feedback": serialize(feedback),
        },
    }


# --------------------------------------------------------------------------- classes & attendance
@router.get("/classes/today")
async def todays_classes(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    rows = await TrainingSessionRepo(ctx).find_all(
        {"date": {"$gte": start, "$lt": start + timedelta(days=1)}}, limit=50, sort=[("date", 1)]
    )
    if not rows:
        return {"success": True, "data": []}

    # Two grouped reads for the whole day rather than two per class.
    session_ids = [row["_id"] for row in rows]
    batch_ids = list({row.get("batchId") for row in rows if row.get("batchId")})
    marked_rows, roster_rows = await asyncio.gather(
        AttendanceRepo(ctx).aggregate(
            [
                {"$match": {"trainingSessionId": {"$in": session_ids}}},
                {"$group": {"_id": "$trainingSessionId", "marked": {"$sum": 1}}},
            ]
        ),
        StudentProfileRepo(ctx).aggregate(
            [
                {"$match": {"batchId": {"$in": batch_ids}}},
                {"$group": {"_id": "$batchId", "roster": {"$sum": 1}}},
            ]
        )
        if batch_ids
        else _empty_rows(),
    )
    marked_by_session = {row["_id"]: row.get("marked", 0) for row in marked_rows}
    roster_by_batch = {row["_id"]: row.get("roster", 0) for row in roster_rows}

    out = []
    for session in rows:
        marked = marked_by_session.get(session["_id"], 0)
        roster = roster_by_batch.get(session.get("batchId"), 0)
        out.append(
            {
                **serialize(session),
                "attendanceMarked": marked,
                "rosterSize": roster,
                "attendanceComplete": marked >= roster and roster > 0,
            }
        )
    return {"success": True, "data": out}


async def _empty_rows() -> list[dict[str, Any]]:
    """An awaitable placeholder so `gather` stays symmetric when there is nothing to group."""
    return []


@router.get("/sessions")
async def sessions(
    batchId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if batchId:
        filters["batchId"] = await require_trainer_batch_scope(ctx, batchId)
    page_result = await TrainingSessionRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize, sort_by="date", sort_dir="desc"
    )
    return {"success": True, **page_result.to_response()}


@router.get("/sessions/{session_id}/attendance")
async def session_attendance(session_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    session = await require_trainer_session_scope(ctx, session_id)
    roster = await StudentProfileRepo(ctx).find_all(
        {"batchId": session.get("batchId")},
        projection={"userId": 1, "name": 1, "rollNumber": 1},
        limit=500,
        sort=[("rollNumber", 1)],
    )
    existing = {
        row["studentUserId"]: row
        for row in await AttendanceRepo(ctx).find_all(
            {"trainingSessionId": session["_id"]}, limit=500
        )
    }
    return {
        "success": True,
        "data": {
            "session": serialize(session),
            "alreadyMarked": bool(existing),
            "roster": [
                {
                    "studentUserId": str(profile["userId"]),
                    "name": profile.get("name"),
                    "rollNumber": profile.get("rollNumber"),
                    "status": (existing.get(profile["userId"]) or {}).get("status"),
                    "remark": (existing.get(profile["userId"]) or {}).get("remark"),
                }
                for profile in roster
            ],
            "statuses": ["present", "absent", "late", "leave"],
        },
    }


@router.post("/attendance", status_code=status.HTTP_201_CREATED)
async def mark_attendance(
    payload: AttendanceRequest, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Attendance can only be marked on the trainer's own session, never in the future."""
    session = await require_trainer_session_scope(ctx, payload.trainingSessionId)

    session_date = session.get("date")
    session_date = as_utc(session_date)
    if session_date and session_date.date() > _now().date():
        raise BusinessRuleViolation(
            "Attendance cannot be marked for a session that hasn't happened yet"
        )

    roster = {
        profile["userId"]
        for profile in await StudentProfileRepo(ctx).find_all(
            {"batchId": session.get("batchId")}, projection={"userId": 1}, limit=1000
        )
    }
    already = {
        row["studentUserId"]
        for row in await AttendanceRepo(ctx).find_all(
            {"trainingSessionId": session["_id"]}, projection={"studentUserId": 1}, limit=1000
        )
    }
    if already and not payload.overwrite:
        raise Conflict(
            "Attendance for this session has already been recorded. "
            "Re-submit with overwrite enabled to correct it."
        )

    db = get_db()
    written, rejected, touched = 0, [], []
    for entry in payload.entries:
        student_id = ObjectId(entry.studentUserId)
        if student_id not in roster:
            rejected.append(
                {"studentUserId": entry.studentUserId, "reason": "Not in this session's batch"}
            )
            continue
        await db.attendance.update_one(
            {"trainingSessionId": session["_id"], "studentUserId": student_id},
            {
                "$set": {
                    "trainingSessionId": session["_id"],
                    "studentUserId": student_id,
                    "trainerUserId": ctx.user_id,
                    "collegeId": session.get("collegeId"),
                    "departmentId": session.get("departmentId"),
                    "batchId": session.get("batchId"),
                    "trainingModuleId": session.get("trainingModuleId"),
                    "date": session.get("date") or _now(),
                    "status": entry.status,
                    "remark": entry.remark,
                    "updatedAt": _now(),
                    "updatedBy": ctx.user_id,
                },
                "$setOnInsert": {"createdAt": _now(), "createdBy": ctx.user_id},
            },
            upsert=True,
        )
        written += 1
        touched.append(student_id)

    await db.training_sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {"attendanceMarkedAt": _now(), "attendanceMarkedBy": ctx.user_id}},
    )
    await write_audit(
        ctx,
        action="create" if not already else "update",
        entity_type="attendance",
        entity_id=session["_id"],
        after={"marked": written, "rejected": len(rejected)},
        detail=f"session {session.get('topic', '')} attendance recorded ({written} entries)",
        college_id=session.get("collegeId"),
        department_id=session.get("departmentId"),
    )

    # Certificate eligibility depends on attendance — recompute in the background.
    for student_id in touched:
        await enqueue(
            "certificate.recompute",
            {"studentUserId": str(student_id), "reason": "attendance_updated"},
        )

    return {
        "success": True,
        "message": f"Attendance saved for {written} participant(s)",
        "data": {"written": written, "rejected": rejected},
    }


# --------------------------------------------------------------------------- evaluations
@router.get("/training-modules")
async def trainer_training_modules(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """The modules a trainer can evaluate against.

    Separate from `/course-progress` (which aggregates session counts per module) because the
    evaluation form needs only the names and ids, and should not pay for the analytics.
    """
    rows = await TrainingModuleRepo(ctx).find_all(limit=200, sort=[("name", 1)])
    semesters = await SemesterRepo(ctx).find_all(limit=50, sort=[("number", -1)])
    return {
        "success": True,
        "data": [
            {"id": str(row["_id"]), "name": row.get("name"), "code": row.get("code")}
            for row in rows
        ],
        "meta": {
            "semesters": [
                {
                    "id": str(row["_id"]),
                    "number": row.get("number"),
                    "label": row.get("label") or f"Semester {row.get('number')}",
                    "active": bool(row.get("active")),
                }
                for row in semesters
            ]
        },
    }


@router.get("/evaluations/parameters")
async def evaluation_parameters(
    semester: int | None = Query(None, ge=1, le=12), ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """The 95+ trainer-rated parameters, grouped into the 7 pillars."""
    filters: dict[str, Any] = {}
    definitions = await SkillAssessmentDefinitionRepo(ctx).find_all(
        filters, limit=500, sort=[("order", 1)]
    )
    if semester:
        definitions = [
            d
            for d in definitions
            if (d.get("semesterFrom") or 1) <= semester <= (d.get("semesterTo") or 12)
        ]

    grouped = []
    for code, label in PILLARS:
        items = [d for d in definitions if d.get("pillar") == code]
        grouped.append(
            {
                "pillar": code,
                "label": label,
                "parameterCount": len(items),
                "parameters": [
                    {
                        "code": d.get("code"),
                        "label": d.get("label"),
                        "description": d.get("description"),
                        "maxScore": d.get("maxScore", 5),
                        "weight": d.get("weight", 1),
                        "scale": d.get("scale", "1-5"),
                    }
                    for d in items
                ],
            }
        )
    return {
        "success": True,
        "data": {
            "pillars": grouped,
            "totalParameters": len(definitions),
            "semester": semester,
            "editWindowHours": settings.EVALUATION_EDIT_WINDOW_HOURS,
        },
    }


@router.get("/evaluations")
async def list_evaluations(
    state: str | None = Query(None, max_length=20),
    studentId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {"assessedBy": ctx.user_id}
    if state and state != "all":
        filters["state"] = state
    if studentId:
        filters["studentUserId"] = await require_student_in_scope(ctx, studentId)
    page_result = await SkillAssessmentRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize
    )
    return {"success": True, **page_result.to_response()}


async def _build_evaluation_document(
    ctx: ScopeContext,
    *,
    student_id: ObjectId,
    module: dict[str, Any],
    semester_id: Any,
    parameter_scores: list[dict[str, Any]],
    rubric_scores: list[dict[str, Any]],
    remarks: str | None,
    state: str,
    definitions: list[dict[str, Any]],
) -> dict[str, Any]:
    by_code = {d["code"]: d for d in definitions}
    for entry in parameter_scores:
        definition = by_code.get(entry["code"])
        if not definition:
            raise ValidationError(f"Unknown evaluation parameter '{entry['code']}'")
        max_score = float(definition.get("maxScore", 5))
        if not (0 <= float(entry["score"]) <= max_score):
            raise BusinessRuleViolation(
                f"'{definition.get('label')}' must be between 0 and {max_score:g}"
            )

    pillar_scores = pillar_scores_from_parameters(parameter_scores, definitions)
    total = (
        round(sum(pillar_scores.values()) / len(pillar_scores), 2) if pillar_scores else None
    )

    profile = await StudentProfileRepo(ctx).find_one({"userId": student_id})
    covered = {d["code"] for d in definitions}
    provided = {e["code"] for e in parameter_scores}
    return {
        "studentUserId": student_id,
        "studentName": (profile or {}).get("name"),
        "rollNumber": (profile or {}).get("rollNumber"),
        "collegeId": ctx.college_id,
        "departmentId": (profile or {}).get("departmentId"),
        "batchId": (profile or {}).get("batchId"),
        "batchName": (profile or {}).get("batchName"),
        "trainingModuleId": module["_id"],
        "trainingModuleName": module.get("name"),
        "semesterId": ObjectId(str(semester_id)) if semester_id else None,
        "parameterScores": parameter_scores,
        "rubricScores": rubric_scores,
        "pillarScores": pillar_scores,
        "totalScore": total,
        "maxScore": 100,
        "remarks": remarks,
        "state": state,
        "assessedBy": ctx.user_id,
        "assessedByLabel": ctx.actor_label,
        "completeness": round(len(provided & covered) / len(covered) * 100, 1) if covered else 0,
        "editWindowEndsAt": _now() + timedelta(hours=settings.EVALUATION_EDIT_WINDOW_HOURS),
    }


@router.post("/evaluations", status_code=status.HTTP_201_CREATED)
async def create_evaluation(
    payload: EvaluationRequest, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Save a draft or submit. A submit enqueues recalculation — it never waits for it."""
    student_id = await require_student_in_scope(ctx, payload.studentUserId)
    module = await TrainingModuleRepo(ctx).get(payload.trainingModuleId)
    definitions = await SkillAssessmentDefinitionRepo(ctx).find_all(limit=500)
    if not definitions:
        raise BusinessRuleViolation(
            "No evaluation parameters are configured for your institution yet"
        )

    existing = await SkillAssessmentRepo(ctx).find_one(
        {
            "studentUserId": student_id,
            "trainingModuleId": module["_id"],
            "semesterId": ObjectId(payload.semesterId) if payload.semesterId else None,
            "assessedBy": ctx.user_id,
        }
    )
    if existing and existing.get("state") == "submitted":
        raise Conflict(
            "A submitted evaluation already exists for this participant and module. "
            "Edit it instead."
        )

    document = await _build_evaluation_document(
        ctx,
        student_id=student_id,
        module=module,
        semester_id=payload.semesterId,
        parameter_scores=[p.model_dump() for p in payload.parameterScores],
        rubric_scores=payload.rubricScores,
        remarks=payload.remarks,
        state=payload.state,
        definitions=definitions,
    )

    repo = SkillAssessmentRepo(ctx)
    if existing:
        # Concurrent edits are detected rather than silently merged.
        saved = await repo.update(
            existing["_id"], document, expected_version=payload.expectedVersion
        )
    else:
        saved = await repo.insert(document)

    await AssessmentVersionRepo(ctx).insert(
        {
            "assessmentId": saved["_id"],
            "version": saved.get("version", 1),
            "snapshot": {k: v for k, v in saved.items() if k != "_id"},
            "changedBy": ctx.user_id,
            "changedByLabel": ctx.actor_label,
            "changedAt": _now(),
            "reason": "created" if not existing else "updated",
        }
    )

    if payload.state == "submitted":
        await enqueue(
            "score.recompute",
            {
                "studentUserId": str(student_id),
                "reason": "trainer_evaluation_submitted",
                "trainerUserId": str(ctx.user_id),
                "notifyStudent": True,
            },
        )
        await enqueue(
            "alerts.weak_student",
            {
                "studentUserId": str(student_id),
                "trainerUserId": str(ctx.user_id),
                "notifyHod": True,
            },
            delay=5,
        )

    return {
        "success": True,
        "message": (
            "Evaluation submitted — the readiness score is recalculating in the background."
            if payload.state == "submitted"
            else "Draft saved"
        ),
        "data": serialize(saved),
    }


@router.get("/evaluations/{evaluation_id}")
async def evaluation_detail(evaluation_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    evaluation = await SkillAssessmentRepo(ctx).get(evaluation_id)
    versions = await AssessmentVersionRepo(ctx).find_all(
        {"assessmentId": evaluation["_id"]}, limit=30, sort=[("version", -1)]
    )
    return {
        "success": True,
        "data": {
            **serialize(evaluation),
            "versions": serialize(versions),
            "editable": _within_edit_window(evaluation),
        },
    }


def _within_edit_window(evaluation: dict[str, Any]) -> bool:
    if evaluation.get("state") != "submitted":
        return True
    ends = as_utc(evaluation.get("editWindowEndsAt"))
    return bool(ends and ends >= _now())


@router.patch("/evaluations/{evaluation_id}")
async def update_evaluation(
    evaluation_id: str, payload: EvaluationPatch, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Edits inside the configured window are versioned and trigger a recalculation."""
    repo = SkillAssessmentRepo(ctx)
    evaluation = await repo.get(evaluation_id)
    if evaluation.get("assessedBy") != ctx.user_id and ctx.role is Role.TRAINER:
        raise BusinessRuleViolation("You can only edit evaluations you entered")
    if not _within_edit_window(evaluation):
        raise BusinessRuleViolation(
            f"The {settings.EVALUATION_EDIT_WINDOW_HOURS}-hour edit window for this evaluation "
            "has closed. Ask your administrator to reopen it."
        )

    definitions = await SkillAssessmentDefinitionRepo(ctx).find_all(limit=500)
    patch: dict[str, Any] = {}
    if payload.parameterScores is not None:
        module = await TrainingModuleRepo(ctx).get(evaluation["trainingModuleId"])
        rebuilt = await _build_evaluation_document(
            ctx,
            student_id=evaluation["studentUserId"],
            module=module,
            semester_id=evaluation.get("semesterId"),
            parameter_scores=[p.model_dump() for p in payload.parameterScores],
            rubric_scores=(
                payload.rubricScores
                if payload.rubricScores is not None
                else evaluation.get("rubricScores", [])
            ),
            remarks=payload.remarks if payload.remarks is not None else evaluation.get("remarks"),
            state=payload.state or evaluation.get("state", "draft"),
            definitions=definitions,
        )
        patch.update(rebuilt)
    else:
        if payload.rubricScores is not None:
            patch["rubricScores"] = payload.rubricScores
        if payload.remarks is not None:
            patch["remarks"] = payload.remarks
        if payload.state:
            patch["state"] = payload.state
    if not patch:
        raise ValidationError("Nothing to update")

    saved = await repo.update(
        evaluation["_id"], patch, expected_version=payload.expectedVersion
    )
    await AssessmentVersionRepo(ctx).insert(
        {
            "assessmentId": saved["_id"],
            "version": saved.get("version"),
            "snapshot": {k: v for k, v in saved.items() if k != "_id"},
            "changedBy": ctx.user_id,
            "changedByLabel": ctx.actor_label,
            "changedAt": _now(),
            "reason": payload.editReason or "edited after save",
        }
    )
    if saved.get("state") == "submitted":
        await enqueue(
            "score.recompute",
            {
                "studentUserId": str(saved["studentUserId"]),
                "reason": "trainer_evaluation_edited",
                "trainerUserId": str(ctx.user_id),
                "notifyStudent": True,
            },
        )
    return {
        "success": True,
        "message": "Evaluation updated — the score is recalculating.",
        "data": serialize(saved),
    }


@router.get("/evaluations/{evaluation_id}/versions")
async def evaluation_versions(
    evaluation_id: str, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    evaluation = await SkillAssessmentRepo(ctx).get(evaluation_id)
    versions = await AssessmentVersionRepo(ctx).find_all(
        {"assessmentId": evaluation["_id"]}, limit=50, sort=[("version", -1)]
    )
    return {"success": True, "data": serialize(versions)}


@router.post("/evaluations/{evaluation_id}/submit")
async def submit_evaluation(
    evaluation_id: str, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    repo = SkillAssessmentRepo(ctx)
    evaluation = await repo.get(evaluation_id)
    if evaluation.get("state") == "submitted":
        raise Conflict("This evaluation has already been submitted")
    if (evaluation.get("completeness") or 0) < 60:
        raise BusinessRuleViolation(
            f"This evaluation is only {evaluation.get('completeness')}% complete. "
            "Fill in the remaining parameters before submitting."
        )
    saved = await repo.update(
        evaluation["_id"],
        {
            "state": "submitted",
            "submittedAt": _now(),
            "editWindowEndsAt": _now() + timedelta(hours=settings.EVALUATION_EDIT_WINDOW_HOURS),
        },
    )
    await enqueue(
        "score.recompute",
        {
            "studentUserId": str(saved["studentUserId"]),
            "reason": "trainer_evaluation_submitted",
            "trainerUserId": str(ctx.user_id),
            "notifyStudent": True,
        },
    )
    await enqueue(
        "alerts.weak_student",
        {"studentUserId": str(saved["studentUserId"]), "trainerUserId": str(ctx.user_id),
         "notifyHod": True},
        delay=5,
    )
    return {"success": True, "message": "Evaluation submitted", "data": serialize(saved)}


@router.post("/evaluations/eedi-complete")
async def trainer_complete_eedi_evaluation(
    payload: dict[str, Any],
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Requirements 22, 23, 24: Trainer completes EEDI evaluation with feedback and generates complete report."""
    from app.services.evaluation_report_service import submit_complete_trainer_evaluation

    report = await submit_complete_trainer_evaluation(ctx, payload)
    await write_audit(
        ctx,
        action="create",
        entity_type="evaluation_reports",
        entity_id=ObjectId(report["id"]),
        detail=f"Completed EEDI evaluation report for participant {report.get('studentName')}",
    )
    return {
        "success": True,
        "message": "Evaluation completed and report generated successfully.",
        "data": report,
    }


@router.get("/evaluations/reports/{report_id}")
async def trainer_get_evaluation_report(
    report_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Requirement 26: Evaluating trainer views evaluation report."""
    from app.services.evaluation_report_service import get_evaluation_report

    report = await get_evaluation_report(ctx, report_id)
    return {"success": True, "data": report}



# --------------------------------------------------------------------------- AI review / override
@router.get("/ai-scores")
async def ai_scores(
    reviewState: str = Query("pending", pattern="^(pending|reviewed|all)$"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if reviewState != "all":
        filters["trainerReviewState"] = reviewState
    page_result = await AiScoreRepo(ctx).list(filters=filters, page=page, page_size=pageSize)
    return {"success": True, **page_result.to_response()}


@router.post("/ai-scores/{score_id}/override")
async def override_ai_score(
    score_id: str, payload: AiOverrideRequest, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """A trainer override keeps the original AI result, the override, and the reason.

    That triple is exactly the dataset needed to improve the model later (§12).
    """
    repo = AiScoreRepo(ctx)
    score = await repo.get(score_id)
    await require_student_in_scope(ctx, score["studentUserId"])

    for dimension in payload.dimensions:
        value = dimension.get("score")
        if value is None or not (0 <= float(value) <= 100):
            raise BusinessRuleViolation("Each overridden dimension must score between 0 and 100")

    original = score.get("dimensions", [])
    override = {
        "dimensions": payload.dimensions,
        "reason": payload.reason,
        "by": ctx.user_id,
        "byLabel": ctx.actor_label,
        "at": _now(),
        "originalDimensions": original,
        "originalOverall": score.get("overall"),
    }
    overall = round(
        sum(float(d.get("score", 0)) * float(d.get("weight", 1 / len(payload.dimensions)))
            for d in payload.dimensions),
        1,
    )
    saved = await repo.update(
        score["_id"],
        {
            "trainerOverride": override,
            "trainerReviewState": "reviewed",
            "reviewedBy": ctx.user_id,
            "reviewedAt": _now(),
            "overriddenOverall": overall,
        },
    )
    await get_db().ai_usage_events.insert_one(
        {
            "collegeId": score.get("collegeId"),
            "departmentId": score.get("departmentId"),
            "kind": "trainer_override",
            "studentUserId": score.get("studentUserId"),
            "modelVersion": score.get("modelVersion"),
            "originalOverall": score.get("overall"),
            "overriddenOverall": overall,
            "reason": payload.reason,
            "at": _now(),
        }
    )
    await enqueue(
        "score.recompute",
        {"studentUserId": str(score["studentUserId"]), "reason": "trainer_override"},
    )
    await notify(
        user_id=score["studentUserId"],
        kind=Kind.ASSESSMENT_FEEDBACK,
        title="Your trainer reviewed your practice attempt",
        body=payload.reason[:160],
        href=f"/student/practice/session/{score['practiceSessionId']}/feedback",
        college_id=score.get("collegeId"),
        department_id=score.get("departmentId"),
    )
    return {"success": True, "message": "AI score overridden", "data": serialize(saved)}


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
async def add_feedback(payload: FeedbackRequest, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    student_id = await require_student_in_scope(ctx, payload.studentUserId)
    session = None
    if payload.trainingSessionId:
        session = await require_trainer_session_scope(ctx, payload.trainingSessionId)
    profile = await StudentProfileRepo(ctx).find_one({"userId": student_id})

    saved = await TrainerFeedbackRepo(ctx).insert(
        {
            "studentUserId": student_id,
            "studentName": (profile or {}).get("name"),
            "rollNumber": (profile or {}).get("rollNumber"),
            "trainingSessionId": (session or {}).get("_id"),
            "sessionLabel": (session or {}).get("topic"),
            "trainingModuleName": (session or {}).get("trainingModuleName"),
            "trainerUserId": ctx.user_id,
            "trainerName": ctx.name,
            "batchId": (profile or {}).get("batchId"),
            "rating": payload.rating,
            "feedbackText": payload.feedbackText,
        }
    )
    await notify(
        user_id=student_id,
        kind=Kind.ASSESSMENT_FEEDBACK,
        title="New trainer feedback",
        body=payload.feedbackText[:160],
        href="/student/progress",
        college_id=ctx.college_id,
        department_id=(profile or {}).get("departmentId"),
    )
    return {"success": True, "message": "Feedback recorded", "data": serialize(saved)}


# --------------------------------------------------------------------------- assignments
@router.get("/assignments")
async def assignments(
    batchId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {"trainerUserId": ctx.user_id}
    if batchId:
        filters["batchId"] = await require_trainer_batch_scope(ctx, batchId)
    page_result = await AssignmentRepo(ctx).list(filters=filters, page=page, page_size=pageSize)
    items = []
    for assignment in page_result.items:
        roster = await StudentProfileRepo(ctx).count({"batchId": assignment.get("batchId")})
        submitted = await AssignmentSubmissionRepo(ctx).count(
            {"assignmentId": assignment["_id"]}
        )
        items.append(
            {
                **serialize(assignment),
                "rosterSize": roster,
                "submittedCount": submitted,
                "pendingCount": max(0, roster - submitted),
            }
        )
    response = page_result.to_response()
    response["items"] = items
    return {"success": True, **response}


@router.post("/assignments", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    payload: AssignmentRequest, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    batch_id = await require_trainer_batch_scope(ctx, payload.batchId)
    if payload.dueAt <= _now():
        raise BusinessRuleViolation("The due date must be in the future")
    batch = await BatchRepo(ctx).get(batch_id)
    module = (
        await TrainingModuleRepo(ctx).get(payload.trainingModuleId)
        if payload.trainingModuleId
        else None
    )
    saved = await AssignmentRepo(ctx).insert(
        {
            "title": payload.title,
            "description": payload.description,
            "batchId": batch_id,
            "batchName": batch.get("name"),
            "departmentId": batch.get("departmentId"),
            "trainerUserId": ctx.user_id,
            "trainerName": ctx.name,
            "trainingModuleId": (module or {}).get("_id"),
            "trainingModuleName": (module or {}).get("name"),
            "dueAt": payload.dueAt,
            "maxScore": payload.maxScore,
            "attachments": [],
            "status": "open",
        }
    )
    students = await StudentProfileRepo(ctx).find_all(
        {"batchId": batch_id}, projection={"userId": 1}, limit=1000
    )
    from app.services.notifications import notify_many

    await notify_many(
        [s["userId"] for s in students],
        kind=Kind.ASSIGNMENT_DUE,
        title=f"New assignment: {payload.title}",
        body=f"Due {payload.dueAt:%d %b, %H:%M}",
        href="/student/learning",
        college_id=ctx.college_id,
        department_id=batch.get("departmentId"),
        push=False,
    )
    return {"success": True, "message": "Assignment created", "data": serialize(saved)}


@router.patch("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str, payload: AssignmentPatch, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise ValidationError("Nothing to update")
    saved = await AssignmentRepo(ctx).update(assignment_id, updates)
    return {"success": True, "message": "Assignment updated", "data": serialize(saved)}


@router.get("/assignments/{assignment_id}/submissions")
async def assignment_submissions(
    assignment_id: str, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    assignment = await AssignmentRepo(ctx).get(assignment_id)
    roster = await StudentProfileRepo(ctx).find_all(
        {"batchId": assignment.get("batchId")},
        projection={"userId": 1, "name": 1, "rollNumber": 1},
        limit=1000,
        sort=[("rollNumber", 1)],
    )
    submissions = {
        row["studentUserId"]: row
        for row in await AssignmentSubmissionRepo(ctx).find_all(
            {"assignmentId": assignment["_id"]}, limit=1000
        )
    }
    rows = []
    for profile in roster:
        submission = submissions.get(profile["userId"])
        item = {
            "studentUserId": str(profile["userId"]),
            "name": profile.get("name"),
            "rollNumber": profile.get("rollNumber"),
            "state": "pending" if not submission else submission.get("state", "submitted"),
            "submittedAt": (submission or {}).get("submittedAt"),
            "late": (submission or {}).get("late", False),
            "grade": (submission or {}).get("grade"),
            "remarks": (submission or {}).get("remarks"),
            "note": (submission or {}).get("note"),
            "submissionId": str(submission["_id"]) if submission else None,
            "files": [],
        }
        for attachment in (submission or {}).get("files", []):
            item["files"].append(
                {
                    "filename": attachment.get("filename"),
                    "downloadUrl": await signed_url(
                        attachment["storageKey"], filename=attachment.get("filename")
                    ),
                }
            )
        rows.append(item)
    return {
        "success": True,
        "data": {"assignment": serialize(assignment), "submissions": rows},
    }


@router.patch("/submissions/{submission_id}")
async def review_submission(
    submission_id: str,
    payload: SubmissionReview,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    repo = AssignmentSubmissionRepo(ctx)
    submission = await repo.get(submission_id)
    assignment = await AssignmentRepo(ctx).get(submission["assignmentId"])
    if payload.grade is not None and payload.grade > float(assignment.get("maxScore", 100)):
        raise BusinessRuleViolation(
            f"Grade cannot exceed the assignment maximum of {assignment.get('maxScore')}"
        )
    saved = await repo.update(
        submission["_id"],
        {
            "grade": payload.grade,
            "remarks": payload.remarks,
            "state": payload.state,
            "reviewedBy": ctx.user_id,
            "reviewedAt": _now(),
        },
    )
    await notify(
        user_id=submission["studentUserId"],
        kind=Kind.ASSESSMENT_FEEDBACK,
        title=f"Your submission was reviewed: {assignment.get('title')}",
        body=(payload.remarks or "See your grade and remarks.")[:160],
        href="/student/learning",
        college_id=ctx.college_id,
        department_id=submission.get("departmentId"),
    )
    return {"success": True, "message": "Submission reviewed", "data": serialize(saved)}


# --------------------------------------------------------------------------- progress, alerts, trends
@router.get("/course-progress")
async def course_progress(
    batchId: str | None = Query(None), ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    batch_filter: dict[str, Any] = {}
    if batchId:
        batch_filter["batchId"] = await require_trainer_batch_scope(ctx, batchId)

    modules = await TrainingModuleRepo(ctx).find_all(limit=100)
    module_rows = []
    for module in modules:
        sessions = await TrainingSessionRepo(ctx).count(
            {"trainingModuleId": module["_id"], **batch_filter}
        )
        completed = await TrainingSessionRepo(ctx).count(
            {"trainingModuleId": module["_id"], "status": "completed", **batch_filter}
        )
        assessment = await analytics.assessment_summary(
            ctx, filters={"trainingModuleId": module["_id"], **batch_filter}
        )
        module_rows.append(
            {
                "id": str(module["_id"]),
                "name": module.get("name"),
                "totalSessions": sessions,
                "completedSessions": completed,
                "percent": round(completed / sessions * 100, 1) if sessions else 0.0,
                "averageScore": assessment["average"],
            }
        )

    batches = await BatchRepo(ctx).find_all(limit=50)
    batch_rows = []
    for batch in batches:
        sessions = await TrainingSessionRepo(ctx).count({"batchId": batch["_id"]})
        completed = await TrainingSessionRepo(ctx).count(
            {"batchId": batch["_id"], "status": "completed"}
        )
        batch_rows.append(
            {
                "id": str(batch["_id"]),
                "name": batch.get("name"),
                "percent": round(completed / sessions * 100, 1) if sessions else 0.0,
                "studentCount": await StudentProfileRepo(ctx).count({"batchId": batch["_id"]}),
            }
        )
    return {"success": True, "data": {"modules": module_rows, "batches": batch_rows}}


@router.get("/alerts")
async def alerts(
    resolved: bool = Query(False),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    filters = {"resolvedAt": {"$ne": None} if resolved else None}
    page_result = await WeakStudentAlertRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize
    )
    return {
        "success": True,
        **page_result.to_response(),
        "meta": {"threshold": settings.WEAK_STUDENT_THRESHOLD},
    }


@router.patch("/alerts/{alert_id}")
async def resolve_alert(
    alert_id: str, payload: AlertPatch, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    saved = await WeakStudentAlertRepo(ctx).update(
        alert_id,
        {
            "resolvedAt": _now() if payload.resolved else None,
            "resolvedBy": ctx.user_id if payload.resolved else None,
            "resolutionNote": payload.note,
        },
    )
    return {"success": True, "message": "Alert updated", "data": serialize(saved)}


@router.get("/trends")
async def trends(
    batchId: str | None = Query(None),
    studentId: str | None = Query(None),
    weeks: int = Query(8, ge=1, le=52),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if batchId:
        filters["batchId"] = await require_trainer_batch_scope(ctx, batchId)
    if studentId:
        filters["studentUserId"] = await require_student_in_scope(ctx, studentId)

    student_trend = None
    if studentId:
        score = await EediScoreRepo(ctx).find_one({"studentUserId": filters["studentUserId"]})
        student_trend = [
            {"at": h.get("computedAt"), "score": h.get("finalScore")}
            for h in (score or {}).get("history", [])
            if h.get("finalScore") is not None
        ]

    return {
        "success": True,
        "data": serialize(
            {
                "attendanceTrend": await analytics.attendance_trend(
                    ctx, weeks=weeks, filters=filters
                ),
                "monthlyAttendance": await analytics.attendance_monthly_trend(
                    ctx, filters=filters
                ),
                "moduleScores": await analytics.assessment_by_module(ctx, filters=filters),
                "batchScores": await analytics.assessment_by_batch(ctx, filters=filters),
                "studentTrend": student_trend,
                "pillarAverages": await analytics.department_pillar_averages(ctx),
            }
        ),
    }


# --------------------------------------------------------------------------- reports
@router.post("/reports", status_code=status.HTTP_202_ACCEPTED)
async def create_report(payload: ReportRequest, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    allowed = {"attendance", "assessment", "defaulters", "feedback", "practice", "learning"}
    if payload.reportType not in allowed:
        raise ValidationError(
            f"Trainers can export: {', '.join(sorted(allowed))}"
        )
    from app.services.reports import request_report

    result = await request_report(
        ctx,
        report_type=payload.reportType,
        fmt=payload.format,
        filters=payload.filters,
        force_async=payload.forceAsync,
    )
    return {"success": True, "data": result}


@router.get("/reports")
async def list_reports(
    page: int = Query(1, ge=1), pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    from app.repositories.collections import ReportJobRepo

    page_result = await ReportJobRepo(ctx).list(
        filters={"requestedBy": ctx.user_id}, page=page, page_size=pageSize
    )
    return {"success": True, **page_result.to_response()}


@router.get("/profile")
async def trainer_profile(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    user = await get_db().users.find_one({"_id": ctx.user_id})
    assignments_list = await TrainerAssignmentRepo(ctx).find_all({"active": True}, limit=200)
    sessions_conducted = await TrainingSessionRepo(ctx).count({})
    feedback = await TrainerFeedbackRepo(ctx).aggregate(
        [
            {"$match": {"trainerUserId": ctx.user_id}},
            {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
        ]
    )
    return {
        "success": True,
        "data": {
            "name": (user or {}).get("name"),
            "email": (user or {}).get("email"),
            "designation": (user or {}).get("designation"),
            "departmentName": (user or {}).get("departmentName"),
            "assignments": serialize(assignments_list),
            "sessionsConducted": sessions_conducted,
            "averageFeedback": (
                round(feedback[0]["avg"], 1) if feedback and feedback[0].get("avg") else None
            ),
            "feedbackEntries": feedback[0]["n"] if feedback else 0,
            "access": (user or {}).get("access", {}),
        },
    }


# --------------------------------------------------------------------------- E-Books
@router.get("/ebooks")
async def trainer_list_ebooks(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    # Return ebooks authored by this trainer or published
    query = {"$or": [{"uploadedBy": ctx.user_id}, {"collegeId": ctx.college_id, "published": True}]}
    books = await get_db().ebooks.find(query).sort("createdAt", -1).to_list(100)

    items = []
    for b in books:
        cover_url = None
        if b.get("coverKey"):
            cover_url = await signed_url(b["coverKey"], ttl=3600)
        items.append({
            "id": str(b["_id"]),
            "title": b.get("title"),
            "author": b.get("author"),
            "description": b.get("description"),
            "category": b.get("category"),
            "coverUrl": cover_url,
            "pageCount": b.get("pageCount", 120),
            "courseTitle": b.get("courseTitle"),
            "published": b.get("published", False),
            "status": b.get("status", "PUBLISHED" if b.get("published") else "DRAFT"),
            "rejectionReason": b.get("rejectionReason"),
            "readsCount": b.get("readsCount", 0),
            "completionsCount": b.get("completionsCount", 0),
            "isOwner": b.get("uploadedBy") == ctx.user_id,
            "createdAt": b.get("createdAt").isoformat() if b.get("createdAt") else None,
        })
    return {"success": True, "data": items}


@router.post("/ebooks")
async def trainer_create_ebook(
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form("General"),
    author: str = Form(""),
    tags: str = Form(""),
    courseId: str | None = Form(None),
    visibility: str = Form("PUBLIC"),
    file: UploadFile | None = File(None),
    cover: UploadFile | None = File(None),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    from app.services.ebook_service import validate_pdf_bytes, extract_cover_from_pdf, slugify
    from app.services.storage import Keys, get_storage

    if not title.strip():
        raise ValidationError("Title is required.")

    course_id = ObjectId(courseId) if courseId else None
    course = await get_db().courses.find_one({"_id": course_id}) if course_id else None

    now = _now()
    ebook_id = ObjectId()
    str_id = str(ebook_id)
    storage = get_storage()

    page_count = 100
    file_size = 5 * 1024 * 1024
    pdf_key = Keys.ebook_file(str_id, f"{slugify(title)}.pdf")
    cover_key = None

    if file and file.filename:
        pdf_bytes = await file.read()
        page_count, file_size = validate_pdf_bytes(pdf_bytes)
        await storage.put(pdf_key, pdf_bytes, "application/pdf")

        if cover and cover.size and cover.size > 0:
            c_bytes = await cover.read()
            cover_key = Keys.ebook_cover(str_id, "cover.jpg")
            await storage.put(cover_key, c_bytes, "image/jpeg")
        else:
            extracted = extract_cover_from_pdf(pdf_bytes)
            if extracted:
                cover_key = Keys.ebook_cover(str_id, "cover.jpg")
                await storage.put(cover_key, extracted, "image/jpeg")
    else:
        pdf_key = Keys.ebook_file("default", "book.pdf")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    doc = {
        "_id": ebook_id,
        "slug": f"{slugify(title)}-{str_id[-6:]}",
        "collegeId": ctx.college_id,
        "departmentId": list(ctx.department_ids)[0] if ctx.department_ids else None,
        "uploadedBy": ctx.user_id,
        "uploaderRole": "TRAINER",
        "author": author.strip() or ctx.name or "Faculty",
        "title": title.strip(),
        "description": description.strip(),
        "shortDescription": description.strip()[:140] + ("..." if len(description.strip()) > 140 else ""),
        "category": category.strip() or "General",
        "courseId": course_id,
        "courseTitle": course.get("title") if course else None,
        "coverKey": cover_key,
        "fileKey": pdf_key,
        "fileSizeBytes": file_size,
        "pageCount": page_count,
        "tags": tag_list,
        "status": "DRAFT",
        "published": False,
        "visibility": visibility,
        "isFeatured": False,
        "isPinned": False,
        "displayOrder": 0,
        "allowDownload": False,
        "readsCount": 0,
        "completionsCount": 0,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }
    res = await get_db().ebooks.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"success": True, "data": serialize(doc), "message": "eBook created successfully as Draft."}


@router.post("/ebooks/{ebook_id}/request-publish")
async def trainer_request_publish(
    ebook_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    book = await db.ebooks.find_one({"_id": oid, "uploadedBy": ctx.user_id, "deletedAt": None})
    if not book:
        raise NotFound("eBook not found.")

    now = _now()
    message = str(payload.get("message", "")).strip()

    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"status": "PENDING_REVIEW", "updatedAt": now}},
    )

    req_doc = {
        "ebookId": oid,
        "ebookTitle": book.get("title"),
        "requestedBy": ctx.user_id,
        "requesterName": ctx.name or "Trainer",
        "requesterRole": "TRAINER",
        "collegeId": ctx.college_id,
        "requestMessage": message,
        "status": "PENDING",
        "createdAt": now,
        "updatedAt": now,
    }
    await db.ebook_publish_requests.insert_one(req_doc)
    return {"success": True, "message": "eBook publication requested for Super Admin review."}


@router.get("/ebooks/{ebook_id}")
async def trainer_get_ebook(ebook_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if not ObjectId.is_valid(ebook_id):
        raise NotFound("E-Book not found.")
    oid = ObjectId(ebook_id)
    book = await get_db().ebooks.find_one({"_id": oid})
    if not book:
        raise NotFound("E-Book not found.")

    cover_url = None
    if book.get("coverKey"):
        cover_url = await signed_url(book["coverKey"], ttl=3600)

    file_url = None
    if book.get("fileKey"):
        file_url = await signed_url(book["fileKey"], ttl=3600)

    return {
        "success": True,
        "data": {
            "id": str(book["_id"]),
            "title": book.get("title"),
            "author": book.get("author"),
            "description": book.get("description"),
            "category": book.get("category"),
            "coverUrl": cover_url,
            "fileUrl": file_url,
            "pageCount": book.get("pageCount", 100),
            "courseTitle": book.get("courseTitle"),
            "published": book.get("published", False),
            "readsCount": book.get("readsCount", 0),
            "completionsCount": book.get("completionsCount", 0),
            "tags": book.get("tags", []),
            "isOwner": book.get("uploadedBy") == ctx.user_id,
        },
    }


@router.patch("/ebooks/{ebook_id}")
async def trainer_update_ebook(ebook_id: str, payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    oid = ObjectId(ebook_id)
    book = await get_db().ebooks.find_one({"_id": oid})
    if not book:
        raise NotFound("E-Book not found.")

    if book.get("uploadedBy") != ctx.user_id and not ctx.is_platform_wide:
        raise ScopeForbidden("You cannot edit another trainer's e-book.")

    allowed = {"title", "author", "description", "category", "published", "tags", "courseTitle"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    updates["updatedAt"] = _now()

    await get_db().ebooks.update_one({"_id": oid}, {"$set": updates})
    return {"success": True, "message": "E-Book updated"}


@router.delete("/ebooks/{ebook_id}")
async def trainer_delete_ebook(ebook_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    oid = ObjectId(ebook_id)
    book = await get_db().ebooks.find_one({"_id": oid})
    if not book:
        raise NotFound("E-Book not found.")

    if book.get("uploadedBy") != ctx.user_id and not ctx.is_platform_wide:
        raise ScopeForbidden("You cannot delete another trainer's e-book.")

    await get_db().ebooks.update_one({"_id": oid}, {"$set": {"deletedAt": _now(), "published": False}})
    return {"success": True, "message": "E-Book archived"}


# --------------------------------------------------------------------------- Mentor Chat
@router.get("/chat/students")
async def trainer_list_chat_students(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    students = await chat_service.get_authorized_students_for_trainer(ctx.user_id, ctx.college_id)
    return {"success": True, "data": students}


@router.get("/chat/conversations")
async def trainer_list_conversations(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    convs = await get_db().conversations.find({"trainerUserId": ctx.user_id, "collegeId": ctx.college_id}).sort("lastMessageAt", -1).to_list(100)
    return {"success": True, "data": serialize(convs)}


@router.post("/chat/conversations/start")
async def trainer_start_conversation(payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    student_id = ObjectId(payload["studentUserId"])
    conv = await chat_service.get_or_create_conversation(student_id, ctx.user_id, ctx.college_id)
    return {"success": True, "data": serialize(conv)}


@router.get("/chat/conversations/{conv_id}/messages")
async def trainer_get_chat_messages(conv_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    cid = ObjectId(conv_id)
    conv = await get_db().conversations.find_one({"_id": cid, "trainerUserId": ctx.user_id})
    if not conv:
        raise NotFound("Conversation not found.")

    msgs = await get_db().messages.find({"conversationId": cid}).sort("createdAt", 1).limit(200).to_list(200)
    await chat_service.mark_conversation_read(cid, ctx.user_id, "TRAINER")
    return {"success": True, "data": serialize(msgs)}


@router.post("/chat/conversations/{conv_id}/messages")
async def trainer_send_chat_message(conv_id: str, payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    cid = ObjectId(conv_id)
    msg = await chat_service.send_chat_message(cid, ctx.user_id, "TRAINER", payload.get("message", ""))
    return {"success": True, "data": msg}


@router.post("/chat/conversations/{conv_id}/read")
async def trainer_mark_chat_read(conv_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    cid = ObjectId(conv_id)
    await chat_service.mark_conversation_read(cid, ctx.user_id, "TRAINER")
    return {"success": True}


# --------------------------------------------------------------------------- Games
@router.get("/games")
async def trainer_list_games(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    games = await get_db().game_definitions.find({"published": True}).to_list(100)
    assigned = await get_db().game_assignments.find({"trainerUserId": ctx.user_id}).to_list(100)
    assigned_codes = {a["gameCode"] for a in assigned}

    out = []
    for g in games:
        out.append({
            "id": str(g["_id"]),
            "code": g.get("code"),
            "title": g.get("title"),
            "description": g.get("description"),
            "category": g.get("category"),
            "difficulty": g.get("difficulty"),
            "xpReward": g.get("xpReward", 50),
            "isAssigned": g.get("code") in assigned_codes,
            "skillMap": g.get("skillMap", []),
        })
    return {"success": True, "data": out}


@router.get("/games/analytics")
async def trainer_game_analytics(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    attempts = await get_db().game_attempts.find({"collegeId": ctx.college_id}).limit(500).to_list(500)
    total_attempts = len(attempts)
    total_xp = sum(a.get("xpEarned", 0) for a in attempts)
    avg_score = round(sum(a.get("score", 0) for a in attempts) / total_attempts, 1) if total_attempts else 0.0

    by_category: dict[str, list[float]] = {}
    for a in attempts:
        cat = a.get("category", "General")
        by_category.setdefault(cat, []).append(a.get("score", 0))

    cat_stats = [
        {"category": cat, "averageScore": round(sum(scores)/len(scores), 1), "attempts": len(scores)}
        for cat, scores in by_category.items()
    ]

    # Weak skill areas: categories where avg score < 70
    weak_areas = [c["category"] for c in cat_stats if c["averageScore"] < 70]

    return {
        "success": True,
        "data": {
            "totalAttempts": total_attempts,
            "totalXpEarned": total_xp,
            "averageScore": avg_score,
            "categoryPerformance": cat_stats,
            "weakAreas": weak_areas or ["Problem Solving", "Grammar under pressure"],
        },
    }


@router.post("/games/assign")
async def trainer_assign_game(payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    game_code = payload.get("gameCode")
    batch_id = ObjectId(payload["batchId"]) if payload.get("batchId") else None
    if not game_code:
        raise ValidationError("gameCode is required.")

    now = _now()
    doc = {
        "trainerUserId": ctx.user_id,
        "collegeId": ctx.college_id,
        "batchId": batch_id,
        "gameCode": game_code,
        "deadline": payload.get("deadline"),
        "note": payload.get("note", "Assigned challenge"),
        "createdAt": now,
    }
    await get_db().game_assignments.insert_one(doc)
    return {"success": True, "message": f"Game {game_code} assigned to batch."}


# --------------------------------------------------------------------------- Payments
@router.get("/payments")
async def trainer_list_payments(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    # Return course payments related to this college
    payments = await get_db().payments.find({"collegeId": ctx.college_id}).sort("createdAt", -1).limit(100).to_list(100)
    out = [
        {
            "id": str(p["_id"]),
            "studentName": p.get("studentName", "Participant"),
            "studentEmail": p.get("studentEmail"),
            "courseTitle": p.get("courseTitle", "Course"),
            "amount": p.get("amount", 0.0),
            "currency": p.get("currency", "INR"),
            "status": p.get("status", "completed"),
            "transactionId": p.get("transactionId"),
            "invoiceNumber": p.get("invoiceNumber"),
            "paidAt": p.get("createdAt").isoformat() if p.get("createdAt") else None,
        }
        for p in payments
    ]
    return {"success": True, "data": out}

