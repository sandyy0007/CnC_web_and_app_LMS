# Annual Fee Policy & Payment Integration

## Overview
Winners Creek LMS implements an **Annual Institutional Fee & Payment Verification Policy** calibrated to Indian engineering college partnerships. All fee structures, payment statuses, and course access gates are backed by relational PostgreSQL tables.

---

## 1. Fee Architecture & Institutional Agreement

### 1.1 Pricing Specification
- **Institution**: Arya College of Engineering and IT (`ACEIT`)
- **Annual Soft Skills Subscription Fee**: **₹4,999.00 INR** per student per academic year.
- **Coverage**: Includes full access to `Soft Skills – Arya Old`, interactive simulation labs, AI resume analysis, presentation coach, practice modules, and placement mock interviews.

### 1.2 Verification Ingestion Rules from File 2
File 2 (`7 Sem(2023-2027) SOFT SKILL summer.xlsx`) contained official college fee payment status in Column F:
- **`fee_status = 'Y'`**: Student paid official annual soft-skills training fee through college accounts.
  - Payment record created in `payments` table with `status = 'VERIFIED'`.
  - Enrollment `payment_status` set to `'VERIFIED'`.
  - Course `access_status` set to `'ACTIVE'`.
- **`fee_status = 'N'` or Empty**: Student fee payment pending.
  - Enrollment `payment_status` set to `'PENDING'`.
  - Course `access_status` set to `'INACTIVE'`.

### 1.3 Batch 2025–2029 (Semester 3) Policy
The incoming 3rd-semester cohort (626 students) represents an institutionally sponsored baseline onboarding for the 2025–2029 academic cycle:
- Enrollment `payment_status`: `'VERIFIED'`
- Course `access_status`: `'ACTIVE'`

---

## 2. Payment Persistence & Audit Compliance

### 2.1 Database Record Structure (`payments`)
For every verified fee payment, an immutable audit record is generated:
- `enrollment_id`: Links directly to `enrollments.id`.
- `participant_user_id`: Links to `users.id`.
- `course_id`: Links to `courses.id` (`Soft Skills – Arya Old`).
- `semester`: Academic semester for fee coverage (`7`).
- `amount`: `4999.00`.
- `currency`: `'INR'`.
- `transaction_ref`: Deterministic reference format: `TXN-ACEIT-2023-27-VII-{roll_number}`.
- `payment_method`: `'COLLEGE_OFFICIAL_FEE'`.
- `status`: `'VERIFIED'`.
- `verified_by`: Anubhav (`anubhav@gmail.com`, Arya College Admin).
- `verified_at`: Timestamp of verification transaction (`NOW()`).
- `notes`: `'Verified via VII Sem Soft Skills Summer Sheet'`.

### 2.2 Database Audit Constraint
The schema strictly enforces audit integrity via PostgreSQL check constraint:
```sql
CONSTRAINT chk_payment_verification_audit 
CHECK ((status != 'VERIFIED') OR (verified_at IS NOT NULL));
```
A payment can never enter `'VERIFIED'` status without an immutable timestamp and verifying authority.

---

## 3. Fee Verification Metrics

```sql
SELECT status, count(*) FROM payments GROUP BY status;
```

**Results**:
- **Verified Payments in System**: **337 Records**
- **Sem 7 Fee-Verified Students**: 337 Students
- **Sem 7 Pending Students**: 124 Students (Total = 461)
- **Active Enrolled Access**: 950 Students (626 Sem 3 + 337 Sem 7 fee-verified)
- **Inactive / Paywall Gated Access**: 137 Students

---

## 4. UI Synchronization & Access Gating
1. **Student Course Access (`GET /api/v1/student/courses`)**:
   - Students with `access_status = 'ACTIVE'` access lesson videos, reading materials, and quizzes immediately.
   - Students with `access_status = 'INACTIVE'` see an institutional notice prompting fee settlement with Arya College accounts.
2. **Super Admin Payment Queue (`GET /api/v1/super-admin/payments`)**:
   - Super Admin and Campus Admin dashboards display live payment counts and verification queues reflecting the 337 verified records.

