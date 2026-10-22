# Demo Data Audit & Purification Manifest

**Project:** Winners Creek LMS (EEDI Platform)  
**Database:** PostgreSQL `cnc` @ localhost:5432  
**Date:** October 14, 2026  
**Status:** AUDITED & IDENTIFIED  

---

## 1. Executive Summary

An exhaustive audit of the PostgreSQL relational database (`cnc`) and legacy in-process data stores was conducted to identify demo, fabricated, obsolete, and automated-test-injected records.

- **Legitimate Institution Anchor:**
  - **Name:** Arya College of Engineering and IT
  - **Code:** `ACEIT`
  - **ID:** `39a363c8-635a-4a0b-b9c0-d0c51529774f`
  - **Status:** `ACTIVE`
- **Authorized Staff & Directory:**
  - **Trainers (4):** Monika (`monika@gmail.com`), Puja Sapra (`pujasapra@gmail.com`), Rajesh Bajaj (`rajeshbajaj@gmail.com`), Sahiba (`sahiba@gmail.com`)
  - **HOD / SPOC (1):** Dr. Akhil Pandey (`akhilpandey.cs@aryacollege.in`)
  - **College Admin (1):** Anubhav (`anubhav@gmail.com`)
  - **Students:** 1,087 genuine institutional student accounts (`@aryacollege.in`)
- **Legitimate Super Admins (2):**
  - `superadmin@eedilms.app` (`Super Administrator`)
  - `winfred@gmail.com` (`Winfred`)

All records outside these verified institutional identities (including 268 synthetic test institutions, 439 demo/test users, and associated dependent rows created by test suites without teardown) have been mapped for safe, transactional removal.

---

## 2. Table-by-Table Audit & Affected Row Counts

| Table Name | Genuine Rows (Preserved) | Demo / Test Rows (Purged) | Total Rows Before | Distinguishing Criteria & Safety Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **`institutions`** | **1** | **268** | 269 | Only `ACEIT` (Arya College of Engineering and IT) is preserved. All 268 demo colleges created by test suites (`ADM_*`, `HOD_*`, `TSI_*`, `HAI_*`, `TEST_*`, `APX_*`, `MOD_*`, `GLB_*`, `VTX_*`, `CLA_*`, `CLB_*`, `INST_*`) are targeted. |
| **`users`** | **1,095** | **439** | 1,534 | Preserves 1,093 Arya members + 2 legitimate Super Admins. Purges 307 demo college accounts and 132 orphan test accounts (`onl_*@online.edu`, `s_*@apx.edu`, `s_*@mod.edu`, `t_*@vtx.edu`, `user_*@eedi.internal`). |
| **`departments`** | **3** | **180** | 183 | Preserves 3 Arya departments: CSE, IT, AI&DS. Purges 180 departments belonging to demo colleges. |
| **`batches`** | **17** | **21** | 38 | Preserves 17 Arya batches across Sem 3 and Sem 7. Purges 21 test college batches. |
| **`student_profiles`** | **1,087** | **24** | 1,111 | Preserves 1,087 verified Arya students. Purges 24 mock student profiles. |
| **`trainer_profiles`** | **4** | **1** | 5 | Preserves the 4 verified Arya trainers (Monika, Puja Sapra, Rajesh Bajaj, Sahiba). Purges 1 test trainer profile. |
| **`batch_trainers`** | **17** | **21** | 38 | Preserves 17 verified Arya batch-trainer assignments. Purges 21 mock test assignments. |
| **`enrollments`** | **1,087** | **105** | 1,192 | Preserves 1,087 Arya active student enrollments. Purges 105 demo enrollments. |
| **`payments`** | **324** | **40** | 364 | Preserves all 324 real Arya student payments. Purges 40 test transactions generated during test runs. |
| **`attendance_records`** | **522** | **0** | 522 | All 522 attendance records belong to genuine Arya sessions and students; 100% preserved. |
| **`training_sessions`** | **135** | **0** | 135 | All 135 sessions belong to genuine Arya College training; 100% preserved. |
| **`eedi_evaluations`** | **83** | **61** | 144 | Preserves 83 genuine Arya evaluations. Purges 61 test evaluations. |
| **`game_attempts`** | **59** | **208** | 267 | Preserves 59 authentic student game attempts. Purges 208 test script runs. |
| **`game_question_sets`** | **0** | **37** | 37 | Purges 37 demo question sets associated with test colleges. |
| **`audit_logs`** | **0** | **0** | 0 | Preserved. |
| **`certificates`** | **0** | **0** | 0 | Preserved. |

---

## 3. Data Integrity & Verification Safeguards

1. **Foreign Key Integrity:** Deletion will be executed in reverse dependency order:
   `game_attempts` &rarr; `eedi_evaluations` &rarr; `payments` &rarr; `enrollments` &rarr; `batch_trainers` &rarr; `student_profiles` &rarr; `trainer_profiles` &rarr; `users` &rarr; `batches` &rarr; `departments` &rarr; `game_question_sets` &rarr; `institutions`.
2. **Strict Retention Guarantee:**
   - No row associated with `institution_id = '39a363c8-635a-4a0b-b9c0-d0c51529774f'` will be modified or deleted.
   - The two genuine Super Admin accounts (`superadmin@eedilms.app` and `winfred@gmail.com`) are explicitly excluded from user purges.
   - All historical payments, attendance logs, and evaluations of Arya College are verified to be untouched.
3. **Transaction Safety:**
   - All operations are encapsulated in an atomic PostgreSQL transaction with pre- and post-count validation. If post-validation fails, the entire transaction rolls back immediately.

