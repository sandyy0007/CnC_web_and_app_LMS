export interface Cue {
  emoji: string;
  emotion: string;
  high: boolean;
}

/**
 * The passage column holds the cue as "emoji | emotion | energy", for example
 * "😄 | joy | high". Energy is "high" or "low"; anything else counts as low.
 */
export function parseCue(passage: string | null | undefined): Cue {
  const parts = (passage ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return {
    emoji: parts[0] ?? '',
    emotion: parts[1] ?? '',
    high: (parts[2] ?? '').toLowerCase() === 'high',
  };
}

/** Points of the rollercoaster track: a single hill for high energy, a dip for low energy. */
export function trackPath(high: boolean): string {
  return high ? 'M0,34 C30,34 40,6 60,6 C80,6 90,34 120,34' : 'M0,6 C30,6 40,34 60,34 C80,34 90,6 120,6';
}

export function dotPosition(high: boolean): { x: number; y: number } {
  return { x: 60, y: high ? 6 : 34 };
}
