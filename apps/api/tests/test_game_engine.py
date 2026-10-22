"""Unit tests for Gamification, CSV Service, Adaptive Engine, and EEDI Calculations."""
import pytest
from app.services.game_csv_service import GameCSVService
from app.services.game_engine import GameEngine


def test_adaptive_difficulty_promotions():
    """Verify rolling window level transitions."""
    # Starting at BEGINNER with 4/5 correct -> promote to INTERMEDIATE
    answers_promoted = [
        {"is_correct": True},
        {"is_correct": True},
        {"is_correct": True},
        {"is_correct": True},
        {"is_correct": False},
    ]
    next_diff = GameEngine.calculate_next_difficulty("BEGINNER", answers_promoted, window_size=5)
    assert next_diff == "INTERMEDIATE"

    # Starting at INTERMEDIATE with 5/5 correct -> promote to ADVANCED
    answers_perfect = [{"is_correct": True}] * 5
    next_diff2 = GameEngine.calculate_next_difficulty("INTERMEDIATE", answers_perfect, window_size=5)
    assert next_diff2 == "ADVANCED"

    # Already at ADVANCED -> caps at ADVANCED
    next_diff3 = GameEngine.calculate_next_difficulty("ADVANCED", answers_perfect, window_size=5)
    assert next_diff3 == "ADVANCED"


def test_adaptive_difficulty_demotions():
    """Verify rolling window downward adaptations."""
    # Starting at ADVANCED with 1/5 correct -> demote to INTERMEDIATE
    answers_bad = [
        {"is_correct": False},
        {"is_correct": False},
        {"is_correct": False},
        {"is_correct": True},
        {"is_correct": False},
    ]
    next_diff = GameEngine.calculate_next_difficulty("ADVANCED", answers_bad, window_size=5)
    assert next_diff == "INTERMEDIATE"

    # Starting at INTERMEDIATE with bad performance -> demote to BEGINNER
    next_diff2 = GameEngine.calculate_next_difficulty("INTERMEDIATE", answers_bad, window_size=5)
    assert next_diff2 == "BEGINNER"

    # Already at BEGINNER -> floors at BEGINNER
    next_diff3 = GameEngine.calculate_next_difficulty("BEGINNER", answers_bad, window_size=5)
    assert next_diff3 == "BEGINNER"


def test_adaptive_difficulty_maintenance():
    """Verify maintaining difficulty within 50% - 79% accuracy."""
    answers_mid = [
        {"is_correct": True},
        {"is_correct": True},
        {"is_correct": False},
        {"is_correct": True},
        {"is_correct": False},
    ]  # 3/5 = 60%
    next_diff = GameEngine.calculate_next_difficulty("INTERMEDIATE", answers_mid, window_size=5)
    assert next_diff == "INTERMEDIATE"


@pytest.mark.asyncio
async def test_csv_validation_valid():
    """Verify standard CSV format with valid questions."""
    csv_text = """question,option_a,option_b,option_c,option_d,answer,tag,eedi_parameter,weight,difficulty
What is Eloquent?,Fluent and persuasive,Angry,Tired,Silent,A,Vocabulary,COM04,1.2,Intermediate
Synonym of Rapid?,Slow,Fast,Weak,Late,B,Vocabulary,COM04,1.0,Beginner
Antonym of Generous?,Kind,Helpful,Selfish,Friendly,C,Vocabulary,COM04,1.0,Beginner
"""
    report = await GameCSVService.validate_csv(csv_text)
    assert report["is_valid"] is True
    assert report["valid_count"] == 3
    assert report["invalid_count"] == 0
    assert len(report["valid_rows"]) == 3
    assert report["valid_rows"][0]["answer_index"] == 0
    assert report["valid_rows"][1]["answer_index"] == 1
    assert report["valid_rows"][2]["answer_index"] == 2


@pytest.mark.asyncio
async def test_csv_validation_errors():
    """Verify error catching on invalid questions, answers, and parameters."""
    bad_csv = """question,option_a,option_b,option_c,option_d,answer,tag,eedi_parameter,weight
,Option A,Option B,Option C,Option D,A,Tag,COM04,1.0
Valid Question,Opt1,Opt2,Opt3,Opt4,Z,Tag,COM04,1.0
Another Question,Opt1,Opt2,Opt3,Opt4,A,Tag,INVALID_CODE,1.0
Negative Weight,Opt1,Opt2,Opt3,Opt4,A,Tag,COM04,-2.0
"""
    report = await GameCSVService.validate_csv(bad_csv)
    assert report["is_valid"] is False
    assert report["invalid_count"] == 4
    error_columns = {e["column"] for e in report["errors"]}
    assert "question" in error_columns
    assert "answer" in error_columns
    assert "eedi_parameter" in error_columns
    assert "weight" in error_columns


@pytest.mark.asyncio
async def test_full_attempt_lifecycle_and_traceability():
    """Verify end-to-end attempt, no-repeat enforcement, and real EEDI calculation."""
    from app.repositories.game_repo import GameRepository
    from app.db.postgres import get_pg_connection
    from uuid import uuid4

    # 1. Fetch our seeded game
    game = await GameRepository.get_game_by_code("read-escape")
    assert game is not None
    qset = await GameRepository.get_active_question_set(game["id"])
    assert qset is not None

    # Fetch a real participant user from PostgreSQL
    async with get_pg_connection() as conn:
        participant_id = await conn.fetchval("SELECT id FROM users LIMIT 1")
    assert participant_id is not None

    # 2. Create attempt
    attempt = await GameRepository.create_attempt(
        game_id=game["id"],
        question_set_id=qset["id"],
        participant_id=participant_id
    )
    attempt_id = attempt["id"]
    assert attempt["status"] == "IN_PROGRESS"
    assert attempt["current_difficulty"] == "BEGINNER"

    # 3. Get first question
    q1 = await GameEngine.get_next_question(attempt_id)
    assert q1 is not None
    assert "question_id" in q1
    assert "answer_index" not in q1  # Client must not see answer

    # 4. Submit correct answer
    async with get_pg_connection() as conn:
        correct_idx = await conn.fetchval(
            "SELECT answer_index FROM game_questions WHERE id = $1",
            q1["question_id"],
        )
    ans_res = await GameEngine.submit_answer(
        attempt_id=attempt_id,
        question_id=q1["question_id"],
        selected_option=correct_idx,
        response_time_ms=5000,
    )
    assert "is_correct" in ans_res
    assert ans_res["earned_score"] > 0

    # 5. Anti-repeat enforcement: submitting the same question again must fail
    with pytest.raises(ValueError, match="already answered"):
        await GameEngine.submit_answer(
            attempt_id=attempt_id,
            question_id=q1["question_id"],
            selected_option=1
        )

    # 6. Finish attempt
    summary = await GameEngine.finish_attempt(attempt_id, duration_seconds=60)
    assert summary["status"] == "COMPLETED"
    assert summary["raw_score"] > 0
    assert "final_eedi" in summary
    assert "pillar_scores" in summary
    assert "communication" in summary["pillar_scores"]
    assert len(summary["performance_metrics"]["traceability"]) == 1
