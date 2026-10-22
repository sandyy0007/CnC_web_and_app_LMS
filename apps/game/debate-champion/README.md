# Debate Champion: Take a Side

Slug: `debate-champion`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM07, CNF04, COM05. 10 minutes, 175 XP.

**Modelled on:** Debate Champion on speaking.games (page `/impromptu-speech`), inspected live.

A random debate topic is revealed in a quote card, with the Point, Reason, Example, Point structure shown above the choices. The player picks the opening that states a clear side and its reason. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you choose a topic type (Fun Debates: playful and silly, Normal Debates: real-world issues, Juicy Debates: edgy and provocative), set a speech length from 30 seconds to 3 minutes, press Get Your Topic, see the topic in a large quote card and then speak, with the tip Point, Reason, Example, Point. The site has no scoring and any speech counts, so here the topic card, the three topic types and the PREP tip are kept, and the speaking turn becomes one decision: which opening states a clear Point and gives a Reason. The topic type follows the tier (fun for BEGINNER, normal for INTERMEDIATE, juicy for ADVANCED).

## How it plays

- **Pick** an opening by tapping it or pressing **1 to 4**.
- The first two steps of the structure strip (Point, Reason) are lit, because the opening must do both.
- After the answer the best opening turns green, a wrong pick turns red, and the server explanation says what the weaker openings do instead.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Speak for 15 seconds on the topic: state your Point, then give one Reason."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The topic type chip: `Fun debate`, `Normal debate` or `Juicy debate`. |
| `passage` | The debate topic, shown in quotes in the topic card. |
| `question` | `Which opening makes a clear Point and gives a Reason?` |
| `option_0` to `option_3` | Four ways to open the speech, up to 110 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one opening takes a side and gives a reason in the same breath. Weak openings each fail one way: sit on the fence, announce the topic, hedge, or take a side with no reason.
- Fun topics are silly, normal topics are real workplace or society questions, and juicy topics are provocative but workplace-safe. Nothing party-political or personal.
- Do not reward the side. Either side can be right; only the structure is graded.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **Juicy topics.** The site offers "edgy and provocative" topics. The sample juicy rows stay workplace-safe (pay transparency, chat monitoring). Have HR approve any juicier topic before it is added.
7. **Small screens.** Topic card, structure strip and four openings stack in one column. Check a 320 px wide phone with 110-character openings.
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
