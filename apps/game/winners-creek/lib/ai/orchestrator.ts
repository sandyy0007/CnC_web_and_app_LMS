import type { PresentationEvaluationResult, SlideFinding } from "./types";
import { getAIProvider } from "./factory";
import { evaluateSlidePerformance } from "./evaluators/slide-evaluator";
import {
  evaluateOverallPresentation,
  type PresentationEvaluationPipelineInput,
} from "./evaluators/presentation-evaluators";

export async function runPresentationEvaluationPipeline(
  input: PresentationEvaluationPipelineInput,
): Promise<PresentationEvaluationResult> {
  const provider = getAIProvider();

  // 1. Evaluate each slide with slide-aware analysis
  const allSlideFindings: SlideFinding[] = [];

  for (const slide of input.slides) {
    // Find matching slide event to extract the spoken segment and duration
    const event = input.slideEvents.find((e) => e.slideIndex === slide.index);
    const spokenSegment = event?.transcriptSegment || input.transcript.slice(0, 300);
    const durationSeconds = event?.leftAtMs && event.enteredAtMs
      ? Math.max(1, Math.round((event.leftAtMs - event.enteredAtMs) / 1000))
      : Math.max(1, Math.round(input.durationSeconds / Math.max(1, input.slides.length)));

    const findings = await evaluateSlidePerformance(
      {
        slideIndex: slide.index,
        slideText: slide.textContent,
        slideNotes: slide.notes,
        spokenSegment,
        durationSeconds,
      },
      provider,
    );

    allSlideFindings.push(...findings);
  }

  // 2. Synthesize complete presentation across all 7 rubrics
  const evaluationResult = await evaluateOverallPresentation(input, allSlideFindings, provider);

  return evaluationResult;
}
