# Integration notes

## Easiest option: link or embed

Deploy this service, then link to `/` from the main website. It can also be placed in an iframe. The page is responsive and keeps its own routes, styles, and state.

## Integrate only the frontend

Copy `frontend/` into the host website's public/static folder. Change the `API` constant at the top of `frontend/app.js` to the deployed API base URL. If hosted on another domain, add CORS middleware to FastAPI and allow only the main website's origin.

## Integrate into React/Next.js

Port the three screen sections from `index.html` into components. Keep the scenario format and API contracts unchanged. The game state in `app.js` maps directly to component state; no framework-specific dependency is required.

## Authentication

The app intentionally has no separate login. The host website should send its existing anonymized learner ID in the results payload. Validate the host session server-side before accepting it in production.

## EEDI completion event

`POST /api/results` returns a normalized payload:

```json
{
  "event": "email_game.completed",
  "version": "1.0",
  "learner_id": null,
  "activity": "escape",
  "metrics": {
    "score": 850,
    "duration_seconds": 150,
    "accuracy": 100,
    "satisfaction": 95,
    "hints_used": 1,
    "attempts_used": 0
  },
  "skills": {"Clarity": 90, "Empathy": 95}
}
```

Forward this event to the main platform's analytics or learner-progress service after authenticating the request. In production, replace the anonymous browser player ID with the platform's authenticated user ID, so each learner's 15-level progress remains separate. Do not trust client-provided scores for high-stakes assessment; recalculate answers on the server if that becomes a requirement.

## Editing game content

Update `data/scenarios.json`. Add cases inside each game's `missions` array. Supported mechanics are `scanner`, `dials`, `forge`, `evidence`, `order`, `calendar`, and `compose`. Writing challenges use `keywords` and `minWords`; the other mechanics carry their own target or solution data. Restart the server after editing.

## Production checklist

1. Put the service behind HTTPS.
2. Connect the host website's authentication.
3. Replace SQLite with the host database only if concurrent usage requires it.
4. Configure approved CORS origins only when frontend and API use different domains.
5. Add server-side score verification if scores affect grades, rewards, or certificates.
