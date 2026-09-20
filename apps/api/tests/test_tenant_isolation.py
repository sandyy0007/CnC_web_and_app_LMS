"""Tenant isolation — the HOD SRS's non-negotiable rule.

"A CSE HOD at College A must never access College A ECE, College A Mechanical, or College B
anything — even if the frontend sends ?department_id=other."

These tests prove that cross-scope access is impossible at the API layer, that the attempt is
logged as a security event, and that the response never confirms whether the target exists.
"""
from __future__ import annotations

import pytest

from app.core.security import hash_password
from tests.conftest import API, error_code


@pytest.fixture
async def second_college(seeded_db):
    """A second institution, so cross-college isolation is testable end to end."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    existing = await seeded_db.colleges.find_one({"code": "XYZ"})
    if existing:
        college_id = existing["_id"]
        department = await seeded_db.departments.find_one({"collegeId": college_id})
        student = await seeded_db.student_profiles.find_one({"collegeId": college_id})
        return {
            "collegeId": college_id,
            "departmentId": department["_id"],
            "studentUserId": student["userId"],
        }

    college_id = (
        await seeded_db.colleges.insert_one(
            {"name": "XYZ Institute of Technology", "code": "XYZ", "status": "active",
             "createdAt": now, "updatedAt": now, "deletedAt": None, "version": 1}
        )
    ).inserted_id
    department_id = (
        await seeded_db.departments.insert_one(
            {"name": "Computer Science", "code": "CSE", "collegeId": college_id,
             "status": "active", "createdAt": now, "updatedAt": now, "deletedAt": None,
             "version": 1}
        )
    ).inserted_id
    batch_id = (
        await seeded_db.batches.insert_one(
            {"name": "Batch A", "code": "XYZ-CSE-A", "collegeId": college_id,
             "departmentId": department_id, "capacity": 60, "status": "active",
             "createdAt": now, "updatedAt": now, "deletedAt": None, "version": 1}
        )
    ).inserted_id
    hod_id = (
        await seeded_db.users.insert_one(
            {"name": "XYZ HOD", "email": "hod@xyz.edu", "passwordHash": hash_password("Eedi@2026"),
             "role": "HOD", "collegeId": college_id, "departmentId": department_id,
             "status": "active", "emailVerified": True, "createdAt": now, "updatedAt": now,
             "deletedAt": None, "version": 1}
        )
    ).inserted_id
    await seeded_db.departments.update_one(
        {"_id": department_id}, {"$set": {"hodUserId": hod_id}}
    )
    student_user_id = (
        await seeded_db.users.insert_one(
            {"name": "XYZ Student", "email": "student@xyz.edu",
             "passwordHash": hash_password("Eedi@2026"), "role": "STUDENT",
             "collegeId": college_id, "departmentId": department_id, "status": "active",
             "emailVerified": True, "createdAt": now, "updatedAt": now, "deletedAt": None,
             "version": 1}
        )
    ).inserted_id
    await seeded_db.student_profiles.insert_one(
        {"userId": student_user_id, "name": "XYZ Student", "rollNumber": "XYZ21B001",
         "collegeId": college_id, "departmentId": department_id, "batchId": batch_id,
         "batchName": "Batch A", "status": "active", "createdAt": now, "updatedAt": now,
         "deletedAt": None, "version": 1}
    )
    return {
        "collegeId": college_id,
        "departmentId": department_id,
        "studentUserId": student_user_id,
    }


async def _security_events(seeded_db, user_id, kind="scope_denied") -> int:
    return await seeded_db.security_events.count_documents({"kind": kind, "userId": user_id})


# ------------------------------------------------------------------ HOD ↔ HOD (same college)
async def test_hod_dashboard_only_counts_its_own_department(hod, other_hod, seeded_db):
    import bson

    cse = (await hod.get("/hod/dashboard")).json()["data"]
    aids = (await other_hod.get("/hod/dashboard")).json()["data"]

    assert cse["scope"]["departmentCode"] == "CSE"
    assert aids["scope"]["departmentCode"] == "AIDS"

    # Each KPI equals a live, department-scoped count — proving it is computed per scope and
    # not a constant baked into the response.
    for session, payload in ((hod, cse), (other_hod, aids)):
        live = await seeded_db.student_profiles.count_documents(
            {
                "departmentId": bson.ObjectId(session.user["departmentId"]),
                "deletedAt": None,
            }
        )
        assert payload["kpis"]["participants"]["value"] == live

    # 428 CSE participants vs 72 in AI/Data Science: the two are plainly different datasets.
    assert cse["kpis"]["participants"]["value"] >= 428
    assert aids["kpis"]["participants"]["value"] == 72


async def test_manipulated_department_query_param_is_ignored_or_rejected(hod, other_hod, seeded_db):
    """`GET /participants?departmentId=<other>` must never return the other department."""
    target = other_hod.user["departmentId"]
    before = await _security_events(seeded_db, __import__("bson").ObjectId(hod.user["id"]))

    response = await hod.get("/hod/participants", params={"departmentId": target})
    assert response.status_code == 403
    assert error_code(response) == "SCOPE_FORBIDDEN"
    assert response.json()["error"]["message"] == "You don't have access to this resource"

    after = await _security_events(seeded_db, __import__("bson").ObjectId(hod.user["id"]))
    assert after > before, "the rejected cross-scope attempt must be logged"


async def test_hod_cannot_open_a_participant_from_another_department(hod, other_hod, seeded_db):
    outsider = await seeded_db.student_profiles.find_one(
        {"departmentId": __import__("bson").ObjectId(other_hod.user["departmentId"])}
    )
    response = await hod.get(f"/hod/participants/{outsider['userId']}")
    assert response.status_code == 403
    # The message is identical to a non-existent id, so existence is not confirmed.
    ghost = await hod.get(f"/hod/participants/{'0' * 24}")
    assert response.json()["error"]["message"] == ghost.json()["error"]["message"]


async def test_hod_attendance_filters_cannot_widen_scope(hod, other_hod, seeded_db):
    other_batch = await seeded_db.batches.find_one(
        {"departmentId": __import__("bson").ObjectId(other_hod.user["departmentId"])}
    )
    response = await hod.get("/hod/attendance", params={"batchId": str(other_batch["_id"])})
    assert response.status_code == 403


async def test_hod_cannot_change_an_enrollment_in_another_department(hod, other_hod, seeded_db):
    outside = await seeded_db.enrollments.find_one(
        {"departmentId": __import__("bson").ObjectId(other_hod.user["departmentId"])}
    )
    response = await hod.patch(
        f"/hod/enrollments/{outside['_id']}/status",
        json={"status": "on_hold", "reason": "attempted cross-department write"},
    )
    assert response.status_code == 403
    unchanged = await seeded_db.enrollments.find_one({"_id": outside["_id"]})
    assert unchanged["status"] == outside["status"]


async def test_hod_audit_log_is_department_scoped(hod, other_hod):
    cse = (await hod.get("/hod/audit-logs", params={"days": 365})).json()
    aids = (await other_hod.get("/hod/audit-logs", params={"days": 365})).json()
    assert cse["data"]["scope"]["departmentCode"] == "CSE"
    assert aids["data"]["totalEvents"] <= cse["data"]["totalEvents"]
    for row in cse["items"]:
        assert row.get("departmentId") in (None, hod.user["departmentId"])


async def test_hod_actor_filter_cannot_reach_another_departments_trail(hod, other_hod):
    response = await hod.get(
        "/hod/audit-logs", params={"actorId": other_hod.user["id"], "days": 365}
    )
    # Allowed to ask, but the department scope still applies — no foreign rows come back.
    assert response.status_code == 200
    for row in response.json()["items"]:
        assert row.get("departmentId") in (None, hod.user["departmentId"])


# ------------------------------------------------------------------ cross-college
async def test_hod_cannot_reach_another_college(hod, second_college):
    response = await hod.get(
        "/hod/participants", params={"departmentId": str(second_college["departmentId"])}
    )
    assert response.status_code == 403

    profile = await hod.get(f"/hod/participants/{second_college['studentUserId']}")
    assert profile.status_code == 403


async def test_admin_cannot_reach_another_college(admin, second_college):
    for url, params in (
        ("/admin/batches", {"departmentId": str(second_college["departmentId"])}),
        ("/admin/semesters", {"departmentId": str(second_college["departmentId"])}),
        ("/admin/audit-logs", {"departmentId": str(second_college["departmentId"])}),
    ):
        response = await admin.get(url, params=params)
        assert response.status_code == 403, f"{url} leaked another college"


async def test_admin_cannot_create_a_batch_in_another_colleges_department(admin, second_college):
    response = await admin.post(
        "/admin/batches",
        json={
            "name": "Injected batch",
            "code": "HACK-1",
            "departmentId": str(second_college["departmentId"]),
        },
    )
    assert response.status_code == 403


async def test_admin_department_list_is_own_institution_only(admin, second_college, seeded_db):
    response = await admin.get("/admin/departments")
    rows = response.json()["data"]
    codes = {d["code"] for d in rows}
    # The seeded faculties are all present (other tests add more to this shared database)…
    assert codes >= {"CSE", "ECE", "MECH", "AIDS", "IT", "CIVIL", "EEE"}
    # …and every row belongs to this admin's own college — the other college's is not among them.
    assert str(second_college["departmentId"]) not in {d["id"] for d in rows}
    own_college_id = (await admin.get("/auth/me")).json()["data"]["collegeId"]
    departments = await seeded_db.departments.find(
        {"_id": {"$in": [__import__("bson").ObjectId(d["id"]) for d in rows]}}
    ).to_list(length=200)
    assert {str(d["collegeId"]) for d in departments} == {own_college_id}


# ------------------------------------------------------------------ trainer scope
async def test_trainer_only_sees_assigned_batches(trainer, seeded_db):
    response = await trainer.get("/trainer/batches")
    assigned = {b["id"] for b in response.json()["data"]}
    me = (await trainer.get("/auth/me")).json()["data"]
    assert assigned == set(me["assignedBatchIds"])
    assert assigned, "the seeded trainer must have assignments"


async def test_trainer_cannot_query_an_unassigned_batch(trainer, other_trainer, seeded_db):
    mine = set((await trainer.get("/auth/me")).json()["data"]["assignedBatchIds"])
    theirs = set((await other_trainer.get("/auth/me")).json()["data"]["assignedBatchIds"])
    foreign = next(iter(theirs - mine))
    response = await trainer.get(f"/trainer/batches/{foreign}/students")
    assert response.status_code == 403


async def test_trainer_cannot_mark_attendance_on_another_trainers_session(
    trainer, seeded_db
):
    """Attendance may only be recorded for a session the trainer actually runs."""
    import bson

    mine = bson.ObjectId(trainer.user["id"])
    foreign_session = await seeded_db.training_sessions.find_one(
        {"trainerUserId": {"$ne": mine}, "status": "completed"}
    )
    student = await seeded_db.student_profiles.find_one(
        {"batchId": foreign_session["batchId"]}
    )
    response = await trainer.post(
        "/trainer/attendance",
        json={
            "trainingSessionId": str(foreign_session["_id"]),
            "entries": [{"studentUserId": str(student["userId"]), "status": "present"}],
            "overwrite": True,
        },
    )
    assert response.status_code == 403


async def test_trainer_cannot_evaluate_a_student_outside_assigned_batches(
    trainer, other_trainer, seeded_db
):
    import bson

    theirs = set(
        bson.ObjectId(b)
        for b in (await other_trainer.get("/auth/me")).json()["data"]["assignedBatchIds"]
    )
    mine = set(
        bson.ObjectId(b) for b in (await trainer.get("/auth/me")).json()["data"]["assignedBatchIds"]
    )
    outsider = await seeded_db.student_profiles.find_one(
        {"batchId": {"$in": list(theirs - mine)}}
    )
    module = await seeded_db.training_modules.find_one({})
    response = await trainer.post(
        "/trainer/evaluations",
        json={
            "studentUserId": str(outsider["userId"]),
            "trainingModuleId": str(module["_id"]),
            "parameterScores": [{"code": "COM01", "score": 4}],
        },
    )
    assert response.status_code == 403


async def test_trainer_student_search_never_returns_outside_scope(trainer, seeded_db):
    import bson

    assigned = set(
        bson.ObjectId(b) for b in (await trainer.get("/auth/me")).json()["data"]["assignedBatchIds"]
    )
    response = await trainer.get("/trainer/students", params={"pageSize": 100})
    for row in response.json()["items"]:
        assert bson.ObjectId(row["batchId"]) in assigned


# ------------------------------------------------------------------ student self-scope
async def test_student_cannot_read_another_students_practice_session(student, seeded_db):
    import bson

    other = await seeded_db.practice_sessions.find_one(
        {"studentUserId": {"$ne": bson.ObjectId(student.user["id"])}}
    )
    if other is None:
        pytest.skip("only one participant has practice sessions in the seed")
    response = await student.get(f"/student/practice/sessions/{other['_id']}")
    assert response.status_code == 403


async def test_student_practice_list_is_own_records_only(student, seeded_db):
    response = await student.get("/student/practice/sessions", params={"pageSize": 100})
    for row in response.json()["items"]:
        assert row["studentUserId"] == student.user["id"]


async def test_student_certificates_are_own_only(student):
    response = await student.get("/student/certificates")
    for row in response.json()["data"]:
        assert row["studentUserId"] == student.user["id"]


# ------------------------------------------------------------------ role boundaries
@pytest.mark.parametrize(
    "url",
    ["/hod/dashboard", "/trainer/dashboard", "/admin/dashboard"],
)
async def test_student_cannot_reach_staff_portals(student, url):
    response = await student.get(url)
    assert response.status_code == 403
    assert error_code(response) in ("ROLE_FORBIDDEN", "SCOPE_FORBIDDEN")


@pytest.mark.parametrize("url", ["/admin/dashboard", "/admin/users", "/student/dashboard"])
async def test_hod_cannot_reach_admin_or_student_portals(hod, url):
    response = await hod.get(url)
    assert response.status_code == 403


async def test_trainer_cannot_reach_admin_portal(trainer):
    assert (await trainer.get("/admin/users")).status_code == 403
    assert (await trainer.post("/admin/departments", json={"name": "X", "code": "X"})).status_code == 403


async def test_role_denial_is_logged_as_a_security_event(student, seeded_db):
    import bson

    before = await _security_events(
        seeded_db, bson.ObjectId(student.user["id"]), kind="role_denied"
    )
    await student.get("/admin/dashboard")
    after = await _security_events(
        seeded_db, bson.ObjectId(student.user["id"]), kind="role_denied"
    )
    assert after > before


async def test_repeated_cross_scope_attempts_raise_an_anomaly_event(hod, other_hod, seeded_db):
    """Five denials inside the window should flag a possible scraping attempt (SRS §14.4)."""
    import bson

    target = other_hod.user["departmentId"]
    for _ in range(5):
        await hod.get("/hod/participants", params={"departmentId": target})
    anomalies = await seeded_db.security_events.count_documents(
        {"kind": "scope_denial_anomaly", "userId": bson.ObjectId(hod.user["id"])}
    )
    assert anomalies >= 1


# ------------------------------------------------------------------ reports & exports
async def test_report_export_is_scoped_to_the_requester(hod, other_hod):
    cse = await hod.post(
        "/hod/reports", json={"reportType": "attendance", "format": "csv"}
    )
    aids = await other_hod.post(
        "/hod/reports", json={"reportType": "attendance", "format": "csv"}
    )
    assert cse.status_code == aids.status_code == 202
    # Row counts differ because each export only contains its own department.
    assert cse.json()["data"]["rowCount"] != aids.json()["data"]["rowCount"]


async def test_one_hod_cannot_download_another_hods_export(hod, other_hod):
    created = await other_hod.post(
        "/hod/reports", json={"reportType": "enrollment", "format": "csv"}
    )
    export_id = created.json()["data"].get("exportId")
    assert export_id, created.text
    response = await hod.get(f"/reports/download/{export_id}")
    assert response.status_code == 403


async def test_signed_download_link_is_required_for_report_files(hod):
    created = await hod.post(
        "/hod/reports", json={"reportType": "certification", "format": "xlsx"}
    )
    url = created.json()["data"]["downloadUrl"]
    assert "token=" in url, "report files must only be served through a signed, expiring link"


async def test_tampered_signed_token_is_refused(client, hod):
    created = await hod.post("/hod/reports", json={"reportType": "attendance", "format": "csv"})
    url = created.json()["data"]["downloadUrl"]
    token = url.split("token=")[1].split("&")[0]
    bad = token[:-4] + "0000"
    response = await client.get(f"{API}/files/signed", params={"token": bad})
    assert response.status_code == 401


# ------------------------------------------------------------------ security events & sessions
async def test_admin_system_health_counts_only_its_own_institution(
    admin, second_college, seeded_db
):
    """System-health figures are per-institution.

    Regression: `errors24h`, `securityEvents24h` and `activeSessions` were counted with unscoped
    queries, so one college's admin was shown totals that included every other college.
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    foreign_college = second_college["collegeId"]

    baseline = (await admin.get("/admin/system-health")).json()["data"]
    baseline_sessions = (await admin.get("/admin/ai-usage")).json()["data"]["activeSessions"]

    await seeded_db.security_events.insert_many(
        [
            {"kind": "login_failed", "userId": second_college["studentUserId"],
             "collegeId": foreign_college, "departmentId": second_college["departmentId"],
             "detail": "foreign security event", "at": now},
        ]
    )
    await seeded_db.system_events.insert_one(
        {"kind": "score_recompute_failed", "collegeId": foreign_college,
         "detail": "foreign failure", "at": now}
    )
    await seeded_db.refresh_sessions.insert_one(
        {"userId": second_college["studentUserId"], "collegeId": foreign_college,
         "sessionId": "foreign-session", "familyId": "foreign-family", "revokedAt": None,
         "createdAt": now, "lastUsedAt": now}
    )

    after = (await admin.get("/admin/system-health")).json()["data"]
    assert after["securityEvents24h"] == baseline["securityEvents24h"]
    assert after["errors24h"] == baseline["errors24h"]

    after_sessions = (await admin.get("/admin/ai-usage")).json()["data"]["activeSessions"]
    assert after_sessions == baseline_sessions


async def test_admin_audit_log_never_returns_another_colleges_security_events(
    admin, second_college, seeded_db
):
    """The audit-log meta returns raw security-event documents — ids, IPs, request paths.

    Regression: it read them with an unscoped `find()`, disclosing up to 25 documents from every
    institution on the platform.
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    await seeded_db.security_events.insert_one(
        {"kind": "scope_denied", "userId": second_college["studentUserId"],
         "collegeId": second_college["collegeId"],
         "departmentId": second_college["departmentId"],
         "detail": "XYZ-ONLY-MARKER", "ip": "203.0.113.9", "at": now}
    )

    body = (await admin.get("/admin/audit-logs")).json()
    events = body["meta"]["securityEvents"]
    assert all("XYZ-ONLY-MARKER" not in (event.get("detail") or "") for event in events)
    own_college = admin.user["collegeId"]
    for event in events:
        assert event.get("collegeId") == own_college, event


async def test_super_admin_still_sees_platform_wide_security_events(
    super_admin, second_college, seeded_db
):
    """Scoping the reads must not blind the one role whose scope IS the platform."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    await seeded_db.security_events.insert_one(
        {"kind": "scope_denied", "userId": second_college["studentUserId"],
         "collegeId": second_college["collegeId"],
         "departmentId": second_college["departmentId"],
         "detail": "PLATFORM-VISIBLE-MARKER", "ip": "203.0.113.10", "at": now}
    )
    body = (await super_admin.get("/admin/audit-logs")).json()
    details = [event.get("detail") or "" for event in body["meta"]["securityEvents"]]
    assert any("PLATFORM-VISIBLE-MARKER" in detail for detail in details)


async def test_security_events_are_stamped_with_the_tenant_that_caused_them(
    hod, other_hod, seeded_db
):
    """A denial has to be attributable to an institution, or it cannot be read back safely."""
    import bson

    await hod.get("/hod/participants", params={"departmentId": other_hod.user["departmentId"]})
    event = await seeded_db.security_events.find_one(
        {"kind": "scope_denied", "userId": bson.ObjectId(hod.user["id"])}, sort=[("at", -1)]
    )
    assert event is not None
    assert event.get("collegeId") == bson.ObjectId(hod.user["collegeId"])
    assert event.get("departmentId") == bson.ObjectId(hod.user["departmentId"])


async def test_login_stamps_the_session_with_its_institution(admin, seeded_db):
    """`activeSessions` can only be per-institution if the session records its institution."""
    import bson

    record = await seeded_db.refresh_sessions.find_one(
        {"userId": bson.ObjectId(admin.user["id"])}, sort=[("createdAt", -1)]
    )
    assert record is not None
    assert record.get("collegeId") == bson.ObjectId(admin.user["collegeId"])
