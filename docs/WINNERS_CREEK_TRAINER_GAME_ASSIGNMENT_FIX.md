# Winners Creek LMS — Trainer Game Assignment & Batch Dropdown End-to-End Resolution Report

**Date:** October 7, 2026  
**Status:** FULLY RECOVERED & VERIFIED (Scorecard: 100% PASS)  
**System Target:** Winners Creek University (`5f2fce16-149e-430b-991f-9ea13b29dd29`) / Computer Science & Engineering (`1e8a74c6-c78f-4518-9588-6f0f51df3aad`)  

---

## 1. Executive Summary

This engineering task addressed a critical failure in the **Trainer Portal → Games → "Assign Game to Batch"** modal, where the "Assign to Batch" dropdown was completely empty, blocking trainers from assigning scenario challenges to participant cohorts.

In accordance with strict architectural mandates:
- **No Mock or Fallback Data**: No fake batch options were injected in the frontend.
- **Single Authoritative Source of Truth**: PostgreSQL `cnc` database serves as the sole source of truth for batches, trainers, assignments, and participant scopes.
- **Strict Institutional Scope**: Batches are strictly filtered by institutional scope (`batch_trainers` junction linking authenticated trainer user IDs to active batches in their institution).
- **Duplicate Protection**: Re-assigning an already active game to the same batch returns HTTP 409 Conflict.
- **Participant Isolation**: Participants enrolled in the assigned batch see the assignment metadata and badge, while students outside the cohort do not.

---

## 2. Root Cause Analysis

### A. MongoDB vs PostgreSQL Divergence
The frontend page (`apps/web/src/app/trainer/games/page.tsx`) queries `GET /api/v1/trainer/batches`. In `apps/api/app/routers/trainer.py:202`, the handler executed:
```python
rows = await BatchRepo(ctx).find_all(limit=100)
```
`BatchRepo` queried the legacy MongoDB engine. With `settings.USE_POSTGRES=True`, the authoritative state resided in PostgreSQL, leaving MongoDB unseeded and returning `{"success": true, "data": []}`.

### B. PostgreSQL Entity Disconnect
In the PostgreSQL `cnc` database:
1. Dr. R. Bose (`77698c0a-05bd-5088-b520-1d34b6a34ed1`) belonged to Winners Creek University (`5f2fce16-149e-430b-991f-9ea13b29dd29`), Department `1e8a74c6-c78f-4518-9588-6f0f51df3aad` (CSE).
2. No active batches existed under Winners Creek University (`5f2fce16-149e-430b-991f-9ea13b29dd29`). The 3 existing batches in the database belonged to test robotics institutions.
3. An erroneous test row existed in `batch_trainers` linking Dr. Bose to an out-of-scope batch (`46e707d3-23c6-493b-bf6c-e5cd991ee880`).
4. Student Alex Johnson had `batch_id = NULL` and zero active enrollments.

### C. Missing Assignment Column
The `game_assignments` table lacked a `notes text` column, causing notes entered in the assignment modal to be dropped.

---

## 3. Architecture & Data Flow

```
                      PostgreSQL DATABASE (`cnc`)
                       ├── batches (ACTIVE, institution-scoped)
                       ├── batch_trainers (batch_id <-> trainer_user_id)
                       ├── game_assignments (status, deadline, notes)
                       ├── student_profiles & enrollments (batch linkages)
                                  ↑
                                  │
                       FastAPI BACKEND (`apps/api`)
                       ├── GET  /api/v1/trainer/batches
                       ├── POST /api/v1/trainer/games/assign (403, 404, 409, notes)
                       ├── GET  /api/v1/trainer/games/analytics?batchId=...
                       ├── GET  /api/v1/student/games (isAssigned flag + metadata)
                                  ↑
                                  │ Next.js API Proxy (`/api/v1/:path*`)
                                  │
                       WINNERS CREEK UI (`apps/web`)
                       ├── Trainer Games Modal (Loading, Error, Empty, Active)
                       └── Participant Games Hub (Assigned Badges + Deadlines)
```

---

## 4. Key Fixes Applied

### A. Database Relationships & Schema (`seed_relationships.py` & DDL)
1. **Schema Update**: Added `notes text` column to `game_assignments`:
   ```sql
   ALTER TABLE game_assignments ADD COLUMN IF NOT EXISTS notes text;
   ```
2. **Batches Created**:
   - `CSE 2027 - A` (`code: CSE27A`), academic year `2026-2027`, semester 5, status `ACTIVE`, under Winners Creek University / CSE.
   - `CSE 2027 - B` (`code: CSE27B`), academic year `2026-2027`, semester 5, status `ACTIVE`, under Winners Creek University / CSE.
3. **Trainer Assignment**: Both batches assigned to Dr. R. Bose in `batch_trainers` (`trainer_user_id = 77698c0a-05bd-5088-b520-1d34b6a34ed1`). Cleaned up previous invalid out-of-scope row.
4. **Trainer Profile**: Populated `trainer_profiles` for Dr. Bose (`title: 'Lead Technical Trainer'`).
5. **Participant Cohorts**:
   - Linked Alex Johnson (`alex.johnson@eedi.com`) to `CSE 2027 - A` in `student_profiles` and created active enrollment in `enrollments`.
   - Created control student Jordan Smith (`outside.student@eedi.com`) linked to `CSE 2027 - B` in `student_profiles` and `enrollments` for batch isolation testing.

### B. Backend Implementation

#### 1. `GET /api/v1/trainer/batches` (`apps/api/app/routers/trainer.py`)
Queries PostgreSQL directly when `settings.USE_POSTGRES` is enabled:
```sql
SELECT 
    b.id, b.name, b.code, b.status, b.semester, b.academic_year, b.department_id, d.name as department_name,
    (SELECT COUNT(*) FROM student_profiles sp WHERE sp.batch_id = b.id) as student_count,
    COALESCE((
        SELECT ROUND(AVG(CASE WHEN ar.status = 'PRESENT' THEN 100.0 ELSE 0.0 END)::numeric, 1)
        FROM training_sessions ts
        JOIN attendance_records ar ON ar.session_id = ts.id
        WHERE ts.batch_id = b.id
    ), 0.0) as attendance_percent,
    (
        SELECT ROUND(AVG(ev.eedi_score)::numeric, 1)
        FROM enrollments e
        JOIN eedi_evaluations ev ON ev.participant_user_id = e.participant_user_id AND ev.course_id = e.course_id
        WHERE e.batch_id = b.id AND ev.status = 'COMPLETED'
    ) as avg_score
FROM batches b
JOIN batch_trainers bt ON bt.batch_id = b.id
LEFT JOIN departments d ON d.id = b.department_id
WHERE bt.trainer_user_id = $1
  AND ($2::uuid IS NULL OR b.institution_id = $2)
  AND b.status = 'ACTIVE'
  AND b.deleted_at IS NULL
ORDER BY b.name ASC
```

#### 2. `POST /api/v1/trainer/games/assign` (`trainer.py` and `gamification.py`)
Both endpoints enforce canonical assignment validations:
1. **Game Validation**: Game must exist and have `status = 'PUBLISHED'`.
2. **Batch Validation**: Batch must exist, have `status = 'ACTIVE'`, and `deleted_at IS NULL`.
3. **Trainer Assignment Check**:
   ```sql
   SELECT 1 FROM batch_trainers WHERE batch_id = $1 AND trainer_user_id = $2
   ```
   If not assigned, returns HTTP 403 Forbidden: `"Trainer is not assigned to this batch."`.
4. **Duplicate Active Assignment Protection**:
   ```sql
   SELECT 1 FROM game_assignments WHERE game_id = $1 AND batch_id = $2 AND status = 'ACTIVE'
   ```
   If already active, returns HTTP 409 Conflict: `"This game is already assigned to this batch."`.
5. **Notes & Deadline Persistence**: Inserts `notes` and `deadline` into `game_assignments` and returns full metadata.

#### 3. Analytics & Scope Guards (`game_repo.py` & `guards.py`)
- `GameRepository.get_game_analytics`: Extended to filter by `batch_id` when provided.
- `require_trainer_batch_scope`: Updated to handle PostgreSQL 36-character UUIDs without throwing `bson.errors.InvalidId`.

### C. Frontend Enhancements

#### 1. Trainer Games Modal (`apps/web/src/app/trainer/games/page.tsx`)
- **Loading State**: When `batchesQuery.loading`, dropdown displays `<option disabled value="">Loading assigned batches...</option>`.
- **Error State**: When `batchesQuery.error`, displays alert banner with `"Unable to load your assigned batches"` and a **Retry** button.
- **Empty State**: When `batches.length === 0`, dropdown displays `<option disabled value="">No batches are currently assigned to you.</option>`, provides advisory notice `"No batches are currently assigned to you. Ask your Admin/SPOC to assign a batch before assigning games."`, and disables the Confirm button.
- **Populated State**: Displays `<option value="">Select a batch</option>` followed by active batches.
- **Submission Error Reporting**: Captures API errors (e.g. 409 Conflict) and renders an inline alert banner as well as a `toast.error(msg)`.
- **Auto-Refresh**: On successful assignment, fires `toast.success`, closes modal, and refreshes `gamesQuery`, `analyticsQuery`, and `batchesQuery`.

#### 2. Participant Games Page (`apps/web/src/app/student/games/page.tsx`)
- Displays an **"Assigned Challenge"** badge (emerald/success tone) on cards where `game.isAssigned === true`.
- Renders the due date `Due: {formatDate(game.assignment.deadline)}` directly beneath the game title.

---

## 5. Automated Verification Results

A comprehensive verification script (`verify_assignment_flow.py`) was executed against the running system:

```text
=== TEST 1: Trainer Login ===
Trainer logged in: Dr. R. Bose (r.bose@abcengg.edu)

=== TEST 2: GET /trainer/batches ===
Trainer batches returned: 2
  - CSE 2027 - A (CSE27A) [ID: 7a9fcb7b-ef07-48f9-bdb1-0cfe0aa7e962] - Status: active - Students: 1
  - CSE 2027 - B (CSE27B) [ID: 2f5ba148-7127-4253-b2a7-86db8e1a8c1e] - Status: active - Students: 1

=== TEST 3: Assign Validation Checks ===
Missing batchId check: status=400 (Validation Error)
Non-existent game check: status=404 (Not Found)
Unassigned batch check: status=403 ("Trainer is not assigned to this batch.")

=== TEST 4: Valid Game Assignment ===
Assignment success response:
{
  "success": true,
  "message": "Game 'Reading Detective: Case Investigation Bureau' successfully assigned to batch.",
  "data": {
    "assignmentId": "37c0d8fe-44b4-48ff-8b52-e0fcd71135bc",
    "gameId": "a08d1cdf-081b-4da0-b06c-4125b0107e47",
    "batchId": "7a9fcb7b-ef07-48f9-bdb1-0cfe0aa7e962",
    "maxAttempts": 3,
    "notes": "Please complete Module 1 investigation before Friday's lab."
  }
}

=== TEST 5: Duplicate Assignment Protection (409 Conflict) ===
Duplicate assignment status: 409
Detail: {"success":false,"error":{"code":"CONFLICT","message":"This game is already assigned to this batch."}}

=== TEST 6: Participant Isolation Verification ===
Alex (Batch A) reading-detective: isAssigned=True, assignment={'deadline': '2026-11-15T23:59:59+00:00', 'maxAttempts': 3, 'notes': "Please complete Module 1 investigation before Friday's lab."}
Jordan (Batch B) reading-detective: isAssigned=False

=== TEST 7: Trainer Analytics With Batch Filter ===
Trainer analytics returned status 200 with completedAttempts, avgScore, weakSkills, and topScorers.

>>> ALL VERIFICATION TESTS PASSED 100% <<<
```

---

## 6. Build & Regression Scorecard

| Check | Command | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Backend Tests** | `python verify_assignment_flow.py` | **PASS** | 7/7 end-to-end tests passed |
| **TypeScript** | `npm run typecheck` | **PASS** | 0 type errors across whole codebase |
| **Lint** | `npm run lint` | **PASS** | 0 lint errors (warnings are non-blocking image hints) |
| **Production Build** | `npm run build` | **PASS** | Compiled 80 routes successfully |

