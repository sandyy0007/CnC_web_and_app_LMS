import type { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'template-game',
  slug: 'template-game',
  name: 'Winners Creek Game Plugin Template',
  version: '1.0.0',
  description: 'Reference starter template for building drop-in interactive game plugins for Winners Creek LMS.',
  category: 'Critical Thinking',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM01', 'COM06'],
  themeColor: '#6366f1',
  badgeTone: 'indigo',
  durationMinutes: 10,
  xpReward: 150,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsPause: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['decision-tree', 'quick-reaction'],
  },
  instructionSteps: [
    'Analyze the challenge presented in the briefing terminal.',
    'Make tactical decisions or answer multiple-choice skill prompts.',
    'Preserve your lives and climb adaptive difficulty tiers.',
    'Conclude the mission to earn XP and register verified EEDI evidence.',
  ],
  defaultConfig: {
    startingLives: 3,
    basePoints: 100,
  },
};

export default manifest;

