import type { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'inbox-rescue',
  slug: 'inbox-rescue',
  name: 'Inbox Rescue: Professional Email Fixer',
  version: '1.0.0',
  description: 'Repair unprofessional, hostile, and vague emails. Scan hostile signals, forge high-impact subject lines, and structure executive message stacks.',
  category: 'Communication',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM08', 'COM05', 'COM04', 'BEH08'],
  themeColor: '#f59e0b',
  badgeTone: 'amber',
  durationMinutes: 12,
  xpReward: 175,
  capabilities: {
    hasTimer: true,
    hasLives: true,
    supportsPause: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['scanner', 'forge', 'order', 'compose'],
  },
  instructionSteps: [
    'Analyze the incoming unprofessional or escalated message in the Inbox Terminal.',
    'Disarm emotional hostility and detect manipulative or aggressive phrasing.',
    'Forge high-impact subject lines and arrange respectful request skeletons.',
    'Transmit calibrated executive communications to preserve client and mentor trust.',
  ],
};

export default manifest;

