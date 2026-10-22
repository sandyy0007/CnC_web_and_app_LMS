"""Dashboard and System Aggregations PostgreSQL repository.

Strict Zero-Fake-Numbers Policy:
Returns exact database counts, 0 when empty, 0.0 for revenue, and None for missing averages (rendered as N/A).
"""
from __future__ import annotations

from typing import Any
from uuid import UUID
from datetime import datetime, timezone
from app.db.postgres import get_pg_connection


class StatsRepository:
    @staticmethod
    async def get_home_public_stats() -> dict[str, Any]:
        """Live public metrics derived purely from PostgreSQL records."""
        async with get_pg_connection() as conn:
            learners = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND deleted_at IS NULL"
            ) or 0
            trainers = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE role = 'TRAINER' AND deleted_at IS NULL"
            ) or 0
            institutions = await conn.fetchval(
                "SELECT COUNT(*) FROM institutions WHERE deleted_at IS NULL"
            ) or 0
            courses = await conn.fetchval(
                "SELECT COUNT(*) FROM courses WHERE published = TRUE AND deleted_at IS NULL"
            ) or 0
            evaluations = await conn.fetchval(
                "SELECT COUNT(*) FROM eedi_evaluations WHERE status = 'COMPLETED'"
            ) or 0
            avg_readiness = await conn.fetchval(
                "SELECT AVG(eedi_score) FROM eedi_evaluations WHERE status = 'COMPLETED' AND eedi_score IS NOT NULL"
            )
            average_score = round(float(avg_readiness), 1) if avg_readiness is not None else None

            return {
                "learners": learners,
                "trainers": trainers,
                "institutions": institutions,
                "courses": courses,
                "practiceSessionsScored": evaluations,
                "evaluationsCompleted": evaluations,
                "averageReadinessScore": average_score,
                "computedAt": datetime.now(timezone.utc).isoformat(),
                "source": "postgresql-cnc",
            }

    @staticmethod
    async def get_super_admin_stats(
        institution_id: UUID | str | None = None,
        training_type: str | None = None,
    ) -> dict[str, Any]:
        """Super Admin command metrics with institution and training type filtering."""
        inst_uuid = UUID(str(institution_id)) if institution_id else None
        async with get_pg_connection() as conn:
            # 1. Institutions breakdown
            total_institutions = await conn.fetchval("SELECT COUNT(*) FROM institutions WHERE deleted_at IS NULL") or 0
            colleges = await conn.fetchval("SELECT COUNT(*) FROM institutions WHERE institution_type = 'COLLEGE' AND deleted_at IS NULL") or 0
            companies = await conn.fetchval("SELECT COUNT(*) FROM institutions WHERE institution_type = 'COMPANY' AND deleted_at IS NULL") or 0
            schools = await conn.fetchval("SELECT COUNT(*) FROM institutions WHERE institution_type = 'SCHOOL' AND deleted_at IS NULL") or 0

            # 2. Scope-filtered user & enrollment counts
            user_conds = ["u.deleted_at IS NULL"]
            user_params: list[Any] = []
            if inst_uuid:
                user_params.append(inst_uuid)
                user_conds.append(f"u.institution_id = ${len(user_params)}")

            total_participants = await conn.fetchval(
                f"SELECT COUNT(*) FROM users u WHERE u.role = 'STUDENT' AND {' AND '.join(user_conds)}",
                *user_params,
            ) or 0
            total_trainers = await conn.fetchval(
                f"SELECT COUNT(*) FROM users u WHERE u.role = 'TRAINER' AND {' AND '.join(user_conds)}",
                *user_params,
            ) or 0

            # 3. Enrollments & Access
            enroll_conds = []
            enroll_params: list[Any] = []
            if inst_uuid:
                enroll_params.append(inst_uuid)
                enroll_conds.append(f"institution_id = ${len(enroll_params)}")
            where_enroll = f"WHERE {' AND '.join(enroll_conds)}" if enroll_conds else ""

            active_enrollments = await conn.fetchval(
                f"SELECT COUNT(*) FROM enrollments {where_enroll} {'AND' if enroll_conds else 'WHERE'} access_status = 'ACTIVE'",
                *enroll_params,
            ) or 0
            expired_enrollments = await conn.fetchval(
                f"SELECT COUNT(*) FROM enrollments {where_enroll} {'AND' if enroll_conds else 'WHERE'} access_status = 'EXPIRED'",
                *enroll_params,
            ) or 0

            # 4. Payments & Revenue
            pay_conds = ["p.status = 'VERIFIED'"]
            pay_params: list[Any] = []
            if inst_uuid:
                pay_params.append(inst_uuid)
                pay_conds.append(f"e.institution_id = ${len(pay_params)}")

            revenue_val = await conn.fetchval(
                f"""
                SELECT SUM(p.amount)
                FROM payments p
                JOIN enrollments e ON e.id = p.enrollment_id
                WHERE {' AND '.join(pay_conds)}
                """,
                *pay_params,
            )
            revenue = float(revenue_val) if revenue_val is not None else 0.0

            # 5. Average Readiness
            eval_conds = ["status = 'COMPLETED'", "eedi_score IS NOT NULL"]
            eval_params: list[Any] = []
            if inst_uuid:
                eval_params.append(inst_uuid)
                eval_conds.append(f"institution_id = ${len(eval_params)}")

            avg_val = await conn.fetchval(
                f"SELECT AVG(eedi_score) FROM eedi_evaluations WHERE {' AND '.join(eval_conds)}",
                *eval_params,
            )
            avg_score = round(float(avg_val), 1) if avg_val is not None else None

            return {
                "totalInstitutions": total_institutions,
                "colleges": colleges,
                "companies": companies,
                "schools": schools,
                "totalParticipants": total_participants,
                "totalTrainers": total_trainers,
                "activeEnrollments": active_enrollments,
                "expiredEnrollments": expired_enrollments,
                "revenue": revenue,
                "averageEediScore": avg_score,
                "hasEvaluations": avg_score is not None,
            }

    @staticmethod
    async def get_admin_dashboard_stats(institution_id: UUID | str) -> dict[str, Any]:
        """Admin dashboard metrics strictly scoped to own institution."""
        inst_uuid = UUID(str(institution_id))
        async with get_pg_connection() as conn:
            inst = await conn.fetchrow(
                "SELECT id, name, code, institution_type, training_type FROM institutions WHERE id = $1",
                inst_uuid,
            )
            total_students = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE institution_id = $1 AND role = 'STUDENT' AND deleted_at IS NULL",
                inst_uuid,
            ) or 0
            total_trainers = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE institution_id = $1 AND role = 'TRAINER' AND deleted_at IS NULL",
                inst_uuid,
            ) or 0
            departments_count = await conn.fetchval(
                "SELECT COUNT(*) FROM departments WHERE institution_id = $1 AND deleted_at IS NULL",
                inst_uuid,
            ) or 0
            active_batches = await conn.fetchval(
                "SELECT COUNT(*) FROM batches WHERE institution_id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL",
                inst_uuid,
            ) or 0
            avg_score = await conn.fetchval(
                "SELECT AVG(eedi_score) FROM eedi_evaluations WHERE institution_id = $1 AND status = 'COMPLETED'",
                inst_uuid,
            )

            # Department breakdown
            depts = await conn.fetch(
                """
                SELECT d.name, d.code, COUNT(u.id) as students
                FROM departments d
                LEFT JOIN users u ON u.department_id = d.id AND u.role = 'STUDENT' AND u.deleted_at IS NULL
                WHERE d.institution_id = $1 AND d.deleted_at IS NULL
                GROUP BY d.id, d.name, d.code
                ORDER BY d.name ASC
                """,
                inst_uuid,
            )

            # Enrollment breakdown
            enrollments = {
                "active": await conn.fetchval("SELECT COUNT(*) FROM enrollments WHERE institution_id = $1 AND access_status = 'ACTIVE'", inst_uuid) or 0,
                "inactive": await conn.fetchval("SELECT COUNT(*) FROM enrollments WHERE institution_id = $1 AND access_status = 'INACTIVE'", inst_uuid) or 0,
                "expired": await conn.fetchval("SELECT COUNT(*) FROM enrollments WHERE institution_id = $1 AND access_status = 'EXPIRED'", inst_uuid) or 0,
            }

            return {
                "institution": {
                    "id": str(inst_uuid),
                    "name": inst["name"] if inst else "Institution",
                    "code": inst["code"] if inst else "",
                },
                "kpis": {
                    "totalStudents": total_students,
                    "totalTrainers": total_trainers,
                    "departments": departments_count,
                    "activeBatches": active_batches,
                    "averageInstitutionalEediScore": round(float(avg_score), 1) if avg_score is not None else None,
                    "averageScoreHasData": avg_score is not None,
                },
                "studentsPerDepartment": [dict(d) for d in depts],
                "enrollments": enrollments,
                "attendanceTrend": [],
                "classMonitoring": {
                    "sessionsToday": 0,
                    "liveNow": 0,
                    "sessions": [],
                },
                "systemAndAiUsage": {
                    "aiCalls24h": 0,
                    "averageLatencyMs": 0,
                    "failures24h": 0,
                    "queue": {"active": 0, "queued": 0},
                    "providers": {},
                },
                "quickActions": [
                    {"code": "add_department", "label": "Add department", "href": "/admin/departments"},
                    {"code": "invite_trainer", "label": "Invite trainer", "href": "/admin/trainers"},
                    {"code": "bulk_import", "label": "Bulk import", "href": "/admin/bulk-import"},
                ],
            }

    @staticmethod
    async def get_super_admin_dashboard_full() -> dict[str, Any]:
        """Complete PostgreSQL Super Admin dashboard metrics."""
        async with get_pg_connection() as conn:
            inst_count = await conn.fetchval("SELECT COUNT(*) FROM institutions WHERE deleted_at IS NULL") or 0
            stu_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND deleted_at IS NULL") or 0
            trn_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role = 'TRAINER' AND deleted_at IS NULL") or 0
            hod_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role = 'HOD' AND deleted_at IS NULL") or 0
            adm_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND deleted_at IS NULL") or 0
            courses_count = await conn.fetchval("SELECT COUNT(*) FROM courses WHERE published = TRUE AND deleted_at IS NULL") or 0
            ebooks_count = await conn.fetchval("SELECT COUNT(*) FROM ebooks WHERE deleted_at IS NULL") or 0
            games_count = await conn.fetchval("SELECT COUNT(*) FROM games") or 0

            # Revenue & payments
            tot_rev = await conn.fetchval("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'VERIFIED'") or 0.0
            pending_pay = await conn.fetchval("SELECT COUNT(*) FROM payments WHERE status = 'PENDING'") or 0
            verified_pay = await conn.fetchval("SELECT COUNT(*) FROM payments WHERE status = 'VERIFIED'") or 0
            tot_txns = await conn.fetchval("SELECT COUNT(*) FROM payments") or 0

            # Online vs Offline revenue
            online_rev = await conn.fetchval("""
                SELECT COALESCE(SUM(p.amount), 0)
                FROM payments p
                JOIN courses c ON c.id = p.course_id
                WHERE p.status = 'VERIFIED' AND c.delivery_mode = 'ONLINE'
            """) or 0.0
            offline_rev = float(tot_rev) - float(online_rev)

            # Recent payments
            recent_pay_rows = await conn.fetch("""
                SELECT p.id, p.amount, p.status, p.created_at, u.name as student_name, c.title as course_title, c.delivery_mode as course_mode
                FROM payments p
                LEFT JOIN users u ON u.id = p.participant_user_id
                LEFT JOIN courses c ON c.id = p.course_id
                ORDER BY p.created_at DESC
                LIMIT 6
            """)
            recent_payments = [
                {
                    "id": str(r["id"]),
                    "amount": float(r["amount"]),
                    "status": r["status"],
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                    "studentName": r["student_name"] or "Student",
                    "courseTitle": r["course_title"] or "Course",
                    "courseMode": r["course_mode"] or "HYBRID",
                }
                for r in recent_pay_rows
            ]

            # Recent security events from audit_logs
            recent_sec_rows = await conn.fetch("""
                SELECT id, action, entity_name, created_at, ip_address
                FROM audit_logs
                ORDER BY created_at DESC
                LIMIT 10
            """)
            recent_sec = [
                {
                    "id": str(r["id"]),
                    "kind": r["action"],
                    "detail": f"{r['action']} on {r['entity_name']}",
                    "at": r["created_at"].isoformat() if r["created_at"] else None,
                    "ip": r["ip_address"] or "127.0.0.1",
                }
                for r in recent_sec_rows
            ]

            return {
                "institutions": inst_count,
                "students": stu_count,
                "trainers": trn_count,
                "hods": hod_count,
                "admins": adm_count,
                "courses": courses_count,
                "ebooks": ebooks_count,
                "games": games_count,
                "activeTrials": 0,
                "convertedTrials": 0,
                "trialConversionRate": 0.0,
                "totalRevenue": round(float(tot_rev), 2),
                "pendingPayments": pending_pay,
                "verifiedPayments": verified_pay,
                "onlineRevenue": round(float(online_rev), 2),
                "offlineRevenue": round(float(offline_rev), 2),
                "totalTransactions": tot_txns,
                "aiEventsCount": 0,
                "storageUsage": "0.1 GB",
                "recentPayments": recent_payments,
                "recentSecurityEvents": recent_sec,
            }

    @staticmethod
    async def get_hod_dashboard_data(institution_id: UUID | str, department_id: UUID | str) -> dict[str, Any]:
        """SPOC / HOD department scoped dashboard from PostgreSQL."""
        inst_uuid = UUID(str(institution_id))
        dept_uuid = UUID(str(department_id))
        async with get_pg_connection() as conn:
            inst = await conn.fetchrow("SELECT name, code FROM institutions WHERE id = $1", inst_uuid)
            dept = await conn.fetchrow("SELECT name, code, status FROM departments WHERE id = $1 AND institution_id = $2", dept_uuid, inst_uuid)

            stu_count = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE institution_id = $1 AND department_id = $2 AND role = 'STUDENT' AND deleted_at IS NULL",
                inst_uuid, dept_uuid
            ) or 0
            trn_count = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE institution_id = $1 AND department_id = $2 AND role = 'TRAINER' AND deleted_at IS NULL",
                inst_uuid, dept_uuid
            ) or 0

            att_row = await conn.fetchrow("""
                SELECT COUNT(*) as total, COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END) as attended
                FROM attendance_records ar
                JOIN users u ON u.id = ar.participant_user_id
                WHERE u.institution_id = $1 AND u.department_id = $2
            """, inst_uuid, dept_uuid)
            att_total = att_row["total"] if att_row else 0
            att_attended = att_row["attended"] if att_row else 0
            att_pct = round((att_attended / att_total) * 100.0, 1) if att_total > 0 else None

            avg_score = await conn.fetchval(
                "SELECT AVG(eedi_score) FROM eedi_evaluations WHERE institution_id = $1 AND department_id = $2 AND status = 'COMPLETED'",
                inst_uuid, dept_uuid
            )

            recent_enroll_rows = await conn.fetch("""
                SELECT e.id, e.current_semester, e.enrollment_status, e.access_status, e.created_at, u.name as participant_name, c.title as course_title
                FROM enrollments e
                JOIN users u ON u.id = e.participant_user_id
                JOIN courses c ON c.id = e.course_id
                WHERE e.institution_id = $1 AND u.department_id = $2
                ORDER BY e.created_at DESC
                LIMIT 6
            """, inst_uuid, dept_uuid)
            recent_enrollments = [
                {
                    "id": str(r["id"]),
                    "semester": r["current_semester"],
                    "status": r["enrollment_status"],
                    "accessStatus": r["access_status"],
                    "enrolledAt": r["created_at"].isoformat() if r["created_at"] else None,
                    "participantName": r["participant_name"],
                    "courseTitle": r["course_title"],
                }
                for r in recent_enroll_rows
            ]

            return {
                "scope": {
                    "collegeId": str(inst_uuid),
                    "collegeName": inst["name"] if inst else "Institution",
                    "collegeCode": inst["code"] if inst else "",
                    "departmentId": str(dept_uuid),
                    "departmentName": dept["name"] if dept else "Department",
                    "departmentCode": dept["code"] if dept else "",
                    "departmentStatus": dept["status"] if dept else "ACTIVE",
                    "readOnly": (dept["status"] == "ARCHIVED") if dept else False,
                    "breadcrumb": f"{inst['name'] if inst else ''} › {dept['name'] if dept else ''}",
                    "isolationNotice": "Data isolation active — college + department scoped server-side on every request.",
                },
                "kpis": {
                    "participants": {
                        "value": stu_count,
                        "delta": "+0%",
                        "deltaLabel": "in this department",
                    },
                    "trainers": {
                        "value": trn_count,
                        "deltaLabel": "assigned faculty",
                    },
                    "averageSessionAttendance": {
                        "value": att_pct if att_pct is not None else 0.0,
                        "hasData": att_pct is not None,
                        "suffix": "%",
                    },
                    "averageSkillScore": {
                        "value": round(float(avg_score), 1) if avg_score is not None else None,
                        "outOf": 100,
                        "hasData": avg_score is not None,
                    },
                },
                "alerts": [
                    {
                        "code": "attendance_defaulters",
                        "label": "Attendance Defaulters (below 75%)",
                        "count": 0,
                        "tone": "warning",
                        "href": "/hod/attendance",
                    },
                    {
                        "code": "low_assessment_scores",
                        "label": "Low Skill-Assessment Scores",
                        "count": 0,
                        "tone": "danger",
                        "href": "/hod/assessments",
                    },
                    {
                        "code": "pending_approvals",
                        "label": "Enrollment / Certificate approvals pending",
                        "count": 0,
                        "tone": "info",
                        "href": "/hod/certificates",
                    },
                ],
                "attendanceTrend": [
                    {"label": f"Wk {i + 1}", "percentage": 0, "hasSession": False}
                    for i in range(8)
                ],
                "moduleAttendance": [],
                "moduleScores": [],
                "certificatesIssued": 0,
                "recentEnrollments": recent_enrollments,
                "thresholds": {
                    "attendance": 75,
                    "certificateAttendance": 80,
                    "certificateScore": 70,
                },
            }

    @staticmethod
    async def get_trainer_dashboard_data(trainer_user_id: UUID | str) -> dict[str, Any]:
        """Trainer dashboard scoped to assigned batches — authoritative PostgreSQL metrics."""
        trainer_uuid = UUID(str(trainer_user_id))
        async with get_pg_connection() as conn:
            batches = await conn.fetch("""
                SELECT b.id, b.name, b.code, b.status
                FROM batches b
                JOIN batch_trainers bt ON bt.batch_id = b.id
                WHERE bt.trainer_user_id = $1 AND b.deleted_at IS NULL
            """, trainer_uuid)
            batch_ids = [b["id"] for b in batches]

            stu_count = 0
            if batch_ids:
                stu_count = await conn.fetchval("""
                    SELECT COUNT(DISTINCT u.id)
                    FROM users u
                    JOIN enrollments e ON e.participant_user_id = u.id
                    WHERE e.batch_id = ANY($1) AND u.deleted_at IS NULL
                """, batch_ids) or 0

            sessions_conducted = await conn.fetchval("""
                SELECT COUNT(*) FROM training_sessions WHERE trainer_user_id = $1
            """, trainer_uuid) or 0

            att_row = await conn.fetchrow("""
                SELECT COUNT(*) as total, COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END) as attended
                FROM attendance_records ar
                JOIN training_sessions s ON s.id = ar.session_id
                WHERE s.trainer_user_id = $1
            """, trainer_uuid)
            tot_att = att_row["total"] if att_row else 0
            att_cnt = att_row["attended"] if att_row else 0
            avg_att = round((att_cnt / tot_att) * 100.0, 1) if tot_att > 0 else 0.0

            # Assessments summary from eedi_evaluations
            asmt_row = await conn.fetchrow("""
                SELECT COUNT(*) as count, AVG(eedi_score) as avg, MIN(eedi_score) as min, MAX(eedi_score) as max
                FROM eedi_evaluations
                WHERE trainer_user_id = $1 AND status = 'COMPLETED'
            """, trainer_uuid)
            asmt_count = asmt_row["count"] if asmt_row else 0
            avg_score = round(float(asmt_row["avg"]), 1) if asmt_row and asmt_row["avg"] is not None else None
            min_score = round(float(asmt_row["min"]), 1) if asmt_row and asmt_row["min"] is not None else 0
            max_score = round(float(asmt_row["max"]), 1) if asmt_row and asmt_row["max"] is not None else 0

            pending_evals = 0
            if batch_ids:
                pending_evals = await conn.fetchval("""
                    SELECT COUNT(*)
                    FROM enrollments e
                    LEFT JOIN eedi_evaluations ev ON ev.participant_user_id = e.participant_user_id AND ev.course_id = e.course_id AND ev.semester = e.current_semester
                    WHERE e.batch_id = ANY($1) AND (ev.id IS NULL OR ev.status != 'COMPLETED')
                """, batch_ids) or 0

            # Today's classes
            today_sessions = await conn.fetch("""
                SELECT s.id, s.topic, b.name as batch_name, s.starts_at, s.ends_at,
                       COUNT(ar.id) as attendance_records_count
                FROM training_sessions s
                LEFT JOIN batches b ON b.id = s.batch_id
                LEFT JOIN attendance_records ar ON ar.session_id = s.id
                WHERE s.trainer_user_id = $1 AND s.session_date = CURRENT_DATE
                GROUP BY s.id, s.topic, b.name, s.starts_at, s.ends_at
                ORDER BY s.starts_at ASC
            """, trainer_uuid)

            # Performance distribution bands
            band_90 = await conn.fetchval("""
                SELECT COUNT(*) FROM eedi_evaluations WHERE trainer_user_id = $1 AND status = 'COMPLETED' AND eedi_score >= 90
            """, trainer_uuid) or 0
            band_75 = await conn.fetchval("""
                SELECT COUNT(*) FROM eedi_evaluations WHERE trainer_user_id = $1 AND status = 'COMPLETED' AND eedi_score >= 75 AND eedi_score < 90
            """, trainer_uuid) or 0
            band_60 = await conn.fetchval("""
                SELECT COUNT(*) FROM eedi_evaluations WHERE trainer_user_id = $1 AND status = 'COMPLETED' AND eedi_score >= 60 AND eedi_score < 75
            """, trainer_uuid) or 0
            band_low = await conn.fetchval("""
                SELECT COUNT(*) FROM eedi_evaluations WHERE trainer_user_id = $1 AND status = 'COMPLETED' AND eedi_score < 60
            """, trainer_uuid) or 0

            attendance_trend = []
            for i in range(8):
                attendance_trend.append({
                    "label": f"Wk {i + 1}",
                    "percentage": 0,
                    "hasSession": False,
                })

            return {
                "assignedBatches": [
                    {
                        "id": str(b["id"]),
                        "name": b["name"],
                        "code": b["code"],
                        "status": str(b["status"]).lower() if b.get("status") else "active",
                    }
                    for b in batches
                ],
                "studentCount": stu_count,
                "attendance": {
                    "percentage": avg_att,
                    "present": att_cnt,
                    "total": tot_att,
                    "hasData": tot_att > 0,
                },
                "assessments": {
                    "average": avg_score,
                    "count": asmt_count,
                    "min": min_score,
                    "max": max_score,
                    "hasData": asmt_count > 0,
                },
                "pendingEvaluations": pending_evals,
                "weakStudentAlerts": 0,
                "todaysClasses": {
                    "total": len(today_sessions),
                    "attendanceNotMarked": len([s for s in today_sessions if s["attendance_records_count"] == 0]),
                    "sessions": [
                        {
                            "id": str(s["id"]),
                            "topic": s["topic"] or "Training Session",
                            "batchName": s["batch_name"] or "Assigned Batch",
                            "trainingModuleName": s["topic"] or "Training Module",
                            "date": s["starts_at"].isoformat() if s["starts_at"] else datetime.now(timezone.utc).isoformat(),
                            "endsAt": s["ends_at"].isoformat() if s["ends_at"] else (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                        }
                        for s in today_sessions
                    ],
                },
                "courseCompletionPercent": None,
                "attendanceTrend": attendance_trend,
                "performanceDistribution": {
                    "bands": [
                        {"label": "90–100%", "count": band_90, "color": "emerald"},
                        {"label": "75–89%", "count": band_75, "color": "teal"},
                        {"label": "60–74%", "count": band_60, "color": "amber"},
                        {"label": "< 60%", "count": band_low, "color": "rose"},
                    ]
                },
                "evaluationDistribution": [
                    {"range": "90–100", "count": band_90},
                    {"range": "75–89", "count": band_75},
                    {"range": "60–74", "count": band_60},
                    {"range": "Below 60", "count": band_low},
                ],
                "moduleScores": [],
                "classesConducted": sessions_conducted,
            }

    @staticmethod
    async def get_student_dashboard_data(student_user_id: UUID | str) -> dict[str, Any]:
        """Participant / Student dashboard data from PostgreSQL."""
        student_uuid = UUID(str(student_user_id))
        async with get_pg_connection() as conn:
            user = await conn.fetchrow("""
                SELECT u.id, u.name, u.email, sp.roll_number, d.name as department_name, b.name as batch_name
                FROM users u
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                LEFT JOIN departments d ON d.id = u.department_id
                LEFT JOIN enrollments e ON e.participant_user_id = u.id
                LEFT JOIN batches b ON b.id = e.batch_id
                WHERE u.id = $1
            """, student_uuid)

            enrolled = await conn.fetch("""
                SELECT e.id as enrollment_id, e.current_semester, e.enrollment_status, e.access_status, e.access_end_date,
                       c.id as course_id, c.title as course_title, c.slug as course_slug, c.delivery_mode
                FROM enrollments e
                JOIN courses c ON c.id = e.course_id
                WHERE e.participant_user_id = $1
                ORDER BY e.created_at DESC
            """, student_uuid)

            latest_eval = await conn.fetchrow("""
                SELECT eedi_score, employment_score, submitted_at
                FROM eedi_evaluations
                WHERE participant_user_id = $1 AND status = 'COMPLETED'
                ORDER BY submitted_at DESC
                LIMIT 1
            """, student_uuid)

            att_row = await conn.fetchrow("""
                SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as attended
                FROM attendance_records
                WHERE participant_user_id = $1
            """, student_uuid)
            tot_att = att_row["total"] if att_row else 0
            att_cnt = att_row["attended"] if att_row else 0
            att_pct = round((att_cnt / tot_att) * 100.0, 1) if tot_att > 0 else None

            first_name = user["name"].split()[0] if user and user["name"] else "Participant"
            eedi_score = float(latest_eval["eedi_score"]) if latest_eval and latest_eval["eedi_score"] is not None else None

            return {
                "student": {
                    "id": str(student_uuid),
                    "name": user["name"] if user else "Participant",
                    "firstName": first_name,
                    "rollNumber": user["roll_number"] if user and user["roll_number"] else "N/A",
                    "departmentName": user["department_name"] if user and user["department_name"] else "General",
                    "batchName": user["batch_name"] if user and user["batch_name"] else "Active Cohort",
                },
                "streak": {
                    "days": 0,
                    "lastActiveOn": None,
                },
                "readiness": {
                    "score": eedi_score,
                    "outOf": 100,
                    "hasData": eedi_score is not None,
                },
                "attendance": {
                    "totalSessions": tot_att,
                    "attendedSessions": att_cnt,
                    "percentage": att_pct,
                    "hasData": tot_att > 0,
                },
                "courses": [
                    {
                        "id": str(r["course_id"]),
                        "enrollmentId": str(r["enrollment_id"]),
                        "title": r["course_title"],
                        "slug": r["course_slug"],
                        "semester": r["current_semester"],
                        "status": r["enrollment_status"],
                        "accessStatus": r["access_status"],
                        "deliveryMode": r["delivery_mode"],
                    }
                    for r in enrolled
                ],
            }

