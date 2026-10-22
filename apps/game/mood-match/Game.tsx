'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GameDifficultyTier, GameProps, QuestionData } from '../_shared/types';
import { TimerRing } from './components/TimerRing';
import { useQuestionTimer } from './hooks/useQuestionTimer';
import { readCorrectIndex, readExplanation, readIsCorrect } from './utils/result';

/** Seconds to match one situation, per adaptive tier (see design spec, Tier scaling). */
const SECONDS_BY_TIER: Record<GameDifficultyTier, number> = {
  BEGINNER: 22,
  INTERMEDIATE: 18,
  ADVANCED: 14,
};

const FEEDBACK_MS = 1800;
const NEXT_QUESTION_WAIT_MS = 2000;

/**
 * ASSUMPTION (open question 1): when the clock runs out the game submits this
 * sentinel and expects the engine to score it as a wrong answer. If the engine
 * rejects it, the game falls back to skipping with no penalty.
 */
const TIMEOUT_OPTION = -1;

type EmitFn = (type: string, payload: Record<string, unknown>) => void;
type QuestionPhase = 'playing' | 'submitting' | 'feedback';

interface Feedback {
  kind: 'correct' | 'wrong' | 'timeout';
  correctIndex: number | null;
  explanation: string | null;
}

interface Rope {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Point {
  x: number;
  y: number;
}

/** Centre of an element, relative to the play area. Only called from event handlers. */
function centreOf(area: Element | null, element: Element | null): Point {
  if (!element || !area) return { x: 0, y: 0 };
  const a = area.getBoundingClientRect();
  const r = element.getBoundingClientRect();
  return { x: r.left + r.width / 2 - a.left, y: r.top + r.height / 2 - a.top };
}

/* ------------------------------------------------------------------------ */
/* One question                                                             */
/* ------------------------------------------------------------------------ */

interface QuestionViewProps {
  question: QuestionData;
  seconds: number;
  submit: GameProps['submitAnswer'];
  emit: EmitFn;
  onResolved: (correct: boolean) => void;
  onDone: (answeredId: string) => void;
}

function QuestionView({ question, seconds, submit, emit, onResolved, onDone }: QuestionViewProps) {
  const pads = (question.options ?? []).slice(0, 4).map((o: any) => typeof o === 'string' ? o : o?.text ?? '');
  const questionId = question.question_id;

  const [phase, setPhase] = useState<QuestionPhase>('playing');
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rope, setRope] = useState<Rope | null>(null);
  const [hoverPad, setHoverPad] = useState<number | null>(null);

  const lockedRef = useRef(false);
  const draggingRef = useRef(false);
  const expireRef = useRef<() => void>(() => undefined);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const padRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const timer = useQuestionTimer(questionId, seconds, phase === 'playing', () =>
    expireRef.current(),
  );
  const { totalMs, elapsedMs } = timer;

  useEffect(() => {
    emit('QUESTION_SHOWN', { questionId, timestamp: Date.now() });
  }, [emit, questionId]);

  const resolve = useCallback(
    async (optionIndex: number) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      draggingRef.current = false;
      setHoverPad(null);

      const timedOut = optionIndex === TIMEOUT_OPTION;
      const responseMs = timedOut ? totalMs : Math.max(0, Math.round(elapsedMs()));

      setSelected(timedOut ? null : optionIndex);
      setSubmitError(null);
      setPhase('submitting');

      if (timedOut) {
        emit('TIMEOUT', { questionId, allowedDuration: seconds });
        setRope(null);
      } else {
        emit('ANSWER_SELECTED', { questionId, optionIndex });
      }

      let next: Feedback;
      try {
        const result = await submit(optionIndex, responseMs);
        const correct = !timedOut && readIsCorrect(result);
        next = {
          kind: timedOut ? 'timeout' : correct ? 'correct' : 'wrong',
          correctIndex: readCorrectIndex(result),
          explanation: readExplanation(result),
        };
        onResolved(correct);
      } catch {
        if (!timedOut) {
          // Real answer failed to save (for example a network error): let the player retry.
          lockedRef.current = false;
          setSelected(null);
          setRope(null);
          setPhase('playing');
          setSubmitError('Could not save that answer. Please try again.');
          return;
        }
        // Engine refused the timeout sentinel: show the timeout and skip with no penalty.
        next = { kind: 'timeout', correctIndex: null, explanation: null };
        onResolved(false);
      }

      setFeedback(next);
      setPhase('feedback');
      // Deliberately not cleared on unmount: the outer game must always hear that this question is done.
      setTimeout(() => onDone(questionId), FEEDBACK_MS);
    },
    [elapsedMs, emit, onDone, onResolved, questionId, seconds, submit, totalMs],
  );

  useEffect(() => {
    expireRef.current = () => {
      void resolve(TIMEOUT_OPTION);
    };
  });

  /* ------------------------------ geometry ------------------------------ */

  const padAt = (clientX: number, clientY: number): number | null => {
    for (let i = 0; i < pads.length; i += 1) {
      const element = padRefs.current[i];
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return i;
      }
    }
    return null;
  };

  /** Draws the rope from the handle to a pad, then submits that pad. */
  const choose = useCallback(
    (index: number) => {
      if (lockedRef.current) return;
      const start = centreOf(areaRef.current, handleRef.current);
      const end = centreOf(areaRef.current, padRefs.current[index] ?? null);
      setRope({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
      void resolve(index);
    },
    [resolve],
  );

  // Keys 1 to 4 pick a feeling.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== 'playing') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < pads.length) {
        event.preventDefault();
        choose(index);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, pads.length, choose]);

  /* ------------------------------ dragging ------------------------------ */

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== 'playing') return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; dragging still works without it.
    }
    const start = centreOf(areaRef.current, handleRef.current);
    draggingRef.current = true;
    setRope({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
  };

  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const area = areaRef.current;
    if (!area) return;
    const a = area.getBoundingClientRect();
    setRope((current) =>
      current ? { ...current, x2: event.clientX - a.left, y2: event.clientY - a.top } : current,
    );
    setHoverPad(padAt(event.clientX, event.clientY));
  };

  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setHoverPad(null);
    const target = padAt(event.clientX, event.clientY);
    if (target === null) {
      setRope(null);
      return;
    }
    choose(target);
  };

  const onHandleCancel = () => {
    draggingRef.current = false;
    setHoverPad(null);
    setRope(null);
  };

  /* ----------------------------- rendering ------------------------------ */

  const playing = phase === 'playing';

  const isCorrectPad = (index: number): boolean =>
    feedback !== null &&
    (feedback.correctIndex !== null
      ? index === feedback.correctIndex
      : feedback.kind === 'correct' && index === selected);

  const padTone = (index: number): string => {
    if (feedback) {
      if (isCorrectPad(index)) return 'border-emerald-400 bg-emerald-500/20';
      if (feedback.kind === 'wrong' && index === selected) return 'border-rose-400 bg-rose-500/20';
      return 'border-slate-700 bg-slate-800/60 opacity-60';
    }
    if (hoverPad === index) return 'border-purple-300 bg-purple-500/20';
    return 'border-slate-600 bg-slate-800 hover:border-slate-300';
  };

  const ropeColour =
    feedback === null
      ? 'stroke-purple-300'
      : feedback.kind === 'correct'
        ? 'stroke-emerald-400'
        : 'stroke-rose-400';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-300 sm:text-base">
          Read the room
        </p>
        <TimerRing remainingMs={timer.remainingMs} totalMs={timer.totalMs} />
      </div>

      <div ref={areaRef} className="relative space-y-6">
        <div className="rounded-2xl bg-slate-950 p-4 sm:p-5">
          <p className="text-base sm:text-lg">{question.scenario}</p>
          <p className="mt-2 text-lg font-semibold sm:text-xl">{question.question}</p>
          <div className="mt-4 flex justify-center">
            <div
              ref={handleRef}
              aria-hidden="true"
              data-testid="rope-handle"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleCancel}
              style={{ touchAction: 'none' }}
              className={`flex h-10 w-10 select-none items-center justify-center rounded-full border-2 border-purple-300 bg-purple-600 text-lg ${
                playing ? 'cursor-grab' : ''
              }`}
            >
              ●
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {pads.map((feeling, index) => (
            <button
              key={index}
              type="button"
              disabled={!playing}
              ref={(element) => {
                padRefs.current[index] = element;
              }}
              onClick={() => choose(index)}
              className={`flex min-h-[56px] items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-base font-semibold motion-safe:transition-colors sm:text-lg ${padTone(index)}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs">
                {index + 1}
              </span>
              <span>{feeling}</span>
            </button>
          ))}
        </div>

        {rope ? (
          <svg
            aria-hidden="true"
            data-testid="rope"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <line
              x1={rope.x1}
              y1={rope.y1}
              x2={rope.x2}
              y2={rope.y2}
              strokeWidth="4"
              strokeLinecap="round"
              className={ropeColour}
            />
          </svg>
        ) : null}
      </div>

      <div aria-live="polite" className="min-h-[3rem] text-sm sm:text-base">
        {feedback ? (
          <p
            className={
              feedback.kind === 'correct'
                ? 'text-emerald-300'
                : feedback.kind === 'timeout'
                  ? 'text-amber-300'
                  : 'text-rose-300'
            }
          >
            <span className="font-semibold">
              {feedback.kind === 'correct'
                ? 'Good read. '
                : feedback.kind === 'timeout'
                  ? "Time's up. "
                  : 'Not quite. '}
            </span>
            {feedback.explanation}
          </p>
        ) : submitError ? (
          <p className="text-rose-300">{submitError}</p>
        ) : (
          <p className="text-slate-400">
            Drag the rope to a feeling, tap a feeling, or press 1 to 4.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Game shell: header, question lifecycle, ending the attempt               */
/* ------------------------------------------------------------------------ */

export default function Game(props: GameProps) {
  const { currentQuestion, level, lives, score, gameContext } = props;

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const [shown, setShown] = useState<QuestionData | null>(null);
  const [streak, setStreak] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const finishingRef = useRef(false);
  const timeUpRef = useRef(false);
  const startedRef = useRef(false);

  const emit = useCallback<EmitFn>((type, payload) => {
    const event = { type, payload } as unknown as Parameters<GameProps['emitEvent']>[0];
    try {
      Promise.resolve(propsRef.current.emitEvent(event)).catch(() => undefined);
    } catch {
      // Telemetry must never break gameplay.
    }
  }, []);

  // Hold the first question in state so feedback is never cut short if the
  // engine advances currentQuestion before the feedback delay ends.
  useEffect(() => {
    if (shown === null && currentQuestion !== null) setShown(currentQuestion);
  }, [shown, currentQuestion]);
  const activeQuestion = shown ?? currentQuestion;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    emit('GAME_STARTED', { timestamp: Date.now(), difficulty: level });
  }, [emit, level]);

  const limitSeconds = gameContext.timeLimitSeconds;
  useEffect(() => {
    if (typeof limitSeconds !== 'number' || limitSeconds <= 0) return;
    const id = setTimeout(() => {
      timeUpRef.current = true;
    }, limitSeconds * 1000);
    return () => clearTimeout(id);
  }, [limitSeconds]);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    setFinishError(null);
    try {
      // The only exit: GameRunner shows the Report Card. No navigation here.
      await propsRef.current.completeGame();
    } catch {
      finishingRef.current = false;
      setFinishError('We could not save your result.');
    }
  }, []);

  const waitForNextQuestion = useCallback(async (answeredId: string) => {
    const deadline = Date.now() + NEXT_QUESTION_WAIT_MS;
    while (Date.now() < deadline) {
      const candidate = propsRef.current.currentQuestion;
      if (candidate && candidate.question_id !== answeredId) return candidate;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }, []);

  // ASSUMPTION (open question 2): works whether the engine serves the next
  // question inside submitAnswer or only when nextQuestion() is called.
  const handleDone = useCallback(
    async (answeredId: string) => {
      if (finishingRef.current) return;
      if (propsRef.current.lives <= 0 || timeUpRef.current) {
        await finish();
        return;
      }
      if (propsRef.current.currentQuestion?.question_id === answeredId) {
        try {
          await propsRef.current.nextQuestion();
        } catch {
          // Fall through: the wait below decides whether the set is exhausted.
        }
      }
      const next = await waitForNextQuestion(answeredId);
      if (next) setShown(next);
      else await finish();
    },
    [finish, waitForNextQuestion],
  );

  const handleResolved = useCallback((correct: boolean) => {
    setStreak((current) => (correct ? current + 1 : 0));
  }, []);

  const seconds = SECONDS_BY_TIER[level] ?? SECONDS_BY_TIER.BEGINNER;

  return (
    <div className="rounded-2xl bg-slate-900 p-4 text-white sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold sm:text-xl">{gameContext.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-800 px-3 py-1">Tier: {level}</span>
          <span className="rounded-full bg-slate-800 px-3 py-1">Score: {score}</span>
          <span className="rounded-full bg-slate-800 px-3 py-1" aria-label={`${lives} lives left`}>
            Lives: {'♥'.repeat(Math.max(0, lives))}
          </span>
          {streak >= 2 ? (
            <span className="rounded-full bg-purple-700 px-3 py-1">Streak x{streak}</span>
          ) : null}
        </div>
      </header>

      {finishing ? (
        <div className="py-10 text-center" aria-live="polite">
          <p className="text-lg font-semibold">
            {finishError ? finishError : 'Finishing your attempt...'}
          </p>
          {finishError ? (
            <button
              type="button"
              onClick={() => void finish()}
              className="mt-4 min-h-[44px] rounded-xl bg-purple-500 px-5 py-2 font-semibold text-white hover:bg-purple-400"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : activeQuestion ? (
        <QuestionView
          key={activeQuestion.question_id}
          question={activeQuestion}
          seconds={seconds}
          submit={props.submitAnswer}
          emit={emit}
          onResolved={handleResolved}
          onDone={handleDone}
        />
      ) : (
        <p className="py-10 text-center text-slate-300">Loading your first question...</p>
      )}
    </div>
  );
}
