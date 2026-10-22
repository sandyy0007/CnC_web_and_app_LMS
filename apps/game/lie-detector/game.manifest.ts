import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'lie-detector',
  slug: 'lie-detector',
  name: 'Lie Detector: Listen for the Slip',
  version: '1.0.0',
  description:
    'A colleague tells their story. Check it against the facts you already know and flag the one statement that does not fit.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM06', 'PRB01', 'BEH01'],
  themeColor: '#475569',
  badgeTone: 'neutral',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the facts you already know about the speaker.',
    'Four statements follow. Flag the one that contradicts the facts (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to explain out loud why the statement does not fit.',
  ],
};

export default manifest;
