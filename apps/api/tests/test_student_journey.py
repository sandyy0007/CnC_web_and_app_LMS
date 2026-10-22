"""The student improvement loop, end to end.

PRACTISE → AI ASSESSMENT → EXPLAINABLE FEEDBACK → PERSONALISED EXERCISE → PROGRESS TRACKING.
The job queue runs eagerly in tests, so the background scoring is asserted inline.
"""
from __future__ import annotations

import io

import pytest

from tests.conftest import error_code


async def test_dashboard_has_every_card_from_the_screenshot(student):
    data = (await student.get("/student/dashboard")).json()["data"]

    assert data["student"]["firstName"] == "Alex"
    assert data["streak"]["days"] >= 1
    # The seed sets this student's readiness to the screenshot's 78/100; the number then moves
    # as new practice attempts are scored, so it is checked against the stored score.
    assert data["readiness"]["score"] is not None
    assert 0 < data["readiness"]["score"] <= 100
    assert data["readiness"]["outOf"] == 100
    assert data["learningHoursThisWeek"] >= 0
    assert "total" in data["pendingTasks"]
    assert data["continueLearning"]["courseTitle"]
    assert len(data["dailyQuest"]["tasks"]) == 3
    assert data["upcomingLiveSession"] is not None
    # The 7-pillar breakdown, in the documented order.
    assert [p["code"] for p in data["skillBreakdown"]] == [
        "behaviour", "communication", "confidence", "leadership",
        "technical", "problem_solving", "career_readiness",
    ]
    assert data["recommendedActivity"]["exerciseTitle"]
    assert len(data["weekAtAGlance"]) == 7
    assert data["leaderboard"]["myRank"] >= 1
    assert data["coachInsight"]["observation"]
    assert data["xp"]["total"] > 0


async def test_scores_match_the_stored_document_not_a_constant(student, seeded_db):
    import bson

    data = (await student.get("/student/dashboard")).json()["data"]
    stored = await seeded_db.eedi_scores.find_one(
        {"studentUserId": bson.ObjectId(student.user["id"])}
    )
    assert data["readiness"]["score"] == stored["finalScore"]
    assert data["readiness"]["scoringVersion"] == stored["scoringVersion"]
    for pillar in data["skillBreakdown"]:
        assert pillar["score"] == stored["pillarScores"][pillar["code"]]


async def test_seeded_readiness_matches_the_student_screenshot(student, seeded_db):
    """The seed reproduces the 78/100 readiness score shown in the Student Portal screens."""
    import bson

    stored = await seeded_db.eedi_scores.find_one(
        {"studentUserId": bson.ObjectId(student.user["id"])}
    )
    seeded = [h for h in stored["history"] if h.get("reason") == "seed_history"]
    assert seeded, "the seeded history should be preserved"
    assert seeded[-1]["finalScore"] == 78.0


async def test_learning_path_and_courses(student):
    path = (await student.get("/student/learning-path")).json()["data"]
    assert [s["stage"] for s in path["stages"]] == [
        "Foundation", "Communication", "Technical", "Interview Ready"
    ]
    assert 0 <= path["overallPercent"] <= 100

    courses = (await student.get("/student/courses")).json()["data"]
    titles = {c["title"] for c in courses}
    assert {"Business Communication", "Coding & DSA", "Professional Ethics"} <= titles
    business = next(c for c in courses if c["title"] == "Business Communication")
    assert business["percent"] == 60.0
    assert business["trainerName"] == "Prof. Alan Walker"
    assert business["nextLesson"]


async def test_course_progress_updates_and_awards_xp(student, seeded_db):
    courses = (await student.get("/student/courses")).json()["data"]
    target = next((c for c in courses if c.get("title") == "Business Communication"), next(c for c in courses if c["percent"] < 100))
    detail = (await student.get(f"/student/courses/{target['id']}")).json()["data"]
    lesson = next(
        candidate
        for module in detail["modules"]
        for candidate in module["lessons"]
        if not candidate["completed"]
    )

    before = (await student.get("/student/dashboard")).json()["data"]["xp"]["total"]
    response = await student.post(
        f"/student/courses/{target['id']}/progress",
        json={"lessonId": lesson["id"], "percent": 100, "minutesSpent": 12},
    )
    assert response.status_code == 200
    assert response.json()["data"]["completedLessons"] >= 1
    after = (await student.get("/student/dashboard")).json()["data"]["xp"]["total"]
    assert after > before


# --------------------------------------------------------------------------- games
async def test_games_list_matches_the_supplied_catalogue(student):
    data = (await student.get("/student/games")).json()["data"]
    titles = {g["title"] for g in data["games"]}
    assert {
        "Inbox Rescue", "Conflict Navigator", "Pitch Perfect",
        "Priority Sprint", "Interview Lightning Round", "Tone Detective",
    } <= titles
    assert data["xp"]["level"] >= 1
    assert data["weeklyQuest"]["target"] > 0
    assert data["badges"]


async def test_game_detail_withholds_the_correct_answer(student):
    games = (await student.get("/student/games")).json()["data"]["games"]
    navigator = next(g for g in games if g["title"] == "Conflict Navigator")
    data = (await student.get(f"/student/games/{navigator['id']}")).json()["data"]

    level = data["levels"][1]
    assert "defensive" in level["scenario"]
    assert len(level["options"]) == 4
    assert level["objectives"]
    assert level["hint"]
    # The scoring signal must not be shipped to the client before the answer is submitted.
    for option in level["options"]:
        assert "delta" not in option
        assert "best" not in option
        assert "feedback" not in option
    # Keyboard shortcuts from the game screenshot are declared for accessibility.
    keys = {s["keys"] for s in data["accessibility"]["keyboardShortcuts"]}
    assert {"1–4", "Enter"} <= keys
    assert data["accessibility"]["screenReaderFriendly"] is True


async def test_game_attempt_is_persisted_with_score_xp_and_skill_deltas(student, seeded_db):
    games = (await student.get("/student/games")).json()["data"]["games"]
    navigator = next(g for g in games if g["title"] == "Conflict Navigator")
    detail = (await student.get(f"/student/games/{navigator['id']}")).json()["data"]
    level = detail["levels"][1]
    best_option = level["options"][0]  # "Best for collaboration" in the seeded catalogue

    response = await student.post(
        f"/student/games/{navigator['id']}/attempts",
        json={
            "level": 2,
            "choices": [{"optionId": best_option["id"]}],
            "completed": True,
            "comboMax": 3,
            "durationSeconds": 240,
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["score"] > 0
    assert data["xpEarned"] == navigator["xpReward"]
    assert data["skillDeltas"]
    assert data["choices"][0]["best"] is True
    assert data["choices"][0]["feedback"]

    stored = await seeded_db.game_attempts.find_one({"_id": __import__("bson").ObjectId(data["attemptId"])})
    assert stored["completed"] is True
    assert stored["skillDeltas"]


async def test_game_rejects_an_out_of_range_level(student):
    games = (await student.get("/student/games")).json()["data"]["games"]
    response = await student.post(
        f"/student/games/{games[0]['id']}/attempts", json={"level": 19, "choices": []}
    )
    assert response.status_code == 400


# --------------------------------------------------------------------------- practice
async def test_practice_studio_recommends_the_weakest_area(student):
    data = (await student.get("/student/practice/modes")).json()["data"]
    titles = {m["title"] for m in data["modes"]}
    assert {
        "AI Role-play", "Mock Interview", "Presentation Coach",
        "Group Discussion Lab", "Workplace Writing", "Speaking Fluency",
    } == titles
    assert data["recommended"] is not None
    assert data["weeklyProgress"]["target"] == 5
    interview = next(m for m in data["modes"] if m["title"] == "Mock Interview")
    assert interview["attempts"] >= 1
    assert interview["lastScore"] is not None


async def test_full_practice_flow_produces_evidence_backed_feedback(student, seeded_db):
    """Start → upload a recording → complete → scored feedback grounded in the transcript."""
    start = await student.post(
        "/student/practice/sessions",
        json={"practiceModeCode": "mock-interview", "idempotencyKey": "test-flow-1"},
    )
    assert start.status_code == 201, start.text
    session = start.json()["data"]
    assert session["state"] == "draft"
    assert session["attemptNumber"] >= 1
    assert "private and encrypted" in session["privacyNotice"]
    assert len(session["questions"]) == 5

    # A retried start must not create a second attempt.
    again = await student.post(
        "/student/practice/sessions",
        json={"practiceModeCode": "mock-interview", "idempotencyKey": "test-flow-1"},
    )
    assert again.json()["meta"]["idempotentReplay"] is True

    upload = await student.post(
        "/student/practice/upload",
        data={"sessionId": session["id"], "mediaType": "audio", "durationSeconds": "42"},
        files={"file": ("answer.webm", io.BytesIO(b"fake-audio" * 4000), "audio/webm")},
    )
    assert upload.status_code == 200, upload.text
    assert upload.json()["data"]["checksum"]

    complete = await student.post(
        f"/student/practice/sessions/{session['id']}/complete",
        json={"answeredQuestions": 5, "durationSeconds": 42},
    )
    assert complete.status_code == 200, complete.text

    feedback = (
        await student.get(f"/student/practice/sessions/{session['id']}/feedback")
    ).json()["data"]
    assert feedback["ready"] is True
    assert 0 <= feedback["overall"] <= 100

    # The six feedback dimensions from the AI Feedback screenshot.
    assert [d["code"] for d in feedback["dimensions"]] == [
        "relevance", "clarity", "confidence", "structure", "fluency", "professionalism"
    ]
    assert feedback["grounded"] is True
    transcript_text = feedback["transcript"]["text"]
    for dimension in feedback["dimensions"]:
        assert dimension["explanation"]
        for evidence in dimension["evidence"]:
            # Every quoted span must actually appear in the student's own transcript.
            assert evidence["span"] in transcript_text
            assert evidence["kind"] in ("strength", "improvement")
            assert evidence["end"] >= evidence["start"]
    assert feedback["strengths"] and feedback["focusNext"]
    assert feedback["personalizedExercise"]["steps"]
    assert feedback["metrics"]["wordsPerMinute"] > 0
    assert feedback["metrics"]["paceBand"] in ("Slow", "Optimal", "Fast")
    assert feedback["playbackUrl"] and "token=" in feedback["playbackUrl"]
    assert feedback["trainerReview"]["state"] == "pending"


async def test_completing_without_a_recording_is_refused(student):
    start = await student.post(
        "/student/practice/sessions",
        json={"practiceModeCode": "speaking-fluency", "idempotencyKey": "test-empty-1"},
    )
    session = start.json()["data"]
    response = await student.post(
        f"/student/practice/sessions/{session['id']}/complete", json={}
    )
    assert response.status_code == 422
    assert error_code(response) == "BUSINESS_RULE_VIOLATION"
    assert "nothing to score" in response.text.lower()


async def test_blank_submission_cannot_score_well(student):
    """A near-empty answer must not receive a passable score (§31 edge cases)."""
    start = await student.post(
        "/student/practice/sessions",
        json={"practiceModeCode": "workplace-writing", "idempotencyKey": "test-blank-1"},
    )
    session = start.json()["data"]
    await student.post(
        f"/student/practice/sessions/{session['id']}/complete",
        json={"transcriptOverride": "ok thanks", "answeredQuestions": 1},
    )
    feedback = (
        await student.get(f"/student/practice/sessions/{session['id']}/feedback")
    ).json()["data"]
    assert feedback["ready"] is True
    assert feedback["overall"] < 40


async def test_empty_upload_is_rejected(student):
    start = await student.post(
        "/student/practice/sessions",
        json={"practiceModeCode": "ai-roleplay", "idempotencyKey": "test-emptyfile-1"},
    )
    session = start.json()["data"]
    response = await student.post(
        "/student/practice/upload",
        data={"sessionId": session["id"], "mediaType": "audio"},
        files={"file": ("empty.webm", io.BytesIO(b""), "audio/webm")},
    )
    assert response.status_code == 400
    assert "empty" in response.text.lower()


async def test_unsupported_media_type_is_rejected(student):
    start = await student.post(
        "/student/practice/sessions",
        json={"practiceModeCode": "ai-roleplay", "idempotencyKey": "test-badmedia-1"},
    )
    session = start.json()["data"]
    response = await student.post(
        "/student/practice/upload",
        data={"sessionId": session["id"], "mediaType": "audio"},
        files={"file": ("x.exe", io.BytesIO(b"MZ"), "application/x-msdownload")},
    )
    assert response.status_code == 400
    assert "not a supported recording format" in response.text


async def test_written_practice_accepts_typed_text(student):
    start = await student.post(
        "/student/practice/sessions",
        json={"practiceModeCode": "workplace-writing", "idempotencyKey": "test-written-1"},
    )
    session = start.json()["data"]
    letter = (
        "Dear Mr Sharma, thank you for your patience while we reviewed the delivery schedule. "
        "First, the revised timeline moves the handover to the fifteenth, which protects the "
        "testing window. I have attached the updated plan and highlighted the two dates that "
        "changed. Please confirm by Thursday and I will notify the delivery team."
    )
    complete = await student.post(
        f"/student/practice/sessions/{session['id']}/complete",
        json={"transcriptOverride": letter, "answeredQuestions": 1},
    )
    assert complete.status_code == 200
    feedback = (
        await student.get(f"/student/practice/sessions/{session['id']}/feedback")
    ).json()["data"]
    assert feedback["ready"] is True
    assert feedback["transcript"]["text"] == letter
    assert feedback["overall"] > 40


async def test_attempts_can_be_compared(student):
    sessions = (await student.get("/student/practice/sessions", params={"state": "scored"})).json()
    mock_interviews = [
        s for s in sessions["items"] if s["practiceModeCode"] == "mock-interview"
    ]
    latest = mock_interviews[0]
    response = await student.get(f"/student/practice/sessions/{latest['id']}/compare")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["current"]["overall"] is not None
    assert len(data["dimensions"]) == 6


async def test_scoring_is_deterministic_for_the_same_input(student):
    """Two identical submissions must produce identical scores (the mock provider is stable)."""
    text = "First, I led a team of four. As a result, we reduced onboarding time by 30%."
    scores = []
    for index in range(2):
        start = await student.post(
            "/student/practice/sessions",
            json={
                "practiceModeCode": "workplace-writing",
                "idempotencyKey": f"determinism-{index}",
            },
        )
        session_id = start.json()["data"]["id"]
        await student.post(
            f"/student/practice/sessions/{session_id}/complete",
            json={"transcriptOverride": text, "answeredQuestions": 1},
        )
        feedback = (
            await student.get(f"/student/practice/sessions/{session_id}/feedback")
        ).json()["data"]
        scores.append(feedback["overall"])
    assert scores[0] == scores[1]


# --------------------------------------------------------------------------- progress & profile
async def test_progress_and_insights(student, seeded_db):
    import bson

    data = (await student.get("/student/progress")).json()["data"]
    stored = await seeded_db.eedi_scores.find_one(
        {"studentUserId": bson.ObjectId(student.user["id"])}
    )
    assert data["readiness"]["score"] == stored["finalScore"]
    assert data["practiceSessions"] >= 1
    assert data["batchRank"]["rank"] >= 1
    assert len(data["trend"]) >= 2
    # Strongest / focus are derived from the live breakdown, so they move with new evidence.
    scored = [p for p in data["skillBreakdown"] if p["hasData"]]
    assert data["strongestSkill"]["score"] == max(p["score"] for p in scored)
    assert data["focusArea"]["score"] == min(p["score"] for p in scored)
    assert data["dayOneVsToday"]["rows"][0]["metric"] == "EEDI Readiness Score"
    assert data["recentAssessments"]


async def test_progress_report_export(student):
    response = await student.post("/student/reports/progress", params={"fmt": "pdf"})
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "ready"
    assert data["filename"].endswith(".pdf")
    assert "token=" in data["downloadUrl"]


async def test_progress_report_pdf_is_downloadable(client, student):
    created = await student.post("/student/reports/progress", params={"fmt": "pdf"})
    url = created.json()["data"]["downloadUrl"]
    response = await client.get(url)
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


async def test_profile_and_placement_plan(student):
    data = (await student.get("/student/profile")).json()["data"]
    assert data["profile"]["rollNumber"]
    assert data["profile"]["program"].startswith("B.Tech")
    assert data["profileCompleteness"] > 0
    assert data["placementGoal"]["targetRole"] == "Software Engineer"
    assert data["placementGoal"]["targetScore"] == 85.0
    assert len(data["roadmap"]) == 3
    assert data["skillGaps"][0]["priority"] == "High"
    assert len(data["weekSchedule"]) == 7
    assert data["sessions"]
    assert "preferences" in data


async def test_placement_goal_can_be_updated(student):
    response = await student.put(
        "/student/placement-goal",
        json={
            "targetRole": "Data Engineer",
            "targetScore": 88,
            "targetDate": "2027-05-31",
            "focusAreas": ["Problem Solving"],
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["targetRole"] == "Data Engineer"
    assert data["roadmap"]


async def test_settings_toggle_persists(student):
    response = await student.patch(
        "/student/settings", json={"smsNotifications": True, "classRecordings": False}
    )
    assert response.status_code == 200
    settings_data = (await student.get("/student/settings")).json()["data"]
    assert settings_data["preferences"]["smsNotifications"] is True
    assert settings_data["preferences"]["classRecordings"] is False


async def test_profile_update_recomputes_completeness(student):
    response = await student.patch(
        "/student/profile", json={"bio": "Final-year CSE student focused on backend engineering."}
    )
    assert response.status_code == 200
    assert (await student.get("/student/profile")).json()["data"]["profileCompleteness"] > 0


async def test_achievements_include_badges_and_certificates(student):
    data = (await student.get("/student/achievements")).json()["data"]
    assert data["badges"]
    assert any(b["earned"] for b in data["badges"])
    assert all(0 <= b["progressPercent"] <= 100 for b in data["badges"])


async def test_assessments_and_quiz_submission(student):
    listing = (await student.get("/student/assessments")).json()["data"]
    assert listing
    available = next((q for q in listing if q["state"] == "available"), None)
    if available is None:
        pytest.skip("no open quiz in the seeded batch")

    detail = (await student.get(f"/student/assessments/{available['id']}")).json()["data"]
    answers = [
        {"questionId": q["id"], "optionId": q["options"][0]["id"]} for q in detail["questions"]
    ]
    response = await student.post(
        f"/student/assessments/{available['id']}/attempts",
        json={"answers": answers, "durationSeconds": 300},
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert 0 <= data["score"] <= 100
    assert data["answers"]
    # A second submission is refused for a non-retakeable quiz.
    repeat = await student.post(
        f"/student/assessments/{available['id']}/attempts",
        json={"answers": answers, "durationSeconds": 10},
    )
    assert repeat.status_code == 409


async def test_live_classes_split_upcoming_and_past(student):
    data = (await student.get("/student/live-classes")).json()["data"]
    assert data["upcoming"]
    assert any(c["title"] == "Interview Techniques Masterclass" for c in data["upcoming"])


async def test_leaderboard_reports_a_percentile(student):
    data = (await student.get("/student/leaderboard")).json()["data"]
    assert data["rows"]
    assert data["me"]["rank"] >= 1
    assert data["percentile"] is not None


async def test_resume_upload_and_analysis(student):
    pdf = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
    )
    response = await student.post(
        "/student/resume",
        files={"file": ("resume.pdf", io.BytesIO(pdf), "application/pdf")},
    )
    assert response.status_code == 200, response.text
    analysis = response.json()["data"]["analysis"]
    assert 0 <= analysis["score"] <= 100
    assert analysis["gaps"]
    assert analysis["basis"].startswith("structural analysis")

    stored = (await student.get("/student/resume/analysis")).json()["data"]
    assert stored["filename"] == "resume.pdf"
    assert "token=" in stored["downloadUrl"]


async def test_resume_rejects_the_wrong_file_type(student):
    response = await student.post(
        "/student/resume",
        files={"file": ("resume.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 400


async def test_recommendations_expose_the_weighted_readiness_model(student):
    data = (await student.get("/student/recommendations")).json()["data"]
    weights = {d["code"]: d["weight"] for d in data["readinessDimensions"]}
    assert weights == {
        "verbal_fluency": 0.25,
        "confidence_presentation": 0.20,
        "behaviour_professionalism": 0.15,
        "leadership_teamwork": 0.15,
        "interview_readiness": 0.15,
        "professional_writing": 0.10,
    }
    assert abs(sum(weights.values()) - 1.0) < 1e-9
    assert data["exerciseLibrary"]


async def test_ai_coach_is_grounded_in_the_students_own_sessions(student):
    response = await student.post(
        "/ai/coach", json={"question": "What should I work on before my next interview?"}
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["grounded"] is True
    assert data["citations"]
    assert data["evidenceCount"] > 0
    for citation in data["citations"]:
        assert citation["span"]


async def test_assignments_listing_and_submission(student):
    listing = (await student.get("/student/assignments")).json()["data"]
    assert listing
    pending = next((a for a in listing if a["state"] == "pending" and a["daysLeft"] and a["daysLeft"] >= 0), None)
    if pending is None:
        pytest.skip("no open assignment for this batch")
    response = await student.post(
        f"/student/assignments/{pending['id']}/submit",
        data={"note": "Submitted the formal email and the accompanying report."},
    )
    assert response.status_code == 200


async def test_notifications_are_own_rows_only(student):
    listing = (await student.get("/notifications")).json()
    assert listing["meta"]["unread"] >= 1
    for row in listing["items"]:
        assert row["userId"] == student.user["id"]

    first = listing["items"][0]
    read = await student.post(f"/notifications/{first['id']}/read")
    assert read.status_code == 200
