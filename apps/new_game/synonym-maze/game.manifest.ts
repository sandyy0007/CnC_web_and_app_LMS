import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'synonym-maze',
  slug: 'synonym-maze',
  name: 'Synonym Maze: Deadline Chase',
  version: '1.0.0',
  description:
    'Steer through a maze to the chamber holding the right synonym or antonym before the deadline alarm catches up with you.',
  category: 'Vocabulary & Professional Polish',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM02', 'COM04', 'COM05'],
  themeColor: '#0ea5e9',
  badgeTone: 'cyan',
  durationMinutes: 12,
  xpReward: 200,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the word clue, then look at the four chambers in the corners.',
    'Walk with arrow keys, WASD or the on-screen pad, or tap a chamber to walk there.',
    'Reach the right chamber before the alarm clock catches you.',
    'Mazes get longer and the alarm gets faster as you level up.',
  ],
};

export default manifest;
