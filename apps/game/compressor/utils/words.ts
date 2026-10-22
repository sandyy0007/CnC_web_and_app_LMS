export function countWords(text: string | null | undefined): number {
  const words = (text ?? '').match(/[\p{L}\p{N}'%.,-]+/gu) ?? [];
  return words.filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export interface Round {
  number: number;
  total: number;
}

/** Reads "Round 2 of 3" from the scenario column. Falls back to round 1 of 3. */
export function parseRound(scenario: string | null | undefined): Round {
  const match = /round\s+(\d+)\s+of\s+(\d+)/i.exec(scenario ?? '');
  if (!match) return { number: 1, total: 3 };
  return { number: Number(match[1]), total: Number(match[2]) };
}

/** Speech lengths of the three rounds, as on the site (2 min, 1 min, 30 s). */
export const ROUND_LENGTHS = ['2 min', '1 min', '30 s'];
