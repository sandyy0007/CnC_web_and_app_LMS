# EEDI LMS — Requirements → Implementation Checklist

Traceability map. Every row names the requirement, the owning module, and where it lands in code.
Status legend: `DONE` implemented + verified · `PARTIAL` implemented with a documented gap · `EXT` blocked on an external credential (dev fallback shipped).

## 0. Source material actually supplied

| Ref | Material | Availability | Used as |
|---|---|---|---|
| A | Home Page requirements | Master prompt §6 only (PDF supplied empty, 0 bytes) | functional source of truth |
| B | SignUp/Login requirements | Master prompt §7 only (PDF empty) | functional source of truth |
| C | Student Module requirements | Master prompt §9–10 only (PDF empty) | functional source of truth |
| D | Student Portal UI | `Student_Module.pdf` — 9 full screens | **visual source of truth** |
| E | Trainer Portal requirements | Master prompt §11–12 only (PDF empty) | functional source of truth |
| F | Admin Portal requirements | Master prompt §15 only (PDF empty) | functional source of truth |
| G | Admin Portal UI Showcase | `EEDI_LMS_Admin_Panel_UI_Showcase.html` | **design system + visual source of truth** |
| H | HOD Portal SRS | `HOD_Portal_Requirements_Analysis_Report.pdf` — 17 pp, complete | functional source of truth (FR-01…FR-14) |
| I | HOD Portal UI | 10 screenshots | **visual source of truth** |
| J | Stitch/Eraser links | external preview URLs | not fetchable; superseded by D/G/I |

> The five empty PDFs (Trainer, Student, SignUp/Login, admin, Untitled) carried no bytes. Master-prompt
> sections §6–§15 are therefore the functional source of truth for those modules, exactly as instructed.

## 1. Platform-wide

| # | Requirement | Where | Status |
|---|---|---|---|
| 1.1 | MongoDB primary DB (not PostgreSQL) | `api/app/db/mongo.py`, `api/app/db/indexes.py` | DONE |
| 1.2 | Redis: sessions, revocation, OTP, rate limit, lockout, cache, queues | `api/app/core/redis_client.py`, `api/app/services/*` | DONE |
| 1.3 | Amazon S3 object storage behind a service | `api/app/services/storage.py` (S3 + local dev driver) | EXT (dev driver ships) |
| 1.4 | RLS-equivalent defence in depth | `api/app/authz/*`, `api/app/repositories/base.py` | DONE |
| 1.5 | Compound indexes carrying tenant scope | `api/app/db/indexes.py` | DONE |
| 1.6 | Audit every rejected scope attempt | `api/app/authz/guards.py` → `security_events` + `audit_logs` | DONE |
| 1.7 | Cross-tenant integration tests | `api/tests/test_tenant_isolation.py` | DONE |
| 1.8 | Background jobs, non-blocking AI | `api/app/workers/*` | DONE |
| 1.9 | Consistent JSON error envelope + codes | `api/app/core/errors.py` | DONE |
| 1.10 | One shared design system across portals | `web/src/styles/globals.css`, `web/src/components/ui/*`, `web/src/components/shared/*` | DONE |
| 1.11 | No hard-coded dashboard metrics | every dashboard reads its API | DONE |
| 1.12 | Loading / empty / error states everywhere | `web/src/components/shared/state.tsx` | DONE |
| 1.13 | Responsive desktop → tablet → mobile | shared shell + table strategies | DONE |
| 1.14 | Accessibility (semantics, focus, aria, keyboard games) | `web/src/components/**`, game keyboard 1–4/Enter | DONE |
| 1.15 | Seed data matching the screenshots | `api/app/seed/*` | DONE |
| 1.16 | README: setup, env, seed, run, tests | `README.md` | DONE |

## 2. Authentication (master prompt §7)

| # | Requirement | Where | Status |
|---|---|---|---|
| 2.1 | 8-role architecture | `api/app/authz/roles.py` | DONE |
| 2.2 | Signup: name, institutional email/ID, password+confirm, role, college, phone | `POST /auth/signup` | DONE |
| 2.3 | Password ≥8 + upper + number + special, live strength meter | `api/app/core/security.py`, `web/src/components/auth/password-strength.tsx` | DONE |
| 2.4 | Email/institution-ID uniqueness enforced in DB | unique indexes on `users.email`, `users.institutionId` | DONE |
| 2.5 | Email verification (OTP + link), unverified until verified | `POST /auth/verify-email`, `POST /auth/resend-otp` | DONE |
| 2.6 | Login by email or institution ID, remember-me, clear errors | `POST /auth/login` | DONE |
| 2.7 | Argon2/bcrypt hashing, never plaintext | `core/security.py` (argon2id, bcrypt verify fallback) | DONE |
| 2.8 | Access ~15 min, refresh ~7 d, HttpOnly cookie, rotation, Redis tracking | `core/security.py`, `routers/auth.py` | DONE |
| 2.9 | Logout, logout-all, revoke on password reset / deactivation | `POST /auth/logout`, `/auth/logout-all` | DONE |
| 2.10 | Lockout after 5 failures + rate limiting | `services/rate_limit.py` | DONE |
| 2.11 | Password reset via OTP/link, invalidates sessions | `/auth/forgot-password`, `/auth/reset-password` | DONE |
| 2.12 | Role middleware backend + route guards frontend | `authz/guards.py`, `web/src/components/auth/route-guard.tsx` | DONE |
| 2.13 | Role-based redirects | `web/src/lib/roleRoutes.ts` | DONE |
| 2.14 | Refresh-token reuse detection | rotation family in Redis | DONE |

## 3. Home page (§6)
Header, hero + exact tagline, platform overview, 7 featured courses, course cards, role quick access,
announcements, Continue Learning (students only), AI assistant, backend-driven statistics, seeded
testimonials, FAQ, footer → `web/src/app/(public)/page.tsx` + `GET /api/v1/home/*`. **DONE**

## 4. Student portal (§9, §10)
Dashboard (streak, EEDI readiness, learning hours, pending tasks, Continue Learning, Daily Skill Quest,
upcoming live session, 7-pillar breakdown, recommended activity, week at a glance, leaderboard, AI coach),
My Learning, Games (+ playable scenario engine with persisted attempts/XP/skill mapping), Practice Studio,
AI Mock Interview (recording, live coaching, checklist), AI Feedback (6 dimensions, evidence-backed
transcript), Progress & Insights, Profile & Placement Plan, Achievements, Assessments, Live Classes,
Resume Analyzer, Settings. **DONE** (browser capture + STT are `EXT`; deterministic mock provider ships)

## 5. Trainer portal (§11, §12)
Dashboard, My Batches, Today's Classes, Attendance (P/A/L/Leave, no out-of-scope marking), Students,
Evaluations (95+ parameters over 7 pillars, draft/submit/edit window/version history), Assignments,
Course Progress, Weak-student alerts, Trend analytics, Reports (PDF → S3 → signed URL), Alerts, Profile.
Score engine: trainer + AI signals, configurable weights, versioned, override history, async recompute. **DONE**

## 6. HOD portal (§13, §14 + SRS FR-01…FR-14)

| FR | Requirement | Where | Status |
|---|---|---|---|
| FR-01 | Department-scoped login, scope from server-side record | `authz/context.py` | DONE |
| FR-02 | Dashboard summary computed from own department only | `GET /hod/dashboard` | DONE |
| FR-03 | Participant listing: search, filter, sort | `GET /hod/participants` | DONE |
| FR-04 | Participant 360 profile | `GET /hod/participants/{id}` | DONE |
| FR-05 | Attendance analytics overall/module/batch + trends | `GET /hod/attendance` | DONE |
| FR-06 | Defaulter detection on configurable threshold | `GET /hod/attendance/defaulters` | DONE |
| FR-07 | Skill assessment view + batch avg + proficiency distribution | `GET /hod/assessments` | DONE |
| FR-07a | Feedback & certification view w/ ineligibility reason | `GET /hod/certificates` | DONE |
| FR-08 | Trainer roster + workload (read-focused, reassignment request) | `GET /hod/trainers` | DONE |
| FR-09 | Enrollment history, never overwritten | `GET /hod/enrollments` | DONE |
| FR-10 | Report export XLSX/PDF/CSV, async for large | `POST /hod/reports` | DONE |
| FR-11 | Audit trail view (actor/action/entity/time/before-after) | `GET /hod/audit-logs` | DONE |
| FR-12 | Cross-scope rejection → 403 + logged | `authz/guards.py` | DONE |
| FR-13 | Filter/sort persistence that cannot widen scope | `web/src/hooks/useTableState.ts` | DONE |
| FR-14 | Notifications for defaulters/low scores/pending items | `services/notifications.py` | DONE |

## 7. Admin portal (§15)
Dashboard (5 KPIs, institution overview chart, class monitoring, students per department, system & AI
usage, quick actions), Departments & Batches, Trainers & Access, Users & Roles (+ deactivation revoking
Redis sessions), Placements & Certificates, Reports & Analytics (14 families / 300+ catalogue, async),
AI & Server Usage, Bulk Import (row-level failures, template download), Audit Log. **DONE**

## 8. Acceptance criteria (§35) → verification

`docs/06-acceptance-verification.md` carries the evidence for each criterion, the results of the
closing checks in §38, the nineteen defects the verification run found and fixed, and the known
limitations. Summary of that run:

| Check | Result |
|---|---|
| Backend suite (`pytest tests/ -q`) | 272 passed, 1 skipped |
| Frontend unit/component (`npm test`) | 28 passed |
| End-to-end (`npm run e2e`, live stack) | 17 passed |
| `npm run typecheck` · `npm run lint` · `npm run build` | clean · clean · 75 routes |
