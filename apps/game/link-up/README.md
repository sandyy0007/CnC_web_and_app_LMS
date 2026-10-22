# Link Up: Connect the Dots

Slug: `link-up`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM01, PRB01, COM02. 10 minutes, 150 XP.

Two unrelated words sit on either side of a gap with a sentence frame, "A is like B because ...". The player picks the ending that is true of both words and says something useful, and the plank fills in with the full sentence. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Pick** an ending by tapping it or pressing **1 to 4**.
- After the answer the plank shows the full true sentence (also after a wrong pick, so the good link is always seen), the right ending turns green, a wrong pick turns red, and the server explanation is shown.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Say the full sentence, then add one example from your own work."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | Not used. Leave empty. |
| `passage` | The two words to link, separated by ` | `, for example `Meeting | Bridge`. |
| `question` | `Finish the link.` |
| `option_0` to `option_3` | Four endings that follow "because", lowercase, no full stop, up to 80 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one ending is true of both words and says something useful. The others are true of only one word, true of neither, or true but trivial (colour, material, units).
- Beginner rows contrast a real shared function with surface details. Intermediate and advanced rows ask for an insight about work, such as coordination, feedback or trust.
- Endings must read naturally after "A is like B because". Invented, workplace-safe word pairs only.
- Vary `correct_option`. This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the 'duration' shown in the catalogue.
6. **Sentence frame.** The frame "A is like B because" is built in `utils/link.ts` and assumes English word order. Word pairs that need an article ("a bridge") should be written with it in the passage.
7. **Small screens.** The two word cards share one row. Check the layout on a 320 px wide phone with two long words.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/link.ts`: parses the word pair and builds the sentence frame and the finished sentence.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
