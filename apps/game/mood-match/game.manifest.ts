import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'mood-match',
  slug: 'mood-match',
  name: 'Mood Match: Read the Room',
  version: '1.0.0',
  description:
    'Read a workplace situation and pull a rope from it to the feeling a colleague is most likely experiencing.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM06', 'BEH10', 'CNF02'],
  themeColor: '#a855f7',
  badgeTone: 'purple',
  durationMinutes: 10,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the situation and think about how the colleague feels.',
    'Drag the rope to a feeling, tap a feeling, or press 1 to 4.',
    'Feelings sit closer together as you level up.',
  ],
};

export default manifest;
