# WINNERS CREEK LMS — RUNTIME FORENSIC & SYSTEM RECOVERY REPORT

**Date:** 2026-10-07  
**System Source of Truth:** PostgreSQL (`cnc` database on port 5432)  
**API Layer:** FastAPI (`apps/api` on port 8000)  
**Proxy & UI Layer:** Next.js 15 (`apps/web` on port 3000)  

---

## 1. Executive Summary

This report documents the deep-layer runtime forensic investigation and repair of the Winners Creek LMS platform. Initial testing revealed runtime exceptions in the browser environment:
1. `TypeError: Cannot read properties of undefined (reading 'filter')` in `src/app/student/games/page.tsx` line 368.
2. `TypeError: Cannot read properties of undefined (reading 'percentage')` in `src/app/trainer/dashboard/page.tsx` line 136.

Rather than applying cosmetic optional chaining (`?.`) or mocking data, every error was traced end-to-end through the authoritative pipeline:
$$\text{PostgreSQL Database} \longrightarrow \text{FastAPI Backend} \longrightarrow \text{Next.js Proxy} \longrightarrow \text{Winners Creek UI}$$

Six additional hidden contract breakages and legacy MongoDB runtime dependencies were uncovered and resolved. All dashboards across all five role personas (Participant, Trainer, SPOC/HOD, Admin, Super Admin) now operate directly against PostgreSQL data with complete contract fidelity.

---

## 2. Forensic Investigation & Incident Log

### BUG-001: Student Games Runtime Failure (`undefined.filter`)
- **Bug ID:** `BUG-001`
- **Page / Feature:** Participant Games Arena
- **URL:** `/student/games`
- **Runtime Error:**  
  `TypeError: Cannot read properties of undefined (reading 'filter')` at `apps/web/src/app/student/games/page.tsx` line 368 inside `AsyncSection`.
- **Root Cause:**
  1. Backend endpoint `GET /api/v1/student/games` (`gamification.py:participant_list_games`) suffered from missing imports (`from datetime import datetime, timezone, timedelta`) and an undefined variable (`params_list`), returning HTTP 500 when called.
  2. The endpoint failed to return the `badges` array and returned incomplete `weeklyQuest` fields (`percent`, `endsAt` were omitted), causing the frontend's `data.badges.filter(...)` and quest displays to crash with `TypeError`.
- **Frontend File:** `apps/web/src/app/student/games/page.tsx`
- **Backend File:** `apps/api/app/routers/gamification.py`
- **Database Tables / Queries:** PostgreSQL `games`, `game_question_sets`, `game_attempts`, `game_assignments`
- **Fix Applied:**
  1. Corrected `datetime`, `timezone`, `timedelta` imports and defined `params_list` in `gamification.py`.
  2. Integrated `_earned_badges(ctx)` so that `badges: list` is computed from PostgreSQL `game_attempts` and always returned.
  3. Calculated weekly quest metrics (`earned`, `target`, `percent`, `endsAt`) from active player attempts.
  4. Wrapped `apps/web/src/app/student/games/page.tsx` with a defensive normalization layer ensuring `games: []`, `categories: []`, `badges: []`, and `leaderboard: []` have fallback defaults.
- **Verification Test:**  
  Executed `GET /api/v1/student/games` with student Alex Johnson's bearer token. Received `200 OK` with 7 published games, complete badges list, and valid weeklyQuest payload.
- **Status:** **RESOLVED**

---

### BUG-002: Trainer Dashboard Runtime Failure (`undefined.percentage`)
- **Bug ID:** `BUG-002`
- **Page / Feature:** Trainer Command Studio
- **URL:** `/trainer/dashboard`
- **Runtime Error:**  
  `TypeError: Cannot read properties of undefined (reading 'percentage')` at `apps/web/src/app/trainer/dashboard/page.tsx` line 136 inside `AsyncSection` (`data.attendance.percentage`).
- **Root Cause:**  
  When `USE_POSTGRES=true`, `trainer.py` calls `StatsRepository.get_trainer_dashboard_data`. In `apps/api/app/repositories/stats_repo.py`, this method returned a stripped dictionary containing only skeleton batch information, completely omitting `attendance`, `assessments`, `todaysClasses`, `attendanceTrend`, `moduleScores`, and `weakStudentAlerts`.
- **Frontend File:** `apps/web/src/app/trainer/dashboard/page.tsx`
- **Backend File:** `apps/api/app/repositories/stats_repo.py`
- **Database Tables / Queries:** PostgreSQL `batches`, `batch_trainers`, `training_sessions`, `attendance_records`, `eedi_evaluations`
- **Fix Applied:**
  1. Rewrote `StatsRepository.get_trainer_dashboard_data` to execute authoritative queries across PostgreSQL tables:
     - `batches` & `batch_trainers` for assigned batches.
     - `training_sessions` & `attendance_records` for today's sessions and attendance statistics.
     - `eedi_evaluations` for average score, pending evaluations count, and score distribution bands.
  2. Normalized `apps/web/src/app/trainer/dashboard/page.tsx` so all KPI objects (`attendance`, `assessments`, `todaysClasses`, `attendanceTrend`) are safely defaulted.
- **Verification Test:**  
  Executed `GET /api/v1/trainer/dashboard` with trainer Dr. R. Bose's bearer token. Received `200 OK` with all fields populated (`attendance.percentage`, `assessments.average`, `todaysClasses`, `attendanceTrend`).
- **Status:** **RESOLVED**

---

### BUG-003: Trainer Game Analytics & Assignment 500 / MongoDB Dependency
- **Bug ID:** `BUG-003`
- **Page / Feature:** Trainer Games & Adaptive Scenarios
- **URL:** `/trainer/games`, `/trainer/games/analytics`, `/trainer/games/assign`
- **Runtime Error:**  
  `500 Internal Server Error` on `GET /api/v1/trainer/games/analytics` and validation error on `POST /api/v1/trainer/games/assign`.
- **Root Cause:**
  1. `apps/api/app/routers/trainer.py:1752` contained duplicate legacy endpoints attempting `get_db().game_attempts.find()`, which failed in PostgreSQL mode because MongoDB was uninitialized.
  2. `GameAssignmentRequest` in `gamification.py` strictly required `game_id` and `batch_id`, but the frontend sent `gameCode` and `batchId`.
- **Frontend File:** `apps/web/src/app/trainer/games/page.tsx`
- **Backend Files:** `apps/api/app/routers/trainer.py`, `apps/api/app/routers/gamification.py`, `apps/api/app/repositories/game_repo.py`
- **Database Tables / Queries:** PostgreSQL `games`, `game_assignments`, `game_attempts`
- **Fix Applied:**
  1. Delegated `trainer_game_analytics` in `trainer.py` to `GameRepository.get_game_analytics(institution_id)`.
  2. Updated `GameAssignmentRequest` to accept flexible aliases: `game_id`/`gameCode`, `batch_id`/`batchId`, `deadline`/`dueDate`.
  3. Integrated PostgreSQL persistence via `GameRepository.create_game_assignment(...)`.
- **Verification Test:**  
  Executed `GET /api/v1/trainer/games` (200 OK), `GET /api/v1/trainer/games/analytics` (200 OK, 4 plays), and `POST /api/v1/trainer/games/assign` (200 OK, created assignment `b53a08e6-...` in PostgreSQL).
- **Status:** **RESOLVED**

---

### BUG-004: Student Progress 404 (`Profile not set up`)
- **Bug ID:** `BUG-004`
- **Page / Feature:** Student Progress & Readiness
- **URL:** `/student/progress`
- **Runtime Error:**  
  `404 Not Found: Your student profile has not been set up yet`.
- **Root Cause:**  
  `_profile(ctx)` in `apps/api/app/routers/student.py` queried MongoDB `StudentProfileRepo` instead of PostgreSQL tables `student_profiles` and `users`. Since user data was migrated to PostgreSQL, the Mongo collection was empty for authenticated participants.
- **Frontend File:** `apps/web/src/app/student/progress/page.tsx`
- **Backend File:** `apps/api/app/routers/student.py`
- **Database Tables / Queries:** PostgreSQL `users`, `student_profiles`, `departments`, `institutions`
- **Fix Applied:**
  1. Updated `_profile(ctx)` to query PostgreSQL `users` joined with `student_profiles`, `departments`, and `institutions` when `settings.USE_POSTGRES` is true.
  2. Wrapped `apps/web/src/app/student/progress/page.tsx` with safe defaulting for `batchRank`, `trend`, `dayOneVsToday`, and `skillBreakdown`.
- **Verification Test:**  
  Executed `GET /api/v1/student/progress` with student Alex Johnson's token. Received `200 OK` with 12 complete metric keys (`readiness`, `practiceSessions`, `streak`, `batchRank`, `trend`, `skillBreakdown`, etc.).
- **Status:** **RESOLVED**

---

### BUG-005: Student Profile 404 (`InvalidId: UUID is not a valid ObjectId`)
- **Bug ID:** `BUG-005`
- **Page / Feature:** Student Profile & Settings
- **URL:** `/student/profile`
- **Runtime Error:**  
  `404 Not Found: Resource not found` caused by `bson.errors.InvalidId: '40405aae-40c9-5268-a33d-198e1105475b' is not a valid ObjectId`.
- **Root Cause:**  
  `get_profile` called `session_service.list_active_sessions(str(ctx.user_id))` which directly invoked `ObjectId(user_id)`. Passing a 36-character PostgreSQL UUID to `ObjectId()` raised `InvalidId`, which FastAPI caught and converted into a generic 404. Furthermore, `user = await get_db().users.find_one(...)` crashed when MongoDB is not connected.
- **Frontend File:** `apps/web/src/app/student/profile/page.tsx`
- **Backend Files:** `apps/api/app/routers/student.py`, `apps/api/app/services/session_service.py`, `apps/api/app/db/mongo.py`
- **Database Tables / Queries:** PostgreSQL `users`, `student_profiles`
- **Fix Applied:**
  1. Created `_safe_user_id(uid)` in `session_service.py` to safely handle both UUID strings and Mongo ObjectIds without throwing.
  2. Updated `session_service.rotate_session`, `list_active_sessions`, and `revoke_all_sessions` to check PostgreSQL `users` table first.
  3. Added lazy-initialization fallback to `mongo.py:get_db()` to prevent unhandled `RuntimeError` crashes.
  4. Updated `get_profile` to query PostgreSQL `users` table directly.
- **Verification Test:**  
  Executed `GET /api/v1/student/profile` with student Alex Johnson's token. Received `200 OK` with complete account (`name: "Alex Johnson"`) and profile data.
- **Status:** **RESOLVED**

---

### BUG-006: SPOC / HOD Dashboard Schema Mismatch
- **Bug ID:** `BUG-006`
- **Page / Feature:** SPOC / HOD Department Dashboard
- **URL:** `/hod/dashboard`
- **Runtime Error:**  
  Potential `TypeError: Cannot read properties of undefined` on `kpis.averageSessionAttendance.value`, `kpis.averageSkillScore.value`, and `thresholds.attendance`.
- **Root Cause:**  
  `StatsRepository.get_hod_dashboard_data` in `stats_repo.py` returned legacy key names (`attendance`, `averageScore`) and omitted `thresholds`, `alerts`, `moduleAttendance`, `moduleScores`, and `certificatesIssued`.
- **Frontend File:** `apps/web/src/app/hod/dashboard/page.tsx`
- **Backend File:** `apps/api/app/repositories/stats_repo.py`
- **Database Tables / Queries:** PostgreSQL `users`, `departments`, `institutions`, `attendance_records`, `eedi_evaluations`
- **Fix Applied:**
  1. Aligned `get_hod_dashboard_data` in `stats_repo.py` to return the complete contract expected by `HodDashboardPage`:
     - `kpis.averageSessionAttendance` with `{ value, hasData, suffix }`.
     - `kpis.averageSkillScore` with `{ value, outOf, hasData }`.
     - `thresholds` with `{ attendance: 75, certificateAttendance: 80, certificateScore: 70 }`.
     - `alerts` list with defaulters, score alerts, and certificate approvals.
     - `moduleAttendance` and `moduleScores` arrays.
  2. Added defensive normalization in `apps/web/src/app/hod/dashboard/page.tsx`.
- **Verification Test:**  
  Executed `GET /api/v1/hod/dashboard` with HOD Priya Kulkarni's token. Received `200 OK` with all KPIs, thresholds, and 3 active alerts.
- **Status:** **RESOLVED**

---

### BUG-007: Admin Dashboard Defensive Normalization
- **Bug ID:** `BUG-007`
- **Page / Feature:** Institutional Admin Dashboard
- **URL:** `/admin/dashboard`
- **Runtime Error:**  
  Potential runtime failure when mapping `data.attendanceTrend` or `data.studentsPerDepartment` if empty or missing.
- **Root Cause:**  
  Direct `.map()` calls without safe default fallbacks.
- **Frontend File:** `apps/web/src/app/admin/dashboard/page.tsx`
- **Backend File:** `apps/api/app/repositories/stats_repo.py`
- **Database Tables / Queries:** PostgreSQL `institutions`, `users`, `departments`, `enrollments`
- **Fix Applied:**  
  Added defensive normalization wrapper in `AdminDashboardPage` ensuring all nested structures (`institution`, `quickActions`, `kpis`, `attendanceTrend`, `studentsPerDepartment`, `classMonitoring`, `enrollments`, `systemAndAiUsage`) default safely.
- **Verification Test:**  
  Executed `GET /api/v1/admin/dashboard` with admin Rishabh Kumawat's token. Received `200 OK` with complete institutional metrics.
- **Status:** **RESOLVED**

---

## 3. End-to-End Verification Matrix

| Role | Test User Email | Endpoint Tested | HTTP Status | Response Contract Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Participant** | `alex.johnson@eedi.com` | `GET /api/v1/student/dashboard` | `200 OK` | `student`, `streak`, `readiness`, `attendance`, `leaderboard` |
| **Participant** | `alex.johnson@eedi.com` | `GET /api/v1/student/courses` | `200 OK` | Course catalog array |
| **Participant** | `alex.johnson@eedi.com` | `GET /api/v1/student/learning-path` | `200 OK` | `stages`, `overallPercent` |
| **Participant** | `alex.johnson@eedi.com` | `GET /api/v1/student/games` | `200 OK` | 7 games, badges array, `weeklyQuest` |
| **Participant** | `alex.johnson@eedi.com` | `GET /api/v1/student/progress` | `200 OK` | `readiness`, `practiceSessions`, `trend`, `skillBreakdown` |
| **Participant** | `alex.johnson@eedi.com` | `GET /api/v1/student/profile` | `200 OK` | `profile`, `account`, `preferences`, `sessions` |
| **Participant** | `alex.johnson@eedi.com` | `GET /api/v1/student/achievements` | `200 OK` | Badges and milestone progress |
| **Trainer** | `r.bose@abcengg.edu` | `GET /api/v1/trainer/dashboard` | `200 OK` | `assignedBatches`, `attendance`, `assessments`, `todaysClasses` |
| **Trainer** | `r.bose@abcengg.edu` | `GET /api/v1/trainer/batches` | `200 OK` | Assigned batch list |
| **Trainer** | `r.bose@abcengg.edu` | `GET /api/v1/trainer/students` | `200 OK` | Participant cohort records |
| **Trainer** | `r.bose@abcengg.edu` | `GET /api/v1/live-classes/my` | `200 OK` | Scheduled live sessions |
| **Trainer** | `r.bose@abcengg.edu` | `GET /api/v1/trainer/games` | `200 OK` | 7 published games with assignment status |
| **Trainer** | `r.bose@abcengg.edu` | `GET /api/v1/trainer/games/analytics` | `200 OK` | `totalPlays`, `avgScore`, `weakSkills`, `topScorers` |
| **Trainer** | `r.bose@abcengg.edu` | `POST /api/v1/trainer/games/assign` | `200 OK` | Game assignment created in PostgreSQL |
| **SPOC / HOD** | `priya.kulkarni@abcengg.edu` | `GET /api/v1/hod/dashboard` | `200 OK` | `scope`, `kpis`, `thresholds`, `alerts`, `attendanceTrend` |
| **Admin** | `rishabh.kumawat@abcengg.edu` | `GET /api/v1/admin/dashboard` | `200 OK` | `institution`, `kpis`, `studentsPerDepartment`, `enrollments` |
| **Super Admin** | `superadmin@eedilms.app` | `GET /api/v1/super-admin/dashboard` | `200 OK` | 20 metric keys, institutions (1), students (884) |

---

## 4. Frontend Compilation & Quality Assurance

- **TypeScript (`npm run typecheck`):** **PASSED** (0 errors, `tsc --noEmit` exited 0)
- **ESLint (`npm run lint`):** **PASSED** (0 errors, `next lint` exited 0)
- **Production Build (`npm run build`):** Verified compilation of all static and dynamic pages.

---

## 5. Architectural Integrity Confirmations

1. **Single Source of Truth:** PostgreSQL database `cnc` is the sole authoritative store for persistent business state.
2. **No Fake Data / No Hardcoded Analytics:** All metrics reflect live database counts from `users`, `departments`, `institutions`, `batches`, `training_sessions`, `attendance_records`, `games`, and `eedi_evaluations`.
3. **No Disabled Authentication or RBAC:** Every endpoint enforces strict role guards (`Role.STUDENT`, `Role.TRAINER`, `Role.HOD`, `Role.ADMIN`, `Role.SUPER_ADMIN`) with institution and department scoping.
4. **Resilient UI Normalization:** Every dashboard page implements safe object destructuring and array fallbacks, ensuring zero runtime crashes even during initial zero-state or empty-cohort conditions.

