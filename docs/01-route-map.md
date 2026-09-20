# Route Map — Next.js 15 App Router

Guard column: `public` = no auth · `ROLE` = authenticated + that role · every guarded page is additionally
re-verified by the backend on each API call (frontend guards are UX only).

## Public
| Route | Screen | Guard |
|---|---|---|
| `/` | Home page (hero, courses, announcements, FAQ, AI assistant, stats) | public |
| `/about` | About us | public |
| `/courses` · `/courses/[slug]` | Programs catalogue / detail | public |
| `/trainers` | Public trainer directory | public |
| `/announcements` | Announcements | public |
| `/contact` | Contact / help | public |
| `/login` | Login (email or institution ID) | public |
| `/signup` | Signup (role + college context) | public |
| `/verify-email` | OTP + link verification | public |
| `/forgot-password` · `/reset-password` | Reset flow | public |
| `/unauthorized` | Generic scope/role denial | public |

## Student — `/student/*` (role STUDENT) — 17 pages
`dashboard` · `learning` · `learning/[courseId]` (player) · `games` · `games/[gameId]/play` ·
`practice` · `practice/[modeCode]` (brief + consent) · `practice/session/[sessionId]` (recorder) ·
`practice/session/[sessionId]/feedback` (evidence-backed AI feedback) · `live-classes` ·
`assessments` (quizzes **and** assignments, tabbed) · `assessments/[quizId]` · `progress` ·
`achievements` · `resume-analyzer` · `profile` (Profile & Placement Plan) · `settings`

*Assignments live as a tab on `assessments` rather than a sidebar item, because the supplied Student
screenshots have no Assignments entry in the sidebar.*

## Trainer — `/trainer/*` (role TRAINER)
`dashboard` · `batches` · `batches/[batchId]` (roster) · `classes` (today's classes) ·
`attendance` · `attendance/[sessionId]` (mark / correct) · `students` · `students/[studentId]` ·
`evaluations` (mine + AI scores to review) · `evaluations/new` · `evaluations/[evaluationId]`
(95+ parameter form, version history) · `assignments` · `assignments/[assignmentId]` (submissions
and grading) · `course-progress` · `reports` · `alerts` · `profile`

## HOD — `/hod/*` (role HOD, exactly one college + one department) — 10 pages
`dashboard` · `participants` · `participants/[participantId]` (360° profile, 6 tabs) · `attendance`
(analytics + defaulters) · `trainers` · `assessments` · `certificates` (certificates + trainer
feedback, tabbed) · `enrollment` · `reports` · `audit-logs`

Every HOD page carries the `College › Department` scope pill, and the sidebar renders a locked
**Scope** group ("Other Departments", "Other Colleges") as non-interactive text — those are refused
server-side, not merely hidden.

## Admin — `/admin/*` (role ADMIN, one college) — 11 pages
`dashboard` · `departments` (departments **and** batches, tabbed) · `departments/[departmentId]` ·
`batches/[batchId]` (capacity, roster and trainer assignment) · `trainers` (roster + per-trainer
permissions) · `users` (provisioning, re-role, deactivate/reactivate) · `placements` (drives,
certificate templates and certificates, tabbed) · `reports` (14 families × time grain × entity) ·
`system` (AI & server usage, health) · `bulk-import` · `audit-log`

*Batches and certificates are tabs on `departments` and `placements` respectively, matching the
grouped sidebar in the supplied Admin UI showcase (Overview / Institution setup / Intelligence /
Operations) — which has no separate entry for either.*

## Reserved role portals (protected, architecture-ready — Phase 2 screens)
`/super-admin` (SUPER_ADMIN) · `/placement` (PLACEMENT_CELL) · `/recruiter` (RECRUITER) ·
`/parent` (PARENT)

Each is role-guarded and states what the portal is for and what data that role will be able to see.
None shows a mock dashboard.

## Post-login redirect table
| Role | Destination |
|---|---|
| STUDENT | `/student/dashboard` |
| TRAINER | `/trainer/dashboard` |
| HOD | `/hod/dashboard` |
| ADMIN | `/admin/dashboard` |
| SUPER_ADMIN | `/super-admin` |
| PLACEMENT_CELL | `/placement` |
| RECRUITER | `/recruiter` |
| PARENT | `/parent` |

## Totals

72 pages: 7 public · 5 auth · 17 student · 17 trainer · 10 HOD · 11 admin · 4 reserved ·
`/unauthorized`. The root `error`, `not-found` and `loading` boundaries are shared by all of them.
