'use client';

import * as React from 'react';
import {
  Headphones,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Send,
  Radio,
  Sparkles,
  Award,
  Sliders,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { gameAudio } from '@/lib/audio/GameAudioManager';
import type { GameProps } from '../_shared/types';

export default function ListeningQuestPluginGame({
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
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playbackRate, setPlaybackRate] = React.useState<number>(1.0);
  const [showTranscript, setShowTranscript] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    isCorrect: boolean;
    explanation?: string;
    earnedScore: number;
  } | null>(null);
  const [startTime, setStartTime] = React.useState<number>(Date.now());

  const dialogueText =
    currentQuestion?.scenario ||
    currentQuestion?.passage ||
    'Team Lead: "We need to ensure the staging environment deployment is stabilized by 3:00 PM today before the cross-functional client demo. Priya, please verify the database connection pooling parameters, and Rahul will finalize the end-to-end integration tests."';

  React.useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
    setIsSubmitting(false);
    setIsPlaying(false);
    setShowTranscript(false);
    setStartTime(Date.now());

    if (currentQuestion) {
      void emitEvent({
        type: 'QUESTION_SHOWN',
        payload: { question_id: currentQuestion.question_id, difficulty: level },
      });
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [currentQuestion, level, emitEvent]);

  // Audio synthesis handler
  const handleTogglePlay = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsPlaying(!isPlaying);
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(dialogueText);
      utterance.rate = playbackRate;
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      void emitEvent({
        type: 'AUDIO_PLAYED',
        payload: { speed: playbackRate, question_id: currentQuestion?.question_id },
      });
    }
  };

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

  // Keyboard navigation (1-4, A-D, Enter, 'P' to play audio)
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
      } else if (key === 'P' || e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOption, isSubmitting, feedback, currentQuestion, isPlaying, playbackRate, nextQuestion]);

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
        <p className="text-sm">Initializing audio session...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Audio Deck & Waveform Console */}
      <div className="bg-slate-900/90 border border-cyan-500/20 rounded-3xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Radio className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
                  AUDIO LAB SESSION #{currentQuestion.question_id}
                </span>
                <Badge tone="teal" className="border-cyan-500/30 text-cyan-300 text-2xs">
                  {currentQuestion.tag || 'Active Listening'}
                </Badge>
              </div>
              <h3 className="text-base font-bold text-white">Spoken Workplace Dialogue</h3>
            </div>
          </div>

          {/* Speed & Controls */}
          <div className="flex items-center gap-2">
            <span className="text-2xs font-mono text-slate-400 uppercase">Speed:</span>
            {[0.75, 1.0, 1.25].map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={cn(
                  'px-2 py-0.5 rounded text-2xs font-mono font-bold transition-colors',
                  playbackRate === rate
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                )}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Waveform Deck */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Button
              onClick={handleTogglePlay}
              className={cn(
                'font-bold rounded-xl px-5 py-2.5 flex items-center gap-2 transition-all',
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
              )}
            >
              {isPlaying ? (
                <>
                  <Pause className="size-4" />
                  <span>Pause Audio</span>
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  <span>Listen to Dialogue</span>
                </>
              )}
            </Button>

            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors"
            >
              <FileText className="size-3.5" />
              <span>{showTranscript ? 'Hide Transcript' : 'Show Dialogue Script'}</span>
            </button>
          </div>

          {/* Simulated Waveform Bars */}
          <div className="h-12 bg-slate-900/60 rounded-xl px-4 flex items-center justify-between gap-1 overflow-hidden border border-slate-800">
            {Array.from({ length: 48 }).map((_, i) => {
              const height = isPlaying
                ? Math.sin((i + Date.now() / 100) * 0.5) * 16 + 20
                : (i % 5) * 4 + 8;
              return (
                <div
                  key={i}
                  className={cn(
                    'w-1 rounded-full transition-all duration-75',
                    isPlaying ? 'bg-cyan-400 shadow-sm shadow-cyan-400' : 'bg-slate-700'
                  )}
                  style={{ height: `${Math.max(6, Math.min(38, height))}px` }}
                />
              );
            })}
          </div>

          {/* Optional Transcript View */}
          {showTranscript && (
            <div className="bg-slate-900/90 border border-cyan-500/20 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed font-sans animate-in fade-in duration-200">
              <span className="font-mono text-2xs text-cyan-400 block mb-1 uppercase font-bold">
                Spoken Dialogue Transcript:
              </span>
              {dialogueText}
            </div>
          )}
        </div>
      </div>

      {/* Comprehension Challenge */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase tracking-wider">
            <Headphones className="size-3.5" />
            <span>Active Comprehension Check</span>
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
                    ? 'border-cyan-500 bg-cyan-500/10 text-white shadow-lg shadow-cyan-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300 hover:text-white',
                  feedback !== null && 'cursor-default'
                )}
              >
                <div
                  className={cn(
                    'size-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                    isSelected
                      ? 'bg-cyan-500 text-slate-950'
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
                  <span>Accurate Verbal Comprehension (+{feedback.earnedScore} PTS)</span>
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-red-400" />
                  <span>Comprehension Missed — Critical Nuance Overlooked</span>
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
              ? 'Observation recorded. Ready for next audio dialogue.'
              : 'Listen carefully for implicit requirements, responsibilities, and timelines.'}
          </div>

          {!feedback ? (
            <Button
              onClick={handleSubmit}
              disabled={selectedOption === null || isSubmitting}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-cyan-500/30 flex items-center gap-2"
            >
              {isSubmitting ? (
                <span>Verifying...</span>
              ) : (
                <>
                  <Send className="size-4" />
                  <span>Confirm Interpretation</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => void nextQuestion()}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-cyan-500/30 flex items-center gap-2"
            >
              <span>Next Audio Clip</span>
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

