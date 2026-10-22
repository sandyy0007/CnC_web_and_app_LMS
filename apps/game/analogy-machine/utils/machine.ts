export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THINGS = [
  'a kettle',
  'a lighthouse',
  'a zipper',
  'a compass',
  'a tractor',
  'an umbrella',
  'a ladder',
  'a candle',
  'a mirror',
  'a sandwich',
  'a trampoline',
  'a post box',
];

/** The passage column holds the two things as "a stopwatch | a windmill". */
export function parsePair(passage: string | null | undefined): [string, string] {
  const parts = (passage ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [parts[0] ?? '', parts[1] ?? ''];
}

/** What one reel shows on its way to the landing word (seeded, so rendering stays pure). */
export function reelWords(landing: string, salt: string): string[] {
  const random = mulberry32(hashString(`${salt}:${landing}`));
  const pool = THINGS.filter((word) => word !== landing);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [...pool.slice(0, 5), landing];
}

export function frame(a: string, b: string): string {
  return `${a} is like ${b} because`;
}

export function fullSentence(a: string, b: string, ending: string): string {
  const trimmed = ending.trim();
  const closed = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return `${frame(a, b)} ${closed}`;
}
