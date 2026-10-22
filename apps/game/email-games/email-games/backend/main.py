from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .scoring import eedi_payload, writing_score

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.getenv("DATABASE_PATH", ROOT / "eedi_games.db"))
app = FastAPI(title="EEDI Email Games API", version="1.0.0")
app.mount("/static", StaticFiles(directory=ROOT / "frontend"), name="static")


class SessionIn(BaseModel):
    session_id: str = Field(min_length=4, max_length=100)
    game_id: str


class WritingIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    keywords: list[str] = Field(max_length=20)
    min_words: int = Field(ge=1, le=500)


class ResultIn(BaseModel):
    session_id: str
    game_id: str
    learner_id: str | None = None
    score: int = Field(ge=0, le=1000)
    duration_seconds: int = Field(ge=0, le=7200)
    accuracy: int = Field(ge=0, le=100)
    satisfaction: int = Field(ge=0, le=100)
    hints_used: int = Field(ge=0, le=20)
    attempts_used: int = Field(ge=0, le=20)
    skills: dict[str, int] = {}


class ProgressIn(BaseModel):
    player_id: str = Field(min_length=4, max_length=100)
    game_id: str
    completed_level: int = Field(ge=1, le=15)
    score: int = Field(ge=0, le=100)


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def init_db() -> None:
    with db() as connection:
        connection.executescript((ROOT / "sql" / "schema.sql").read_text())


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(ROOT / "frontend" / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/scenarios")
def scenarios():
    return json.loads((ROOT / "data" / "scenarios.json").read_text())


@app.get("/api/progress/{player_id}/{game_id}")
def get_progress(player_id: str, game_id: str):
    if game_id not in {"rescue", "escape"}:
        raise HTTPException(400, "Unknown game_id")
    with db() as connection:
        connection.execute("INSERT OR IGNORE INTO player_progress(player_id, game_id) VALUES (?, ?)", (player_id, game_id))
        row = connection.execute("SELECT unlocked_level, completed_levels, best_scores FROM player_progress WHERE player_id=? AND game_id=?", (player_id, game_id)).fetchone()
    return {"player_id": player_id, "game_id": game_id, "unlocked_level": row[0], "completed_levels": json.loads(row[1]), "best_scores": json.loads(row[2])}


@app.post("/api/progress")
def save_progress(item: ProgressIn):
    if item.game_id not in {"rescue", "escape"}:
        raise HTTPException(400, "Unknown game_id")
    with db() as connection:
        connection.execute("INSERT OR IGNORE INTO player_progress(player_id, game_id) VALUES (?, ?)", (item.player_id, item.game_id))
        row = connection.execute("SELECT unlocked_level, completed_levels, best_scores FROM player_progress WHERE player_id=? AND game_id=?", (item.player_id, item.game_id)).fetchone()
        if item.completed_level > row[0]:
            raise HTTPException(409, "Complete the unlocked level first")
        completed, scores = json.loads(row[1]), json.loads(row[2])
        if item.completed_level not in completed:
            completed.append(item.completed_level)
        scores[str(item.completed_level)] = max(item.score, scores.get(str(item.completed_level), 0))
        unlocked = min(15, max(row[0], item.completed_level + 1))
        connection.execute("UPDATE player_progress SET unlocked_level=?, completed_levels=?, best_scores=?, updated_at=CURRENT_TIMESTAMP WHERE player_id=? AND game_id=?", (unlocked, json.dumps(sorted(completed)), json.dumps(scores), item.player_id, item.game_id))
    return {"unlocked_level": unlocked, "completed_levels": sorted(completed), "best_scores": scores}


@app.post("/api/sessions", status_code=201)
def create_session(item: SessionIn):
    if item.game_id not in {"rescue", "escape"}:
        raise HTTPException(400, "Unknown game_id")
    with db() as connection:
        connection.execute("INSERT OR IGNORE INTO sessions(id, game_id) VALUES (?, ?)", (item.session_id, item.game_id))
    return {"session_id": item.session_id, "status": "started"}


@app.post("/api/score-writing")
def score_writing(item: WritingIn):
    score = writing_score(item.text, item.keywords, item.min_words)
    return {"score": score, "passed": score >= 65}


@app.post("/api/results", status_code=201)
def save_result(item: ResultIn):
    result = item.model_dump()
    with db() as connection:
        connection.execute(
            "INSERT INTO results(session_id, payload) VALUES (?, ?)",
            (item.session_id, json.dumps(result)),
        )
    return {"saved": True, "eedi": eedi_payload(result)}


@app.get("/api/results/{session_id}")
def get_result(session_id: str):
    with db() as connection:
        row = connection.execute("SELECT payload FROM results WHERE session_id=? ORDER BY id DESC LIMIT 1", (session_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Result not found")
    return json.loads(row[0])
