import type { GamePluginManifest } from '../_shared/types';

export const manifest: GamePluginManifest = {
  id: 'listening-quest',
  slug: 'listening-quest',
  name: 'Listening Skills Quest: Audio Comprehension Lab',
  version: '1.0.0',
  description: 'Train active listening in real-world professional dialogues. Analyze spoken interactions, detect subtle tone and urgency cues, and extract key action items.',
  category: 'Listening & Verbal Comprehension',
  defaultDifficulty: 'BEGINNER',
  supportedParameters: ['COM06', 'COM02', 'COM04', 'COM01'],
  themeColor: '#06b6d4',
  badgeTone: 'cyan',
  durationMinutes: 12,
  xpReward: 175,
  capabilities: {
    hasAudio: true,
    hasTimer: true,
    hasLives: true,
    supportsPause: true,
    supportsAdaptiveLevels: true,
    customMechanics: ['speech-audio-engine', 'waveform-analyzer', 'speed-controls'],
  },
  instructionSteps: [
    'Listen to the spoken dialogue between workplace or academic stakeholders.',
    'Monitor the audio waveform and use speed controls (0.75x - 1.25x) to analyze cadence.',
    'Decipher speaker nuances, implicit objections, factual data, and instructions.',
    'Submit the accurate comprehension analysis to verify your active listening score.',
  ],
};

export default manifest;

