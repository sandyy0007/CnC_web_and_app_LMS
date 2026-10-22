import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'word-match-rush',
  slug: 'word-match-rush',
  name: 'Word Match Rush: Meaning Match',
  version: '1.0.0',
  description:
    'Drag the right meaning card onto each workplace vocabulary term before the timer runs out.',
  category: 'Vocabulary & Professional Polish',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM02', 'COM04', 'COM05'],
  themeColor: '#6366f1',
  badgeTone: 'indigo',
  durationMinutes: 10,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the term and its example sentence.',
    'Drag the card with the correct meaning onto the term, or tap a card and then the term.',
    'Answer quickly to build a streak and keep your lives.',
  ],
};

export default manifest;
