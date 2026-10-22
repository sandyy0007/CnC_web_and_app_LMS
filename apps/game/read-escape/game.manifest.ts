import type { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'read-escape',
  slug: 'read-escape',
  name: 'Read & Escape: The Virtual Lockroom',
  version: '1.0.0',
  description: 'Analyze reading passages, discover hidden investigative clues, and crack the Detail, Vocabulary, and Inference locks to escape before time expires.',
  category: 'Reading Comprehension',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM04', 'COM06', 'COM05'],
  themeColor: '#38bdf8',
  badgeTone: 'cyan',
  durationMinutes: 10,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsPause: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['escape-chamber', 'three-locks'],
  },
  instructionSteps: [
    'Read the passage carefully in the Reading Room on the left.',
    'Solve each virtual lock by selecting the correct analysis option.',
    'You have 3 lives. Each incorrect deduction forfeits a life.',
    'Unlock all 3 locks to crack the chamber and register your EEDI rating.',
  ],
};

export default manifest;

