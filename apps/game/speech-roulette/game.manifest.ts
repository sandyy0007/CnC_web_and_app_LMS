import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'speech-roulette',
  slug: 'speech-roulette',
  name: 'Speech Roulette: Spin, Think, Speak',
  version: '1.0.0',
  description:
    'Spin the reel, land on a topic, and pick the angle that turns one word into something you can speak about.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM07', 'CNF04', 'PRB04'],
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
    'The reel spins and lands on a topic word. The clock starts when it stops.',
    'Pick the angle that turns the word into something specific you can speak about (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to think for a moment and then speak on the topic.',
  ],
};

export default manifest;
