import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'framework-master',
  slug: 'framework-master',
  name: 'Framework Master: Structure It Fast',
  version: '1.0.0',
  description:
    'A work prompt and a framework. Pick the answer that follows every step of the framework, in order, and gets to the point.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM05', 'COM07', 'PRB04'],
  themeColor: '#0ea5e9',
  badgeTone: 'cyan',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'A work prompt appears with a framework such as PREP or Situation, Impact, Action.',
    'Pick the answer that follows every step of the framework, in order (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to answer the prompt out loud using the framework, one step at a time.',
  ],
};

export default manifest;
