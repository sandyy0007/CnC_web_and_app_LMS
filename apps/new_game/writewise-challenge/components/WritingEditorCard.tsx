'use client';

import React from 'react';
import type { QuestionData } from '../../_shared/types';
import {
  detectChallengeType,
  CHALLENGE_META,
  ChallengeType,
} from '../utils/writingChallenge';

interface WritingEditorCardProps {
  question: QuestionData;
  activeType: ChallengeType;
}

export const WritingEditorCard: React.FC<WritingEditorCardProps> = ({
  question,
  activeType,
}) => {
  const meta = CHALLENGE_META[activeType];

  return (
    <div className="w-full rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden mb-6">
      {/* Editor Title Bar & Document Tab */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 select-none">
        <div className="flex items-center gap-3">
          {/* Window control dots */}
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
          </div>

          {/* Active Document Tab */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-950 border-t-2 border-sky-400 rounded-t-md text-xs font-mono text-slate-200 shadow-sm">
            <span>{meta.icon}</span>
            <span>{meta.documentTabName}</span>
          </div>
        </div>

        {/* Challenge Category Badge */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400 uppercase hidden sm:inline">
            EEDI: {question.eedi_parameter}
          </span>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
              meta.badgeColor === 'amber'
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                : meta.badgeColor === 'purple'
                ? 'bg-purple-950/60 border-purple-500/50 text-purple-300'
                : meta.badgeColor === 'rose'
                ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                : meta.badgeColor === 'emerald'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : meta.badgeColor === 'indigo'
                ? 'bg-indigo-950/60 border-indigo-500/50 text-indigo-300'
                : 'bg-sky-950/60 border-sky-500/50 text-sky-300'
            }`}
          >
            {meta.badgeLabel}
          </span>
        </div>
      </div>

      {/* Scenario & Context Header */}
      {question.scenario && (
        <div className="px-5 py-3 bg-slate-900/60 border-b border-slate-800/80 flex items-start gap-3">
          <span className="text-xl">🏢</span>
          <div>
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">
              Workplace Context
            </span>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">{question.scenario}</p>
          </div>
        </div>
      )}

      {/* Editor Body with Code/Writing styling */}
      <div className="p-4 sm:p-6 font-sans">
        {/* If passage or raw draft exists */}
        {question.passage && (
          <div className="relative mb-4 p-4 rounded-lg bg-slate-900/90 border border-slate-800 font-mono text-xs sm:text-sm text-slate-200">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 border-b border-slate-800 pb-1">
              <span className="font-semibold text-slate-300">
                {activeType === 'email_response'
                  ? 'Incoming Communication'
                  : activeType === 'professional_rewrite'
                  ? 'Unpolished Draft'
                  : 'Document Passage'}
              </span>
              <span className="text-sky-400 animate-pulse font-sans">● LIVE EDIT</span>
            </div>
            <div className="flex gap-3">
              {/* Line numbers */}
              <div className="select-none text-slate-600 font-mono text-xs leading-relaxed text-right pr-2 border-r border-slate-800">
                <div>01</div>
                <div>02</div>
              </div>
              <div className="flex-1 whitespace-pre-wrap leading-relaxed text-amber-200/90 italic">
                {question.passage.replace(/^"|"$/g, '')}
                <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse align-middle" />
              </div>
            </div>
          </div>
        )}

        {/* Prompt / Challenge Directive */}
        <div className="flex items-start gap-3 mt-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-base flex-shrink-0">
            ?
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-white leading-snug">
              {question.question}
            </h2>
            <p className="text-xs text-slate-400 mt-1">{meta.guidanceText}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
