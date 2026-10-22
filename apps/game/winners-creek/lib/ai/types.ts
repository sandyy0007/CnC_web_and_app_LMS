export interface SlideFinding {
  slideIndex: number;
  title?: string;
  findingType: "relevance" | "slide_reading" | "skipped_content" | "deep_explanation" | "pace";
  observation: string;
  exactTranscriptQuote?: string;
  recommendation: string;
  severity: "info" | "positive" | "suggestion" | "critical";
}

export interface CategoryEvaluation {
  score: number;
  strengths: string[];
  weaknesses: string[];
  exactTranscriptQuotes: string[];
  recommendation: string;
  rubricBreakdown?: Record<string, number>;
}

export interface PresentationEvaluationResult {
  overallScore: number;
  weightsUsed: Record<string, number>;
  executiveSummary: string;
  categories: {
    content: CategoryEvaluation;
    structure: CategoryEvaluation;
    communication: CategoryEvaluation;
    delivery: CategoryEvaluation;
    timeManagement: CategoryEvaluation;
    slideHandling: CategoryEvaluation;
    qa: CategoryEvaluation;
  };
  slideFindings: SlideFinding[];
  practicePlan: {
    immediateActions: string[];
    skillDrills: string[];
    longTermGoals: string[];
  };
  evaluationVersion: string;
  evaluatedAt: string;
  aiProviderUsed: string; // e.g. "openai/gpt-4o", "anthropic/claude-3-5-sonnet", or "deterministic-engine"
}

export interface QAQuestionItem {
  id: string;
  slideNumber?: number;
  category: "clarification" | "technical_depth" | "methodology" | "impact";
  questionText: string;
  context: string;
}

export interface QAEvaluationItem {
  questionId: string;
  questionText: string;
  answerTranscript: string;
  relevanceScore: number;
  clarityScore: number;
  depthScore: number;
  compositeScore: number;
  strengths: string[];
  weaknesses: string[];
  followUpSuggestions: string[];
}

export interface InterviewQuestionItem {
  id: string;
  orderIndex: number;
  questionText: string;
  category: "introduction" | "technical" | "behavioral" | "system_design" | "problem_solving" | "follow_up" | (string & {});
  isFollowUp?: boolean;
  contextNotes?: string;
}

export interface StarAnalysis {
  situation: { detected: boolean; evidence?: string };
  task: { detected: boolean; evidence?: string };
  action: { detected: boolean; evidence?: string };
  result: { detected: boolean; evidence?: string };
  isCompleteStar: boolean;
}

export interface InterviewAnswerEvaluation {
  questionId: string;
  answerTranscript: string;
  relevanceScore: number;
  specificityScore: number;
  completenessScore: number;
  communicationScore: number;
  technicalScore: number;
  overallAnswerScore: number;
  starAnalysis?: StarAnalysis;
  whatWasGood: string[];
  whatWasMissing: string[];
  betterAnswerStructure?: string;
  adaptiveFollowUpQuestion?: string;
}

export interface InterviewSessionSynthesis {
  compositeScore: number;
  recommendation: "strong_hire" | "hire" | "lean_hire" | "lean_no_hire" | "no_hire";
  strengths: string[];
  areasForGrowth: string[];
  executiveSummary: string;
}

export interface AIProvider {
  name: string;
  generateStructuredCompletion<T>(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    schemaDescription?: string;
  }): Promise<T>;
  generateText(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<string>;
}

export interface SpeechProvider {
  name: string;
  transcribeAudio(audioBytes: Uint8Array, mimeType: string): Promise<{
    transcript: string;
    confidence?: number;
    words?: { word: string; start: number; end: number }[];
  }>;
}
