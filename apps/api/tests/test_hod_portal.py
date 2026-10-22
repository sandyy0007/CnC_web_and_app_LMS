"""HOD portal — FR-01…FR-14 of the supplied SRS, screen by screen."""
from __future__ import annotations

import pytest

from app.core.config import settings
from tests.conftest import error_code


# --------------------------------------------------------------- FR-01 / §6.1 scope framing
async def test_every_screen_states_college_then_department(hod):
    for url in (
        "/hod/dashboard", "/hod/participants", "/hod/attendance",
        "/hod/assessments", "/hod/certificates", "/hod/enrollments",
        "/hod/reports", "/hod/audit-logs", "/hod/scope",
    ):
        body = (await hod.get(url)).json()
        scope = body.get("data", {}).get("scope") or body.get("meta", {}).get("scope")
        assert scope, f"{url} did not carry the scope header"
        assert scope["collegeName"] == "ABC Engineering College"
        assert scope["departmentName"] == "Computer Science"
        assert "›" in scope["breadcrumb"]
        assert "Data isolation active" in scope["isolationNotice"]


async def test_scope_screen_lists_what_is_locked(hod):
    data = (await hod.get("/hod/scope")).json()["data"]
    labels = {entry["label"] for entry in data["locked"]}
    assert labels == {"Other Departments", "Other Colleges"}
    for entry in data["locked"]:
        assert "blocked server-side" in entry["reason"]


# --------------------------------------------------------------- FR-02 dashboard
async def test_dashboard_kpis_alerts_and_charts(hod):
    data = (await hod.get("/hod/dashboard")).json()["data"]

    kpis = data["kpis"]
    assert kpis["participants"]["value"] >= 428
    assert kpis["trainers"]["value"] == 12          # Trainer Roster screenshot
    assert kpis["averageSessionAttendance"]["hasData"] is True
    assert 60 <= kpis["averageSessionAttendance"]["value"] <= 100
    assert kpis["averageSkillScore"]["outOf"] == 100
    assert kpis["averageSkillScore"]["value"] is not None

    codes = {a["code"] for a in data["alerts"]}
    assert codes == {"attendance_defaulters", "low_assessment_scores", "pending_approvals"}
    defaulter_alert = next(a for a in data["alerts"] if a["code"] == "attendance_defaulters")
    assert "below 75%" in defaulter_alert["label"]
    assert defaulter_alert["count"] > 0

    assert len(data["attendanceTrend"]) == 8
    assert data["moduleAttendance"]
    assert data["moduleScores"]
    assert data["certificatesIssued"] > 0
    assert data["recentEnrollments"]
    first = data["recentEnrollments"][0]
    assert first["studentName"] and first["enrolledByLabel"] and first["enrollmentType"]
    assert data["thresholds"]["attendance"] == settings.ATTENDANCE_DEFAULTER_THRESHOLD


async def test_attendance_demo_figure_is_close_to_the_screenshot(hod):
    """The seed targets the screenshot's 82.6% overall attendance."""
    value = (await hod.get("/hod/dashboard")).json()["data"]["kpis"][
        "averageSessionAttendance"
    ]["value"]
    assert abs(value - 82.6) < 3.0, f"seeded attendance drifted: {value}%"


# --------------------------------------------------------------- FR-03 participant directory
async def test_participant_directory_search_filter_sort_and_pagination(hod):
    listing = (await hod.get("/hod/participants", params={"pageSize": 8})).json()
    assert len(listing["items"]) == 8
    assert listing["pagination"]["total"] >= 428
    assert listing["pagination"]["hasNext"] is True
    assert listing["meta"]["filters"]["batches"]
    assert listing["meta"]["legend"][0]["label"] == "≥75% attendance"

    row = listing["items"][0]
    for field in (
        "name", "rollNumber", "batchName", "attendancePercent",
        "averageSkillScore", "certificateStatus", "enrollmentStatus",
    ):
        assert field in row

    found = (await hod.get("/hod/participants", params={"search": "Rahul Sharma"})).json()
    assert found["items"]
    rahul = found["items"][0]
    assert rahul["rollNumber"] == "CSE21B045"
    assert rahul["batchName"] == "Batch C"
    # Computed from whole sessions, so within rounding of the screenshot's 94%.
    assert abs(rahul["attendancePercent"] - 94.0) <= 1.5
    assert rahul["certificateStatus"] == "issued"

    sorted_desc = (
        await hod.get("/hod/participants", params={"sortBy": "name", "sortDir": "desc"})
    ).json()
    names = [r["name"] for r in sorted_desc["items"]]
    assert names == sorted(names, reverse=True)


async def test_participant_filters_by_batch_and_status(hod):
    batches = (await hod.get("/hod/participants")).json()["meta"]["filters"]["batches"]
    batch_c = next(b for b in batches if b["name"] == "Batch C")
    filtered = (
        await hod.get("/hod/participants", params={"batchId": batch_c["id"], "pageSize": 50})
    ).json()
    assert filtered["items"]
    assert all(r["batchName"] == "Batch C" for r in filtered["items"])


async def test_unsortable_field_is_rejected(hod):
    response = await hod.get("/hod/participants", params={"sortBy": "passwordHash"})
    assert response.status_code == 400
    assert "Cannot sort by" in response.text


# --------------------------------------------------------------- FR-04 360 profile
async def test_participant_360_profile(hod, seeded_db):
    profile_doc = await seeded_db.student_profiles.find_one({"rollNumber": "CSE21B045"})
    data = (await hod.get(f"/hod/participants/{profile_doc['userId']}")).json()["data"]

    assert data["participant"]["name"] == "Rahul Sharma"
    summary = data["summary"]
    assert abs(summary["sessionAttendancePercent"] - 94.0) <= 1.5
    assert summary["averageSkillScore"] is not None
    assert summary["proficiency"] in ("Expert", "Advanced", "Intermediate", "Beginner")
    assert summary["sessionsTotal"] > 0
    assert summary["trainerFeedbackAverage"] is not None
    assert summary["departmentAverageSkillScore"] is not None

    personal = data["personalDetails"]
    assert personal["rollNumber"] == "CSE21B045"
    assert personal["trainingBatch"] == "Batch C"
    assert personal["department"].startswith("CSE — ABC Engineering College")
    assert personal["guardianContact"]
    assert personal["enrolledBy"]

    # All six tabs from the Participant Profile screenshot have data behind them.
    assert data["rubricScores"]
    assert data["assessments"]
    assert data["feedback"]
    assert data["enrollmentHistory"]
    assert data["enrollmentEvents"]
    assert data["certificate"]["status"] == "issued"
    assert data["readiness"]["score"] is not None


async def test_profile_of_a_nonexistent_participant_is_a_generic_denial(hod):
    response = await hod.get(f"/hod/participants/{'1' * 24}")
    assert response.status_code == 403
    assert error_code(response) == "SCOPE_FORBIDDEN"


# --------------------------------------------------------------- FR-05 / FR-06 attendance
async def test_attendance_analytics_screen(hod):
    data = (await hod.get("/hod/attendance")).json()["data"]
    assert data["overall"]["hasData"] is True
    assert data["sessionsConducted"] > 0
    # The seed leaves a few sessions unmarked so this counter is meaningful.
    assert data["sessionsWithoutAttendanceData"] >= 1
    assert data["defaulterCount"] > 0
    assert data["threshold"] == 75.0
    assert len(data["weeklyTrend"]) == 8
    assert data["monthlyTrend"]
    assert {row["key"] for row in data["batchWise"]} >= {"Batch A", "Batch B", "Batch C"}
    assert data["moduleWise"]
    assert any("excluded from the denominator" in note for note in data["notes"])


async def test_defaulters_are_flagged_below_the_threshold(hod):
    rows = (await hod.get("/hod/attendance/defaulters")).json()
    assert rows["meta"]["threshold"] == 75.0
    assert rows["meta"]["count"] > 0
    for row in rows["data"]:
        assert row["attendancePct"] < 75.0
        assert row["name"] and row["rollNumber"] and row["batchName"]
        assert row["sessionsTotal"] > 0
    # Sorted worst-first, as the screenshot shows.
    percentages = [r["attendancePct"] for r in rows["data"]]
    assert percentages == sorted(percentages)


async def test_defaulter_threshold_is_configurable(hod):
    strict = (await hod.get("/hod/attendance/defaulters", params={"threshold": 90})).json()
    lenient = (await hod.get("/hod/attendance/defaulters", params={"threshold": 50})).json()
    assert strict["meta"]["count"] > lenient["meta"]["count"]


async def test_a_department_with_no_data_renders_an_empty_state_not_an_error(
    client, seeded_db
):
    """SRS §9: zero participants must be an empty state, never a 500."""
    from datetime import datetime, timezone

    from app.core.security import hash_password
    from tests.conftest import login

    now = datetime.now(timezone.utc)
    college = await seeded_db.colleges.find_one({"code": "ABC"})
    department_id = (
        await seeded_db.departments.insert_one(
            {"name": "Biotechnology", "code": "BT", "collegeId": college["_id"],
             "status": "active", "createdAt": now, "updatedAt": now, "deletedAt": None,
             "version": 1}
        )
    ).inserted_id
    hod_id = (
        await seeded_db.users.insert_one(
            {"name": "Empty Dept HOD", "email": "bt.hod@abcengg.edu",
             "passwordHash": hash_password("Eedi@2026"), "role": "HOD",
             "collegeId": college["_id"], "departmentId": department_id, "status": "active",
             "emailVerified": True, "createdAt": now, "updatedAt": now, "deletedAt": None,
             "version": 1}
        )
    ).inserted_id
    await seeded_db.departments.update_one(
        {"_id": department_id}, {"$set": {"hodUserId": hod_id}}
    )

    session = await login(client, "bt.hod@abcengg.edu")
    dashboard = (await session.get("/hod/dashboard")).json()["data"]
    assert dashboard["kpis"]["participants"]["value"] == 0
    assert dashboard["kpis"]["averageSessionAttendance"]["hasData"] is False
    assert dashboard["kpis"]["averageSkillScore"]["value"] is None

    participants = (await session.get("/hod/participants")).json()
    assert participants["items"] == []
    assert participants["pagination"]["total"] == 0

    attendance = (await session.get("/hod/attendance")).json()["data"]
    assert attendance["overall"]["hasData"] is False
    assert attendance["defaulters"] == []


# --------------------------------------------------------------- FR-07 skill assessment
async def test_skill_assessment_screen(hod):
    body = await hod.get("/hod/assessments")
    assert body.status_code == 200
    payload = body.json()
    data = payload["data"]

    assert data["departmentAverage"]["average"] is not None
    assert data["moduleAverages"]
    module_names = {row["module"] for row in data["moduleAverages"]}
    assert {"Communication", "Teamwork", "Leadership", "Presentation Skills"} <= module_names

    assert data["batchAverages"]
    batch_c = next(b for b in data["batchAverages"] if b["batch"] == "Batch C")
    batch_a = next(b for b in data["batchAverages"] if b["batch"] == "Batch A")
    # Batch C is the strongest cohort in the seed, as in the screenshot (81 vs department 74).
    assert batch_c["average"] > batch_a["average"]

    distribution = data["proficiencyDistribution"]
    assert distribution
    for row in distribution:
        assert set(row) >= {"criterion", "Expert", "Advanced", "Intermediate", "Beginner", "total"}
        assert row["total"] > 0

    assert data["rubricCriteria"]
    assert payload["items"]
    assert payload["meta"]["note"].startswith("Read-only")


async def test_hod_cannot_write_assessment_scores(hod, seeded_db):
    """Segregation of duties: scores are entered by trainers only (SRS §10)."""
    evaluation = await seeded_db.skill_assessments.find_one({"state": "submitted"})
    response = await hod.patch(
        f"/trainer/evaluations/{evaluation['_id']}", json={"remarks": "HOD edit attempt"}
    )
    assert response.status_code == 403


# --------------------------------------------------------------- FR-08 trainer roster
async def test_trainer_roster_is_read_focused(hod):
    data = (await hod.get("/hod/trainers")).json()["data"]
    assert data["activeTrainers"] == 12
    assert data["averageFeedback"] is not None
    assert data["sessionsThisCycle"] > 0
    assert "reassignment request" in data["notice"]

    bose = next(t for t in data["roster"] if t["name"] == "Dr. R. Bose")
    assert bose["modulesAssigned"] == ["Communication", "Teamwork"]
    assert bose["sessionsConducted"] > 0
    assert bose["workloadHoursPerWeek"] > 0


async def test_reassignment_request_goes_to_the_college_admin(hod, seeded_db):
    roster = (await hod.get("/hod/trainers")).json()["data"]["roster"]
    target = roster[0]
    response = await hod.post(
        f"/hod/trainers/{target['trainerUserId']}/reassignment-request",
        json={
            "trainerUserId": target["trainerUserId"],
            "reason": "Workload is above the departmental cap for this cycle.",
            "requestedModules": ["Communication"],
        },
    )
    assert response.status_code == 202
    assert response.json()["data"]["status"] == "pending"

    notification = await seeded_db.notifications.find_one(
        {"title": "Trainer reassignment requested"}
    )
    assert notification is not None
    admin = await seeded_db.users.find_one({"_id": notification["userId"]})
    assert admin["role"] == "ADMIN"


# --------------------------------------------------------------- FR-07a certificates (Decommissioned in Phase 2)
async def test_feedback_and_certificate_screen(hod):
    payload = await hod.get("/hod/certificates")
    assert payload.status_code == 200
    res = payload.json()
    assert res.get("status") == "decommissioned" or res.get("data", {}).get("certificatesIssued") == 0


async def test_certificate_can_be_flagged_for_review(hod):
    pytest.skip("Certificates decommissioned product-wide in Phase 2")


# --------------------------------------------------------------- FR-09 enrollment
async def test_enrollment_records_screen(hod):
    payload = (await hod.get("/hod/enrollments")).json()
    data = payload["data"]
    counts = data["counts"]
    assert counts["active"] > 0
    assert counts["on_hold"] >= 1
    assert counts["completed"] >= 1
    assert data["activePercentOfRoster"] > 0
    assert len(data["legend"]) == 5
    assert data["sampleStatusHistory"]["events"]
    assert "never overwritten" in data["sampleStatusHistory"]["note"]
    assert data["allowedTransitions"]["active"]

    rows = payload["items"]
    assert rows
    for row in rows:
        assert row["enrollmentType"] in ("regular", "lateral", "transfer")
        assert row["enrolledByLabel"]


async def test_enrollment_status_change_appends_history(hod, seeded_db):
    rows = (await hod.get("/hod/enrollments", params={"status": "active"})).json()["items"]
    target = rows[0]
    before = await seeded_db.enrollment_events.count_documents(
        {"enrollmentId": __import__("bson").ObjectId(target["id"])}
    )

    response = await hod.patch(
        f"/hod/enrollments/{target['id']}/status",
        json={"status": "on_hold", "reason": "Transfer review requested by the participant."},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["fromStatus"] == "active"
    assert data["toStatus"] == "on_hold"
    assert data["historyPreserved"] is True
    # A transfer/hold opens a successor row rather than editing history away.
    assert data["successorEnrollmentId"]

    after = await seeded_db.enrollment_events.count_documents(
        {"enrollmentId": __import__("bson").ObjectId(target["id"])}
    )
    assert after == before + 1
    event = await seeded_db.enrollment_events.find_one(
        {"enrollmentId": __import__("bson").ObjectId(target["id"]), "toStatus": "on_hold"}
    )
    assert event["reason"].startswith("Transfer review")
    assert event["actorLabel"]


async def test_invalid_status_transition_is_refused(hod):
    rows = (await hod.get("/hod/enrollments", params={"status": "completed"})).json()["items"]
    if not rows:
        pytest.skip("no completed enrollment in the seed")
    response = await hod.patch(
        f"/hod/enrollments/{rows[0]['id']}/status",
        json={"status": "active", "reason": "attempting an undefined transition"},
    )
    assert response.status_code == 422
    assert "not a permitted transition" in response.text


async def test_transition_to_the_same_status_is_refused(hod):
    rows = (await hod.get("/hod/enrollments", params={"status": "active"})).json()["items"]
    response = await hod.patch(
        f"/hod/enrollments/{rows[-1]['id']}/status",
        json={"status": "active", "reason": "no-op"},
    )
    assert response.status_code == 422
    assert "already" in response.text


async def test_enrollment_date_range_is_validated(hod):
    response = await hod.get(
        "/hod/enrollments", params={"from": "2026-09-01", "to": "2026-08-01"}
    )
    assert response.status_code == 400
    assert "on or before" in response.text


# --------------------------------------------------------------- FR-10 reports
async def test_report_screen_lists_every_hod_report(hod):
    meta = (await hod.get("/hod/reports")).json()["meta"]
    codes = {f["code"] for f in meta["available"]}
    assert {
        "attendance", "assessment", "enrollment", "defaulters",
        "certification", "feedback", "trainer", "audit",
    } <= codes
    assert "processed asynchronously" in meta["asyncNotice"]
    assert meta["asyncRowThreshold"] == settings.REPORT_ASYNC_ROW_THRESHOLD


@pytest.mark.parametrize("fmt", ["xlsx", "csv", "pdf"])
async def test_every_export_format_produces_a_real_file(client, hod, fmt):
    created = await hod.post(
        "/hod/reports", json={"reportType": "defaulters", "format": fmt}
    )
    assert created.status_code == 202, created.text
    data = created.json()["data"]
    url = data.get("downloadUrl") or (
        await hod.get(f"/reports/jobs/{data['id']}")
    ).json()["data"]["downloadUrl"]
    response = await client.get(url)
    assert response.status_code == 200
    signature = {"xlsx": b"PK", "csv": b"\xef\xbb\xbf", "pdf": b"%PDF"}[fmt]
    assert response.content.startswith(signature)


async def test_large_export_is_queued_as_a_background_job(hod):
    response = await hod.post(
        "/hod/reports",
        json={"reportType": "attendance", "format": "xlsx", "forceAsync": True},
    )
    data = response.json()["data"]
    assert data["async"] is True
    assert "background" in data["message"]
    # The eager worker has already produced it, and the requester was notified.
    job = (await hod.get(f"/reports/jobs/{data['id']}")).json()["data"]
    assert job["status"] == "ready"
    assert job["rowCount"] > 0


async def test_report_request_is_audited_with_its_filters(hod, seeded_db):
    await hod.post(
        "/hod/reports",
        json={"reportType": "certification", "format": "csv", "filters": {"status": "issued"}},
    )
    entry = await seeded_db.audit_logs.find_one(
        {"action": "export", "entityType": "report_jobs", "after.reportType": "certification"},
        sort=[("at", -1)],
    )
    assert entry is not None
    assert entry["after"]["filters"] == {"status": "issued"}
    assert entry["actorRole"] == "HOD"
    assert entry["departmentId"] is not None


async def test_unknown_report_type_is_rejected(hod):
    response = await hod.post("/hod/reports", json={"reportType": "nope", "format": "csv"})
    assert response.status_code == 400
    assert "Available report types" in response.text


async def test_csv_export_contains_the_expected_header_row(client, hod):
    created = await hod.post(
        "/hod/reports", json={"reportType": "enrollment", "format": "csv"}
    )
    data = created.json()["data"]
    url = data.get("downloadUrl") or (
        await hod.get(f"/reports/jobs/{data['id']}")
    ).json()["data"]["downloadUrl"]
    text = (await client.get(url)).content.decode("utf-8-sig")
    header = text.splitlines()[0]
    assert header.startswith("Roll No.,Participant,Batch,Type,Status")
    assert "Previous enrollment" in header


# --------------------------------------------------------------- FR-11 audit
async def test_audit_log_screen(hod):
    payload = (await hod.get("/hod/audit-logs", params={"days": 365})).json()
    data = payload["data"]
    assert data["totalEvents"] > 0
    assert data["createEvents"] >= 0
    assert data["updateEvents"] >= 0
    assert data["crossScopeAttemptsBlocked"] >= 0
    assert "append-only and cannot be edited" in data["notice"]

    assert payload["meta"]["filters"]["actions"]
    assert payload["meta"]["filters"]["entityTypes"]
    rows = payload["items"]
    assert rows
    for row in rows:
        assert row["at"] and row["actorLabel"] and row["action"] and row["entityType"]


async def test_audit_log_can_be_filtered(hod):
    filtered = (
        await hod.get("/hod/audit-logs", params={"action": "export", "days": 365})
    ).json()
    assert all(r["action"] == "export" for r in filtered["items"])


async def test_audit_trail_is_append_only(hod, seeded_db):
    """There is no API surface that edits or deletes an audit record."""
    from app.main import create_app

    paths = {
        route.path
        for route in create_app().routes
        if hasattr(route, "methods") and route.methods & {"PATCH", "PUT", "DELETE"}
    }
    assert not any("audit" in path for path in paths)


# --------------------------------------------------------------- FR-14 notifications
async def test_hod_notifications(hod):
    payload = (await hod.get("/hod/notifications")).json()
    assert payload["meta"]["unread"] >= 1
    kinds = {row["kind"] for row in payload["items"]}
    assert kinds & {"attendance_defaulter", "certificate_eligibility", "low_assessment_score",
                    "new_enrollment", "account"}


async def test_hod_feedback_log(hod):
    payload = (await hod.get("/hod/feedback")).json()
    assert payload["items"]
    assert payload["meta"]["summary"]["average"] is not None
    row = payload["items"][0]
    assert row["studentName"] and row["trainerName"] and row["feedbackText"]
