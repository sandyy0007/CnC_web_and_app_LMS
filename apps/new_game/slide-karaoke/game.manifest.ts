import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'slide-karaoke',
  slug: 'slide-karaoke',
  name: 'Slide Karaoke: Present the Unseen Deck',
  version: '1.0.0',
  description:
    'A slide you have never seen, an audience waiting. Pick the opening line that gives them the message before they lose interest.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM07', 'COM05', 'CNF04'],
  themeColor: '#ec4899',
  badgeTone: 'purple',
  durationMinutes: 10,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'The curtain lifts on a slide you have not seen. Read the title and bullets quickly.',
    'Pick the opening line that gives the audience the message first (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to say your opening line aloud and add a sentence about the next bullet.',
  ],
};

export default manifest;
