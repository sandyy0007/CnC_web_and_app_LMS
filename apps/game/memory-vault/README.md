# Memory Vault: Watch & Recall

Slug: `memory-vault`. Category: Vocabulary & Professional Polish. EEDI codes: COM04, COM02, COM05. 12 minutes, 200 XP.

Word-and-meaning cards are shown briefly and flip face down, then the player answers a recall question from memory. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

Each question has two phases.

1. **Memorise.** The `passage` renders as 4 to 6 cards face up under a countdown bar. The player can press "I am ready" to skip ahead; there is no bonus for skipping.
2. **Recall.** The cards flip face down, the question appears and a 15-second answer clock starts. `QUESTION_SHOWN` is emitted at this moment, and `responseTimeMs` is measured from here, so study time never counts against the speed bonus.

After the answer the cards turn face up again with the correct word highlighted, so every question also teaches.

- Study time follows the adaptive tier from `props.level`: BEGINNER 12 seconds, INTERMEDIATE 9, ADVANCED 6.
- Keys 1 to 4 pick an option during recall.
- The streak badge is cosmetic and never changes the score.

## Why each question carries its own cards

The server picks questions in random order, so a game cannot keep one card set across several questions. List size is set by the author per tier: 4 cards for BEGINNER, 5 for INTERMEDIATE, 6 for ADVANCED.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `passage` | Pairs written as `word = meaning \| word = meaning`. The first `=` in a pair splits word from meaning; `\|` separates pairs. Do not use either character inside a word or meaning. |
| `scenario` | A one-line instruction, for example `Remember each word and its meaning.` |
| `question` | The recall prompt, for example `Which word meant honest and direct?` |
| `option_0` to `option_3` | Four words, all taken from the list, so vocabulary knowledge alone cannot replace recall. |
| `weight` | Rises with list size: 4 cards 1.0, 5 cards 1.5, 6 cards 2.0. |

Authoring checks:

- The meaning in the question must match exactly one word on the list.
- Every option must be a word on the list.
- Vary `correct_option` across rows. This sample has 6 rows (2 per tier) as the guide requires; publish with at least 12 per tier or a session ends after about six questions.

## Accepted risk

The passage stays in the question payload during recall, so a determined player could read it in the browser. That is acceptable for low-stakes practice.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the answer clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, 15000)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the result and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted. Answer events are left to the engine to avoid double logging.
5. **Time limit.** Every question takes up to study time plus 15 seconds, so at BEGINNER about 27 seconds. Check that the 12-minute `timeLimitSeconds` gives enough questions for a full session.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown for the answer phase.
- `hooks/useQuestionTimer.ts`: timer used for both phases, kept local so games never import each other.
- `utils/pairs.ts`: parses the `passage` column into word and meaning pairs.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
