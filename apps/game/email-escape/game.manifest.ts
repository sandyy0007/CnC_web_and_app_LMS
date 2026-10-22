import type { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'email-escape',
  slug: 'email-escape',
  name: 'Email Escape Room: Save the Deal',
  version: '1.0.0',
  description: 'Investigate high-stakes workplace case files. Pin critical evidence, rebuild trust circuits, and coordinate operational deadlines before key accounts are lost.',
  category: 'Critical Thinking & Writing',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM08', 'COM06', 'BEH09', 'COM05'],
  themeColor: '#8b5cf6',
  badgeTone: 'purple',
  durationMinutes: 15,
  xpReward: 200,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsPause: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['evidence-board', 'response-circuit', 'deadline-grid'],
  },
  instructionSteps: [
    'Examine the crisis briefing file and incoming client escalation alerts.',
    'Pin the case-breaking operational evidence cards to the investigation board.',
    'Sequence the psychological trust circuit to defuse executive panic.',
    'Deploy the milestone recovery grid and transmit the deal-saving response.',
  ],
};

export default manifest;

