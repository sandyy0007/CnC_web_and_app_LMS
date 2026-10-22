# WINNERS CREEK LMS — GAME RUNTIME ERROR FORENSIC AUDIT & FIX REPORT

## Overview
This document details the forensic runtime inspection, root cause analysis, code fixes, and independent verification for all 14 runtime errors encountered across the Winners Creek LMS Game Platform (FastAPI, Next.js, and PostgreSQL).

---

### Error 1: PostgreSQL User Dict KeyError `_id` in Auth Public Serialization
- **Error**: `KeyError: '_id'`
- **Source**: `apps/api/app/routers/auth.py:95-115` (`_public_user`)
- **API Involved**: `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `GET /api/v1/auth/me`
- **Category**: Backend / DB Model Compatibility
- **Root Cause**: PostgreSQL query returns records with primary key `id` (UUID), whereas MongoDB legacy objects used `_id`. `_public_user` directly indexed `user["_id"]`, throwing an uncaught `KeyError` whenever a PostgreSQL user signed in.
- **Fix**: Added normalized ID resolution `user_id = str(user.get("id") or user.get("_id"))` and ensured `_id` and `id` are mapped before returning the public user dictionary.
- **Verification**: Verified with `POST /api/v1/auth/login` for `alex.johnson@eedi.com`, returning HTTP 200 with valid JWT and user object.

---

### Error 2: Session Rotation KeyError `_id` on PostgreSQL Users
- **Error**: `KeyError: '_id'` during token rotation
- **Source**: `apps/api/app/services/session_service.py:145-155`
- **API Involved**: `POST /api/v1/auth/refresh`
- **Category**: Backend / Session Management
- **Root Cause**: When rotating an access token from PostgreSQL, `user_row` was converted to dict without setting `user["_id"] = str(user["id"])`. When downstream session logging accessed `user["_id"]`, it raised a 500 error, breaking the client session.
- **Fix**: Added `user["id"] = str(user["id"])` and `user["_id"] = str(user["id"])` immediately after fetching the row.
- **Verification**: Verified with Next.js client background session refresh returning HTTP 200 without session termination.

---

### Error 3: BSON InvalidId Crash in Notifications Unread Count
- **Error**: `bson.errors.InvalidId: '04a60155-...' is not a valid ObjectId, it must be a 12-byte input or a 24-character hex string`
- **Source**: `apps/api/app/services/notifications.py:132-230`
- **API Involved**: `GET /api/v1/notifications/unread-count`
- **Category**: Backend / Service Integration
- **Root Cause**: PostgreSQL student IDs are standard RFC 4122 UUID strings (e.g., `04a60155-89f5-4e6a-bc91-30dbfa02fa7f`). The notification store attempted to construct `ObjectId(user_id)` directly, raising an unhandled exception that resulted in HTTP 500 / 404 in Next.js portal shell.
- **Fix**: Created `_safe_obj_id(id_val)` helper that validates whether a string is a 24-character hexadecimal before converting to `ObjectId`, safely falling back to string match for UUIDs.
- **Verification**: Browser and API test confirmed `GET /api/v1/notifications/unread-count` returns HTTP 200 `{ "success": true, "data": { "unreadCount": 0 } }`.

---

### Error 4: HTTP 500 Crash on Answer Resubmission
- **Error**: `HTTP 500 Internal Server Error` on duplicate answer submission
- **Source**: `apps/api/app/routers/gamification.py:330-345`
- **API Involved**: `POST /api/v1/student/games/{attempt_id}/submit`
- **Category**: Backend / Game Engine API
- **Root Cause**: When a question was submitted twice (e.g. rapid double-clicking an option), `GameEngine.submit_answer` raised a Python `ValueError("Question has already been answered for this attempt.")`. Uncaught in FastAPI, this leaked as an unhandled 500 error.
- **Fix**: Wrapped `GameEngine.submit_answer` in a `try...except ValueError` block that raises a clean `app.core.errors.ValidationError`, returning HTTP 400 with a descriptive error message instead of crashing.
- **Verification**: Verified with automated test sending duplicate answer payloads; received handled HTTP 400 instead of 500.

---

### Error 5: Endless Question Loop Ceiling Crash
- **Error**: Hardcoded finite question pool exhaustion (`IndexError` or pool stagnation)
- **Source**: `apps/api/app/services/game_engine.py:90-185`
- **API Involved**: `GET /api/v1/student/games/{attempt_id}/next-question`
- **Category**: Backend / Game Engine Logic
- **Root Cause**: `get_next_question` strictly excluded all previously consumed questions across the entire attempt history. When the participant answered all questions in the assigned question set, `get_available_questions` returned an empty list, halting gameplay abruptly.
- **Fix**: Implemented round/cycle tracking based on `total_in_set`: `current_round_start = (len(hist_ids) // total_in_set) * total_in_set`, excluding only questions consumed in the current cycle, thus supporting endless gameplay without duplication within each cycle.
- **Verification**: Verified adaptive endless question delivery cycling through multi-round challenges without duplicate deliveries within the same round.

---

### Error 6: Missing Method `get_questions_by_set` on GameRepository
- **Error**: `AttributeError: type object 'GameRepository' has no attribute 'get_questions_by_set'`
- **Source**: `apps/api/app/repositories/game_repo.py:134-145`
- **API Involved**: `POST /api/v1/student/games/{game_id}/start`
- **Category**: Backend / Repository Layer
- **Root Cause**: `GameEngine.get_next_question` invoked `GameRepository.get_questions_by_set(question_set_id)` to calculate the total set length for round cycles, but `GameRepository` only had difficulty-filtered queries (`get_available_questions`).
- **Fix**: Implemented `@staticmethod async def get_questions_by_set(question_set_id)` in `GameRepository` using PostgreSQL query `SELECT * FROM game_questions WHERE question_set_id = $1 ORDER BY created_at ASC`.
- **Verification**: Re-tested `POST /api/v1/student/games/read-escape/start`, which successfully initialized and returned the first question with HTTP 200.

---

### Error 7: Account Not Found in `/auth/me` for PostgreSQL Users
- **Error**: `HTTP 401 Unauthenticated: Account not found`
- **Source**: `apps/api/app/routers/auth.py:740-770` (`/auth/me`)
- **API Involved**: `GET /api/v1/auth/me`
- **Category**: Backend / Auth Routing
- **Root Cause**: `/auth/me` checked MongoDB exclusively (`db.users.find_one`). When PostgreSQL was active (`USE_POSTGRES = True`), Alex Johnson was not found in Mongo, leading to an immediate 401 and redirect to `/login`.
- **Fix**: Added PostgreSQL lookup via `UserRepository.get_by_id(user_id)` and populated student profile details (`roll_number`, `batch_id`, etc.) from `student_profiles` table.
- **Verification**: Verified `GET /api/v1/auth/me` returns HTTP 200 with full student profile data.

---

### Error 8: Case Sensitivity Mismatch in Role Guard ("Your access level changed")
- **Error**: `HTTP 401 Unauthenticated: Your access level changed — please sign in again`
- **Source**: `apps/api/app/authz/guards.py:115`
- **API Involved**: Next.js route transitions (`/student/games`, `/student/dashboard`)
- **Category**: Backend / Authorization Guards
- **Root Cause**: The guard compared `payload.get("role") != role`. One token payload had `"student"` while the parsed role enum had `"STUDENT"`, causing the string equality check to fail and instantly revoking the user's session during navigation.
- **Fix**: Normalized both sides to uppercase: `str(payload.get("role", "")).upper() != str(role).upper()`.
- **Verification**: Navigated through `/student/dashboard`, `/student/games`, and `/student/games/read-escape/play` in headless Chrome without any access level change rejections.

---

### Error 9: Role Inconsistent Lowercasing During Session Rotation
- **Error**: Token role claim drift across refresh cycles
- **Source**: `apps/api/app/services/session_service.py:150`
- **API Involved**: `POST /api/v1/auth/refresh`
- **Category**: Backend / Security Service
- **Root Cause**: Line 150 forcibly executed `user["role"] = user["role"].lower()`. When creating a new access token via `create_access_token`, the payload `"role"` was `"student"`, diverging from the canonical enum `Role.STUDENT = "STUDENT"`.
- **Fix**: Updated line 150 to preserve uppercase role: `user["role"] = user["role"].upper() if isinstance(user["role"], str) else str(user["role"]).upper()`.
- **Verification**: Inspected minted access token JWT claims before and after rotation; verified `"role": "STUDENT"` remains stable.

---

### Error 10: In-Progress Attempt Lockout ("Maximum attempt limit reached")
- **Error**: `HTTP 400 Validation Error: Maximum attempt limit (10) reached for this assignment`
- **Source**: `apps/api/app/routers/gamification.py:240-275`
- **API Involved**: `POST /api/v1/student/games/{game_id}/start`
- **Category**: Backend / Gamification Business Logic
- **Root Cause**: When a participant had an existing `IN_PROGRESS` attempt (e.g. from refreshing the page or navigating back), `participant_start_attempt` treated all past attempts equally toward `max_attempts` and rejected new requests.
- **Fix**: Enhanced `participant_start_attempt` to first search for an active `IN_PROGRESS` attempt for that game and participant. If found, it seamlessly resumes that attempt. Only `COMPLETED` and `FAILED` attempts count toward the assignment's `max_attempts`.
- **Verification**: Verified in browser that refreshing `/student/games/read-escape/play` resumes the active session and loads the pending question without error.

---

### Error 11: Radix UI Progress Invalid Prop Value Error
- **Error**: `[console.error] Invalid prop 'value' of value '601' supplied to 'Progress'. The 'value' prop must be less than the value passed to 'max'`
- **Source**: `apps/web/src/components/ui/misc.tsx:73`
- **API Involved**: Frontend Component Library
- **Root Cause**: `ProgressPrimitive.Root` from `@radix-ui/react-progress` strictly validates that `value` is between 0 and 100. When timer elapsed seconds or scores above 100 were passed, Radix logged console errors on every re-render.
- **Fix**: Clamped `value` in `misc.tsx`: `value={Math.min(100, Math.max(0, value ?? 0))}`.
- **Verification**: Verified in browser console; zero Radix UI prop errors logged during gameplay.

---

### Error 12: Missing `favicon.ico` 404 Error
- **Error**: `Failed to load resource: the server responded with a status of 404 (Not Found)` on `http://localhost:3000/favicon.ico`
- **Source**: `apps/web/public/`
- **API Involved**: Static asset delivery
- **Category**: Frontend / Static Assets
- **Root Cause**: Browser automatically requests `/favicon.ico` upon visiting the application, but `apps/web/public/favicon.ico` was missing.
- **Fix**: Copied brand logo `apps/web/public/images/winnerscreek.png` to `apps/web/public/favicon.ico`.
- **Verification**: Verified `GET http://localhost:3000/favicon.ico` returns HTTP 200 with valid image content.

---

### Error 13: Unused Image Preload and LCP Warnings
- **Error**: `The resource http://localhost:3000/_next/image?url=%2Fimages%2Fbackgrounds%2Fgames.webp was preloaded using link preload but not used`
- **Source**: `apps/web/src/components/ui/GlobalBackgroundLayer.tsx`
- **Category**: Frontend / Performance & UX
- **Root Cause**: The global background layer preloaded large AI-generated images (`games.webp`, `tech-orbit.webp`) across all routes with heavy blur and neon glow, triggering Next.js LCP warnings and visual noise.
- **Fix**: Rebuilt the background layer for games routes to render a calm, dark neutral canvas (deep slate/zinc-950) without blurry neon noise.
- **Verification**: Verified Next.js dev server output; zero preload warnings or LCP degradation.

---

### Error 14: Option Interaction Lifecycle & Audio System Absence
- **Error**: Missing interactive feedback, double-click submissions, and missing audio engine
- **Source**: Game components in `apps/web/src/components/games/`
- **Category**: Frontend / Gameplay Experience
- **Root Cause**: Options lacked a cohesive state machine (`UNSELECTED -> SELECTED -> CONFIRMED -> SUBMITTED -> RESULT`), allowing accidental double-clicks, and had no zero-latency audio engine for interaction cues.
- **Fix**: Created `apps/web/src/lib/audio/GameAudioManager.ts` utilizing pure Web Audio API synthesis (zero MP3 404 risks) and SpeechSynthesis narration, coupled with strict button state locking.
- **Verification**: Verified in browser with click selection, visual highlight, and successful submission without duplicate requests.

---

## Conclusion
All 14 runtime errors have been forensically identified, addressed with precise code changes in both frontend and backend repositories, and independently verified in live browser runs.

