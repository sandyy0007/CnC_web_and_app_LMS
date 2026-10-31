"""Health, seeded-data sanity and the public home page."""
from __future__ import annotations

from app.seed.run import SEED_MARKER
from tests.conftest import API


async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_readiness_reports_dependencies(client):
    response = await client.get("/health/ready")
    body = response.json()
    assert response.status_code == 200
    db_check = body["checks"].get("postgres") or body["checks"].get("mongo")
    assert db_check is not None and "ok" in db_check
    assert body["checks"]["redis"]["ok"] is True
    assert "evaluation" in body["checks"]["ai"]


async def test_seed_created_expected_cohort(seeded_db):
    # Scoped to the seeded institution: other tests may add a second college to this shared
    # database to exercise cross-tenant isolation.
    college = await seeded_db.colleges.find_one({"code": "ABC"})
    assert college is not None
    assert (
        await seeded_db.departments.count_documents(
            {"collegeId": college["_id"], "deletedAt": None, "seedMarker": SEED_MARKER}
        )
        == 7
    )
    # The Participant Directory screenshot shows 428 CSE participants. Counted by seed marker,
    # because other tests sign new accounts up into this shared database.
    cse = await seeded_db.departments.find_one({"code": "CSE", "collegeId": college["_id"]})
    seeded_cse = await seeded_db.student_profiles.count_documents(
        {"departmentId": cse["_id"], "seedMarker": SEED_MARKER}
    )
    assert seeded_cse == 428
    # 95+ trainer-rated parameters across the 7 pillars.
    assert await seeded_db.skill_assessment_definitions.count_documents({}) >= 95
    pillars = await seeded_db.skill_assessment_definitions.distinct("pillar")
    assert len(pillars) == 7


async def test_home_overview_carries_the_tagline(client):
    response = await client.get(f"{API}/home/overview")
    data = response.json()["data"]
    assert data["tagline"] == "Learn, Practise and Build the Skills Required for Your Career."
    assert data["philosophy"] == ["Practise", "Assess", "Improve", "Become Employable"]
    assert {p["code"] for p in data["pillars"]} >= {"ai", "assessments", "trainer_feedback"}


async def test_home_stats_come_from_the_database(client, seeded_db):
    response = await client.get(f"{API}/home/stats")
    data = response.json()["data"]
    assert data["source"] == "live-database"
    # Not a hard-coded constant: it matches a live count.
    assert data["learners"] == await seeded_db.student_profiles.count_documents({"deletedAt": None})
    assert data["trainers"] > 0
    assert data["institutions"] == await seeded_db.colleges.count_documents({"deletedAt": None})


async def test_home_courses_include_the_seven_featured_programs(client):
    response = await client.get(f"{API}/home/courses", params={"limit": 50})
    titles = {c["title"] for c in response.json()["data"]}
    assert {
        "Communication Skills", "Interview Preparation", "Group Discussion",
        "Aptitude and Reasoning", "Resume Building", "Personality Development",
        "Workplace Etiquette",
    } <= titles


async def test_home_faqs_and_testimonials_present(client):
    faqs = await client.get(f"{API}/home/faqs")
    assert len(faqs.json()["data"]) >= 7
    testimonials = await client.get(f"{API}/home/testimonials")
    body = testimonials.json()
    assert len(body["data"]) >= 1
    # Demo content is labelled as such rather than presented as real outcomes.
    assert "Demo" in body["meta"]["notice"]
    assert all(t["demo"] for t in body["data"])


async def test_continue_learning_is_student_only(client, student):
    anonymous = await client.get(f"{API}/home/continue-learning")
    assert anonymous.json()["data"] is None

    response = await client.get(
        f"{API}/home/continue-learning", headers=student.headers
    )
    assert response.json()["data"] is not None


async def test_assistant_grounds_answers_in_real_courses(client):
    response = await client.post(
        f"{API}/home/assistant", json={"question": "Do you have an interview preparation course?"}
    )
    data = response.json()["data"]
    assert data["grounded"] is True
    assert any("Interview" in c["title"] for c in data["courses"])


async def test_assistant_escalates_when_it_cannot_ground(client):
    response = await client.post(
        f"{API}/home/assistant", json={"question": "zzzz qqqq"}
    )
    data = response.json()["data"]
    assert data["grounded"] is False
    assert data["escalation"]["available"] is True


async def test_institution_directory_lists_codes_for_signup(client, seeded_db):
    """The signup form needs college + department codes, and nothing more than that."""
    response = await client.get(f"{API}/home/institutions")
    assert response.status_code == 200
    body = response.json()
    abc = next(c for c in body["data"] if c["code"] == "ABC")
    assert {d["code"] for d in abc["departments"]} >= {"CSE", "ECE"}
    # No internal identifiers or counts leak through the public directory.
    assert "id" not in abc and "_id" not in abc
    assert all(set(d) == {"code", "name"} for d in abc["departments"])
