"""Tests for Payment Status, Course Access, and Course Navigation Lifecycles.

Verifies:
1. Verified payment grants access to exact course and unlocks content.
2. Verified paid enrollment is not blocked by trial date expiry (lifetime access).
3. Active/expired trial is converted to CONVERTED upon payment verification.
4. Already verified course cannot be purchased again (prevents double purchase).
5. Duplicate UTR / transaction ref cannot be reused.
6. Course resolution by UUID and slug works identically.
7. Unenrolled/unpaid course returns hasAccess = False.
"""
from __future__ import annotations

import uuid
import pytest
from datetime import datetime, timezone, timedelta

from app.core.config import settings
from app.services import payment_service, trial_service
from app.services.content_auth_service import authorize_course_content_access
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.errors import Conflict, NotFound, ScopeForbidden
from app.db.postgres import get_pg_connection


@pytest.fixture(autouse=True)
def pg_setup():
    """Ensure PostgreSQL is active for tests."""
    old = settings.USE_POSTGRES
    settings.USE_POSTGRES = True
    yield
    settings.USE_POSTGRES = old


@pytest.mark.asyncio
async def test_verified_course_payment_grants_access():
    """Verified course payment grants lifetime access and converts trial."""
    uid = uuid.uuid4()
    cid = uuid.uuid4()
    inst_id = uuid.uuid4()
    slug = f"course-access-test-{uuid.uuid4().hex[:8]}"

    async with get_pg_connection() as conn:
        # Create institution, user, and course
        await conn.execute(
            "INSERT INTO institutions (id, name, code, status) VALUES ($1, 'Test College', $2, 'ACTIVE')",
            inst_id, f"TC_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, status, institution_id)
            VALUES ($1, $2, 'hashed', 'Access Test Student', 'STUDENT', 'ACTIVE', $3)
            """,
            uid, f"access_{uuid.uuid4().hex[:8]}@example.com", inst_id
        )
        await conn.execute(
            """
            INSERT INTO courses (id, title, slug, code, fee, published, trial_enabled, trial_duration_days)
            VALUES ($1, 'Test Access Course', $2, $3, 2499.00, TRUE, TRUE, 3)
            """,
            cid, slug, f"CODE_{uuid.uuid4().hex[:6]}"
        )

    try:
        # 1. Activate trial
        trial = await trial_service.activate_course_trial(uid, inst_id, cid)
        assert trial["status"] in ("active", "ACTIVE")

        # 2. Check access before payment
        access_before = await trial_service.check_course_access(uid, cid)
        assert access_before["hasAccess"] is True
        assert access_before["accessType"] == "trial"

        # 3. Simulate trial expiration in DB (e.g. 4 days ago)
        past_date = datetime.now(timezone.utc) - timedelta(days=4)
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE course_trials
                SET started_at = $2, expires_at = $3, status = 'EXPIRED'
                WHERE participant_user_id = $1 AND course_id = $4
                """,
                uid, past_date - timedelta(days=3), past_date, cid
            )
            await conn.execute(
                """
                UPDATE enrollments
                SET access_start_date = $2, access_end_date = $3
                WHERE participant_user_id = $1 AND course_id = $4
                """,
                uid, (past_date - timedelta(days=3)).date(), past_date.date(), cid
            )

        # Access should now be denied
        access_expired = await trial_service.check_course_access(uid, cid)
        assert access_expired["hasAccess"] is False
        assert access_expired["accessType"] == "expired_trial"

        # 4. Checkout payment
        utr = f"UTR{uuid.uuid4().hex[:8].upper()}"
        pay_res = await payment_service.create_course_payment(
            student_user_id=uid,
            college_id=inst_id,
            course_id=cid,
            course_mode="ONLINE",
            payment_method="UPI",
            transaction_ref=utr,
        )
        assert pay_res["transactionRef"] == utr
        pay_id = uuid.UUID(pay_res["id"])

        # 5. Super Admin verifies payment
        admin_uid = uuid.uuid4()
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO users (id, email, password_hash, name, role, status)
                VALUES ($1, $2, 'hashed', 'Super Admin Test', 'SUPER_ADMIN', 'ACTIVE')
                """,
                admin_uid, f"admin_{uuid.uuid4().hex[:8]}@example.com"
            )
        verify_res = await payment_service.verify_course_payment(pay_id, admin_uid, "Verified for testing")
        assert verify_res["success"] is True

        # 6. Verify enrollment is ACTIVE with NULL access_end_date (lifetime access)
        async with get_pg_connection() as conn:
            enr = await conn.fetchrow(
                "SELECT payment_status, access_status, access_end_date FROM enrollments WHERE participant_user_id = $1 AND course_id = $2",
                uid, cid
            )
        assert enr["payment_status"] == "VERIFIED"
        assert enr["access_status"] == "ACTIVE"
        assert enr["access_end_date"] is None

        # 7. Verify trial is CONVERTED
        trials_list = await trial_service.get_student_trials(uid)
        assert len(trials_list) == 1
        assert trials_list[0]["status"] == "converted"
        assert trials_list[0]["isPaid"] is True

        # 8. Check access via trial_service and content_auth_service
        access_after = await trial_service.check_course_access(uid, cid)
        assert access_after["hasAccess"] is True
        assert access_after["accessType"] == "paid"

        ctx = ScopeContext(user_id=uid, role=Role.STUDENT, college_id=inst_id, department_id=None, session_id="test_sess")
        auth_res = await authorize_course_content_access(ctx, cid)
        assert auth_res["authorized"] is True
        assert auth_res["accessType"] == "paid"

        # 9. Also verify access by course slug
        slug_auth_res = await authorize_course_content_access(ctx, slug)
        assert slug_auth_res["authorized"] is True
        assert slug_auth_res["accessType"] == "paid"

        # 10. Attempting duplicate purchase of the same course must be rejected
        with pytest.raises(Conflict):
            await payment_service.create_course_payment(
                student_user_id=uid,
                college_id=inst_id,
                course_id=cid,
                course_mode="ONLINE",
                payment_method="UPI",
                transaction_ref=f"UTR{uuid.uuid4().hex[:8].upper()}",
            )

    finally:
        # Cleanup
        async with get_pg_connection() as conn:
            await conn.execute("DELETE FROM course_trials WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM payments WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM enrollment_periods WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM enrollments WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM users WHERE id IN ($1, $2)", uid, admin_uid)
            await conn.execute("DELETE FROM courses WHERE id = $1", cid)
            await conn.execute("DELETE FROM institutions WHERE id = $1", inst_id)


@pytest.mark.asyncio
async def test_duplicate_payment_prevention():
    """Verify duplicate transaction reference is rejected with 409 Conflict."""
    uid = uuid.uuid4()
    cid = uuid.uuid4()
    inst_id = uuid.uuid4()
    shared_utr = f"UTR_DUP_{uuid.uuid4().hex[:6].upper()}"

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code, status) VALUES ($1, 'Dup Inst', $2, 'ACTIVE')",
            inst_id, f"D_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, status, institution_id)
            VALUES ($1, $2, 'hashed', 'Dup User', 'STUDENT', 'ACTIVE', $3)
            """,
            uid, f"dup_{uuid.uuid4().hex[:8]}@example.com", inst_id
        )
        await conn.execute(
            """
            INSERT INTO courses (id, title, slug, code, fee, published)
            VALUES ($1, 'Course Dup', $2, $3, 1999.00, TRUE)
            """,
            cid, f"slug-dup-{uuid.uuid4().hex[:6]}", f"C_{uuid.uuid4().hex[:6]}"
        )

    try:
        res1 = await payment_service.create_course_payment(
            student_user_id=uid,
            college_id=inst_id,
            course_id=cid,
            course_mode="ONLINE",
            payment_method="UPI",
            transaction_ref=shared_utr,
        )
        assert res1["transactionRef"] == shared_utr

        with pytest.raises(Conflict):
            await payment_service.create_course_payment(
                student_user_id=uid,
                college_id=inst_id,
                course_id=cid,
                course_mode="ONLINE",
                payment_method="UPI",
                transaction_ref=shared_utr,
            )
    finally:
        async with get_pg_connection() as conn:
            await conn.execute("DELETE FROM payments WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM enrollment_periods WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM enrollments WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM users WHERE id = $1", uid)
            await conn.execute("DELETE FROM courses WHERE id = $1", cid)
            await conn.execute("DELETE FROM institutions WHERE id = $1", inst_id)


@pytest.mark.asyncio
async def test_course_isolation_access():
    """Verify access to Course A does not grant access to Course B."""
    uid = uuid.uuid4()
    cid_a = uuid.uuid4()
    cid_b = uuid.uuid4()
    inst_id = uuid.uuid4()

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code, status) VALUES ($1, 'Iso Inst', $2, 'ACTIVE')",
            inst_id, f"ISO_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, status, institution_id)
            VALUES ($1, $2, 'hashed', 'Iso Student', 'STUDENT', 'ACTIVE', $3)
            """,
            uid, f"iso_{uuid.uuid4().hex[:8]}@example.com", inst_id
        )
        await conn.execute(
            """
            INSERT INTO courses (id, title, slug, code, fee, published)
            VALUES ($1, 'Course Isolated A', $2, $3, 1500.00, TRUE)
            """,
            cid_a, f"iso-a-{uuid.uuid4().hex[:6]}", f"ISOA_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            """
            INSERT INTO courses (id, title, slug, code, fee, published)
            VALUES ($1, 'Course Isolated B', $2, $3, 1500.00, TRUE)
            """,
            cid_b, f"iso-b-{uuid.uuid4().hex[:6]}", f"ISOB_{uuid.uuid4().hex[:6]}"
        )

    try:
        # User pays for Course A only
        pay_res = await payment_service.create_course_payment(
            student_user_id=uid,
            college_id=inst_id,
            course_id=cid_a,
            course_mode="ONLINE",
            payment_method="UPI",
            transaction_ref=f"UTR{uuid.uuid4().hex[:8].upper()}",
        )
        admin_id = uuid.uuid4()
        async with get_pg_connection() as conn:
            await conn.execute(
                "INSERT INTO users (id, email, password_hash, name, role, status) VALUES ($1, $2, 'hashed', 'Admin', 'SUPER_ADMIN', 'ACTIVE')",
                admin_id, f"adm_{uuid.uuid4().hex[:8]}@example.com"
            )
        await payment_service.verify_course_payment(uuid.UUID(pay_res["id"]), admin_id, "Verified A")

        # Course A must be granted
        acc_a = await trial_service.check_course_access(uid, cid_a)
        assert acc_a["hasAccess"] is True
        assert acc_a["accessType"] == "paid"

        # Course B must be denied
        acc_b = await trial_service.check_course_access(uid, cid_b)
        assert acc_b["hasAccess"] is False

        ctx = ScopeContext(user_id=uid, role=Role.STUDENT, college_id=inst_id, department_id=None, session_id="test_sess")
        with pytest.raises(ScopeForbidden):
            await authorize_course_content_access(ctx, cid_b)
    finally:
        async with get_pg_connection() as conn:
            await conn.execute("DELETE FROM payments WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM enrollment_periods WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM enrollments WHERE participant_user_id = $1", uid)
            await conn.execute("DELETE FROM users WHERE id IN ($1, $2)", uid, admin_id)
            await conn.execute("DELETE FROM courses WHERE id IN ($1, $2)", cid_a, cid_b)
            await conn.execute("DELETE FROM institutions WHERE id = $1", inst_id)
