import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'memory-vault',
  slug: 'memory-vault',
  name: 'Memory Vault: Watch & Recall',
  version: '1.0.0',
  description:
    'Memorise a set of workplace words and their meanings, watch the cards flip face down, then answer a recall question from memory.',
  category: 'Vocabulary & Professional Polish',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM04', 'COM02', 'COM05'],
  themeColor: '#475569',
  badgeTone: 'neutral',
  durationMinutes: 12,
  xpReward: 200,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
  },
  instructionSteps: [
    'Study the word cards before they flip face down.',
    'Answer the recall question from memory.',
    'Longer lists and shorter study times appear as you level up.',
  ],
};

export default manifest;
