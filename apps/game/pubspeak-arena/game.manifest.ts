import type { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'pubspeak-arena',
  slug: 'pubspeak-arena',
  name: 'Public Speaking & Stage Simulator: The Executive Arena',
  version: '1.0.0',
  description: 'Confront real-time audience dynamics on a virtual stage. Master speech pacing, eliminate verbal fillers, overcome tough Q&A interruptions, and maintain composure under pressure.',
  category: 'Public Speaking & Confidence',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM07', 'CNF04', 'CNF01', 'COM01'],
  themeColor: '#6366f1',
  badgeTone: 'indigo',
  durationMinutes: 15,
  xpReward: 225,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsPause: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['virtual-stage', 'audience-avatars', 'pacing-gauge', 'filler-eradicator'],
  },
  instructionSteps: [
    'Step onto the virtual keynote stage facing real-time audience personalities.',
    'Deliver composed opening hooks and master ideal presentation cadence (130-150 WPM).',
    'Defuse hostile interruptions, eliminate verbal fillers, and maintain vocal poise.',
    'Deliver the decisive golden close to secure executive stakeholder consensus.',
  ],
};

export default manifest;

