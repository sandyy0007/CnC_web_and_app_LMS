'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Per-question countdown. Restarts whenever `resetKey` or `seconds` changes.
 * While `active` is false the countdown is frozen (used after an answer is
 * locked in) and onExpire cannot fire.
 *
 * Copied into each game's own hooks/ folder on purpose: games must not import
 * from one another (one folder, zero LMS touches).
 */
export function useQuestionTimer(
  resetKey: string | null,
  seconds: number,
  active: boolean,
  onExpire: () => void,
) {
  const totalMs = seconds * 1000;
  const [remainingMs, setRemainingMs] = useState(totalMs);
  const startedAtRef = useRef(0);
  const frozenElapsedRef = useRef(0);
  const expireRef = useRef(onExpire);

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  // Restart the clock for a new question.
  useEffect(() => {
    if (resetKey === null) return;
    startedAtRef.current = performance.now();
    frozenElapsedRef.current = 0;
    setRemainingMs(totalMs);
  }, [resetKey, totalMs]);

  // Tick while active. Resuming after a freeze keeps the elapsed time.
  useEffect(() => {
    if (resetKey === null) return;
    if (!active) {
      frozenElapsedRef.current = performance.now() - startedAtRef.current;
      return;
    }
    startedAtRef.current = performance.now() - frozenElapsedRef.current;

    let frame = 0;
    let fired = false;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const left = Math.max(0, totalMs - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        if (!fired) {
          fired = true;
          expireRef.current();
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [resetKey, totalMs, active]);

  /** Milliseconds since this question's clock started (frozen while inactive). */
  const elapsedMs = useCallback(() => {
    if (!active) return frozenElapsedRef.current;
    return performance.now() - startedAtRef.current;
  }, [active]);

  return { remainingMs, totalMs, elapsedMs };
}
