'use client';

import React from 'react';

interface BriefingModalProps {
  onStart: () => void;
  gameTitle: string;
  durationMinutes: number;
  xpReward: number;
}

export const BriefingModal: React.FC<BriefingModalProps> = ({
  onStart,
  gameTitle,
  durationMinutes,
  xpReward,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-white">
        {/* Modal Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-sky-500/20">
            ✍️
          </div>
          <div>
            <span className="text-xs font-bold text-sky-400 uppercase tracking-widest">
              LMS Writing Assessment
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">{gameTitle}</h2>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Duration</span>
            <span className="text-base sm:text-lg font-bold text-sky-300">~{durationMinutes} min</span>
          </div>
          <div className="border-x border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">XP Reward</span>
            <span className="text-base sm:text-lg font-bold text-amber-300">+{xpReward} XP</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Lives</span>
            <span className="text-base sm:text-lg font-bold text-rose-400">3 Lives ❤️</span>
          </div>
        </div>

        {/* Competencies Covered */}
        <div className="mb-6 space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Target EEDI Competencies
          </h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1 rounded-lg bg-sky-950/80 border border-sky-500/50 text-sky-300 font-medium">
              COM08 • Written Communication (Primary)
            </span>
            <span className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-medium">
              COM05 • Clarity & Conciseness
            </span>
            <span className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-medium">
              COM02 • Professional Tone
            </span>
            <span className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-medium">
              COM04 • Reading Comprehension
            </span>
          </div>
        </div>

        {/* 6 Challenge Types summary */}
        <div className="mb-8 p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300 space-y-2">
          <div className="font-semibold text-slate-200 mb-1">Interactive Simulation Modes:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div>✏️ <strong>Fix the Sentence:</strong> Correct syntax & grammar</div>
            <div>💼 <strong>Professional Rewrite:</strong> Polish casual messages</div>
            <div>🕵️ <strong>Tone Detective:</strong> Audit emotional nuance</div>
            <div>🧩 <strong>Sentence Builder:</strong> Assemble fluent syntax</div>
            <div>✂️ <strong>Concise Writing:</strong> Trim corporate bloat</div>
            <div>✉️ <strong>Email Response:</strong> Master executive replies</div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onStart}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 font-bold text-white text-base tracking-wide transition shadow-xl shadow-sky-500/25 active:scale-[0.99] cursor-pointer"
        >
          Begin Writing Simulation ➔
        </button>
      </div>
    </div>
  );
};
