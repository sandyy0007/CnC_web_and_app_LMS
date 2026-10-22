'use client';

import * as React from 'react';
import {
  Inbox,
  Mail,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Send,
  Zap,
  Sparkles,
  Trophy,
  Filter,
  CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { gameAudio } from '@/lib/audio/GameAudioManager';
import type { GameProps } from '../_shared/types';

export default function InboxRescuePluginGame({
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
        <p className="text-sm">Awaiting next incoming thread...</p>
      </div>
    );
  }

  const rawMessage =
    currentQuestion.scenario ||
    currentQuestion.passage ||
    'INCOMING THREAD: "Hey, why isn\'t the client deck done yet?? I needed this yesterday and you guys are slowing down the entire Q3 launch. Fix it ASAP or we\'re going to have major problems with leadership."';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Inbox Terminal Header */}
      <div className="bg-slate-900/90 border border-amber-500/20 rounded-3xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Inbox className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-widest text-amber-400">
                  INBOX TERMINAL · MSG #{currentQuestion.question_id}
                </span>
                <Badge tone="amber" className="border-amber-500/30 text-amber-300 text-2xs">
                  {currentQuestion.tag || 'Tone Repair'}
                </Badge>
              </div>
              <h3 className="text-base font-bold text-white">Uncalibrated Communication Inbound</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-mono font-medium bg-red-500/10 border border-red-500/20 text-red-300">
              <AlertCircle className="size-3" />
              <span>High Friction Detected</span>
            </span>
          </div>
        </div>

        {/* Unpolished / Toxic Message Preview */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 font-sans">
          <div className="flex flex-wrap items-center justify-between text-2xs font-mono text-slate-400 border-b border-slate-800/80 pb-2">
            <div>STATUS: UNPROCESSED (HIGH EMOTIONAL REACTIVITY)</div>
            <div>ACTION: RE-ENGINEER BEFORE TRANSMISSION</div>
          </div>
          <p className="text-sm text-amber-200/90 leading-relaxed font-mono bg-amber-950/20 border border-amber-500/10 p-3.5 rounded-xl">
            {rawMessage}
          </p>
        </div>
      </div>

      {/* Polish & Solution Selector */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-wider">
            <Zap className="size-3.5" />
            <span>Optimal Professional Calibration</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
            {currentQuestion.question}
          </h2>
        </div>

        {/* Options */}
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
                    ? 'border-amber-500 bg-amber-500/10 text-white shadow-lg shadow-amber-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300 hover:text-white',
                  feedback !== null && 'cursor-default'
                )}
              >
                <div
                  className={cn(
                    'size-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                    isSelected
                      ? 'bg-amber-500 text-slate-950'
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
                  <span>Executive Tone Calibrated Successfully (+{feedback.earnedScore} PTS)</span>
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-red-400" />
                  <span>Tone Revision Failed — Friction Remains Unresolved</span>
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

        {/* Controls */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            {feedback
              ? 'Calibrated version accepted. Ready for next inbox dispatch.'
              : 'Choose the draft that preserves accountability without escalating hostility.'}
          </div>

          {!feedback ? (
            <Button
              onClick={handleSubmit}
              disabled={selectedOption === null || isSubmitting}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-2"
            >
              {isSubmitting ? (
                <span>Filtering...</span>
              ) : (
                <>
                  <Send className="size-4" />
                  <span>Approve & Dispatch</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => void nextQuestion()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-2"
            >
              <span>Next Dispatch</span>
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

