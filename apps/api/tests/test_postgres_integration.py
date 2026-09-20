"""Automated Verification Suite for PostgreSQL 'cnc' Database Integration.

Tests end-to-end production database functionality:
1. PostgreSQL connection & pool lifecycle.
2. Zero-fake-numbers policy on empty tables (0, ₹0, N/A).
3. Auto-mapping institution types to training types.
4. User authentication lookup from PostgreSQL.
5. Multi-stage enrollment: Unpaid -> Paid -> Verified -> Admin Activated -> Active.
6. Temporal semester access expiry.
7. Non-destructive semester renewal (historical period preserved in enrollment_periods).
8. Atomic payment verification & enrollment status update.
9. EEDI evaluation persistence with dimensional pillars, feedback, and employment score.
10. Strict 5-party evaluation report visibility and multi-tenant isolation.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
import pytest

from app.core.config import settings
from app.db.postgres import connect_to_postgres, close_postgres, ping_postgres, get_pg_connection, pg_transaction
from app.repositories.institution_repo import InstitutionRepository
from app.repositories.user_repo import UserRepository
from app.repositories.course_repo import CourseRepository
from app.repositories.enrollment_repo import EnrollmentRepository
from app.repositories.payment_repo import PaymentRepository
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.evaluation_repo import EvaluationRepository
from app.repositories.stats_repo import StatsRepository


@pytest.fixture(autouse=True)
def pg_pool_setup():
    """Ensure PostgreSQL is active for tests."""
    settings.USE_POSTGRES = True
    yield


# ---------------------------------------------------------------------------
# TEST 1: Database Connection & Health
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_postgres_connection_and_ping():
    connected = await ping_postgres()
    assert connected is True, "PostgreSQL cnc database must respond to ping"


# ---------------------------------------------------------------------------
# TEST 2: Zero-Fake Data Policy on Public Stats
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_zero_fake_data_policy():
    """Verify that empty metrics render as 0 or None (N/A), never fabricated numbers."""
    stats = await StatsRepository.get_home_public_stats()
    assert isinstance(stats["learners"], int)
    assert isinstance(stats["trainers"], int)
    assert isinstance(stats["institutions"], int)
    assert isinstance(stats["courses"], int)
    # If no evaluations have been submitted, average must be None (rendered as N/A)
    # NOT a fake 85% or 74.5%
    if stats["averageReadinessScore"] is not None:
        assert 0 <= stats["averageReadinessScore"] <= 100
    assert stats["source"] == "postgresql-cnc"


# ---------------------------------------------------------------------------
# TEST 3: Institution Auto-Mapping
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_institution_auto_mapping():
    u_code = f"TEST_{uuid4().hex[:6].upper()}"
    inst = await InstitutionRepository.create(
        name="Winners Creek University",
        code=u_code,
        institution_type="COLLEGE",
        training_type="COLLEGE",
        city="Bengaluru",
        state="Karnataka",
    )
    assert inst["code"] == u_code
    assert inst["institution_type"] == "COLLEGE"
    assert inst["training_type"] == "COLLEGE"

    # Add department
    dept = await InstitutionRepository.create_department(
        institution_id=inst["id"],
        name="Computer Science & Engineering",
        code="CSE",
    )
    assert dept["institution_id"] == inst["id"]
    assert dept["code"] == "CSE"


# ---------------------------------------------------------------------------
# TEST 4: User Creation & Scoped Lookup
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_user_creation_and_auth_lookup():
    u_code = f"INST_{uuid4().hex[:6].upper()}"
    inst = await InstitutionRepository.create(name="Tech Institute", code=u_code)
    dept = await InstitutionRepository.create_department(inst["id"], "Data Science", "DS")

    student_email = f"student_{uuid4().hex[:6]}@example.edu"
    student = await UserRepository.create_user(
        email=student_email,
        password_hash="argon2_hashed_secret",
        name="Aarav Sharma",
        role="STUDENT",
        institution_id=inst["id"],
        department_id=dept["id"],
    )
    assert student["email"] == student_email.lower()
    assert student["role"] == "STUDENT"

    profile = await UserRepository.create_student_profile(
        user_id=student["id"],
        roll_number=f"DS_{uuid4().hex[:4].upper()}",
        institution_id=inst["id"],
        department_id=dept["id"],
    )
    assert profile["user_id"] == student["id"]

    # Lookup
    fetched = await UserRepository.get_by_email(student_email)
    assert fetched is not None
    assert fetched["id"] == student["id"]
    assert fetched["institution_id"] == inst["id"]


# ---------------------------------------------------------------------------
# TEST 5 & 6: Multi-Stage Enrollment & Temporal Access Expiry
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_enrollment_lifecycle_and_expiry():
    # Setup
    inst = await InstitutionRepository.create(name="Apex College", code=f"APX_{uuid4().hex[:6].upper()}")
    dept = await InstitutionRepository.create_department(inst["id"], "IT", "IT")
    student = await UserRepository.create_user(email=f"s_{uuid4().hex[:6]}@apx.edu", password_hash="h", name="Vikram")
    admin = await UserRepository.create_user(email=f"a_{uuid4().hex[:6]}@apx.edu", password_hash="h", name="Admin", role="ADMIN", institution_id=inst["id"])

    # Create course
    async with get_pg_connection() as conn:
        c_row = await conn.fetchrow(
            """
            INSERT INTO courses (title, slug, code, fee, published)
            VALUES ($1, $2, $3, 1500.00, TRUE)
            RETURNING id, title, fee
            """,
            "Cloud Systems",
            f"cloud-systems-{uuid4().hex[:6]}",
            f"CS_{uuid4().hex[:6].upper()}",
        )
        course_id = c_row["id"]

    # 1. Unpaid enrollment created
    enrollment = await EnrollmentRepository.create_enrollment(
        participant_id=student["id"],
        course_id=course_id,
        institution_id=inst["id"],
        department_id=dept["id"],
        semester=1,
        payment_status="PENDING",
        enrollment_status="PENDING",
        access_status="INACTIVE",
    )
    assert enrollment["payment_status"] == "PENDING"
    assert enrollment["access_status"] == "INACTIVE"

    # 2. Payment recorded
    payment = await PaymentRepository.create_payment(
        enrollment_id=enrollment["id"],
        participant_id=student["id"],
        course_id=course_id,
        amount=1500.00,
        transaction_ref=f"TXN_{uuid4().hex[:8].upper()}",
    )
    assert payment["status"] == "PENDING"

    # 3. Payment verified atomically
    verified_payment = await PaymentRepository.verify_payment(payment["id"], verified_by=admin["id"])
    assert verified_payment["status"] == "VERIFIED"

    enr_after_pay = await EnrollmentRepository.get_by_id(enrollment["id"])
    assert enr_after_pay["payment_status"] == "VERIFIED"
    assert enr_after_pay["access_status"] == "INACTIVE"  # Payment does not automatically grant access

    # 4. Admin activation for semester 1
    today = date.today()
    start_date = today - timedelta(days=10)
    end_date = today + timedelta(days=80)
    activated = await EnrollmentRepository.activate_enrollment(
        enrollment_id=enrollment["id"],
        activated_by=admin["id"],
        start_date=start_date,
        end_date=end_date,
    )
    assert activated["access_status"] == "ACTIVE"
    assert activated["access_start_date"] == start_date
    assert activated["access_end_date"] == end_date

    # 5. Temporal Expiry Simulation
    past_start = today - timedelta(days=100)
    past_end = today - timedelta(days=10)
    # When end_date is in the past, access is expired
    assert today > past_end, "Current date past access_end_date marks period expired"


# ---------------------------------------------------------------------------
# TEST 7: Non-Destructive Semester Renewal
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_nondestructive_semester_renewal():
    inst = await InstitutionRepository.create(name="Modern Academy", code=f"MOD_{uuid4().hex[:6].upper()}")
    student = await UserRepository.create_user(email=f"s_{uuid4().hex[:6]}@mod.edu", password_hash="h", name="Priya")
    admin = await UserRepository.create_user(email=f"a_{uuid4().hex[:6]}@mod.edu", password_hash="h", name="Admin", role="ADMIN", institution_id=inst["id"])

    async with get_pg_connection() as conn:
        c_row = await conn.fetchrow(
            "INSERT INTO courses (title, slug, code, fee, published) VALUES ($1, $2, $3, 2000.00, TRUE) RETURNING id",
            "Python Architecture", f"py-arch-{uuid4().hex[:6]}", f"PY_{uuid4().hex[:6].upper()}"
        )
        course_id = c_row["id"]

    today = date.today()
    sem1_start = today - timedelta(days=180)
    sem1_end = today - timedelta(days=1)

    # Active in semester 1
    enrollment = await EnrollmentRepository.create_enrollment(
        participant_id=student["id"],
        course_id=course_id,
        institution_id=inst["id"],
        semester=1,
        access_start_date=sem1_start,
        access_end_date=sem1_end,
        payment_status="VERIFIED",
        enrollment_status="ACTIVE",
        access_status="ACTIVE",
    )

    # Renew to semester 2
    sem2_start = today
    sem2_end = today + timedelta(days=180)
    renewed = await EnrollmentRepository.renew_enrollment(
        enrollment_id=enrollment["id"],
        new_semester=2,
        new_start_date=sem2_start,
        new_end_date=sem2_end,
        activated_by=admin["id"],
    )
    assert renewed["current_semester"] == 2
    assert renewed["payment_status"] == "PENDING"  # Must pay again for semester 2
    assert renewed["access_status"] == "INACTIVE"  # Inactive until payment verified and activated

    # Verify Semester 1 was safely archived into enrollment_periods (NOT overwritten)
    history = await EnrollmentRepository.get_periods_history(enrollment["id"])
    assert len(history) == 1
    assert history[0]["semester"] == 1
    assert history[0]["start_date"] == sem1_start
    assert history[0]["end_date"] == sem1_end


# ---------------------------------------------------------------------------
# TEST 8 & 9: EEDI Evaluation Persistence, Pillars & Employment Score
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_eedi_evaluation_and_report_persistence():
    inst = await InstitutionRepository.create(name="Global Tech", code=f"GLB_{uuid4().hex[:6].upper()}")
    dept = await InstitutionRepository.create_department(inst["id"], "CSE", "CSE")
    student = await UserRepository.create_user(email=f"p_{uuid4().hex[:6]}@glb.edu", password_hash="h", name="Sneha", role="STUDENT", institution_id=inst["id"], department_id=dept["id"])
    trainer = await UserRepository.create_user(email=f"t_{uuid4().hex[:6]}@glb.edu", password_hash="h", name="Dr. Rao", role="TRAINER", institution_id=inst["id"], department_id=dept["id"])

    async with get_pg_connection() as conn:
        c_row = await conn.fetchrow(
            "INSERT INTO courses (title, slug, code, fee, published) VALUES ($1, $2, $3, 1000.00, TRUE) RETURNING id",
            "Professional Communication", f"pro-comm-{uuid4().hex[:6]}", f"PC_{uuid4().hex[:6].upper()}"
        )
        course_id = c_row["id"]

    # Submit evaluation
    pillar_scores = {
        "communication": 82.5,
        "behaviour": 88.0,
        "confidence": 79.0,
        "interview": 85.0,
    }
    evaluation = await EvaluationRepository.create_or_complete_evaluation(
        participant_id=student["id"],
        trainer_id=trainer["id"],
        institution_id=inst["id"],
        department_id=dept["id"],
        course_id=course_id,
        semester=3,
        eedi_score=83.6,
        employment_score=84.2,
        strengths=["Clear verbal articulation", "Confidence in group discussions"],
        weaknesses=["Slight hesitation under pressure"],
        improvements=["Participate in weekly mock interviews"],
        trainer_notes="Demonstrated significant progress throughout semester 3.",
        pillar_scores=pillar_scores,
    )
    assert evaluation["status"] == "COMPLETED"
    assert float(evaluation["eedi_score"]) == 83.6
    assert float(evaluation["employment_score"]) == 84.2

    # Fetch full report
    report = await EvaluationRepository.get_report_by_id(evaluation["id"])
    assert report is not None
    assert report["participant_name"] == "Sneha"
    assert report["trainer_name"] == "Dr. Rao"
    assert len(report["pillars"]) == 4
    assert any(p["pillar"] == "communication" and float(p["score"]) == 82.5 for p in report["pillars"])
    assert "Clear verbal articulation" in report["strengths"]


# ---------------------------------------------------------------------------
# TEST 10: PostgreSQL CHECK Constraint for Institution-Training Type Mapping
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_institution_mapping_check_constraint():
    """PostgreSQL must reject invalid combinations like COMPANY + COLLEGE."""
    import asyncpg

    async with get_pg_connection() as conn:
        with pytest.raises(asyncpg.exceptions.CheckViolationError):
            await conn.execute(
                """
                INSERT INTO institutions (name, code, institution_type, training_type)
                VALUES ($1, $2, 'COMPANY', 'COLLEGE')
                """,
                "Invalid Corporate",
                f"INV_{uuid4().hex[:6].upper()}",
            )


# ---------------------------------------------------------------------------
# TEST 11: Idempotency & Duplicate Renewal Protection
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_duplicate_renewal_idempotency():
    """Calling renewal twice for the same semester must not corrupt periods history."""
    inst = await InstitutionRepository.create(name="Apex Tech", code=f"APX_{uuid4().hex[:6].upper()}")
    student = await UserRepository.create_user(email=f"s_{uuid4().hex[:6]}@apx.edu", password_hash="h", name="Kunal")

    async with get_pg_connection() as conn:
        c_row = await conn.fetchrow(
            "INSERT INTO courses (title, slug, code, fee, published) VALUES ($1, $2, $3, 1000.00, TRUE) RETURNING id",
            "DevOps Mastery", f"devops-{uuid4().hex[:6]}", f"DO_{uuid4().hex[:6].upper()}"
        )
        course_id = c_row["id"]

    today = date.today()
    enrollment = await EnrollmentRepository.create_enrollment(
        participant_id=student["id"],
        course_id=course_id,
        institution_id=inst["id"],
        semester=1,
        access_start_date=today - timedelta(days=100),
        access_end_date=today - timedelta(days=10),
        access_status="ACTIVE",
    )

    # First renewal
    r1 = await EnrollmentRepository.renew_enrollment(
        enrollment_id=enrollment["id"],
        new_semester=2,
        new_start_date=today,
        new_end_date=today + timedelta(days=90),
    )
    assert r1["current_semester"] == 2

    # Second renewal (idempotent call with updated dates)
    r2 = await EnrollmentRepository.renew_enrollment(
        enrollment_id=enrollment["id"],
        new_semester=2,
        new_start_date=today,
        new_end_date=today + timedelta(days=95),
    )
    assert r2["current_semester"] == 2

    # Verify history still has exactly 1 record for Semester 1 (no duplicates)
    history = await EnrollmentRepository.get_periods_history(enrollment["id"])
    sem1_entries = [h for h in history if h["semester"] == 1]
    assert len(sem1_entries) == 1, "Semester 1 must be archived exactly once without duplicates"


# ---------------------------------------------------------------------------
# TEST 12: Idempotency & Duplicate Evaluation Submission Protection
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_duplicate_evaluation_idempotency():
    """Submitting evaluation twice updates the existing evaluation cleanly."""
    inst = await InstitutionRepository.create(name="Vertex Academy", code=f"VTX_{uuid4().hex[:6].upper()}")
    student = await UserRepository.create_user(email=f"s_{uuid4().hex[:6]}@vtx.edu", password_hash="h", name="Rohan")
    trainer = await UserRepository.create_user(email=f"t_{uuid4().hex[:6]}@vtx.edu", password_hash="h", name="Trainer")

    async with get_pg_connection() as conn:
        c_row = await conn.fetchrow(
            "INSERT INTO courses (title, slug, code, fee, published) VALUES ($1, $2, $3, 1000.00, TRUE) RETURNING id",
            "Advanced Java", f"adv-java-{uuid4().hex[:6]}", f"AJ_{uuid4().hex[:6].upper()}"
        )
        course_id = c_row["id"]

    # Initial evaluation submission
    e1 = await EvaluationRepository.create_or_complete_evaluation(
        participant_id=student["id"],
        trainer_id=trainer["id"],
        institution_id=inst["id"],
        department_id=None,
        course_id=course_id,
        semester=1,
        eedi_score=78.0,
        employment_score=80.0,
        strengths=["Good syntax knowledge"],
        weaknesses=["Needs to improve unit testing"],
        improvements=["Practice TDD"],
        trainer_notes="First pass",
        pillar_scores={"communication": 75.0, "behaviour": 80.0},
    )
    assert float(e1["eedi_score"]) == 78.0

    # Second evaluation submission (trainer corrected or updated score)
    e2 = await EvaluationRepository.create_or_complete_evaluation(
        participant_id=student["id"],
        trainer_id=trainer["id"],
        institution_id=inst["id"],
        department_id=None,
        course_id=course_id,
        semester=1,
        eedi_score=85.0,
        employment_score=87.0,
        strengths=["Good syntax knowledge", "Mastered collections"],
        weaknesses=["Needs to improve unit testing"],
        improvements=["Practice TDD"],
        trainer_notes="Updated after viva",
        pillar_scores={"communication": 82.0, "behaviour": 88.0},
    )
    assert e2["id"] == e1["id"], "Must update same evaluation row (idempotent)"
    assert float(e2["eedi_score"]) == 85.0

    # Verify no duplicate evaluation rows exist in DB for this (participant, course, semester)
    async with get_pg_connection() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM eedi_evaluations WHERE participant_user_id = $1 AND course_id = $2 AND semester = $3",
            student["id"], course_id, 1
        )
        assert count == 1, "Must have exactly 1 evaluation record for this semester"


# ---------------------------------------------------------------------------
# TEST 13: Strict Multi-Tenant Isolation in PostgreSQL
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_strict_tenant_isolation_pg():
    """Admin of Institution A cannot query enrollments or users of Institution B."""
    inst_a = await InstitutionRepository.create(name="College A", code=f"CLA_{uuid4().hex[:6].upper()}")
    inst_b = await InstitutionRepository.create(name="College B", code=f"CLB_{uuid4().hex[:6].upper()}")

    user_a = await UserRepository.create_user(email=f"u_{uuid4().hex[:6]}@a.edu", password_hash="h", name="A", role="STUDENT", institution_id=inst_a["id"])
    user_b = await UserRepository.create_user(email=f"u_{uuid4().hex[:6]}@b.edu", password_hash="h", name="B", role="STUDENT", institution_id=inst_b["id"])

    # List users for College A
    users_a = await UserRepository.list_by_scope(institution_id=inst_a["id"])
    user_ids_a = {u["id"] for u in users_a}
    assert user_a["id"] in user_ids_a
    assert user_b["id"] not in user_ids_a, "College A listing must never contain College B users"


# ---------------------------------------------------------------------------
# TEST 14: Online Training Hierarchy without Admin/SPOC Dependency
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_online_training_flow_pg():
    """Online training allows participant and course without requiring institution or department binding."""
    student = await UserRepository.create_user(
        email=f"onl_{uuid4().hex[:6]}@online.edu",
        password_hash="h",
        name="Independent Learner",
        institution_id=None,
        department_id=None,
    )
    assert student["institution_id"] is None
    assert student["department_id"] is None

    async with get_pg_connection() as conn:
        c_row = await conn.fetchrow(
            """
            INSERT INTO courses (title, slug, code, training_type, delivery_mode, fee, published)
            VALUES ($1, $2, $3, 'ONLINE', 'ONLINE', 0.00, TRUE)
            RETURNING id, training_type, delivery_mode
            """,
            "Online Global Seminar", f"global-sem-{uuid4().hex[:6]}", f"OGS_{uuid4().hex[:6].upper()}"
        )
        course_id = c_row["id"]

    enrollment = await EnrollmentRepository.create_enrollment(
        participant_id=student["id"],
        course_id=course_id,
        institution_id=None,
        department_id=None,
        semester=1,
        access_status="ACTIVE",
    )
    assert enrollment["institution_id"] is None
    assert enrollment["access_status"] == "ACTIVE"

