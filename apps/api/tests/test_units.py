"""Unit tests for the pure pieces: scoring engine, AI provider, report writers, queue, security."""
from __future__ import annotations

import pytest

from app.core.security import (
    assert_password_policy,
    hash_password,
    password_problems,
    password_strength,
    sign_payload,
    verify_password,
    verify_signed_payload,
)
from app.services import scoring
from app.services.ai_provider import (
    FEEDBACK_DIMENSIONS,
    FEEDBACK_TO_READINESS,
    PILLARS,
    READINESS_DIMENSIONS,
    MockEvaluationProvider,
    MockSpeechToTextProvider,
    compute_metrics,
    count_fillers,
)
from app.services.certificates import evaluate_eligibility
from app.services.reports import report_catalogue, to_csv, to_pdf, to_xlsx


# --------------------------------------------------------------------------- rubrics
def test_the_seven_pillars_are_the_documented_ones():
    assert [label for _, label in PILLARS] == [
        "Behaviour", "Communication", "Confidence", "Leadership",
        "Technical", "Problem Solving", "Career Readiness",
    ]


def test_readiness_weights_are_the_documented_percentages_and_sum_to_one():
    weights = {d.code: d.weight for d in READINESS_DIMENSIONS}
    assert weights == {
        "verbal_fluency": 0.25,
        "confidence_presentation": 0.20,
        "behaviour_professionalism": 0.15,
        "leadership_teamwork": 0.15,
        "interview_readiness": 0.15,
        "professional_writing": 0.10,
    }
    assert abs(sum(weights.values()) - 1.0) < 1e-9


def test_feedback_dimensions_map_onto_readiness_dimensions():
    codes = {d.code for d in FEEDBACK_DIMENSIONS}
    assert codes == {
        "relevance", "clarity", "confidence", "structure", "fluency", "professionalism"
    }
    assert set(FEEDBACK_TO_READINESS) == codes
    targets = {d.code for d in READINESS_DIMENSIONS}
    assert set(FEEDBACK_TO_READINESS.values()) <= targets


def test_every_pillar_is_reachable_from_the_readiness_model():
    mapped = set(scoring.READINESS_TO_PILLAR.values())
    assert mapped <= set(scoring.PILLAR_CODES)


# --------------------------------------------------------------------------- scoring engine
DEFINITIONS = [
    {"code": "COM01", "pillar": "communication", "maxScore": 5, "weight": 2.0},
    {"code": "COM02", "pillar": "communication", "maxScore": 5, "weight": 1.0},
    {"code": "BEH01", "pillar": "behaviour", "maxScore": 10, "weight": 1.0},
]


def test_parameters_are_normalised_to_percentages_of_their_own_maximum():
    pillars = scoring.pillar_scores_from_parameters(
        [
            {"code": "COM01", "score": 5},   # 100%
            {"code": "COM02", "score": 2.5}, # 50%
            {"code": "BEH01", "score": 7},   # 70% of 10
        ],
        DEFINITIONS,
    )
    # Weighted: (100*2 + 50*1) / 3
    assert pillars["communication"] == pytest.approx(83.33, abs=0.01)
    assert pillars["behaviour"] == 70.0


def test_unknown_and_missing_parameters_are_ignored_not_counted_as_zero():
    pillars = scoring.pillar_scores_from_parameters(
        [
            {"code": "COM01", "score": 5},
            {"code": "NOPE", "score": 1},
            {"code": "COM02", "score": None},
        ],
        DEFINITIONS,
    )
    assert pillars == {"communication": 100.0}


def test_blend_uses_whichever_signals_exist():
    assert scoring.blend(None, None, trainer_weight=0.6, ai_weight=0.4) is None
    # A missing signal must not drag the score down.
    assert scoring.blend(80, None, trainer_weight=0.6, ai_weight=0.4) == 80
    assert scoring.blend(None, 60, trainer_weight=0.6, ai_weight=0.4) == 60
    assert scoring.blend(80, 60, trainer_weight=0.6, ai_weight=0.4) == 72.0


def test_blend_respects_configured_weights():
    assert scoring.blend(100, 0, trainer_weight=1, ai_weight=0) == 100.0
    assert scoring.blend(100, 0, trainer_weight=0, ai_weight=1) == 0.0
    assert scoring.blend(100, 0, trainer_weight=1, ai_weight=1) == 50.0


def test_recency_weighting_favours_the_newest_attempt():
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    readiness = scoring.readiness_from_ai_scores(
        [
            {
                "createdAt": now,
                "dimensions": [{"code": "clarity", "score": 90}],
            },
            {
                "createdAt": now - timedelta(days=30),
                "dimensions": [{"code": "clarity", "score": 30}],
            },
        ]
    )
    # Above the plain arithmetic mean of 60: the newer attempt carries more weight.
    assert 60 < readiness["verbal_fluency"] < 90


def test_readiness_handles_naive_timestamps_from_the_database():
    """BSON datetimes may come back naive; the sort must not raise."""
    from datetime import datetime, timedelta, timezone

    aware = datetime.now(timezone.utc)
    naive = (aware - timedelta(days=1)).replace(tzinfo=None)
    readiness = scoring.readiness_from_ai_scores(
        [
            {"createdAt": naive, "dimensions": [{"code": "clarity", "score": 40}]},
            {"createdAt": aware, "dimensions": [{"code": "clarity", "score": 80}]},
        ]
    )
    assert readiness["verbal_fluency"] > 0


def test_ai_component_reweights_when_dimensions_are_missing():
    full = scoring.ai_component({d.code: 80 for d in READINESS_DIMENSIONS})
    assert full == 80.0
    partial = scoring.ai_component({"verbal_fluency": 80})
    assert partial == 80.0


def test_bands_and_proficiency_levels():
    assert scoring.band_for(None) == "No data"
    assert scoring.band_for(90) == "Excellent"
    assert scoring.band_for(78) == "Strong"
    assert scoring.band_for(65) == "Good"
    assert scoring.band_for(52) == "Average"
    assert scoring.band_for(30) == "Needs Work"

    assert scoring.proficiency_level(90) == "Expert"
    assert scoring.proficiency_level(72) == "Advanced"
    assert scoring.proficiency_level(58) == "Intermediate"
    assert scoring.proficiency_level(40) == "Beginner"


# --------------------------------------------------------------------------- certificates
def test_certificate_needs_both_thresholds():
    assert evaluate_eligibility(
        attendance_pct=80, avg_score=70, min_attendance=75, min_score=60
    ) == (True, None)
    assert evaluate_eligibility(
        attendance_pct=60, avg_score=70, min_attendance=75, min_score=60
    ) == (False, "Attendance below threshold")
    assert evaluate_eligibility(
        attendance_pct=80, avg_score=50, min_attendance=75, min_score=60
    ) == (False, "Score below threshold")
    assert evaluate_eligibility(
        attendance_pct=60, avg_score=50, min_attendance=75, min_score=60
    ) == (False, "Attendance & score below threshold")
    assert evaluate_eligibility(
        attendance_pct=None, avg_score=None, min_attendance=75, min_score=60
    ) == (False, "Awaiting attendance and assessment data")


def test_boundary_values_count_as_met():
    assert evaluate_eligibility(
        attendance_pct=75, avg_score=60, min_attendance=75, min_score=60
    ) == (True, None)


# --------------------------------------------------------------------------- AI provider
async def test_transcript_metrics_are_measured_not_invented():
    transcript = await MockSpeechToTextProvider().transcribe(
        b"x" * 60000, content_type="audio/webm", hint="interview"
    )
    metrics = compute_metrics(transcript, seed="unit")
    assert metrics.wordCount == transcript.word_count
    assert metrics.responseSeconds > 0
    assert metrics.wordsPerMinute > 0
    assert metrics.paceBand in ("Slow", "Optimal", "Fast")
    assert metrics.paceSeries
    # Filler counts are actual occurrences in the text.
    assert metrics.fillerWordCount == sum(count_fillers(transcript.text).values())


def test_filler_word_counting_is_word_bounded():
    assert count_fillers("um, I think, um") == {"um": 2}
    # "umbrella" must not count as "um".
    assert count_fillers("umbrella") == {}
    assert count_fillers("you know, like, basically") == {
        "you know": 1, "like": 1, "basically": 1
    }


async def test_mock_evaluation_is_deterministic():
    provider = MockEvaluationProvider()
    transcript = await MockSpeechToTextProvider().transcribe(
        b"y" * 50000, content_type="audio/webm", hint="interview"
    )
    first = await provider.evaluate(
        transcript=transcript, question="Tell me about yourself.", kind="interview"
    )
    second = await provider.evaluate(
        transcript=transcript, question="Tell me about yourself.", kind="interview"
    )
    assert first.overall == second.overall
    assert [d.score for d in first.dimensions] == [d.score for d in second.dimensions]


async def test_every_evidence_span_comes_from_the_transcript():
    provider = MockEvaluationProvider()
    transcript = await MockSpeechToTextProvider().transcribe(
        b"z" * 80000, content_type="audio/webm", hint="presentation"
    )
    evaluation = await provider.evaluate(
        transcript=transcript, question="Explain a binary search tree.", kind="presentation"
    )
    assert evaluation.grounded is True
    assert evaluation.dimensions
    for dimension in evaluation.dimensions:
        assert dimension.explanation
        assert 0 <= dimension.score <= 100
        for evidence in dimension.evidence:
            assert evidence.span in transcript.text
            assert evidence.explanation
            assert evidence.end >= evidence.start


async def test_better_answers_score_higher_than_worse_ones():
    """The mock provider responds to real features, so quality ordering holds."""
    from app.services.ai_provider import Transcript, TranscriptSegment

    provider = MockEvaluationProvider()

    def make(text: str) -> Transcript:
        words = len(text.split())
        return Transcript(
            text=text,
            segments=[TranscriptSegment(0.0, max(2.0, words / 2.4), text)],
            provider="test",
        )

    question = "Tell me about a time you led a team."
    strong = make(
        "First, I led a team of four on a delivery that had slipped twice. "
        "My task was to rebuild the plan. I split the work, set a daily check-in, "
        "and took the riskiest part myself. As a result, we delivered in six weeks "
        "and reduced rework by 30%. In summary, clear ownership fixed it."
    )
    weak = make("Um, yeah, I guess I sort of, like, helped a team maybe once.")

    strong_result = await provider.evaluate(
        transcript=strong, question=question, kind="interview"
    )
    weak_result = await provider.evaluate(transcript=weak, question=question, kind="interview")
    assert strong_result.overall > weak_result.overall + 15

    strong_structure = next(d for d in strong_result.dimensions if d.code == "structure")
    weak_structure = next(d for d in weak_result.dimensions if d.code == "structure")
    assert strong_structure.score > weak_structure.score

    strong_fluency = next(d for d in strong_result.dimensions if d.code == "fluency")
    weak_fluency = next(d for d in weak_result.dimensions if d.code == "fluency")
    assert strong_fluency.score > weak_fluency.score


async def test_short_audio_produces_a_short_transcript():
    provider = MockSpeechToTextProvider()
    long_take = await provider.transcribe(b"x" * 200000, content_type="audio/webm", hint="interview")
    short_take = await provider.transcribe(b"x" * 2000, content_type="audio/webm", hint="interview")
    assert long_take.word_count > short_take.word_count
    empty = await provider.transcribe(b"", content_type="audio/webm", hint="interview")
    assert empty.word_count < short_take.word_count + 1


async def test_coach_refuses_to_answer_without_evidence():
    result = await MockEvaluationProvider().coach(
        question="How do I improve?", grounding=[], student_name="Alex Johnson"
    )
    assert result["grounded"] is False
    assert result["citations"] == []
    assert "don't have any of your practice sessions" in result["answer"]


async def test_coach_cites_the_weakest_dimension():
    result = await MockEvaluationProvider().coach(
        question="What should I focus on?",
        grounding=[
            {"sessionId": "a", "dimension": "Clarity", "score": 82, "span": "well structured"},
            {"sessionId": "b", "dimension": "Fluency", "score": 51, "span": "um, I think maybe"},
        ],
        student_name="Alex Johnson",
    )
    assert result["grounded"] is True
    assert "Fluency" in result["answer"]
    assert "51" in result["answer"]
    assert len(result["citations"]) == 2


# --------------------------------------------------------------------------- report writers
COLUMNS = ["Roll No.", "Participant", "Attendance %"]
ROWS = [["CSE21B045", "Rahul Sharma", "94%"], ["CSE21B012", "Ananya Iyer", "61%"]]


def test_csv_writer_emits_a_bom_and_the_header():
    content = to_csv(COLUMNS, ROWS)
    assert content.startswith(b"\xef\xbb\xbf")  # Excel-friendly BOM
    text = content.decode("utf-8-sig")
    assert text.splitlines()[0] == "Roll No.,Participant,Attendance %"
    assert "Rahul Sharma" in text


def test_xlsx_writer_produces_a_workbook_with_an_info_sheet():
    import io

    from openpyxl import load_workbook

    content = to_xlsx("Attendance", COLUMNS, ROWS, meta={"Rows": 2, "Scope": "CSE"})
    workbook = load_workbook(io.BytesIO(content))
    assert workbook.sheetnames == ["Attendance", "Report info"]
    sheet = workbook["Attendance"]
    assert [c.value for c in sheet[1]] == COLUMNS
    assert sheet["B2"].value == "Rahul Sharma"
    assert sheet.freeze_panes == "A2"
    info = workbook["Report info"]
    assert info["A1"].value == "Field"


def test_pdf_writer_produces_a_pdf():
    content = to_pdf("Attendance", COLUMNS, ROWS, subtitle="Scoped", meta={"Rows": 2})
    assert content.startswith(b"%PDF")
    assert len(content) > 1000


def test_pdf_writer_handles_an_empty_result_set():
    content = to_pdf("Empty", COLUMNS, [], subtitle="none")
    assert content.startswith(b"%PDF")


def test_report_catalogue_is_role_filtered():
    hod = report_catalogue("HOD")
    admin = report_catalogue("ADMIN")
    trainer = report_catalogue("TRAINER")
    assert len(admin["families"]) == 14
    assert len(hod["families"]) < len(admin["families"])
    assert len(trainer["families"]) < len(hod["families"])
    assert admin["totalReports"] >= 300
    assert {f["code"] for f in trainer["families"]} == {
        "attendance", "assessment", "defaulters"
    }


def test_super_admin_sees_every_report_family():
    assert len(report_catalogue("SUPER_ADMIN")["families"]) == 14


# --------------------------------------------------------------------------- security helpers
def test_password_policy_messages_name_what_is_missing():
    problems = password_problems("abc")
    assert "at least 8 characters" in problems
    assert "one uppercase letter" in problems
    assert "one number" in problems
    assert "one special character" in problems
    assert password_problems("Str0ng!Pass") == []


def test_password_policy_raises_with_field_details():
    from app.core.errors import ValidationError

    with pytest.raises(ValidationError) as exc:
        assert_password_policy("weak")
    assert exc.value.details


def test_password_strength_is_monotonic():
    scores = [
        password_strength(""),
        password_strength("abcdefgh"),
        password_strength("Abcdefgh"),
        password_strength("Abcdefg1"),
        password_strength("Abcdefg1!"),
        password_strength("Abcdefghij1!"),
    ]
    assert scores == sorted(scores)
    assert scores[-1] == 4


def test_hashing_is_salted_and_verifiable():
    first = hash_password("Str0ng!Pass1")
    second = hash_password("Str0ng!Pass1")
    assert first != second, "each hash must use a fresh salt"
    assert first.startswith("$argon2")
    assert verify_password("Str0ng!Pass1", first)
    assert not verify_password("Str0ng!Pass2", first)


def test_bcrypt_hashes_remain_verifiable_for_imported_accounts():
    import bcrypt

    legacy = bcrypt.hashpw(b"Str0ng!Pass1", bcrypt.gensalt(rounds=4)).decode()
    assert verify_password("Str0ng!Pass1", legacy)
    assert not verify_password("wrong", legacy)


def test_signed_urls_expire_and_detect_tampering():
    from app.core.errors import Unauthenticated

    token = sign_payload("reports/abc.pdf", 60)
    assert verify_signed_payload(token) == "reports/abc.pdf"

    with pytest.raises(Unauthenticated):
        verify_signed_payload(token[:-3] + "000")

    expired = sign_payload("reports/abc.pdf", -10)
    with pytest.raises(Unauthenticated):
        verify_signed_payload(expired)


def test_storage_keys_outside_the_namespace_are_refused():
    from app.core.errors import ValidationError
    from app.services.storage import LocalStorageDriver

    driver = LocalStorageDriver("./.storage-unit")
    for bad in ("../../etc/passwd", "/etc/passwd", "random/file.txt"):
        with pytest.raises(ValidationError):
            driver._path(bad)
    # A legitimate key resolves inside the root.
    assert driver._path("reports/ok.pdf").as_posix().endswith("reports/ok.pdf")


def test_audit_writer_redacts_secrets():
    from app.authz.audit import _clean

    cleaned = _clean(
        {"email": "a@b.com", "password": "hunter2", "nested": {"passwordHash": "$argon2id$x"}}
    )
    assert cleaned["email"] == "a@b.com"
    assert cleaned["password"] == "[redacted]"
    assert cleaned["nested"]["passwordHash"] == "[redacted]"


def test_production_configuration_guard_rejects_development_shortcuts():
    from app.core.config import Settings

    unsafe = Settings(
        ENV="production",
        JWT_SECRET="a-real-secret-value-for-production-use-only",
        USE_INMEMORY_DB=True,
        USE_FAKE_REDIS=True,
        STORAGE_DRIVER="local",
        ALLOW_DEV_ENDPOINTS=True,
        COOKIE_SECURE=False,
    )
    with pytest.raises(RuntimeError) as exc:
        unsafe.assert_production_safe()
    message = str(exc.value)
    for expected in (
        "USE_INMEMORY_DB", "USE_FAKE_REDIS", "STORAGE_DRIVER",
        "ALLOW_DEV_ENDPOINTS", "COOKIE_SECURE",
    ):
        assert expected in message


def test_production_rejects_the_default_jwt_secret():
    from app.core.config import Settings

    with pytest.raises(Exception):
        Settings(ENV="production", JWT_SECRET="dev-only-insecure-secret-change-me")


def test_safe_production_configuration_passes():
    from app.core.config import Settings

    Settings(
        ENV="production",
        DATABASE_URL="postgresql://user:pass@localhost:5432/cnc",
        JWT_SECRET="a-real-secret-value-for-production-use-only",
        USE_INMEMORY_DB=False,
        USE_FAKE_REDIS=False,
        STORAGE_DRIVER="s3",
        ALLOW_DEV_ENDPOINTS=False,
        COOKIE_SECURE=True,
    ).assert_production_safe()


# --------------------------------------------------------------------------- queue
async def test_queue_retries_with_backoff_then_dead_letters(seeded_db, monkeypatch):
    from app.core.config import settings as live
    from app.workers import queue

    monkeypatch.setattr(live, "QUEUE_EAGER", False)
    monkeypatch.setattr(live, "JOB_MAX_ATTEMPTS", 2)

    attempts: list[int] = []
    dead: list[dict] = []

    @queue.job_handler("unit.flaky")
    async def flaky(payload):  # pragma: no cover - invoked through the worker
        attempts.append(1)
        raise RuntimeError("boom")

    @queue.job_handler("unit.flaky:on_dead")
    async def flaky_dead(payload):
        dead.append(payload)

    from app.workers.worker import run_once

    await queue.enqueue("unit.flaky", {"x": 1})
    assert await run_once(timeout=1) is True
    assert len(attempts) == 1

    # The retry is scheduled with backoff, so it is not immediately ready.
    stats = await queue.queue_stats()
    assert stats["delayed"] >= 1

    # Promote it by hand and let it fail its last attempt.
    from app.core.redis_client import get_redis

    raw = await get_redis().zrange(queue.DELAYED(), 0, -1)
    await get_redis().zrem(queue.DELAYED(), *raw)
    for item in raw:
        await get_redis().lpush(queue.READY(), item)

    assert await run_once(timeout=1) is True
    assert len(attempts) == 2
    assert dead, "the job must dead-letter rather than fail silently"
    assert "boom" in dead[0]["error"]


async def test_unknown_job_name_dead_letters_instead_of_hanging(seeded_db, monkeypatch):
    from app.core.config import settings as live
    from app.workers import queue
    from app.workers.worker import run_once

    monkeypatch.setattr(live, "QUEUE_EAGER", False)
    monkeypatch.setattr(live, "JOB_MAX_ATTEMPTS", 1)
    await queue.enqueue("unit.does-not-exist", {})
    assert await run_once(timeout=1) is True
    from app.core.redis_client import get_redis

    assert await get_redis().llen(queue.DEAD()) >= 1
