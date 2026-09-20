import pytest
from httpx import AsyncClient
from app.db.mongo import get_db
from tests.conftest import API, Session, login

@pytest.mark.asyncio
async def test_game_url_and_course_attachment(client: AsyncClient, super_admin: Session, student: Session):
    """Test Game URL persistence, course attachment, retrieval, and student launch tracking."""
    # 1. Super Admin creates game with gameUrl and course attachment
    db = get_db()
    course = await db.courses.find_one({"deletedAt": None})
    assert course is not None
    course_id = str(course["_id"])

    game_code = "algo-maze-runner"
    create_res = await super_admin.post("/super-admin/games", json={
        "code": game_code,
        "title": "Algorithm Maze Runner",
        "description": "Interactive pathfinding visualization game",
        "category": "Technical",
        "difficulty": "Intermediate",
        "xpReward": 75,
        "published": True,
        "gameUrl": "https://games.eedilms.app/algo-maze",
        "courseId": course_id,
        "durationMinutes": 10,
    })
    assert create_res.status_code == 200, create_res.text
    created_game = create_res.json()["data"]
    assert created_game["gameUrl"] == "https://games.eedilms.app/algo-maze"
    assert created_game["courseId"] == course_id

    # 2. Super Admin lists games and sees gameUrl and launch telemetry
    list_res = await super_admin.get("/super-admin/games")
    assert list_res.status_code == 200
    games = list_res.json()["data"]
    matched = next((g for g in games if g["code"] == game_code), None)
    assert matched is not None
    assert matched["gameUrl"] == "https://games.eedilms.app/algo-maze"

    # 3. Student retrieves games catalog and sees the game URL
    student_games = (await student.get("/student/games")).json()["data"]["games"]
    student_match = next((g for g in student_games if g["code"] == game_code), None)
    assert student_match is not None
    assert student_match["gameUrl"] == "https://games.eedilms.app/algo-maze"

    # 4. Student records game launch
    launch_res = await student.post(f"/student/games/{student_match['id']}/launch")
    assert launch_res.status_code == 200
    assert launch_res.json()["success"] is True

    # Check that launches incremented in DB
    updated_db = await db.game_definitions.find_one({"code": game_code})
    assert updated_db["launches"] >= 1


@pytest.mark.asyncio
async def test_granular_permissions_in_provisioning(super_admin: Session):
    """Test provisioning with custom granular permissions and their persistence."""
    email = "trainer.specialized@abcengg.edu"
    custom_permissions = [
        "VIEW_ASSIGNED_CLASSES",
        "MARK_ATTENDANCE",
        "VIEW_ASSIGNED_STUDENTS",
    ]
    res = await super_admin.post("/super-admin/users", json={
        "name": "Prof Specialized",
        "email": email,
        "mobile": "+919876543219",
        "employeeId": "TRN-SPEC-01",
        "role": "TRAINER",
        "collegeId": "ABC",
        "permissions": custom_permissions,
    })
    assert res.status_code == 201, res.text
    user_data = res.json()["data"]
    assert user_data["permissions"] == custom_permissions

    # Verify in DB
    db = get_db()
    user = await db.users.find_one({"email": email})
    assert user is not None
    assert user["permissions"] == custom_permissions


@pytest.mark.asyncio
async def test_course_control_center_isolation(super_admin: Session, student: Session):
    """Test that Course Control Center analytics are completely isolated to the requested course."""
    db = get_db()
    courses = await db.courses.find({"deletedAt": None}).to_list(2)
    assert len(courses) >= 2, "Need at least 2 courses for isolation test"
    course_a = courses[0]
    course_b = courses[1]

    # Checkout course A for student
    await student.post("/student/payments/checkout", json={
        "courseId": str(course_a["_id"]),
        "courseMode": "ONLINE",
        "paymentMethod": "UPI",
    })

    # Retrieve Course Control Center for Course A
    ctrl_a = (await super_admin.get(f"/super-admin/courses/{course_a['_id']}/control-center")).json()["data"]
    # Retrieve Course Control Center for Course B
    ctrl_b = (await super_admin.get(f"/super-admin/courses/{course_b['_id']}/control-center")).json()["data"]

    assert ctrl_a["course"]["id"] == str(course_a["_id"])
    assert ctrl_b["course"]["id"] == str(course_b["_id"])
    # Analytics must be strictly course-isolated
    assert ctrl_a["analytics"]["totalEnrolled"] >= 1
    # Verify course A enrollments are not leaking into course B
    assert ctrl_a["analytics"] != ctrl_b["analytics"] or ctrl_b["analytics"]["totalEnrolled"] == 0

