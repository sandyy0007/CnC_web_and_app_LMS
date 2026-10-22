/**
 * Registry of Production Gamified Learning Modules.
 * Standardizes metadata, icons, categories, and module bindings.
 */

export interface GameMetadata {
  code: string;
  title: string;
  shortTitle: string;
  description: string;
  category:
    | 'Reading Comprehension'
    | 'Critical Thinking'
    | 'Vocabulary & Professional Polish'
    | 'Communication'
    | 'Critical Thinking & Writing'
    | 'Listening & Verbal Comprehension'
    | 'Public Speaking & Confidence';
  durationMinutes: number;
  xpReward: number;
  supportedParameters: string[];
  themeColor: string;
  badgeTone: 'indigo' | 'purple' | 'emerald' | 'amber' | 'cyan';
  instructionSteps: string[];
}

export const GAME_REGISTRY: Record<string, GameMetadata> = {
  'read-escape': {
    code: 'read-escape',
    title: 'Read & Escape: The Virtual Lockroom',
    shortTitle: 'Read & Escape',
    description:
      'Analyze reading passages, discover hidden investigative clues, and crack the Detail, Vocabulary, and Inference locks to escape before time expires.',
    category: 'Reading Comprehension',
    durationMinutes: 10,
    xpReward: 150,
    supportedParameters: ['COM04', 'COM06', 'COM05'],
    themeColor: '#38bdf8',
    badgeTone: 'cyan',
    instructionSteps: [
      'Read the passage carefully in the Reading Room on the left.',
      'Solve each virtual lock by selecting the correct analysis option.',
      'You have 3 lives. Each incorrect deduction forfeits a life.',
      'Unlock all 3 locks to crack the chamber and register your EEDI rating.',
    ],
  },
  'reading-detective': {
    code: 'reading-detective',
    title: 'Reading Detective: Case Investigation Bureau',
    shortTitle: 'Reading Detective',
    description:
      'Inspect case files, cross-examine witness statements, and solve workplace mysteries using deductive reasoning and comprehension skills.',
    category: 'Critical Thinking',
    durationMinutes: 12,
    xpReward: 175,
    supportedParameters: ['COM04', 'COM06', 'COM05'],
    themeColor: '#a78bfa',
    badgeTone: 'purple',
    instructionSteps: [
      'Examine the incident dossier, timeline, and witness statements.',
      'Interrogate contradictory evidence across Detail, Vocabulary, and Inference interrogations.',
      'Maintain your detective badge by preserving your 3 investigation hearts.',
      'Synthesize the evidence to close the case and verify your problem-solving EEDI score.',
    ],
  },
  'snake-ladder': {
    code: 'snake-ladder',
    title: 'Snake & Ladder: Professional Communications Arena',
    shortTitle: 'Snake & Ladder',
    description:
      'Ascend the 100-cell corporate ladder. Climb career accelerators and confront high-stakes snake questions in vocabulary, grammar, and pronunciation.',
    category: 'Vocabulary & Professional Polish',
    durationMinutes: 15,
    xpReward: 200,
    supportedParameters: ['COM04', 'COM02', 'COM05', 'COM01'],
    themeColor: '#22c55e',
    badgeTone: 'emerald',
    instructionSteps: [
      'Roll the dice to navigate your token through the 100-cell board.',
      'Land on ladders to advance rapidly up the corporate ranks.',
      'Landing on a snake triggers an instant Communication Challenge question.',
      'Answer correctly to defeat the snake and stay up; answer wrong to slide down!',
      'Reach cell 100 to conquer the arena and earn master communication XP.',
    ],
  },
  'email-escape': {
    code: 'email-escape',
    title: 'Email Escape Room: Save the Deal',
    shortTitle: 'Email Escape',
    description:
      'Investigate high-stakes workplace case files. Pin critical evidence, rebuild trust circuits, and coordinate operational deadlines before key accounts are lost.',
    category: 'Critical Thinking & Writing',
    durationMinutes: 15,
    xpReward: 200,
    supportedParameters: ['COM08', 'COM06', 'BEH09', 'COM05'],
    themeColor: '#8b5cf6',
    badgeTone: 'purple',
    instructionSteps: [
      'Examine the crisis briefing file and incoming client escalation alerts.',
      'Pin the case-breaking operational evidence cards to the investigation board.',
      'Sequence the psychological trust circuit to defuse executive panic.',
      'Deploy the milestone recovery grid and transmit the deal-saving response.',
    ],
  },
  'inbox-rescue': {
    code: 'inbox-rescue',
    title: 'Inbox Rescue: Professional Email Fixer',
    shortTitle: 'Inbox Rescue',
    description:
      'Repair unprofessional, hostile, and vague emails. Scan hostile signals, forge high-impact subject lines, and structure executive message stacks.',
    category: 'Communication',
    durationMinutes: 12,
    xpReward: 175,
    supportedParameters: ['COM08', 'COM05', 'COM04', 'BEH08'],
    themeColor: '#f59e0b',
    badgeTone: 'amber',
    instructionSteps: [
      'Analyze the incoming unprofessional or escalated message in the Inbox Terminal.',
      'Disarm emotional hostility and detect manipulative or aggressive phrasing.',
      'Forge high-impact subject lines and arrange respectful request skeletons.',
      'Transmit calibrated executive communications to preserve client and mentor trust.',
    ],
  },
  'listening-quest': {
    code: 'listening-quest',
    title: 'Listening Skills Quest: Audio Comprehension Lab',
    shortTitle: 'Listening Quest',
    description:
      'Train active listening in real-world professional dialogues. Analyze spoken interactions, detect subtle tone and urgency cues, and extract key action items.',
    category: 'Listening & Verbal Comprehension',
    durationMinutes: 12,
    xpReward: 175,
    supportedParameters: ['COM06', 'COM02', 'COM04', 'COM01'],
    themeColor: '#06b6d4',
    badgeTone: 'cyan',
    instructionSteps: [
      'Listen to the spoken dialogue between workplace or academic stakeholders.',
      'Monitor the audio waveform and use speed controls (0.75x - 1.25x) to analyze cadence.',
      'Decipher speaker nuances, implicit objections, factual data, and instructions.',
      'Submit the accurate comprehension analysis to verify your active listening score.',
    ],
  },
  'pubspeak-arena': {
    code: 'pubspeak-arena',
    title: 'Public Speaking & Stage Simulator: The Executive Arena',
    shortTitle: 'Stage Simulator',
    description:
      'Confront real-time audience dynamics on a virtual stage. Master speech pacing, eliminate verbal fillers, overcome tough Q&A interruptions, and maintain composure under pressure.',
    category: 'Public Speaking & Confidence',
    durationMinutes: 15,
    xpReward: 225,
    supportedParameters: ['COM07', 'CNF04', 'CNF01', 'COM01'],
    themeColor: '#6366f1',
    badgeTone: 'indigo',
    instructionSteps: [
      'Step onto the virtual keynote stage facing real-time audience personalities.',
      'Deliver composed opening hooks and master ideal presentation cadence (130-150 WPM).',
      'Defuse hostile interruptions, eliminate verbal fillers, and maintain vocal poise.',
      'Deliver the decisive golden close to secure executive stakeholder consensus.',
    ],
  },
};

import { DISCOVERED_PLUGINS } from '@games';

export function getGameMetadata(codeOrId: string): GameMetadata | undefined {
  const normalized = (codeOrId || '').toLowerCase().trim();
  if (GAME_REGISTRY[normalized]) return GAME_REGISTRY[normalized];
  // Match by prefix or fuzzy key
  for (const [key, meta] of Object.entries(GAME_REGISTRY)) {
    if (normalized.includes(key) || key.includes(normalized) || meta.code === normalized) {
      return meta;
    }
  }

  // Lookup in discovered plugins
  const plugin = DISCOVERED_PLUGINS[normalized];
  if (plugin) {
    return {
      code: plugin.slug,
      title: plugin.name,
      shortTitle: plugin.name.split(':')[0],
      description: plugin.description,
      category: plugin.category as any,
      durationMinutes: plugin.durationMinutes,
      xpReward: plugin.xpReward,
      supportedParameters: plugin.supportedParameters,
      themeColor: plugin.themeColor,
      badgeTone: (plugin.badgeTone === 'neutral' ? 'indigo' : plugin.badgeTone) as any,
      instructionSteps: plugin.instructionSteps,
    };
  }

  return undefined;
}

