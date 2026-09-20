"""Trainer workflows: attendance, the 95+ parameter evaluation, versioning, alerts, assignments."""
from __future__ import annotations

import pytest

from app.core.config import settings
from tests.conftest import error_code


async def test_dashboard_is_assignment_scoped(trainer):
    data = (await trainer.get("/trainer/dashboard")).json()["data"]
    assert data["assignedBatches"]
    assert data["studentCount"] > 0
    assert data["attendance"]["hasData"] is True
    assert data["assessments"]["average"] is not None
    assert "attendanceNotMarked" in data["todaysClasses"]
    assert data["attendanceTrend"]
    assert data["moduleScores"]


async def test_todays_classes_report_attendance_completeness(trainer):
    rows = (await trainer.get("/trainer/classes/today")).json()["data"]
    assert rows, "the seed schedules a class today for this trainer"
    for row in rows:
        assert "attendanceMarked" in row
        assert "rosterSize" in row
        assert isinstance(row["attendanceComplete"], bool)


async def _own_session(trainer, seeded_db, *, marked: bool):
    import bson

    mine = bson.ObjectId(trainer.user["id"])
    for session in await seeded_db.training_sessions.find(
        {"trainerUserId": mine, "status": "completed"}
    ).to_list(length=500):
        count = await seeded_db.attendance.count_documents(
            {"trainingSessionId": session["_id"]}
        )
        if (count > 0) == marked:
            return session
    pytest.skip(f"no {'marked' if marked else 'unmarked'} session for this trainer")


async def test_attendance_roster_and_statuses(trainer, seeded_db):
    session = await _own_session(trainer, seeded_db, marked=True)
    data = (await trainer.get(f"/trainer/sessions/{session['_id']}/attendance")).json()["data"]
    assert data["statuses"] == ["present", "absent", "late", "leave"]
    assert data["alreadyMarked"] is True
    assert data["roster"]
    assert all("studentUserId" in row for row in data["roster"])


async def test_duplicate_attendance_is_refused_without_overwrite(trainer, seeded_db):
    session = await _own_session(trainer, seeded_db, marked=True)
    roster = (await trainer.get(f"/trainer/sessions/{session['_id']}/attendance")).json()["data"][
        "roster"
    ]
    payload = {
        "trainingSessionId": str(session["_id"]),
        "entries": [{"studentUserId": roster[0]["studentUserId"], "status": "present"}],
    }
    blocked = await trainer.post("/trainer/attendance", json=payload)
    assert blocked.status_code == 409
    assert error_code(blocked) == "CONFLICT"

    corrected = await trainer.post("/trainer/attendance", json={**payload, "overwrite": True})
    assert corrected.status_code == 201
    assert corrected.json()["data"]["written"] == 1


async def test_attendance_rejects_students_outside_the_session_batch(trainer, seeded_db):

    session = await _own_session(trainer, seeded_db, marked=True)
    outsider = await seeded_db.student_profiles.find_one(
        {"batchId": {"$ne": session["batchId"]}, "collegeId": session["collegeId"]}
    )
    response = await trainer.post(
        "/trainer/attendance",
        json={
            "trainingSessionId": str(session["_id"]),
            "entries": [{"studentUserId": str(outsider["userId"]), "status": "present"}],
            "overwrite": True,
        },
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["written"] == 0
    assert data["rejected"][0]["reason"] == "Not in this session's batch"


async def test_attendance_cannot_be_marked_for_a_future_session(trainer, seeded_db):
    import bson
    from datetime import datetime, timedelta, timezone

    mine = bson.ObjectId(trainer.user["id"])
    future = await seeded_db.training_sessions.find_one(
        {"trainerUserId": mine, "date": {"$gt": datetime.now(timezone.utc) + timedelta(days=1)}}
    )
    if future is None:
        # Create one so the rule is still exercised.
        base = await seeded_db.training_sessions.find_one({"trainerUserId": mine})
        doc = {**base, "_id": bson.ObjectId(),
               "date": datetime.now(timezone.utc) + timedelta(days=3), "status": "scheduled"}
        await seeded_db.training_sessions.insert_one(doc)
        future = doc
    student = await seeded_db.student_profiles.find_one({"batchId": future["batchId"]})
    response = await trainer.post(
        "/trainer/attendance",
        json={
            "trainingSessionId": str(future["_id"]),
            "entries": [{"studentUserId": str(student["userId"]), "status": "present"}],
        },
    )
    assert response.status_code == 422
    assert "hasn't happened yet" in response.text


# --------------------------------------------------------------------------- evaluations
async def test_evaluation_form_exposes_95_plus_parameters_over_seven_pillars(trainer):
    data = (await trainer.get("/trainer/evaluations/parameters")).json()["data"]
    assert data["totalParameters"] >= 95
    assert len(data["pillars"]) == 7
    assert [p["label"] for p in data["pillars"]] == [
        "Behaviour", "Communication", "Confidence", "Leadership",
        "Technical", "Problem Solving", "Career Readiness",
    ]
    for pillar in data["pillars"]:
        assert pillar["parameterCount"] >= 10
        for parameter in pillar["parameters"]:
            assert parameter["code"] and parameter["label"]
            assert parameter["maxScore"] > 0
    assert data["editWindowHours"] == settings.EVALUATION_EDIT_WINDOW_HOURS


async def test_parameters_can_be_filtered_by_semester(trainer):
    all_params = (await trainer.get("/trainer/evaluations/parameters")).json()["data"]
    early = (
        await trainer.get("/trainer/evaluations/parameters", params={"semester": 1})
    ).json()["data"]
    assert early["totalParameters"] < all_params["totalParameters"]
    assert early["semester"] == 1


async def _evaluation_target(trainer, seeded_db):
    """A student in the trainer's batches with no submitted evaluation for the chosen module."""
    import bson

    batches = [
        bson.ObjectId(b) for b in (await trainer.get("/auth/me")).json()["data"]["assignedBatchIds"]
    ]
    module = await seeded_db.training_modules.find_one({"name": "Communication"})
    for profile in await seeded_db.student_profiles.find(
        {"batchId": {"$in": batches}}
    ).to_list(length=2000):
        existing = await seeded_db.skill_assessments.find_one(
            {
                "studentUserId": profile["userId"],
                "trainingModuleId": module["_id"],
                "assessedBy": bson.ObjectId(trainer.user["id"]),
            }
        )
        if existing is None:
            return profile, module
    pytest.skip("every student already has an evaluation from this trainer")


async def test_evaluation_save_is_fast_and_recompute_happens_in_the_background(
    trainer, seeded_db
):
    """Submitting persists the raw scores and enqueues recalculation — it never waits on AI."""

    profile, module = await _evaluation_target(trainer, seeded_db)
    parameters = (await trainer.get("/trainer/evaluations/parameters")).json()["data"]
    scores = [
        {"code": p["code"], "score": 4}
        for pillar in parameters["pillars"]
        for p in pillar["parameters"]
    ]
    assert len(scores) >= 95

    before = await seeded_db.eedi_scores.find_one({"studentUserId": profile["userId"]})
    response = await trainer.post(
        "/trainer/evaluations",
        json={
            "studentUserId": str(profile["userId"]),
            "trainingModuleId": str(module["_id"]),
            "parameterScores": scores,
            "rubricScores": [
                {"criterion": c, "score": 80, "maxScore": 100}
                for c in ("Communication", "Teamwork", "Leadership", "Presentation")
            ],
            "remarks": "Strong across communication; keep building structure.",
            "state": "submitted",
        },
    )
    assert response.status_code == 201, response.text
    saved = response.json()["data"]
    assert saved["state"] == "submitted"
    assert saved["completeness"] == 100.0
    assert saved["totalScore"] is not None
    assert set(saved["pillarScores"]) == {
        "behaviour", "communication", "confidence", "leadership",
        "technical", "problem_solving", "career_readiness",
    }
    assert "recalculating in the background" in response.json()["message"]

    # The eager queue ran the job, so the recomputation is observable.
    after = await seeded_db.eedi_scores.find_one({"studentUserId": profile["userId"]})
    assert after is not None
    assert after["scoringVersion"] == settings.SCORING_VERSION
    assert len(after["history"]) > len((before or {}).get("history", []))
    assert after["history"][-1]["reason"] == "trainer_evaluation_submitted"
    # Both signals are recorded separately, not merged away.
    assert after["trainerComponent"] is not None
    assert "inputs" in after["history"][-1]


async def test_evaluation_scores_are_validated_against_each_parameter_maximum(
    trainer, seeded_db
):
    profile, module = await _evaluation_target(trainer, seeded_db)
    response = await trainer.post(
        "/trainer/evaluations",
        json={
            "studentUserId": str(profile["userId"]),
            "trainingModuleId": str(module["_id"]),
            "parameterScores": [{"code": "COM01", "score": 99}],
        },
    )
    assert response.status_code == 422
    assert "must be between 0 and 5" in response.text


async def test_unknown_parameter_code_is_rejected(trainer, seeded_db):
    profile, module = await _evaluation_target(trainer, seeded_db)
    response = await trainer.post(
        "/trainer/evaluations",
        json={
            "studentUserId": str(profile["userId"]),
            "trainingModuleId": str(module["_id"]),
            "parameterScores": [{"code": "NOPE99", "score": 3}],
        },
    )
    assert response.status_code == 400
    assert "Unknown evaluation parameter" in response.text


async def test_draft_then_submit_with_version_history(trainer, seeded_db):
    profile, module = await _evaluation_target(trainer, seeded_db)
    draft = await trainer.post(
        "/trainer/evaluations",
        json={
            "studentUserId": str(profile["userId"]),
            "trainingModuleId": str(module["_id"]),
            "parameterScores": [{"code": "COM01", "score": 3}, {"code": "BEH01", "score": 4}],
            "state": "draft",
        },
    )
    assert draft.status_code == 201
    evaluation_id = draft.json()["data"]["id"]

    edited = await trainer.patch(
        f"/trainer/evaluations/{evaluation_id}",
        json={
            "parameterScores": [{"code": "COM01", "score": 5}, {"code": "BEH01", "score": 5}],
            "editReason": "corrected after reviewing the recording",
        },
    )
    assert edited.status_code == 200

    versions = (await trainer.get(f"/trainer/evaluations/{evaluation_id}/versions")).json()["data"]
    assert len(versions) >= 2
    assert versions[0]["version"] > versions[-1]["version"]
    assert any(v["reason"] == "corrected after reviewing the recording" for v in versions)

    submitted = await trainer.post(f"/trainer/evaluations/{evaluation_id}/submit")
    # Only two of 98 parameters are filled, so the completeness guard refuses the submit.
    assert submitted.status_code == 422
    assert "complete" in submitted.text


async def test_concurrent_edit_is_detected_not_silently_overwritten(trainer, seeded_db):
    profile, module = await _evaluation_target(trainer, seeded_db)
    created = await trainer.post(
        "/trainer/evaluations",
        json={
            "studentUserId": str(profile["userId"]),
            "trainingModuleId": str(module["_id"]),
            "parameterScores": [{"code": "COM01", "score": 3}],
            "state": "draft",
        },
    )
    evaluation_id = created.json()["data"]["id"]
    stale_version = created.json()["data"]["version"]

    first = await trainer.patch(
        f"/trainer/evaluations/{evaluation_id}",
        json={"remarks": "first writer", "expectedVersion": stale_version},
    )
    assert first.status_code == 200

    second = await trainer.patch(
        f"/trainer/evaluations/{evaluation_id}",
        json={"remarks": "second writer", "expectedVersion": stale_version},
    )
    assert second.status_code == 409
    assert "changed by someone else" in second.text


async def test_edit_window_closes_after_the_configured_hours(trainer, seeded_db):
    import bson
    from datetime import datetime, timedelta, timezone

    evaluation = await seeded_db.skill_assessments.find_one(
        {"assessedBy": bson.ObjectId(trainer.user["id"]), "state": "submitted"}
    )
    if evaluation is None:
        pytest.skip("no submitted evaluation for this trainer")
    await seeded_db.skill_assessments.update_one(
        {"_id": evaluation["_id"]},
        {"$set": {"editWindowEndsAt": datetime.now(timezone.utc) - timedelta(hours=1)}},
    )
    response = await trainer.patch(
        f"/trainer/evaluations/{evaluation['_id']}", json={"remarks": "late edit"}
    )
    assert response.status_code == 422
    assert "edit window" in response.text


# --------------------------------------------------------------------------- AI override
async def test_trainer_override_preserves_the_original_ai_result(trainer, seeded_db):
    import bson

    batches = [
        bson.ObjectId(b) for b in (await trainer.get("/auth/me")).json()["data"]["assignedBatchIds"]
    ]
    students = [
        p["userId"]
        for p in await seeded_db.student_profiles.find(
            {"batchId": {"$in": batches}}, {"userId": 1}
        ).to_list(length=2000)
    ]
    score = await seeded_db.ai_scores.find_one({"studentUserId": {"$in": students}})
    if score is None:
        pytest.skip("no AI score inside this trainer's batches")

    original_overall = score["overall"]
    original_dimensions = score["dimensions"]
    response = await trainer.post(
        f"/trainer/ai-scores/{score['_id']}/override",
        json={
            "dimensions": [
                {"code": d["code"], "label": d["label"], "score": 90, "weight": d["weight"]}
                for d in original_dimensions
            ],
            "reason": "The transcript understates how well the candidate handled the follow-up.",
        },
    )
    assert response.status_code == 200, response.text

    stored = await seeded_db.ai_scores.find_one({"_id": score["_id"]})
    override = stored["trainerOverride"]
    assert override["originalOverall"] == original_overall
    assert override["originalDimensions"] == original_dimensions
    assert override["reason"].startswith("The transcript understates")
    assert override["byLabel"]
    assert stored["trainerReviewState"] == "reviewed"

    # The override is captured as a model-improvement signal.
    usage = await seeded_db.ai_usage_events.find_one(
        {"kind": "trainer_override", "studentUserId": score["studentUserId"]}
    )
    assert usage is not None
    assert usage["originalOverall"] == original_overall


async def test_override_rejects_an_out_of_range_score(trainer, seeded_db):
    import bson

    batches = [
        bson.ObjectId(b) for b in (await trainer.get("/auth/me")).json()["data"]["assignedBatchIds"]
    ]
    students = [
        p["userId"]
        for p in await seeded_db.student_profiles.find(
            {"batchId": {"$in": batches}}, {"userId": 1}
        ).to_list(length=2000)
    ]
    score = await seeded_db.ai_scores.find_one({"studentUserId": {"$in": students}})
    if score is None:
        pytest.skip("no AI score inside this trainer's batches")
    response = await trainer.post(
        f"/trainer/ai-scores/{score['_id']}/override",
        json={"dimensions": [{"code": "clarity", "score": 140}], "reason": "typo in the score"},
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- assignments
async def test_assignment_lifecycle(trainer, seeded_db):
    from datetime import datetime, timedelta, timezone

    batches = (await trainer.get("/trainer/batches")).json()["data"]
    batch = batches[0]
    due = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    created = await trainer.post(
        "/trainer/assignments",
        json={
            "title": "Client status email",
            "description": "Write a status email for a delayed deliverable.",
            "batchId": batch["id"],
            "dueAt": due,
            "maxScore": 50,
        },
    )
    assert created.status_code == 201, created.text
    assignment_id = created.json()["data"]["id"]

    listing = (await trainer.get("/trainer/assignments")).json()["items"]
    row = next(a for a in listing if a["id"] == assignment_id)
    assert row["rosterSize"] > 0
    assert row["pendingCount"] == row["rosterSize"]

    submissions = (
        await trainer.get(f"/trainer/assignments/{assignment_id}/submissions")
    ).json()["data"]
    assert submissions["submissions"]
    assert all(s["state"] == "pending" for s in submissions["submissions"])

    # Every student in the batch is notified.
    notified = await seeded_db.notifications.count_documents(
        {"kind": "assignment_due", "title": "New assignment: Client status email"}
    )
    assert notified == row["rosterSize"]


async def test_assignment_due_date_must_be_in_the_future(trainer):
    from datetime import datetime, timedelta, timezone

    batches = (await trainer.get("/trainer/batches")).json()["data"]
    response = await trainer.post(
        "/trainer/assignments",
        json={
            "title": "Backdated",
            "batchId": batches[0]["id"],
            "dueAt": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        },
    )
    assert response.status_code == 422
    assert "must be in the future" in response.text


async def test_grade_cannot_exceed_the_assignment_maximum(trainer, seeded_db, student):
    from datetime import datetime, timedelta, timezone
    import bson

    batches = (await trainer.get("/trainer/batches")).json()["data"]
    profile = await seeded_db.student_profiles.find_one(
        {"userId": bson.ObjectId(student.user["id"])}
    )
    student_batch_id = str(profile["batchId"])
    target_batch = next((b for b in batches if b["id"] == student_batch_id), None)
    if target_batch is None:
        pytest.skip("the demo student is not in this trainer's batches")

    created = await trainer.post(
        "/trainer/assignments",
        json={
            "title": "Graded exercise",
            "batchId": target_batch["id"],
            "dueAt": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
            "maxScore": 20,
        },
    )
    assignment_id = created.json()["data"]["id"]
    await student.post(
        f"/student/assignments/{assignment_id}/submit", data={"note": "done"}
    )
    submissions = (
        await trainer.get(f"/trainer/assignments/{assignment_id}/submissions")
    ).json()["data"]["submissions"]
    submitted = next(s for s in submissions if s["submissionId"])

    response = await trainer.patch(
        f"/trainer/submissions/{submitted['submissionId']}",
        json={"grade": 45, "remarks": "over the maximum", "state": "reviewed"},
    )
    assert response.status_code == 422
    assert "cannot exceed" in response.text

    ok = await trainer.patch(
        f"/trainer/submissions/{submitted['submissionId']}",
        json={"grade": 18, "remarks": "Clear and well structured.", "state": "reviewed"},
    )
    assert ok.status_code == 200


# --------------------------------------------------------------------------- alerts, trends, reports
async def test_weak_student_alerts_are_threshold_based(trainer):
    response = await trainer.get("/trainer/alerts")
    assert response.status_code == 200
    assert response.json()["meta"]["threshold"] == settings.WEAK_STUDENT_THRESHOLD


async def test_weak_alert_is_raised_and_can_be_resolved(trainer, seeded_db):
    import bson

    batches = [
        bson.ObjectId(b) for b in (await trainer.get("/auth/me")).json()["data"]["assignedBatchIds"]
    ]
    alert = await seeded_db.weak_student_alerts.find_one(
        {"batchId": {"$in": batches}, "resolvedAt": None}
    )
    if alert is None:
        pytest.skip("no open alert inside this trainer's batches")
    response = await trainer.patch(
        f"/trainer/alerts/{alert['_id']}",
        json={"resolved": True, "note": "Extra practice scheduled with the participant."},
    )
    assert response.status_code == 200
    assert response.json()["data"]["resolvedAt"] is not None


async def test_trends_cover_student_batch_and_module(trainer):
    data = (await trainer.get("/trainer/trends")).json()["data"]
    assert data["attendanceTrend"]
    assert data["monthlyAttendance"]
    assert data["moduleScores"]
    assert data["batchScores"]
    assert data["pillarAverages"]


async def test_course_progress_reports_module_and_batch_completion(trainer):
    data = (await trainer.get("/trainer/course-progress")).json()["data"]
    assert data["modules"]
    for module in data["modules"]:
        assert 0 <= module["percent"] <= 100
    assert data["batches"]


async def test_trainer_reports_are_limited_to_the_permitted_types(trainer):
    ok = await trainer.post(
        "/trainer/reports", json={"reportType": "attendance", "format": "xlsx"}
    )
    assert ok.status_code == 202
    assert ok.json()["data"]["status"] == "ready"

    refused = await trainer.post(
        "/trainer/reports", json={"reportType": "users", "format": "csv"}
    )
    assert refused.status_code == 400
    assert "Trainers can export" in refused.text


async def test_trainer_report_xlsx_is_a_real_workbook(client, trainer):
    created = await trainer.post(
        "/trainer/reports", json={"reportType": "assessment", "format": "xlsx"}
    )
    data = created.json()["data"]
    if data.get("async"):
        # Over the row threshold the export is queued; the eager worker has already run it.
        job = (await trainer.get(f"/reports/jobs/{data['id']}")).json()["data"]
        assert job["status"] == "ready", job
        url = job["downloadUrl"]
    else:
        url = data["downloadUrl"]
    response = await client.get(url)
    assert response.status_code == 200
    # XLSX files are ZIP archives.
    assert response.content[:2] == b"PK"


async def test_trainer_feedback_notifies_the_student(trainer, seeded_db):
    import bson

    batches = [
        bson.ObjectId(b) for b in (await trainer.get("/auth/me")).json()["data"]["assignedBatchIds"]
    ]
    profile = await seeded_db.student_profiles.find_one({"batchId": {"$in": batches}})
    response = await trainer.post(
        "/trainer/feedback",
        json={
            "studentUserId": str(profile["userId"]),
            "rating": 4.5,
            "feedbackText": "Excellent structuring and confident delivery.",
        },
    )
    assert response.status_code == 201
    notification = await seeded_db.notifications.find_one(
        {"userId": profile["userId"], "title": "New trainer feedback"}
    )
    assert notification is not None


async def test_trainer_profile_summarises_workload(trainer):
    data = (await trainer.get("/trainer/profile")).json()["data"]
    assert data["name"] == "Dr. R. Bose"
    assert data["assignments"]
    assert data["sessionsConducted"] > 0


async def test_training_modules_are_listed_for_the_evaluation_form(trainer):
    """The 95+ parameter form needs a module and semester to file the evaluation against."""
    response = await trainer.get("/trainer/training-modules")
    assert response.status_code == 200
    body = response.json()
    names = {row["name"] for row in body["data"]}
    assert {"Communication", "Leadership"} <= names
    assert all(set(row) == {"id", "name", "code"} for row in body["data"])
    assert body["meta"]["semesters"], "the form needs at least one semester to file against"


async def test_training_modules_are_department_scoped(trainer, other_trainer, seeded_db):
    """Modules are department-scoped, and every department has its own catalogue.

    A department whose sessions referenced another department's modules would leave its own
    trainers unable to read the module they are teaching.
    """
    mine = {row["id"] for row in (await trainer.get("/trainer/training-modules")).json()["data"]}
    theirs = {
        row["id"]
        for row in (await other_trainer.get("/trainer/training-modules")).json()["data"]
    }
    assert mine and theirs
    assert mine.isdisjoint(theirs), "each department must have its own module rows"

    # Every module the other trainer sees belongs to their own department…
    their_department = (await other_trainer.get("/auth/me")).json()["data"]["departmentId"]
    rows = await seeded_db.training_modules.find(
        {"_id": {"$in": [__import__("bson").ObjectId(i) for i in theirs]}}
    ).to_list(length=100)
    assert {str(r["departmentId"]) for r in rows} == {their_department}

    # …and every session they run points at a module inside that catalogue.
    sessions = (await other_trainer.get("/trainer/sessions", params={"pageSize": 25})).json()
    assert sessions["items"]
    assert all(row["trainingModuleId"] in theirs for row in sessions["items"])
