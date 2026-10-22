import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'analogy-machine',
  slug: 'analogy-machine',
  name: 'Analogy Machine: Like a ... Because ...',
  version: '1.0.0',
  description:
    'Two random objects drop out of the machine. Pick the ending that makes the analogy true and worth saying.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['PRB01', 'COM02', 'COM01'],
  themeColor: '#64748b',
  badgeTone: 'neutral',
  durationMinutes: 8,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Two random things drop out of the machine and the frame "A is like B because ..." appears.',
    'Pick the ending that is true of both and makes the point (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to say the sentence and add one more sentence about why it matters.',
  ],
};

export default manifest;
