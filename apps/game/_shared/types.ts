import type * as React from 'react';

export type GameDifficultyTier = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type GameLifecycleStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'UNPUBLISHED'
  | 'ARCHIVED';

export type EEDIPillar =
  | 'communication'
  | 'confidence'
  | 'behaviour'
  | 'interview'
  | 'Communication & Linguistic Skills'
  | 'Confidence & Personality'
  | 'Leadership & Team Skills'
  | 'Problem Solving & Critical Thinking'
  | 'Career Readiness'
  | (string & {});

export interface EEDIParameterConfig {
  code: string; // e.g. "COM08", "COM06", "BEH09"
  name: string;
  pillar: EEDIPillar;
  defaultWeight: number;
  evaluationMethod: 'AUTOMATIC' | 'MANUAL' | 'HYBRID';
}

export interface GameCapabilities {
  hasAudio?: boolean;
  hasTimer?: boolean;
  hasLives?: boolean;
  supportsPause?: boolean;
  supportsAdaptiveLevels?: boolean;
  customMechanics?: string[];
}

export interface QuestionOption {
  index: number;
  text: string;
}

export interface QuestionData {
  question_id: string;
  difficulty: GameDifficultyTier | string;
  question: string;
  options: QuestionOption[];
  tag: string;
  eedi_parameter?: string;
  weight?: number;
  scenario?: string;
  passage?: string;
  lock_type?: string;
  metadata?: Record<string, any>;
  consumed_count?: number;
  current_difficulty?: string;
  lives_remaining?: number;
  raw_score?: number;
}

export type GameQuestion = QuestionData;

export interface GameContext {
  gameId: string;
  gameCode: string;
  title: string;
  category: string;
  themeColor?: string;
  badgeTone?: 'indigo' | 'purple' | 'emerald' | 'amber' | 'cyan' | 'neutral';
  timeLimitSeconds?: number;
}

export type GameEventType =
  | 'GAME_STARTED'
  | 'LEVEL_STARTED'
  | 'QUESTION_SHOWN'
  | 'ANSWER_SELECTED'
  | 'ANSWER_SUBMITTED'
  | 'ANSWER_CORRECT'
  | 'ANSWER_WRONG'
  | 'MOVE_MADE'
  | 'DECISION_MADE'
  | 'AUDIO_PLAYED'
  | 'HINT_USED'
  | 'TIMEOUT'
  | 'LIFE_LOST'
  | 'LEVEL_UP'
  | 'LEVEL_DOWN'
  | 'LEVEL_MAINTAINED'
  | 'LEVEL_COMPLETED'
  | 'LEVEL_FAILED'
  | 'GAME_COMPLETED'
  | (string & {});

export interface GameEvent {
  type: GameEventType;
  timestamp?: number;
  payload?: Record<string, any>;
}

export interface AnswerSubmissionResult {
  is_correct: boolean;
  explanation?: string;
  earned_score: number;
  lives_remaining: number;
  is_game_over: boolean;
  next_difficulty?: string;
}

export interface GameCompletionResult {
  attempt_id: string;
  final_score: number;
  accuracy: number;
  xp_awarded: number;
  eedi_scores?: Record<string, number>;
  status: 'COMPLETED' | 'FAILED' | 'ABANDONED';
}

export interface GameProps {
  gameContext: GameContext;
  attemptId: string;
  level: GameDifficultyTier;
  currentQuestion: QuestionData | null;
  lives: number;
  score: number;
  emitEvent: (event: Omit<GameEvent, 'timestamp'>) => Promise<void>;
  submitAnswer: (selectedOption: number, responseTimeMs: number) => Promise<AnswerSubmissionResult>;
  nextQuestion: () => Promise<void>;
  completeGame: () => Promise<GameCompletionResult>;
}

export interface GamePluginManifest {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  category: string;
  defaultDifficulty: GameDifficultyTier;
  supportedParameters: string[]; // EEDI Parameter codes (e.g. COM04, COM06)
  themeColor: string;
  badgeTone: 'indigo' | 'purple' | 'emerald' | 'amber' | 'cyan' | 'neutral';
  durationMinutes: number;
  xpReward: number;
  capabilities: GameCapabilities;
  instructionSteps: string[];
  defaultConfig?: Record<string, any>;
}

export interface GamePlugin extends GamePluginManifest {
  component: React.ComponentType<GameProps>;
}

