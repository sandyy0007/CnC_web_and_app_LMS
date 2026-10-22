'use client';

import * as React from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ShieldAlert,
  Send,
  Sparkles,
  Lock,
  Unlock,
  Clock,
  Pin,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { gameAudio } from '@/lib/audio/GameAudioManager';
import type { GameProps } from '../_shared/types';

export default function EmailEscapePluginGame({
  attemptId,
  level,
  currentQuestion,
  lives,
  score,
  emitEvent,
  submitAnswer,
  nextQuestion,
  completeGame,
}: GameProps) {
  const [selectedOption, setSelectedOption] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    isCorrect: boolean;
    explanation?: string;
    earnedScore: number;
  } | null>(null);
  const [startTime, setStartTime] = React.useState<number>(Date.now());

  React.useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
    setIsSubmitting(false);
    setStartTime(Date.now());

    if (currentQuestion) {
      void emitEvent({
        type: 'QUESTION_SHOWN',
        payload: { question_id: currentQuestion.question_id, difficulty: level },
      });
    }
  }, [currentQuestion, level, emitEvent]);

  const handleSelectOption = (idx: number) => {
    if (isSubmitting || feedback) return;
    setSelectedOption(idx);
    gameAudio.playSelect();
    void emitEvent({
      type: 'ANSWER_SELECTED',
      payload: { selected_option: idx, question_id: currentQuestion?.question_id },
    });
  };

  const handleSubmit = async () => {
    if (selectedOption === null || isSubmitting || feedback) return;
    setIsSubmitting(true);
    const responseTime = Date.now() - startTime;

    try {
      const res = await submitAnswer(selectedOption, responseTime);
      setFeedback({
        isCorrect: res.is_correct,
        explanation: res.explanation,
        earnedScore: res.earned_score,
      });
    } catch (e) {
      console.error('Answer submission failed:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard navigation (1-4, A-D, Enter)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting || !currentQuestion) return;
      if (feedback) {
        if (e.key === 'Enter') {
          void nextQuestion();
        }
        return;
      }
      const key = e.key.toUpperCase();
      if (['1', '2', '3', '4'].includes(key)) {
        const idx = parseInt(key, 10) - 1;
        if (currentQuestion.options[idx]) {
          handleSelectOption(idx);
        }
      } else if (['A', 'B', 'C', 'D'].includes(key)) {
        const idx = key.charCodeAt(0) - 65;
        if (currentQuestion.options[idx]) {
          handleSelectOption(idx);
        }
      } else if (e.key === 'Enter' && selectedOption !== null) {
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOption, isSubmitting, feedback, currentQuestion, nextQuestion]);

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
        <p className="text-sm">Awaiting next escalation dispatch...</p>
      </div>
    );
  }

  const scenarioText =
    currentQuestion.scenario ||
    currentQuestion.passage ||
    'URGENT ESCALATION: The enterprise client is threatening to terminate the annual renewal contract by 5:00 PM due to misaligned SLA expectations and missed milestone deliverables.';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Incident Case Dossier Header */}
      <div className="bg-slate-900/90 border border-purple-500/20 rounded-3xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <FileText className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-widest text-purple-400">
                  CONFIDENTIAL CASE #{currentQuestion.question_id}
                </span>
                <Badge tone="purple" className="border-purple-500/30 text-purple-300 text-2xs">
                  {currentQuestion.tag || 'Contract At Risk'}
                </Badge>
              </div>
              <h3 className="text-base font-bold text-white">Client Escalation Briefing</h3>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="size-3.5 text-purple-400" />
              <span>SLA Target: 15m</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-400">
              <Flame className="size-3.5" />
              <span>Severity: P1 High</span>
            </div>
          </div>
        </div>

        {/* Incident Narrative / Email Trail */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-3 font-sans">
          <div className="flex items-center justify-between text-2xs font-mono text-slate-400 border-b border-slate-800/80 pb-2">
            <div>FROM: director-procurement@client-account.org</div>
            <div>TO: operations-lead@winnerscreek.edu</div>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed italic">{scenarioText}</p>
        </div>
      </div>

      {/* Challenge Question & Strategy Options */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-purple-400 uppercase tracking-wider">
            <Pin className="size-3.5" />
            <span>Operational Decision Required</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
            {currentQuestion.question}
          </h2>
        </div>

        {/* Decision Options */}
        <div className="grid gap-3">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = selectedOption === option.index;
            return (
              <button
                key={option.index}
                onClick={() => handleSelectOption(option.index)}
                disabled={isSubmitting || feedback !== null}
                className={cn(
                  'w-full text-left p-4 rounded-2xl border transition-all duration-200 relative flex items-start gap-3.5 group',
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10 text-white shadow-lg shadow-purple-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300 hover:text-white',
                  feedback !== null && 'cursor-default'
                )}
              >
                <div
                  className={cn(
                    'size-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                    isSelected
                      ? 'bg-purple-500 text-white'
                      : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
                  )}
                >
                  {String.fromCharCode(65 + idx)}
                </div>
                <div className="text-sm font-medium leading-relaxed flex-1">{option.text}</div>
              </button>
            );
          })}
        </div>

        {/* Feedback Section */}
        {feedback && (
          <div
            className={cn(
              'p-5 rounded-2xl border space-y-2 animate-in fade-in duration-300',
              feedback.isCorrect
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            )}
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              {feedback.isCorrect ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-400" />
                  <span>Strategic Decision Approved (+{feedback.earnedScore} PTS)</span>
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-red-400" />
                  <span>Contract Friction Detected — Critical Flaw in Strategy</span>
                </>
              )}
            </div>
            {feedback.explanation && (
              <p className="text-xs text-slate-300 leading-relaxed pl-7 font-sans">
                {feedback.explanation}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            {feedback
              ? 'Review resolution before proceeding to next escalation'
              : 'Select the optimal de-escalation response and submit'}
          </div>

          {!feedback ? (
            <Button
              onClick={handleSubmit}
              disabled={selectedOption === null || isSubmitting}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 flex items-center gap-2"
            >
              {isSubmitting ? (
                <span>Transmitting...</span>
              ) : (
                <>
                  <Send className="size-4" />
                  <span>Deploy Strategy</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => void nextQuestion()}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 flex items-center gap-2"
            >
              <span>Next Escalation</span>
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

