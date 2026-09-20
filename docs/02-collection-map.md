# MongoDB Collection Map

Conventions: every document carries `_id`, `createdAt`, `updatedAt`, and where meaningful `status`,
`createdBy`, `updatedBy`. Tenant fields `collegeId`, `departmentId`, `batchId` are **denormalised onto
every child document** (SRS §11.5) so scope filtering never needs a join. Relational semantics from the
requirements are preserved with ObjectId references + application-level validation.

## Tenancy & identity
| Collection | Key fields | Scope keys | Indexes |
|---|---|---|---|
| `colleges` | name, code, address, contact, status | — | `code` uniq |
| `departments` | collegeId, name, code, hodUserId, status | collegeId | `(collegeId, code)` uniq |
| `semesters` | collegeId, departmentId, number, label, academicYear, active | college, dept | `(collegeId, departmentId, number)` |
| `batches` | collegeId, departmentId, semesterId, name, code, capacity, status | college, dept | `(collegeId, departmentId, status)` |
| `users` | name, email, institutionId, passwordHash, role, collegeId, departmentId, emailVerified, status, lastActiveAt, phone | college, dept | `email` uniq · `institutionId` uniq sparse · `(collegeId, role, status)` |
| `student_profiles` | userId, collegeId, departmentId, batchId, rollNumber, guardianInfo, semester, section, program, profileCompleteness | college, dept, batch | `userId` uniq · `(collegeId, rollNumber)` uniq · `(collegeId, departmentId, batchId)` |
| `trainer_assignments` | trainerUserId, collegeId, departmentId, batchId, trainingModuleId, academicYear, active | college, dept, batch | `(trainerUserId, active)` · `(collegeId, departmentId, batchId)` |
| `parent_links` | parentUserId, studentUserId, relation, verified | college | `(parentUserId, studentUserId)` uniq |

## Enrollment (append-only history)
| Collection | Key fields | Notes |
|---|---|---|
| `enrollments` | studentUserId, collegeId, departmentId, batchId, enrolledBy, enrolledAt, enrollmentType(regular\|lateral\|transfer), status(active\|on_hold\|transferred\|completed\|dropped), previousEnrollmentId, version | one active per (student, department); transitions write **new** rows |
| `enrollment_events` | enrollmentId, fromStatus, toStatus, reason, actorId, at | immutable trail |

## Curriculum & delivery
`courses` · `modules` · `lessons` · `training_modules` (rubric-bearing) · `training_sessions`
(collegeId, departmentId, trainingModuleId, batchId, trainerUserId, date, startTime, endTime, topic,
status) · `live_classes` · `course_progress` (studentUserId, courseId, moduleId, lessonId, percent,
lastAccessedAt).

## Trainer-owned records
| Collection | Key fields |
|---|---|
| `attendance` | studentUserId, trainingSessionId, trainerUserId, collegeId, departmentId, batchId, date, status(present\|absent\|late\|leave) — uniq `(trainingSessionId, studentUserId)` |
| `skill_assessment_definitions` | collegeId, pillar, code, label, semesterFrom/To, maxScore, weight — the 95+ parameter catalogue |
| `skill_assessments` | studentUserId, trainingModuleId, semesterId, collegeId, departmentId, batchId, assessedBy, rubricScores[], parameterScores[], pillarScores{}, totalScore, maxScore, state(draft\|submitted), version, editWindowEndsAt |
| `assessment_versions` | assessmentId, version, snapshot, changedBy, changedAt — append-only |
| `trainer_feedback` | studentUserId, trainingSessionId, trainerUserId, collegeId, departmentId, feedbackText, rating |
| `assignments` | collegeId, departmentId, batchId, trainerUserId, title, description, dueAt, attachments[], status |
| `assignment_submissions` | assignmentId, studentUserId, submittedAt, files[], state, grade, remarks |
| `weak_student_alerts` | studentUserId, pillar, score, threshold, remark, notifiedHod, resolvedAt |

## Student practice & AI
| Collection | Key fields |
|---|---|
| `practice_modes` | code, title, category, difficulty, description, durationMinutes, pillars[] |
| `practice_sessions` | studentUserId, collegeId, departmentId, practiceModeId, kind, state(draft\|recording\|uploaded\|transcribing\|scoring\|scored\|failed), questions[], startedAt, completedAt, attemptNumber, idempotencyKey |
| `recordings` | practiceSessionId, studentUserId, mediaType, storageKey, bytes, checksum, uploadState, durationSeconds |
| `transcripts` | practiceSessionId, provider, language, text, segments[{start,end,text}], wordCount, fillerWords[] |
| `ai_scores` | practiceSessionId, studentUserId, dimensions[{code,score,weight,explanation,evidence[{start,end,span,kind}],confidence}], overall, modelVersion, groundedness, trainerOverride{} |
| `eedi_scores` | studentUserId, collegeId, departmentId, pillarScores{}, trainerComponent, aiComponent, finalScore, scoringVersion, computedAt, history[] |
| `recommendations` | studentUserId, weakestDimension, exerciseId, reason, state, createdAt |
| `exercise_library` | code, title, targetDimension, steps[], estimatedMinutes |
| `game_definitions` | code, title, category, difficulty, levels[{scenario, dialogue[], options[{text,tag,delta,skills[]}], objectives[], hint}], xpReward, skillMap |
| `game_attempts` | studentUserId, gameId, level, score, xpEarned, comboMax, choices[], skillDeltas{}, completed, startedAt, finishedAt |
| `achievements` · `xp_events` | badge catalogue + append-only XP ledger |
| `resume_documents` | studentUserId, storageKey, parsedSections, analysis{score, gaps[]} |
| `placement_goals` | studentUserId, targetRole, targetScore, targetDate, skillGaps[], roadmap[] |
| `assessments` / `assessment_attempts` | quizzes & MCQ assessments with attempts |

## Certification, placement, reporting, ops
`certificate_templates` (criteria{minAttendance,minAvgScore}) · `certificates` (studentUserId,
trainingProgramId, collegeId, departmentId, eligibilityMet, reason, issuedAt, certificateNo,
status pending\|issued\|revoked) · `placement_drives` · `notifications` · `report_jobs`
(queued\|processing\|ready\|failed) · `report_exports` (storageKey, filters, scope, requestedBy) ·
`audit_logs` (append-only: actorId, action, entityType, entityId, before, after, collegeId,
departmentId, at, ip, requestId) · `security_events` · `ai_usage_events` · `system_events` ·
`import_jobs` (+ per-row results) · `announcements` · `testimonials` · `faqs` · `platform_stats`.

## Index strategy
Every scoped listing query is served by a compound index whose **leading fields are the tenant keys**:
`(collegeId, departmentId, …)`. This makes an unscoped query both a policy violation and a slow query,
so drift is visible. Full list: `apps/api/app/db/indexes.py`.
