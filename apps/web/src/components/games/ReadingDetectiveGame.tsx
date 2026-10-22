'use client';

import * as React from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Clock,
  UserCheck,
  AlertTriangle,
  Volume2,
  Square,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { gameAudio } from '@/lib/audio/GameAudioManager';
import type { QuestionData } from './ReadAndEscapeGame';

interface ReadingDetectiveGameProps {
  currentQuestion: QuestionData | null;
  lives: number;
  score: number;
  onAnswer: (selectedOption: number, responseTimeMs: number) => Promise<{
    is_correct: boolean;
    explanation?: string;
    earned_score: number;
    lives_remaining: number;
    is_game_over: boolean;
  }>;
  onNextQuestion: () => void;
  onFinishGame: () => void;
}

const DEFAULT_CASE_DOSSIER = {
  caseNumber: 'DET-2026-08',
  title: 'The Disappearing Workstation Asset',
  status: 'UNDER ACTIVE INVESTIGATION',
  overview:
    'Rahul reported a missing high-spec laptop from his primary workstation. Security footage, access badges, and witness recollections must be analyzed to pinpoint what occurred.',
  timeline: [
    { time: '09:15 AM', event: 'Rahul clocks in at reception and arrives at workstation.' },
    { time: '09:30 AM', event: 'Rahul walks toward second-floor meeting room.' },
    { time: '09:40 AM', event: 'Neha enters building and proceeds immediately to meeting room.' },
    { time: '10:00 AM', event: 'Security confirms perimeter checkpoint has zero exit logs.' },
    { time: '10:15 AM', event: 'Rahul returns to desk; reports workstation laptop absent.' },
  ],
  witnesses: [
    {
      name: 'Security Officer',
      statement: 'No personnel exited the building through the turnstiles between 09:30 AM and 10:00 AM.',
    },
    {
      name: 'Neha (Project Lead)',
      statement: 'Attended the strategy sync in the meeting room; saw presentation notes being reviewed.',
    },
    {
      name: 'Rahul (Claimant)',
      statement: 'Remembered requiring slide schemas for the meeting right before departing workstation.',
    },
  ],
};

export function ReadingDetectiveGame({
  currentQuestion,
  lives,
  score,
  onAnswer,
  onNextQuestion,
  onFinishGame,
}: ReadingDetectiveGameProps) {
  const [activeTab, setActiveTab] = React.useState<'timeline' | 'witnesses' | 'overview'>('timeline');
  const [selectedOption, setSelectedOption] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    show: boolean;
    isCorrect: boolean;
    explanation: string;
  } | null>(null);
  const [startTime, setStartTime] = React.useState<number>(Date.now());
  const [cluesChecked, setCluesChecked] = React.useState<number>(0);

  const [isNarrating, setIsNarrating] = React.useState(false);

  React.useEffect(() => {
    setStartTime(Date.now());
    setSelectedOption(null);
    setFeedback(null);
  }, [currentQuestion?.question_id]);

  const handleSelectOption = (idx: number) => {
    if (feedback?.show || isSubmitting) return;
    setSelectedOption(idx);
    gameAudio.playSelect();
  };

  const dossierText = React.useMemo(() => {
    if (activeTab === 'timeline') {
      return DEFAULT_CASE_DOSSIER.timeline.map((t) => `${t.time}: ${t.event}`).join('. ');
    } else if (activeTab === 'witnesses') {
      return DEFAULT_CASE_DOSSIER.witnesses.map((w) => `${w.name} stated: ${w.statement}`).join('. ');
    }
    return DEFAULT_CASE_DOSSIER.overview;
  }, [activeTab]);

  const handleToggleNarration = () => {
    if (isNarrating) {
      gameAudio.stopSpeaking();
      setIsNarrating(false);
    } else {
      setIsNarrating(true);
      gameAudio.speak(dossierText, {
        onEnd: () => setIsNarrating(false),
      });
    }
  };

  React.useEffect(() => {
    return () => {
      gameAudio.stopSpeaking();
    };
  }, []);

  // Keyboard navigation (1-4, A-D, Enter)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (feedback?.show || isSubmitting || !currentQuestion) return;
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
        void handleSubmitDeduction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOption, isSubmitting, feedback, currentQuestion]);

  const handleSubmitDeduction = async () => {
    if (selectedOption === null || !currentQuestion || isSubmitting) return;

    setIsSubmitting(true);
    const responseTimeMs = Date.now() - startTime;

    try {
      const result = await onAnswer(selectedOption, responseTimeMs);
      setCluesChecked((prev) => prev + 1);

      if (result.is_correct) {
        gameAudio.playLockUnlock();
      }

      setFeedback({
        show: true,
        isCorrect: result.is_correct,
        explanation: result.explanation || (result.is_correct ? 'Deduction verified! Case correlation confirmed.' : 'Deductive error! Contradicts documented evidence.'),
      });
    } catch {
      // Handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = () => {
    setFeedback(null);
    setSelectedOption(null);
    onNextQuestion();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* -------------------- LEFT: CASE INVESTIGATION DOSSIER -------------------- */}
      <div className="lg:col-span-6 bg-slate-900/90 border border-purple-500/20 rounded-2xl p-5 shadow-2xl backdrop-blur-md flex flex-col h-[650px]">
        {/* Case File Header */}
        <div className="border-b border-purple-500/20 pb-3.5 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-2xs font-mono font-bold tracking-widest text-purple-400 uppercase">
              BUREAU DOSSIER • {DEFAULT_CASE_DOSSIER.caseNumber}
            </span>
            <Badge tone="purple" dot>
              {DEFAULT_CASE_DOSSIER.status}
            </Badge>
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Search className="size-4 text-purple-400" />
            {currentQuestion?.scenario || DEFAULT_CASE_DOSSIER.title}
          </h3>
        </div>

        {/* Dossier Tabs */}
        <div className="flex gap-2 mb-4 border-b border-slate-800 pb-2">
          {(['timeline', 'witnesses', 'overview'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors flex items-center gap-1.5',
                activeTab === tab
                  ? 'bg-purple-600/30 border border-purple-500/50 text-purple-200'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              )}
            >
              {tab === 'timeline' && <Clock className="size-3.5" />}
              {tab === 'witnesses' && <UserCheck className="size-3.5" />}
              {tab === 'overview' && <FileText className="size-3.5" />}
              {tab}
            </button>
          ))}
        </div>

        {/* Dossier Content Area */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-purple-500/30">
          {activeTab === 'timeline' && (
            <div className="relative pl-6 space-y-4 border-l border-purple-500/30 my-2">
              {DEFAULT_CASE_DOSSIER.timeline.map((entry, idx) => (
                <div key={idx} className="relative group">
                  <span className="absolute -left-[31px] top-1 size-2.5 rounded-full bg-purple-500 ring-4 ring-slate-900" />
                  <span className="text-2xs font-mono font-bold text-purple-400 block">{entry.time}</span>
                  <p className="text-xs sm:text-sm text-slate-300 mt-0.5 leading-relaxed">{entry.event}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'witnesses' && (
            <div className="space-y-3">
              {DEFAULT_CASE_DOSSIER.witnesses.map((w, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <UserCheck className="size-3.5 text-purple-400" /> {w.name}
                    </span>
                    <span className="text-3xs text-purple-300 uppercase font-mono">Sworn Statement</span>
                  </div>
                  <p className="text-xs text-slate-300 italic pl-5 leading-relaxed">&ldquo;{w.statement}&rdquo;</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-3 text-sm text-slate-300 leading-relaxed p-2">
              <p className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50">
                {DEFAULT_CASE_DOSSIER.overview}
              </p>
              {currentQuestion?.passage && (
                <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs sm:text-sm">
                  <span className="text-2xs font-bold font-mono text-purple-300 uppercase block mb-1">
                    Supplemental Evidence Memo:
                  </span>
                  {currentQuestion.passage}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-slate-800 text-2xs text-slate-400 flex items-center justify-between">
          <span>Clues Verified: <strong className="text-purple-400 font-mono">{cluesChecked}</strong></span>
          <span className="text-emerald-400 flex items-center gap-1 font-semibold">
            <ShieldCheck className="size-3" /> Chain of Custody Secure
          </span>
        </div>
      </div>

      {/* -------------------- RIGHT: INTERROGATION & DEDUCTION ROOM -------------------- */}
      <div className="lg:col-span-6 bg-slate-900/95 border border-purple-500/30 rounded-2xl p-5 shadow-2xl backdrop-blur-md flex flex-col min-h-[650px]">
        {currentQuestion ? (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-purple-400 animate-ping" />
                  <span className="text-xs font-mono font-bold text-purple-300 uppercase">
                    Interrogation Room • Clue #{currentQuestion.tag}
                  </span>
                </div>
                <Badge tone="purple" className="text-xs font-mono">
                  {currentQuestion.difficulty}
                </Badge>
              </div>

              <h2 className="text-base sm:text-lg font-bold text-white mb-4 leading-snug">
                {currentQuestion.question}
              </h2>

              {/* Options with full state lifecycle */}
              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedOption === opt.index;
                  const isResult = feedback?.show;
                  const isCorrectAnswer = isResult && isSelected && feedback.isCorrect;
                  const isWrongAnswer = isResult && isSelected && !feedback.isCorrect;

                  return (
                    <button
                      key={opt.index}
                      type="button"
                      disabled={isSubmitting || feedback?.show}
                      onClick={() => handleSelectOption(opt.index)}
                      className={cn(
                        'w-full text-left p-3.5 rounded-xl border text-sm font-medium transition-all flex items-start gap-3 relative group',
                        isCorrectAnswer
                          ? 'border-emerald-500 bg-emerald-500/20 text-white shadow-[0_0_15px_rgba(16,185,129,0.35)] ring-1 ring-emerald-500'
                          : isWrongAnswer
                          ? 'border-rose-500 bg-rose-500/20 text-white shadow-[0_0_15px_rgba(244,63,94,0.35)] ring-1 ring-rose-500'
                          : isSelected
                          ? 'border-purple-400 bg-purple-600/20 text-white shadow-[0_0_12px_rgba(168,85,247,0.25)] ring-1 ring-purple-400'
                          : 'border-slate-700/80 bg-slate-800/60 text-slate-300 hover:border-purple-500/40 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-purple-400',
                        (isSubmitting || feedback?.show) && 'cursor-default'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold font-mono transition-colors',
                          isCorrectAnswer
                            ? 'bg-emerald-500 text-slate-950 font-black'
                            : isWrongAnswer
                            ? 'bg-rose-500 text-white font-black'
                            : isSelected
                            ? 'bg-purple-500 text-white font-black'
                            : 'bg-slate-700 text-slate-300 group-hover:bg-slate-600'
                        )}
                      >
                        {String.fromCharCode(65 + opt.index)}
                      </span>
                      <span className="mt-0.5 flex-1">{opt.text}</span>
                      <span className="text-3xs text-slate-500 font-mono self-center uppercase hidden sm:inline">
                        Option {opt.index + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 pt-4 border-t border-slate-800">
              {feedback?.show ? (
                <div
                  className={cn(
                    'p-4 rounded-xl border mb-4 animate-in fade-in slide-in-from-bottom-2',
                    feedback.isCorrect
                      ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                      : 'border-red-500/40 bg-red-950/60 text-red-200'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {feedback.isCorrect ? (
                      <CheckCircle2 className="size-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="size-5 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 text-xs sm:text-sm">
                      <p className="font-bold mb-1">
                        {feedback.isCorrect ? 'Deduction Verified!' : 'Contradiction Found!'}
                      </p>
                      <p className="text-slate-300 leading-relaxed">{feedback.explanation}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-right">
                    <Button
                      variant={feedback.isCorrect ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={handleContinue}
                      className={cn(feedback.isCorrect && 'bg-purple-500 hover:bg-purple-600 text-white font-bold')}
                    >
                      Next Evidence Cross-Check <ArrowRight className="size-4 ml-1.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <HelpCircle className="size-3.5 text-purple-400" />
                    <span>Evaluate whether timeline and witness accounts eliminate contradictions.</span>
                  </div>

                  <Button
                    variant="primary"
                    disabled={selectedOption === null || isSubmitting}
                    loading={isSubmitting}
                    onClick={handleSubmitDeduction}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-md shadow-purple-600/20 px-5"
                  >
                    Confirm Deduction
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
            <ShieldCheck className="size-14 text-purple-400 animate-pulse" />
            <h3 className="text-xl font-bold text-white">Investigation Concluded</h3>
            <p className="text-sm text-slate-400 max-w-sm">
              All contradictory statements have been cross-examined. Ready to issue the final investigative dossier.
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={onFinishGame}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold"
            >
              Close Case & View EEDI Report
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
