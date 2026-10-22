# Chat Reply: Say the Right Thing

Slug: `chat-reply`. Category: Critical Thinking & Leadership (see assumption 6). EEDI codes: BEH08, COM06, COM05. 10 minutes, 150 XP.

A workplace chat thread is shown as message bubbles, with a typing line waiting for the player. Four reply chips sit underneath. Picking one sends it into the thread as the player's own bubble. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- Read the thread, then pick the reply that is clear, respectful and moves things forward. Keys 1 to 4 also pick a reply.
- After the answer the correct reply is highlighted green, a wrong pick is red, and the server explanation is shown.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 30 seconds, INTERMEDIATE 24, ADVANCED 18.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | Setting line shown above the prompt, for example `Team chat, Tuesday morning`. |
| `passage` | The thread as `Name: text \| Name: text`. The first `:` in a message splits the name (up to 24 characters) from the text. A line starting `Me:` is shown as the player's own earlier message. Do not use `\|` inside a message. |
| `question` | The prompt, for example `What do you send next?` |
| `option_0` to `option_3` | Four replies, up to 70 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one best reply, with an explanation that says why in one sentence.
- Each wrong reply fails for a named reason: too passive, too aggressive, passive-aggressive, evasive or off-topic. No joke options.
- Workplace settings only, invented names, no real people or companies.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted. Answer events are left to the engine to avoid double logging.
5. **Failed save.** If a real answer fails to save, the chip row unlocks and the player can try again.
6. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no social-skills category is known to exist. Changing it needs the owner's decision.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `hooks/useQuestionTimer.ts`: countdown, kept local so games never import each other.
- `utils/thread.ts`: parses the `passage` column into chat messages.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
