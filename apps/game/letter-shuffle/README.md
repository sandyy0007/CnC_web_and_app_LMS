# Letter Shuffle: Word Builder

Slug: `letter-shuffle`. Category: Vocabulary & Professional Polish. EEDI codes: COM02, COM05. 10 minutes, 175 XP.

The player sees scrambled letter tiles and a clue, then picks the one candidate word that uses exactly those letters. Longer words are worth more. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- The clue banner and the letter tiles sit at the top. A Shuffle button rearranges the tiles, free and unlimited. It is purely visual and nothing is sent to the server.
- Below are four candidate words. Tap one, or press keys 1 to 4, to submit it.
- After the answer the tiles re-form into the correct word when the server reveals it, or when the player was right.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15.
- There is no continuous animation, so nothing needs a reduced-motion variant.
- The streak badge is cosmetic and never changes the score.

## Why no tile tray

A tray that checks the built word against the options would act as an answer checker, so the tiles stay a visual aid.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `passage` | The letters separated by spaces, for example `B U D G E T`. |
| `scenario` | A one-line clue. |
| `question` | A fixed instruction, `Which word can be made from all of these letters?`. |
| `option_0` to `option_3` | One exact anagram plus three near misses (a letter swapped, missing or added). |
| `weight` | By length, echoing "longer words score more": 5 to 6 letters 1.0, 7 to 8 letters 1.5, 9 or more 2.0. |

Authoring checks:

- No distractor may be a real word made from the same letters (team, meat and mate would clash), and no distractor may use the same letters as the answer. Keep target words at 6 letters or more and test each distractor.
- Avoid targets that have a second real anagram (for example report and porter, or customer and costumer).
- Vary `correct_option` across rows. This sample has 6 rows (2 per tier) as the guide requires; publish with at least 12 per tier or a session ends after about six questions.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the timer runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, totalMs)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the result and skips the question with no penalty instead.
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
