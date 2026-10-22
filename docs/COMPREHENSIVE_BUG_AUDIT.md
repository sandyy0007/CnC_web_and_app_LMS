# Comprehensive Bug Audit Matrix
**Winners Creek LMS (EEDI LMS)**  
*Application Audit, Defect Root Causes & Verification*

---

## Audit Metadata

- **Date:** October 2026
- **Primary Database:** PostgreSQL `cnc`
- **Application Backend:** FastAPI (Python 3.11, asyncpg)
- **Application Frontend:** Next.js 14 / React / TypeScript
- **Target Organization:** Arya College of Engineering & IT (College ID: `39a363c8-635a-4a0b-b9c0-d0c51529774f`)

---

## Defect Audit Matrix

### Issue 1: Blank / Zero-Row Excel Reports Across Dashboard Portals
- **Page / Route:** `/admin/reports`, `/hod/reports`, `/super-admin`, `/trainer/reports`
- **User Role:** Super Admin, Admin, HOD, Trainer
- **Reproduction Steps:**
  1. Navigate to Reports page.
  2. Select any report family (Enrollment, Attendance, Trainer Workload, Payments).
  3. Click "Generate Report" and download the resulting `.xlsx` file.
- **Expected Behavior:** Excel file contains all matching student and session records from PostgreSQL `cnc`.
- **Actual Behavior:** Excel file opened with 0 rows or only header columns, despite 1,088 students and 324 payments existing.
- **Frontend Endpoint:** `POST /admin/reports`, `POST /hod/reports`, `GET /super-admin/export/payments`
- **Backend Endpoint:** `POST /api/v1/admin/reports`, `POST /api/v1/hod/reports`, `POST /api/v1/super-admin/reports`
- **Database Query / Table:** PostgreSQL `student_profiles`, `training_sessions`, `attendance_records`, `payments`
- **Root Cause:** Report datasets in `app/services/report_datasets.py` queried empty MongoDB collections instead of PostgreSQL relational tables.
- **Fix:** Rewrote all 15 report builders in `report_datasets.py` with native parameterized PostgreSQL queries; added `ReportFamily.PAYMENTS` in `reports.py`.
- **Regression Test:** `scratch/comprehensive_regression_suite.py` -> 324 payments rows verified, 1,087 enrollment rows verified.
- **Final Status:** **PASS**

---

### Issue 2: Failing Template Download for Attendance (`attendance.json`)
- **Page / Route:** `/admin/bulk-import`
- **User Role:** Admin
- **Reproduction Steps:**
  1. Go to Admin Portal -> Bulk Import (`/admin/bulk-import`).
  2. Select "Attendance" card.
  3. Click "Download Template".
- **Expected Behavior:** Downloads a formatted CSV template (`attendance-import-template.csv`) with UTF-8 BOM encoding.
- **Actual Behavior:** Download failed with HTTP 400/404 or attempted to download missing JSON file.
- **Frontend Endpoint:** `api.getBlob('/admin/import/template/attendance')`
- **Backend Endpoint:** `GET /api/v1/admin/import/template/attendance`
- **Database Query / Table:** None (Static specification schema)
- **Root Cause:** Attendance template was missing from `TEMPLATES` dict in `app/services/import_service.py`.
- **Fix:** Added `attendance` template with schema `["rollNumber", "sessionId", "status", "remarks"]` and set `Content-Type: text/csv; charset=utf-8` with attachment filename.
- **Regression Test:** Verified via live HTTP request; parsed with Python `csv` module with UTF-8 BOM check.
- **Final Status:** **PASS**

---

### Issue 3: Failing Template Download for Trainers (`trainers.json`)
- **Page / Route:** `/admin/bulk-import`
- **User Role:** Admin
- **Reproduction Steps:**
  1. Select "Trainers" card on `/admin/bulk-import`.
  2. Click "Download Template".
- **Expected Behavior:** Downloads `trainers-import-template.csv` containing necessary department and batch assignment headers.
- **Actual Behavior:** Failed with HTTP 400/404.
- **Frontend Endpoint:** `api.getBlob('/admin/import/template/trainers')`
- **Backend Endpoint:** `GET /api/v1/admin/import/template/trainers`
- **Database Query / Table:** None (Static schema)
- **Root Cause:** Trainer template schema lacked proper field configuration in `import_service.py`.
- **Fix:** Implemented full specification `["name", "email", "departmentCode", "designation", "specializations", "phone", "assignedBatchCode"]`.
- **Regression Test:** Downloaded and verified headers match specification.
- **Final Status:** **PASS**

---

### Issue 4: Attendance CSV Import Discarding Rows (Persistence Missing)
- **Page / Route:** `/admin/bulk-import`
- **User Role:** Admin
- **Reproduction Steps:**
  1. Upload CSV containing valid attendance records.
- **Expected Behavior:** Rows are persisted to `attendance_records` table in PostgreSQL `cnc`.
- **Actual Behavior:** Backend lacked PostgreSQL insert logic; rows were discarded or kept in volatile memory.
- **Frontend Endpoint:** `POST /admin/import/attendance`
- **Backend Endpoint:** `POST /api/v1/admin/import/attendance`
- **Database Query / Table:** PostgreSQL `attendance_records`, `training_sessions`, `student_profiles`
- **Root Cause:** `_import_attendance` function did not execute SQL `INSERT`/`UPDATE` statements against PostgreSQL.
- **Fix:** Implemented `_import_attendance` with foreign key verification, department cross-check, batch validation, and `INSERT ... ON CONFLICT` update logic.
- **Regression Test:** Verified valid attendance row inserted; queried `attendance_records` directly in `cnc`.
- **Final Status:** **PASS**

---

### Issue 5: Trainer CSV Import Creating Unusable Accounts
- **Page / Route:** `/admin/bulk-import`
- **User Role:** Admin
- **Reproduction Steps:**
  1. Upload CSV with trainer details.
- **Expected Behavior:** Creates active trainer account in PostgreSQL `users`, creates `trainer_profiles` record, and links batch in `batch_trainers`.
- **Actual Behavior:** Trainer could not authenticate; trainer profile missing in PostgreSQL.
- **Frontend Endpoint:** `POST /admin/import/trainers`
- **Backend Endpoint:** `POST /api/v1/admin/import/trainers`
- **Database Query / Table:** PostgreSQL `users`, `trainer_profiles`, `batch_trainers`
- **Root Cause:** Import only inserted documents into MongoDB `users` collection; PostgreSQL user records were bypassed.
- **Fix:** Integrated transactional creation in PostgreSQL `users` with PBKDF2 hashed password, `trainer_profiles`, and `batch_trainers`.
- **Regression Test:** Tested direct authentication via `POST /api/v1/auth/login` for newly imported trainer; confirmed JWT issuance and batch assignment.
- **Final Status:** **PASS**

---

### Issue 6: Cross-Department Data Contamination in HOD Exports
- **Page / Route:** `/hod/reports`
- **User Role:** HOD (CSE)
- **Reproduction Steps:**
  1. Log in as HOD of Computer Science (`akhilpandey.cs@aryacollege.in`).
  2. Export Session Attendance.
- **Expected Behavior:** Export contains only CSE department records.
- **Actual Behavior:** Potential inclusion of other departments if queries did not strictly filter by authorized department ID.
- **Frontend Endpoint:** `POST /hod/reports`
- **Backend Endpoint:** `POST /api/v1/hod/reports`
- **Database Query / Table:** PostgreSQL `departments`, `student_profiles`
- **Root Cause:** Lack of strict server-side scoping guard in dataset builder.
- **Fix:** Added `_resolve_scope()` in `report_datasets.py` enforcing `sp.department_id = $dept_id` for HOD role; unauthorized department requests return HTTP 403 `ScopeForbidden`.
- **Regression Test:** Parsed generated workbook with openpyxl: 519 records inspected, 100% belonged to CSE, 0 records from IT or ME.
- **Final Status:** **PASS**

---

### Issue 7: Misleading Blank Excel Workbooks on Empty Filter Matches
- **Page / Route:** Reports generation across portals
- **User Role:** All Roles
- **Reproduction Steps:**
  1. Apply a filter that matches no records (e.g. future date range).
  2. Download report.
- **Expected Behavior:** Explicit message indicating no records match the criteria.
- **Actual Behavior:** Downloaded an empty sheet with column headers, misleading users into believing the export failed.
- **Frontend Endpoint:** All report download endpoints
- **Backend Endpoint:** `to_xlsx()` in `app/services/reports.py`
- **Database Query / Table:** All report queries
- **Root Cause:** openpyxl workbook generator did not handle `len(rows) == 0` with a user notice.
- **Fix:** Configured `to_xlsx()` to insert `"No data available for the selected filters."` in Row 2 with muted italic styling whenever 0 rows match.
- **Regression Test:** Automated test requested attendance for 2099-01-01; verified Cell A2 contains the explicit no-data string.
- **Final Status:** **PASS**

---

### Issue 8: Worker User Lookup Failure on Background Report Generation
- **Page / Route:** Large report export jobs
- **User Role:** All Roles
- **Reproduction Steps:**
  1. Request an asynchronous report export job.
- **Expected Behavior:** Background worker completes job and generates signed download URL.
- **Actual Behavior:** Worker crashed with user not found exception.
- **Frontend Endpoint:** Background job queue
- **Backend Endpoint:** `generate_report_worker` in `app/workers/jobs.py`
- **Database Query / Table:** PostgreSQL `users`
- **Root Cause:** Worker queried Mongo `db.users` for user context instead of PostgreSQL `users`.
- **Fix:** Updated worker to query PostgreSQL `users` using `get_pg_connection()` and construct authenticated `ScopeContext`.
- **Regression Test:** Enqueued background report job; verified state transitioned to `ready` with valid signed URL.
- **Final Status:** **PASS**

---

### Issue 9: Report Type Case Sensitivity and Legacy Alias Failures
- **Page / Route:** API endpoints and third-party callers
- **User Role:** All Roles
- **Reproduction Steps:**
  1. Call report endpoint with uppercase `PAYMENTS` or alias `system_activity`.
- **Expected Behavior:** Seamlessly maps to dataset builder.
- **Actual Behavior:** HTTP 400 `ValidationError: Unknown report type`.
- **Frontend Endpoint:** Various
- **Backend Endpoint:** `request_report` in `app/services/reports.py`
- **Database Query / Table:** None
- **Root Cause:** Strict string matching against lowercase dataset keys.
- **Fix:** Added case-insensitivity (`.strip().lower()`) and alias dictionary in `reports.py`.
- **Regression Test:** Verified `PAYMENTS`, `system_activity`, and `attendance` all resolve to valid datasets.
- **Final Status:** **PASS**

---

### Issue 10: Bulk Import Double-Click Race Condition & Silent Errors
- **Page / Route:** `/admin/bulk-import`
- **User Role:** Admin
- **Reproduction Steps:**
  1. Click upload button rapidly multiple times.
  2. Upload a file with malformed rows.
- **Expected Behavior:** Single execution, UI locked during processing, row-by-row diagnostic table on error.
- **Actual Behavior:** Multiple concurrent jobs spawned; errors shown as generic toast.
- **Frontend Endpoint:** `/admin/bulk-import`
- **Backend Endpoint:** `/api/v1/admin/import/{entity}`
- **Database Query / Table:** Import jobs
- **Root Cause:** Missing button disabling state; results table did not unpack rejection details.
- **Fix:** Added `disabled={uploading}` guard and rendered detailed diagnostic rejection table displaying row number, field name, rejected value, and reason.
- **Regression Test:** Tested in browser and typechecked with `tsc --noEmit`.
- **Final Status:** **PASS**

---

## Final Audit Summary

| Total Defects Audited | Remediated | Regression Tests Passing | Status |
| :---: | :---: | :---: | :---: |
| 10 | 10 | 15 / 15 Tests (100%) | **ALL PASS** |

