import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'story-spark',
  slug: 'story-spark',
  name: 'Story Spark: Start the Story',
  version: '1.0.0',
  description:
    'A storytelling prompt and a true story to tell. Pick the opening line that drops the listener into a real moment.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM01', 'COM07', 'CNF04'],
  themeColor: '#a855f7',
  badgeTone: 'purple',
  durationMinutes: 8,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the prompt. It moves from random to first/last/best/worst to work stories as you level up.',
    'Pick the opening line that drops the listener into a real moment (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to tell the first part of your own true story.',
  ],
};

export default manifest;
