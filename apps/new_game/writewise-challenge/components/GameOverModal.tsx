'use client';

import React from 'react';

interface GameOverModalProps {
  reason: 'victory' | 'out_of_lives' | 'timeout';
  score: number;
  totalAnswered: number;
  correctCount: number;
  onFinish: () => Promise<void>;
  isSubmitting: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  reason,
  score,
  totalAnswered,
  correctCount,
  onFinish,
  isSubmitting,
}) => {
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-white text-center">
        {/* Status Icon */}
        <div
          className={`w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center text-4xl shadow-xl ${
            reason === 'victory'
              ? 'bg-gradient-to-tr from-emerald-500 to-sky-500 text-white shadow-emerald-500/20'
              : reason === 'timeout'
              ? 'bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-amber-500/20'
              : 'bg-gradient-to-tr from-rose-600 to-slate-700 text-white shadow-rose-600/20'
          }`}
        >
          {reason === 'victory' ? '🏆' : reason === 'timeout' ? '⏱️' : '💔'}
        </div>

        {/* Title & Subtitle */}
        <h2 className="text-xl sm:text-2xl font-black mb-2">
          {reason === 'victory'
            ? 'Writing Simulation Complete!'
            : reason === 'timeout'
            ? 'Time Limit Reached'
            : 'Out of Lives'}
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mb-6">
          {reason === 'victory'
            ? 'You have successfully completed the WriteWise writing assessment challenges.'
            : reason === 'timeout'
            ? 'The 15-minute simulation session has concluded.'
            : 'You depleted all 3 lives during the challenges.'}
        </p>

        {/* Performance Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-8 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Final Score</span>
            <span className="text-base sm:text-xl font-bold text-sky-300">{score} pts</span>
          </div>
          <div className="border-x border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Accuracy</span>
            <span className="text-base sm:text-xl font-bold text-emerald-300">{accuracy}%</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Completed</span>
            <span className="text-base sm:text-xl font-bold text-indigo-300">
              {correctCount}/{totalAnswered}
            </span>
          </div>
        </div>

        {/* Canonical Complete Trigger */}
        <button
          onClick={onFinish}
          disabled={isSubmitting}
          className={`w-full py-4 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 font-bold text-white text-sm sm:text-base tracking-wide transition shadow-xl shadow-sky-500/25 cursor-pointer ${
            isSubmitting ? 'opacity-60 cursor-not-allowed' : 'active:scale-[0.99]'
          }`}
        >
          {isSubmitting ? 'Finalizing with LMS Server...' : 'View Official Report Card ➔'}
        </button>
      </div>
    </div>
  );
};
