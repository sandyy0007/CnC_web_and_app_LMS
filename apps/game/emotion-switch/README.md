# Emotion Switch: Ride the Rollercoaster

Slug: `emotion-switch`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: COM07, CNF01, COM01. 8 minutes, 150 XP.

**Modelled on:** Emotion Switch (Emotion Rollercoaster) on speaking.games (page `/emotion-switch`), inspected live.

A topic, an emotion cue with an emoji, and a high or low energy level on a small rollercoaster track. The player picks the line about the topic that carries that emotion. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you set a duration (default one minute) and how often the emotion switches (default every 12 seconds), optionally take a random topic, press Start Ride and tell one story while matching the emotion shown. The screen shows the topic, a cue such as "Start low" with an emoji and a word (for example calm), and the energy alternates between high and low. The plugin keeps the topic, the emoji and emotion word, and the high or low energy cue, with a small rollercoaster track. The telling becomes one decision: the player picks the line about the topic that carries the cued emotion at the cued energy. Wrong lines carry a different emotion (the same topic, told with another feeling). Emotions get subtler by tier: clear ones for BEGINNER (joy, anger, sadness, calm), then excitement, nervousness and similar for INTERMEDIATE, and embarrassed or relieved for ADVANCED. The switching clock (every 12 seconds) is the question timer. Voice and body, the other half of emotion on the site, cannot be graded here and are covered only by the speak-aloud step.

## How it plays

- **Pick** a line by tapping it or pressing **1 to 4**.
- The cue shows the emoji, the emotion word and an arrow for high or low energy; the little track shows a hill for high energy and a dip for low.
- After the answer the right line turns green, a wrong pick turns red, and the server explanation names the words that carry the feeling.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 20 seconds, INTERMEDIATE 15, ADVANCED 12.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Say your line out loud with the emotion, then say it again with the opposite energy."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The topic, for example `Learning to ride a bike`. |
| `passage` | The cue as `emoji | emotion | energy`, with energy `high` or `low`, for example `😄 | joy | high`. |
| `question` | `Which line carries this emotion?` |
| `option_0` to `option_3` | Four lines about the topic, up to 100 characters each, each carrying a different emotion. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one line carries the cued emotion at the cued energy. The other three each carry a different, clearly distinct emotion about the same topic.
- Do not use two emotions that a reasonable person would confuse (for example nervous and embarrassed in the same row). Explanations name the words that carry the feeling.
- Topics are everyday and workplace-safe. No grief, illness or other sensitive scenarios.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **Voice and body.** On the site the emotion is acted with voice and body. A multiple-choice plugin can only grade the words, so the speak-aloud step carries the acting and is not scored.
7. **Emotion labels.** Whether a line "sounds" joyful or relieved is partly cultural. Have L&D and a few native speakers review every row.
8. **Emoji rendering.** Emoji look different per device. The emotion word is always shown and the emoji is hidden from screen readers.
9. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/cue.ts`: parses the cue and draws the rollercoaster track.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
