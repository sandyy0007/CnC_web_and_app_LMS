# Compressor: Say It in Less

Slug: `compressor`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM05, COM01, COM07. 10 minutes, 175 XP.

**Modelled on:** Compressor (Razor) on speaking.games (page `/compressor`), inspected live.

A full message, a round strip (2 min, 1 min, 30 s) and four compressed versions with word counts. The player picks the version that keeps the core and cuts the fluff. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you get a random topic (or bring your own), choose round lengths (2 min, 1 min, 30 s, or 1 min, 30 s, 15 s) and give the same speech three times, each round shorter, with a 3-2-1 countdown before the first. The point is that each round forces you to cut the fluff and keep the essence. The plugin keeps the three-round idea and the round strip. Each question is one round of a message: the full version is shown with its word count, and the player picks the version that keeps the core (the problem, the reason and the action) and cuts the fluff. Wrong versions lose part of the core, keep filler, or repeat background. Each option shows its word count and a length bar against the original, so the player sees what each cut costs. The round named in the scenario column (Round 1, 2 or 3 of 3) lights the matching step of the strip; later rounds use shorter messages and tighter cuts.

## How it plays

- **Pick** a version by tapping it or pressing **1 to 4**.
- The full version shows its word count, and every option shows its own word count and a bar against the original.
- After the answer the best version turns green, a wrong pick turns red, and the server explanation says which part of the core the others lose or which fluff they keep.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 30 seconds, INTERMEDIATE 25, ADVANCED 20.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Say the compressed version out loud, then say it again in half the words."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The round, in the form `Round 2 of 3` (optionally followed by a sentence). |
| `passage` | The full version of the message, with its fluff. |
| `question` | `Which version keeps the core and cuts the fluff?` |
| `option_0` to `option_3` | Four compressed versions, up to 150 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- The core is the problem or claim, the reason and the action or ask. The correct version keeps all that is in the passage and has no filler.
- Wrong versions each fail one way: lose a part of the core (too short), keep filler (um, well, I think, as I said), or only repeat background.
- Do not make the shortest version the right one every time: word counts are shown, and a shorter wrong answer should exist in most rows.
- Messages are workplace-safe with invented facts.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **Word counts.** `countWords` counts words made of letters or digits; hyphenated words and numbers with a percent sign count as one word. The count is a hint and does not affect scoring.
7. **Round line.** The round is read from the scenario text. If the format changes, update `parseRound` in `utils/words.ts`.
8. **Round lengths.** The strip shows the 2 min, 1 min, 30 s lengths of the site's default format. The site's 1 min, 30 s, 15 s variant is not shown.
9. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/words.ts`: word counter, round parser and the round lengths.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
