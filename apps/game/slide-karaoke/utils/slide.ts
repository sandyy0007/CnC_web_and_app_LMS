export interface Slide {
  title: string;
  bullets: string[];
}

/** The passage column holds the slide: title first, then bullets, separated by " | ". */
export function parseSlide(passage: string | null | undefined): Slide {
  const parts = (passage ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return { title: parts[0] ?? '', bullets: parts.slice(1) };
}

/** How many audience dots are still lit: all of them at the start, none at time-up. */
export function audienceLeft(fractionLeft: number, total: number): number {
  const clamped = Math.max(0, Math.min(1, fractionLeft));
  return Math.ceil(clamped * total - 1e-9);
}
