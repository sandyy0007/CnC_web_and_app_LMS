"""Small, framework-free helpers shared by the API and tests."""
from __future__ import annotations

from typing import Iterable


def writing_score(text: str, keywords: Iterable[str], min_words: int) -> int:
    normalized = text.lower().strip()
    words = normalized.split()
    keys = list(keywords)
    keyword_ratio = sum(key in normalized for key in keys) / max(len(keys), 1)
    length_ratio = min(len(words) / max(min_words, 1), 1)
    return round((keyword_ratio * 0.65 + length_ratio * 0.35) * 100)


def eedi_payload(result: dict) -> dict:
    """Return an integration-safe metrics envelope; no learner PII is stored."""
    return {
        "event": "email_game.completed",
        "version": "1.0",
        "learner_id": result.get("learner_id"),
        "activity": result["game_id"],
        "metrics": {
            key: result[key]
            for key in ("score", "duration_seconds", "accuracy", "satisfaction", "hints_used", "attempts_used")
        },
        "skills": result.get("skills", {}),
    }
