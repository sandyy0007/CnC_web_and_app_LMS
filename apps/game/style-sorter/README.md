# Style Sorter: Four Ways to Say It

Slug: `style-sorter`. Category: Critical Thinking & Leadership (see assumption 6). EEDI codes: BEH09, COM05, BEH08. 10 minutes, 175 XP.

A workplace reply sits on a card under a short situation. The player sorts it into one of four bins: Assertive, Passive, Aggressive or Passive-aggressive. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Drag** the reply card into a bin, **tap** a bin, or press **1 to 4**. Dragging is a convenience: tap and keys do exactly the same thing, so the game is fully playable without a pointer drag. A bin lights up while the card hovers over it; letting go outside a bin snaps the card back.
- After the answer the correct bin turns green, a wrong pick turns red, and the server explanation is shown.
- Time per card follows the adaptive tier from `props.level`: BEGINNER 20 seconds, INTERMEDIATE 16, ADVANCED 12.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The situation, for example `A colleague keeps talking over you in meetings.` |
| `question` | The reply to sort, written without quote marks (the game adds them). |
| `option_0` to `option_3` | The four bin names, up to 24 characters. Keep the same order in every row (Assertive, Passive, Aggressive, Passive-aggressive) so players learn where each bin is. A row may use another set of four bins, for example Listening, Interrupting, Distracted, Dismissive. |
| `passage` | Not used. Leave empty. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one right bin, with an explanation that names the tell (for example "the praise hides an accusation").
- Beginner replies use obvious wording; advanced replies are short and differ by one phrase (passive versus passive-aggressive).
- Workplace settings only, invented names, no real people or companies.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Option shuffling.** The game assumes the server keeps the option order from the CSV. If options are shuffled per question the bins will move between cards; the game still works but is harder to learn.
6. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no social-skills category is known to exist.
7. **Drag and drop.** Dragging uses pointer events (`onPointerDown`, `onPointerMove`, `onPointerUp`) and `getBoundingClientRect`. Check that the AST security scan accepts them; if not, delete the three drag handlers and the card still works through taps and keys.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown beside the situation.
- `hooks/useQuestionTimer.ts`: countdown, kept local so games never import each other.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
