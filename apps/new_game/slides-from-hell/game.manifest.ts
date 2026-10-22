import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'slides-from-hell',
  slug: 'slides-from-hell',
  name: 'Slides From Hell: Commit to the Chaos',
  version: '1.0.0',
  description:
    'A silly topic and a slide you have never seen. Pick the line that commits to the story and ties the image to the topic.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['CNF04', 'PRB04', 'COM07'],
  themeColor: '#ec4899',
  badgeTone: 'purple',
  durationMinutes: 8,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read your silly presentation topic, then look at the slide that appears.',
    'Pick the line that commits to a story and links the image to the topic (tap or press 1 to 4).',
    'Turn on Speak-aloud practice to improvise your line out loud.',
  ],
};

export default manifest;
