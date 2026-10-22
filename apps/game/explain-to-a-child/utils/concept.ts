export interface Concept {
  category: string;
  emoji: string;
  title: string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  everyday: '\u{1F3E0}',
  science: '\u{1F52C}',
  abstract: '\u{1F9E0}',
};

/** The passage column holds "Category | Concept", for example "Science | Tides". */
export function parseConcept(passage: string | null | undefined): Concept {
  const parts = (passage ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const hasCategory = parts.length >= 2;
  const category = hasCategory ? parts[0] : '';
  const title = hasCategory ? parts.slice(1).join(' | ') : (parts[0] ?? '');
  return { category, emoji: CATEGORY_EMOJI[category.toLowerCase()] ?? '', title };
}

/** Average letters per word: a rough reading-level hint shown after the answer. */
export function averageWordLength(text: string): number {
  const words = text.match(/[A-Za-z']+/g) ?? [];
  if (words.length === 0) return 0;
  const letters = words.reduce((sum, word) => sum + word.replace(/'/g, '').length, 0);
  return letters / words.length;
}
