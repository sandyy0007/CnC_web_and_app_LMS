# Framework Master: Structure It Fast

Slug: `framework-master`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM05, COM07, PRB04. 10 minutes, 175 XP.

**Modelled on:** Framework Master on speaking.games (page `/framework-master`), inspected live.

A work prompt, a framework name and the framework steps. The player picks the answer whose sentences follow every step of the framework in order. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you choose a framework (PREP: Point, Reason, Example, Point; What, So What, Now What; Situation, Impact, Action; Headline + 3 Points; One-sentence summary then 3 bullets), set the time per prompt (30 seconds to 3 minutes), press Get Your Prompt, see a work-related prompt (for example whether to retire a legacy product) and answer it using the framework. On screen, a visual scaffold highlights which part you should be on. The plugin keeps the five frameworks, the work prompts and the scaffold strip. The speech becomes four short answers, and the player picks the one that follows every step of the given framework in order. Weak answers skip the point, start with the example, repeat one step, or never reach an action. After the answer the correct option is relabelled with the scaffold step names, so the player sees which sentence played which part. Framework by tier: PREP for BEGINNER and the first INTERMEDIATE row, three-step frameworks for INTERMEDIATE, Headline + 3 Points and PREP on harder prompts for ADVANCED.

## How it plays

- **Pick** an answer by tapping it or pressing **1 to 4**. Each answer is shown as a row of sentence chips.
- After the answer the correct option shows each chip with the framework step it plays (Point, Reason, Example, Point, and so on).
- The best answer turns green, a wrong pick turns red, and the server explanation says what the weaker answers do.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 30 seconds, INTERMEDIATE 25, ADVANCED 20.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Answer the prompt out loud using the framework, one step at a time. Point first."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The framework name, for example `PREP`, `What, So What, Now What`, `Situation, Impact, Action`, `Headline + 3 Points` or `Summary + 3 bullets`. |
| `passage` | The framework steps separated by ` > `, for example `Point > Reason > Example > Point`. |
| `question` | The work prompt, shown in quotes. |
| `option_0` to `option_3` | Four answers, each written as sentences separated by ` > `. Up to 175 characters per answer and 60 per sentence. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- The correct answer has exactly one sentence per framework step, in order, each carrying a fact. Wrong answers fail one way: skip or empty a step, reorder, repeat one idea, or lead with background.
- Keep sentence counts similar across the four answers so the count is not a giveaway.
- Explanations must not refer to option numbers: the engine may shuffle options.
- Prompts are everyday workplace decisions with invented facts.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **Framework coverage.** All five site frameworks are in the sample (PREP, What So What Now What, Situation Impact Action, Headline + 3 Points, Summary + 3 bullets). The site's live highlight of the current step has no equivalent while the player thinks; labels appear after the answer.
7. **Small screens.** Four answers of up to four chips each wrap onto several lines. Check a 320 px wide phone with 175-character answers.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/steps.ts`: splits the framework and the answer sentences on ` > `.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
