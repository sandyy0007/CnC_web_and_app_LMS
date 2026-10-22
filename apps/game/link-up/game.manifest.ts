import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'link-up',
  slug: 'link-up',
  name: 'Link Up: Connect the Dots',
  version: '1.0.0',
  description:
    'Two unrelated words, one plank to build between them. Pick the ending that makes the link true and useful.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM01', 'PRB01', 'COM02'],
  themeColor: '#0ea5e9',
  badgeTone: 'cyan',
  durationMinutes: 10,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Two words sit on either side of a gap. Read the sentence frame between them.',
    'Pick the ending that is true of both words and says something useful (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to say the full sentence and add an example from your own work.',
  ],
};

export default manifest;
