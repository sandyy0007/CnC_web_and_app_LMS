# Spell Express: The Conveyor Challenge

Slug: `spell-express`. Category: Vocabulary & Professional Polish. EEDI codes: COM08, COM02, COM05. 8 minutes, 150 XP.

Four plates ride a conveyor belt, each carrying one spelling of a word, and the player grabs the correct one before the belt runs out. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- A sentence with a gap sits at the top. Four lanes below each carry one plate, in option order. All four plates move at the same speed and reach the end together, so no plate leaves early and position gives no hint.
- Tap a plate, or drag it to the serving tray. Keys 1 to 4 grab a plate. The blank fills in with the correct word after the answer.
- Belt travel time follows the adaptive tier from `props.level`: BEGINNER 15 seconds, INTERMEDIATE 12, ADVANCED 9.
- With reduced motion enabled the plates stay put and only the timer ring counts down.
- The streak badge is cosmetic and never changes the score.

## Why plates, not typing

The original game asks players to spell words. This engine grades by option index, and typed answers would need a contract change, so the player picks the correct spelling instead.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | A sentence with `___` where the word goes. |
| `question` | A fixed instruction, `Which spelling is correct?`. |
| `passage` | Unused, leave `""`. |
| `option_0` to `option_3` | One correct spelling plus three realistic misspellings (doubled letters, swapped vowels, dropped letters). |
| `weight` | How hard the word is to spell: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Vary `correct_option` across rows. This sample has 6 rows (2 per tier) as the guide requires; publish with at least 12 per tier or a session ends after about six questions.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the belt runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, totalMs)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the result and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted. Answer events are left to the engine to avoid double logging.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown.
- `hooks/useQuestionTimer.ts`: per-question timer, kept local so games never import each other.
- `hooks/usePrefersReducedMotion.ts`: reads the reduced-motion setting.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
