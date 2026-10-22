# Speech Roulette: Spin, Think, Speak

Slug: `speech-roulette`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM07, CNF04, PRB04. 10 minutes, 175 XP.

**Modelled on:** Speech Roulette on speaking.games (page `/speech-roulette`), inspected live.

A reel spins and lands on a one-word topic. After it stops the think clock runs, and the player picks the angle that turns the word into something specific they can speak about. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you set a speech length (30 seconds to 3 minutes), choose a difficulty (Normal: opinion-friendly, Hard: deep and abstract, Juicy: spicy social themes), spin the wheel, get 10 seconds to think once it lands, and the timer then starts automatically while you speak. The wheel shows one-word topics such as ambition, small talk, feedback or deadlines. The plugin keeps the spin, the one-word topic, the three difficulties and the think-time pause. The reel spins first and the clock is held back until it stops, then the player picks the angle that makes the single word specific and arguable instead of a dictionary definition or a vague remark. Difficulty follows the tier (Normal for BEGINNER, Hard for INTERMEDIATE, Juicy for ADVANCED). The think-time clock is 15, 12 or 10 seconds (the site gives 10). The site wheel is a circle; here it is a vertical reel, which is simpler to make accessible.

## How it plays

- **Wait** for the reel to stop (about two seconds). The clock does not run while it spins, and the choices are locked until it lands.
- **Pick** an angle by tapping it or pressing **1 to 4**.
- With `prefers-reduced-motion` the reel is already landed and the clock starts at once.
- After the answer the strongest angle turns green, a wrong pick turns red, and the server explanation says what the weaker angles do instead.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 15 seconds, INTERMEDIATE 12, ADVANCED 10 (think time after the reel stops).
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Take a breath, then speak about your topic for 15 seconds using the angle you picked."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The difficulty chip: `Normal`, `Hard` or `Juicy`. |
| `passage` | The topic the reel lands on, one to three words. |
| `question` | `Which angle turns this word into something you can speak about?` |
| `option_0` to `option_3` | Four angles, up to 100 characters each. One is specific and arguable; the others are a definition, a vague remark, a non-answer or a stall. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one angle is specific enough to speak about for a minute (a claim, a story or a stake). The others are a dictionary definition, "many sides" filler, a refusal or a stall.
- Topics are single words or short phrases. Normal is everyday, Hard is abstract, Juicy is socially charged but workplace-safe.
- Do not reward taking a side; either side can be a strong angle.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **Held clock.** The clock starts only after the reel stops by passing `null` to the timer until then. If the engine also times the question from when it was served, response time will include the spin (about 1.8 seconds).
7. **Reel instead of wheel.** The site uses a circular wheel. A vertical reel is used so the landed topic is plain text for screen readers (a live region announces it).
8. **Juicy topics.** Keep juicy topics workplace-safe and have HR approve them.
9. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/reel.ts`: builds the words the reel passes (seeded by the topic, so rendering stays pure).
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
