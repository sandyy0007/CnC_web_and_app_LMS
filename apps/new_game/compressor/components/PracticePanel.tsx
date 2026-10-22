'use client';

import { useEffect, useRef, useState } from 'react';

interface PracticePanelProps {
  /** What to say aloud, for example "Say the clean version aloud without any filler." */
  prompt: string;
  /** How long the countdown runs. */
  seconds: number;
  /** Called once, when the countdown ends or the player presses the button. */
  onFinish: () => void;
}

/**
 * Optional, ungraded speak-aloud step shown after the feedback. It only counts
 * down and shows a prompt: the microphone is never requested and nothing is
 * recorded or sent anywhere.
 */
export function PracticePanel({ prompt, seconds, onFinish }: PracticePanelProps) {
  const [left, setLeft] = useState(seconds);
  const finishRef = useRef(onFinish);
  const doneRef = useRef(false);

  useEffect(() => {
    finishRef.current = onFinish;
  });

  useEffect(() => {
    const id = window.setInterval(() => setLeft((current) => current - 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    finishRef.current();
  };

  useEffect(() => {
    if (left <= 0) {
      if (doneRef.current) return;
      doneRef.current = true;
      finishRef.current();
    }
  }, [left]);

  return (
    <div
      role="group"
      aria-label="Speak-aloud practice"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-slate-500 bg-slate-950 px-4 py-3"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Speak-aloud practice (not scored)
        </p>
        <p className="text-sm sm:text-base">{prompt}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tabular-nums" aria-label={`${Math.max(0, left)} seconds left`}>
          {Math.max(0, left)}s
        </span>
        <button
          type="button"
          onClick={finish}
          className="min-h-[44px] rounded-xl bg-slate-200 px-4 py-2 font-semibold text-slate-900 hover:bg-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}
