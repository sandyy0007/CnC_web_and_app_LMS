import type {
  InterviewQuestionItem,
  InterviewAnswerEvaluation,
  InterviewSessionSynthesis,
  StarAnalysis,
  AIProvider,
} from "../types";
import { getAIProvider } from "../factory";

export async function evaluateInterviewAnswer(
  question: InterviewQuestionItem,
  answerTranscript: string,
  role: string,
  seniority: string,
  provider: AIProvider = getAIProvider(),
): Promise<InterviewAnswerEvaluation> {
  const clean = answerTranscript.trim();
  const lower = clean.toLowerCase();

  // 1. STAR Detection
  const situationDetected = /\b(when|at my previous|in my last|our team had|we faced|there was|the problem was)\b/i.test(lower);
  const taskDetected = /\b(my goal|my task|my role|i was responsible for|i needed to|the objective was)\b/i.test(lower);
  const actionDetected = /\b(i designed|i built|i implemented|i led|i decided|i refactored|i communicated|i created)\b/i.test(lower);
  const resultDetected = /\b(as a result|resulting in|reduced|increased|improved|we achieved|saved|dropped by)\b/i.test(lower) || /\d+%/i.test(clean);

  const starAnalysis: StarAnalysis = {
    situation: { detected: situationDetected, evidence: situationDetected ? "Established context and baseline problem" : undefined },
    task: { detected: taskDetected, evidence: taskDetected ? "Identified core ownership and challenge" : undefined },
    action: { detected: actionDetected, evidence: actionDetected ? "Detailed specific individual technical contribution" : undefined },
    result: { detected: resultDetected, evidence: resultDetected ? "Quantified measurable outcome or resolution" : undefined },
    isCompleteStar: situationDetected && taskDetected && actionDetected && resultDetected,
  };

  // Base scores
  let relevance = 80;
  let specificity = 78;
  let completeness = 75;
  let communication = 82;
  let technical = 80;

  if (starAnalysis.isCompleteStar) {
    specificity += 10;
    completeness += 12;
  }
  if (clean.length < 50) {
    relevance -= 20;
    completeness -= 25;
    specificity -= 20;
  }

  // If using LLM provider, enhance with rich feedback
  if (provider.name !== "deterministic-engine") {
    try {
      const response = await provider.generateStructuredCompletion<{
        relevanceScore: number;
        specificityScore: number;
        completenessScore: number;
        communicationScore: number;
        technicalScore: number;
        whatWasGood: string[];
        whatWasMissing: string[];
        betterAnswerStructure: string;
        adaptiveFollowUpQuestion?: string;
      }>({
        systemPrompt: `You are a Principal Bar Raiser interviewer at a tier-1 tech company evaluating a candidate for ${role} (${seniority}).
Evaluate this candidate's response to the interview question.
Scores must be between 0 and 100.
Evaluate whether they used the STAR method, their depth, and clarity.
If appropriate, generate an adaptive follow-up question to probe deeper.`,
        userPrompt: `Role: ${role} (${seniority})
Question Category: ${question.category}
Question Text: ${question.questionText}
Candidate Spoken Answer:
"""${clean}"""`,
        schemaDescription: `{"relevanceScore": number, "specificityScore": number, "completenessScore": number, "communicationScore": number, "technicalScore": number, "whatWasGood": string[], "whatWasMissing": string[], "betterAnswerStructure": string, "adaptiveFollowUpQuestion": string}`,
      });

      if (response) {
        relevance = response.relevanceScore;
        specificity = response.specificityScore;
        completeness = response.completenessScore;
        communication = response.communicationScore;
        technical = response.technicalScore;

        const overall = Math.round(
          (relevance * 0.25) +
          (specificity * 0.20) +
          (completeness * 0.20) +
          (communication * 0.15) +
          (technical * 0.20)
        );

        return {
          questionId: question.id,
          answerTranscript: clean,
          relevanceScore: relevance,
          specificityScore: specificity,
          completenessScore: completeness,
          communicationScore: communication,
          technicalScore: technical,
          overallAnswerScore: overall,
          starAnalysis,
          whatWasGood: response.whatWasGood ?? ["Addressed the core question with direct framing."],
          whatWasMissing: response.whatWasMissing ?? ["Could provide deeper quantitative evidence of impact."],
          betterAnswerStructure: response.betterAnswerStructure,
          adaptiveFollowUpQuestion: response.adaptiveFollowUpQuestion,
        };
      }
    } catch (err) {
      console.warn("AI interview evaluator fallback to deterministic scoring:", err);
    }
  }

  const overall = Math.round(
    (relevance * 0.25) +
    (specificity * 0.20) +
    (completeness * 0.20) +
    (communication * 0.15) +
    (technical * 0.20)
  );

  return {
    questionId: question.id,
    answerTranscript: clean,
    relevanceScore: relevance,
    specificityScore: specificity,
    completenessScore: completeness,
    communicationScore: communication,
    technicalScore: technical,
    overallAnswerScore: overall,
    starAnalysis,
    whatWasGood: [
      "Direct response addressing the primary scenario.",
      starAnalysis.isCompleteStar ? "Strong structured narrative following the STAR framework." : "Good technical vocabulary.",
    ],
    whatWasMissing: [
      !resultDetected ? "Did not quantify the final business or engineering impact (e.g. latency, costs, SLA improvement)." : "Could detail trade-offs considered prior to choosing this solution.",
    ],
    betterAnswerStructure: "Situation (20s) -> Task (10s) -> Action & Architecture (60s) -> Measured Result & Takeaway (20s)",
    adaptiveFollowUpQuestion: !resultDetected ? "What were the specific quantitative metrics that proved your solution succeeded?" : undefined,
  };
}

export function synthesizeInterviewSession(
  evaluations: InterviewAnswerEvaluation[],
): InterviewSessionSynthesis {
  if (evaluations.length === 0) {
    return {
      compositeScore: 0,
      recommendation: "lean_no_hire",
      strengths: ["No interview answers recorded yet."],
      areasForGrowth: ["Complete at least one question to receive synthesis."],
      executiveSummary: "Incomplete interview session.",
    };
  }

  const totalScore = evaluations.reduce((sum, e) => sum + e.overallAnswerScore, 0);
  const compositeScore = Math.round(totalScore / evaluations.length);

  let recommendation: InterviewSessionSynthesis["recommendation"] = "lean_hire";
  if (compositeScore >= 88) recommendation = "strong_hire";
  else if (compositeScore >= 78) recommendation = "hire";
  else if (compositeScore >= 68) recommendation = "lean_hire";
  else if (compositeScore >= 55) recommendation = "lean_no_hire";
  else recommendation = "no_hire";

  const allGood = evaluations.flatMap((e) => e.whatWasGood);
  const allMissing = evaluations.flatMap((e) => e.whatWasMissing);

  return {
    compositeScore,
    recommendation,
    strengths: Array.from(new Set(allGood)).slice(0, 4),
    areasForGrowth: Array.from(new Set(allMissing)).slice(0, 4),
    executiveSummary: `Candidate completed ${evaluations.length} interview questions with an overall composite score of ${compositeScore}/100 (${recommendation.replace("_", " ").toUpperCase()}). Demonstrated clear technical competence and structured responses across primary scenarios.`,
  };
}
