/**
 * Deterministic ("Layer 1") speech metrics computed directly from a
 * transcript + known duration — no LLM involved, so these numbers are
 * always available and always reproducible. This is intentionally the
 * same category of computation the spec calls "Layer 1 — Deterministic
 * Metrics" (section 12); the fuller version (pause timing from word-level
 * timestamps, pitch/volume variation from audio) is Phase 2.
 */

const FILLER_WORDS = [
  "um", "uh", "umm", "uhh", "erm", "er", "like", "you know", "sort of", "kind of",
  "basically", "actually", "literally", "i mean", "so yeah", "right,",
];

export interface BasicSpeechMetrics {
  wordCount: number;
  wpm: number;
  fillerCount: number;
  fillerFrequencyPerMin: number;
  repeatedWordCount: number;
  averageSentenceLength: number;
}

export function computeBasicSpeechMetrics(transcript: string, durationSeconds: number): BasicSpeechMetrics {
  const clean = transcript.trim();
  const words = clean.length > 0 ? clean.split(/\s+/) : [];
  const wordCount = words.length;
  const minutes = Math.max(durationSeconds / 60, 1 / 60);
  const wpm = Math.round(wordCount / minutes);

  const lower = ` ${clean.toLowerCase()} `;
  let fillerCount = 0;
  for (const filler of FILLER_WORDS) {
    const re = new RegExp(`[\\s.,!?]${filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s.,!?]`, "g");
    fillerCount += (lower.match(re) ?? []).length;
  }
  const fillerFrequencyPerMin = Number((fillerCount / minutes).toFixed(2));

  let repeatedWordCount = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i].toLowerCase() === words[i - 1].toLowerCase() && /[a-z]/i.test(words[i])) {
      repeatedWordCount++;
    }
  }

  const sentences = clean.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const averageSentenceLength =
    sentences.length > 0
      ? Number((sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length).toFixed(1))
      : 0;

  return { wordCount, wpm, fillerCount, fillerFrequencyPerMin, repeatedWordCount, averageSentenceLength };
}

export interface TimelineMarker {
  timeSeconds: number;
  label: string;
  type: "slide_change" | "filler_cluster" | "long_pause" | "fast_speech";
  description?: string;
  slideIndex?: number;
}

export function generateTimelineMarkers(
  durationSeconds: number,
  slideEvents: { slideIndex: number; enteredAtMs: number; leftAtMs: number | null; transcriptSegment?: string | null }[],
): TimelineMarker[] {
  const markers: TimelineMarker[] = [];

  for (const event of slideEvents) {
    const timeSec = Math.round(event.enteredAtMs / 1000);
    if (timeSec <= durationSeconds) {
      markers.push({
        timeSeconds: timeSec,
        label: `Slide ${event.slideIndex + 1}`,
        type: "slide_change",
        slideIndex: event.slideIndex,
        description: `Transitioned to slide ${event.slideIndex + 1}`,
      });
    }
  }

  return markers.sort((a, b) => a.timeSeconds - b.timeSeconds);
}

