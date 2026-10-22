# No Filler: Say It Clean

Slug: `filler-free`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM01, COM05, COM07. 8 minutes, 150 XP.

A speech bubble holds a rambling answer full of ums and you-knows. The player picks the one version that keeps every fact and drops every filler. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Pick** a version by tapping it or pressing **1 to 4**.
- After the answer the likely fillers in the bubble are struck through and a **filler jar** shows how many there were; the right version turns green, a wrong pick turns red, and the server explanation is shown.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Say the clean version aloud without any filler."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The question the speaker was asked, for example `Your manager asks: how did the launch go?` |
| `passage` | The raw answer, with fillers, shown in the speech bubble. |
| `question` | `Which version says it clean?` |
| `option_0` to `option_3` | Four rewrites, up to 100 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one version keeps every fact and has no filler. Wrong versions each fail one way: keeps a filler, loses a fact, adds a claim, or keeps a hedge.
- Fillers in the raw answer should come from the highlight list: um, uh, erm, like, you know, basically, actually, literally, sort of, kind of, I mean, just.
- Workplace settings only, invented names, no real people or companies.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the 'duration' shown in the catalogue.
6. **Filler highlighting.** The struck-through words come from a plain word list in `utils/fillers.ts`, not language analysis. A legitimate "like" or "just" in the raw answer is highlighted too, so author raw answers where those words are real fillers.
7. **Small screens.** Four long rewrites stack under the bubble. Check the layout on a 320 px wide phone with 100-character options.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/fillers.ts`: splits the raw answer into filler and non-filler segments for the post-answer highlight.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
