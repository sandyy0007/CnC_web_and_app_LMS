# Winners Creek LMS — Next.js Static Asset & Runtime Blank Page Resolution Report

**Date:** October 7, 2026  
**Final Status:** **STATIC ASSETS: VERIFIED**  
**Server Mode:** `next dev -p 3000` (Clean Process Tree)  
**Host & Port:** `http://localhost:3000`  
**Backend Host & Port:** `http://127.0.0.1:8000`  

---

## 1. Exact Root Cause

The blank page failure and stylesheet MIME type mismatch were caused by an **out-of-sync Next.js build cache state colliding with a running development server process**:

1. A background development server process (`next dev -p 3000`, PID `4384` / `34244`, parent PID `17808`) was actively running and listening on port 3000.
2. An `npm run build` command was executed in `apps/web`.
3. `next build` wiped and replaced `apps/web/.next` on disk with production hashed assets (e.g. `.next/static/chunks/4bd1b696-*.js`, `.next/server/app/*`, `BUILD_ID`).
4. The running `next dev` process held development chunk manifests in memory, continuing to serve development HTML containing links to development chunks:
   - `/_next/static/css/app/layout.css?v=...`
   - `/_next/static/chunks/app-pages-internals.js`
   - `/_next/static/chunks/app/error.js`
   - `/_next/static/chunks/app/layout.js`
   - `/_next/static/chunks/app/(auth)/layout.js`
   - `/_next/static/chunks/app/(public)/layout.js`
   - `/_next/static/chunks/app/(public)/page.js`
5. When the browser requested these files from `http://localhost:3000`, the server looked for them in `apps/web/.next/static/`, where they no longer existed because `next build` had deleted all unhashed development artifacts.

---

## 2. Why CSS Returned `text/html` & JS Chunks Returned 404

In Next.js, when an asset request under `/_next/static/*` cannot be found on the filesystem:
1. The static file middleware fails to resolve the file on disk.
2. The request falls through to the Next.js App Router.
3. The App Router routes the unmatched path to the root layout / not-found handler, returning an HTTP 404 HTML document with header:
   ```http
   Content-Type: text/html; charset=utf-8
   ```
4. When the browser attempts to parse this 404 HTML document as a stylesheet, Chrome and other Chromium browsers abort and throw the console security error:
   ```text
   Refused to apply style from 'http://localhost:3000/_next/static/css/app/layout.css' because its MIME type ('text/html') is not a supported stylesheet MIME type.
   ```
5. Similarly, when the browser attempts to execute the 404 HTML document as JavaScript, the JavaScript engine fails at the first character (`<` of `<!DOCTYPE html>`) with:
   ```text
   Uncaught SyntaxError: Unexpected token '<'
   ```
6. Because all scripts and stylesheets failed to load, React failed to hydrate, leaving the page completely blank.

---

## 3. Findings Across Application Layers

### A. Multiple Processes & Process Tree
Inspection of listening ports using `netstat -ano` and `Win32_Process`:
- Port 3000 was held by PID `34244` (`next start-server.js`), spawned by PID `4384` (`next dev -p 3000`), spawned by PID `17808` (`npm run dev`).
- Stale processes were successfully terminated via `taskkill /F /PID 17808 /PID 4384 /PID 34244 /T`.

### B. Build Cache Inspection (`apps/web/.next`)
- After terminating the stale processes, the mixed `.next` directory was completely removed.
- A clean Next.js server was booted, which recompiled all development chunks and manifests synchronously.

### C. `next.config.mjs`
Inspection revealed a custom webpack override that modified server chunk names:
```javascript
webpack: (config, { isServer }) => {
  if (isServer) {
    config.output.chunkFilename = 'chunks/[name].js';
  }
  return config;
}
```
This custom override was removed to ensure full standard Next.js 15 chunk resolution compatibility across both client and server runtime environments.

### D. Middleware Inspection
- Confirmed there is **no** `middleware.ts` in `apps/web/src` intercepting or redirecting static assets under `/_next/static/*`.

### E. Service Worker / PWA Inspection
- Confirmed no service worker (`sw.js` / Workbox / `next-pwa`) was caching stale HTML or intercepting static chunks.

---

## 4. Actual HTTP Static Asset Verification

A diagnostic script was executed against the running clean Next.js instance on `http://localhost:3000`. Every stylesheet and script tag in the generated HTML was requested and verified:

```text
=======================================================
TESTING ROUTE: http://localhost:3000/
=======================================================
HTML Status: 200 (text/html; charset=utf-8)
Discovered 2 CSS stylesheets.
  [CSS] /_next/static/css/app/layout.css?v=1791368211202 -> 200 | text/css; charset=UTF-8
  [CSS] /_next/static/css/app/(public)/page.css?v=1791368211202 -> 200 | text/css; charset=UTF-8
Discovered 9 JavaScript chunks.
  [JS]  /_next/static/chunks/main-app.js?v=1791368211202 -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app-pages-internals.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/error.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/layout.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/not-found.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/(public)/layout.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/(public)/page.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/polyfills.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/webpack.js?v=1791368211202 -> 200 | application/javascript; charset=UTF-8

=======================================================
TESTING ROUTE: http://localhost:3000/student/games
=======================================================
HTML Status: 200 (text/html; charset=utf-8)
Discovered 1 CSS stylesheets.
  [CSS] /_next/static/css/app/layout.css?v=1791368214859 -> 200 | text/css; charset=UTF-8
Discovered 9 JavaScript chunks.
  [JS]  /_next/static/chunks/main-app.js?v=1791368214859 -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app-pages-internals.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/error.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/layout.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/not-found.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/student/layout.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/app/student/games/page.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/polyfills.js -> 200 | application/javascript; charset=UTF-8
  [JS]  /_next/static/chunks/webpack.js?v=1791368214859 -> 200 | application/javascript; charset=UTF-8

=======================================================
TESTING ROUTE: http://localhost:3000/trainer/dashboard
=======================================================
HTML Status: 200 (text/html; charset=utf-8)
Discovered 1 CSS stylesheets.
  [CSS] /_next/static/css/app/layout.css?v=1791368220820 -> 200 | text/css; charset=UTF-8
Discovered 9 JavaScript chunks: All 9 returned 200 | application/javascript; charset=UTF-8

=======================================================
TESTING ROUTE: http://localhost:3000/admin/dashboard
=======================================================
HTML Status: 200 (text/html; charset=utf-8)
CSS & JS Chunks: All 10 returned 200 with proper MIME types

=======================================================
TESTING ROUTE: http://localhost:3000/hod/dashboard
=======================================================
HTML Status: 200 (text/html; charset=utf-8)
CSS & JS Chunks: All 10 returned 200 with proper MIME types

=======================================================
TESTING ROUTE: http://localhost:3000/trainer/games
=======================================================
HTML Status: 200 (text/html; charset=utf-8)
CSS & JS Chunks: All 10 returned 200 with proper MIME types

TOTAL ASSETS TESTED: 61
FAILURES COUNT: 0
```

---

## 5. End-to-End System & Authentication Verification

With static asset serving resolved, authentication flows and API proxying via `http://localhost:3000/api/v1/*` were tested:

1. **Trainer Login**: `r.bose@abcengg.edu` / `Eedi@2026` via Next.js proxy -> **HTTP 200 OK**.
2. **Trainer Batches**: `GET /api/v1/trainer/batches` via Next.js proxy -> **HTTP 200 OK**, returned 2 active batches (`CSE 2027 - A` and `CSE 2027 - B`).
3. **Participant Login**: `alex.johnson@eedi.com` / `Eedi@2026` via Next.js proxy -> **HTTP 200 OK**.
4. **Participant Games**: `GET /api/v1/student/games` via Next.js proxy -> **HTTP 200 OK**, displaying assigned scenario challenge with deadline and badge.
5. **Trainer Game Assignment & Duplicate Protection**: Full test flow executed via `verify_assignment_flow.py` -> **7/7 checks passed (100% PASS)**.

---

## 6. Summary of Files Changed

| File | Change Description |
| :--- | :--- |
| `apps/web/next.config.mjs` | Removed custom `config.output.chunkFilename` webpack override to standardize chunk generation. |
| `apps/web/.next` | Removed corrupt/stale mixed dev/prod build artifacts. |
| `apps/web/src/app/trainer/games/page.tsx` | Enhanced assign modal with loading, empty, retry error banner, and toast feedback. |
| `apps/web/src/app/student/games/page.tsx` | Added assigned task badge and deadline indicator on game cards. |

