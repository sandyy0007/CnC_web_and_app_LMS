"""Tests for Final RBAC, Super Admin Provisioning, Dual Course Modes, and Payment Architecture."""
import pytest
from bson import ObjectId
from httpx import AsyncClient

from app.db.mongo import get_db
from tests.conftest import ACCOUNTS, API, Session, login


@pytest.mark.asyncio
async def test_super_admin_provision_and_activation(client: AsyncClient, super_admin: Session):
    """Verify Super Admin can provision staff accounts and the user can activate via single-use token."""
    db = get_db()
    college = await db.colleges.find_one({})
    assert college is not None

    # 1. Super Admin provisions a new Trainer
    payload = {
        "name": "Dr. Sarah Jenkins",
        "email": "sarah.jenkins@rvce.edu.in",
        "role": "TRAINER",
        "mobile": "+91 98877 66554",
        "employeeId": "TRN-RVCE-042",
        "collegeId": str(college["_id"]),
        "designation": "Lead Technical Trainer",
        "qualification": "M.Tech in CS",
        "specialization": "System Design & Algorithms",
    }
    res = await super_admin.post("/super-admin/users", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["success"] is True
    assert data["activationToken"] is not None
    assert data["activationUrl"].startswith("/activate?token=")
    assert data["temporaryPassword"] is not None

    token = data["activationToken"]

    # 2. Database checks: starts in pending_verification
    user = await db.users.find_one({"email": "sarah.jenkins@rvce.edu.in"})
    assert user is not None
    assert user["status"] == "pending_verification"
    assert user["accountStatus"] == "pending_verification"
    assert user["mustChangePassword"] is True
    assert user["emailVerified"] is False

    # 3. Verify token endpoint checks
    verify_res = await client.get(f"{API}/auth/verify-activation-token?token={token}")
    assert verify_res.status_code == 200
    token_info = verify_res.json()["data"]
    assert token_info["email"] == "sarah.jenkins@rvce.edu.in"
    assert token_info["role"] == "TRAINER"

    # 4. User activates account and sets permanent password
    activate_res = await client.post(f"{API}/auth/activate", json={
        "token": token,
        "newPassword": "SecurePermanent#2026!",
    })
    assert activate_res.status_code == 200
    assert activate_res.json()["success"] is True

    # 5. Verify account is now active and can sign in
    activated_user = await db.users.find_one({"email": "sarah.jenkins@rvce.edu.in"})
    assert activated_user["status"] == "active"
    assert activated_user["accountStatus"] == "active"
    assert activated_user["emailVerified"] is True
    assert activated_user["mustChangePassword"] is False
    assert activated_user.get("activationToken") is None

    # Token cannot be reused
    reused_res = await client.post(f"{API}/auth/activate", json={
        "token": token,
        "newPassword": "AnotherPassword#2026!",
    })
    assert reused_res.status_code == 422 or reused_res.status_code == 400

    # User can now sign in with their permanent password
    session = await login(client, "sarah.jenkins@rvce.edu.in", "SecurePermanent#2026!")
    assert session.user["email"] == "sarah.jenkins@rvce.edu.in"
    assert session.user["mustChangePassword"] is False


@pytest.mark.asyncio
async def test_public_signup_rejects_privileged_roles(client: AsyncClient):
    """Public signup must strictly forbid non-STUDENT roles."""
    for role in ["ADMIN", "HOD", "TRAINER", "SUPER_ADMIN"]:
        res = await client.post(f"{API}/auth/signup", json={
            "name": f"Hacker {role}",
            "email": f"hacker.{role.lower()}@test.com",
            "password": "StrongPassword#2026!",
            "confirmPassword": "StrongPassword#2026!",
            "role": role,
        })
        assert res.status_code in (400, 403, 422), f"Expected forbidden for {role}, got {res.status_code}"


@pytest.mark.asyncio
async def test_direct_online_student_signup(client: AsyncClient):
    """Online students can sign up without mandatory college affiliation."""
    email = "online.direct.learner@gmail.com"
    res = await client.post(f"{API}/auth/signup", json={
        "name": "Direct Learner",
        "email": email,
        "password": "LearnerPass#2026!",
        "confirmPassword": "LearnerPass#2026!",
        "role": "STUDENT",
    })
    assert res.status_code == 201, res.text
    assert res.json()["success"] is True

    db = get_db()
    user = await db.users.find_one({"email": email})
    assert user is not None
    assert user["collegeId"] is None
    assert user["collegeName"] == "Winners Creek Online Platform"

    profile = await db.student_profiles.find_one({"userId": user["_id"]})
    assert profile is not None
    assert profile["isOnlineDirect"] is True


@pytest.mark.asyncio
async def test_super_admin_payment_verification_workflow(client: AsyncClient, super_admin: Session, student: Session):
    """Test full payment lifecycle: student checkout -> pending verification -> Super Admin verify/reject."""
    db = get_db()
    course = await db.courses.find_one({"deletedAt": None})
    assert course is not None

    # Student initiates checkout
    checkout_res = await student.post("/student/payments/checkout", json={
        "courseId": str(course["_id"]),
        "courseMode": "ONLINE",
        "paymentMethod": "UPI / NetBanking",
    })
    assert checkout_res.status_code == 200, checkout_res.text
    payment_data = checkout_res.json()["data"]
    payment_id = payment_data.get("id") or payment_data.get("_id")
    assert payment_data["status"] == "pending_verification"

    # Enrollment is created in pending_verification status
    enrollment = await db.enrollments.find_one({
        "studentUserId": ObjectId(student.user["id"]),
        "courseId": course["_id"],
    })
    assert enrollment is not None
    assert enrollment["status"] == "pending_verification"

    # Super Admin views verification queue
    queue_res = await super_admin.get("/super-admin/payments/verification-queue")
    assert queue_res.status_code == 200
    queue_items = queue_res.json()["data"]
    matching = [p for p in queue_items if p["id"] == str(payment_id)]
    assert len(matching) == 1
    assert matching[0]["courseMode"] == "ONLINE"

    # Super Admin verifies the payment
    verify_res = await super_admin.post(f"/super-admin/payments/{payment_id}/verify", json={
        "note": "Verified by accounts department",
    })
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "verified"

    # Enrollment is now active
    active_enrollment = await db.enrollments.find_one({
        "studentUserId": ObjectId(student.user["id"]),
        "courseId": course["_id"],
    })
    assert active_enrollment["status"] == "active"


@pytest.mark.asyncio
async def test_dual_course_mode_isolation(super_admin: Session, admin: Session, trainer: Session):
    """Institutional roles (Admin, Trainer) must NOT receive operational access to pure online platform courses."""
    # 1. Super Admin creates an Online-only platform course
    create_res = await super_admin.post("/super-admin/courses", json={
        "title": "Cloud AI Masterclass (Online)",
        "slug": f"cloud-ai-masterclass-online-{ObjectId()}",
        "description": "Pure direct online certification",
        "courseMode": "ONLINE",
        "availableModes": ["ONLINE"],
        "price": 3999.0,
    })
    assert create_res.status_code == 201
    course_data = create_res.json()["data"]
    online_course_id = course_data.get("id") or course_data.get("_id")

    # 2. College Admin / Trainer cannot manage this online course as an offline cohort
    from app.repositories.collections import EnrollmentRepo
    from app.authz.context import ScopeContext
    from app.authz.roles import Role
    from app.authz.guards import require_course_access
    from app.core.errors import ScopeForbidden

    admin_ctx = ScopeContext(
        user_id=ObjectId(admin.user["id"]),
        role=Role.ADMIN,
        college_id=ObjectId(admin.user["collegeId"]),
        department_id=None,
        session_id="test-session-admin",
    )
    repo = EnrollmentRepo(admin_ctx)
    scope = repo.scope_filter()
    # Offline scope enforcement check (pure ONLINE platform courses are strictly excluded):
    assert scope.get("courseMode") == {"$ne": "ONLINE"}

    # Institutional staff is blocked from operational access to online platform course
    with pytest.raises(ScopeForbidden):
        await require_course_access(admin_ctx, online_course_id)
