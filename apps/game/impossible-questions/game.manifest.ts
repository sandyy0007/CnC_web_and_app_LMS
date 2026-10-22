import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'impossible-questions',
  slug: 'impossible-questions',
  name: 'Impossible Questions: Answer With Total Confidence',
  version: '1.0.0',
  description:
    'An absurd question, no right answer. Pick the reply delivered with total confidence instead of hedging or dodging.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['CNF02', 'CNF04', 'PRB04'],
  themeColor: '#f59e0b',
  badgeTone: 'amber',
  durationMinutes: 8,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'An absurd question appears. There is no true answer, so any answer is allowed.',
    'Pick the reply that is delivered with total confidence: specific, committed, no hedging (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to say your answer boldly out loud.',
  ],
};

export default manifest;
