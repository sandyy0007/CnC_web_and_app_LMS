import { getAIConfig } from "@/lib/ai/config";
import { getAIProvider } from "@/lib/ai/factory";

export interface RubricCategoryScore {
  score: number;
  maxScore: number;
  feedback: string;
}

export interface SlideComparison {
  slideIndex: number;
  title: string;
  expectedContent: string;
  spokenSegment: string;
  coveragePercent: number;
  status: "covered" | "partial" | "missed";
  matchedPoints: string[];
  missingPoints: string[];
  extraPoints: string[];
}

export interface ScriptScoreBreakdown {
  contentCoverage: RubricCategoryScore; // Max 40
  keyPoints: RubricCategoryScore;       // Max 25
  slideCoverage: RubricCategoryScore;   // Max 15
  topicRelevance: RubricCategoryScore;  // Max 10
  sequence: RubricCategoryScore;        // Max 5
  completeness: RubricCategoryScore;    // Max 5
}

export interface ScriptComparisonResult {
  status: "completed" | "no_transcript" | "no_script" | "failed";
  statusReason?: string;
  overallScore: number | null; // null when transcript or script is unavailable
  scoreBreakdown: ScriptScoreBreakdown | null;
  slides: SlideComparison[];
  totalExpectedPoints: number;
  totalMatchedPoints: number;
  matchedPoints: string[];
  missingPoints: string[];
  extraPoints: string[];
  summaryFeedback: string;
  comparatorVersion: string;
}

export interface CompareInputSlide {
  slideIndex: number;
  title?: string;
  textContent: string;
  notes?: string | null;
  bullets?: string[];
  expectedScript?: string;
}

export interface CompareInput {
  expectedScript?: string | null;
  slideScripts?: Array<{ slideIndex: number; title: string; expectedScript: string }>;
  slides: CompareInputSlide[];
  transcript: string | null | undefined;
  slideEvents?: Array<{
    slideIndex: number;
    enteredAtMs: number;
    leftAtMs: number | null;
    transcriptSegment?: string | null;
  }>;
  durationSeconds: number;
  targetDurationSeconds: number;
}

/**
 * Extracts normalized concept keywords from text, filtering out common stopwords.
 */
function extractConcepts(text: string): string[] {
  const stopwords = new Set([
    "the", "and", "a", "an", "to", "of", "in", "for", "on", "with", "as", "by", "at",
    "from", "this", "that", "these", "those", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "can", "could", "will", "would",
    "shall", "should", "may", "might", "must", "it", "its", "we", "our", "you", "your",
    "they", "their", "i", "my", "about", "into", "over", "after", "then", "also", "so",
  ]);

  const clean = text.replace(/[^a-zA-Z0-9\s-]/g, " ").toLowerCase();
  const words = clean.split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
  return Array.from(new Set(words));
}

/**
 * Extracts bullet points or distinct sentence statements from slide content.
 */
function extractKeyStatements(slide: CompareInputSlide): string[] {
  const statements: string[] = [];
  if (slide.bullets && slide.bullets.length > 0) {
    for (const b of slide.bullets) {
      const trimmed = b.trim();
      if (trimmed.length > 3) statements.push(trimmed);
    }
  }

  const lines = slide.textContent.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);
  for (const l of lines) {
    const cleanLine = l.replace(/^[-•*]\s*/, "").trim();
    if (!statements.includes(cleanLine) && cleanLine.length > 3) {
      statements.push(cleanLine);
    }
  }

  if (slide.notes) {
    const noteLines = slide.notes.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);
    for (const n of noteLines) {
      if (!statements.includes(n)) statements.push(n);
    }
  }

  return statements.length > 0 ? statements : [slide.title || `Slide ${slide.slideIndex + 1}`];
}

/**
 * Checks whether a key statement or concept is mentioned in the transcript.
 */
function statementMatch(statement: string, transcriptLower: string): boolean {
  const statementLower = statement.toLowerCase().trim();
  if (transcriptLower.includes(statementLower)) return true;

  // Concept-level overlap
  const concepts = extractConcepts(statement);
  if (concepts.length === 0) return false;

  let matched = 0;
  for (const c of concepts) {
    if (transcriptLower.includes(c)) matched++;
  }
  return matched / concepts.length >= 0.5;
}

/**
 * Algorithmic comparator that strictly computes grounded rubric marks
 * from actual slide content and spoken transcript without hallucination.
 */
function compareAlgorithmic(input: CompareInput): ScriptComparisonResult {
  const transcript = input.transcript?.trim() ?? "";
  const transcriptLower = transcript.toLowerCase();

  const slideResults: SlideComparison[] = [];
  const allMatched: string[] = [];
  const allMissing: string[] = [];
  let totalStatements = 0;
  let totalMatched = 0;

  // Build per-slide transcript segments if available from slide events
  const segmentBySlide = new Map<number, string>();
  if (input.slideEvents && input.slideEvents.length > 0) {
    for (const evt of input.slideEvents) {
      if (evt.transcriptSegment) {
        const existing = segmentBySlide.get(evt.slideIndex) ?? "";
        segmentBySlide.set(evt.slideIndex, `${existing} ${evt.transcriptSegment}`.trim());
      }
    }
  }

  for (const slide of input.slides) {
    const statements = extractKeyStatements(slide);
    totalStatements += statements.length;

    // Use slide-specific segment if available, otherwise check overall transcript
    const slideSegment = segmentBySlide.get(slide.slideIndex) || "";
    const searchTarget = (slideSegment.length > 10 ? slideSegment : transcript).toLowerCase();

    const matched: string[] = [];
    const missing: string[] = [];

    for (const stmt of statements) {
      if (statementMatch(stmt, searchTarget)) {
        matched.push(stmt);
        allMatched.push(stmt);
      } else {
        missing.push(stmt);
        allMissing.push(stmt);
      }
    }

    totalMatched += matched.length;

    const coveragePercent = statements.length > 0 ? Math.round((matched.length / statements.length) * 100) : 0;
    const status: "covered" | "partial" | "missed" =
      coveragePercent >= 70 ? "covered" : coveragePercent > 0 ? "partial" : "missed";

    slideResults.push({
      slideIndex: slide.slideIndex,
      title: slide.title || `Slide ${slide.slideIndex + 1}`,
      expectedContent: statements.join("\n"),
      spokenSegment: slideSegment || (coveragePercent > 0 ? "(Covered in overall transcript)" : "(No spoken coverage detected)"),
      coveragePercent,
      status,
      matchedPoints: matched,
      missingPoints: missing,
      extraPoints: [],
    });
  }

  // Calculate rubric scores (Total = 100)
  // 1. Content Coverage (Max 40)
  const coverageRatio = totalStatements > 0 ? totalMatched / totalStatements : 0;
  const contentScore = Math.min(40, Math.round(coverageRatio * 40));
  const contentFeedback =
    contentScore >= 32
      ? "Comprehensive topic coverage matching the visual slides."
      : contentScore >= 20
        ? `Moderate coverage: ${totalMatched} of ${totalStatements} key slide points addressed.`
        : `Significant slide content left unaddressed (${allMissing.length} points missed).`;

  // 2. Key Points (Max 25)
  const keyPointsScore = Math.min(25, Math.round(coverageRatio * 25));
  const keyPointsFeedback =
    keyPointsScore >= 20
      ? "Strong articulation of core concepts and bullet points."
      : keyPointsScore >= 12
        ? "Some primary points were delivered, but critical slide details were skipped."
        : "Most key slide points were omitted from your spoken delivery.";

  // 3. Slide Coverage (Max 15)
  const touchedSlides = slideResults.filter((s) => s.status !== "missed").length;
  const slideCoverageRatio = input.slides.length > 0 ? touchedSlides / input.slides.length : 0;
  const slideCoverageScore = Math.min(15, Math.round(slideCoverageRatio * 15));
  const slideCoverageFeedback =
    touchedSlides === input.slides.length
      ? `All ${input.slides.length} slides were presented.`
      : `${touchedSlides} of ${input.slides.length} slides were covered during the presentation.`;

  // 4. Topic Relevance (Max 10)
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const relevanceRatio = wordCount > 0 ? Math.min(1.0, (totalMatched * 15) / Math.max(wordCount, 30)) : 0;
  const relevanceScore = Math.min(10, Math.round(Math.max(relevanceRatio * 10, coverageRatio > 0 ? 5 : 0)));
  const relevanceFeedback =
    relevanceScore >= 8
      ? "Spoken remarks remained tightly aligned with the presentation topics."
      : "Some off-topic remarks or filler content detected relative to slide content.";

  // 5. Sequence (Max 5)
  let inSequence = true;
  if (input.slideEvents && input.slideEvents.length > 1) {
    let lastIndex = -1;
    for (const evt of input.slideEvents) {
      if (evt.slideIndex < lastIndex) {
        inSequence = false;
        break;
      }
      lastIndex = evt.slideIndex;
    }
  }
  const sequenceScore = inSequence ? 5 : 3;
  const sequenceFeedback = inSequence
    ? "Slides were navigated in sequential, logical order."
    : "Non-linear navigation observed; presentation jumped backwards across slides.";

  // 6. Delivery Completeness (Max 5)
  const hasIntro =
    transcriptLower.includes("welcome") ||
    transcriptLower.includes("hello") ||
    transcriptLower.includes("good morning") ||
    transcriptLower.includes("good afternoon") ||
    transcriptLower.includes("today") ||
    transcriptLower.includes("overview");
  const hasConclusion =
    transcriptLower.includes("thank") ||
    transcriptLower.includes("conclusion") ||
    transcriptLower.includes("questions") ||
    transcriptLower.includes("summary") ||
    transcriptLower.includes("wrap");

  let completenessScore = 3;
  if (hasIntro && hasConclusion) completenessScore = 5;
  else if (hasIntro || hasConclusion) completenessScore = 4;
  else if (wordCount > 50) completenessScore = 3;
  else completenessScore = 1;

  const completenessFeedback =
    completenessScore === 5
      ? "Clear opening introduction and concluding remarks detected."
      : hasIntro
        ? "Opening detected, but lacked a formal closing or Q&A transition."
        : "Missing a formal introduction and concluding summary.";

  const overallScore = contentScore + keyPointsScore + slideCoverageScore + relevanceScore + sequenceScore + completenessScore;

  return {
    status: "completed",
    overallScore,
    scoreBreakdown: {
      contentCoverage: { score: contentScore, maxScore: 40, feedback: contentFeedback },
      keyPoints: { score: keyPointsScore, maxScore: 25, feedback: keyPointsFeedback },
      slideCoverage: { score: slideCoverageScore, maxScore: 15, feedback: slideCoverageFeedback },
      topicRelevance: { score: relevanceScore, maxScore: 10, feedback: relevanceFeedback },
      sequence: { score: sequenceScore, maxScore: 5, feedback: sequenceFeedback },
      completeness: { score: completenessScore, maxScore: 5, feedback: completenessFeedback },
    },
    slides: slideResults,
    totalExpectedPoints: totalStatements,
    totalMatchedPoints: totalMatched,
    matchedPoints: allMatched,
    missingPoints: allMissing,
    extraPoints: [],
    summaryFeedback: `Delivery scored ${overallScore}/100 based on comparison with visual presentation slides. Addressed ${totalMatched} of ${totalStatements} key slide points across ${touchedSlides} of ${input.slides.length} slides.`,
    comparatorVersion: "v1-algorithmic",
  };
}

/**
 * Main entry point: Compares the expected presentation script / slides
 * with the actual user spoken transcript.
 */
export async function compareScriptAndTranscript(input: CompareInput): Promise<ScriptComparisonResult> {
  const transcript = input.transcript?.trim();

  // If no transcript was captured at all
  if (!transcript || transcript.length === 0) {
    return {
      status: "no_transcript",
      statusReason: "No spoken audio transcript was captured for this attempt.",
      overallScore: null,
      scoreBreakdown: null,
      slides: input.slides.map((s) => ({
        slideIndex: s.slideIndex,
        title: s.title || `Slide ${s.slideIndex + 1}`,
        expectedContent: s.textContent || "(Slide content)",
        spokenSegment: "(No transcript captured)",
        coveragePercent: 0,
        status: "missed",
        matchedPoints: [],
        missingPoints: extractKeyStatements(s),
        extraPoints: [],
      })),
      totalExpectedPoints: input.slides.reduce((acc, s) => acc + extractKeyStatements(s).length, 0),
      totalMatchedPoints: 0,
      matchedPoints: [],
      missingPoints: input.slides.flatMap((s) => extractKeyStatements(s)),
      extraPoints: [],
      summaryFeedback: "Speech transcription was not detected. Ensure your microphone is enabled and speak clearly during your presentation.",
      comparatorVersion: "v1",
    };
  }

  // If no slides are available
  if (!input.slides || input.slides.length === 0) {
    return {
      status: "no_script",
      statusReason: "No presentation slides or expected script available for comparison.",
      overallScore: null,
      scoreBreakdown: null,
      slides: [],
      totalExpectedPoints: 0,
      totalMatchedPoints: 0,
      matchedPoints: [],
      missingPoints: [],
      extraPoints: [],
      summaryFeedback: "Presentation slides were not loaded.",
      comparatorVersion: "v1",
    };
  }

  // Attempt AI semantic comparison if AI is configured
  const aiConfig = getAIConfig();
  if (aiConfig.isConfigured && aiConfig.apiKey) {
    try {
      const provider = getAIProvider();
      const systemPrompt = `You are a rigorous presentation evaluation examiner.
Compare the user's spoken rehearsal transcript against the expected visual presentation slides and script.
Score the presentation strictly according to the following 100-point rubric:
- Content Coverage: max 40 points (proportion of slide points accurately discussed)
- Key Points: max 25 points (accuracy and presence of critical facts, figures, technical terms)
- Slide Coverage: max 15 points (proportion of slides addressed)
- Topic Relevance: max 10 points (staying on-topic vs tangents or filler)
- Sequence: max 5 points (logical slide order flow)
- Delivery Completeness: max 5 points (introduction, transitions, conclusion)

For EACH slide, evaluate coverage (0-100%), status ("covered" | "partial" | "missed"), list matchedPoints, missingPoints, and extraPoints.
Return ONLY valid JSON.`;

      const slidesSummary = input.slides
        .map(
          (s) =>
            `[Slide ${s.slideIndex + 1}: ${s.title || `Slide ${s.slideIndex + 1}`}]\n` +
            `Content: ${s.textContent}\n` +
            (s.notes ? `Notes: ${s.notes}\n` : "") +
            (s.expectedScript ? `Expected Script: ${s.expectedScript}\n` : ""),
        )
        .join("\n---\n");

      const userPrompt = `Compare this user presentation attempt against the expected slide deck:

Slides Content:
${slidesSummary}

User Spoken Transcript:
"""${transcript}"""

Duration: ${Math.round(input.durationSeconds)}s (Target: ${input.targetDurationSeconds}s)`;

      const schemaDescription = `{
  "overallScore": number (0-100),
  "scoreBreakdown": {
    "contentCoverage": { "score": number (0-40), "maxScore": 40, "feedback": string },
    "keyPoints": { "score": number (0-25), "maxScore": 25, "feedback": string },
    "slideCoverage": { "score": number (0-15), "maxScore": 15, "feedback": string },
    "topicRelevance": { "score": number (0-10), "maxScore": 10, "feedback": string },
    "sequence": { "score": number (0-5), "maxScore": 5, "feedback": string },
    "completeness": { "score": number (0-5), "maxScore": 5, "feedback": string }
  },
  "slides": [
    {
      "slideIndex": number (0-indexed integer),
      "title": string,
      "expectedContent": string,
      "spokenSegment": string,
      "coveragePercent": number (0-100),
      "status": "covered" | "partial" | "missed",
      "matchedPoints": string[],
      "missingPoints": string[],
      "extraPoints": string[]
    }
  ],
  "matchedPoints": string[],
  "missingPoints": string[],
  "extraPoints": string[],
  "summaryFeedback": string
}`;

      const aiResult = await provider.generateStructuredCompletion<{
        overallScore: number;
        scoreBreakdown: ScriptScoreBreakdown;
        slides: SlideComparison[];
        matchedPoints: string[];
        missingPoints: string[];
        extraPoints: string[];
        summaryFeedback: string;
      }>({
        systemPrompt,
        userPrompt,
        schemaDescription,
        temperature: 0.1,
      });

      if (aiResult && aiResult.scoreBreakdown && Array.isArray(aiResult.slides) && aiResult.slides.length > 0) {
        // Enforce max bounds on rubric categories
        const sb = aiResult.scoreBreakdown;
        sb.contentCoverage.score = Math.min(40, Math.max(0, Math.round(sb.contentCoverage.score)));
        sb.contentCoverage.maxScore = 40;
        sb.keyPoints.score = Math.min(25, Math.max(0, Math.round(sb.keyPoints.score)));
        sb.keyPoints.maxScore = 25;
        sb.slideCoverage.score = Math.min(15, Math.max(0, Math.round(sb.slideCoverage.score)));
        sb.slideCoverage.maxScore = 15;
        sb.topicRelevance.score = Math.min(10, Math.max(0, Math.round(sb.topicRelevance.score)));
        sb.topicRelevance.maxScore = 10;
        sb.sequence.score = Math.min(5, Math.max(0, Math.round(sb.sequence.score)));
        sb.sequence.maxScore = 5;
        sb.completeness.score = Math.min(5, Math.max(0, Math.round(sb.completeness.score)));
        sb.completeness.maxScore = 5;

        const sumScore =
          sb.contentCoverage.score +
          sb.keyPoints.score +
          sb.slideCoverage.score +
          sb.topicRelevance.score +
          sb.sequence.score +
          sb.completeness.score;

        return {
          status: "completed",
          overallScore: Math.min(100, Math.max(0, sumScore)),
          scoreBreakdown: sb,
          slides: aiResult.slides,
          totalExpectedPoints: (aiResult.matchedPoints?.length ?? 0) + (aiResult.missingPoints?.length ?? 0),
          totalMatchedPoints: aiResult.matchedPoints?.length ?? 0,
          matchedPoints: aiResult.matchedPoints ?? [],
          missingPoints: aiResult.missingPoints ?? [],
          extraPoints: aiResult.extraPoints ?? [],
          summaryFeedback: aiResult.summaryFeedback || `Overall presentation alignment scored ${sumScore}/100.`,
          comparatorVersion: `ai-${provider.name}`,
        };
      }
    } catch (err) {
      console.warn("[compareScriptAndTranscript] AI semantic comparison failed, falling back to algorithmic comparator:", err);
    }
  }

  // Fallback to grounded algorithmic comparison
  return compareAlgorithmic(input);
}
