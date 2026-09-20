"""Index definitions.

Every scoped listing is served by a compound index whose LEADING fields are the tenant keys
(collegeId, departmentId, ...). This is the MongoDB substitute for the PostgreSQL RLS backstop
described in the HOD SRS: an unscoped query cannot use these indexes, so scope drift shows up as
both a policy violation and a slow query.
"""
from __future__ import annotations

from pymongo import ASCENDING as ASC
from pymongo import DESCENDING as DESC
from pymongo import IndexModel

from app.core.logging import get_logger

log = get_logger("app.indexes")

INDEXES: dict[str, list[IndexModel]] = {
    "colleges": [IndexModel([("code", ASC)], unique=True, name="uq_college_code")],
    "departments": [
        IndexModel([("collegeId", ASC), ("code", ASC)], unique=True, name="uq_dept_code"),
        IndexModel([("collegeId", ASC), ("status", ASC)], name="ix_dept_scope"),
        IndexModel([("hodUserId", ASC)], name="ix_dept_hod", sparse=True),
    ],
    "semesters": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("number", ASC)], name="ix_sem_scope"),
    ],
    "batches": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("status", ASC)], name="ix_batch_scope"),
        IndexModel([("collegeId", ASC), ("code", ASC)], unique=True, name="uq_batch_code"),
    ],
    "users": [
        IndexModel([("email", ASC)], unique=True, name="uq_user_email"),
        IndexModel([("institutionId", ASC)], unique=True, sparse=True, name="uq_user_institution_id"),
        IndexModel([("collegeId", ASC), ("role", ASC), ("status", ASC)], name="ix_user_scope"),
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("role", ASC)], name="ix_user_dept"),
    ],
    "student_profiles": [
        IndexModel([("userId", ASC)], unique=True, name="uq_profile_user"),
        IndexModel([("collegeId", ASC), ("rollNumber", ASC)], unique=True, name="uq_roll_per_college"),
        IndexModel(
            [("collegeId", ASC), ("departmentId", ASC), ("batchId", ASC)], name="ix_profile_scope"
        ),
    ],
    "trainer_assignments": [
        IndexModel([("trainerUserId", ASC), ("active", ASC)], name="ix_assign_trainer"),
        IndexModel(
            [("collegeId", ASC), ("departmentId", ASC), ("batchId", ASC)], name="ix_assign_scope"
        ),
    ],
    "parent_links": [
        IndexModel([("parentUserId", ASC), ("studentUserId", ASC)], unique=True, name="uq_parent_link"),
    ],
    "enrollments": [
        IndexModel(
            [("collegeId", ASC), ("departmentId", ASC), ("status", ASC), ("enrolledAt", DESC)],
            name="ix_enroll_scope",
        ),
        IndexModel([("studentUserId", ASC), ("enrolledAt", DESC)], name="ix_enroll_student"),
        IndexModel([("studentUserId", ASC), ("courseId", ASC)], name="ix_enroll_student_course"),
        IndexModel([("courseMode", ASC), ("status", ASC)], name="ix_enroll_mode_status"),
    ],
    "enrollment_events": [
        IndexModel([("enrollmentId", ASC), ("at", ASC)], name="ix_enroll_event"),
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("at", DESC)], name="ix_enroll_ev_scope"),
    ],
    "training_modules": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC)], name="ix_tmodule_scope"),
        IndexModel([("collegeId", ASC), ("code", ASC)], unique=True, name="uq_tmodule_code"),
    ],
    "training_sessions": [
        IndexModel(
            [("collegeId", ASC), ("departmentId", ASC), ("date", DESC)], name="ix_tsession_scope"
        ),
        IndexModel([("trainerUserId", ASC), ("date", DESC)], name="ix_tsession_trainer"),
        IndexModel([("batchId", ASC), ("date", DESC)], name="ix_tsession_batch"),
    ],
    "attendance": [
        IndexModel(
            [("trainingSessionId", ASC), ("studentUserId", ASC)], unique=True, name="uq_attendance"
        ),
        IndexModel(
            [("collegeId", ASC), ("departmentId", ASC), ("date", DESC)], name="ix_attendance_scope"
        ),
        IndexModel([("studentUserId", ASC), ("date", DESC)], name="ix_attendance_student"),
        IndexModel([("trainerUserId", ASC), ("date", DESC)], name="ix_attendance_trainer"),
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("batchId", ASC)], name="ix_att_batch"),
    ],
    "skill_assessment_definitions": [
        IndexModel([("collegeId", ASC), ("pillar", ASC), ("code", ASC)], name="ix_sad_scope"),
    ],
    "skill_assessments": [
        IndexModel(
            [("collegeId", ASC), ("departmentId", ASC), ("trainingModuleId", ASC)],
            name="ix_assessment_scope",
        ),
        IndexModel([("studentUserId", ASC), ("createdAt", DESC)], name="ix_assessment_student"),
        IndexModel([("assessedBy", ASC), ("state", ASC)], name="ix_assessment_trainer"),
    ],
    "assessment_versions": [
        IndexModel([("assessmentId", ASC), ("version", DESC)], name="ix_assessment_version"),
    ],
    "trainer_feedback": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("createdAt", DESC)], name="ix_fb_scope"),
        IndexModel([("studentUserId", ASC), ("createdAt", DESC)], name="ix_fb_student"),
    ],
    "assignments": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("dueAt", ASC)], name="ix_asg_scope"),
        IndexModel([("batchId", ASC), ("dueAt", ASC)], name="ix_asg_batch"),
    ],
    "assignment_submissions": [
        IndexModel(
            [("assignmentId", ASC), ("studentUserId", ASC)], unique=True, name="uq_submission"
        ),
        IndexModel([("studentUserId", ASC), ("submittedAt", DESC)], name="ix_sub_student"),
    ],
    "courses": [IndexModel([("slug", ASC)], unique=True, name="uq_course_slug")],
    "modules": [IndexModel([("courseId", ASC), ("order", ASC)], name="ix_module_course")],
    "lessons": [IndexModel([("moduleId", ASC), ("order", ASC)], name="ix_lesson_module")],
    "course_progress": [
        IndexModel([("studentUserId", ASC), ("courseId", ASC)], unique=True, name="uq_progress"),
    ],
    "live_classes": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("startsAt", ASC)], name="ix_live_scope"),
        IndexModel([("batchId", ASC), ("startsAt", ASC)], name="ix_live_batch"),
    ],
    "practice_modes": [IndexModel([("code", ASC)], unique=True, name="uq_practice_mode")],
    "practice_sessions": [
        IndexModel([("studentUserId", ASC), ("createdAt", DESC)], name="ix_practice_student"),
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("createdAt", DESC)], name="ix_practice_scope"),
        IndexModel([("idempotencyKey", ASC)], unique=True, sparse=True, name="uq_practice_idem"),
    ],
    "recordings": [
        IndexModel([("practiceSessionId", ASC)], name="ix_rec_session"),
        IndexModel([("studentUserId", ASC), ("createdAt", DESC)], name="ix_rec_student"),
    ],
    "transcripts": [IndexModel([("practiceSessionId", ASC)], unique=True, name="uq_transcript")],
    "ai_scores": [
        IndexModel([("practiceSessionId", ASC)], unique=True, name="uq_ai_score"),
        IndexModel([("studentUserId", ASC), ("createdAt", DESC)], name="ix_ai_student"),
    ],
    "eedi_scores": [
        IndexModel([("studentUserId", ASC)], unique=True, name="uq_eedi_student"),
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("finalScore", DESC)], name="ix_eedi_scope"),
    ],
    "recommendations": [
        IndexModel([("studentUserId", ASC), ("createdAt", DESC)], name="ix_reco_student"),
    ],
    "exercise_library": [IndexModel([("code", ASC)], unique=True, name="uq_exercise")],
    "game_definitions": [IndexModel([("code", ASC)], unique=True, name="uq_game")],
    "game_attempts": [
        IndexModel([("studentUserId", ASC), ("gameId", ASC), ("createdAt", DESC)], name="ix_game_attempt"),
    ],
    "achievements": [IndexModel([("code", ASC)], unique=True, name="uq_achievement")],
    "xp_events": [IndexModel([("studentUserId", ASC), ("at", DESC)], name="ix_xp_student")],
    "assessments": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("opensAt", ASC)], name="ix_quiz_scope"),
    ],
    "assessment_attempts": [
        IndexModel([("assessmentId", ASC), ("studentUserId", ASC)], name="ix_quiz_attempt"),
    ],
    "certificate_templates": [
        IndexModel([("collegeId", ASC), ("code", ASC)], unique=True, name="uq_cert_template"),
    ],
    "certificates": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("status", ASC)], name="ix_cert_scope"),
        IndexModel([("studentUserId", ASC), ("trainingProgramId", ASC)], name="ix_cert_student"),
        IndexModel([("certificateNo", ASC)], unique=True, sparse=True, name="uq_cert_no"),
    ],
    "placement_drives": [
        IndexModel([("collegeId", ASC), ("startsAt", DESC)], name="ix_drive_scope"),
    ],
    "placement_goals": [IndexModel([("studentUserId", ASC)], unique=True, name="uq_goal_student")],
    "resume_documents": [
        IndexModel([("studentUserId", ASC), ("createdAt", DESC)], name="ix_resume_student"),
    ],
    "notifications": [
        IndexModel([("userId", ASC), ("read", ASC), ("createdAt", DESC)], name="ix_notif_user"),
    ],
    "report_jobs": [
        IndexModel([("requestedBy", ASC), ("createdAt", DESC)], name="ix_report_requester"),
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("createdAt", DESC)], name="ix_report_scope"),
        IndexModel([("status", ASC), ("createdAt", ASC)], name="ix_report_status"),
    ],
    "report_exports": [IndexModel([("jobId", ASC)], name="ix_export_job")],
    "audit_logs": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("at", DESC)], name="ix_audit_scope"),
        IndexModel([("actorId", ASC), ("at", DESC)], name="ix_audit_actor"),
        IndexModel([("entityType", ASC), ("entityId", ASC), ("at", DESC)], name="ix_audit_entity"),
    ],
    "security_events": [
        # Tenant-leading, like every other scoped collection: the per-institution reads in the
        # admin/HOD audit screens use this, and an unscoped read cannot.
        IndexModel([("collegeId", ASC), ("at", DESC)], name="ix_secev_scope"),
        IndexModel([("userId", ASC), ("at", DESC)], name="ix_secev_user"),
        IndexModel([("kind", ASC), ("at", DESC)], name="ix_secev_kind"),
    ],
    "ai_usage_events": [
        IndexModel([("collegeId", ASC), ("at", DESC)], name="ix_aiusage_scope"),
    ],
    "system_events": [
        IndexModel([("collegeId", ASC), ("at", DESC)], name="ix_sysev_scope"),
        IndexModel([("at", DESC)], name="ix_sysev_at"),
    ],
    "import_jobs": [
        IndexModel([("collegeId", ASC), ("createdAt", DESC)], name="ix_import_scope"),
    ],
    "weak_student_alerts": [
        IndexModel([("collegeId", ASC), ("departmentId", ASC), ("createdAt", DESC)], name="ix_alert_scope"),
        IndexModel([("trainerUserId", ASC), ("resolvedAt", ASC)], name="ix_alert_trainer"),
    ],
    "announcements": [
        IndexModel([("publishedAt", DESC)], name="ix_ann_published"),
    ],
    "testimonials": [IndexModel([("createdAt", DESC)], name="ix_testimonial")],
    "faqs": [IndexModel([("order", ASC)], name="ix_faq_order")],
    "refresh_sessions": [
        IndexModel([("userId", ASC), ("createdAt", DESC)], name="ix_rsession_user"),
        IndexModel([("sessionId", ASC)], unique=True, name="uq_rsession"),
        IndexModel([("collegeId", ASC), ("revokedAt", ASC)], name="ix_rsession_scope"),
    ],
    "ebooks": [
        IndexModel([("collegeId", ASC), ("published", ASC)], name="ix_ebook_scope"),
        IndexModel([("status", ASC), ("published", ASC)], name="ix_ebook_status_pub"),
        IndexModel([("isFeatured", ASC), ("isPinned", ASC)], name="ix_ebook_featured_pinned"),
        IndexModel([("slug", ASC)], unique=True, sparse=True, name="uq_ebook_slug"),
        IndexModel([("uploadedBy", ASC)], name="ix_ebook_author"),
        IndexModel([("createdAt", DESC)], name="ix_ebook_created"),
    ],
    "ebook_categories": [
        IndexModel([("slug", ASC)], unique=True, name="uq_ebook_category_slug"),
    ],
    "ebook_publish_requests": [
        IndexModel([("ebookId", ASC)], name="ix_ebook_req_ebook"),
        IndexModel([("requestedBy", ASC)], name="ix_ebook_req_user"),
        IndexModel([("status", ASC)], name="ix_ebook_req_status"),
    ],
    "ebook_progress": [
        IndexModel([("studentUserId", ASC), ("ebookId", ASC)], unique=True, name="uq_ebook_progress"),
    ],
    "ebook_bookmarks": [
        IndexModel([("studentUserId", ASC), ("ebookId", ASC), ("pageNumber", ASC)], name="ix_ebook_bookmark_page"),
    ],
    "ebook_reviews": [
        IndexModel([("ebookId", ASC), ("userId", ASC)], unique=True, name="uq_ebook_user_review"),
    ],
    "ebook_reports": [
        IndexModel([("ebookId", ASC), ("createdAt", DESC)], name="ix_ebook_reports"),
    ],
    "ebook_audit_logs": [
        IndexModel([("ebookId", ASC), ("timestamp", DESC)], name="ix_ebook_audit_time"),
    ],
    "conversations": [
        IndexModel([("studentUserId", ASC), ("trainerUserId", ASC)], name="ix_conv_pair"),
        IndexModel([("collegeId", ASC), ("lastMessageAt", DESC)], name="ix_conv_scope"),
    ],
    "messages": [
        IndexModel([("conversationId", ASC), ("createdAt", ASC)], name="ix_msg_conv"),
        IndexModel([("receiverId", ASC), ("readAt", ASC)], name="ix_msg_unread"),
    ],
    "payments": [
        IndexModel([("collegeId", ASC), ("createdAt", DESC)], name="ix_pay_scope"),
        IndexModel([("studentUserId", ASC), ("createdAt", DESC)], name="ix_pay_student"),
        IndexModel([("status", ASC), ("createdAt", DESC)], name="ix_pay_status"),
        IndexModel([("courseMode", ASC)], name="ix_pay_mode"),
        IndexModel([("transactionId", ASC)], unique=True, name="uq_pay_txn"),
        IndexModel([("idempotencyKey", ASC)], unique=True, sparse=True, name="uq_pay_idempotency"),
    ],
    "payment_events": [
        IndexModel([("paymentId", ASC), ("createdAt", DESC)], name="ix_payev_payment"),
    ],
    "invoices": [
        IndexModel([("paymentId", ASC)], unique=True, name="uq_invoice_payment"),
        IndexModel([("invoiceNumber", ASC)], unique=True, name="uq_invoice_number"),
    ],
    "course_trials": [
        IndexModel([("studentUserId", ASC), ("courseId", ASC)], unique=True, name="uq_course_trial"),
        IndexModel([("status", ASC), ("expiresAt", ASC)], name="ix_trial_status"),
    ],
    "game_assignments": [
        IndexModel([("batchId", ASC), ("gameCode", ASC)], name="ix_game_assign"),
    ],
}

ALL_COLLECTIONS = tuple(INDEXES.keys())


async def ensure_indexes(db) -> int:
    """Idempotent. Safe to run on every boot and from the seed script."""
    created = 0
    for collection, models in INDEXES.items():
        if not models:
            continue
        try:
            await db[collection].create_indexes(models)
            created += len(models)
        except Exception as exc:  # pragma: no cover - e.g. conflicting legacy index
            log.warning("index_create_failed", extra={"collection": collection, "error": str(exc)})
    log.info("indexes_ensured", extra={"count": created})
    return created
