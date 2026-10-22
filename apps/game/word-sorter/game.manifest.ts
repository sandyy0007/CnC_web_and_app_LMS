import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'word-sorter',
  slug: 'word-sorter',
  name: 'Word Sorter: Tone & Category Bins',
  version: '1.0.0',
  description:
    'Drop each falling workplace phrase into the bin that matches its tone, register or category before it hits the floor.',
  category: 'Vocabulary & Professional Polish',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM02', 'BEH08', 'COM05'],
  themeColor: '#10b981',
  badgeTone: 'emerald',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the sorting rule on the banner.',
    'Drop the falling phrase into the matching bin, or tap a bin, before it reaches the floor.',
    'Watch for the bin labels changing between rounds.',
  ],
};

export default manifest;
