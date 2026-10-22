# Analogy Machine: Like a ... Because ...

Slug: `analogy-machine`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: PRB01, COM02, COM01. 8 minutes, 150 XP.

**Modelled on:** Analogy Machine on speaking.games (page `/analogy-machine`), inspected live.

Two random objects drop out of the machine into the frame "A is like B because ...". The player picks the ending that is true of both and makes a point. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you set the time per analogy (default 5 seconds) and the number of rounds (default 7), press Start Training, see "Round n / 7" and two random objects in the frame "a stopwatch is like a windmill because...", say how the first is like the second out loud, and a new pair appears when the timer ends (Skip and End buttons are available). The plugin keeps the two random objects and the exact frame. Two reels spin and land on the pair (the clock is held back until they stop), and the player picks the ending that is genuinely true of both objects and makes a point, instead of an ending that is false, true of only one, or trivial. Time per analogy is 12, 10 or 8 seconds because reading four endings takes longer than speaking one (the site gives 5). The round counter, Skip and End are not reproduced: the engine decides the number of questions and has no skip.

## How it plays

- **Wait** about a second for the reels to stop. The clock does not run while they spin, and the choices are locked until they land.
- **Pick** an ending by tapping it or pressing **1 to 4**. After the answer the plank shows the full true sentence, also after a wrong pick.
- With `prefers-reduced-motion` the reels are already landed and the clock starts at once.
- After the answer the best ending turns green, a wrong pick turns red, and the server explanation says what makes the others weak.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 12 seconds, INTERMEDIATE 10, ADVANCED 8.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Say the full analogy out loud, then add one more sentence about why it matters."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | Not used. Leave empty. |
| `passage` | The two objects with their articles, separated by ` | `, for example `a stopwatch | a windmill`. |
| `question` | `Finish the analogy.` |
| `option_0` to `option_3` | Four endings that follow "because", lowercase, no full stop, up to 80 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one ending names a property or job that really is true of both objects and says something. The others are false, true of only one object, or true but trivial (colour, material, size).
- Beginner pairs share a clear function. Intermediate and advanced pairs pair an object with a work idea (a thermostat and a manager, a lighthouse and a mission statement).
- Write the pair with articles so the frame reads naturally.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **Held clock.** The clock starts only after the reels stop by passing `null` to the timer until then. If the engine also times the question from when it was served, response time will include the spin (about 1.2 seconds).
7. **Random pairs.** On the site the pairs are random. Here each row is a curated pair, because a random pair may have no strong analogy and the server needs one correct ending.
8. **Round counter, Skip, End.** Not reproduced; the engine owns round count and there is no skip in the plugin contract.
9. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/machine.ts`: parses the pair, builds the reels (seeded by the words, so rendering stays pure), the frame and the finished sentence.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
