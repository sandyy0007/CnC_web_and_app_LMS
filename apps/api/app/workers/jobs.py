"""Background job handlers.

The critical rule from the requirements: **AI processing never blocks a database save**. A trainer
submitting an evaluation, or a student finishing a recording, returns immediately; the scoring,
transcription and recomputation happen here.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.config import settings
from app.core.logging import get_logger
from app.db.mongo import get_db
from app.services import certificates as cert_service
from app.services import reports as report_service
from app.services import scoring
from app.services.ai_provider import get_evaluation_provider, get_stt_provider
from app.services.notifications import Kind, notify, notify_department_hod
from app.workers.queue import job_handler

log = get_logger("app.jobs")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _system_context(*, college_id: Any = None, department_id: Any = None) -> ScopeContext:
    """A platform-wide context for jobs that legitimately act on behalf of the system."""
    return ScopeContext(
        user_id=ObjectId("000000000000000000000000"),
        role=Role.SUPER_ADMIN,
        college_id=ObjectId(str(college_id)) if college_id else None,
        department_id=ObjectId(str(department_id)) if department_id else None,
        session_id="system",
        request_id="system-job",
        name="System",
        email="system@eedilms.app",
    )


# --------------------------------------------------------------------------- scoring
@job_handler("score.recompute")
async def recompute_score(payload: dict[str, Any]) -> None:
    """Recalculate one student's EEDI score, refresh their recommendation, re-check certificate."""
    student_id = payload.get("studentUserId")
    if not student_id:
        return
    reason = payload.get("reason", "recalculation")
    result = await scoring.recompute_eedi_score(student_id, reason=reason)
    if result.get("skipped"):
        return
    await scoring.refresh_recommendation(student_id)
    await cert_service.recompute_for_student(student_id, reason=reason)

    if payload.get("notifyStudent"):
        await notify(
            user_id=student_id,
            kind=Kind.ASSESSMENT_FEEDBACK,
            title="Your EEDI readiness score was updated",
            body=(
                f"New score: {result.get('finalScore')}/100"
                + (f" ({result['delta']:+} vs last)" if result.get("delta") else "")
            ),
            href="/student/progress",
            college_id=result.get("collegeId"),
            department_id=result.get("departmentId"),
        )


@job_handler("score.recompute:on_dead")
async def recompute_score_failed(payload: dict[str, Any]) -> None:
    """A failed recalculation must be visible, not silent (§31)."""
    student_id = (
        ObjectId(str(payload["studentUserId"])) if payload.get("studentUserId") else None
    )
    # System events are read back per institution, so the row carries the institution it
    # concerns rather than relying on an unscoped read to find it.
    owner = (
        await get_db().users.find_one(
            {"_id": student_id}, {"collegeId": 1, "departmentId": 1}
        )
        if student_id
        else None
    ) or {}
    await get_db().system_events.insert_one(
        {
            "kind": "score_recompute_failed",
            "studentUserId": student_id,
            "collegeId": owner.get("collegeId"),
            "departmentId": owner.get("departmentId"),
            "detail": payload.get("error", "unknown error"),
            "at": _now(),
        }
    )
    if payload.get("trainerUserId"):
        await notify(
            user_id=payload["trainerUserId"],
            kind=Kind.SECURITY,
            title="Score recalculation failed",
            body="A submitted evaluation was saved, but its score recalculation failed. "
                 "The evaluation is safe — support has been notified.",
            href="/trainer/evaluations",
        )


@job_handler("score.recompute_batch")
async def recompute_batch(payload: dict[str, Any]) -> None:
    """Fan a recalculation out over a batch (e.g. after a scoring-weight change)."""
    db = get_db()
    query: dict[str, Any] = {"deletedAt": None}
    if payload.get("batchId"):
        query["batchId"] = ObjectId(str(payload["batchId"]))
    if payload.get("departmentId"):
        query["departmentId"] = ObjectId(str(payload["departmentId"]))
    if payload.get("collegeId"):
        query["collegeId"] = ObjectId(str(payload["collegeId"]))
    students = await db.student_profiles.find(query, {"userId": 1}).to_list(length=20000)

    from app.workers.queue import enqueue

    for student in students:
        await enqueue(
            "score.recompute",
            {"studentUserId": str(student["userId"]), "reason": payload.get("reason", "batch_recalculation")},
        )
    log.info("batch_recompute_fanned_out", extra={"count": len(students)})


# --------------------------------------------------------------------------- practice / AI
@job_handler("practice.process")
async def process_practice_session(payload: dict[str, Any]) -> None:
    """Transcribe → evaluate → persist evidence-backed score → recommend → notify."""
    session_id = ObjectId(str(payload["sessionId"]))
    db = get_db()
    session = await db.practice_sessions.find_one({"_id": session_id})
    if not session:
        log.warning("practice_session_missing", extra={"session": str(session_id)})
        return

    started = _now()
    await db.practice_sessions.update_one(
        {"_id": session_id}, {"$set": {"state": "transcribing", "updatedAt": _now()}}
    )

    question = (session.get("questions") or [{}])[0].get("text", "") or session.get("prompt", "")
    hint = f"{session.get('kind', '')} {session.get('practiceModeCode', '')}"

    existing = await db.transcripts.find_one({"practiceSessionId": session_id})
    if existing and existing.get("provider") == "student_submitted":
        # A written practice mode submits text directly. Speech-to-text must never overwrite
        # what the student actually wrote.
        from app.services.ai_provider import Transcript, TranscriptSegment

        transcript = Transcript(
            text=existing.get("text", ""),
            segments=[
                TranscriptSegment(
                    start=float(s.get("start", 0)), end=float(s.get("end", 0)), text=s.get("text", "")
                )
                for s in existing.get("segments", [])
            ],
            language=existing.get("language", "en"),
            provider="student_submitted",
        )
    else:
        recording = await db.recordings.find_one(
            {"practiceSessionId": session_id}, sort=[("createdAt", -1)]
        )
        audio = b""
        if recording and recording.get("storageKey"):
            from app.services.storage import get_storage

            try:
                audio = await get_storage().get(recording["storageKey"])
            except Exception as exc:
                log.warning("recording_unreadable", extra={"error": str(exc)})

        transcript = await get_stt_provider().transcribe(
            audio, content_type=(recording or {}).get("contentType", "audio/webm"), hint=hint
        )
        await db.transcripts.update_one(
            {"practiceSessionId": session_id},
            {
                "$set": {
                    "practiceSessionId": session_id,
                    "studentUserId": session["studentUserId"],
                    "collegeId": session.get("collegeId"),
                    "departmentId": session.get("departmentId"),
                    "provider": transcript.provider,
                    "language": transcript.language,
                    "text": transcript.text,
                    "segments": [
                        {"start": s.start, "end": s.end, "text": s.text}
                        for s in transcript.segments
                    ],
                    "wordCount": transcript.word_count,
                    "updatedAt": _now(),
                },
                "$setOnInsert": {"createdAt": _now(), "deletedAt": None},
            },
            upsert=True,
        )

    await db.practice_sessions.update_one(
        {"_id": session_id}, {"$set": {"state": "scoring", "updatedAt": _now()}}
    )

    previous = await db.ai_scores.find_one(
        {"studentUserId": session["studentUserId"], "practiceModeId": session.get("practiceModeId")},
        sort=[("createdAt", -1)],
    )
    evaluation = await get_evaluation_provider().evaluate(
        transcript=transcript,
        question=question,
        kind=session.get("kind", "interview"),
        previous_overall=(previous or {}).get("overall"),
    )

    document = evaluation.to_document()
    document.update(
        {
            "practiceSessionId": session_id,
            "studentUserId": session["studentUserId"],
            "collegeId": session.get("collegeId"),
            "departmentId": session.get("departmentId"),
            "practiceModeId": session.get("practiceModeId"),
            "question": question,
            "previousOverall": (previous or {}).get("overall"),
            "delta": (
                evaluation.overall - previous["overall"] if previous and previous.get("overall") is not None else None
            ),
            "trainerReviewState": "pending",
            "trainerOverride": None,
            "updatedAt": _now(),
        }
    )
    await db.ai_scores.update_one(
        {"practiceSessionId": session_id},
        {"$set": document, "$setOnInsert": {"createdAt": _now(), "deletedAt": None}},
        upsert=True,
    )
    await db.practice_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "state": "scored",
                "overallScore": evaluation.overall,
                "scoredAt": _now(),
                "completedAt": session.get("completedAt") or _now(),
                "updatedAt": _now(),
            }
        },
    )

    latency = int((_now() - started).total_seconds() * 1000)
    await db.ai_usage_events.insert_one(
        {
            "collegeId": session.get("collegeId"),
            "departmentId": session.get("departmentId"),
            "studentUserId": session["studentUserId"],
            "kind": "practice_evaluation",
            "provider": evaluation.provider,
            "modelVersion": evaluation.modelVersion,
            "latencyMs": latency,
            "tokens": transcript.word_count * 2,
            "failed": False,
            "at": _now(),
        }
    )

    from app.workers.queue import enqueue

    await enqueue(
        "score.recompute",
        {"studentUserId": str(session["studentUserId"]), "reason": "practice_session_scored"},
    )
    await notify(
        user_id=session["studentUserId"],
        kind=Kind.ASSESSMENT_FEEDBACK,
        title="Your AI feedback is ready",
        body=f"{session.get('practiceModeTitle', 'Practice session')} scored "
             f"{evaluation.overall}/100 — see the evidence-backed breakdown.",
        href=f"/student/practice/session/{session_id}/feedback",
        college_id=session.get("collegeId"),
        department_id=session.get("departmentId"),
    )
    log.info(
        "practice_session_scored",
        extra={"session": str(session_id), "overall": evaluation.overall, "latency_ms": latency},
    )


@job_handler("practice.process:on_dead")
async def practice_failed(payload: dict[str, Any]) -> None:
    session_id = payload.get("sessionId")
    if not session_id:
        return
    db = get_db()
    await db.practice_sessions.update_one(
        {"_id": ObjectId(str(session_id))},
        {"$set": {"state": "failed", "error": payload.get("error", "")[:300], "updatedAt": _now()}},
    )
    session = await db.practice_sessions.find_one({"_id": ObjectId(str(session_id))})
    if session:
        await db.ai_usage_events.insert_one(
            {
                "collegeId": session.get("collegeId"),
                "kind": "practice_evaluation",
                "failed": True,
                "at": _now(),
            }
        )
        await notify(
            user_id=session["studentUserId"],
            kind=Kind.SECURITY,
            title="We couldn't score that attempt",
            body="Your recording is saved. Please try submitting it again — if it keeps "
                 "failing, your trainer can review the attempt manually.",
            href="/student/practice",
        )


# --------------------------------------------------------------------------- reports
@job_handler("report.generate")
async def generate_report(payload: dict[str, Any]) -> None:
    job_id = ObjectId(str(payload["jobId"]))
    db = get_db()
    job = await db.report_jobs.find_one({"_id": job_id})
    if not job:
        return
    await db.report_jobs.update_one(
        {"_id": job_id}, {"$set": {"status": report_service.PROCESSING, "updatedAt": _now()}}
    )

    requester = None
    if settings.USE_POSTGRES:
        from app.repositories.user_repo import UserRepository
        try:
            pg_u = await UserRepository.get_by_id(str(job["requestedBy"]))
            if pg_u:
                requester = {
                    "_id": str(pg_u["id"]),
                    "name": pg_u["name"],
                    "email": pg_u["email"],
                    "role": pg_u["role"],
                    "collegeId": str(pg_u["institution_id"]) if pg_u.get("institution_id") else None,
                    "departmentId": str(pg_u["department_id"]) if pg_u.get("department_id") else None,
                }
        except Exception:
            pass
    if not requester:
        requester = await db.users.find_one({"_id": job["requestedBy"]})
    if not requester:
        await report_service.mark_failed(job_id, "The requesting account no longer exists")
        return

    # Rebuild the requester's scope so the async export sees exactly what they could see.
    ctx = ScopeContext(
        user_id=requester["_id"],
        role=Role(requester["role"]),
        college_id=requester.get("collegeId"),
        department_id=requester.get("departmentId"),
        session_id="worker",
        request_id=f"job-{job_id}",
        name=requester.get("name"),
        email=requester.get("email"),
    )
    if ctx.role is Role.TRAINER:
        if settings.USE_POSTGRES:
            from app.db.postgres import get_pg_connection
            async with get_pg_connection() as conn:
                t_rows = await conn.fetch(
                    "SELECT batch_id FROM batch_trainers WHERE trainer_user_id = $1::uuid",
                    str(ctx.user_id),
                )
                b_ids = tuple(str(r["batch_id"]) for r in t_rows if r.get("batch_id"))
                ctx = ScopeContext(
                    **{
                        **ctx.__dict__,
                        "batch_ids": b_ids,
                    }
                )
        else:
            rows = await db.trainer_assignments.find(
                {"trainerUserId": ctx.user_id, "active": True}, {"batchId": 1, "departmentId": 1}
            ).to_list(length=500)
            ctx = ScopeContext(
                **{
                    **ctx.__dict__,
                    "batch_ids": tuple({r["batchId"] for r in rows if r.get("batchId")}),
                    "department_ids": tuple({r["departmentId"] for r in rows if r.get("departmentId")}),
                }
            )

    columns, data_rows, title = await report_service.build_dataset(
        ctx, job["reportType"], job.get("filters", {})
    )
    result = await report_service._finalise(
        ctx, job_id, job["reportType"], job["format"], job.get("filters", {}), columns, data_rows, title
    )
    await notify(
        user_id=ctx.user_id,
        kind=Kind.REPORT_READY,
        title="Your export is ready",
        body=f"{title} · {result['rowCount']} row(s) · {job['format'].upper()}",
        href="/reports",
        college_id=ctx.college_id,
        department_id=ctx.department_id,
        metadata={"exportId": result["exportId"], "jobId": str(job_id)},
    )


@job_handler("report.generate:on_dead")
async def report_failed(payload: dict[str, Any]) -> None:
    job_id = payload.get("jobId")
    if not job_id:
        return
    await report_service.mark_failed(job_id, payload.get("error", "generation failed"))
    job = await get_db().report_jobs.find_one({"_id": ObjectId(str(job_id))})
    if job:
        await notify(
            user_id=job["requestedBy"],
            kind=Kind.REPORT_FAILED,
            title="Export failed",
            body=f"The {job.get('reportType')} export could not be generated. Please retry.",
            href="/reports",
            college_id=job.get("collegeId"),
            department_id=job.get("departmentId"),
        )


# --------------------------------------------------------------------------- certificates & alerts
@job_handler("certificate.recompute")
async def recompute_certificate(payload: dict[str, Any]) -> None:
    student_id = payload.get("studentUserId")
    if not student_id:
        return
    result = await cert_service.recompute_for_student(student_id, reason=payload.get("reason", "data_change"))
    if result.get("eligibilityMet") and result.get("status") == cert_service.PENDING:
        await notify_department_hod(
            college_id=result.get("collegeId"),
            department_id=result.get("departmentId"),
            kind=Kind.CERTIFICATE_ELIGIBILITY,
            title="Certificate awaiting issuance",
            body=f"{result.get('studentName')} now meets both thresholds "
                 f"({result.get('attendancePct')}% attendance, {result.get('avgScore')}/100).",
            href="/hod/certificates",
        )


@job_handler("alerts.weak_student")
async def weak_student_alert(payload: dict[str, Any]) -> None:
    """Threshold-based weak-student detection, with an optional HOD notification (§11)."""
    student_id = ObjectId(str(payload["studentUserId"]))
    db = get_db()
    weak = await scoring.detect_weak_pillars(student_id, threshold=payload.get("threshold"))
    if not weak:
        return
    profile = await db.student_profiles.find_one({"userId": student_id})
    if not profile:
        return
    worst = weak[0]
    await db.weak_student_alerts.update_one(
        {"studentUserId": student_id, "pillar": worst["pillar"], "resolvedAt": None},
        {
            "$set": {
                "studentUserId": student_id,
                "studentName": profile.get("name"),
                "rollNumber": profile.get("rollNumber"),
                "collegeId": profile.get("collegeId"),
                "departmentId": profile.get("departmentId"),
                "batchId": profile.get("batchId"),
                "trainerUserId": payload.get("trainerUserId"),
                "pillar": worst["pillar"],
                "pillarLabel": worst["pillarLabel"],
                "score": worst["score"],
                "threshold": worst["threshold"],
                "remark": payload.get("remark")
                or f"{worst['pillarLabel']} is at {worst['score']}/100, below the "
                   f"{worst['threshold']} threshold. Targeted practice recommended.",
                "weakPillars": weak,
                "updatedAt": _now(),
            },
            "$setOnInsert": {"createdAt": _now(), "resolvedAt": None, "deletedAt": None, "version": 1},
        },
        upsert=True,
    )
    if payload.get("notifyHod"):
        await notify_department_hod(
            college_id=profile.get("collegeId"),
            department_id=profile.get("departmentId"),
            kind=Kind.LOW_ASSESSMENT_SCORE,
            title="Low assessment score flagged",
            body=f"{profile.get('name')} ({profile.get('rollNumber')}): "
                 f"{worst['pillarLabel']} at {worst['score']}/100.",
            href="/hod/assessments",
        )


@job_handler("attendance.defaulter_scan")
async def defaulter_scan(payload: dict[str, Any]) -> None:
    """Scan every department for newly-crossed attendance thresholds and alert its HOD (FR-14)."""
    db = get_db()
    departments = await db.departments.find({"deletedAt": None}).to_list(length=1000)
    from app.services import analytics

    for department in departments:
        ctx = await _system_context(
            college_id=department["collegeId"], department_id=department["_id"]
        )
        ctx = ScopeContext(**{**ctx.__dict__, "role": Role.HOD})
        flagged = await analytics.attendance_defaulters(ctx)
        if not flagged:
            continue
        await db.system_events.insert_one(
            {
                "kind": "defaulter_scan",
                "collegeId": department["collegeId"],
                "departmentId": department["_id"],
                "count": len(flagged),
                "threshold": settings.ATTENDANCE_DEFAULTER_THRESHOLD,
                "at": _now(),
            }
        )
        await notify_department_hod(
            college_id=department["collegeId"],
            department_id=department["_id"],
            kind=Kind.ATTENDANCE_DEFAULTER,
            title=f"{len(flagged)} attendance defaulter(s) in {department.get('name')}",
            body=f"Participants below the {settings.ATTENDANCE_DEFAULTER_THRESHOLD}% threshold "
                 "need review.",
            href="/hod/attendance",
        )


@job_handler("notifications.class_reminder")
async def class_reminder(payload: dict[str, Any]) -> None:
    """Remind a batch about a live class starting soon."""
    db = get_db()
    window_end = _now() + timedelta(hours=int(payload.get("withinHours", 24)))
    classes = await db.live_classes.find(
        {"startsAt": {"$gte": _now(), "$lte": window_end}, "reminderSentAt": None, "deletedAt": None}
    ).to_list(length=500)
    for live in classes:
        students = await db.student_profiles.find(
            {"batchId": live.get("batchId"), "deletedAt": None}, {"userId": 1}
        ).to_list(length=5000)
        for student in students:
            await notify(
                user_id=student["userId"],
                kind=Kind.CLASS_REMINDER,
                title=f"Upcoming: {live.get('title')}",
                body=f"{live.get('trainerName', 'Your trainer')} · "
                     f"{live['startsAt']:%d %b, %H:%M}",
                href="/student/live-classes",
                college_id=live.get("collegeId"),
                department_id=live.get("departmentId"),
                push=False,
            )
        await db.live_classes.update_one(
            {"_id": live["_id"]}, {"$set": {"reminderSentAt": _now()}}
        )


@job_handler("notifications.assignment_due")
async def assignment_due(payload: dict[str, Any]) -> None:
    db = get_db()
    horizon = _now() + timedelta(days=int(payload.get("withinDays", 2)))
    assignments = await db.assignments.find(
        {"dueAt": {"$gte": _now(), "$lte": horizon}, "deletedAt": None, "reminderSentAt": None}
    ).to_list(length=500)
    for assignment in assignments:
        submitted = set(
            await db.assignment_submissions.distinct(
                "studentUserId", {"assignmentId": assignment["_id"]}
            )
        )
        students = await db.student_profiles.find(
            {"batchId": assignment.get("batchId"), "deletedAt": None}, {"userId": 1}
        ).to_list(length=5000)
        for student in students:
            if student["userId"] in submitted:
                continue
            await notify(
                user_id=student["userId"],
                kind=Kind.ASSIGNMENT_DUE,
                title=f"Due soon: {assignment.get('title')}",
                body=f"Submit by {assignment['dueAt']:%d %b, %H:%M}",
                href="/student/learning",
                college_id=assignment.get("collegeId"),
                department_id=assignment.get("departmentId"),
                push=False,
            )
        await db.assignments.update_one(
            {"_id": assignment["_id"]}, {"$set": {"reminderSentAt": _now()}}
        )
