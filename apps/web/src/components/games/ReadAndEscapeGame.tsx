'use client';

import * as React from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  Unlock,
  XCircle,
  BookOpen,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Sparkles,
  HelpCircle,
  Volume2,
  Square,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { gameAudio } from '@/lib/audio/GameAudioManager';

export interface QuestionData {
  question_id: string;
  difficulty: string;
  question: string;
  options: { index: number; text: string }[];
  tag: string;
  scenario?: string;
  passage?: string;
  lock_type?: string;
}

interface ReadAndEscapeGameProps {
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

const DEFAULT_PASSAGE = `On Monday morning, Arjun arrived at the college library at 9:00 AM to complete his final project report.

He had saved the latest version of his project on a USB drive. Before starting his work, he placed the USB drive inside the front pocket of his black backpack.

At 9:30 AM, Arjun went to the second floor to meet his project partner, Meera. They discussed their database design for about twenty minutes.

At 9:55 AM, Arjun returned to his desk and noticed that his black backpack was still beside his chair, but the USB drive was missing.

Arjun checked the library desk and then spoke to the librarian. The librarian remembered seeing Arjun place something inside the front pocket of his backpack.

A security camera showed that no one had touched Arjun's backpack while he was on the second floor.

Arjun then remembered that he had taken the USB drive out of his backpack before going upstairs because he wanted to show Meera the latest database schema.

He checked the second-floor discussion room and found the USB drive beside the computer.

Arjun returned to the library and continued working on his project with zero downtime.`;

export function ReadAndEscapeGame({
  currentQuestion,
  lives,
  score,
  onAnswer,
  onNextQuestion,
  onFinishGame,
}: ReadAndEscapeGameProps) {
  const [selectedOption, setSelectedOption] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    show: boolean;
    isCorrect: boolean;
    explanation: string;
  } | null>(null);
  const [fontSize, setFontSize] = React.useState<'normal' | 'large'>('normal');
  const [startTime, setStartTime] = React.useState<number>(Date.now());

  // Track chamber level and the 3 locks
  const [chamberLevel, setChamberLevel] = React.useState<number>(1);
  const [unlockedLocks, setUnlockedLocks] = React.useState<number[]>([]);
  const currentLockIndex = Math.min(unlockedLocks.length, 2);

  const lockTypes = ['DETAIL', 'VOCABULARY', 'INFERENCE'];

  React.useEffect(() => {
    setStartTime(Date.now());
    setSelectedOption(null);
    setFeedback(null);
  }, [currentQuestion?.question_id]);

  const [isNarrating, setIsNarrating] = React.useState(false);

  const handleSelectOption = (idx: number) => {
    if (feedback?.show || isSubmitting) return;
    setSelectedOption(idx);
    gameAudio.playSelect();
  };

  const handleToggleNarration = () => {
    if (isNarrating) {
      gameAudio.stopSpeaking();
      setIsNarrating(false);
    } else {
      setIsNarrating(true);
      gameAudio.speak(passageText, {
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
        void handleSubmitKey();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOption, isSubmitting, feedback, currentQuestion]);

  const handleSubmitKey = async () => {
    if (selectedOption === null || !currentQuestion || isSubmitting) return;

    setIsSubmitting(true);
    const responseTimeMs = Date.now() - startTime;

    try {
      const result = await onAnswer(selectedOption, responseTimeMs);

      if (result.is_correct) {
        setUnlockedLocks((prev) => [...prev, currentLockIndex]);
        if (unlockedLocks.length + 1 >= 3) {
          gameAudio.playLockUnlock();
        }
      }

      setFeedback({
        show: true,
        isCorrect: result.is_correct,
        explanation: result.explanation || (result.is_correct ? 'Key verified! Lock mechanism released.' : 'Incorrect key combination. Lock engaged.'),
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

  const handleNextChamber = () => {
    setChamberLevel((prev) => prev + 1);
    setUnlockedLocks([]);
    setFeedback(null);
    setSelectedOption(null);
    gameAudio.playVictory();
    onNextQuestion();
  };

  const passageText = currentQuestion?.passage || DEFAULT_PASSAGE;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* -------------------- LEFT: READING ROOM PANEL -------------------- */}
      <div className="lg:col-span-6 bg-slate-900/90 border border-cyan-500/20 rounded-2xl p-5 shadow-2xl backdrop-blur-md flex flex-col h-[640px]">
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3.5 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <BookOpen className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold tracking-wide text-white uppercase flex items-center gap-2">
                Reading Room <Badge tone="info">Case File</Badge>
              </h3>
              <p className="text-xs text-slate-400">The Missing Project File</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800/80 rounded-lg p-1 border border-slate-700">
            <button
              type="button"
              onClick={handleToggleNarration}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 transition-colors',
                isNarrating ? 'bg-amber-500 text-slate-950 font-bold animate-pulse' : 'text-slate-300 hover:text-white bg-slate-700/50'
              )}
              title={isNarrating ? 'Stop narration' : 'Listen to case file'}
            >
              {isNarrating ? <Square className="size-3 fill-current" /> : <Volume2 className="size-3 text-cyan-400" />}
              <span>{isNarrating ? 'Stop' : 'Listen'}</span>
            </button>
            <div className="h-4 w-px bg-slate-700" />
            <button
              type="button"
              onClick={() => setFontSize('normal')}
              className={cn(
                'px-2 py-1 text-xs font-semibold rounded',
                fontSize === 'normal' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              )}
              title="Normal text size"
            >
              <ZoomOut className="size-3 inline mr-1" /> A-
            </button>
            <button
              type="button"
              onClick={() => setFontSize('large')}
              className={cn(
                'px-2 py-1 text-xs font-semibold rounded',
                fontSize === 'large' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              )}
              title="Large text size"
            >
              <ZoomIn className="size-3 inline mr-1" /> A+
            </button>
          </div>
        </div>

        {/* Scrollable Reading Text */}
        <div className="flex-1 overflow-y-auto pr-3 space-y-3.5 text-slate-200 leading-relaxed scrollbar-thin scrollbar-thumb-cyan-500/30">
          {passageText.split('\n\n').map((paragraph, i) => (
            <p
              key={i}
              className={cn(
                'p-2.5 rounded-lg transition-colors',
                fontSize === 'large' ? 'text-base leading-loose' : 'text-sm leading-relaxed',
                'bg-slate-800/40 border border-slate-700/50 hover:border-cyan-500/30 hover:bg-slate-800/70'
              )}
            >
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 text-2xs text-slate-400 flex items-center justify-between">
          <span>Tip: Scan carefully for timestamps, actors, and physical locations.</span>
          <span className="text-cyan-400 font-mono font-semibold">Evidence Chamber</span>
        </div>
      </div>

      {/* -------------------- RIGHT: VIRTUAL LOCK CHAMBER -------------------- */}
      <div className="lg:col-span-6 bg-slate-900/95 border border-cyan-500/30 rounded-2xl p-5 shadow-2xl backdrop-blur-md flex flex-col min-h-[640px]">
        {/* 3 Padlocks Status Bar */}
        <div className="grid grid-cols-3 gap-2.5 mb-5 pb-4 border-b border-cyan-500/20">
          {lockTypes.map((type, index) => {
            const isUnlocked = unlockedLocks.includes(index);
            const isCurrent = currentLockIndex === index && !isUnlocked;

            return (
              <div
                key={type}
                className={cn(
                  'flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all',
                  isUnlocked
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                    : isCurrent
                    ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300 ring-2 ring-cyan-500/30 animate-pulse'
                    : 'border-slate-700 bg-slate-800/40 text-slate-500'
                )}
              >
                <div className="mb-1">
                  {isUnlocked ? (
                    <Unlock className="size-5 text-emerald-400" />
                  ) : (
                    <Lock className={cn('size-5', isCurrent ? 'text-cyan-400' : 'text-slate-500')} />
                  )}
                </div>
                <span className="text-2xs font-bold tracking-wider uppercase">LOCK {index + 1}</span>
                <span className="text-3xs font-medium opacity-80">{type}</span>
              </div>
            );
          })}
        </div>

        {/* Lock Challenge / Question */}
        {currentQuestion ? (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Badge tone="purple" className="text-xs px-2.5 py-0.5">
                  Type: {currentQuestion.lock_type || lockTypes[currentLockIndex]}
                </Badge>
                <span className="text-xs text-slate-400 font-mono">
                  Difficulty: <strong className="text-cyan-400">{currentQuestion.difficulty}</strong>
                </span>
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
                          ? 'border-cyan-400 bg-cyan-500/20 text-white shadow-[0_0_12px_rgba(56,189,248,0.25)] ring-1 ring-cyan-400'
                          : 'border-slate-700/80 bg-slate-800/60 text-slate-300 hover:border-cyan-500/40 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400',
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
                            ? 'bg-cyan-500 text-slate-950 font-black'
                            : 'bg-slate-700 text-slate-300 group-hover:bg-slate-600'
                        )}
                      >
                        {String.fromCharCode(65 + opt.index)}
                      </span>
                      <span className="mt-0.5 flex-1">{opt.text}</span>
                      <span className="text-3xs text-slate-500 font-mono self-center uppercase hidden sm:inline">
                        Key {opt.index + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feedback & Actions */}
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
                        {feedback.isCorrect ? 'Lock Cracked!' : 'Key Mismatch!'}
                      </p>
                      <p className="text-slate-300 leading-relaxed">{feedback.explanation}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-right">
                    <Button
                      variant={feedback.isCorrect ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={handleContinue}
                      className={cn(feedback.isCorrect && 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold')}
                    >
                      {unlockedLocks.length >= 3 ? 'Clear Chamber' : 'Proceed to Next Lock'}
                      <ArrowRight className="size-4 ml-1.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <HelpCircle className="size-3.5 text-cyan-400" />
                    <span>Select the most accurate inference based strictly on the text.</span>
                  </div>

                  <Button
                    variant="primary"
                    disabled={selectedOption === null || isSubmitting}
                    loading={isSubmitting}
                    onClick={handleSubmitKey}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-500/20 px-5"
                  >
                    <KeyRound className="size-4 mr-2" />
                    Insert Key
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
            <Sparkles className="size-12 text-cyan-400 animate-bounce" />
            <h3 className="text-lg font-bold text-white">Chamber {chamberLevel} Cleared!</h3>
            <p className="text-sm text-slate-400 max-w-sm">
              All 3 virtual locks have been decrypted. You can proceed deeper into the next chamber or claim your current score.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={handleNextChamber}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
              >
                Enter Chamber {chamberLevel + 1}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={onFinishGame}
                className="border-emerald-500/40 text-emerald-400 font-bold"
              >
                Claim Victory & Finish
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
