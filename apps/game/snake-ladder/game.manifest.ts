import type { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'snake-ladder',
  slug: 'snake-ladder',
  name: 'Snake & Ladder: Professional Communications Arena',
  version: '1.0.0',
  description: 'Ascend the 100-cell corporate ladder. Climb career accelerators and confront high-stakes snake questions in vocabulary, grammar, and pronunciation.',
  category: 'Vocabulary & Professional Polish',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM04', 'COM02', 'COM05', 'COM01'],
  themeColor: '#22c55e',
  badgeTone: 'emerald',
  durationMinutes: 15,
  xpReward: 200,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsPause: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['board-game', 'dice-roll', 'snakes-and-ladders'],
  },
  instructionSteps: [
    'Roll the dice to navigate your token through the 100-cell board.',
    'Land on ladders to advance rapidly up the corporate ranks.',
    'Landing on a snake triggers an instant Communication Challenge question.',
    'Answer correctly to defeat the snake and stay up; answer wrong to slide down!',
    'Reach cell 100 to conquer the arena and earn master communication XP.',
  ],
};

export default manifest;

