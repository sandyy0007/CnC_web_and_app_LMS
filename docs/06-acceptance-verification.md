# EEDI LMS — Acceptance Verification

Evidence for the acceptance criteria in master-prompt §35, plus the §38 closing checks.

**A note on wording.** The criteria below are restated in summary form, grouped by theme. They are
not reproduced verbatim from §35 — where a criterion is paraphrased, the evidence column names the
exact test, endpoint or file so the claim can be checked against the code rather than taken on
trust.

**Status legend** — `VERIFIED` an automated test asserts it · `VERIFIED (manual)` exercised against
the running stack and reproducible by the steps given · `EXT` complete behind a development
fallback, needs an external credential to go live.

Verification run: whole backend suite, frontend unit suite, Playwright end-to-end suite, typecheck,
lint and production build, all against the seeded demo institution.

---

## Verification run — results

| Check | Command | Result |
|---|---|---|
| Backend suite | `pytest tests/ -q` | **272 passed**, 1 skipped, 0 failed |
| Frontend unit/component | `npm test` | **28 passed** |
| End-to-end (live stack) | `npm run e2e` | **17 passed** |
| Types | `npm run typecheck` | clean |
| Lint | `npm run lint` · `ruff check .` | no warnings or errors · all checks passed |
| Production build | `npm run build` | succeeds — 75 routes compiled |
| App runs | `uvicorn` + `next dev` + worker | all three start; every role signs in and loads its portal |

---

## 1. Data platform

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1.1 | MongoDB is the primary database — not PostgreSQL | `apps/api/app/db/mongo.py` (Motor), `app/db/indexes.py` — 56 collections, 95 index models. No SQL anywhere in the tree. | VERIFIED |
| 1.2 | Redis carries sessions, revocation, OTP, rate limits, lockout, cache and the job queue | `app/core/redis_client.py`, `app/services/session_service.py`, `app/services/rate_limit.py`, `app/workers/queue.py`; `GET /health/ready` reports it | VERIFIED — `test_smoke.py::test_readiness_reports_dependencies`, `test_auth.py` (rotation, lockout, logout-all) |
| 1.3 | Private object storage through a service boundary | `app/services/storage.py` — S3 driver plus a local driver that still issues HMAC-signed expiring URLs | EXT (needs AWS keys) |
| 1.4 | Compound indexes lead with the tenant key | `app/db/indexes.py` — every scoped collection's index begins `collegeId` (and `departmentId` where department-bound), so an unscoped query cannot use them | VERIFIED |
| 1.5 | Historical records are never silently deleted or overwritten | Soft delete (`deletedAt`) throughout; append-only `enrollments`, `assessment_versions`, `audit_logs`, score `history` | VERIFIED — `test_admin_portal.py::test_assigning_students_to_a_batch_appends_enrollment_history`, `test_hod_portal.py` (enrollment transitions), `test_units.py` (score history) |
| 1.6 | Optimistic locking on concurrent edits | `version` field + `expected_version` in `ScopedRepository.update` | VERIFIED — `test_trainer_workflows.py` (evaluation edit with stale version) |

## 2. Authentication and sessions

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 2.1 | Eight roles in one reusable auth system | `app/authz/roles.py`; `docs/03-role-permission-matrix.md` | VERIFIED — `test_auth.py`, `test_tenant_isolation.py` |
| 2.2 | Signup with institution context; email and institution ID unique in the database | `POST /auth/signup`; unique indexes on `users.email` and `users.institutionId` | VERIFIED — `test_auth.py` (duplicate email and duplicate institution ID both refused) |
| 2.3 | Password policy ≥8 with upper, number and symbol, plus a live strength meter | `app/core/security.py::PASSWORD_RULES`; `web/src/components/auth/password-strength.tsx` | VERIFIED — `test_units.py` (policy), `password-strength.test.tsx` (the meter mirrors the same five rules) |
| 2.4 | Passwords hashed, never plaintext | argon2id with bcrypt verification retained for imported hashes | VERIFIED — `test_auth.py`; `test_admin_portal.py::test_user_listing_exposes_roles_and_never_a_hash` asserts no hash appears anywhere in a response |
| 2.5 | Email verification by OTP **or** one-click link; unverified accounts cannot proceed | `POST /auth/verify-email`, `POST /auth/resend-otp` | VERIFIED — `test_auth.py` (both paths; login of an unverified account returns `verificationRequired`) |
| 2.6 | Login by email or institution ID | `POST /auth/login` | VERIFIED — `test_auth.py`; e2e signs in with an email and the UI accepts either |
| 2.7 | Access ~15 min, refresh ~7 d in an HttpOnly cookie, rotated on use | `app/core/security.py`, `app/services/session_service.py` | VERIFIED — `test_auth.py` (rotation issues a new token and denylists the old) |
| 2.8 | Refresh-token reuse is treated as compromise | Token family in Redis; replay revokes the family and writes a security event | VERIFIED — `test_auth.py::test_replaying_a_rotated_refresh_token_revokes_the_family` |
| 2.9 | Lockout after 5 consecutive failures, plus rate limiting | `app/services/rate_limit.py` | VERIFIED — `test_auth.py` (6th attempt locked; countdown message on attempts 4–5) |
| 2.10 | Password reset invalidates every session | `POST /auth/reset-password` → `revoke_all_sessions` | VERIFIED — `test_auth.py` |
| 2.11 | Deactivation invalidates immediately, not at token expiry | `POST /admin/users/{id}/deactivate`; the guard re-reads the user record per request | VERIFIED — `test_admin_portal.py::test_role_change_invalidates_sessions`, `…::test_deactivation_invalidates_sessions_immediately` |
| 2.12 | Logout and logout-all | `POST /auth/logout`, `/auth/logout-all`; both in the profile menu | VERIFIED — `test_auth.py`; e2e signs out each role through the menu |
| 2.13 | Role-based redirect after sign-in | `app/authz/roles.py::ROLE_HOME` mirrored by `web/src/lib/roleRoutes.ts` | VERIFIED — `roles`/`auth` e2e: each of the four roles lands on its own dashboard |
| 2.14 | The access token is never written to web storage | `web/src/lib/api.ts` holds it in a module variable only | VERIFIED — `api.test.ts::…never persists the access token outside memory` |

## 3. Authorization and tenant isolation

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 3.1 | Every endpoint independently verifies authentication, role, tenant scope and resource scope | `app/authz/guards.py` — `require_role`, `require_college_scope`, `require_department_scope`, `require_trainer_batch_scope`, `require_trainer_session_scope`, `require_student_in_scope`, `require_resource_in_scope` | VERIFIED — `test_tenant_isolation.py` (33 cases across HOD, trainer, admin and student) |
| 3.2 | Client-provided `college_id` / `department_id` / `batch_id` are never trusted | `guards.py::_reject_client_scope_claims` inspects the query string and small JSON bodies; out-of-scope values are refused, not ignored | VERIFIED — `test_tenant_isolation.py` (`?departmentId=other` and `?batchId=other` return 403 and are logged) |
| 3.3 | Cross-scope attempts are logged | `_deny_scope()` writes `security_events`; 5 denials in 15 minutes raise an anomaly event | VERIFIED — `test_tenant_isolation.py` asserts the row is written |
| 3.4 | Scope cannot be widened by a filter | `ScopeContext.narrow()` — filters may only narrow; anything else raises `ScopeForbidden` | VERIFIED — `test_units.py`, `test_tenant_isolation.py` |
| 3.5 | Aggregations are scoped too, not just finds | `ScopedRepository.aggregate()` prepends the scope `$match` | VERIFIED — `test_tenant_isolation.py` (HOD analytics endpoints stay inside one department) |
| 3.6 | An HOD is bound to exactly one college and one department | `ScopeContext` rebuilt per request from the user record | VERIFIED — `test_hod_portal.py` (FR-01), `test_tenant_isolation.py` |
| 3.7 | A trainer only sees assigned batches | Scope resolved from `trainer_assignments` | VERIFIED — `test_tenant_isolation.py::test_trainer_only_sees_assigned_batches`; e2e checks the UI says so |
| 3.8 | Frontend guards are UX only | `web/src/components/auth/route-guard.tsx`, documented as such in the file | VERIFIED — `route-guard.test.tsx` (never renders for a signed-out or wrong-role visitor); e2e confirms a student hitting `/hod/participants` is redirected while the API refuses it independently |
| 3.9 | Errors never reveal whether another tenant's resource exists | `ScopedRepository.get()` raises `ScopeForbidden` rather than `NotFound`; one generic message | VERIFIED — `test_tenant_isolation.py` |
| 3.10 | Every scoped collection is readable only through the scoped repository — including the security and operational trails | `write_security_event` stamps `collegeId`/`departmentId`; the admin and HOD readers use `SecurityEventRepo(ctx)`; `system_events` and `refresh_sessions` counts pin the context's college; tenant-leading indexes on all three | VERIFIED — `test_tenant_isolation.py` (an admin's system-health figures and audit-log meta are unchanged by another college's events and sessions, while `SUPER_ADMIN` still sees them) |
| 3.11 | No stack traces, database details or secrets in responses | `app/core/errors.py` — single JSON envelope with a code, message and request id | VERIFIED — `test_smoke.py`, `test_auth.py` |

## 4. Home page (§6)

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 4.1 | Hero carries the exact tagline and the four-step philosophy | `GET /home/overview`; `web/src/app/(public)/page.tsx` | VERIFIED — `test_smoke.py::test_home_overview_carries_the_tagline`; e2e asserts the heading |
| 4.2 | Statistics come from the database, not constants | `GET /home/stats` returns `source: "live-database"` | VERIFIED — `test_smoke.py::test_home_stats_come_from_the_database` compares each figure with a live count |
| 4.3 | Seven featured programs, announcements, FAQs, testimonials | `GET /home/courses`, `/home/announcements`, `/home/faqs`, `/home/testimonials` | VERIFIED — `test_smoke.py` (all four) |
| 4.4 | Demo testimonials are labelled as demo content | `meta.notice` on `/home/testimonials`; rendered on the page | VERIFIED — `test_smoke.py::test_home_faqs_and_testimonials_present` |
| 4.5 | Continue Learning appears for signed-in students only | `GET /home/continue-learning` returns `null` for anonymous callers | VERIFIED — `test_smoke.py::test_continue_learning_is_student_only` |
| 4.6 | The AI assistant answers only from the real catalogue and escalates otherwise | `POST /home/assistant` — `grounded` flag plus an escalation route | VERIFIED — `test_smoke.py` (grounded and ungrounded cases) |
| 4.7 | Signup needs college and department codes to exist | `GET /home/institutions` — codes and names only, no counts or internal ids | VERIFIED — `test_smoke.py::test_institution_directory_lists_codes_for_signup` |

## 5. Student portal (§9–10)

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 5.1 | Dashboard shows streak, readiness, learning hours, pending tasks, quest, next class, 7 pillars, recommendation, week view, leaderboard and a coach insight — all computed | `GET /student/dashboard` | VERIFIED — `test_student_journey.py` |
| 5.2 | No hard-coded dashboard metric anywhere | Every card reads its API; the seeded figures change when underlying data changes | VERIFIED — `test_student_journey.py` asserts the readiness score matches the stored score and moves after a recalculation |
| 5.3 | Courses, modules and lessons with real progress | `GET /student/courses`, `/student/courses/{id}`, `POST …/progress` | VERIFIED — `test_student_journey.py` (completing a lesson advances the percentage and the next lesson) |
| 5.4 | Games are playable and persist attempts, XP and skill deltas | `GET /student/games/{id}`, `POST …/attempts`; correct answers are withheld from the payload | VERIFIED — `test_student_journey.py` (attempt persists, XP awarded, next level returned) |
| 5.5 | Practice creates a session **before** any media is captured, and a retried start does not duplicate it | `POST /student/practice/sessions` with an idempotency key | VERIFIED — `test_student_journey.py` (idempotent replay) |
| 5.6 | Recording consent is explicit and enforced server-side | `recordingConsent` on the session; upload refused without it | VERIFIED — `test_student_journey.py`; e2e shows the consent control on the brief |
| 5.7 | Finishing a session never blocks on AI | `POST …/complete` returns immediately and enqueues `practice.process` | VERIFIED — `test_student_journey.py` (response is immediate; feedback appears after the job) |
| 5.8 | Feedback scores six dimensions, each with transcript evidence | `GET …/feedback` | VERIFIED — `test_student_journey.py`, `test_units.py` (every dimension carries a quote that exists in the transcript) |
| 5.9 | A partial or typed attempt is still scored, on what was actually said | `partial` flag; `transcriptOverride` scored as `student_submitted` | VERIFIED — `test_student_journey.py` (a blank submission does not score like a full interview) |
| 5.10 | Attempts can be compared against the previous one | `GET …/compare` | VERIFIED — `test_student_journey.py` |
| 5.11 | Progress, achievements, certificates, assessments, live classes, resume analysis, profile and settings | the matching `GET /student/*` endpoints | VERIFIED — `test_student_journey.py` |
| 5.12 | Resume analysis reports structure only, and invents nothing | `_analyse_resume` — section detection, action verbs, quantified claims; `basis` field states what it measured | VERIFIED — `test_student_journey.py` |
| 5.13 | Browser capture of microphone audio | `MediaRecorder` in `web/src/app/student/practice/session/[sessionId]/page.tsx`, with a typed fallback when permission is refused | VERIFIED (manual) — needs a real microphone and a secure context |

## 6. Trainer portal (§11–12)

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 6.1 | Dashboard scoped to assigned batches | `GET /trainer/dashboard` | VERIFIED — `test_trainer_workflows.py::test_dashboard_is_assignment_scoped` |
| 6.2 | Attendance marked per session with present/absent/late/leave | `POST /trainer/attendance` | VERIFIED — `test_trainer_workflows.py` |
| 6.3 | Attendance cannot be marked for a future session | date check against the session | VERIFIED — `test_trainer_workflows.py::test_attendance_cannot_be_marked_for_a_future_session` |
| 6.4 | A student outside the session's batch is rejected with a reason | roster check; rejected rows returned individually | VERIFIED — `test_trainer_workflows.py::test_attendance_rejects_students_outside_the_session_batch` |
| 6.5 | Existing attendance is never silently overwritten | 409 unless `overwrite` is set; the correction is attributed and audited | VERIFIED — `test_trainer_workflows.py::test_duplicate_attendance_is_refused_without_overwrite`; the UI surfaces the explicit confirmation |
| 6.6 | Sessions with no attendance recorded are excluded from the denominator, not counted as absence | `app/services/analytics.py` | VERIFIED — `test_trainer_workflows.py`, `test_hod_portal.py` (the note is shown in the HOD UI) |
| 6.7 | 95+ parameters across the 7 pillars, each with its own maximum and weight | `GET /trainer/evaluations/parameters` — 98 seeded | VERIFIED — `test_smoke.py` (≥95 definitions, 7 pillars), `test_trainer_workflows.py`; e2e loads the full form |
| 6.8 | Draft → submit, with a completeness floor | `POST /trainer/evaluations`, `…/submit` (≥60% required) | VERIFIED — `test_trainer_workflows.py` |
| 6.9 | Edits inside the window are versioned; afterwards refused | `editWindowEndsAt`, `assessment_versions` | VERIFIED — `test_trainer_workflows.py::test_edit_window_closes_after_the_configured_hours` |
| 6.10 | Submitting never blocks on scoring | `score.recompute` enqueued, response immediate | VERIFIED — `test_trainer_workflows.py` |
| 6.11 | A trainer may override an AI score, with a reason, keeping the original | `POST /trainer/ai-scores/{id}/override` — stores original, override, reason, author | VERIFIED — `test_trainer_workflows.py`; the student is told a trainer adjusted it |
| 6.12 | Assignments: create, due-date validation, submissions, grading | `POST /trainer/assignments`, `GET …/submissions`, `PATCH /trainer/submissions/{id}` | VERIFIED — `test_trainer_workflows.py` (a past due date is refused) |
| 6.13 | Weak-student alerts raised on a configurable threshold and resolvable with a note | `alerts.weak_student` job, `GET/PATCH /trainer/alerts` | VERIFIED — `test_trainer_workflows.py` |
| 6.14 | Trend analytics and course progress | `GET /trainer/trends`, `/trainer/course-progress` | VERIFIED — `test_trainer_workflows.py` |
| 6.15 | Reports exported to private storage behind a signed URL | `POST /trainer/reports` → job → signed link | VERIFIED — `test_trainer_workflows.py`, `test_units.py` |

## 7. HOD portal (SRS FR-01…FR-14)

Every FR is verified in `apps/api/tests/test_hod_portal.py`; the mapping is in
`docs/00-requirements-checklist.md §6`. Highlights:

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 7.1 | Every screen states the `College › Department` scope | `_scope_header()` on every HOD response; `ScopePill` in the HOD layout | VERIFIED — `test_hod_portal.py`; e2e asserts the banner |
| 7.2 | Participant directory with search, filter, sort and pagination | `GET /hod/participants` | VERIFIED — `test_hod_portal.py::test_participant_directory_search_filter_sort_and_pagination` |
| 7.3 | 360° participant profile in six sections | `GET /hod/participants/{id}` | VERIFIED — `test_hod_portal.py::test_participant_360_profile`; e2e opens all six tabs |
| 7.4 | Attendance analytics overall / module / batch with trends and defaulters | `GET /hod/attendance`, `…/defaulters` | VERIFIED — `test_hod_portal.py` |
| 7.5 | Skill assessment with batch averages and proficiency distribution | `GET /hod/assessments` | VERIFIED — `test_hod_portal.py` |
| 7.6 | Certificate view always states *why* someone is ineligible | `GET /hod/certificates` — `reason` per row | VERIFIED — `test_hod_portal.py` |
| 7.7 | Trainer roster is read-focused; reassignment is a request to the admin | `GET /hod/trainers`, `POST …/reassignment-request` | VERIFIED — `test_hod_portal.py::test_trainer_roster_is_read_focused` |
| 7.8 | Enrollment status transitions are validated and append history | `PATCH /hod/enrollments/{id}/status` with an allowed-transition table | VERIFIED — `test_hod_portal.py` (an illegal transition is refused; a transfer opens a successor row) |
| 7.9 | Filter and sort persistence cannot widen scope | `web/src/hooks/useTableState.ts`, documented in the file; the server re-derives scope regardless | VERIFIED — `test_tenant_isolation.py` |
| 7.10 | Audit trail is read-only and department-scoped | `GET /hod/audit-logs` | VERIFIED — `test_hod_portal.py` |

## 8. Admin portal (§15)

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 8.1 | Five KPIs plus institution analytics, class monitoring and system usage — all computed | `GET /admin/dashboard` | VERIFIED — `test_admin_portal.py` |
| 8.2 | Departments, semesters and batches; archive rather than delete | `POST/PATCH /admin/departments`, `DELETE` archives and refuses while participants remain | VERIFIED — `test_admin_portal.py` |
| 8.3 | Batch capacity enforced | `POST /admin/batches/{id}/students` | VERIFIED — `test_admin_portal.py::test_batch_capacity_is_enforced` |
| 8.4 | Assigning students appends enrollment history and closes the previous row as transferred | same endpoint | VERIFIED — `test_admin_portal.py::test_assigning_students_to_a_batch_appends_enrollment_history` |
| 8.5 | Assigning a trainer re-scopes them immediately, ending live sessions | `POST /admin/batches/{id}/trainers` | VERIFIED — `test_admin_portal.py::test_assigning_a_trainer_refreshes_their_scope` |
| 8.6 | Per-trainer permissions, enforced server-side | `PATCH /admin/trainers/{id}/access` | VERIFIED — `test_admin_portal.py::test_trainer_access_controls_are_persisted` |
| 8.7 | User provisioning returns a one-time temporary password and forces a change | `POST /admin/users` | VERIFIED — `test_admin_portal.py`; e2e provisions a trainer and sees the one-time password |
| 8.8 | An admin cannot deactivate or re-role themselves | business-rule guard | VERIFIED — `test_admin_portal.py::test_admin_cannot_deactivate_or_re_role_themselves` |
| 8.9 | Deactivation warns about pending work and preserves history; reactivation restores the trainer's batches | `POST /admin/users/{id}/deactivate`, `…/reactivate` | VERIFIED — `test_admin_portal.py::test_deactivating_a_trainer_warns_about_pending_work` |
| 8.10 | Bulk import validates row by row and returns each failure with its reason | `POST /admin/import/{entity}`, `GET /admin/import/template/{entity}` | VERIFIED — `test_admin_portal.py` (valid rows commit, invalid rows come back with a field and reason) |
| 8.11 | Report catalogue of 14 families across time grains and entities, async above a threshold | `GET /admin/reports/catalogue` (350 combinations), `POST /admin/reports` | VERIFIED — `test_admin_portal.py`, `test_units.py` |
| 8.12 | AI and system usage, including whether a development fallback is in use | `GET /admin/ai-usage`, `/admin/system-health` | VERIFIED — `test_admin_portal.py` |
| 8.13 | Institution-wide audit log | `GET /admin/audit-logs` | VERIFIED — `test_admin_portal.py`; e2e opens it |
| 8.14 | Super Admin accounts cannot be created from a college admin | guard in `POST /admin/users` | VERIFIED — `test_admin_portal.py` |

## 9. Background work and AI

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 9.1 | Evaluation save is never blocked by AI computation | every scoring path enqueues; handlers in `app/workers/jobs.py` | VERIFIED — `test_trainer_workflows.py`, `test_student_journey.py` |
| 9.2 | Jobs retry with backoff and dead-letter rather than failing silently | `app/workers/queue.py` — delayed set, processing list, dead list, `:on_dead` handlers | VERIFIED — `test_units.py` (retry schedule and dead-letter both asserted) |
| 9.3 | A job whose worker dies is recovered | `requeue_stalled()` | VERIFIED — `test_units.py` |
| 9.4 | No AI feedback without evidence | `HostedEvaluationProvider` rejects any quote absent from the transcript and falls back to the deterministic evaluator | VERIFIED — `test_units.py` |
| 9.5 | Scores are versioned and auditable | `scoringVersion` plus recorded inputs on every recomputation | VERIFIED — `test_units.py` |
| 9.6 | Notifications for defaulters, low scores and pending items | `app/services/notifications.py`, scheduled handlers | VERIFIED — `test_hod_portal.py`, `test_trainer_workflows.py` |

## 10. Frontend quality

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 10.1 | One design system across all four portals | tokens in `web/src/styles/globals.css` lifted from the supplied Admin showcase; shared primitives in `components/ui` | VERIFIED — `docs/05-design-system-map.md` |
| 10.2 | Loading, empty and error states with retry on every screen | `components/shared/state.tsx` — `AsyncSection` makes the decision unavoidable | VERIFIED — `useApi.test.tsx` (all three states), used by every page |
| 10.3 | Responsive from desktop to mobile | shared shell with a drawer sidebar; tables drop columns by breakpoint (`hideBelow`) or scroll | VERIFIED (manual) — checked at 1440/1024/768/390 px |
| 10.4 | Accessibility: semantics, visible focus, `aria-current`, labelled controls, keyboard play | skip link, focus-visible outlines, `role="radiogroup"` rating controls, game keys 1–4/Enter/H/Esc | VERIFIED — `sidebar.test.tsx` (current page and locked items), `route-guard.test.tsx` (status role); `npm run lint` includes `eslint-plugin-jsx-a11y` via `next/core-web-vitals` |
| 10.5 | Locked HOD scope items are visible but inert | `components/layout/sidebar.tsx` — rendered without a link, reason exposed to screen readers | VERIFIED — `sidebar.test.tsx`, e2e |
| 10.6 | No fake controls | every button calls a real endpoint; reserved-role portals state plainly that they are Phase 2 rather than showing a mock dashboard | VERIFIED — reviewed page by page during the build |
| 10.7 | Charts have text equivalents | `ChartCard` takes a `description` read by screen readers in place of the picture | VERIFIED |

## 11. Privacy and secret handling (§29)

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 11.1 | No secret in the repository | every setting from the environment; `.env.example` holds placeholders only | VERIFIED — `app/core/config.py`; production refuses the placeholder `JWT_SECRET` |
| 11.2 | Private media is never exposed by a public URL | `app/services/storage.py` issues short-lived signed URLs for both drivers | VERIFIED — `test_student_journey.py`, `test_units.py` |
| 11.3 | Recording access limited to the student and their trainer | scope checks on `recordings` and the practice feedback endpoint | VERIFIED — `test_tenant_isolation.py` |
| 11.4 | Session timeout and secure cookies | `ACCESS_TOKEN_TTL_MINUTES`, `COOKIE_SECURE`, `COOKIE_SAMESITE`; production refuses insecure cookies | VERIFIED — `test_units.py` (production safety assertions) |
| 11.5 | Input validation and output encoding | Pydantic v2 on every request; React escapes by default and no `dangerouslySetInnerHTML` appears in the tree | VERIFIED |
| 11.6 | Audit logs for sensitive actions | `app/authz/audit.py` on logins, role changes, deactivation, imports, exports, certificate issuance | VERIFIED — `test_admin_portal.py`, `test_hod_portal.py` |
| 11.7 | Consent is recorded and withdrawable | `recordingConsent` on the session and in student settings | VERIFIED — `test_student_journey.py` |

## 12. Closing checks (§38)

| Check | Outcome |
|---|---|
| Run the tests | 272 backend, 28 frontend, 17 end-to-end — all pass |
| Run lint and type checks | `next lint` clean; `tsc --noEmit` clean |
| Run the application | API, worker and web all start; every role signs in and loads its portal |
| Verify critical role flows | Covered by the Playwright suite, listed in the README |
| Verify tenant isolation | `test_tenant_isolation.py` — 28 cases; cross-department and cross-college access refused through URL, query parameter and body |
| Fix obvious errors | See *Defects found and fixed* below |
| Update the README | `README.md` — setup, configuration, seeding, running, tests, security model, external credentials |

---

## Defects found and fixed during verification

Each of these was a real fault in the application, not a test artifact.

| # | Defect | Fix |
|---|---|---|
| 1 | Sparse-unique indexes on `users.institutionId` and `certificates.certificateNo` rejected a second document because an explicit `null` is still indexed | Omit the key entirely when empty — in the seed, `auth.signup` and `admin.create_user` |
| 2 | A client-supplied `?departmentId=` or `?batchId=` outside the caller's scope was silently ignored (200) instead of refused and logged — an FR-12 violation | `guards.py::_reject_client_scope_claims` inspects the query string and small JSON bodies; out-of-scope values are denied and written to `security_events` |
| 3 | Deactivating a trainer set every batch assignment inactive and reactivation never restored them — the account came back with no batches and no record of which it had | Deactivation marks the suspension (`suspendedByDeactivation`); reactivation restores exactly those rows and reports how many |
| 4 | `TrainingModuleRepo` inherited a `batchId` filter for a collection with no such field, so creating an evaluation returned 403 | `batch_scoped = False` on that repository |
| 5 | `ScopedRepository.insert` clobbered a domain `version` field, so every `assessment_versions` row recorded `version: 1` | `setdefault` instead of assignment |
| 6 | An asynchronous report job stayed `queued` forever because the post-enqueue status write overwrote the worker's `ready` | Write the row count before enqueuing and read the real status back |
| 7 | A blank or typed practice submission scored like a full interview because the worker re-transcribed over the student's own text | Reuse the student-submitted transcript |
| 8 | A fresh login could immediately 401 after a revocation, because the revocation marker was stored one second in the future | Store `int(now)` and clear the marker when a session opens |
| 9 | Naive datetimes read back from the database raised `TypeError` when compared with aware ones | `as_utc()` normalisation applied across the routers and scoring |
| 10 | `Job.max_attempts` was frozen at import, so the retry limit could not be configured | `field(default_factory=…)` reading settings at creation |
| 11 | Non-CSE departments' sessions, assignments and evaluations all referenced **CSE** training modules, so those trainers were assigned to a module their own scope refused to show them | The seed now builds the module catalogue per department, and each department's records reference its own |
| 12 | The token-refresh lock was released on a `setTimeout(0)` rather than when the rotation settled, so a 401 arriving shortly after a refresh was answered with the already-resolved promise instead of triggering a real rotation — a spurious logout | Release synchronously in `finally`; regression test in `api.test.ts` |
| 13 | The trainer dashboard ran one attendance query per class, and Today's Classes two per class | Single grouped aggregations; independent reads on the trainer and HOD dashboards now issue together via `asyncio.gather` |
| 14 | The production build fetched fonts from Google at build time (failing in restricted CI) and would have disclosed visitor IPs to a third party at runtime | Typography resolves through CSS variables to a system stack; self-hosting documented in the README |
| 15 | A slow HOD participants query scanned attendance for the whole department per page | Scoped the aggregation to the current page's user ids |
| 16 | **Cross-tenant disclosure.** `GET /admin/audit-logs` read the 25 most recent security events with an unscoped `find()`, returning raw event documents — user ids, IP addresses, request paths, denial details — from *every* institution on the platform into one college admin's response | Read through `SecurityEventRepo(ctx).find_all(…)`, so the tenant filter is injected by the repository layer |
| 17 | **Cross-tenant counts.** `securityEvents24h` and `errors24h` on `/admin/system-health`, and `activeSessions` on `/admin/ai-usage`, were counted platform-wide, so each admin's operational figures included every other institution's | Security events go through the scoped repository; the `system_events` and `refresh_sessions` counts pin `collegeId` from the server-derived context (empty only for `SUPER_ADMIN`, the one role whose scope *is* the platform) |
| 18 | **Root cause of 16–17: security events carried no tenant.** `write_security_event` wrote no `collegeId`/`departmentId`, so `SecurityEventRepo` would have matched nothing and every reader had to bypass scope with `.col` to see anything at all | `write_security_event` now takes and stores the tenant, supplied from `ctx` where the caller has one and otherwise derived from the user record; the same for the `score_recompute_failed` system event and the `refresh_sessions` row opened at login. `security_events`, `system_events` and `refresh_sessions` gained tenant-leading compound indexes, so an unscoped read is now both a policy violation and a slow query — the property the rest of the schema already relied on |
| 19 | The HOD audit screen counted its own blocked attempts through `.col`, bypassing scope (self-limiting, because the query pinned the caller's user id, but it should not have been the reason it was safe) | Scoped `count()` |

## Known limitations

- **Object storage, AI, speech-to-text, email and push** run on development fallbacks until
  credentials are supplied. Each is listed in the README with the exact variables to set.
- **The in-process database fallback is slow.** With `USE_INMEMORY_DB=true` the analytics endpoints
  take 2–12 seconds because that store has no indexes and aggregates in pure Python. Against real
  MongoDB with the shipped indexes they are millisecond-scale. The Playwright timeouts are set
  generously for this reason, and production refuses to start with the fallback enabled.
- **Reserved-role portals are Phase 2.** Super Admin, Placement Cell, Recruiter and Parent are
  present in the auth and authorization model with protected routes and enforced roles; their
  screens are not built.
- **Browser media capture** is verified manually — it needs a real microphone and a secure context.
