# EEDI LMS

A college **soft-skills, personality-development and employability** platform that runs *alongside*
an academic LMS rather than replacing it. Marks, curriculum attendance and examinations stay in the
college's system of record; what lives here is practice, assessment and measured improvement.

> **Practise → Assess → Improve → Become Employable**
> *Learn, Practise and Build the Skills Required for Your Career.*

| | |
|---|---|
| **Backend** | FastAPI · Python 3.11+ · Pydantic v2 · Motor (async MongoDB) · Redis |
| **Frontend** | Next.js 15 (App Router) · React 19 · TypeScript · Redux Toolkit · Tailwind · Radix · Recharts |
| **Database** | **MongoDB** (primary) — 56 collections, 95 compound indexes |
| **Storage** | **Amazon S3** for private media and exports (local driver for development) |
| **Surface** | 165 API endpoints · 72 pages across 8 roles |

---

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Running the stack](#running-the-stack)
- [Demo accounts](#demo-accounts)
- [Tests, lint and build](#tests-lint-and-build)
- [Architecture](#architecture)
- [Security model](#security-model)
- [What needs external credentials](#what-needs-external-credentials)
- [Repository layout](#repository-layout)

---

## Quick start

Two services and two datastores. From a clean checkout:

```bash
# ---------------------------------------------------------------- 1. datastores
# MongoDB 6+ and Redis 7+ on their default ports, however you prefer to run them:
docker run -d --name eedi-mongo -p 27017:27017 mongo:7
docker run -d --name eedi-redis -p 6379:6379 redis:7

# ---------------------------------------------------------------- 2. backend
cd apps/api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                       # then set JWT_SECRET (see Configuration)
python -m app.seed.run --reset             # demo institution, 884 learners, catalogues
uvicorn app.main:app --reload --port 8000

# ---------------------------------------------------------------- 3. background worker
cd apps/api && . .venv/bin/activate
python -m app.workers.worker               # scoring, reports, alerts, notifications

# ---------------------------------------------------------------- 4. frontend
cd apps/web
npm install
npm run dev                                # http://localhost:3000
```

Open <http://localhost:3000> and sign in with any of the [demo accounts](#demo-accounts).

The API serves interactive docs at <http://localhost:8000/docs> outside production.

---

## Configuration

Every setting comes from the environment — **no secret is committed to this repository**.
`apps/api/.env.example` is the complete, commented list; copy it to `.env` and fill in what you need.

The only value you must change to run locally:

```bash
# apps/api/.env
JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
```

### The settings that matter most

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URL` / `MONGODB_DB` | `mongodb://localhost:27017` / `eedi_lms` | Primary database. |
| `REDIS_URL` | `redis://localhost:6379/0` | Sessions, token revocation, OTP, rate limits, lockout, job queue. |
| `JWT_SECRET` | *(insecure placeholder)* | **Production refuses to start on the default.** |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | Access token lifetime. |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh token lifetime (HttpOnly cookie). |
| `COOKIE_SECURE` | `false` | **Must be `true` in production.** |
| `STORAGE_DRIVER` | `local` | `s3` for production; see [external credentials](#what-needs-external-credentials). |
| `AI_PROVIDER` / `STT_PROVIDER` | `mock` | Deterministic evidence-grounded fallback; `anthropic`/`openai` need `AI_API_KEY`. |
| `EMAIL_PROVIDER` | `console` | Prints OTPs and reset links to the log; `smtp` for real delivery. |
| `ATTENDANCE_DEFAULTER_THRESHOLD` | `75` | Business rule, not a constant in code. |
| `CERTIFICATE_MIN_ATTENDANCE` / `CERTIFICATE_MIN_AVG_SCORE` | `75` / `60` | Certificate eligibility. |
| `EVALUATION_EDIT_WINDOW_HOURS` | `72` | How long a trainer may correct a submitted evaluation. |
| `EEDI_TRAINER_WEIGHT` / `EEDI_AI_WEIGHT` | `0.6` / `0.4` | Readiness-score blend, versioned by `SCORING_VERSION`. |

### Production refuses unsafe configuration

`Settings.assert_production_safe()` runs at startup and **aborts** when `ENV=production` and any of
these is true: `USE_INMEMORY_DB`, `USE_FAKE_REDIS`, `STORAGE_DRIVER != s3`, `ALLOW_DEV_ENDPOINTS`,
`COOKIE_SECURE=false`, or `JWT_SECRET` still at its placeholder. A misconfigured deploy fails loudly
instead of quietly running on a development fallback.

### Frontend configuration

The browser calls `/api/v1/*` on its own origin and Next proxies it to the API, so the refresh cookie
is first-party and no CORS pre-flight is involved:

```bash
# apps/web/.env.local
API_PROXY_TARGET=http://127.0.0.1:8000
```

---

## Running the stack

| Service | Command (from the app directory) | Port |
|---|---|---|
| API | `uvicorn app.main:app --reload --port 8000` | 8000 |
| Background worker | `python -m app.workers.worker` | — |
| Web | `npm run dev` | 3000 |

**The worker is not optional.** Score recalculation, practice-session transcription and scoring,
report generation, certificate re-evaluation, weak-student alerts and class reminders all run there.
Without it those jobs queue up and never complete — the app stays responsive, but feedback never
arrives. For a single-process development run you can set `QUEUE_EAGER=true` to execute jobs inline
instead (this is what the test suite does).

### Seeding

```bash
python -m app.seed.run --reset      # full demo institution
python -m app.seed.run --minimal    # catalogues and accounts only, no cohort
```

The seed builds one college (ABC Engineering College) with 7 departments, 15 batches, 884 learners,
24 trainers, 98 evaluation parameters across the 7 pillars, 10 courses, 6 practice modes, 6 skill
games, attendance and evaluation history, certificates and audit entries. The figures match the
supplied screenshots (for example, 428 CSE participants and Rahul Sharma at 94% attendance) so the
UI can be compared against them directly.

### No MongoDB available?

Set `USE_INMEMORY_DB=true` to run against an in-process MongoDB-compatible store. It is useful for
tests and a quick look around, but be aware:

- it has **no indexes**, so the analytics endpoints take seconds rather than milliseconds;
- it does not persist, and it is bound to the process that created it;
- production refuses to start with it enabled.

---

## Demo accounts

All demo accounts use the password **`Eedi@2026`**.

| Role | Sign in with | Lands on |
|---|---|---|
| Student | `alex.johnson@eedi.com` | `/student/dashboard` |
| Trainer | `r.bose@abcengg.edu` | `/trainer/dashboard` |
| HOD | `priya.kulkarni@abcengg.edu` | `/hod/dashboard` |
| Institution admin | `rishabh.kumawat@abcengg.edu` | `/admin/dashboard` |
| Super admin | `superadmin@eedilms.app` | `/super-admin` |

A second HOD (`priya.kumawat@abcengg.edu`, AI/Data Science) and a second trainer
(`aids.trainer1@abcengg.edu`) exist specifically so cross-department isolation can be tried by hand.

Login accepts an email address **or** an institution ID, so `CSE21B101` works for Alex Johnson too.

With `EMAIL_PROVIDER=console`, verification codes and reset links are printed to the API log. In
development (`ALLOW_DEV_ENDPOINTS=true`) `GET /api/v1/auth/dev/otp/{email}` returns the latest code;
that endpoint is refused whenever dev endpoints are disabled, and always in production.

---

## Tests, lint and build

### Backend — 272 tests

```bash
cd apps/api && . .venv/bin/activate
python -m pytest tests/ -q                       # whole suite
python -m pytest tests/test_tenant_isolation.py -q   # cross-tenant isolation only
ruff check .                                     # lint
```

The suite runs the real API in-process over `httpx.ASGITransport` against a seeded database, with the
job queue in eager mode so background behaviour is asserted without a worker. It is grouped as:

| Suite | Covers |
|---|---|
| `test_smoke.py` | health, readiness, seed integrity, public home endpoints |
| `test_auth.py` | signup, verification, login, rotation, lockout, reset, logout-all |
| `test_tenant_isolation.py` | cross-college and cross-department refusal, client-supplied scope IDs, tenant scoping of the security and operational trails |
| `test_student_journey.py` | learning, games, practice, scoring, assessments, profile |
| `test_trainer_workflows.py` | attendance rules, the 95+ parameter evaluation lifecycle, alerts |
| `test_hod_portal.py` | FR-01…FR-14 of the HOD SRS |
| `test_admin_portal.py` | institution setup, users and roles, imports, reports, certificates |
| `test_units.py` | scoring maths, queue retry/dead-letter, report engine, AI grounding |

### Frontend — 28 unit/component tests, 17 end-to-end

```bash
cd apps/web
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
npm test              # vitest
npm run build         # production build
npm run e2e           # Playwright — needs the API and web server running
```

`npm run e2e` expects a seeded API on `:8000` and the web app on `:3000`. Point it at an already
running stack with `E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e`. The specs cover every role's
critical path: sign-in and redirect per role, signed-out and wrong-role refusal, session survival
across a reload, the student practice brief, the trainer's assigned-batch scoping and the full
parameter form, the HOD's scope banner and 360° participant profile with all six tabs, the locked
scope items, and admin user provisioning with its one-time password.

---

## Architecture

```
apps/
  api/                      FastAPI service
    app/
      authz/                ScopeContext, guards, audit — the security core
      core/                 config, security, errors, logging, Redis client
      db/                   Motor client, 56-collection index definitions
      repositories/         ScopedRepository — every query carries tenant scope
      routers/              home, auth, student, trainer, hod, admin, reports, files…
      schemas/              Pydantic request models
      seed/                 demo institution + catalogues
      services/             scoring, AI provider, storage, reports, imports, email, notifications
      workers/              Redis-list job queue + handlers
  web/                      Next.js app
    src/
      app/(public)/         marketing site, programs, trainers, announcements
      app/(auth)/           login, signup, verify, forgot/reset
      app/student|trainer|hod|admin/   the four live portals
      app/super-admin|placement|recruiter|parent/   reserved-role portals
      components/           ui primitives, shared blocks, charts, layout, auth
      hooks/ lib/ store/    data fetching, API client, Redux
docs/                       requirements traceability, route/collection/API maps, acceptance evidence
```

### How a score is produced

1. A trainer rates a participant on the **95+ parameters** grouped into **7 pillars**. Each parameter
   is normalised against its own maximum, then weighted within its pillar.
2. Practice attempts are scored by the AI provider on **6 dimensions** (relevance, clarity,
   confidence, structure, fluency, professionalism), each carrying evidence quoted from the
   transcript. Ungrounded vendor output is rejected and replaced by the deterministic evaluator.
3. Communication Readiness weights those dimensions 25/20/15/15/15/10 and decays older attempts.
4. The EEDI readiness score blends the trainer and AI components (`EEDI_TRAINER_WEIGHT` /
   `EEDI_AI_WEIGHT`), records its inputs and `scoringVersion`, and **appends** to a history array —
   an earlier score is never overwritten.
5. Recalculation is always a background job. Saving an evaluation never waits on an AI call.

### Records that are never overwritten

Enrollment history, evaluation versions, AI-score overrides and the audit trail are all append-only.
A batch transfer closes the current enrollment as `transferred` and opens a new row. An evaluation
edit inside the window writes a new version with the editor and reason attached. A trainer overriding
an AI score keeps the original values, the new ones and the reason — which is exactly the dataset
needed to improve the model later. Deletes are soft (`deletedAt`), and archiving a department leaves
every dependent record readable.

---

## Security model

MongoDB has no row-level security, so its equivalent is enforced in the application — deliberately,
in several independent layers.

**Every endpoint verifies four things separately:** authenticated · role allowed · tenant scope ·
resource scope. Frontend route guards are a convenience for the user, never a security control.

- **Scope is server-derived.** `ScopeContext` is rebuilt from the user's database record on every
  request, so a role change, department move or deactivation takes effect immediately rather than
  when a token expires.
- **Client-supplied scope IDs are never trusted.** A `collegeId`, `departmentId`, `batchId`,
  `studentId` or `trainerId` in a query string or body may only *narrow* what the caller can already
  see. Anything outside it is refused with a generic authorization response and written to
  `security_events`; five denials in fifteen minutes raise an anomaly event.
- **Scoped repositories.** Data access goes through `ScopedRepository`, which injects the tenant
  filter into finds *and* aggregation pipelines. Compound indexes lead with the tenant key, so an
  unscoped query cannot even use them.
- **The trails are tenanted too.** Audit records, security events, operational `system_events` and
  live refresh sessions each carry the institution they belong to, so the admin and HOD screens that
  read them back go through the scoped repository like everything else. A security event that belongs
  to no institution — a failed sign-in for an unknown identifier — keeps a null scope on purpose and
  is visible only to `SUPER_ADMIN`, whose scope *is* the platform.
- **Errors reveal nothing.** No stack traces, database details, secrets, or whether another tenant's
  resource exists.
- **Sessions.** Access tokens ~15 minutes; refresh tokens ~7 days in an HttpOnly, `Secure`,
  `SameSite` cookie that JavaScript cannot read. Refresh rotates on every use and is tracked in Redis
  as a family — replaying a retired token is treated as theft and revokes the whole family. Logout,
  logout-all, password reset and deactivation all invalidate immediately.
- **Passwords.** argon2id, with bcrypt verification retained for imported hashes. Never stored or
  logged in plaintext. Five consecutive failures lock the account; login is rate limited per
  identifier and per IP.
- **Private media.** Recordings, resumes and exports are stored privately and only ever reachable
  through a short-lived signed URL. No public object URL is issued for any of them.
- **Consent.** Practice recording requires explicit consent, withdrawable in Settings; without it a
  student can still practise by typing.

Cross-tenant isolation is not just asserted in prose — `tests/test_tenant_isolation.py` proves an
HOD, trainer and admin cannot reach another department's or college's data through a URL, a query
parameter or a request body.

### Self-hosted typography

`next/font/google` is deliberately not used: it fetches at build time (breaking any air-gapped or
network-restricted CI) and, at runtime, would disclose every visitor's IP to a third party. The font
variables resolve to a system stack instead. To use the designed faces, drop the woff2 files into
`apps/web/public/fonts/` and add:

```css
/* apps/web/src/styles/globals.css */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: 'Source Serif 4';
  src: url('/fonts/source-serif-4-variable.woff2') format('woff2-variations');
  font-weight: 200 900;
  font-display: swap;
}
```

Nothing else changes — `--font-inter` and `--font-serif` already name those families first.

---

## What needs external credentials

Everything below ships with a working development fallback, so the whole application runs end to end
with no third-party account. Each becomes production-grade by setting its credentials.

| Capability | Development fallback | To go live |
|---|---|---|
| **Object storage** | `STORAGE_DRIVER=local` — files on disk behind HMAC-signed expiring URLs | `STORAGE_DRIVER=s3` + `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Keep the bucket private; the app only ever issues signed URLs. |
| **AI evaluation** | `AI_PROVIDER=mock` — deterministic evaluator that scores real transcript features and quotes its evidence | `AI_PROVIDER=anthropic\|openai` + `AI_API_KEY`, `AI_MODEL`. Vendor responses whose quotes are not present in the transcript are rejected and fall back to the mock. |
| **Speech-to-text** | `STT_PROVIDER=mock` | `STT_PROVIDER=…` + `STT_API_KEY`. Typed practice submissions bypass STT entirely. |
| **Email** | `EMAIL_PROVIDER=console` — OTPs and reset links printed to the log | `EMAIL_PROVIDER=smtp` + `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`. |
| **Push notifications** | `FCM_ENABLED=false` — in-app notifications still work | `FCM_ENABLED=true` + `FCM_SERVER_KEY`. |

Browser media capture (microphone) is a real browser API and needs no credentials, but does need a
secure context — `localhost` or HTTPS.

---

## Repository layout

| Path | What it is |
|---|---|
| `apps/api` | FastAPI service, worker, seed, tests |
| `apps/web` | Next.js application, component tests, Playwright specs |
| `docs/00-requirements-checklist.md` | every requirement → where it lands in code → status |
| `docs/01-route-map.md` | every page, its guard and its role |
| `docs/02-collection-map.md` | 56 collections, their scope keys and indexes |
| `docs/03-role-permission-matrix.md` | what each of the 8 roles may do |
| `docs/04-api-map.md` | every endpoint, its role and its scope |
| `docs/05-design-system-map.md` | tokens, primitives and the shared component inventory |
| `docs/06-acceptance-verification.md` | acceptance criteria → the evidence for each |

### Phase 1 scope

Student, Trainer, HOD and Admin are fully implemented. Super Admin, Placement Cell, Recruiter and
Parent exist in the authentication and authorization model now — their routes are protected, their
role is enforced server-side, their scope rules are written — and each has a portal page that states
plainly what it will do and what data that role will be able to see, rather than showing a mock
dashboard. Building those screens is Phase 2.
#   C n C _ w e b _ a n d _ a p p _ L M S  
 