import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'red-flag-pop',
  slug: 'red-flag-pop',
  name: 'Red-Flag Pop: Pop the Problem',
  version: '1.0.0',
  description:
    'Four balloons rise toward the ceiling, each tied to a workplace behaviour. Pop the red flag before time runs out.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['BEH01', 'BEH08', 'BEH09'],
  themeColor: '#6366f1',
  badgeTone: 'indigo',
  durationMinutes: 8,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the situation and the instruction, for example Pop the red flag.',
    'Tap a balloon or press 1 to 4 to pop it.',
    'The balloons rise faster and the choices get subtler as you level up.',
  ],
};

export default manifest;
