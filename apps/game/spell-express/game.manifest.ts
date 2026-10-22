import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'spell-express',
  slug: 'spell-express',
  name: 'Spell Express: The Conveyor Challenge',
  version: '1.0.0',
  description:
    'Grab the correctly spelled word from the moving belt to complete each workplace sentence before the belt runs out.',
  category: 'Vocabulary & Professional Polish',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM08', 'COM02', 'COM05'],
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
    'Read the sentence with the missing word.',
    'Grab the plate with the correct spelling before the belt moves on.',
    'Each wrong grab or missed belt costs a life.',
  ],
};

export default manifest;
