# Red-Flag Pop: Pop the Problem

Slug: `red-flag-pop`. Category: Critical Thinking & Leadership (see assumption 6). EEDI codes: BEH01, BEH08, BEH09. 8 minutes, 150 XP.

Four balloons rise toward a spiked ceiling, each tied to a short workplace behaviour. The prompt tells the player what to pop, usually the red flag. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Pop** a balloon by tapping it or pressing **1 to 4**.
- The balloons climb at the speed of the countdown and the top row touches the ceiling exactly when time runs out. That counts as a timeout.
- After the answer the popped balloon shows POP!, the correct label turns green, a wrong pick turns red, and the server explanation is shown.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 20 seconds, INTERMEDIATE 15, ADVANCED 11.
- Balloons sway gently. With `prefers-reduced-motion` the sway stops and the balloons climb in one-second steps instead of gliding.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | Where this happens, for example `In a team meeting.` |
| `question` | The pop instruction: `Pop the red flag.` or `Pop the best response.` |
| `option_0` to `option_3` | Four behaviours, up to 60 characters each (they wrap under the balloons). |
| `passage` | Not used. Leave empty. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one right balloon, with an explanation that names the problem in one sentence.
- Beginner rows have one clearly wrong behaviour among three clearly fine ones. Intermediate red flags look like diligence (reply all). Advanced rows cover ethics and confidentiality.
- Use the same instruction for all four options: do not mix "red flag" and "best" wording inside one row.
- Workplace settings only, invented names, no real people or companies.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the balloons reach the ceiling the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Small screens.** The play area is a fixed 30rem tall. Check the layout on a 320 px wide phone with the longest 60-character behaviours.
6. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no social-skills category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `hooks/useQuestionTimer.ts`: countdown that also drives the balloon climb.
- `hooks/usePrefersReducedMotion.ts`: stops the sway and glide when the player asks for less motion.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
