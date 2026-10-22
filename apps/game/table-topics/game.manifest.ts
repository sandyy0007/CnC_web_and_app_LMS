import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'table-topics',
  slug: 'table-topics',
  name: 'Table Topics: Structure Sprint',
  version: '1.0.0',
  description:
    'Draw a topic card and pick the speaking plan that gives your answer a clear start, middle and close, before the clock runs out.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM07', 'CNF04', 'COM05'],
  themeColor: '#14b8a6',
  badgeTone: 'emerald',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'A topic card is drawn. On easier levels a structure hint tells you which plan shape to use.',
    'Pick the plan whose steps give the best structure (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to talk for 15 seconds following the plan you picked.',
  ],
};

export default manifest;
