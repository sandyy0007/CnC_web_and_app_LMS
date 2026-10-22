import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'scenario-spinner',
  slug: 'scenario-spinner',
  name: 'Scenario Spinner: Spin & Respond',
  version: '1.0.0',
  description:
    'Spin the wheel to reveal your next workplace setting, then choose the response that handles the situation professionally.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['BEH08', 'BEH01', 'PRB04'],
  themeColor: '#10b981',
  badgeTone: 'emerald',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Press Spin to reveal your next setting: a meeting, an email, a client call and more.',
    'Read the situation, then pick the best response before the clock runs out.',
    'The clock starts after the wheel stops, so spinning never costs you time.',
  ],
};

export default manifest;
