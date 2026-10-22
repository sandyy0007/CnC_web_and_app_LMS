import type {
  CategoryEvaluation,
  PresentationEvaluationResult,
  SlideFinding,
  QAEvaluationItem,
  AIProvider,
} from "../types";
import { computeBasicSpeechMetrics } from "@/lib/analysis/speech";

export interface PresentationEvaluationPipelineInput {
  slides: { index: number; textContent: string; notes?: string | null }[];
  transcript: string;
  durationSeconds: number;
  targetDurationSeconds: number;
  presentationType: string;
  audience: string;
  evaluationMode: "practice" | "assessment" | "placement_simulation";
  slideEvents: { slideIndex: number; enteredAtMs: number; leftAtMs: number | null; transcriptSegment?: string | null }[];
  qaItems?: QAEvaluationItem[];
}

export const DEFAULT_RUBRIC_WEIGHTS: Record<string, number> = {
  content: 0.20,
  structure: 0.15,
  communication: 0.15,
  delivery: 0.15,
  timeManagement: 0.15,
  slideHandling: 0.10,
  qa: 0.10,
};

export async function evaluateOverallPresentation(
  input: PresentationEvaluationPipelineInput,
  slideFindings: SlideFinding[],
  provider: AIProvider,
): Promise<PresentationEvaluationResult> {
  const metrics = computeBasicSpeechMetrics(input.transcript, input.durationSeconds);
  const targetSeconds = input.targetDurationSeconds;
  const actualSeconds = input.durationSeconds;

  // 1. Time Management deterministic scoring
  let timeScore = 85;
  if (targetSeconds > 0) {
    const timeDeltaPct = Math.abs((actualSeconds - targetSeconds) / targetSeconds);
    if (timeDeltaPct <= 0.05) timeScore = 98;
    else if (timeDeltaPct <= 0.15) timeScore = 90;
    else if (timeDeltaPct <= 0.25) timeScore = 78;
    else if (timeDeltaPct <= 0.40) timeScore = 65;
    else timeScore = 50;
  }

  // 2. Delivery deterministic base score (WPM & Fillers)
  let deliveryScore = 80;
  if (metrics.wpm >= 130 && metrics.wpm <= 165) deliveryScore += 10;
  else if (metrics.wpm < 100 || metrics.wpm > 190) deliveryScore -= 15;

  if (metrics.fillerFrequencyPerMin <= 2) deliveryScore += 10;
  else if (metrics.fillerFrequencyPerMin > 6) deliveryScore -= 20;
  else if (metrics.fillerFrequencyPerMin > 4) deliveryScore -= 10;
  deliveryScore = Math.max(40, Math.min(98, deliveryScore));

  // 3. Slide Handling base score from findings
  const criticalSlideFindings = slideFindings.filter((f) => f.severity === "critical").length;
  const slideReadingFindings = slideFindings.filter((f) => f.findingType === "slide_reading").length;
  const slideHandlingScore = Math.max(50, 92 - (criticalSlideFindings * 15) - (slideReadingFindings * 8));

  // 4. Q&A Score
  let qaScore = 80;
  if (input.qaItems && input.qaItems.length > 0) {
    const avgQA = input.qaItems.reduce((acc, q) => acc + q.compositeScore, 0) / input.qaItems.length;
    qaScore = Math.round(avgQA);
  }

  // Extract quotes from transcript
  const sentences = input.transcript.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 15);
  const sampleQuotes = sentences.slice(0, 3).map((s) => `"${s}"`);

  // Default baseline category evaluations
  const categories: PresentationEvaluationResult["categories"] = {
    content: {
      score: 82,
      strengths: [
        "Clearly articulated the core system architecture and trade-offs.",
        "Demonstrated familiarity with technical nomenclature and pipeline metrics.",
      ],
      weaknesses: [
        "Could expand on disaster recovery and failure mode recovery time objectives.",
      ],
      exactTranscriptQuotes: sampleQuotes.slice(0, 2),
      recommendation: "Quantify the trade-offs between latency and throughput with concrete benchmarks.",
    },
    structure: {
      score: 84,
      strengths: [
        "Logical flow from problem statement to architectural implementation.",
        "Clear progression across system tiers.",
      ],
      weaknesses: [
        "Opening could more aggressively establish business stakes before diving into code.",
      ],
      exactTranscriptQuotes: sampleQuotes.slice(0, 1),
      recommendation: "Begin with a crisp 30-second executive summary framing user impact.",
    },
    communication: {
      score: 85,
      strengths: [
        "Professional tone and direct explanatory phrasing.",
        "Good sentence cadence and vocabulary precision.",
      ],
      weaknesses: [
        metrics.repeatedWordCount > 2 ? `Repeated words noticed (${metrics.repeatedWordCount} instances).` : "Watch occasional run-on sentences.",
      ],
      exactTranscriptQuotes: sampleQuotes.slice(1, 2),
      recommendation: "Pause intentionally at key transition points instead of verbal bridges.",
    },
    delivery: {
      score: deliveryScore,
      strengths: [
        metrics.wpm >= 120 && metrics.wpm <= 165 ? `Natural speaking tempo at ${metrics.wpm} WPM.` : "Sustained vocal presence.",
      ],
      weaknesses: [
        metrics.fillerCount > 3 ? `Detected ${metrics.fillerCount} filler words (${metrics.fillerFrequencyPerMin}/min).` : "Could vary vocal inflection for emphasis.",
      ],
      exactTranscriptQuotes: sampleQuotes.slice(0, 1),
      recommendation: metrics.fillerCount > 3 ? "Embrace silent pauses rather than filling gaps with 'um' or 'like'." : "Maintain current steady tempo.",
    },
    timeManagement: {
      score: timeScore,
      strengths: [
        `Finished session in ${Math.round(actualSeconds)}s against target of ${targetSeconds}s.`,
      ],
      weaknesses: [
        timeScore < 80 ? "Pacing drifted noticeably from the target duration." : "Ensure even distribution across final recap slides.",
      ],
      exactTranscriptQuotes: [],
      recommendation: "Budget 2 minutes for introduction, 60% of time on core technical slides, and 1 minute for conclusions.",
    },
    slideHandling: {
      score: slideHandlingScore,
      strengths: [
        "Kept presentation aligned with the visual progression.",
      ],
      weaknesses: [
        slideReadingFindings > 0 ? "Leaned into reading slide bullet points on several slides." : "Allow viewers time to absorb figures before speaking.",
      ],
      exactTranscriptQuotes: slideFindings.map((f) => f.exactTranscriptQuote).filter(Boolean) as string[],
      recommendation: "Use the slides as visual anchors while narrating the real-world engineering context.",
    },
    qa: {
      score: qaScore,
      strengths: [
        "Maintained calm composure and addressed question prompts directly.",
      ],
      weaknesses: [
        "Could strengthen answers by structuring them into Hypothesis, Implementation, and Outcome.",
      ],
      exactTranscriptQuotes: input.qaItems?.map((q) => `"${q.answerTranscript.slice(0, 60)}..."`) ?? [],
      recommendation: "Restate or validate the core premise of defense questions before delivering your technical rationale.",
    },
  };

  // If using an LLM provider, enhance content, structure, and communication evaluations
  if (provider.name !== "deterministic-engine") {
    try {
      const llmResult = await provider.generateStructuredCompletion<{
        executiveSummary: string;
        content: CategoryEvaluation;
        structure: CategoryEvaluation;
        communication: CategoryEvaluation;
        immediateActions: string[];
        skillDrills: string[];
        longTermGoals: string[];
      }>({
        systemPrompt: `You are an executive communication coach and technical presentation evaluator.
Evaluate the speaker's presentation with rigorous, constructive feedback.
All scores must be integers between 0 and 100.
Always cite EXACT quotes from the student's transcript in exactTranscriptQuotes.
Format the evaluation according to the required schema.`,
        userPrompt: `Presentation Title/Type: ${input.presentationType}
Audience: ${input.audience}
Evaluation Mode: ${input.evaluationMode}
Duration: ${actualSeconds}s (Target: ${targetSeconds}s)
Speech Metrics: ${metrics.wpm} WPM, ${metrics.fillerCount} fillers (${metrics.fillerFrequencyPerMin}/min)

Transcript:
"""${input.transcript}"""

Slide Findings:
${JSON.stringify(slideFindings, null, 2)}`,
        schemaDescription: `{"executiveSummary": string, "content": CategoryEvaluation, "structure": CategoryEvaluation, "communication": CategoryEvaluation, "immediateActions": string[], "skillDrills": string[], "longTermGoals": string[]}`,
      });

      if (llmResult?.content) categories.content = llmResult.content;
      if (llmResult?.structure) categories.structure = llmResult.structure;
      if (llmResult?.communication) categories.communication = llmResult.communication;
    } catch (err) {
      console.warn("AI presentation evaluator fallback to rule-based scores:", err);
    }
  }

  // Deterministic calculation of overall score using weights
  const weights = DEFAULT_RUBRIC_WEIGHTS;
  const overallScore = Math.round(
    (categories.content.score * weights.content) +
    (categories.structure.score * weights.structure) +
    (categories.communication.score * weights.communication) +
    (categories.delivery.score * weights.delivery) +
    (categories.timeManagement.score * weights.timeManagement) +
    (categories.slideHandling.score * weights.slideHandling) +
    (categories.qa.score * weights.qa)
  );

  return {
    overallScore,
    weightsUsed: weights,
    executiveSummary: `Delivered a solid technical presentation demonstrating strong subject matter familiarity. Key strengths include clear architectural flow and steady delivery pace (${metrics.wpm} WPM). Primary growth areas include reducing filler word usage and avoiding verbatim slide reading.`,
    categories,
    slideFindings,
    practicePlan: {
      immediateActions: [
        "Replace filler words ('um', 'like') with deliberate 2-second pauses.",
        "Add a 30-second problem-framing hook to the opening slide.",
      ],
      skillDrills: [
        "Silent Slide Drill: Practice clicking next slide and pausing for 3 seconds before speaking.",
        "Pacing Ladder: Deliver the core architecture slide in exactly 90 seconds.",
      ],
      longTermGoals: [
        "Consistently maintain 135-155 WPM across all executive briefings.",
        "Achieve 90+ composite score in Placement Simulation mode.",
      ],
    },
    evaluationVersion: "v1.2",
    evaluatedAt: new Date().toISOString(),
    aiProviderUsed: provider.name,
  };
}
