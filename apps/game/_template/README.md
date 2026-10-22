# Winners Creek Game Plugin Template

This folder serves as the official reference implementation and copyable boilerplate for adding any new interactive game to Winners Creek LMS.

## How to add a new game in 3 simple steps:

1. **Copy this folder**:
   ```bash
   cp -r apps/game/_template apps/game/my-new-game
   ```
2. **Edit `game.manifest.ts`**:
   - Provide a unique `id` and `slug` (e.g. `my-new-game`).
   - Define metadata: title, description, category, supported EEDI parameters, XP rewards.
3. **Build your gameplay in `Game.tsx`**:
   - Use the provided `GameProps` interface.
   - Emit structured game events using `emitEvent({ type: 'MOVE_MADE', payload: ... })`.
   - Submit answers using `submitAnswer(optionIndex, responseTimeMs)`.
   - Complete the game using `completeGame()`.

## Validation & Registration:
Run:
```bash
npm run game:validate
```
The game will automatically be discovered, validated against the plugin schema, synchronized with the database as `DRAFT`, and mounted in the unified `GameRunner` without editing ANY existing file in the LMS!

