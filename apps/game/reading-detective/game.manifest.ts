import type { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'reading-detective',
  slug: 'reading-detective',
  name: 'Reading Detective: Case Investigation Bureau',
  version: '1.0.0',
  description: 'Inspect case files, cross-examine witness statements, and solve workplace mysteries using deductive reasoning and comprehension skills.',
  category: 'Critical Thinking',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM04', 'COM06', 'COM05'],
  themeColor: '#a78bfa',
  badgeTone: 'purple',
  durationMinutes: 12,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsPause: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['dossier-inspection', 'suspect-interrogation'],
  },
  instructionSteps: [
    'Examine the incident dossier, timeline, and witness statements.',
    'Interrogate contradictory evidence across Detail, Vocabulary, and Inference interrogations.',
    'Maintain your detective badge by preserving your 3 investigation hearts.',
    'Synthesize the evidence to close the case and verify your problem-solving EEDI score.',
  ],
};

export default manifest;

