'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameDifficultyTier, GameProps, QuestionData } from '../_shared/types';
import { TimerRing } from './components/TimerRing';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { useQuestionTimer } from './hooks/useQuestionTimer';
import { readCorrectIndex, readExplanation, readIsCorrect } from './utils/result';

/** Belt travel time in seconds for each adaptive tier (see design spec, Tier scaling). */
const SECONDS_BY_TIER: Record<GameDifficultyTier, number> = {
  BEGINNER: 15,
  INTERMEDIATE: 12,
  ADVANCED: 9,
};

const FEEDBACK_MS = 1200;
const NEXT_QUESTION_WAIT_MS = 2000;

/**
 * ASSUMPTION (open question 1): when the belt runs out the game submits this
 * sentinel and expects the engine to score it as a wrong answer. If the engine
 * rejects it, the game falls back to skipping with no penalty.
 */
const TIMEOUT_OPTION = -1;

type EmitFn = (type: string, payload: Record<string, unknown>) => void;
type QuestionPhase = 'answering' | 'submitting' | 'feedback';

interface Feedback {
  kind: 'correct' | 'wrong' | 'timeout';
  correctIndex: number | null;
  explanation: string | null;
}

/** Renders the sentence, replacing ___ with a blank that fills in after the answer. */
function Sentence({ text, fill }: { text: string; fill: string | null }) {
  const parts = text.split('___');
  return (
    <p className="text-lg leading-relaxed sm:text-xl">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 ? (
            <span className="mx-1 inline-block min-w-[6rem] border-b-2 border-amber-300 px-1 text-center font-semibold text-amber-200">
              {fill ?? ' '}
            </span>
          ) : null}
        </span>
      ))}
    </p>
  );
}

/* ------------------------------------------------------------------------ */
/* One question: sentence, four belt lanes, serving tray, timer, feedback   */
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
  const options = (question.options ?? []).slice(0, 4).map((o: any) => typeof o === 'string' ? o : o?.text ?? '');
  const questionId = question.question_id;
  const reducedMotion = usePrefersReducedMotion();

  const [phase, setPhase] = useState<QuestionPhase>('answering');
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [overTray, setOverTray] = useState(false);

  const lockedRef = useRef(false);
  const shownEmittedRef = useRef(false);
  const expireRef = useRef<() => void>(() => undefined);

  const { remainingMs, totalMs, elapsedMs } = useQuestionTimer(
    questionId,
    seconds,
    phase === 'answering',
    () => expireRef.current(),
  );

  useEffect(() => {
    if (shownEmittedRef.current) return;
    shownEmittedRef.current = true;
    emit('QUESTION_SHOWN', { questionId, timestamp: Date.now() });
  }, [emit, questionId]);

  const resolve = useCallback(
    async (optionIndex: number) => {
      if (lockedRef.current) return;
      lockedRef.current = true;

      const timedOut = optionIndex === TIMEOUT_OPTION;
      const responseMs = timedOut ? totalMs : Math.max(0, Math.round(elapsedMs()));

      setSelected(timedOut ? null : optionIndex);
      setSubmitError(null);
      setPhase('submitting');

      if (timedOut) {
        emit('TIMEOUT', { questionId, allowedDuration: seconds });
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
          setPhase('answering');
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

  // Keys 1 to 4 grab a plate (keyboard path for the drag mechanic).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== 'answering') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < options.length) {
        event.preventDefault();
        void resolve(index);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, options.length, resolve]);

  const answering = phase === 'answering';

  // With reduced motion the plates stay put and only the timer ring counts down.
  const rawProgress = totalMs > 0 ? 1 - remainingMs / totalMs : 0;
  const progress = reducedMotion ? 0 : Math.max(0, Math.min(1, rawProgress));

  const blankFill =
    feedback === null
      ? null
      : feedback.correctIndex !== null
        ? (options[feedback.correctIndex] ?? null)
        : feedback.kind === 'correct' && selected !== null
          ? (options[selected] ?? null)
          : null;

  const plateTone = (index: number) => {
    if (feedback) {
      const isCorrectPlate =
        feedback.correctIndex !== null
          ? index === feedback.correctIndex
          : feedback.kind === 'correct' && index === selected;
      if (isCorrectPlate) return 'border-emerald-400 bg-emerald-500/20';
      if (feedback.kind === 'wrong' && index === selected) return 'border-rose-400 bg-rose-500/20';
      return 'border-slate-700 bg-slate-800/60 opacity-60';
    }
    return 'border-amber-300 bg-slate-800 hover:bg-amber-500/20';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-300">
            {question.question}
          </p>
          <Sentence text={question.scenario ? question.scenario : '___'} fill={blankFill} />
        </div>
        <TimerRing remainingMs={remainingMs} totalMs={totalMs} />
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-2">
        {options.map((text, index) => (
          <div key={index} className="relative h-12 border-b border-slate-800 last:border-b-0">
            <button
              type="button"
              disabled={!answering}
              draggable={answering}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', String(index));
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setOverTray(false)}
              onClick={() => void resolve(index)}
              style={{ left: `calc(${progress} * (100% - 10rem))` }}
              className={`absolute top-1 flex h-10 w-40 items-center justify-center gap-2 rounded-full border-2 px-3 text-sm font-semibold sm:text-base ${plateTone(index)}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs">
                {index + 1}
              </span>
              <span className="truncate">{text}</span>
            </button>
          </div>
        ))}
      </div>

      <div
        onDragOver={(event) => {
          if (!answering) return;
          event.preventDefault();
          setOverTray(true);
        }}
        onDragLeave={() => setOverTray(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOverTray(false);
          if (!answering) return;
          const index = Number(event.dataTransfer.getData('text/plain'));
          if (Number.isInteger(index) && index >= 0 && index < options.length) {
            void resolve(index);
          }
        }}
        className={`rounded-xl border-2 border-dashed px-4 py-3 text-center text-sm motion-safe:transition-colors ${
          overTray ? 'border-amber-300 bg-amber-500/20' : 'border-slate-600 bg-slate-800'
        }`}
      >
        Serving tray: drop the correctly spelled plate here
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
                ? 'Correct. '
                : feedback.kind === 'timeout'
                  ? 'The belt ran out. '
                  : 'Not quite. '}
            </span>
            {feedback.explanation}
          </p>
        ) : submitError ? (
          <p className="text-rose-300">{submitError}</p>
        ) : (
          <p className="text-slate-400">
            Tap a plate, or drag it to the tray. Keys 1 to 4 grab a plate. Only one spelling is right.
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
            <span className="rounded-full bg-amber-500/30 px-3 py-1">Streak x{streak}</span>
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
              className="mt-4 min-h-[44px] rounded-xl bg-amber-500 px-5 py-2 font-semibold text-slate-900 hover:bg-amber-400"
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
