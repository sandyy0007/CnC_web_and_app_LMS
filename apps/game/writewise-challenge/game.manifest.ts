import { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'writewise-challenge',
  slug: 'writewise-challenge',
  name: 'WriteWise: Professional Writing Challenge',
  version: '1.0.0',
  description:
    'Sharpen written communication and business acumen through interactive editing challenges, tone detection, and scenario-based workplace writing simulations.',
  category: 'Writing & Professional Communication',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM08', 'COM05', 'COM02', 'COM04'],
  themeColor: '#0284c7',
  badgeTone: 'cyan',
  durationMinutes: 15,
  xpReward: 200,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['hints'],
  },
  instructionSteps: [
    'Analyze the workplace context, tone requirements, and communication objective.',
    'Select or compose the most professional, grammatically sound, and concise writing response.',
    'Maintain your 3 lives and build your writing streak to advance through difficulty tiers.',
    'Use strategic hints when tackling complex executive scenarios without breaking your focus.',
  ],
  defaultConfig: {
    defaultLives: 3,
    maxHints: 3,
    speedBonusThresholdMs: 15000,
  },
};

export default manifest;
