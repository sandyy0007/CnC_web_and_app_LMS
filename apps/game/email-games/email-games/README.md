# EEDI Email Arcade

Two switchable, responsive email-writing games for school and college learners:

- **Inbox Rescue – Fix the Email**
- **Email Escape Room – Save the Deal**

The app includes rotating mission topics, procedural game sounds, hands-on mechanics, a simple 0–100 mission score, momentum, timer, energy, hints, client satisfaction, live writing radar, results, skill signals, an EEDI-ready event payload, and a small SQLite database. It contains no multiple-choice questions.

Both games expose a 15-level chapter map. Every level is a short chapter containing **four different interactive email events**; all four must be cleared before the next level unlocks. Completed levels can be replayed, and each anonymous browser player keeps separate progress and best scores after refresh through the progress API.

Each chapter card shows its estimated completion time and maximum score. At the end of a level, learners see their actual time beside the estimate, final score, accuracy, satisfaction, and a simple pace signal. Estimates increase gradually from 3 to 6 minutes as chapters become harder.

## Game mechanics

- **Inbox Odyssey** is a bright 15-level campaign spanning group projects, professors, meetings, recruiter follow-ups, client corrections, and an executive final boss. The old tone-slider task has been removed.
- **Email Escape Room** is a larger, dark case-file experience: every chapter deliberately rotates through four different game types—pin evidence, rebuild a trust circuit, schedule commitments on a deadline grid, and write the final transmission. Case details alternate between launch and campus emergencies so a chapter never repeats the same mini-game four times.
- Both games finish with real writing while a live radar tracks required communication signals.

Each game alternates between two different cases on every replay. Add more objects to the `missions` arrays in `data/scenarios.json` to expand the rotation.

## Quick start

Requires Python 3.10+.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open http://127.0.0.1:8000. API documentation is at http://127.0.0.1:8000/docs.

## Docker

```bash
docker compose up --build
```

Then open http://127.0.0.1:8000.

## Deployment checklist

1. Run `docker compose up --build -d`.
2. Confirm `http://YOUR-HOST/api/health` returns a status of `ok`.
3. Keep the Docker volume enabled so SQLite learner progress survives restarts.
4. Put the app behind your host's HTTPS proxy, then link to it from the main website.

The Docker image has a health check and excludes local databases, virtual environments, tests, and Python cache files.

## Tests

```bash
python -m unittest discover -s tests -v
```

## Project map

```text
frontend/       HTML, CSS, and browser game logic
backend/        FastAPI routes and reusable scoring helpers
data/           Editable challenge/scenario content
sql/            Portable SQLite schema
tests/          Small scoring and payload regression suite
Dockerfile      Container build
docker-compose.yml
INTEGRATION.md  Handoff guide for the main website team
```

`/api/scenarios` is the authoritative game-content source. Browser audio uses the Web Audio API, so there are no sound files, licenses, or download dependencies to manage.

## API endpoints

- `GET /api/health`
- `GET /api/scenarios`
- `GET /api/progress/{player_id}/{game_id}`
- `POST /api/progress`
- `POST /api/sessions`
- `POST /api/score-writing`
- `POST /api/results`
- `GET /api/results/{session_id}`

No personal learner data is required or stored by default.
