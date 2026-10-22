import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'emotion-switch',
  slug: 'emotion-switch',
  name: 'Emotion Switch: Ride the Rollercoaster',
  version: '1.0.0',
  description:
    'One topic, an emotion cue, and a swing between high and low energy. Pick the line that says it with that feeling.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM07', 'CNF01', 'COM01'],
  themeColor: '#f43f5e',
  badgeTone: 'purple',
  durationMinutes: 8,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'A topic appears with an emotion cue and an energy level: high or low.',
    'Pick the line that tells the topic with that emotion and energy (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to say your line out loud, then say it again with the opposite energy.',
  ],
};

export default manifest;
