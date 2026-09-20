# Role & Permission Matrix

## Scope binding
| Role | college | department | batch | student | Notes |
|---|---|---|---|---|---|
| SUPER_ADMIN | all | all | all | all | platform configuration |
| ADMIN | exactly 1 | all in own college | all in own college | all in own college | institution admin |
| HOD | exactly 1 | exactly 1 | all in own department | all in own department | read-heavy by design (SRS §14.5) |
| TRAINER | exactly 1 | 1..n (assignment-derived) | only assigned | only students in assigned batches | write: attendance, evaluation, feedback, assignments |
| STUDENT | exactly 1 | exactly 1 | own | self only | own learning + practice data |
| PLACEMENT_CELL | exactly 1 | all in own college | — | placement-relevant only | reserved |
| RECRUITER | none | none | — | only explicitly shared | reserved |
| PARENT | derived | derived | — | only linked student | reserved |

## Action permissions (`C`reate `R`ead `U`pdate `D`elete `X`export, `-` = denied)
| Resource | SUPER_ADMIN | ADMIN | HOD | TRAINER | STUDENT |
|---|---|---|---|---|---|
| colleges | CRUD | R (own) | R (own) | - | - |
| departments | CRUD | CRU (own college) | R (own) | R (assigned) | - |
| batches | CRUD | CRU | R | R (assigned) | R (own) |
| users | CRUD | CRU (own college) | R (own dept) | - | R (self) |
| student_profiles | CRUD | CRU | R | R (assigned batches) | RU (self) |
| enrollments | CRUD | CRU (never overwrite history) | R + status transition | - | R (self) |
| training_sessions | CRUD | CRU | R | RU (assigned) | R (own batch) |
| attendance | R | R | R + X | CRU (assigned session only) | R (self) |
| skill_assessments | R | R | R + X | CRU (assigned, edit window) | R (self) |
| trainer_feedback | R | R | R | CRU (own) | R (self) |
| assignments | R | R | R | CRUD (assigned batches) | R + submit |
| certificates | CRUD | CRU (criteria + issue) | R + flag for review | - | R (self) |
| practice_sessions | R | R (aggregate) | R (aggregate) | R (assigned students) | CRU (self) |
| ai_scores | R | R | R (aggregate) | R + override | R (self) |
| eedi_scores | R | R | R | R | R (self) |
| reports | CRUD | CRUD + X | C + X (dept only) | C + X (own batches) | X (own progress) |
| audit_logs | R | R (own college) | R (own dept) | - | - |
| ai_usage_events / system_events | R | R (own college) | - | - | - |
| bulk imports | C | C (own college) | - | - | - |

## Hard rules
1. Scope is **always** re-derived server-side from the authenticated identity. Client-supplied
   `collegeId` / `departmentId` / `batchId` / `trainerId` / `studentId` is never trusted.
2. Filters narrow, never widen: a filter value outside the derived scope is rejected, not intersected silently.
3. Cross-scope reads return a generic denial and never confirm whether the target exists.
4. Audit logs and enrollment history are append-only.
5. Every rejected scope attempt writes a `security_events` record and increments an anomaly counter.
