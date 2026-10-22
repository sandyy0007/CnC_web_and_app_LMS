import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'style-sorter',
  slug: 'style-sorter',
  name: 'Style Sorter: Four Ways to Say It',
  version: '1.0.0',
  description:
    'Sort workplace replies into four bins: assertive, passive, aggressive or passive-aggressive, before the sorting clock runs out.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['BEH09', 'COM05', 'BEH08'],
  themeColor: '#f59e0b',
  badgeTone: 'amber',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the situation and the reply card.',
    'Drag the card into a bin, tap a bin, or press 1 to 4.',
    'Replies get subtler and the clock gets shorter as you level up.',
  ],
};

export default manifest;
