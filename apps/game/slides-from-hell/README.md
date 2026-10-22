# Slides From Hell: Commit to the Chaos

Slug: `slides-from-hell`. Category: Critical Thinking & Leadership (see the Category assumption). EEDI codes: CNF04, PRB04, COM07. 8 minutes, 150 XP.

**Modelled on:** Slides From Hell (PowerPoint Karaoke) on speaking.games (page `/slides-from-hell`), inspected live.

A funny presentation topic and a slide you have never seen. The player picks the line that commits to a story and links the image to the topic. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How the site plays and how this plugin adapts it

On the site you set the presentation length (30 seconds to 5 minutes) and the seconds per slide (5 to 60, default 10), optionally take a random funny topic, and press Start Presentation. Random images you have never seen appear one by one (auto-advance can be switched off) and you improvise, describing each image creatively and confidently, committing to your story even when the slides make no sense. Here one question is one slide: the funny topic and the mystery slide are shown, and the player picks the line that commits to a story and ties the image to the topic, instead of apologising, describing the picture flatly, hedging or skipping. The seconds-per-slide setting becomes the tier timer (15, 12, 10; the site default is 10). Auto-advance has no equivalent because the engine decides when the next question appears.

## How it plays

- **Pick** a line by tapping it or pressing **1 to 4**.
- The slide is an emoji with a caption in a slide frame (the site uses random photos, which a plugin cannot ship).
- After the answer the best line turns green, a wrong pick turns red, and the server explanation says what the weaker lines waste.
- Time per question follows the adaptive tier from `props.level`: BEGINNER 15 seconds, INTERMEDIATE 12, ADVANCED 10.
- **Speak-aloud practice** (header toggle, off by default): after the feedback a short, ungraded step asks the player to say something aloud ("Describe the slide out loud and link it to your topic. Commit fully."). Nothing is recorded or scored.
- The streak badge is cosmetic and never changes the score.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `scenario` | The presentation topic, for example `Topic: The secret life of staplers`. |
| `passage` | The mystery slide as `emoji | caption`. The emoji is optional. |
| `question` | `What do you say about this slide?` |
| `option_0` to `option_3` | Four things the presenter could say, up to 100 characters each. |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring rules (from the design spec):

- Exactly one line commits to a story and connects the image to the topic. The others fail one way: apologise, describe the picture flatly, hedge, or skip the slide.
- The right line may be as silly as the slide. Only commitment and the link to the topic are graded, never taste.
- Keep topics and captions workplace-safe and free of real people or companies.
- Vary `correct_option`, and keep the explanations free of option numbers (the engine may shuffle options). This sample has 6 rows (2 per tier); publish with at least 12 per tier or a session ends after about six questions.
- Have an L&D or HR reviewer read every row before publishing.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the clock runs out the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback (or after the speak-aloud step) the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** Only `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED` and `TIMEOUT` are emitted.
5. **Speak-aloud practice.** The header toggle adds an ungraded step after each answer: a prompt and a 15 second countdown with a Done button. It never requests the microphone and records nothing. The step is not timed by the engine, so it adds about 15 seconds per question when on; the session time limit (`gameContext.timeLimitSeconds`) still ends the attempt. It is off by default. Check that the extra time is acceptable for the duration shown in the catalogue.
6. **Images.** The site shows random photos. This plugin shows an emoji and a caption so it needs no image hosting. If you have licensed images, extend the slide frame in `Game.tsx` to show an `<img>` from a URL in the passage.
7. **Emoji rendering.** Emoji look different per device. The caption always carries the meaning, and the emoji is hidden from screen readers.
8. **Category.** `Critical Thinking & Leadership` is a value already used by the LMS; no speaking category is known to exist.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `utils/slideCard.ts`: splits the passage into the emoji and the caption.
- `components/TimerRing.tsx`: circular countdown beside the prompt.
- `components/PracticePanel.tsx`: the optional speak-aloud countdown (no microphone).
- `hooks/useQuestionTimer.ts`: the countdown.
- `hooks/usePrefersReducedMotion.ts`: used where the game animates.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
