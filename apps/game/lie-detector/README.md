# Lie Detector: Listen for the Slip

Slug: `lie-detector`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM06, PRB01, BEH01. 10 minutes, 175 XP.

A colleague tells their story. A panel lists the facts the listener already knows, and four statements follow. The player flags the one that contradicts the facts while a polygraph trace wobbles on the clock. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Flag** a statement by tapping it or pressing **1 to 4**.
- The polygraph trace gets wilder as time runs out. With `prefers-reduced-motion` it is a flat line.
- After the answer the contradicting statement carries a **SLIP** badge, a wrong pick turns red, and the server explanation says which known fact it breaks.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Explain aloud why that statement does not fit the facts."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | Who is speaking, for example `Nadia describes her Monday.` |
| `passage` | The known facts, separated by ` | `, each optionally prefixed `Known:` (the prefix is removed on screen). |
| `question` | `One statement does not fit. Which one?` |
| `option_0` to `option_3` | Four statements the speaker made, up to 70 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one statement contradicts the known facts; the other three are consistent with them and with each other.
- The contradiction must follow from the facts shown, never from outside knowledge. Explanations name the fact that is broken.
- Beginner rows break one fact directly. Intermediate and advanced rows use dates or sequences across two facts.
- This trains careful listening, not accusing people of lying. Keep wording neutral and workplace-only, with invented names.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the 'duration' shown in the catalogue.
6. **Polygraph trace.** The trace is drawn from the countdown (`utils/facts.ts`, `tracePoints`) and is purely cosmetic. Check that a re-render about every animation frame is acceptable on low-end phones.
7. **Small screens.** Facts, strip and four statements stack in one column. Check the layout on a 320 px wide phone with two long facts.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/facts.ts`: parses the facts column and builds the polygraph trace points.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
