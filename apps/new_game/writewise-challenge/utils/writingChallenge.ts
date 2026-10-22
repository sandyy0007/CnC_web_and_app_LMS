import type { QuestionData, GameDifficultyTier } from '../../_shared/types';

export type ChallengeType =
  | 'fix_the_sentence'
  | 'professional_rewrite'
  | 'tone_detective'
  | 'sentence_builder'
  | 'concise_writing'
  | 'email_response';

export interface ChallengeMetadata {
  type: ChallengeType;
  title: string;
  badgeLabel: string;
  badgeColor: string;
  documentTabName: string;
  icon: string;
  guidanceText: string;
}

export const CHALLENGE_META: Record<ChallengeType, ChallengeMetadata> = {
  fix_the_sentence: {
    type: 'fix_the_sentence',
    title: 'Fix the Sentence',
    badgeLabel: 'Grammar & Syntax',
    badgeColor: 'amber',
    documentTabName: 'proofreading_draft.txt',
    icon: '✏️',
    guidanceText: 'Identify grammatical, punctuation, and subject-verb agreement corrections.',
  },
  professional_rewrite: {
    type: 'professional_rewrite',
    title: 'Professional Rewrite',
    badgeLabel: 'Business Polish',
    badgeColor: 'sky',
    documentTabName: 'slack_to_formal.md',
    icon: '💼',
    guidanceText: 'Transform informal, casual messages into respectful workplace communications.',
  },
  tone_detective: {
    type: 'tone_detective',
    title: 'Tone Detective',
    badgeLabel: 'Tone Analysis',
    badgeColor: 'purple',
    documentTabName: 'tone_audit.eml',
    icon: '🕵️',
    guidanceText: 'Detect underlying emotional nuance: aggressive, passive-aggressive, casual, or professional.',
  },
  sentence_builder: {
    type: 'sentence_builder',
    title: 'Sentence Builder',
    badgeLabel: 'Syntactic Flow',
    badgeColor: 'emerald',
    documentTabName: 'sentence_blocks.ts',
    icon: '🧩',
    guidanceText: 'Reassemble scrambled phrases into an authoritative, parallel sentence structure.',
  },
  concise_writing: {
    type: 'concise_writing',
    title: 'Concise Writing',
    badgeLabel: 'Brevity & Impact',
    badgeColor: 'rose',
    documentTabName: 'executive_trim.md',
    icon: '✂️',
    guidanceText: 'Eliminate redundant qualifiers, passive bloating, and corporate jargon.',
  },
  email_response: {
    type: 'email_response',
    title: 'Email Response',
    badgeLabel: 'Executive Comms',
    badgeColor: 'indigo',
    documentTabName: 'outlook_inbox.eml',
    icon: '✉️',
    guidanceText: 'Formulate a diplomatic, solution-oriented response balancing tact and boundaries.',
  },
};

export function detectChallengeType(question: QuestionData | null): ChallengeType {
  if (!question) return 'fix_the_sentence';

  const tag = (question.tag || '').toLowerCase();
  if (tag in CHALLENGE_META) {
    return tag as ChallengeType;
  }

  const promptText = (question.question + ' ' + (question.scenario || '')).toLowerCase();
  if (promptText.includes('tone') || promptText.includes('detective')) return 'tone_detective';
  if (promptText.includes('builder') || promptText.includes('fragment') || promptText.includes('assemble')) return 'sentence_builder';
  if (promptText.includes('concise') || promptText.includes('repetitive') || promptText.includes('bloat')) return 'concise_writing';
  if (promptText.includes('rewrite') || promptText.includes('informal') || promptText.includes('slack')) return 'professional_rewrite';
  if (promptText.includes('email') || promptText.includes('reply') || promptText.includes('response')) return 'email_response';
  if (promptText.includes('grammar') || promptText.includes('correct') || promptText.includes('fix')) return 'fix_the_sentence';

  return 'fix_the_sentence';
}

export function getTierDisplay(tier: GameDifficultyTier): { title: string; subtitle: string; color: string } {
  switch (tier) {
    case 'BEGINNER':
      return { title: 'Warm Up', subtitle: 'Tier 1 • Foundations', color: 'emerald' };
    case 'INTERMEDIATE':
      return { title: 'Workplace Pro', subtitle: 'Tier 2 • Collaborative Impact', color: 'sky' };
    case 'ADVANCED':
      return { title: 'Executive Writer', subtitle: 'Tier 3 • High-Stakes Strategy', color: 'purple' };
    default:
      return { title: 'Standard', subtitle: 'General Practice', color: 'slate' };
  }
}

export function generateHintForQuestion(question: QuestionData): string {
  const type = detectChallengeType(question);
  switch (type) {
    case 'fix_the_sentence':
      return 'Hint: Focus on subject-verb agreement and whether singular collective nouns match singular auxiliary verbs.';
    case 'professional_rewrite':
      return 'Hint: Eliminate conversational slang, state your core intention courteously, and offer next steps.';
    case 'tone_detective':
      return 'Hint: Look for subtle frustration signals like "per my previous email" or emotional blame shifting.';
    case 'sentence_builder':
      return 'Hint: Standard English business syntax starts with the context modifier or imperative action, followed directly by the object.';
    case 'concise_writing':
      return 'Hint: The strongest sentence has the fewest wasted words. Strip phrases like "due to the fact that" or "at this point in time".';
    case 'email_response':
      return 'Hint: Avoid both emotional defensiveness and submissive surrender. Offer practical, structured options with clear timelines.';
  }
}
