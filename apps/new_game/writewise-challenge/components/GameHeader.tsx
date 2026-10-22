'use client';

import React from 'react';
import type { GameDifficultyTier } from '../../_shared/types';
import { getTierDisplay } from '../utils/writingChallenge';

interface GameHeaderProps {
  title: string;
  level: GameDifficultyTier;
  lives: number;
  maxLives?: number;
  score: number;
  streak: number;
  remainingSeconds: number;
  hintsLeft: number;
  onOpenHint: () => void;
  questionNumber: number;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  title,
  level,
  lives,
  maxLives = 3,
  score,
  streak,
  remainingSeconds,
  hintsLeft,
  onOpenHint,
  questionNumber,
}) => {
  const tierInfo = getTierDisplay(level);

  // Format seconds mm:ss
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const formattedTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const isTimeLow = remainingSeconds <= 120; // 2 minutes

  return (
    <header className="w-full bg-slate-900/95 border-b border-slate-800 backdrop-blur px-4 py-3 sm:px-6 sm:py-4 rounded-t-2xl shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Game Title & Tier Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-md text-white font-black text-lg">
            ✍️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">{title}</h1>
              <span
                className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  level === 'ADVANCED'
                    ? 'bg-purple-950/70 border-purple-500 text-purple-300'
                    : level === 'INTERMEDIATE'
                    ? 'bg-sky-950/70 border-sky-500 text-sky-300'
                    : 'bg-emerald-950/70 border-emerald-500 text-emerald-300'
                }`}
              >
                {tierInfo.title}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Challenge #{questionNumber} • {tierInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Live Metrics: Streak, Lives, Timer, Score, Hint */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
          {/* Writing Streak */}
          {streak > 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold animate-pulse">
              <span>🔥</span>
              <span>{streak} Streak</span>
            </div>
          )}

          {/* Lives Indicator */}
          <div
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60"
            aria-label={`Lives: ${lives} of ${maxLives}`}
          >
            {Array.from({ length: maxLives }).map((_, i) => (
              <span
                key={i}
                className={`transition-transform duration-300 ${
                  i < lives ? 'text-red-500 scale-100' : 'text-slate-600 grayscale opacity-40 scale-90'
                }`}
              >
                ❤️
              </span>
            ))}
          </div>

          {/* Timer Clock */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono font-bold ${
              isTimeLow
                ? 'bg-red-950/60 border-red-500/60 text-red-400 animate-pulse'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-200'
            }`}
          >
            <span>⏱️</span>
            <span>{formattedTime}</span>
          </div>

          {/* Score Counter */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-950/50 border border-indigo-600/40 text-indigo-300 font-semibold">
            <span>⭐</span>
            <span>{score} pts</span>
          </div>

          {/* Hint Trigger */}
          <button
            onClick={onOpenHint}
            disabled={hintsLeft <= 0}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg border font-medium transition ${
              hintsLeft > 0
                ? 'bg-amber-950/40 border-amber-600/40 text-amber-300 hover:bg-amber-900/40 active:scale-95'
                : 'bg-slate-800/40 border-slate-700/30 text-slate-500 cursor-not-allowed opacity-50'
            }`}
            title="Strategic Writing Hint"
          >
            <span>💡</span>
            <span>Hint ({hintsLeft})</span>
          </button>
        </div>
      </div>
    </header>
  );
};
