# API Map — versioned REST under `/api/v1`

Every endpoint independently verifies: (1) authenticated, (2) role allowed, (3) tenant scope,
(4) resource scope. Client-supplied scope parameters are ignored.

## `/auth`
`POST /signup` · `POST /verify-email` · `POST /resend-otp` · `POST /login` · `POST /refresh` ·
`POST /logout` · `POST /logout-all` · `POST /forgot-password` · `POST /reset-password` ·
`GET /me` · `POST /change-password` · `GET /dev/otp/{email}` *(dev-only, gated by `ALLOW_DEV_ENDPOINTS`)*

## `/home` (public)
`GET /overview` · `GET /courses` · `GET /courses/{slug}` · `GET /trainers` · `GET /announcements` ·
`GET /stats` · `GET /faqs` · `GET /testimonials` · `POST /assistant` (auth-aware) ·
`GET /continue-learning` (student only)

## `/student`
`GET /dashboard` · `GET /courses` · `GET /courses/{id}` · `POST /courses/{id}/progress` ·
`GET /learning-path` · `GET /games` · `GET /games/{id}` · `POST /games/{id}/attempts` ·
`PATCH /games/attempts/{id}` · `GET /practice/modes` · `POST /practice/sessions` ·
`GET /practice/sessions` · `GET /practice/sessions/{id}` · `POST /practice/sessions/{id}/upload-url` ·
`POST /practice/sessions/{id}/upload` · `POST /practice/sessions/{id}/complete` ·
`GET /practice/sessions/{id}/feedback` · `GET /practice/sessions/{id}/compare` ·
`GET /progress` · `GET /achievements` · `GET /assessments` · `POST /assessments/{id}/attempts` ·
`GET /live-classes` · `GET /leaderboard` · `GET /profile` · `PATCH /profile` ·
`GET /placement-goal` · `PUT /placement-goal` · `GET /certificates` · `POST /resume` ·
`GET /resume/analysis` · `GET /recommendations` · `POST /reports/progress` · `GET /settings` ·
`PATCH /settings` · `GET /sessions` (devices) · `DELETE /sessions/{id}`

## `/trainer`
`GET /dashboard` · `GET /batches` · `GET /batches/{id}` · `GET /batches/{id}/students` ·
`GET /classes/today` · `GET /sessions` · `GET /sessions/{id}/attendance` · `POST /attendance` ·
`PATCH /attendance/{id}` · `GET /students` · `GET /students/{id}` ·
`GET /evaluations/parameters` · `GET /evaluations` · `POST /evaluations` ·
`PATCH /evaluations/{id}` · `GET /evaluations/{id}` · `GET /evaluations/{id}/versions` ·
`POST /evaluations/{id}/submit` · `POST /ai-scores/{id}/override` ·
`GET /assignments` · `POST /assignments` · `PATCH /assignments/{id}` ·
`GET /assignments/{id}/submissions` · `PATCH /submissions/{id}` ·
`GET /course-progress` · `GET /alerts` · `PATCH /alerts/{id}` · `GET /trends` ·
`POST /reports` · `GET /reports` · `GET /reports/{id}`

## `/hod`  (department-scoped — SRS FR-01…FR-14)
`GET /dashboard` · `GET /participants` · `GET /participants/{id}` ·
`GET /participants/{id}/attendance` · `GET /participants/{id}/assessments` ·
`GET /participants/{id}/feedback` · `GET /participants/{id}/enrollment-history` ·
`GET /participants/{id}/certificate` · `GET /attendance` · `GET /attendance/defaulters` ·
`GET /assessments` · `GET /trainers` · `POST /trainers/{id}/reassignment-request` ·
`GET /feedback` · `GET /certificates` · `POST /certificates/{id}/flag` ·
`GET /enrollments` · `PATCH /enrollments/{id}/status` · `POST /reports` · `GET /reports` ·
`GET /audit-logs` · `GET /notifications`

## `/admin` (institution-scoped)
`GET /dashboard` · `GET|POST /departments` · `GET|PATCH|DELETE /departments/{id}` ·
`GET|POST /semesters` · `PATCH /semesters/{id}` · `GET|POST /batches` · `PATCH|DELETE /batches/{id}` ·
`POST /batches/{id}/students` · `POST /batches/{id}/trainers` ·
`GET|POST /trainers` · `PATCH /trainers/{id}` · `PATCH /trainers/{id}/access` ·
`GET|POST /users` · `PATCH /users/{id}` · `POST /users/{id}/deactivate` ·
`POST /users/{id}/reactivate` · `PATCH /users/{id}/role` ·
`GET|POST /placements` · `PATCH /placements/{id}` ·
`GET|POST /certificate-templates` · `PATCH /certificate-templates/{id}` ·
`POST /certificates/issue` · `GET /reports/catalogue` · `POST /reports` · `GET /reports` ·
`GET /ai-usage` · `GET /system-health` · `POST /import/{entity}` · `GET /import/jobs` ·
`GET /import/jobs/{id}` · `GET /import/template/{entity}` · `GET /audit-logs`

## Cross-cutting
`/notifications` — `GET /` · `POST /{id}/read` · `POST /read-all` · `GET /unread-count` ·
`POST /devices` (FCM token)
`/reports` — `GET /jobs/{id}` · `GET /download/{exportId}` (signed, expiring)
`/files` — `GET /signed/{token}` (dev storage driver signed delivery)
`/ai` — `GET /providers/health` · `POST /coach` (grounded, student-scoped)
`/health` — `GET /health` · `GET /health/ready`

## Error envelope
```json
{ "success": false,
  "error": { "code": "SCOPE_FORBIDDEN", "message": "You don't have access to this resource",
             "requestId": "01JF…", "details": null } }
```
Codes: `VALIDATION_ERROR` 400 · `UNAUTHENTICATED` 401 · `SCOPE_FORBIDDEN` / `ROLE_FORBIDDEN` 403 ·
`NOT_FOUND` 404 · `CONFLICT` 409 · `BUSINESS_RULE_VIOLATION` 422 · `RATE_LIMITED` 429 ·
`INTERNAL_ERROR` 500 · `SERVICE_UNAVAILABLE` 503.
