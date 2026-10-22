# Story Spark: Start the Story

Slug: `story-spark`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM01, COM07, CNF04. 8 minutes, 150 XP.

**Modelled on:** Story Spark (Impromptu Story) on speaking.games (page `/story-spark`), inspected live.

A storytelling prompt in a card, with a prompt type chip. The player picks the opening line that drops the listener into a real moment of a true story. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you pick a prompt type (Random: anything goes; First, Last, Best, Worst: memory prompts; Work-related: workplace stories), set a duration (30 seconds to 3 minutes), press Get Your Prompt and tell a true short story on the spot. A prompt looks like a short phrase in a card, for example a moment of pure excitement. The plugin keeps the prompt card with the three prompt types (by tier: Random for BEGINNER, First/Last/Best/Worst for INTERMEDIATE, Work-related for ADVANCED) and the "true story" rule. The telling becomes one decision, the opening line: the player picks the line that starts inside a real moment (a time, a place, a detail) instead of announcing the story, stating a theme or stalling.

## How it plays

- **Pick** an opening by tapping it or pressing **1 to 4**.
- A "True story" tag reminds the player that the story must be real, as on the site.
- After the answer the best opening turns green, a wrong pick turns red, and the server explanation says what the weaker openings do.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Tell the first part of a true story for this prompt. Start with your opening line."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The prompt type chip: `Random prompt`, `First / Last / Best / Worst` or `Work story`. |
| `passage` | The prompt, a short phrase, shown in quotes in the card. |
| `question` | `Which opening line drops us into a real moment?` |
| `option_0` to `option_3` | Four opening lines, up to 110 characters each. One starts inside a concrete moment; the others state a theme, announce the story, hedge or stall. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one opening starts inside a specific moment with a time, place, sound or detail. The others describe a theme, announce the story, summarise or stall.
- The right opening must not invent facts that no listener could check against the prompt, but it can be made up for the example: it is a model line, not a real memory.
- Work stories must be workplace-safe. No health, family or other sensitive prompts.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **"True story" rule.** The site asks for true stories. Here the openings are model lines, so the rule is a reminder for the speak-aloud step only.
7. **Small screens.** Prompt card and four openings stack in one column. Check a 320 px wide phone with 110-character lines.
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
