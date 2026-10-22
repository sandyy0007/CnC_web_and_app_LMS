import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'debate-champion',
  slug: 'debate-champion',
  name: 'Debate Champion: Take a Side',
  version: '1.0.0',
  description:
    'A random debate topic is revealed. Pick the opening that states a clear point and gives a reason, before time runs out.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM07', 'CNF04', 'COM05'],
  themeColor: '#6366f1',
  badgeTone: 'indigo',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the topic. It gets bolder as you level up: fun, normal, then juicy.',
    'Pick the opening that gives a clear Point and a Reason (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to deliver your Point and Reason out loud.',
  ],
};

export default manifest;
