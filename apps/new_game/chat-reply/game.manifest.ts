import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'chat-reply',
  slug: 'chat-reply',
  name: 'Chat Reply: Say the Right Thing',
  version: '1.0.0',
  description:
    'Read a workplace chat thread and pick the reply that keeps the conversation professional, clear and respectful.',
  category: 'Critical Thinking & Leadership',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['BEH08', 'COM06', 'COM05'],
  themeColor: '#06b6d4',
  badgeTone: 'cyan',
  durationMinutes: 10,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Read the chat thread and notice the tone of the last message.',
    'Pick the reply that is clear, respectful and moves things forward.',
    'Threads get longer and the tone gets harder to read as you level up.',
  ],
};

export default manifest;
