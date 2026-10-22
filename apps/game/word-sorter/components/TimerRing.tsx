'use client';

interface TimerRingProps {
  remainingMs: number;
  totalMs: number;
}

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TimerRing({ remainingMs, totalMs }: TimerRingProps) {
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const danger = fraction < 0.25;

  return (
    <div
      role="timer"
      aria-label={`${secondsLeft} seconds left`}
      className="relative h-14 w-14 shrink-0"
    >
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden="true">
        <circle cx="28" cy="28" r={RADIUS} fill="none" strokeWidth="5" className="stroke-slate-700" />
        <circle
          cx="28"
          cy="28"
          r={RADIUS}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className={danger ? 'stroke-rose-400' : 'stroke-emerald-400'}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
        {secondsLeft}
      </span>
    </div>
  );
}
