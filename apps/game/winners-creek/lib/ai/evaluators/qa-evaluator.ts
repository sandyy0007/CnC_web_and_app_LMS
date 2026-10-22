import type { QAQuestionItem, QAEvaluationItem, AIProvider } from "../types";

export async function generatePresentationQuestions(
  slides: { index: number; textContent: string; notes?: string | null }[],
  transcript: string,
  provider: AIProvider,
): Promise<QAQuestionItem[]> {
  if (provider.name !== "deterministic-engine") {
    try {
      const response = await provider.generateStructuredCompletion<{ questions: QAQuestionItem[] }>({
        systemPrompt: `You are an executive interviewer and technical defense chair.
Generate 2 to 3 sharp, probing defense questions about the presentation.
Questions should challenge technical depth, edge cases, trade-offs, or real-world implementation methodology.`,
        userPrompt: `Presentation Transcript:
"""${transcript.slice(0, 2000)}"""

Slide Content Summary:
${slides.map((s) => `Slide ${s.index + 1}: ${s.textContent.slice(0, 150)}`).join("\n")}`,
        schemaDescription: `{"questions": [{"id": string, "slideNumber": number, "category": "clarification" | "technical_depth" | "methodology" | "impact", "questionText": string, "context": string}]}`,
      });

      if (response?.questions && response.questions.length > 0) {
        return response.questions;
      }
    } catch (err) {
      console.warn("AI QA generator fallback to default questions:", err);
    }
  }

  // Deterministic high-quality default defense questions
  return [
    {
      id: "qa-1",
      slideNumber: 1,
      category: "technical_depth",
      questionText: "What specific architectural trade-offs did you make between throughput latency and consistency?",
      context: "Evaluation of core system design decisions.",
    },
    {
      id: "qa-2",
      slideNumber: 2,
      category: "methodology",
      questionText: "If primary node failure occurs during high traffic peak, how does the system recover without message duplication?",
      context: "Evaluation of fault tolerance and resilience.",
    },
  ];
}

export async function evaluateQAAnswer(
  question: QAQuestionItem,
  answerTranscript: string,
  provider: AIProvider,
): Promise<QAEvaluationItem> {
  const clean = answerTranscript.trim();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  let relevance = 80;
  let clarity = 80;
  let depth = 80;

  if (wordCount < 15) {
    relevance = 60;
    clarity = 70;
    depth = 55;
  } else if (wordCount > 40) {
    relevance = 88;
    clarity = 86;
    depth = 88;
  }

  if (provider.name !== "deterministic-engine") {
    try {
      const result = await provider.generateStructuredCompletion<{
        relevanceScore: number;
        clarityScore: number;
        depthScore: number;
        strengths: string[];
        weaknesses: string[];
        followUpSuggestions: string[];
      }>({
        systemPrompt: `Evaluate the student's answer to this defense question.
Scores from 0-100. Provide clear strengths and areas for improvement.`,
        userPrompt: `Question: ${question.questionText}
Context: ${question.context}
Student Answer: """${clean}"""`,
        schemaDescription: `{"relevanceScore": number, "clarityScore": number, "depthScore": number, "strengths": string[], "weaknesses": string[], "followUpSuggestions": string[]}`,
      });

      if (result) {
        relevance = result.relevanceScore;
        clarity = result.clarityScore;
        depth = result.depthScore;
      }
    } catch (err) {
      console.warn("AI QA evaluator fallback:", err);
    }
  }

  const compositeScore = Math.round((relevance * 0.4) + (clarity * 0.3) + (depth * 0.3));

  return {
    questionId: question.id,
    questionText: question.questionText,
    answerTranscript: clean,
    relevanceScore: relevance,
    clarityScore: clarity,
    depthScore: depth,
    compositeScore,
    strengths: [
      "Addressed the core inquiry directly.",
      "Demonstrated sound technical foundation.",
    ],
    weaknesses: [
      wordCount < 20 ? "Answer was brief; incorporate specific metrics or examples." : "Could clearly structure the answer using Framework-Rationale-Outcome.",
    ],
    followUpSuggestions: [
      "How would this scale if data volume grew 10x?",
    ],
  };
}
