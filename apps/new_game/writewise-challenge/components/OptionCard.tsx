'use client';

import React from 'react';

interface OptionCardProps {
  index: number;
  text: string;
  isSelected: boolean;
  isCorrect?: boolean | null;
  isDisabled: boolean;
  onSelect: (index: number) => void;
  showResult: boolean;
}

export const OptionCard: React.FC<OptionCardProps> = ({
  index,
  text,
  isSelected,
  isCorrect,
  isDisabled,
  onSelect,
  showResult,
}) => {
  const letters = ['A', 'B', 'C', 'D'];
  const letter = letters[index] || `${index + 1}`;

  // Determine styling based on submission state
  let stateClasses = 'bg-slate-900/90 border-slate-800 text-slate-200 hover:bg-slate-800 hover:border-slate-700';

  if (showResult) {
    if (isCorrect === true) {
      // Correct answer highlight
      stateClasses = 'bg-emerald-950/80 border-emerald-500 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.2)]';
    } else if (isSelected && isCorrect === false) {
      // Wrong selected answer
      stateClasses = 'bg-rose-950/80 border-rose-500 text-rose-100';
    } else {
      // Inactive options after submission
      stateClasses = 'bg-slate-900/40 border-slate-800/40 text-slate-500 opacity-60';
    }
  } else if (isSelected) {
    stateClasses = 'bg-sky-950/80 border-sky-400 text-white shadow-[0_0_15px_rgba(14,165,233,0.25)]';
  }

  return (
    <button
      type="button"
      onClick={() => !isDisabled && onSelect(index)}
      disabled={isDisabled}
      aria-pressed={isSelected}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-3.5 group focus:outline-none focus:ring-2 focus:ring-sky-500/50 ${stateClasses} ${
        !isDisabled ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'
      }`}
    >
      {/* Option Key Letter / Number badge */}
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold transition flex-shrink-0 ${
          showResult && isCorrect === true
            ? 'bg-emerald-500 text-white'
            : showResult && isSelected && isCorrect === false
            ? 'bg-rose-500 text-white'
            : isSelected
            ? 'bg-sky-500 text-white'
            : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
        }`}
      >
        {letter}
      </div>

      {/* Option text content */}
      <div className="flex-1 text-xs sm:text-sm font-medium leading-relaxed">
        {text}
      </div>

      {/* Status icon badge */}
      {showResult && isCorrect === true && (
        <span className="text-emerald-400 text-base font-bold flex-shrink-0" aria-label="Correct">
          ✓
        </span>
      )}
      {showResult && isSelected && isCorrect === false && (
        <span className="text-rose-400 text-base font-bold flex-shrink-0" aria-label="Incorrect">
          ✗
        </span>
      )}
    </button>
  );
};
