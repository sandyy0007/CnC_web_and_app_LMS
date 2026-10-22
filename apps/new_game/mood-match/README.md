# Mood Match: Read the Room

Slug: `mood-match`. Category: Critical Thinking & Leadership (see assumption 6). EEDI codes: COM06, BEH10, CNF02. 10 minutes, 150 XP.

A short workplace situation about a colleague is shown on a card. The player pulls a rope from the card to the feeling the colleague most likely has. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Drag** the purple handle on the situation card to one of the four feeling pads, **tap** a pad, or press **1 to 4**. Dragging is a convenience: tap and keys do exactly the same thing, so the game is fully playable without a pointer drag. The pad under the rope lights up; letting go outside a pad drops the rope.
- The rope stays drawn to the chosen pad and turns green when correct or red when wrong. The correct pad is highlighted green and the server explanation is shown.
- Feelings are always words, never faces alone, so the game does not depend on reading facial expressions.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 22 seconds, INTERMEDIATE 18, ADVANCED 14.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The situation, written about a colleague with a made-up first name. Put the cues that decide the answer here (what was said, what was not). |
| `question` | The prompt, for example `How is Dev most likely feeling?` |
| `option_0` to `option_3` | Four feeling words, up to 24 characters. Beginner rows use clearly different feelings; advanced rows use neighbours such as annoyed, resentful and hurt. |
| `passage` | Not used. Leave empty. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- "Most likely" must have one defensible answer. Put the deciding cue in the situation, and name it in the explanation.
- Never attribute a feeling to age, religion, caste, gender, health or origin.
- Workplace settings only, invented names, no real people or companies.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing. Feelings are the easiest place for two reasonable people to disagree.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Drag and drop.** Dragging uses pointer events and `getBoundingClientRect`. Check that the AST security scan accepts them; if not, delete the three handle handlers and the game still works through taps and keys.
6. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no social-skills category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown beside the heading.
- `hooks/useQuestionTimer.ts`: countdown, kept local so games never import each other.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
