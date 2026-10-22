# Table Topics: Structure Sprint

Slug: `table-topics`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM07, CNF04, COM05. 10 minutes, 175 XP.

A topic card is drawn. On easier levels a structure hint names the plan shape to use. The player picks the speaking plan that gives the answer the best start, middle and close. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Pick** a plan by tapping it or pressing **1 to 4**. Each plan is shown as numbered step chips, for example Point, Reason, Example, Point.
- The topic card flips face up when the question appears (it is face up at once with `prefers-reduced-motion`). The clock starts immediately.
- After the answer the best plan turns green, a wrong pick turns red, and the server explanation says what the weaker plans get wrong.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 30 seconds, INTERMEDIATE 24, ADVANCED 18.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Speak for 15 seconds, following the plan you picked."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The structure hint, for example `Use Point, Reason, Example, Point.` Leave empty on ADVANCED rows to remove the hint. |
| `passage` | Not used. Leave empty. |
| `question` | The topic, for example `Should our team meet less often?` |
| `option_0` to `option_3` | Four speaking plans, steps separated by ` > `, each step optionally `Label: words`. Up to 130 characters per plan and 40 per step. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one plan is well structured. Weak plans each fail one way: repeat one element, never take a stand, run the steps out of order, or bury the point.
- When the hint names a structure, the right plan follows it. On ADVANCED rows the player must choose the shape without a hint.
- Keep plans to similar lengths (3 to 4 steps) so the longest option is not a giveaway.
- Explanations must not refer to option numbers: the engine may shuffle options.
- Topics are everyday workplace questions. No personal, political or sensitive prompts.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the 'duration' shown in the catalogue.
6. **Card flip.** The flip uses Tailwind arbitrary properties (`[perspective:900px]`, `[backface-visibility:hidden]`). Check they are enabled in the LMS Tailwind config and that the flip looks right in Safari.
7. **Small screens.** Four plans of up to four chips each wrap onto several lines. Check the layout on a 320 px wide phone with 130-character plans.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/steps.ts`: splits a plan into labelled step chips and builds the screen-reader description.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
