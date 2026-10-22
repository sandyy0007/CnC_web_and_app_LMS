import type { SlideFinding, AIProvider } from "../types";

export interface SlideEvaluationInput {
  slideIndex: number;
  slideText: string;
  slideNotes?: string | null;
  spokenSegment: string;
  durationSeconds: number;
}

export async function evaluateSlidePerformance(
  input: SlideEvaluationInput,
  provider: AIProvider,
): Promise<SlideFinding[]> {
  const findings: SlideFinding[] = [];
  const spoken = input.spokenSegment.trim();
  const slideText = input.slideText.trim();

  if (spoken.length === 0) {
    findings.push({
      slideIndex: input.slideIndex,
      findingType: "skipped_content",
      observation: `Slide ${input.slideIndex + 1} was displayed with no detected spoken narration.`,
      recommendation: "Walk through key diagram components or bullet points out loud for each slide.",
      severity: "critical",
    });
    return findings;
  }

  // If using an LLM provider (OpenAI or Anthropic)
  if (provider.name !== "deterministic-engine") {
    try {
      const response = await provider.generateStructuredCompletion<{ findings: SlideFinding[] }>({
        systemPrompt: `You are an expert presentation and technical communication evaluator.
Evaluate how well the speaker delivered this specific slide.
Examine whether they read verbatim from the slide, skipped critical content, gave strong technical depth, or had pacing issues.
For every finding, cite an EXACT quote from their spoken segment in exactTranscriptQuote.
Valid findingTypes: 'relevance', 'slide_reading', 'skipped_content', 'deep_explanation', 'pace'.
Valid severities: 'info', 'positive', 'suggestion', 'critical'.`,
        userPrompt: `Slide #${input.slideIndex + 1}:
Content:
"""${slideText}"""
Notes:
"""${input.slideNotes ?? "(none)"}"""

Speaker Spoken Segment (${input.durationSeconds}s):
"""${spoken}"""`,
        schemaDescription: `{"findings": [{"slideIndex": number, "findingType": string, "observation": string, "exactTranscriptQuote": string, "recommendation": string, "severity": string}]}`,
      });

      if (response?.findings && Array.isArray(response.findings) && response.findings.length > 0) {
        return response.findings;
      }
    } catch (err) {
      console.warn("AI slide evaluator fallback to deterministic rules:", err);
    }
  }

  // Deterministic evaluation logic (always reliable, transparent, citing exact quotes)
  const spokenWords = spoken.toLowerCase().split(/\s+/);
  const slideWords = slideText.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  // Check verbatim overlap (slide reading)
  let overlapCount = 0;
  for (const sw of slideWords) {
    if (spokenWords.includes(sw)) overlapCount++;
  }
  const overlapPct = slideWords.length > 0 ? overlapCount / slideWords.length : 0;

  if (overlapPct > 0.8 && slideWords.length > 6) {
    // Pick first matching sentence as quote
    const firstSentence = spoken.split(/[.!?]/)[0] ?? spoken.slice(0, 80);
    findings.push({
      slideIndex: input.slideIndex,
      findingType: "slide_reading",
      observation: "High word-for-word overlap with slide bullets; presentation leaned heavily on reading text rather than elaborating.",
      exactTranscriptQuote: `"${firstSentence.trim()}"`,
      recommendation: "Summarize the high-level takeaways and share the background story or trade-offs behind each bullet instead of reading directly.",
      severity: "suggestion",
    });
  } else if (overlapPct < 0.2 && slideWords.length > 5) {
    findings.push({
      slideIndex: input.slideIndex,
      findingType: "relevance",
      observation: "Narration diverged significantly from the on-screen slide diagrams and data points.",
      exactTranscriptQuote: `"${spoken.slice(0, 70)}..."`,
      recommendation: "Anchor your verbal delivery to specific on-screen figures or table columns to keep the audience oriented.",
      severity: "suggestion",
    });
  } else {
    findings.push({
      slideIndex: input.slideIndex,
      findingType: "deep_explanation",
      observation: "Synthesized slide concepts with good conceptual elaboration rather than reading verbatim.",
      exactTranscriptQuote: `"${spoken.slice(0, 80)}..."`,
      recommendation: "Maintain this natural cadence and continue connecting slide concepts to real-world impact.",
      severity: "positive",
    });
  }

  if (input.durationSeconds > 0 && input.durationSeconds < 10 && slideWords.length > 10) {
    findings.push({
      slideIndex: input.slideIndex,
      findingType: "pace",
      observation: `Spent only ${input.durationSeconds}s on a dense slide with multiple concepts.`,
      recommendation: "Allow at least 20-30 seconds for the audience to absorb multi-part diagrams.",
      severity: "suggestion",
    });
  }

  return findings;
}
