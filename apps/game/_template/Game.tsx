'use client';

import * as React from 'react';
import { Sparkles, ArrowRight, CheckCircle2, XCircle, Send, Trophy, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { GameProps } from '../_shared/types';
import { emitGameEvent } from '../_sdk';

export default function TemplateGame({
  gameContext,
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
  const [questionStartTime, setQuestionStartTime] = React.useState<number>(Date.now());

  React.useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
    setIsSubmitting(false);
    setQuestionStartTime(Date.now());

    if (currentQuestion) {
      emitEvent({
        type: 'QUESTION_SHOWN',
        payload: { question_id: currentQuestion.question_id, difficulty: level },
      });
    }
  }, [currentQuestion, level, emitEvent]);

  if (!currentQuestion) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
        <div className="size-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center">
          <Trophy className="size-8" />
        </div>
        <h3 className="text-xl font-bold text-white">Mission Complete!</h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          All challenge stages have been conquered. Your score and EEDI evidence have been registered.
        </p>
        <Button
          onClick={() => completeGame()}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2.5 rounded-xl"
        >
          View EEDI Diagnostic Summary
        </Button>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (selectedOption === null || isSubmitting || feedback) return;

    setIsSubmitting(true);
    const responseTimeMs = Date.now() - questionStartTime;

    try {
      const res = await submitAnswer(selectedOption, responseTimeMs);
      setFeedback({
        isCorrect: res.is_correct,
        explanation: res.explanation,
        earnedScore: res.earned_score,
      });

      emitEvent({
        type: res.is_correct ? 'ANSWER_CORRECT' : 'ANSWER_WRONG',
        payload: {
          question_id: currentQuestion.question_id,
          selected_option: selectedOption,
          response_time_ms: responseTimeMs,
          earned_score: res.earned_score,
        },
      });
    } catch (err) {
      console.error('Answer submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Briefing Card */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="size-4 text-indigo-400" />
              {gameContext.title}
            </h3>
            <Badge tone="indigo" className="text-3xs font-mono">
              Tier: {level}
            </Badge>
          </div>

          {currentQuestion.scenario && (
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 text-xs text-indigo-200/90 leading-relaxed">
              <strong className="text-indigo-300 block mb-1">Scenario Briefing:</strong>
              {currentQuestion.scenario}
            </div>
          )}

          {currentQuestion.passage && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-slate-300 leading-relaxed">
              {currentQuestion.passage}
            </div>
          )}
        </div>
      </div>

      {/* Right Question Card */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 backdrop-blur-md">
          <h2 className="text-base sm:text-lg font-bold text-white leading-snug">
            {currentQuestion.question}
          </h2>

          <div className="space-y-3">
            {currentQuestion.options.map((opt) => {
              const isSelected = selectedOption === opt.index;
              const isSubmitted = feedback !== null;

              return (
                <button
                  key={opt.index}
                  type="button"
                  onClick={() => !isSubmitted && setSelectedOption(opt.index)}
                  disabled={isSubmitted || isSubmitting}
                  className={cn(
                    'w-full text-left p-4 rounded-2xl border transition-all text-xs sm:text-sm font-medium flex items-start gap-3.5',
                    isSelected && !isSubmitted && 'border-indigo-500 bg-indigo-500/10 text-white',
                    !isSelected && !isSubmitted && 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700',
                    isSubmitted && isSelected && feedback.isCorrect && 'border-emerald-500 bg-emerald-950/30 text-emerald-200',
                    isSubmitted && isSelected && !feedback.isCorrect && 'border-red-500 bg-red-950/30 text-red-200'
                  )}
                >
                  <span className="size-6 rounded-lg border flex items-center justify-center shrink-0 text-2xs font-mono font-bold mt-0.5">
                    {String.fromCharCode(65 + opt.index)}
                  </span>
                  <div className="flex-1">{opt.text}</div>
                </button>
              );
            })}
          </div>

          {feedback && (
            <div
              className={cn(
                'p-4 rounded-2xl border space-y-1',
                feedback.isCorrect
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/40 border-red-500/40 text-red-200'
              )}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                {feedback.isCorrect ? (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    <span>Correct Analysis (+{feedback.earnedScore} XP)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-4 text-red-400" />
                    <span>Incorrect Selection (-1 Life)</span>
                  </>
                )}
              </div>
              {feedback.explanation && (
                <p className="text-2xs opacity-90 pl-6">{feedback.explanation}</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <span className="text-3xs text-slate-400 font-mono">Attempt: {attemptId.slice(0, 8)}...</span>
            {!feedback ? (
              <Button
                onClick={handleSubmit}
                disabled={selectedOption === null || isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 rounded-xl"
              >
                <Send className="size-4 mr-2" />
                {isSubmitting ? 'Evaluating...' : 'Submit Action'}
              </Button>
            ) : (
              <Button
                onClick={() => nextQuestion()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 rounded-xl"
              >
                Next Challenge <ArrowRight className="size-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

