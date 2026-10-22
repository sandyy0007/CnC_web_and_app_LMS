import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'compressor',
  slug: 'compressor',
  name: 'Compressor: Say It in Less',
  version: '1.0.0',
  description:
    'The same message, three rounds, each shorter. Pick the version that keeps the core and cuts the fluff.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM05', 'COM01', 'COM07'],
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
    'Read the full message and which round you are in: each round is shorter than the last.',
    'Pick the version that keeps the core and cuts the fluff (tap or press 1 to 4). Word counts help, but they are not the answer.',
    'Turn on Speak-aloud practice to say your compressed version out loud and then say it again in half the words.',
  ],
};

export default manifest;
