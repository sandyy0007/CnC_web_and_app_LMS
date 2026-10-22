# Winners Creek — Simulation Lab

An AI Soft Skills Simulation Lab (presentation + interview practice, with a real
evaluation pipeline) built to feel like an assessment-center product, not a
classroom demo.

## Status: Phase 1 of 7

The full spec this was built against describes a 7-phase, 39-section system
(live speech/vision analysis, an adaptive AI interviewer, a scored evaluation
engine, a trainer dashboard with weight configuration, etc.). **This build is
Phase 1, done to a production bar** — not a mockup of the whole thing. See
"What's real vs. what's a placeholder" below for the exact line.

### Integration note — read this first

This was built as a **fresh, standalone codebase**, not layered onto an
existing Winners Creek application. Three separate requests for the actual
Winners Creek repository (a folder to connect, or a GitHub URL) only
returned the two reference repos named in the brief
([iamspeaker](https://github.com/spark798/iamspeaker),
[VoxLab](https://github.com/yaotingchun/VoxLab)) — no existing codebase was
ever reachable. So rather than guess at a host app's routes, auth, RBAC,
schema and design tokens and risk clashing with the real thing, this app
was built self-contained, with every seam where it should plug into
existing infrastructure clearly marked (see the table below). If there is
in fact an existing Winners Creek app, treat this as the module to graft
in, not a replacement.

| Concern | This build | Swap-in point |
|---|---|---|
| Auth | Signed JWT cookie, `lib/auth/session.ts` | Replace `getSession()`'s internals; every caller already goes through this one function |
| RBAC | `lib/auth/rbac.ts` (student/trainer/admin) | Keep or replace the role model; `requireRole`/`requireOwnerOrTrainer` are the only call sites |
| Database | Postgres via Drizzle, `lib/db/schema.ts` (19 tables, spec §28) | Point `DATABASE_URL` at the real database — schema is additive, no conflicting table names expected |
| File storage | Local filesystem, `lib/storage/index.ts` | Swap `putObject`/`getObject`/`deleteObject` for S3/GCS/whatever's already in use |
| Design tokens | CSS variables in `app/globals.css` | Replace values to match the real design system; every component reads tokens, not hex codes |

## What's real vs. what's a placeholder

**Fully working, exercised end-to-end (curl + browser):**
- Sign-in, session cookies, role-gated routes (`/trainer/*` blocked for students)
- Simulation Lab landing page — live progress stats and recent sessions from the database
- Presentation setup wizard (title/type/audience/duration/evaluation mode) with real upload progress
- PPTX and PDF upload → validated → parsed (text + speaker notes) → rendered to slide images
  (LibreOffice headless + poppler `pdftoppm`) → stored → shown in a thumbnail rail + slide viewer
- Preparation screen: real per-deck stats (slide count, target duration, estimated speaking time,
  recommended pace), script mode picker (AI script / own notes / none) that persists
- Live simulation screen: camera/mic capture, 3-2-1 countdown, session timer, pause/resume/end,
  slide navigation with dwell-time event logging, live Web Speech API transcript, MediaRecorder
  video capture, camera/mic toggles, fullscreen, tab-visibility tracking
- On "End Presentation": recording uploaded, deterministic speech metrics computed (WPM, filler
  count/frequency, repeated words, average sentence length) and stored
- Results report: video playback with speed control, slide-event timeline that seeks the video,
  transcript panel, "Practice Again" (creates a new attempt under the same session)
- Session history, and a trainer dashboard listing every student's sessions with a working
  "Review" link into the same report a student sees
- Full authorization: every recording/media byte is served through one auth-checked route;
  ownership checks on every session/attempt mutation; RBAC-gated trainer routes

**Deliberately a labeled placeholder, not faked:**
- AI-generated presentation brief, AI demo narration, AI Q&A, and all *scored* category feedback
  (content/structure/communication/delivery/time/slide-handling) — the spec places these in
  Phase 3 ("AI content evaluation... structured scoring"), and faking a score with no model behind
  it would violate the spec's own "every score should have evidence" bar. The prepare and results
  screens say exactly this instead of inventing numbers.
- The AI Interview Simulator (Phase 4) and full Trainer Dashboard capabilities — weight
  configuration, score overrides, question-bank authoring, batch analytics (Phase 6) — render as
  honest "arriving in Phase N" states via `components/simulation/coming-soon.tsx`, reachable from
  real nav links (no dead ends), rather than being stubbed out silently.
- `lib/analysis/speech.ts` computes real Layer-1 deterministic metrics (spec §12) from the
  transcript today; pause timing from word-level timestamps and pitch/volume variation (needs
  audio-level analysis, not just text) are Phase 2.

## Reference projects

Per the brief, [iamspeaker](https://github.com/spark798/iamspeaker) (MIT license) and
[VoxLab](https://github.com/yaotingchun/VoxLab) (no LICENSE file — all rights reserved by
default) were cloned and inspected before writing any code.

- **Architecture ideas taken from both** (not code): iamspeaker's adapter-pattern approach to AI
  (local-first, cloud as optional upgrade via env var), its per-task prompt separation, its
  background-job framing for post-session analysis, and its screen flow
  (upload → prepare → record → critique → qa → report → compare). VoxLab's route shape
  (`presentation/`, `interview/`, `coach/` as separate concerns) and its use of a dedicated
  WebSocket process for realtime speech informed the Phase 2 plan below.
- **Code actually reused, with attribution** (MIT permits this — iamspeaker only):
  `lib/slides/pptx.ts` (zip+XML text extraction) and `lib/slides/convert.ts`
  (LibreOffice headless PPTX→PDF) are ports of iamspeaker's `lib/slides/pptx.ts` and
  `lib/slides/convert.ts`, credited in file-header comments per the MIT license's attribution
  requirement. `THIRD_PARTY_NOTICES.md` carries the full license text.
- Nothing from VoxLab was copied — it ships with no license file, so only its publicly-visible
  architecture (not its source) was used as a reference.

## Getting started

```bash
cp .env.example .env.local   # already present with local defaults
npm install
npm run db:generate          # only needed if you change lib/db/schema.ts
npm run db:migrate           # applies drizzle/*.sql to DATABASE_URL
npm run db:seed              # creates demo accounts
npm run dev
```

Demo accounts (seeded): `student@winnerscreek.dev` / `student123` and
`trainer@winnerscreek.dev` / `trainer123`.

Requires `soffice` (LibreOffice) and `pdftoppm` (poppler-utils) on PATH for PPTX/PDF slide
rendering; without them, uploads still work but fall back to text-only slides
(`parsePresentation`'s `renderWarning` surfaces this to the UI rather than failing silently).

## Notable implementation decisions

- **Attempts, not just sessions.** `simulation_sessions` is the type-agnostic envelope;
  `simulation_attempts` is one run of it. This is what makes "Practice Again" (spec §18) a plain
  insert instead of a special case — re-practice attempts are just attempt #2, #3... under the
  same session, and results are addressed by attempt id (`/simulation/results/:attemptId`), not
  session id, so each attempt gets its own report.
- **Live metrics are hidden in assessment/placement mode**, matching the spec's interview-section
  guidance ("don't overload the student with scores during assessment") applied consistently to
  the presentation flow too — practice mode shows a running transcript/WPM/filler count, assessment
  modes show only the timer and slide position.
- **Speech recognition is the browser's Web Speech API**, not a cloud STT call — zero marginal
  cost, no audio leaves the browser except in the recorded video file, and it degrades honestly
  (a visible banner, not a silent failure) in browsers that don't support it.
- **One authorized media endpoint** (`/api/media/[...key]`) serves every stored file — slide
  source, slide images, recordings — rather than any kind of public URL, per spec §31.

## What Phase 2+ needs (not built, scoped for continuation)

Phase 2 (pause/pitch/volume analysis, full slide-aware relevance detection) needs audio-level
processing the Web Speech API doesn't expose — `lib/analysis/` is the natural home for it, and
`speech_metrics.raw_metrics` (jsonb) already has room for the richer payload without a migration.
Phase 3 (semantic evaluation, AI brief, Q&A) needs an LLM adapter — `lib/ai/` is scaffolded
structurally in this README's design but not implemented; follow iamspeaker's adapter pattern
(interface + factory + local/cloud swap via `ANTHROPIC_API_KEY`, already read in `lib/config.ts`)
rather than calling a provider SDK directly from route handlers, so evaluation prompts stay
swappable and testable with a stub adapter.
