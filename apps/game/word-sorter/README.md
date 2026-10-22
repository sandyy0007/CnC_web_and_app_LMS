# Word Sorter: Tone & Category Bins

Slug: `word-sorter`. Category: Vocabulary & Professional Polish. EEDI codes: COM02, BEH08, COM05. 10 minutes, 175 XP.

A workplace phrase falls from the top and the player drops it into one of four labelled bins before it hits the floor. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- A banner shows the sorting rule, for example "Sort by tone". The four bins at the bottom are the four answer options.
- Drag the falling card into a bin, or tap a bin. Keys 1 to 4 pick a bin.
- Bin labels and the banner change every question, because the server picks questions in random order.
- Fall time follows the adaptive tier from `props.level`: BEGINNER 14 seconds, INTERMEDIATE 11, ADVANCED 8.
- With reduced motion enabled the card stays at the top and only the timer ring counts down.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `question` | The falling word or phrase. |
| `scenario` | The sorting rule shown as the banner, for example `Sort by tone: how will many readers hear this?`. |
| `passage` | Unused, leave `""`. |
| `option_0` to `option_3` | Four bin labels, 22 characters or fewer. |
| `weight` | How subtle the sort is: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Vary `correct_option` across rows. This sample has 6 rows (2 per tier) as the guide requires; publish with at least 12 per tier or a session ends after about six questions.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the card reaches the floor the game emits `TIMEOUT` and calls `submitAnswer(-1, totalMs)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the result and skips the question with no penalty instead.
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
