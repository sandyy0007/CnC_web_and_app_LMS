/** The passage column holds the two words to link, separated by " | ". */
export function parsePair(passage: string | null | undefined): [string, string] {
  const parts = (passage ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [parts[0] ?? '', parts[1] ?? ''];
}

/** The sentence frame shown on the plank before an ending is chosen. */
export function frame(a: string, b: string): string {
  return `${a} is like ${b} because`;
}

/** The finished sentence, with a full stop added if the ending has none. */
export function fullSentence(a: string, b: string, ending: string): string {
  const trimmed = ending.trim();
  const closed = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return `${frame(a, b)} ${closed}`;
}
