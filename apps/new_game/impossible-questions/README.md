# Impossible Questions: Answer With Total Confidence

Slug: `impossible-questions`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: CNF02, CNF04, PRB04. 8 minutes, 150 XP.

**Modelled on:** Impossible Questions (silly questions) on speaking.games (page `/impossible-questions`), inspected live.

An absurd question with no true answer. The player picks the reply that is delivered with total confidence. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you pick a format with a slider (1 question for 60 seconds, 2 for 30, 3 for 20, 4 for 15, 5 for 12 or 6 for 10 seconds each, from "deep dive" to "rapid fire"), optionally record, press Start Quiz and answer each absurd question with total confidence. Any answer counts, and at the end there is a moment of self-reflection. The plugin keeps the absurd questions and the "any answer is correct" rule on screen, then grades the one thing the site asks of you: confidence. The correct reply is specific and committed; the wrong ones hedge, dodge, stall or refuse. Tiers copy the site formats (BEGINNER 20 seconds like 3 x 20, INTERMEDIATE 15 like 4 x 15, ADVANCED 10 like 6 x 10). The self-reflection moment is the server explanation after each answer.

## How it plays

- **Pick** a reply by tapping it or pressing **1 to 4**.
- A banner reminds the player that any answer is allowed; what is graded is whether the reply is committed.
- After the answer the confident reply turns green, a wrong pick turns red, and the server explanation says what made the others timid.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 20 seconds, INTERMEDIATE 15, ADVANCED 10.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Say your answer out loud with total confidence. No hedging."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | Not used. Leave empty. |
| `passage` | Not used. Leave empty. |
| `question` | The absurd question, for example `How many clouds fit inside a teacup?` |
| `option_0` to `option_3` | Four replies, up to 110 characters each. One is specific and committed; the others hedge ("maybe", "I think"), dodge, stall or refuse. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Never mark an answer wrong for being silly or factually false; the question has no true answer. Mark it wrong only for hedging, dodging or refusing.
- Explanations name the confidence marker (a number, a name, a certainty) and the hedge in the weaker replies.
- Absurd questions only, with no personal, political or sensitive content.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **"Any answer is correct".** The site accepts every answer. This plugin grades confidence, which is a design choice: check that learners are told the rule on screen (the banner does).
7. **Self-reflection.** The site ends with a reflection moment. Here it is the explanation after each answer; there is no separate end screen because `GameRunner` shows the Report Card.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
