# Winners Creek LMS — Course Catalog Reconciliation & Ground Truth Architecture

**Document Reference**: `docs/COURSE_CATALOG_RECONCILIATION.md`  
**Application**: Winners Creek LMS (EEDI Platform)  
**Date**: October 2026  
**Status**: **VERIFIED & OPERATIONAL (100% POSTGRESQL GROUND TRUTH)**

---

## 1. Executive Summary & Root Cause Analysis

### The Disconnect Defect
Prior to this remediation, course management suffered from a split-brain architecture:
1. **Super Admin Course Portal** (`apps/api/app/routers/super_admin.py`) was reading and mutating in-memory `mongomock` collections (`db.courses`), which vanished upon container/process restarts and remained completely invisible to public catalog endpoints.
2. **Public Catalog & Homepage** (`apps/api/app/routers/home.py`) queried the PostgreSQL `courses` table via `CourseRepository`.
3. **Outcome**: When Super Admin created, edited, published, or unpublished a course in the admin dashboard, the public pages and students never saw the changes. Furthermore, the catalog displayed unwanted technical demo courses (`Python Architecture`, `Neural Networks`, etc.) disconnected from the authentic institution soft-skills curriculum.

### The Production Remediation
1. **Unified Relational Source of Truth**: Re-implemented all Super Admin course lifecycle endpoints (`GET /courses`, `POST /courses`, `PATCH /courses/{id}`, `GET /courses/{id}/control-center`) to query and mutate PostgreSQL `courses` directly using `get_pg_connection()` with parameter binding and enum casting.
2. **Immediate Cache-Free Reflection**: Course creation and publishing state toggles are immediately reflected in `GET /home/courses` and homepage Program cards without requiring server restarts or manual cache purges.
3. **Safe Content Sanitization**: 7 unwanted standalone technical demo courses were safely soft-deleted (`deleted_at = NOW()`), while preserving 100% of authentic soft-skills courses, Arya College enrollments (1,087 students), and revenue records (₹1,619,676.00).

---

## 2. Active Course Catalog Inventory (PostgreSQL `cnc`)

All 8 active courses are employability and soft-skills focused, mapped to the authentic curriculum:

| # | Code | Title | Delivery Mode | Fee (INR) | Duration | Status |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| 1 | `SS-ARYA-OLD` | **Soft Skills - Arya Old** | HYBRID (Both) | ₹4,999.00 | 40h | **ACTIVE (1,087 Enrollments)** |
| 2 | `SS-PCBE` | **Professional Communication and Business English** | HYBRID (Both) | ₹4,999.00 | 36h | **ACTIVE** |
| 3 | `SS-PSPS` | **Public Speaking and Presentation Skills** | HYBRID (Both) | ₹4,999.00 | 30h | **ACTIVE** |
| 4 | `SS-LTC` | **Leadership and Team Collaboration** | HYBRID (Both) | ₹4,999.00 | 30h | **ACTIVE** |
| 5 | `SS-PDCB` | **Personality Development and Confidence Building** | HYBRID (Both) | ₹4,999.00 | 32h | **ACTIVE** |
| 6 | `SS-ISCR` | **Interview Skills and Career Readiness** | HYBRID (Both) | ₹4,999.00 | 40h | **ACTIVE** |
| 7 | `SS-GDWC` | **Group Discussion and Workplace Communication** | HYBRID (Both) | ₹4,999.00 | 30h | **ACTIVE** |
| 8 | `SS-CTPS` | **Critical Thinking, Problem Solving and Decision Making** | HYBRID (Both) | ₹4,999.00 | 32h | **ACTIVE** |

---

## 3. Data Integrity & Financial Reconciliation

Reconciliation between PostgreSQL tables and Super Admin API ledger:

```
Total Active Courses:          8
Total Enrolled Students:       1,087
Total Verified Payments:       324
Verified Payment Total (INR):  ₹1,619,676.00
Unverified / Discrepant:       0
```

SQL Audit Verification:
```sql
SELECT count(*) as total_payments, sum(amount) as total_revenue
FROM payments
WHERE status IN ('VERIFIED', 'COMPLETED', 'SUCCESS');
-- Result: total_payments = 324, total_revenue = 1619676.00
```

---

## 4. Super Admin Course Control Center

Endpoint: `GET /api/v1/super-admin/courses/{course_id}/control-center`

Provides granular, isolated metrics per course:
- Total Enrolled and Active Participants
- Online vs. Offline / Hybrid Participant Distribution
- Real-time Revenue & Transaction counts (`verifiedPayments`, `pendingPayments`, `failedPayments`)
- Participating Institution Breakdown (Institution Name, Student Count, Faculty assignments)
- Attached Educational Games integration (`read-escape`, `reading-detective`, etc.)

