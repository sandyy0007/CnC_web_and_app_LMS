'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Target,
  Volume2,
  XCircle,
  Zap,
} from 'lucide-react';
import type { GameDifficultyTier, GameProps, QuestionData } from '../_shared/types';
import { gameAudio } from '@/lib/audio/GameAudioManager';
import { TimerRing } from './components/TimerRing';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { useQuestionTimer } from './hooks/useQuestionTimer';
import { readCorrectIndex, readExplanation, readIsCorrect } from './utils/result';

/** Float duration in seconds per difficulty tier */
const FLOAT_SECONDS_BY_TIER: Record<GameDifficultyTier, number> = {
  BEGINNER: 24,
  INTERMEDIATE: 18,
  ADVANCED: 12,
};

const FEEDBACK_MS = 2400;
const TIMEOUT_OPTION = -1;

type EmitFn = (type: string, payload: Record<string, unknown>) => void;
type QuestionPhase = 'playing' | 'submitting' | 'feedback';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
}

interface FeedbackState {
  kind: 'correct' | 'wrong' | 'timeout';
  poppedIndex: number | null;
  correctIndex: number | null;
  explanation: string | null;
  earnedScore?: number;
}

const BALLOON_COLORS = [
  { fill: '#ef4444', ring: 'border-red-500', glow: 'rgba(239, 68, 68, 0.4)', text: 'text-red-400' },
  { fill: '#3b82f6', ring: 'border-blue-500', glow: 'rgba(59, 130, 246, 0.4)', text: 'text-blue-400' },
  { fill: '#f59e0b', ring: 'border-amber-500', glow: 'rgba(245, 158, 11, 0.4)', text: 'text-amber-400' },
  { fill: '#10b981', ring: 'border-emerald-500', glow: 'rgba(16, 185, 129, 0.4)', text: 'text-emerald-400' },
];

/* ------------------------------------------------------------------------ */
/* Single Question Play Area                                                */
/* ------------------------------------------------------------------------ */

interface PlayAreaProps {
  question: QuestionData;
  tier: GameDifficultyTier;
  seconds: number;
  streak: number;
  submit: GameProps['submitAnswer'];
  emit: EmitFn;
  onResolved: (correct: boolean) => void;
  onDone: (answeredId: string) => void;
}

function QuestionPlayArea({
  question,
  tier,
  seconds,
  streak,
  submit,
  emit,
  onResolved,
  onDone,
}: PlayAreaProps) {
  const options = useMemo(() => {
    return (question.options ?? []).slice(0, 4).map((o: any) => (typeof o === 'string' ? o : o?.text ?? ''));
  }, [question.options]);

  const questionId = question.question_id;
  const reducedMotion = usePrefersReducedMotion();

  const [phase, setPhase] = useState<QuestionPhase>('playing');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const lockedRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement>(null);
  const expireRef = useRef<() => void>(() => undefined);

  const timer = useQuestionTimer(questionId, seconds, phase === 'playing', () => expireRef.current());
  const { totalMs, elapsedMs } = timer;

  useEffect(() => {
    emit('QUESTION_SHOWN', { questionId, timestamp: Date.now() });
  }, [emit, questionId]);

  // Generate particle explosion on correct pop
  const triggerPopParticles = useCallback((originX: number, originY: number, color: string) => {
    const burstCount = 28;
    const newParticles: Particle[] = [];
    const colors = [color, '#f59e0b', '#fbbf24', '#ffffff', '#ef4444', '#ec4899'];

    for (let i = 0; i < burstCount; i++) {
      const angle = (Math.PI * 2 * i) / burstCount + (Math.random() - 0.5);
      const speed = 60 + Math.random() * 120;
      newParticles.push({
        id: Math.random(),
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 8,
        rotation: Math.random() * 360,
      });
    }
    setParticles(newParticles);

    // Particle animation frame loop
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx * 0.04,
            y: p.y + p.vy * 0.04 + 1.2, // slight gravity
            size: Math.max(0, p.size * 0.94),
            rotation: p.rotation + 8,
          }))
          .filter((p) => p.size > 0.5)
      );
      if (frame > 35) {
        clearInterval(interval);
        setParticles([]);
      }
    }, 25);
  }, []);

  // Handle balloon pop / answer resolution
  const popBalloon = useCallback(
    async (optionIndex: number, eventTarget?: HTMLElement | null) => {
      if (lockedRef.current) return;
      lockedRef.current = true;

      const timedOut = optionIndex === TIMEOUT_OPTION;
      const responseMs = timedOut ? totalMs : Math.max(0, Math.round(elapsedMs()));

      setSelectedIdx(timedOut ? null : optionIndex);
      setPhase('submitting');

      if (timedOut) {
        emit('TIMEOUT', { questionId, allowedDuration: seconds });
      } else {
        emit('ANSWER_SELECTED', { questionId, optionIndex });
      }

      try {
        const result = await submit(optionIndex, responseMs);
        const isCorrect = !timedOut && readIsCorrect(result);

        if (isCorrect) {
          gameAudio.playCorrect();
          // Trigger particles from clicked balloon or center
          if (eventTarget && arenaRef.current) {
            const rect = eventTarget.getBoundingClientRect();
            const arenaRect = arenaRef.current.getBoundingClientRect();
            const ox = rect.left - arenaRect.left + rect.width / 2;
            const oy = rect.top - arenaRect.top + rect.height / 3;
            triggerPopParticles(ox, oy, BALLOON_COLORS[optionIndex % 4].fill);
          } else {
            triggerPopParticles(400, 200, '#ef4444');
          }
        } else {
          gameAudio.playWrong();
        }

        const nextFeedback: FeedbackState = {
          kind: timedOut ? 'timeout' : isCorrect ? 'correct' : 'wrong',
          poppedIndex: optionIndex,
          correctIndex: readCorrectIndex(result),
          explanation: readExplanation(result),
          earnedScore: result.earned_score,
        };

        setFeedback(nextFeedback);
        setPhase('feedback');
        onResolved(isCorrect);

        setTimeout(() => {
          onDone(questionId);
        }, FEEDBACK_MS);
      } catch (err) {
        console.error('Submission failed:', err);
        lockedRef.current = false;
        setPhase('playing');
        setSelectedIdx(null);
      }
    },
    [elapsedMs, emit, onDone, onResolved, questionId, seconds, submit, totalMs, triggerPopParticles]
  );

  useEffect(() => {
    expireRef.current = () => {
      void popBalloon(TIMEOUT_OPTION);
    };
  });

  // Keyboard controls: 1-4
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (phase !== 'playing') return;
      if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < options.length) {
          e.preventDefault();
          const targetEl = document.getElementById(`balloon-${idx}`);
          void popBalloon(idx, targetEl);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [options.length, phase, popBalloon]);

  // Rising physics calculation
  const progress = totalMs > 0 ? Math.max(0, Math.min(1, 1 - timer.remainingMs / totalMs)) : 0;
  // Balloons float up from 25% to -5% top
  const floatPercent = reducedMotion ? 10 : 22 - progress * 24;

  return (
    <div className="space-y-4 select-none">
      {/* Scenario Briefing Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-2xs font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
              <Target className="size-3 text-red-400 animate-pulse" /> Workplace Communication Radar
            </span>
            <span className="text-2xs font-mono text-slate-400">
              Scenario #{question.question_id.slice(0, 6)}
            </span>
          </div>
          {question.scenario ? (
            <p className="text-sm font-semibold text-slate-200">
              <span className="text-amber-400 font-bold">Context:</span> {question.scenario}
            </p>
          ) : null}
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            🎯 {question.question}
          </h2>
        </div>

        {/* Live Question Timer Ring */}
        <div className="flex items-center gap-4 shrink-0">
          <TimerRing remainingMs={timer.remainingMs} totalMs={timer.totalMs} />
        </div>
      </div>

      {/* Main Interactive Game Arena */}
      <div
        ref={arenaRef}
        data-testid="play-area"
        className="relative min-h-[460px] h-[520px] rounded-3xl overflow-hidden border-2 border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 shadow-2xl relative"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 30%, rgba(239, 68, 68, 0.08) 0%, transparent 60%),
                            radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)`,
        }}
      >
        {/* Top Danger Spikes / Ceiling Hazard */}
        <div className="absolute top-0 inset-x-0 h-7 bg-red-950/80 border-b border-red-500/30 flex items-center justify-around px-2 text-red-500/70 text-xs tracking-widest pointer-events-none z-20">
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className="animate-pulse">▲</span>
          ))}
        </div>

        {/* Crosshair Guidance / Instructions Watermark */}
        <div className="absolute bottom-3 left-4 text-2xs font-mono text-slate-500 pointer-events-none flex items-center gap-2">
          <span>💡 Tap or click the Red Flag balloon to POP it before it hits the spikes!</span>
          <span className="hidden sm:inline">• Keys [1], [2], [3], [4]</span>
        </div>

        {/* Dynamic Flying Particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full pointer-events-none z-30 transition-transform"
            style={{
              left: `${p.x}px`,
              top: `${p.y}px`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              boxShadow: `0 0 10px ${p.color}`,
              transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
            }}
          />
        ))}

        {/* Floating Balloons Group */}
        <div
          data-testid="balloon-group"
          className="absolute inset-x-0 transition-all duration-300 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 px-4 sm:px-6"
          style={{ top: `${floatPercent}%` }}
        >
          {options.map((behaviorText, index) => {
            const isHovered = hoveredIdx === index;
            const isSelected = selectedIdx === index;
            const isPopped = feedback?.poppedIndex === index;
            const isCorrectTarget = feedback?.correctIndex === index || (feedback?.kind === 'correct' && isPopped);
            const colorMeta = BALLOON_COLORS[index % BALLOON_COLORS.length];

            // Wave wobble based on time and index
            const swayX = reducedMotion ? 0 : Math.sin(progress * 12 + index * 1.8) * 8;
            const floatBob = reducedMotion ? 0 : Math.cos(progress * 15 + index) * 6;

            return (
              <div
                key={index}
                id={`balloon-${index}`}
                onMouseEnter={() => setHoveredIdx(index)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  transform: `translate(${swayX}px, ${floatBob}px) scale(${isHovered ? 1.04 : 1})`,
                }}
                className="flex flex-col items-center group cursor-pointer transition-transform duration-200"
                onClick={(e) => {
                  if (phase === 'playing') {
                    void popBalloon(index, e.currentTarget);
                  }
                }}
              >
                {/* Visual SVG Balloon */}
                <div className="relative flex flex-col items-center">
                  {/* Balloon Head */}
                  <div
                    className="relative w-20 h-24 sm:w-24 sm:h-28 rounded-[50%_50%_50%_50%_/_60%_60%_40%_40%] shadow-xl flex items-center justify-center transition-all duration-300"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${colorMeta.fill} 45%, #0f172a 120%)`,
                      boxShadow: isHovered
                        ? `0 0 25px ${colorMeta.glow}, 0 10px 20px rgba(0,0,0,0.5)`
                        : '0 8px 16px rgba(0,0,0,0.4)',
                    }}
                  >
                    {/* Shiny Reflection highlight */}
                    <div className="absolute top-3 left-4 w-4 h-6 bg-white/40 rounded-full blur-[1px] -rotate-45 pointer-events-none" />

                    {/* Balloon Number Badge */}
                    <span className="text-xl sm:text-2xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                      {index + 1}
                    </span>

                    {/* Popped effect badge */}
                    {isPopped && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full backdrop-blur-sm animate-ping">
                        <span className="text-2xl font-black text-amber-300">💥</span>
                      </div>
                    )}
                  </div>

                  {/* Balloon Knot and String */}
                  <div
                    className="w-2.5 h-1.5 -mt-0.5 rounded-b-sm"
                    style={{ backgroundColor: colorMeta.fill }}
                  />
                  <div className="w-0.5 h-6 bg-slate-400/60 -mt-px" />
                </div>

                {/* Behavioral Message Card Attached to Balloon */}
                <div
                  className={`w-full p-3 sm:p-3.5 rounded-2xl border-2 text-center text-xs sm:text-sm font-semibold transition-all duration-200 backdrop-blur-md shadow-lg ${
                    feedback
                      ? isCorrectTarget
                        ? 'border-emerald-400 bg-emerald-950/80 text-emerald-200 ring-2 ring-emerald-500/50 scale-105'
                        : isPopped && feedback.kind === 'wrong'
                          ? 'border-red-500 bg-red-950/80 text-red-200 line-through'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 opacity-60'
                      : isHovered
                        ? 'border-amber-400 bg-slate-800/90 text-white shadow-amber-500/20 shadow-lg'
                        : 'border-slate-700 bg-slate-900/80 text-slate-200'
                  }`}
                >
                  <p className="line-clamp-3 leading-snug">{behaviorText}</p>
                  <span className="block mt-1 text-3xs font-mono uppercase text-slate-400">
                    [Key {index + 1}]
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feedback Overlay Banner */}
        {feedback && (
          <div className="absolute inset-x-4 bottom-4 z-40 bg-slate-950/95 border-2 border-indigo-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-lg animate-in slide-in-from-bottom-6">
            <div className="flex items-start gap-3">
              {feedback.kind === 'correct' ? (
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="size-6" />
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
                  <AlertTriangle className="size-6" />
                </div>
              )}

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h3
                    className={`text-sm sm:text-base font-bold ${
                      feedback.kind === 'correct' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {feedback.kind === 'correct'
                      ? '🎯 BOOM! RED FLAG SUCCESSFULLY POPPED!'
                      : '⚠️ OUCH! THAT WAS APPROPRIATE BEHAVIOR!'}
                  </h3>
                  {feedback.earnedScore !== undefined && feedback.earnedScore > 0 ? (
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                      +{feedback.earnedScore} PTS
                    </span>
                  ) : null}
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {feedback.explanation ||
                    (feedback.kind === 'correct'
                      ? 'Excellent detection! This behavior compromises professional communication.'
                      : 'This was respectful, healthy workplace communication.')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Main Red-Flag Pop Plugin Component                                       */
/* ------------------------------------------------------------------------ */

export default function RedFlagPopGame(props: GameProps) {
  const { currentQuestion, level, lives, score, gameContext } = props;

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const [activeQ, setActiveQ] = useState<QuestionData | null>(null);
  const [streak, setStreak] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const startedRef = useRef(false);

  const emit = useCallback<EmitFn>((type, payload) => {
    const evt = { type, payload } as unknown as Parameters<GameProps['emitEvent']>[0];
    try {
      Promise.resolve(propsRef.current.emitEvent(evt)).catch(() => undefined);
    } catch {
      // safe fallback
    }
  }, []);

  useEffect(() => {
    if (activeQ === null && currentQuestion !== null) {
      setActiveQ(currentQuestion);
    }
  }, [activeQ, currentQuestion]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    emit('GAME_STARTED', { timestamp: Date.now(), difficulty: level });
  }, [emit, level]);

  const finishGame = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await propsRef.current.completeGame();
    } catch (e) {
      console.error('Error completing game:', e);
    }
  }, [finishing]);

  const handleResolved = useCallback((isCorrect: boolean) => {
    setStreak((prev) => (isCorrect ? prev + 1 : 0));
  }, []);

  const handleDone = useCallback(
    async (answeredId: string) => {
      if (propsRef.current.lives <= 0) {
        await finishGame();
        return;
      }
      try {
        await propsRef.current.nextQuestion();
      } catch {
        // next question error
      }
      // Wait for next question to arrive in props
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const nextCandidate = propsRef.current.currentQuestion;
        if (nextCandidate && nextCandidate.question_id !== answeredId) {
          clearInterval(interval);
          setActiveQ(nextCandidate);
        } else if (attempts > 20) {
          clearInterval(interval);
          void finishGame();
        }
      }, 100);
    },
    [finishGame]
  );

  const seconds = FLOAT_SECONDS_BY_TIER[level] ?? FLOAT_SECONDS_BY_TIER.BEGINNER;
  const currentTargetQ = activeQ ?? currentQuestion;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {/* Game Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shadow-lg shadow-red-500/10">
            <Target className="size-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              {gameContext.title || 'Red-Flag Pop: Pop the Problem'}
            </h1>
            <p className="text-2xs text-slate-400">
              Interactive Workplace Communication Arena • {gameContext.category || 'Behavioral Agility'}
            </p>
          </div>
        </div>

        {/* Live HUD Badges */}
        <div className="flex items-center gap-3">
          {/* Combo Multiplier */}
          {streak >= 2 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500/20 to-red-500/20 border border-amber-500/40 text-amber-300 font-mono text-xs font-black animate-bounce">
              <Flame className="size-4 text-amber-400 fill-amber-400" />
              <span>COMBO x{streak}</span>
            </div>
          )}

          {/* Current Tier */}
          <div className="px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono font-bold text-slate-300">
            Tier: <span className="text-cyan-400">{level}</span>
          </div>

          {/* Score Counter */}
          <div className="px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs font-mono font-bold text-indigo-300">
            Score: <span className="text-white">{score}</span>
          </div>
        </div>
      </div>

      {/* Main Playable Question View */}
      {currentTargetQ ? (
        <QuestionPlayArea
          key={currentTargetQ.question_id}
          question={currentTargetQ}
          tier={level}
          seconds={seconds}
          streak={streak}
          submit={props.submitAnswer}
          emit={emit}
          onResolved={handleResolved}
          onDone={handleDone}
        />
      ) : (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center space-y-4 rounded-3xl bg-slate-900 border border-slate-800">
          <div className="size-10 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-400">Preparing next communication challenge...</p>
        </div>
      )}
    </div>
  );
}
