import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'explain-to-a-child',
  slug: 'explain-to-a-child',
  name: "Explain to a Child: Explain It Like I am 5",
  version: '1.0.0',
  description:
    'A concept and a hint. Pick the explanation a five-year-old could follow: simple words, a picture, no jargon.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM05', 'COM01', 'COM02'],
  themeColor: '#06b6d4',
  badgeTone: 'cyan',
  durationMinutes: 8,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the concept and its hint. The category rises from everyday to science to abstract.',
    'Pick the explanation a five-year-old could follow: simple words, an analogy or example, no jargon (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to explain it out loud to an imaginary five-year-old.',
  ],
};

export default manifest;
