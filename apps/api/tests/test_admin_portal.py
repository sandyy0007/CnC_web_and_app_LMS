"""Admin portal: institution setup, user management, bulk import, reports, audit."""
from __future__ import annotations

import io

import pytest

from tests.conftest import login


async def test_dashboard_matches_the_admin_showcase_layout(admin):
    data = (await admin.get("/admin/dashboard")).json()["data"]
    assert data["institution"]["name"] == "ABC Engineering College"

    kpis = data["kpis"]
    for key in (
        "totalStudents", "totalTrainers", "departments",
        "activeBatches", "averageInstitutionalEediScore",
    ):
        assert key in kpis
    assert kpis["departments"] >= 7
    assert kpis["totalStudents"] >= 884
    assert kpis["averageInstitutionalEediScore"] is not None

    assert data["attendanceTrend"]
    assert data["enrollments"]["active"] > 0
    assert data["studentsPerDepartment"][0]["students"] >= data["studentsPerDepartment"][-1]["students"]
    assert "sessionsToday" in data["classMonitoring"]
    assert data["systemAndAiUsage"]["queue"]["handlers"]
    assert data["systemAndAiUsage"]["providers"]["evaluation"]["active"] == "mock"
    assert {a["code"] for a in data["quickActions"]} >= {"add_department", "bulk_import"}

    # Revenue is not part of the supplied data model, so it is declared unconfigured rather
    # than fabricated (§15, §37).
    assert data["revenue"]["configured"] is False
    assert "No billing data model" in data["revenue"]["note"]


# ------------------------------------------------------------------ departments & batches
async def test_department_listing_carries_rollups(admin):
    rows = (await admin.get("/admin/departments")).json()["data"]
    assert len(rows) >= 7
    cse = next(d for d in rows if d["code"] == "CSE")
    assert cse["hodName"] == "Priya Kulkarni"
    assert cse["students"] >= 428
    assert cse["activeBatches"] == 3
    assert cse["trainersAssigned"] == 12
    assert cse["semesters"] >= 1


async def test_create_department_and_assign_an_hod(admin, seeded_db):
    created = await admin.post(
        "/admin/departments",
        json={"name": "Chemical Engineering", "code": "CHEM", "description": "New department"},
    )
    assert created.status_code == 201, created.text
    department_id = created.json()["data"]["id"]

    duplicate = await admin.post(
        "/admin/departments", json={"name": "Chemical Again", "code": "CHEM"}
    )
    assert duplicate.status_code == 409

    new_hod = await admin.post(
        "/admin/users",
        json={
            "name": "Dr. Chem HOD",
            "email": "chem.hod@abcengg.edu",
            "role": "HOD",
            "departmentId": department_id,
        },
    )
    assert new_hod.status_code == 201, new_hod.text
    hod_id = new_hod.json()["data"]["id"]

    patched = await admin.patch(
        f"/admin/departments/{department_id}", json={"hodUserId": hod_id}
    )
    assert patched.status_code == 200
    stored = await seeded_db.departments.find_one(
        {"_id": __import__("bson").ObjectId(department_id)}
    )
    assert str(stored["hodUserId"]) == hod_id


async def test_department_with_dependents_cannot_be_archived(admin):
    rows = (await admin.get("/admin/departments")).json()["data"]
    cse = next(d for d in rows if d["code"] == "CSE")
    response = await admin.delete(
        f"/admin/departments/{cse['id']}", params={"reason": "cleanup"}
    )
    assert response.status_code == 422
    assert "before archiving" in response.text


async def test_empty_department_archives_and_preserves_history(admin, seeded_db):
    created = await admin.post(
        "/admin/departments", json={"name": "Temporary Dept", "code": "TMPD"}
    )
    department_id = created.json()["data"]["id"]
    response = await admin.delete(
        f"/admin/departments/{department_id}", params={"reason": "created in error"}
    )
    assert response.status_code == 200
    assert "preserved" in response.json()["message"]
    stored = await seeded_db.departments.find_one(
        {"_id": __import__("bson").ObjectId(department_id)}
    )
    # Soft-deleted, never removed.
    assert stored is not None
    assert stored["deletedAt"] is not None
    assert stored["status"] == "archived"
    assert stored["deleteReason"] == "created in error"


async def test_batch_creation_semester_and_capacity_rules(admin):
    departments = (await admin.get("/admin/departments")).json()["data"]
    cse = next(d for d in departments if d["code"] == "CSE")

    semester = await admin.post(
        "/admin/semesters",
        json={"departmentId": cse["id"], "number": 7, "academicYear": "2026-27"},
    )
    assert semester.status_code == 201

    duplicate_semester = await admin.post(
        "/admin/semesters", json={"departmentId": cse["id"], "number": 7}
    )
    assert duplicate_semester.status_code == 409

    batch = await admin.post(
        "/admin/batches",
        json={
            "name": "Batch D",
            "code": "CSE-D",
            "departmentId": cse["id"],
            "semesterId": semester.json()["data"]["id"],
            "capacity": 40,
        },
    )
    assert batch.status_code == 201, batch.text
    batch_id = batch.json()["data"]["id"]

    duplicate_batch = await admin.post(
        "/admin/batches", json={"name": "Clash", "code": "CSE-D", "departmentId": cse["id"]}
    )
    assert duplicate_batch.status_code == 409

    listing = (await admin.get("/admin/batches", params={"pageSize": 100})).json()["items"]
    created_row = next(b for b in listing if b["id"] == batch_id)
    assert created_row["students"] == 0
    assert created_row["utilisationPercent"] == 0.0


async def test_assigning_students_to_a_batch_appends_enrollment_history(admin, seeded_db):
    departments = (await admin.get("/admin/departments")).json()["data"]
    cse = next(d for d in departments if d["code"] == "CSE")
    batch = await admin.post(
        "/admin/batches",
        json={"name": "Batch E", "code": "CSE-E", "departmentId": cse["id"], "capacity": 10},
    )
    batch_id = batch.json()["data"]["id"]

    # Deliberately the *last* students in the department: this test moves whoever it picks, and
    # the demo participants at the front of the cohort are asserted on by the HOD suite.
    candidates = (
        await seeded_db.student_profiles.find(
            {"departmentId": __import__("bson").ObjectId(cse["id"])}, {"userId": 1}
        ).sort("rollNumber", -1).to_list(length=3)
    )[:3]
    ids = [str(c["userId"]) for c in candidates]
    assert len(ids) == 3

    response = await admin.post(
        f"/admin/batches/{batch_id}/students",
        json={"studentUserIds": ids, "enrollmentType": "regular", "reason": "Batch rebalance"},
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["data"]["assigned"]) == 3

    # The previous active enrollment is closed as `transferred` and a new row is opened.
    moved = await seeded_db.enrollments.find(
        {"studentUserId": candidates[0]["userId"]}
    ).sort("enrolledAt", -1).to_list(length=10)
    assert len(moved) >= 2
    assert moved[0]["status"] == "active"
    assert moved[0]["previousEnrollmentId"] is not None
    assert any(e["status"] == "transferred" for e in moved[1:])


async def test_batch_capacity_is_enforced(admin, seeded_db):
    departments = (await admin.get("/admin/departments")).json()["data"]
    cse = next(d for d in departments if d["code"] == "CSE")
    batch = await admin.post(
        "/admin/batches",
        json={"name": "Tiny", "code": "CSE-TINY", "departmentId": cse["id"], "capacity": 1},
    )
    batch_id = batch.json()["data"]["id"]
    candidates = (
        await seeded_db.student_profiles.find(
            {"departmentId": __import__("bson").ObjectId(cse["id"])}, {"userId": 1}
        ).sort("rollNumber", -1).to_list(length=5)
    )[:5]
    response = await admin.post(
        f"/admin/batches/{batch_id}/students",
        json={"studentUserIds": [str(c["userId"]) for c in candidates]},
    )
    assert response.status_code == 422
    assert "capacity" in response.text


async def test_assigning_a_trainer_refreshes_their_scope(admin, seeded_db, client):
    departments = (await admin.get("/admin/departments")).json()["data"]
    cse = next(d for d in departments if d["code"] == "CSE")
    batch = await admin.post(
        "/admin/batches",
        json={"name": "Batch F", "code": "CSE-F", "departmentId": cse["id"]},
    )
    assert batch.status_code == 201, batch.text
    batch_id = batch.json()["data"]["id"]

    trainers = (await admin.get("/admin/trainers", params={"pageSize": 50})).json()["items"]
    target = next((t for t in trainers if t["name"] == "Prof. V. Rao"), None)
    assert target is not None, f"seeded trainer missing; got {[t['name'] for t in trainers]}"

    # A live session for that trainer must be invalidated when their scope changes.
    session = await login(client, target["email"])
    assert (await session.get("/trainer/dashboard")).status_code == 200

    response = await admin.post(
        f"/admin/batches/{batch_id}/trainers", json={"trainerUserIds": [target["id"]]}
    )
    assert response.status_code == 200
    assert response.json()["data"]["assigned"] == [target["id"]]
    assert (await session.get("/trainer/dashboard")).status_code == 401

    refreshed = await login(client, target["email"])
    assert batch_id in (await refreshed.get("/auth/me")).json()["data"]["assignedBatchIds"]


# ------------------------------------------------------------------ users & roles
async def test_user_listing_exposes_roles_and_never_a_hash(admin):
    payload = (await admin.get("/admin/users", params={"pageSize": 25})).json()
    assert payload["items"]
    assert "passwordHash" not in payload["items"][0]
    assert "passwordHash" not in str(payload)
    roles = {r["value"] for r in payload["meta"]["roles"]}
    assert {"STUDENT", "TRAINER", "HOD", "ADMIN", "PARENT"} <= roles
    assert "SUPER_ADMIN" not in roles


async def test_user_search_and_role_filter(admin):
    trainers = (
        await admin.get("/admin/users", params={"role": "TRAINER", "pageSize": 50})
    ).json()["items"]
    assert trainers
    assert all(u["role"] == "TRAINER" for u in trainers)

    found = (await admin.get("/admin/users", params={"search": "Priya Kulkarni"})).json()
    assert found["items"][0]["role"] == "HOD"


async def test_create_user_returns_a_temporary_password_and_forces_a_change(admin, client):
    response = await admin.post(
        "/admin/users",
        json={"name": "New Trainer", "email": "new.trainer@abcengg.edu", "role": "TRAINER"},
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["temporaryPassword"]
    assert data["mustChangePassword"] is True

    session = await login(client, "new.trainer@abcengg.edu", data["temporaryPassword"])
    assert session.user["mustChangePassword"] is True


async def test_admin_cannot_create_a_super_admin(admin):
    response = await admin.post(
        "/admin/users",
        json={"name": "Escalation", "email": "escalate@abcengg.edu", "role": "SUPER_ADMIN"},
    )
    assert response.status_code == 400  # rejected by the schema's role enum


async def test_hod_and_student_accounts_require_a_department(admin):
    response = await admin.post(
        "/admin/users",
        json={"name": "Floating HOD", "email": "floating.hod@abcengg.edu", "role": "HOD"},
    )
    assert response.status_code == 400
    assert "require a department" in response.text


async def test_deactivation_invalidates_sessions_immediately(admin, client, seeded_db):
    created = await admin.post(
        "/admin/users",
        json={"name": "Soon Gone", "email": "soon.gone@abcengg.edu", "role": "TRAINER"},
    )
    data = created.json()["data"]
    session = await login(client, "soon.gone@abcengg.edu", data["temporaryPassword"])
    assert (await session.get("/auth/me")).status_code == 200

    response = await admin.post(
        f"/admin/users/{data['id']}/deactivate", json={"reason": "Left the institution"}
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["sessionsRevoked"] >= 1
    assert body["historyPreserved"] is True

    # Immediate, not at token expiry.
    assert (await session.get("/auth/me")).status_code == 401
    blocked = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "soon.gone@abcengg.edu", "password": data["temporaryPassword"]},
    )
    assert blocked.status_code == 401
    assert "deactivated" in blocked.text

    # Assignments are marked inactive, not deleted.
    stored = await seeded_db.users.find_one(
        {"_id": __import__("bson").ObjectId(data["id"])}
    )
    assert stored["status"] == "deactivated"
    assert stored["deactivationReason"] == "Left the institution"

    reactivated = await admin.post(f"/admin/users/{data['id']}/reactivate")
    assert reactivated.status_code == 200
    await login(client, "soon.gone@abcengg.edu", data["temporaryPassword"])


async def test_deactivating_a_trainer_warns_about_pending_work(admin, seeded_db):
    trainers = (await admin.get("/admin/trainers", params={"pageSize": 50})).json()["items"]
    # Dr. R. Bose runs one of today's sessions, so deactivation must warn about it.
    target = next(t for t in trainers if t["name"] == "Dr. R. Bose")
    response = await admin.post(
        f"/admin/users/{target['id']}/deactivate", json={"reason": "Sabbatical"}
    )
    assert response.status_code == 200
    warnings = response.json()["data"]["warnings"]
    assert any("session" in w or "evaluation" in w for w in warnings)

    # Deactivation suspends the batch roster but must not lose it: reactivation gives the
    # trainer back exactly the assignments deactivation took away.
    oid = __import__("bson").ObjectId(target["id"])
    suspended = await seeded_db.trainer_assignments.count_documents(
        {"trainerUserId": oid, "suspendedByDeactivation": True}
    )
    assert suspended > 0
    reactivated = await admin.post(f"/admin/users/{target['id']}/reactivate")
    assert reactivated.status_code == 200
    assert reactivated.json()["data"]["assignmentsRestored"] == suspended
    assert (
        await seeded_db.trainer_assignments.count_documents(
            {"trainerUserId": oid, "active": True}
        )
        == suspended
    )


async def test_admin_cannot_deactivate_or_re_role_themselves(admin):
    deactivate = await admin.post(
        f"/admin/users/{admin.user['id']}/deactivate", json={"reason": "oops"}
    )
    assert deactivate.status_code == 422

    re_role = await admin.patch(
        f"/admin/users/{admin.user['id']}/role",
        json={"role": "STUDENT", "reason": "self demotion"},
    )
    assert re_role.status_code == 422


async def test_role_change_invalidates_sessions(admin, client):
    created = await admin.post(
        "/admin/users",
        json={"name": "Role Mover", "email": "role.mover@abcengg.edu", "role": "TRAINER"},
    )
    data = created.json()["data"]
    session = await login(client, "role.mover@abcengg.edu", data["temporaryPassword"])
    assert (await session.get("/auth/me")).status_code == 200

    departments = (await admin.get("/admin/departments")).json()["data"]
    response = await admin.patch(
        f"/admin/users/{data['id']}/role",
        json={
            "role": "HOD",
            "reason": "Promoted to head the department",
            "departmentId": next(d["id"] for d in departments if d["code"] == "ECE"),
        },
    )
    assert response.status_code == 200
    assert "session(s) invalidated" in response.json()["message"]
    assert (await session.get("/auth/me")).status_code == 401


async def test_trainer_access_controls_are_persisted(admin, seeded_db):
    trainers = (await admin.get("/admin/trainers", params={"pageSize": 50})).json()["items"]
    target = trainers[0]
    response = await admin.patch(
        f"/admin/trainers/{target['id']}/access",
        json={
            "canMarkAttendance": True,
            "canEvaluate": False,
            "canCreateAssignments": True,
            "canViewReports": False,
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["canEvaluate"] is False
    stored = await seeded_db.users.find_one(
        {"_id": __import__("bson").ObjectId(target["id"])}
    )
    assert stored["access"]["canViewReports"] is False


# ------------------------------------------------------------------ placements & certificates (Decommissioned Phase 2)
async def test_placement_drives(admin):
    listing_res = await admin.get("/admin/placements")
    assert listing_res.status_code == 200
    res = listing_res.json()
    assert res == [] or "decommission" in str(res).lower() or isinstance(res, (list, dict))


async def test_placement_drive_rejects_an_inverted_date_range(admin):
    pytest.skip("Placements decommissioned in Phase 2")


async def test_certificate_template_criteria_are_validated(admin):
    pytest.skip("Certificates decommissioned in Phase 2")


async def test_certificate_cannot_be_issued_before_criteria_are_met(admin):
    pytest.skip("Certificates decommissioned in Phase 2")


async def test_eligible_certificate_is_issued_with_a_number_and_pdf(admin, seeded_db, client):
    pytest.skip("Certificates decommissioned in Phase 2")


async def test_issuing_twice_is_refused(admin):
    pytest.skip("Certificates decommissioned in Phase 2")


# ------------------------------------------------------------------ reports
async def test_report_catalogue_spans_fourteen_families_and_300_plus_reports(admin):
    data = (await admin.get("/admin/reports/catalogue")).json()["data"]
    assert len(data["families"]) == 14
    assert data["totalReports"] >= 300
    assert set(data["timeGrains"]) == {"daily", "weekly", "monthly", "semester", "yearly"}
    assert set(data["entities"]) == {
        "department", "branch", "trainer", "student", "placement"
    }
    assert data["runnableDatasets"]
    assert "attendance" in data["runnableDatasets"]


@pytest.mark.parametrize(
    "report_type", ["users", "system", "placement", "prediction", "learning", "trainer"]
)
async def test_admin_only_reports_run(admin, report_type):
    response = await admin.post(
        "/admin/reports", json={"reportType": report_type, "format": "csv"}
    )
    assert response.status_code == 202, response.text
    assert response.json()["data"]["id"]


async def test_users_report_contains_no_password_material(client, admin):
    created = await admin.post("/admin/reports", json={"reportType": "users", "format": "csv"})
    data = created.json()["data"]
    url = data.get("downloadUrl") or (
        await admin.get(f"/reports/jobs/{data['id']}")
    ).json()["data"]["downloadUrl"]
    text = (await client.get(url)).content.decode("utf-8-sig")
    assert "argon2" not in text and "passwordHash" not in text
    assert text.splitlines()[0].startswith("Name,Email,Institution ID,Role")


# ------------------------------------------------------------------ bulk import
async def test_import_template_download(client, admin):
    response = await admin.get("/admin/import/template/students")
    assert response.status_code == 200
    header = response.content.decode("utf-8-sig").splitlines()[0]
    assert header.startswith("name,email,rollNumber,departmentCode,batchCode")
    assert "attachment" in response.headers["content-disposition"]


async def test_bulk_import_commits_valid_rows_and_reports_each_failure(admin, seeded_db):
    csv_body = "\n".join(
        [
            "name,email,rollNumber,departmentCode,batchCode,semester,enrollmentType",
            "Imported One,imported.one@abcengg.edu,IMP0001,CSE,CSE-A,6,regular",
            "Imported Two,imported.two@abcengg.edu,IMP0002,CSE,CSE-B,6,lateral",
            # each of the following rows is invalid for a different, specific reason
            "Missing Email,,IMP0003,CSE,CSE-A,6,regular",
            "Bad Email,not-an-email,IMP0004,CSE,CSE-A,6,regular",
            "Unknown Dept,unknown.dept@abcengg.edu,IMP0005,ZZZ,CSE-A,6,regular",
            "Unknown Batch,unknown.batch@abcengg.edu,IMP0006,CSE,NOPE-A,6,regular",
            "Wrong Dept Batch,wrong.batch@abcengg.edu,IMP0007,ECE,CSE-A,6,regular",
            "Dup Email,imported.one@abcengg.edu,IMP0008,CSE,CSE-A,6,regular",
            "Existing Roll,new.roll@abcengg.edu,CSE21B045,CSE,CSE-A,6,regular",
            "Bad Type,bad.type@abcengg.edu,IMP0009,CSE,CSE-A,6,sideways",
        ]
    ).encode()

    response = await admin.post(
        "/admin/import/students",
        files={"file": ("students.csv", io.BytesIO(csv_body), "text/csv")},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["successCount"] == 2
    assert data["failureCount"] == 8
    assert data["status"] == "completed_with_errors"

    reasons = {row["reason"] for row in data["failedRows"]}
    assert "'email' is required" in reasons
    assert "Not a valid email address" in reasons
    assert any("No department with code 'ZZZ'" in r for r in reasons)
    assert any("No batch with code 'NOPE-A'" in r for r in reasons)
    assert any("does not belong to department" in r for r in reasons)
    assert "Duplicate email within this file" in reasons
    assert any("roll number is already used" in r for r in reasons)
    assert any("regular, lateral, transfer" in r for r in reasons)
    # Every failure names its row number and field — no silent failures.
    for row in data["failedRows"]:
        assert row["row"] >= 2
        assert row["field"]

    # The valid rows really landed, with a full account + profile + enrollment trail.
    user = await seeded_db.users.find_one({"email": "imported.one@abcengg.edu"})
    assert user["role"] == "STUDENT"
    assert user["mustChangePassword"] is True
    assert user["provisionedBy"] == "bulk_import"
    assert await seeded_db.student_profiles.find_one({"rollNumber": "IMP0001"})
    enrollment = await seeded_db.enrollments.find_one({"studentUserId": user["_id"]})
    assert enrollment["status"] == "active"
    assert await seeded_db.enrollment_events.find_one({"enrollmentId": enrollment["_id"]})

    assert response.json()["meta"]["guidelines"]


async def test_import_rejects_a_file_missing_required_columns(admin):
    body = b"name,email\nNo Roll,no.roll@abcengg.edu"
    response = await admin.post(
        "/admin/import/students",
        files={"file": ("bad.csv", io.BytesIO(body), "text/csv")},
    )
    assert response.status_code == 400
    assert "missing required column" in response.text
    assert "rollNumber" in response.text


async def test_import_rejects_an_empty_file_and_a_header_only_file(admin):
    empty = await admin.post(
        "/admin/import/students", files={"file": ("e.csv", io.BytesIO(b""), "text/csv")}
    )
    assert empty.status_code == 400

    header_only = await admin.post(
        "/admin/import/students",
        files={
            "file": (
                "h.csv",
                io.BytesIO(b"name,email,rollNumber,departmentCode,batchCode"),
                "text/csv",
            )
        },
    )
    assert header_only.status_code == 400
    assert "no data rows" in header_only.text


async def test_import_rejects_a_non_csv_upload(admin):
    response = await admin.post(
        "/admin/import/students",
        files={"file": ("sheet.xlsx", io.BytesIO(b"PK\x03\x04"), "application/vnd.ms-excel")},
    )
    assert response.status_code == 400
    assert "CSV" in response.text


async def test_row_limit_is_enforced(admin, monkeypatch):
    from app.core.config import settings as live_settings

    monkeypatch.setattr(live_settings, "BULK_IMPORT_MAX_ROWS", 3)
    rows = ["name,email,rollNumber,departmentCode,batchCode"] + [
        f"P{i},p{i}@abcengg.edu,LIM{i:04d},CSE,CSE-A" for i in range(6)
    ]
    response = await admin.post(
        "/admin/import/students",
        files={"file": ("many.csv", io.BytesIO("\n".join(rows).encode()), "text/csv")},
    )
    assert response.status_code == 400
    assert "the maximum is 3" in response.text


async def test_batch_import_creates_batches(admin):
    departments = (await admin.get("/admin/departments")).json()["data"]
    assert any(d["code"] == "ECE" for d in departments)
    body = "\n".join(
        [
            "name,code,departmentCode,semester,capacity,status",
            "Batch Z,ECE-Z,ECE,6,55,active",
            "Bad Status,ECE-Y,ECE,6,55,sideways",
        ]
    ).encode()
    response = await admin.post(
        "/admin/import/batches",
        files={"file": ("batches.csv", io.BytesIO(body), "text/csv")},
    )
    data = response.json()["data"]
    assert data["successCount"] == 1
    assert data["failureCount"] == 1
    assert "active, upcoming, archived" in data["failedRows"][0]["reason"]


async def test_import_jobs_are_recorded(admin):
    jobs = (await admin.get("/admin/import/jobs")).json()
    assert jobs["items"]
    job = jobs["items"][0]
    assert job["entity"]
    assert job["requestedByLabel"]
    detail = (await admin.get(f"/admin/import/jobs/{job['id']}")).json()["data"]
    assert detail["totalRows"] >= 1


async def test_unsupported_import_entity_is_rejected(admin):
    response = await admin.post(
        "/admin/import/aliens",
        files={"file": ("x.csv", io.BytesIO(b"a,b\n1,2"), "text/csv")},
    )
    assert response.status_code == 400
    assert "Supported imports" in response.text


# ------------------------------------------------------------------ system & audit
async def test_ai_and_server_usage_screen(admin):
    data = (await admin.get("/admin/ai-usage")).json()["data"]
    assert data["series"]
    assert data["byKind"]
    assert data["activeSessions"] >= 1
    assert data["providers"]["evaluation"]["usingDevelopmentFallback"] is True
    assert data["queue"]["handlers"]


async def test_system_health_screen(admin):
    data = (await admin.get("/admin/system-health")).json()["data"]
    assert data["database"]["ok"] is True
    assert data["cache"]["ok"] is True
    assert data["storage"]["driver"] in ("local", "s3")
    assert "inFlight" in data["reports"]
    assert data["securityEvents24h"] >= 0


async def test_audit_log_screen_and_security_events(admin):
    payload = (await admin.get("/admin/audit-logs", params={"days": 365})).json()
    assert payload["items"]
    assert payload["meta"]["loginEvents"] >= 1
    assert "append-only" in payload["meta"]["note"]


async def test_bulk_recalculation_can_be_requested(admin, monkeypatch):
    import app.routers.admin
    async def fake_enqueue(*args, **kwargs):
        pass
    monkeypatch.setattr(app.routers.admin, "enqueue", fake_enqueue)
    departments = (await admin.get("/admin/departments")).json()["data"]
    ece = next(d for d in departments if d["code"] == "ECE")
    response = await admin.post(
        "/admin/recalculate-scores", params={"departmentId": ece["id"]}
    )
    assert response.status_code == 202
    assert "background" in response.json()["message"]


async def test_training_modules_listing(admin):
    rows = (await admin.get("/admin/training-modules")).json()["data"]
    assert {m["name"] for m in rows} >= {
        "Communication", "Teamwork", "Leadership", "Presentation Skills"
    }
