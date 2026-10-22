export interface SlideContent {
  index: number;
  textContent: string;
  notes: string | null;
}

export const PRESENTATION_TYPES = [
  "Academic",
  "Technical",
  "Project",
  "Business",
  "Seminar",
  "Placement",
  "Pitch",
  "Other",
] as const;
export type PresentationType = (typeof PRESENTATION_TYPES)[number];

export const AUDIENCES = [
  "Students",
  "Faculty",
  "Recruiters",
  "Technical Panel",
  "Management",
  "General Audience",
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const DURATION_PRESETS = [
  { label: "2 min", seconds: 120 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
] as const;

export const EVALUATION_MODES = [
  { value: "practice", label: "Practice", description: "Full AI hints, no pressure — build the habit." },
  { value: "assessment", label: "Assessment", description: "Timed and scored like a real evaluation." },
  {
    value: "placement_simulation",
    label: "Placement Simulation",
    description: "Assessment rules plus anti-cheating safeguards, as in a real placement round.",
  },
] as const;
export type EvaluationMode = (typeof EVALUATION_MODES)[number]["value"];

/** Average adult speaking pace, used to estimate speaking duration from slide word count. */
export const ASSUMED_WORDS_PER_MINUTE = 130;

export function estimateSpeakingSeconds(slides: SlideContent[]): number {
  const words = slides.reduce((sum, s) => sum + s.textContent.split(/\s+/).filter(Boolean).length, 0);
  return Math.round((words / ASSUMED_WORDS_PER_MINUTE) * 60);
}

export function recommendedPaceLabel(targetSeconds: number, slideCount: number): string {
  if (slideCount === 0) return "—";
  const perSlide = targetSeconds / slideCount;
  if (perSlide < 30) return "Brisk — under 30s per slide";
  if (perSlide < 60) return "Steady — about 30-60s per slide";
  if (perSlide < 120) return "Measured — about 1-2 min per slide";
  return "Deep-dive — over 2 min per slide";
}
