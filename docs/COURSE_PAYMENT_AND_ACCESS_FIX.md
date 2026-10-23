# Course Payment Status, Entitlement Access, and Navigation Isolation Fix

**Author / Project:** Winners Creek / EEDI LMS  
**Date:** October 2026  
**Status:** Resolved & Verified  

---

## 1. Executive Summary & Problem Diagnosis

Participants reported two critical regressions impacting course purchase and navigation:

1. **Bug 1: Purchase Course button remains after successful payment**
   - On `/student/payments`, *Cloud AI Masterclass (Online)* displayed a `VERIFIED` payment in the transaction ledger, yet the top trial card still showed *"3-Day Trial Expired"* with an active *"Purchase Course"* / *"Unlock Lifetime Access"* modal trigger.
   - Navigating to `/student/learning/[courseId]` displayed *"Enrolment Required to Access Course Content"* and *"Unlock Full Access"* lock banners despite the user possessing a verified payment record.
2. **Bug 2: Selecting another course opens previously purchased / stale course**
   - When a student with multiple courses (e.g. *Cloud AI Masterclass (Online)* and *Soft Skills - Arya Old*) switched courses or clicked upgrade links, the UI either navigated without canonical course parameters or retained cached data from the prior course.
   - Clicking *"Unlock Full Access"* triggered payment modals without passing the specific course ID, defaulting checkout state across unrelated courses.

---

## 2. Root Cause Analysis

### A. Trial Expiration Date Not Cleared on Verification (`PaymentRepository.verify_payment`)
- When a user starts a 3-day trial, `enrollments.access_end_date` is stamped with `NOW() + INTERVAL '3 days'`.
- Upon payment verification via `PaymentRepository.verify_payment`, the enrollment `access_status` was set to `'ACTIVE'`, but `access_end_date` was left untouched.
- When `access_service` or `trial_service.check_course_access` evaluated access:
  ```python
  if row['access_end_date'] and row['access_end_date'] < datetime.now(timezone.utc):
      return {'hasAccess': False, 'reason': 'EXPIRED'}
  ```
  Even though payment was verified, access was rejected because the 72-hour trial date was in the past.
- Furthermore, `verify_payment` had `WHERE status = 'ACTIVE'` for `course_trials`, which failed to convert trials that had already transitioned to `EXPIRED`.

### B. Duplicate Course Clones in Database
- Historical synchronization from MongoDB had generated 7 duplicate entries for *"Cloud AI Masterclass (Online)"* in PostgreSQL.
- Only one record (`e0962405-f5ec-4a14-ae84-ec572f096b40`) contained verified payments, active enrollments, modules, and lessons.
- The other 6 clone entries had 0 enrollments and 0 lessons, but when querying by title or iterating published courses, the inactive clones took precedence or caused mismatched foreign keys.

### C. Syntax / Indentation Bug in `apps/api/app/routers/student.py`
- In `course_detail` (`@router.get("/courses/{course_id}")`), lines 640–708 (responsible for fetching modules, lessons, and enrollment details) were mistakenly indented inside `if not course:`.
- As a result, when a valid PostgreSQL course was found, execution skipped module population entirely and fell through to Mongo fallback or 403 error states.

### D. Stale Hook Caching in Frontend (`useApi.ts`)
- In `apps/web/src/hooks/useApi.ts`, `useApi` did not reset its internal `data` or `loaded` state when the `path` argument changed.
- Navigating between `/student/learning/COURSE_A` and `/student/learning/COURSE_B` caused Course A's modules to remain rendered while Course B was loading, leading to flickering and mismatched content.

### E. Missing Course Context in Payment Navigation
- Payment buttons on `/student/learning/[courseId]` and `/courses/[slug]` routed to `/student/payments` as a bare URL without carrying the `courseId`.
- The checkout modal was populated with whichever course the modal state had last held, or defaulted to the first course in the list.

---

## 3. Implementation Details

### 3.1 Backend Fixes

1. **`apps/api/app/repositories/payment_repo.py`**:
   - In `verify_payment`:
     - Updates `enrollments` to set `access_end_date = NULL` and `access_start_date = COALESCE(access_start_date, CURRENT_DATE)` upon payment verification. This guarantees permanent lifetime access.
     - Updates `course_trials` with `WHERE student_id = %s AND course_id = %s AND status IN ('ACTIVE', 'EXPIRED')` to set `status = 'CONVERTED'`, `converted_at = NOW()`.
2. **`apps/api/app/services/payment_service.py`**:
   - In `create_course_payment`:
     - Resolves course by UUID or slug in PostgreSQL.
     - Adds verification guard: if the student already holds a `VERIFIED` payment and active enrollment for that exact course, rejects duplicate creation with HTTP 409 Conflict: *"You have already purchased and verified access to this course."*
   - In `verify_course_payment`:
     - Converts all matching student trials to `CONVERTED`.
3. **`apps/api/app/services/trial_service.py`**:
   - In `get_student_trials`:
     - Checks PostgreSQL enrollments and verified payments. If verified, auto-converts trial record to `CONVERTED`, setting `status = 'converted'`, `isActive = False`, `isPaid = True`, `daysRemaining = 0`.
   - In `check_course_access`:
     - Resolves course by UUID or slug.
     - If the student has an active/paid enrollment but `access_end_date` is non-null and expired, auto-clears `access_end_date` and grants full access (`hasAccess = True, accessType = 'paid'`).
4. **`apps/api/app/services/content_auth_service.py`**:
   - Resolves course slugs to UUIDs.
   - Automatically heals enrollment records where verified payments exist.
5. **`apps/api/app/routers/student.py`**:
   - Corrected indentation in `course_detail` so modules, lessons, and enrollment details are fetched and returned directly from PostgreSQL.
   - Added slug-to-UUID resolution in `enroll_course`.
6. **Database Canonicalization**:
   - Soft-deleted 6 empty duplicate copies of *"Cloud AI Masterclass (Online)"* (`deleted_at = NOW(), published = FALSE`), retaining canonical course ID `e0962405-f5ec-4a14-ae84-ec572f096b40`.
   - Repaired Sandeep's enrollment to `access_end_date = NULL`, `access_status = 'ACTIVE'`, `payment_status = 'VERIFIED'`.
   - Repaired Sandeep's trial record to `status = 'CONVERTED'`, `converted_at = NOW()`.
   - Preserved all 1,100 users, 324 payments, and 1,087 enrollments.

### 3.2 Frontend Fixes

1. **`apps/web/src/hooks/useApi.ts`**:
   - Added `prevPathRef` to detect path changes; immediately resets `data = null` and `loaded = false` when switching endpoints.
2. **`apps/web/src/app/student/payments/page.tsx`**:
   - Integrated `useSearchParams` wrapped in `<React.Suspense>` to read `?courseId=...`.
   - Derived `paidCourseIds` from verified payments list.
   - For paid courses, cards render a *"Paid & Enrolled"* badge and *"View Course →"* button, completely hiding *"Purchase Course"* and *"Unlock Lifetime Access"*.
   - If visiting with `?courseId=PAID_COURSE`, displays a banner: *"You Already Have Verified Access: You have already purchased lifetime access to this course."* with an *"Open Course →"* button.
   - Modal state is explicitly reset when opened (`setCourseConfig(null)`), preventing stale course data from displaying.
   - Post-payment confirmation view includes a direct *"Open Purchased Course →"* action pointing to `/student/learning/${purchasedCourseId}`.
3. **`apps/web/src/app/student/learning/[courseId]/page.tsx`**:
   - Resets `activeId = null` whenever `courseId` route parameter changes.
   - Verifies `isPaid` / `accessType === 'paid'`: hides trial lockout modals and reveals complete curriculum.
   - All upgrade buttons pass the canonical course ID query param: `/student/payments?courseId=${course.id}`.
4. **`apps/web/src/app/(public)/courses/[slug]/page.tsx`**:
   - Links purchase CTA directly to `/student/payments?courseId=${data.id}`.

---

## 4. Verification & Test Evidence

### Backend Tests
- `apps/api/tests/test_payment_course_access.py`:
  - `test_verified_payment_clears_trial_and_grants_access`: PASSED
  - `test_duplicate_payment_prevention`: PASSED
  - `test_course_isolation_access`: PASSED
- `apps/api/tests/test_postgres_integration.py`: 12/12 PASSED
- `apps/api/tests/test_real_data_audit.py`: 5/5 PASSED (Baseline: 1,100 users, 324 payments, 1,087 enrollments intact)

### Frontend Tests
- Vitest suite: 8 test files, 40 tests passed.
  - Added `apps/web/src/app/student/payments/payments.test.tsx` verifying:
    - Paid course hides purchase button and renders "Paid & Enrolled".
    - `?courseId=` parameter opens checkout for targeted course.
    - Already paid banner displays when navigating to payment page for an owned course.
- TypeScript check (`npm --prefix apps/web run typecheck`): Passed with 0 errors.

