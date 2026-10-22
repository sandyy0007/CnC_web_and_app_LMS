# Word Match Rush: Meaning Match

Slug: `word-match-rush`. Category: Vocabulary & Professional Polish. EEDI codes: COM02, COM04, COM05. 10 minutes, 150 XP.

The player drags one of four meaning cards onto a workplace vocabulary term before the timer ring empties. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- The term is shown large with an example sentence under it. Four meaning cards sit below.
- Drag a card onto the term, or tap a card and then tap the term. Keys 1 to 4 answer instantly.
- A correct card turns green; a wrong card turns red. The server explanation is shown for about 1.2 seconds, then the next question appears.
- Seconds per question follow the adaptive tier from `props.level`: BEGINNER 20, INTERMEDIATE 15, ADVANCED 12.
- The streak badge is cosmetic and never changes the score.
- Animation uses `motion-safe:` only, so reduced-motion users see colour changes without movement.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `question` | The term alone, for example `imminent`. The UI supplies the "Match the meaning" instruction. |
| `scenario` | One example sentence that uses the term. |
| `passage` | Unused, leave `""`. |
| `option_0` to `option_3` | Four meanings, 70 characters or fewer, similar length. |
| `weight` | Term difficulty: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Vary `correct_option` across rows. This sample has 6 rows (2 per tier) as the guide requires; publish with at least 12 per tier or a session ends after about six questions.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** On expiry the game emits `TIMEOUT` and calls `submitAnswer(-1, totalMs)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted. Answer events are left to the engine to avoid double logging.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown.
- `hooks/useQuestionTimer.ts`: per-question timer, kept local so games never import each other.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
