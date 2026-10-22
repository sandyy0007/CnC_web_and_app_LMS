import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'filler-free',
  slug: 'filler-free',
  name: 'No Filler: Say It Clean',
  version: '1.0.0',
  description:
    'A speech bubble full of ums and you-knows. Pick the version that says the same thing clean, before time runs out.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM01', 'COM05', 'COM07'],
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
    'Read the question and the answer in the speech bubble.',
    'Pick the version that keeps every fact and drops every filler (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to say the clean version out loud after each answer.',
  ],
};

export default manifest;
