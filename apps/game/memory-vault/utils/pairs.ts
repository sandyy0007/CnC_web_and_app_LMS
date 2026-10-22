export interface WordPair {
  word: string;
  meaning: string;
}

/**
 * Parses the CSV `passage` column. Format: `word = meaning | word = meaning`.
 * Pairs are separated by `|`; the first `=` in a pair splits word from meaning.
 */
export function parsePairs(passage: string | null | undefined): WordPair[] {
  return (passage ?? '')
    .split('|')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const split = chunk.indexOf('=');
      if (split < 0) return { word: chunk, meaning: '' };
      return {
        word: chunk.slice(0, split).trim(),
        meaning: chunk.slice(split + 1).trim(),
      };
    });
}
