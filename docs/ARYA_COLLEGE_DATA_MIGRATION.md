# Arya College of Engineering & IT — Production Data Migration Report

## Executive Summary
This document provides the complete forensic migration record for **Arya College of Engineering and IT, Jaipur, Rajasthan, India** into the Winners Creek LMS platform. The migration replaced legacy demo/placeholder records with 1,087 verified, spreadsheet-derived engineering students, established organizational hierarchy, soft-skills course enrollments, attendance sessions, and semester-wise EEDI evaluations.

---

## 1. Source Spreadsheet Forensic Audit

### 1.1 File 1: Semester 3 Cohort (Batch 2025–2029)
- **Path**: `C:\Users\SANDEEP\Desktop\eedi-lms\III Sem List ALL (2025-29) SOFT SKILL (1).xlsx`
- **Academic Batch**: 2025–2029
- **Current Semester**: 3
- **Total Valid Records**: Exactly 626 students
- **Section Distribution**:
  | Sheet / Section Name | Department | Student Count | Roll Number Sample |
  | :--- | :--- | :--- | :--- |
  | `CS A` | Computer Science & Engineering (CSE) | 62 | `25EARCS001` - `25EARCS064` |
  | `CS B` | Computer Science & Engineering (CSE) | 62 | `25EARCS065` - `25EARCS129` |
  | `CS C` | Computer Science & Engineering (CSE) | 66 | `25EARCS130` - `25EARCS196` |
  | `CS D` | Computer Science & Engineering (CSE) | 62 | `25EARCS197` - `25EARCS260` |
  | `CS E` | Computer Science & Engineering (CSE) | 64 | `25EARCS261` - `25EARCS324` |
  | `IT A` | Information Technology (IT) | 60 | `25EARIT001` - `25EARIT060` |
  | `IT B` | Information Technology (IT) | 62 | `25EARIT061` - `25EARIT122` |
  | `AI A` | Artificial Intelligence & Data Science (AI&DS) | 65 | `25EARAI001` - `25EARAI065` |
  | `AI B` | Artificial Intelligence & Data Science (AI&DS) | 58 | `25EARAI066` - `25EARAI123` |
  | `AI C` | Artificial Intelligence & Data Science (AI&DS) | 65 | `25EARAI124` - `25EARAI188` |
  | **Total Sem 3** | **3 Departments / 10 Sections** | **626 Students** | |

### 1.2 File 2: Semester 7 Cohort (Batch 2023–2027)
- **Path**: `C:\Users\SANDEEP\Desktop\eedi-lms\7 Sem(2023-2027) SOFT SKILL summer.xlsx`
- **Academic Batch**: 2023–2027
- **Current Semester**: 7
- **Total Valid Records**: Exactly 461 students
- **Branch Breakdown**:
  | Sheet Name | Department | Student Count | Roll Number Sample |
  | :--- | :--- | :--- | :--- |
  | `CSE` | Computer Science & Engineering (CSE) | 202 | `23EARCS001` - `23EARCS206` |
  | `IT` | Information Technology (IT) | 66 | `23EARIT001` - `23EARIT067` |
  | `AI&DS-A,B,C` | Artificial Intelligence & Data Science (AI&DS) | 193 | `23EARAI001` - `23EARAI196` |
  | **Total Sem 7** | **3 Departments / 7 Sections** | **461 Students** | |

### 1.3 Cohort Overlap and Duplicate Verification
- **Unique Roll Numbers in File 1**: 626 (0 duplicates within file)
- **Unique Roll Numbers in File 2**: 461 (0 duplicates within file)
- **Overlap Between File 1 and File 2**: 0 (Cohorts are 100% disjoint)
- **Grand Total Real Arya College Students**: **1,087**

### 1.4 Sheet1 Evaluation Marks Audit (File 2)
- Sheet1 contained Summer Soft Skills test evaluation marks for 136 records.
- 83 records mapped directly to the 461 Sem 7 CS, IT, and AI&DS students.
- 31 records belonged to ECE (`23EAREC...`) students not present in the CS/IT/AI sheets.
- All 83 matched student marks were imported into `eedi_evaluations` and `evaluation_pillar_scores`.

---

## 2. Pre-Migration Data Safety & Archival

1. **Database Dump**:
   - A complete pre-migration SQL dump was generated prior to data modification:
   - File: `c:\Users\SANDEEP\Desktop\eedi-lms\backups\cnc_pre_migration_backup.sql`
   - Size: `515,066 bytes`
2. **Preservation of Audit Trails**:
   - Rather than executing destructive cascading drops, all 117 prior demo student records were updated to `status = 'ARCHIVED'`.
   - All historical game attempts, notifications, and transactions remain structurally intact.

---

## 3. Account Credential Generation Rules

### 3.1 Email Generation Convention
All student emails are deterministically generated to avoid collisions:
$$\text{Email} = \text{normalized\_name} + \text{suffix} + \text{"."} + \text{grad\_year} + \text{branch\_code} + \text{"@aryacollege.in"}$$

- **Name Normalization**: Honorifics (`MR.`, `MS.`, `DR.`) stripped; non-alphanumeric characters removed; lowercased.
- **Graduation Year**: `29` for Batch 2025–2029; `27` for Batch 2023–2027.
- **Branch Suffix**: `cs` for CSE; `it` for IT; `aids` for AI&DS.
- **Collision Handling**: Monotonically increasing index appended before the domain if duplicate normalized names occur.

**Examples**:
- Roll `25EARCS001` (`AADITYA DADHEECH`, Sem 3) $\rightarrow$ `aadityadadheech.29cs@aryacollege.in`
- Roll `23EARCS001` (`AAGAM JAIN`, Sem 7) $\rightarrow$ `aagamjain.27cs@aryacollege.in`

### 3.2 Secure Password Format
$$\text{Password} = \text{first\_name} + \text{"@1234"}$$
- Passwords are encrypted using standard server-side PBKDF2 with SHA-256 (Django/FastAPI cryptographic standard).
- **Dual Identifier Authentication**:
  The login endpoint (`POST /api/v1/auth/login`) accepts either the student's **College Roll Number** (e.g. `25EARCS001`) or their **Official Email** (e.g. `aadityadadheech.29cs@aryacollege.in`).

---

## 4. Institutional Hierarchy & Key Roles

### 4.1 Institution Record
- **Name**: Arya College of Engineering and IT
- **Code**: `ACEIT`
- **Location**: Jaipur, Rajasthan, India
- **ID**: `39a363c8-635a-4a0b-b9c0-d0c51529774f`

### 4.2 Department Records
1. **Computer Science & Engineering (CSE)**: `dccbb2bf-8de1-4945-bf70-f11ad2f7682a`
2. **Information Technology (IT)**: `ccfd4fb7-0c58-40f4-be0d-7e9bb9ce43a3`
3. **Artificial Intelligence & Data Science (AI&DS)**: `e174e9c5-3b86-4418-b2ae-c2ff131ec82b`

### 4.3 Leadership & Trainer Credentials
| Name | Role | Email | Password | Department / Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Winfred** | `SUPER_ADMIN` | `winfred@gmail.com` | `winfred@1234` | System-wide / All Colleges |
| **Anubhav** | `ADMIN` | `anubhav@gmail.com` | `anubhav@1234` | Arya College Campus Admin |
| **Dr. Akhil Pandey** | `HOD` / SPOC | `akhilpandey.cs@aryacollege.in` | `akhilpandey@1234` | CSE Department (cross-scoping IT & AI&DS) |
| **Monika** | `TRAINER` | `monika@gmail.com` | `monika@1234` | CSE Batches (Lead Soft Skills Trainer) |
| **Sahiba** | `TRAINER` | `sahiba@gmail.com` | `sahiba@1234` | IT Batches |
| **Rajesh Bajaj** | `TRAINER` | `rajeshbajaj@gmail.com` | `rajeshbajaj@1234` | CSE Batches |
| **Puja Sapra** | `TRAINER` | `pujasapra@gmail.com` | `pujasapra@1234` | AI&DS Batches |

---

## 5. Migration Execution Metrics
- **Total Migrated Students**: 1,087
- **Active Soft Skills Enrollments**: 1,087
- **Academic Batches Created**: 17 batches (10 for Sem 3, 7 for Sem 7)
- **Attendance Sessions Created**: 135 sessions
- **Student Attendance Records**: 522 attendance entries
- **EEDI Evaluations Imported**: 83 evaluation records
- **Evaluation Pillar Scores**: 83 pillar records (average score calculation)
- **Payments Verified**: 337 student fee payments verified via File 2 fee status ('Y')
- **Transaction Status**: Committed with 0 rollbacks.

