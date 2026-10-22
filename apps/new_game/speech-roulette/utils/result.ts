import type { AnswerSubmissionResult } from '../../_shared/types';

/**
 * The architecture document says submitAnswer returns "evaluation result,
 * correctness, and lives" but does not name the fields. These helpers read the
 * most likely names defensively so the game keeps working if the real shape
 * differs slightly. Verify against AnswerSubmissionResult in
 * apps/game/_shared/types.ts and simplify once confirmed.
 */
type LooseResult = Record<string, unknown>;

function asLoose(result: AnswerSubmissionResult | null | undefined): LooseResult {
  return (result ?? {}) as unknown as LooseResult;
}

export function readIsCorrect(result: AnswerSubmissionResult | null | undefined): boolean {
  const r = asLoose(result);
  const value = r.is_correct ?? r.isCorrect ?? r.correct;
  return value === true;
}

export function readExplanation(result: AnswerSubmissionResult | null | undefined): string | null {
  const r = asLoose(result);
  const value = r.explanation;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Index (0-3) of the correct option if the server reveals it, otherwise null. */
export function readCorrectIndex(result: AnswerSubmissionResult | null | undefined): number | null {
  const r = asLoose(result);
  const value = r.correct_option ?? r.correctOption ?? r.answer_index ?? r.correctIndex;
  return typeof value === 'number' && value >= 0 && value <= 3 ? value : null;
}
