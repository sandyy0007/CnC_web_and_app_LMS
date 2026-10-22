'use client';

import React from 'react';

interface HintModalProps {
  hintText: string;
  hintsLeft: number;
  isOpen: boolean;
  onClose: () => void;
}

export const HintModal: React.FC<HintModalProps> = ({
  hintText,
  hintsLeft,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-white">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <span className="text-xl">💡</span>
            <span>Writing Advisor Clue</span>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {hintsLeft} Hint{hintsLeft === 1 ? '' : 's'} Remaining
          </span>
        </div>

        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs sm:text-sm text-amber-100 leading-relaxed mb-6">
          {hintText}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-white text-xs sm:text-sm transition cursor-pointer"
        >
          Got It, Back to Challenge
        </button>
      </div>
    </div>
  );
};
