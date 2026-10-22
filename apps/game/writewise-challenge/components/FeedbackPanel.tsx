'use client';

import React from 'react';
import type { AnswerSubmissionResult } from '../../_shared/types';

interface FeedbackPanelProps {
  result: AnswerSubmissionResult;
  onNext: () => void;
  isLoadingNext: boolean;
  isLastQuestion?: boolean;
}

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  result,
  onNext,
  isLoadingNext,
  isLastQuestion,
}) => {
  const isCorrect = result.is_correct;

  return (
    <div
      className={`w-full mt-6 p-5 sm:p-6 rounded-2xl border-2 transition-all duration-300 shadow-2xl ${
        isCorrect
          ? 'bg-gradient-to-b from-emerald-950/90 to-slate-950 border-emerald-500/70 text-emerald-100'
          : 'bg-gradient-to-b from-rose-950/90 to-slate-950 border-rose-500/70 text-rose-100'
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        {/* Status Headline & Badge */}
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black ${
              isCorrect ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
            }`}
          >
            {isCorrect ? '✓' : '✗'}
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold">
              {isCorrect ? 'Excellent Communication Polish!' : 'Writing Revision Needed'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              {isCorrect
                ? `+${result.earned_score ?? 0} Points Earned`
                : result.lives_remaining > 0
                ? `1 Life Lost • ${result.lives_remaining} Lives Remaining`
                : 'Out of Lives!'}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onNext}
          disabled={isLoadingNext}
          className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm tracking-wide transition shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
            isCorrect
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95'
              : 'bg-rose-500 hover:bg-rose-400 text-white active:scale-95'
          } ${isLoadingNext ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <span>{isLoadingNext ? 'Loading...' : isLastQuestion ? 'Complete Challenge ➔' : 'Continue ➔'}</span>
        </button>
      </div>

      {/* Deep Educational Explanation */}
      <div className="mt-4 pt-4 border-t border-slate-800/80">
        <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block mb-1">
          Why this is effective:
        </span>
        <p className="text-xs sm:text-sm leading-relaxed text-slate-200">
          {result.explanation}
        </p>
      </div>
    </div>
  );
};
