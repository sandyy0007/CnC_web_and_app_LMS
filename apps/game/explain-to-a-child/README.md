# Explain to a Child: Explain It Like I'm 5

Slug: `explain-to-a-child`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM05, COM01, COM02. 8 minutes, 150 XP.

**Modelled on:** Explain to a Child (Explain Like I'm 5) on speaking.games (page `/explain-to-a-child`), inspected live.

A concept card with a category and a hint. The player picks the explanation a five-year-old could follow. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you pick a topic category (Everyday, Science or Abstract), set a time (30 seconds to 2 minutes), press Start to see a concept with a short hint (for example a natural phenomenon with the hint "Ocean rising and falling"), and explain it as if to a five-year-old, with simple words, analogies and examples, and no jargon. The plugin keeps the three categories (by tier: Everyday for BEGINNER, Science for INTERMEDIATE, Abstract for ADVANCED), the concept card with its hint and the no-jargon rule. The explanation you would speak becomes four written explanations, and the player picks the one a five-year-old could follow. After the answer each option shows its average word length, a rough reading-level hint (the shorter the words, the simpler the explanation, though it is only a hint).

## How it plays

- **Pick** an explanation by tapping it or pressing **1 to 4**.
- The category chip (Everyday, Science, Abstract) follows the tier, as on the site.
- After the answer each explanation shows its average word length; the best one turns green, a wrong pick turns red, and the server explanation says why.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Explain the concept out loud to a five-year-old. Use simple words and one example."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The hint, for example `Hint: Ocean rising and falling`. |
| `passage` | Category and concept as `Category | Concept`, with the category one of `Everyday`, `Science`, `Abstract`. |
| `question` | `Which explanation could a five-year-old follow?` |
| `option_0` to `option_3` | Four explanations, up to 120 characters each. One uses simple words and a picture or example; the others use jargon, are wrong, are circular, or dodge. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one explanation is both correct and child-friendly. A simple but wrong explanation is a good distractor; so is a correct one full of jargon.
- Do not make the right answer the shortest option every time: the average-word-length hint would give it away.
- Everyday and Science concepts are factual and checkable. Abstract concepts (inflation, democracy) need a reviewer to confirm the explanation is fair.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **Reading-level hint.** Average word length is a crude measure shown only as a hint after the answer. It is not used for scoring.
7. **Small screens.** Four 120-character explanations stack in one column. Check a 320 px wide phone.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/concept.ts`: splits the passage into category and concept, maps the category to its icon and computes average word length.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
