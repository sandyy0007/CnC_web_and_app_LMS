# Slide Karaoke: Present the Unseen Deck

Slug: `slide-karaoke`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM07, COM05, CNF04. 10 minutes, 175 XP.

The curtain lifts on a slide the player has never seen. Five audience dots fade as the clock runs down. The player picks the opening line that gives the audience the message first. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Pick** an opening line by tapping it or pressing **1 to 4**.
- The curtain lifts at the start (it is already up with `prefers-reduced-motion`). The audience dots, shown as lit circles with a text label, go out one by one as time runs down.
- After the answer the best opening turns green, a wrong pick turns red, and the server explanation says what the weaker openings waste.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 20 seconds, INTERMEDIATE 15, ADVANCED 12.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Say your opening line aloud, then add one sentence about the next bullet."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The situation, for example `Your manager hands you this slide in the meeting.` |
| `passage` | The slide: title first, then bullets, separated by ` | `, for example `Q3 Sales Update | Sales up 12% | Two new regions opened`. |
| `question` | `What do you say first?` |
| `option_0` to `option_3` | Four opening lines, up to 90 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one opening joins the bullets into one message, with any cause the slide states. The weak ones each fail one way: apologise, read the slide aloud, describe the slide, hedge, or start with a single detail.
- The right opening may only use facts that are on the slide. Do not reward invented numbers or claims.
- Explanations must not refer to option numbers: the engine may shuffle options.
- Invented companies, workplace-only slides, no real people.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the 'duration' shown in the catalogue.
6. **Audience dots.** The dots are a cosmetic readout of the countdown (`utils/slide.ts`, `audienceLeft`). They carry a text label so colour is not the only signal.
7. **Small screens.** Slide, dots and four openings stack in one column. Check the layout on a 320 px wide phone with a five-bullet slide.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/slide.ts`: parses the slide column and computes how many audience dots are still lit.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
