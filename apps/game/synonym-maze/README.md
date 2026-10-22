# Synonym Maze: Deadline Chase

Slug: `synonym-maze`. Category: Vocabulary & Professional Polish. EEDI codes: COM02, COM04, COM05. 12 minutes, 200 XP.

A word clue is shown above a 9 x 9 maze. The four answer words wait in the four corner chambers. The player starts in the middle and must reach the right chamber before an alarm clock catches up. Play mechanic only; scoring, lives, adaptive tiers and EEDI scores stay in the server `GameEngine`.

## How it plays

- **Move.** Arrow keys or WASD, or the on-screen movement pad.
- **Walk to a chamber.** Press 1 to 4, or tap a chamber button above or below the maze. The game walks the shortest route at about 130 ms per cell. Pressing any movement key stops the walk.
- **Answer.** Stepping into a chamber locks in that option. There is no confirm step.
- **The alarm.** The clock icon follows the player's footprints and arrives on the player's cell exactly when time runs out. Walking back over your own footprints erases the loop, so the alarm never chases you into dead ends you have left. A catch counts as a timeout.
- **Time per question.** BEGINNER 25 seconds, INTERMEDIATE 20, ADVANCED 15. Mazes get longer too: shortest route 8, 10 and 12 steps.

After the answer the correct chamber is highlighted green and the server explanation is shown.

## Fairness rules (checked by script)

1. The four chambers are the same walking distance from the start. Every layout is unchanged by a quarter turn around the centre, so the distance is exactly equal (the spec allowed a difference of one).
2. No shortest route passes through another chamber.
3. Auto-walking to the farthest chamber takes less than 60% of the shortest timer (1.6 s of 9 s).
4. All floor cells are reachable and corridors are one cell wide.
5. Which corner holds which option is shuffled for looks only, from a hash of `question_id`, so the same question always looks the same. The submitted answer is always the original option index.

## Question encoding (CSV)

| Column | Use in this game |
| --- | --- |
| `question` | The stem, for example `Reach the closest synonym of 'assist'.` |
| `scenario` | Optional context sentence shown under the stem. |
| `passage` | Not used. Leave empty. |
| `option_0` to `option_3` | Four single words, one per chamber. Keep them short (chambers are narrow on phones). |
| `weight` | Usual tier range: BEGINNER 1.0, INTERMEDIATE 1.25 to 1.5, ADVANCED 1.5 to 2.0. |

Authoring tips: use `synonym` or `antonym` in `tag`; when asking for an antonym, make sure none of the three wrong options is also an opposite; vary `correct_option`. This sample has 6 rows (2 per tier) as the guide requires; publish with at least 12 per tier, otherwise a session ends after about six questions.

## Adding or changing mazes

Edit `utils/layouts.ts` only. A layout is nine strings of nine characters (`#` wall, `.` floor), corners and centre open, with no open 2 x 2 block. Then run `checkLayout(rows, 130, shortestTimerMs)` from `utils/maze.ts`; an empty `problems` list means it is fair.

## Accepted risk

The correct option can be found by walking to every chamber, but a wrong chamber costs a life, so guessing is not free. The correct index is never sent to the browser before the answer.

## Assumptions to verify before relying on this game

These come from the architecture document, not from the code.

1. **Timeouts.** When the alarm catches the player the game emits `TIMEOUT` and calls `submitAnswer(-1, <full time in ms>)`. Check that `game_engine.py` treats -1 as a wrong answer that costs a life. If it throws, the game shows the timeout and skips the question with no penalty instead.
2. **Advancing.** After feedback the game calls `nextQuestion()` only if `currentQuestion` has not already changed, then waits up to 2 seconds for a different question. If none arrives it calls `completeGame()`.
3. **Result fields.** `utils/result.ts` reads `is_correct`, `explanation` and an optional correct-option index defensively. Replace it with direct reads once `AnswerSubmissionResult` is confirmed in `apps/game/_shared/types.ts`.
4. **Event types.** `GAME_STARTED`, `QUESTION_SHOWN`, `ANSWER_SELECTED`, `TIMEOUT` and `MOVE_MADE` are emitted. `MOVE_MADE` (payload `questionId`, `fromTile`, `toTile`, cell numbers 0 to 80) fires only when the player reaches a junction, at most 12 per question. If the engine's `GameEvent` union does not include it, delete the `emit('MOVE_MADE', ...)` call in `Game.tsx`; nothing else depends on it.
5. **Failed save.** If a real answer fails to save, the player is stepped back one cell out of the chamber so they can try again.
6. **Phone play.** The pad and chamber buttons replace swipe controls; there is no swipe gesture.

## Files

- `game.manifest.ts`: static metadata read by `scripts/sync-games.mjs`.
- `Game.tsx`: default export used by `GameRunner`. Never navigates; the only exit is `completeGame()`.
- `components/TimerRing.tsx`: circular countdown beside the clue.
- `hooks/useQuestionTimer.ts`: countdown, kept local so games never import each other.
- `utils/layouts.ts`: the six maze layouts (two per tier).
- `utils/maze.ts`: grid helpers, shortest path, footprint trail, seeded board builder and the layout checker.
- `utils/result.ts`: defensive readers for the submit result.
- `questions.sample.csv`: 14-column question bank.
