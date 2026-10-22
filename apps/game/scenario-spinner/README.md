# Scenario Spinner: Spin & Respond

Slug: `scenario-spinner`. Category: Critical Thinking & Leadership (see assumption 6). EEDI codes: BEH08, BEH01, PRB04. 10 minutes, 175 XP.

Each question starts with a wheel of workplace settings. The player presses Spin, the wheel stops on the setting of the current question, and the situation and four response cards appear. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

1. **Spin.** One button, focused automatically, reads "Spin to reveal your next setting". The wheel turns for 1.8 seconds. With reduced motion it jumps straight to the result.
2. **Respond.** The situation and four numbered response cards appear. Keys 1 to 4 pick a card. The answer clock starts here, and `QUESTION_SHOWN` is emitted at this moment, so `responseTimeMs` never includes the spin.
3. **Feedback.** The correct card turns green, a wrong pick turns red, and the server explanation is shown.

Time per question follows the adaptive tier from `props.level`: BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15. The streak badge is cosmetic and never changes the score.

### The wheel is a reveal, not a random draw

The server chooses the question order, so the wheel cannot change which question comes next. It always stops on the setting named in the question, and the button says "reveal" for that reason. Do not describe the wheel as random to players.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `passage` | Exactly one of: `Meeting`, `Email`, `Break room`, `Client call`, `Feedback chat`, `Team chat`. Any other value (or empty) lands on a seventh neutral `Office` segment. |
| `scenario` | The situation in one or two sentences. |
| `question` | `What do you do?` or `What do you say?` |
| `option_0` to `option_3` | Four responses, up to 70 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one best response, with an explanation that says why in one sentence.
- Each wrong response fails for a named reason: too passive, too aggressive, passive-aggressive, evasive or unethical. No joke options.
- Workplace settings only, invented names, no real people or companies.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Session time.** Every question adds a spin of about 2 seconds plus reading time before the clock starts. Check that the 10-minute `timeLimitSeconds` still gives enough questions.
6. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no social-skills category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown beside the situation.
- `hooks/useQuestionTimer.ts`: countdown that can be held back until the wheel stops.
- `hooks/usePrefersReducedMotion.ts`: skips the spin animation when the player asks for less motion.
- `utils/wheel.ts`: wheel segments, stopping angle and slice geometry.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
