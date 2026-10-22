/** Words the reel passes on its way to the topic. Display only. */
const FILLER_WORDS = [
  'Ambition',
  'Overthinking',
  'Small talk',
  'Perfectionism',
  'First impressions',
  'Asking for help',
  'Digital detox',
  'Hustle culture',
  'Self-discipline',
  'Comfort zone',
  'Procrastination',
  'Doing less',
  'Fake confidence',
  'Deadlines',
  'Feedback',
  'Productivity hacks',
  'Boredom',
  'Luck',
  'Patience',
  'Trust',
];

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

/**
 * The words on the reel: seven look-alike words in a fixed pseudo-random order
 * (seeded by the topic, so the render stays pure) and the topic last.
 */
export function reelItems(topic: string): string[] {
  const random = mulberry32(hashString(topic));
  const pool = FILLER_WORDS.filter((word) => word.toLowerCase() !== topic.toLowerCase());
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [...pool.slice(0, 7), topic];
}
