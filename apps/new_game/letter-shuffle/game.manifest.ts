import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'letter-shuffle',
  slug: 'letter-shuffle',
  name: 'Letter Shuffle: Word Builder',
  version: '1.0.0',
  description:
    'Study the scrambled letter tiles and the clue, then pick the workplace word that uses every tile; longer words earn more.',
  category: 'Vocabulary & Professional Polish',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM02', 'COM05'],
  themeColor: '#a855f7',
  badgeTone: 'purple',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the clue and study the letter tiles.',
    'Press Shuffle to see new arrangements of the same letters.',
    'Pick the word that uses every tile exactly once.',
  ],
};

export default manifest;
