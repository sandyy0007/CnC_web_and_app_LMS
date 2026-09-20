"""Concrete scoped repositories — one per domain collection.

Declaring them here keeps the scope rules for each collection in one auditable place:
`department_bound=False` is an explicit, reviewable decision rather than an accident.
"""
from __future__ import annotations

from pymongo import ASCENDING, DESCENDING

from app.repositories.base import ScopedRepository


# --------------------------------------------------------------- tenancy & identity
class CollegeRepo(ScopedRepository):
    collection = "colleges"
    department_bound = False
    search_fields = ("name", "code")

    def scope_filter(self, extra=None):  # colleges are addressed by identity, not by collegeId
        base = {} if self.ctx.is_platform_wide else {"_id": self.ctx.college_id}
        merged = {**base, **(extra or {})}
        merged.setdefault("deletedAt", None)
        return merged


class DepartmentRepo(ScopedRepository):
    collection = "departments"
    department_bound = False
    search_fields = ("name", "code")
    default_sort = ("name", ASCENDING)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        # An HOD may only ever see their own department row.
        if self.ctx.role is Role.HOD and self.ctx.department_id is not None:
            merged.setdefault("_id", self.ctx.department_id)
        return merged


class SemesterRepo(ScopedRepository):
    collection = "semesters"
    batch_scoped = False
    default_sort = ("number", ASCENDING)
    extra_sortable = ("number",)


class BatchRepo(ScopedRepository):
    collection = "batches"
    search_fields = ("name", "code")
    default_sort = ("name", ASCENDING)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.TRAINER:
            # base_filter() scopes child docs by `batchId`; for the batches collection itself the
            # assignment set applies to `_id`.
            merged.pop("batchId", None)
            merged.setdefault("_id", {"$in": list(self.ctx.batch_ids)})
        return merged


class UserRepo(ScopedRepository):
    collection = "users"
    department_bound = False
    search_fields = ("name", "email", "institutionId")
    default_sort = ("name", ASCENDING)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.HOD and self.ctx.department_id is not None:
            merged.setdefault("departmentId", self.ctx.department_id)
        return merged


class StudentProfileRepo(ScopedRepository):
    collection = "student_profiles"
    search_fields = ("name", "rollNumber", "email")
    default_sort = ("rollNumber", ASCENDING)
    extra_sortable = ("name", "batchId", "semester")


class TrainerAssignmentRepo(ScopedRepository):
    collection = "trainer_assignments"

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.TRAINER:
            merged.pop("batchId", None)
            merged.setdefault("trainerUserId", self.ctx.user_id)
        return merged


class ParentLinkRepo(ScopedRepository):
    collection = "parent_links"
    department_bound = False


# --------------------------------------------------------------- enrollment
class EnrollmentRepo(ScopedRepository):
    collection = "enrollments"
    default_sort = ("enrolledAt", DESCENDING)
    extra_sortable = ("enrollmentType", "studentName", "courseMode")
    search_fields = ("studentName", "rollNumber")

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role in (Role.ADMIN, Role.HOD, Role.TRAINER):
            # Admin, HOD, and Trainer only see OFFLINE institution enrollments
            # (Online courses bypass the institution operational ecosystem)
            merged.setdefault("courseMode", {"$ne": "ONLINE"})
        elif self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        return merged


class EnrollmentEventRepo(ScopedRepository):
    collection = "enrollment_events"
    batch_scoped = False
    default_sort = ("at", DESCENDING)
    soft_delete = False  # append-only trail


# --------------------------------------------------------------- curriculum
class CourseRepo(ScopedRepository):
    collection = "courses"
    department_bound = False
    search_fields = ("title", "slug", "description")
    default_sort = ("order", ASCENDING)
    extra_sortable = ("order", "difficulty")

    def scope_filter(self, extra=None):
        # Course catalogue is platform-level content; visibility is by publication state.
        merged = {**(extra or {})}
        merged.setdefault("deletedAt", None)
        return merged


class ModuleRepo(ScopedRepository):
    collection = "modules"
    department_bound = False
    default_sort = ("order", ASCENDING)
    extra_sortable = ("order",)

    def scope_filter(self, extra=None):
        merged = {**(extra or {})}
        merged.setdefault("deletedAt", None)
        return merged


class LessonRepo(ModuleRepo):
    collection = "lessons"


class TrainingModuleRepo(ScopedRepository):
    collection = "training_modules"
    batch_scoped = False
    search_fields = ("name", "code")
    default_sort = ("name", ASCENDING)


class TrainingSessionRepo(ScopedRepository):
    collection = "training_sessions"
    default_sort = ("date", DESCENDING)
    search_fields = ("topic",)
    extra_sortable = ("topic",)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.TRAINER:
            merged.setdefault("trainerUserId", self.ctx.user_id)
        return merged


class LiveClassRepo(ScopedRepository):
    collection = "live_classes"
    default_sort = ("startsAt", ASCENDING)
    search_fields = ("title",)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.TRAINER:
            merged.pop("batchId", None)
            merged.setdefault("$or", [
                {"trainerUserId": self.ctx.user_id},
                {"meetingType": "TRAINER_MEETING", "allowedTrainerIds": self.ctx.user_id},
                {"batchId": {"$in": list(self.ctx.batch_ids)}} if self.ctx.batch_ids else {"_id": None},
            ])
        elif self.ctx.role in (Role.ADMIN, Role.HOD):
            merged.setdefault("meetingType", {"$ne": "TRAINER_MEETING"})
        elif self.ctx.role is Role.STUDENT:
            merged.setdefault("meetingType", {"$ne": "TRAINER_MEETING"})
            merged.setdefault("status", {"$ne": "CANCELLED"})
        return merged


class LiveParticipationRepo(ScopedRepository):
    collection = "live_participations"
    department_bound = False
    default_sort = ("joinedAt", DESCENDING)


class LiveRecordingRepo(ScopedRepository):
    collection = "live_recordings"
    department_bound = False
    default_sort = ("createdAt", DESCENDING)


class LiveChatMessageRepo(ScopedRepository):
    collection = "live_chat_messages"
    department_bound = False
    default_sort = ("createdAt", ASCENDING)


class CourseProgressRepo(ScopedRepository):
    collection = "course_progress"
    department_bound = False


# --------------------------------------------------------------- trainer-owned
class AttendanceRepo(ScopedRepository):
    collection = "attendance"
    default_sort = ("date", DESCENDING)
    soft_delete = False

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.TRAINER:
            # Trainers strictly only see attendance records for sessions they conducted
            merged.setdefault("trainerUserId", self.ctx.user_id)
        return merged


class SkillAssessmentDefinitionRepo(ScopedRepository):
    collection = "skill_assessment_definitions"
    department_bound = False
    default_sort = ("order", ASCENDING)
    extra_sortable = ("order", "pillar")


class SkillAssessmentRepo(ScopedRepository):
    collection = "skill_assessments"
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("state",)


class AssessmentVersionRepo(ScopedRepository):
    collection = "assessment_versions"
    department_bound = False
    soft_delete = False
    default_sort = ("version", DESCENDING)
    extra_sortable = ("version",)


class TrainerFeedbackRepo(ScopedRepository):
    collection = "trainer_feedback"
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("rating",)


class AssignmentRepo(ScopedRepository):
    collection = "assignments"
    search_fields = ("title", "description")
    default_sort = ("dueAt", ASCENDING)


class AssignmentSubmissionRepo(ScopedRepository):
    collection = "assignment_submissions"
    department_bound = False
    default_sort = ("submittedAt", DESCENDING)
    extra_sortable = ("state", "grade")


class WeakStudentAlertRepo(ScopedRepository):
    collection = "weak_student_alerts"
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("pillar", "score")


# --------------------------------------------------------------- student practice & AI
class PracticeModeRepo(ScopedRepository):
    collection = "practice_modes"
    department_bound = False
    search_fields = ("title", "description", "category")
    default_sort = ("order", ASCENDING)
    extra_sortable = ("order", "category", "difficulty")

    def scope_filter(self, extra=None):
        merged = {**(extra or {})}
        merged.setdefault("deletedAt", None)
        return merged


class PracticeSessionRepo(ScopedRepository):
    collection = "practice_sessions"
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("state", "kind")

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        return merged


class RecordingRepo(ScopedRepository):
    collection = "recordings"
    department_bound = False

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        return merged


class TranscriptRepo(RecordingRepo):
    collection = "transcripts"


class AiScoreRepo(RecordingRepo):
    collection = "ai_scores"


class EediScoreRepo(ScopedRepository):
    collection = "eedi_scores"
    default_sort = ("finalScore", DESCENDING)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        return merged


class RecommendationRepo(EediScoreRepo):
    collection = "recommendations"
    default_sort = ("createdAt", DESCENDING)


class ExerciseLibraryRepo(PracticeModeRepo):
    collection = "exercise_library"
    search_fields = ("title", "targetDimension")


class GameDefinitionRepo(PracticeModeRepo):
    collection = "game_definitions"
    search_fields = ("title", "category", "description")


class GameAttemptRepo(EediScoreRepo):
    collection = "game_attempts"
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("xpEarned",)


class AchievementRepo(PracticeModeRepo):
    collection = "achievements"
    search_fields = ("title",)


class XpEventRepo(ScopedRepository):
    collection = "xp_events"
    department_bound = False
    soft_delete = False
    default_sort = ("at", DESCENDING)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        return merged


class QuizRepo(ScopedRepository):
    collection = "assessments"
    search_fields = ("title",)
    default_sort = ("opensAt", DESCENDING)
    extra_sortable = ("opensAt",)


class QuizAttemptRepo(EediScoreRepo):
    collection = "assessment_attempts"
    default_sort = ("createdAt", DESCENDING)


class ResumeDocumentRepo(EediScoreRepo):
    collection = "resume_documents"
    default_sort = ("createdAt", DESCENDING)


class PlacementGoalRepo(EediScoreRepo):
    collection = "placement_goals"
    default_sort = ("createdAt", DESCENDING)


# --------------------------------------------------------------- certification & placement
class CertificateTemplateRepo(ScopedRepository):
    collection = "certificate_templates"
    department_bound = False
    search_fields = ("name", "code")
    default_sort = ("name", ASCENDING)


class CertificateRepo(ScopedRepository):
    collection = "certificates"
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("issuedAt", "eligibilityMet")


class PlacementDriveRepo(ScopedRepository):
    collection = "placement_drives"
    department_bound = False
    search_fields = ("company", "title")
    default_sort = ("startsAt", DESCENDING)


# --------------------------------------------------------------- ops & reporting
class NotificationRepo(ScopedRepository):
    collection = "notifications"
    department_bound = False
    default_sort = ("createdAt", DESCENDING)

    def scope_filter(self, extra=None):
        merged = {"userId": self.ctx.user_id, **(extra or {})}
        merged.setdefault("deletedAt", None)
        return merged


class ReportJobRepo(ScopedRepository):
    collection = "report_jobs"
    batch_scoped = False
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("reportType", "format")
    search_fields = ("reportType",)


class ReportExportRepo(ScopedRepository):
    collection = "report_exports"
    batch_scoped = False
    default_sort = ("createdAt", DESCENDING)


class AuditLogRepo(ScopedRepository):
    collection = "audit_logs"
    batch_scoped = False
    soft_delete = False  # append-only, never editable (SRS §11.6)
    default_sort = ("at", DESCENDING)
    extra_sortable = ("action", "entityType", "actorId")


class SecurityEventRepo(ScopedRepository):
    collection = "security_events"
    department_bound = False
    soft_delete = False
    default_sort = ("at", DESCENDING)


class AiUsageRepo(ScopedRepository):
    collection = "ai_usage_events"
    department_bound = False
    soft_delete = False
    default_sort = ("at", DESCENDING)


class SystemEventRepo(ScopedRepository):
    collection = "system_events"
    department_bound = False
    soft_delete = False
    default_sort = ("at", DESCENDING)

    def scope_filter(self, extra=None):
        return {**(extra or {})}


class ImportJobRepo(ScopedRepository):
    collection = "import_jobs"
    department_bound = False
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("entity",)


class AnnouncementRepo(ScopedRepository):
    collection = "announcements"
    department_bound = False
    search_fields = ("title", "body")
    default_sort = ("publishedAt", DESCENDING)
    extra_sortable = ("publishedAt", "kind")

    def scope_filter(self, extra=None):
        merged = {**(extra or {})}
        merged.setdefault("deletedAt", None)
        if not self.ctx.is_platform_wide and self.ctx.college_id is not None:
            merged.setdefault("$or", [{"collegeId": self.ctx.college_id}, {"collegeId": None}])
        return merged


# --------------------------------------------------------------- e-books & digital library
class EbookRepo(ScopedRepository):
    collection = "ebooks"
    department_bound = False
    search_fields = ("title", "author", "category", "description", "tags")
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("title", "author", "pageCount", "readsCount")

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        if self.ctx.role is Role.TRAINER:
            # Trainers can view their own private ebooks or any published ebooks in scope
            merged.pop("batchId", None)
        elif self.ctx.role is Role.STUDENT:
            merged.pop("batchId", None)
            merged.setdefault("published", True)
        elif self.ctx.role is Role.SUPER_ADMIN:
            merged.pop("collegeId", None)
            merged.pop("batchId", None)
        return merged


class EbookProgressRepo(ScopedRepository):
    collection = "ebook_progress"
    department_bound = False
    soft_delete = False
    default_sort = ("lastReadAt", DESCENDING)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        merged.pop("batchId", None)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        return merged


class EbookBookmarkRepo(ScopedRepository):
    collection = "ebook_bookmarks"
    department_bound = False
    soft_delete = False
    default_sort = ("createdAt", DESCENDING)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        merged.pop("batchId", None)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        return merged


# --------------------------------------------------------------- mentor chat
class ConversationRepo(ScopedRepository):
    collection = "conversations"
    department_bound = False
    default_sort = ("lastMessageAt", DESCENDING)
    extra_sortable = ("lastMessageAt", "createdAt")

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        merged.pop("batchId", None)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        elif self.ctx.role is Role.TRAINER:
            merged.setdefault("trainerUserId", self.ctx.user_id)
        elif self.ctx.role is Role.SUPER_ADMIN:
            merged.pop("collegeId", None)
        return merged


class MessageRepo(ScopedRepository):
    collection = "messages"
    department_bound = False
    soft_delete = False
    default_sort = ("createdAt", ASCENDING)
    extra_sortable = ("createdAt",)


# --------------------------------------------------------------- payments & trials
class PaymentRepo(ScopedRepository):
    collection = "payments"
    department_bound = False
    search_fields = ("transactionId", "invoiceNumber", "paymentMethod")
    default_sort = ("createdAt", DESCENDING)
    extra_sortable = ("amount", "status", "createdAt")

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        merged.pop("batchId", None)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        elif self.ctx.role is Role.SUPER_ADMIN:
            merged.pop("collegeId", None)
        elif self.ctx.role is Role.TRAINER:
            # Trainers do not have financial / payment administration access
            merged["_id"] = None
        return merged


class PaymentEventRepo(ScopedRepository):
    collection = "payment_events"
    department_bound = False
    soft_delete = False
    default_sort = ("createdAt", DESCENDING)


class InvoiceRepo(ScopedRepository):
    collection = "invoices"
    department_bound = False
    default_sort = ("issuedAt", DESCENDING)


class CourseTrialRepo(ScopedRepository):
    collection = "course_trials"
    department_bound = False
    default_sort = ("startedAt", DESCENDING)

    def scope_filter(self, extra=None):
        from app.authz.roles import Role

        merged = super().scope_filter(extra)
        merged.pop("batchId", None)
        if self.ctx.role is Role.STUDENT:
            merged.setdefault("studentUserId", self.ctx.user_id)
        elif self.ctx.role is Role.SUPER_ADMIN:
            merged.pop("collegeId", None)
        return merged


class GameAssignmentRepo(ScopedRepository):
    collection = "game_assignments"
    default_sort = ("createdAt", DESCENDING)

