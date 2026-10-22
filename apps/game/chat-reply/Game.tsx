'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameDifficultyTier, GameProps, QuestionData } from '../_shared/types';
import { TimerRing } from './components/TimerRing';
import { useQuestionTimer } from './hooks/useQuestionTimer';
import { initialOf, parseThread, waitingOn } from './utils/thread';
import { readCorrectIndex, readExplanation, readIsCorrect } from './utils/result';

/** Seconds to reply, per adaptive tier (see design spec, Tier scaling). */
const SECONDS_BY_TIER: Record<GameDifficultyTier, number> = {
  BEGINNER: 30,
  INTERMEDIATE: 24,
  ADVANCED: 18,
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
  const options = (question.options ?? []).slice(0, 4).map((o: any) => typeof o === 'string' ? o : o?.text ?? '');
  const questionId = question.question_id;
  const messages = parseThread(question.passage);
  const waiting = waitingOn(messages);

  const [phase, setPhase] = useState<QuestionPhase>('playing');
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lockedRef = useRef(false);
  const expireRef = useRef<() => void>(() => undefined);

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
          setSelected(null);
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

  // Keys 1 to 4 pick a reply.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== 'playing') return;
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

  const playing = phase === 'playing';
  const sentText = selected !== null ? (options[selected] ?? null) : null;

  const isCorrectOption = (index: number): boolean =>
    feedback !== null &&
    (feedback.correctIndex !== null
      ? index === feedback.correctIndex
      : feedback.kind === 'correct' && index === selected);

  const chipTone = (index: number): string => {
    if (feedback) {
      if (isCorrectOption(index)) return 'border-emerald-400 bg-emerald-500/20';
      if (feedback.kind === 'wrong' && index === selected) return 'border-rose-400 bg-rose-500/20';
      return 'border-slate-700 bg-slate-800/60 opacity-60';
    }
    return 'border-slate-600 bg-slate-800 hover:border-slate-300';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {question.scenario ? (
            <p className="text-sm font-medium uppercase tracking-wide text-slate-300">
              {question.scenario}
            </p>
          ) : null}
          <p className="text-lg font-semibold sm:text-xl">{question.question}</p>
        </div>
        <TimerRing remainingMs={timer.remainingMs} totalMs={timer.totalMs} />
      </div>

      <div
        role="log"
        aria-label="Chat thread"
        className="space-y-3 rounded-2xl bg-slate-950 p-3 sm:p-4"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex items-end gap-2 ${message.mine ? 'flex-row-reverse' : ''}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                message.mine ? 'bg-cyan-500 text-slate-900' : 'bg-slate-600 text-white'
              }`}
            >
              {message.mine ? 'Me' : initialOf(message.speaker)}
            </span>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm sm:text-base ${
                message.mine ? 'rounded-br-sm bg-cyan-700' : 'rounded-bl-sm bg-slate-700'
              }`}
            >
              {message.speaker && !message.mine ? (
                <p className="text-xs font-semibold text-slate-300">{message.speaker}</p>
              ) : null}
              <p>{message.text}</p>
            </div>
          </div>
        ))}

        {sentText !== null ? (
          <div className="flex flex-row-reverse items-end gap-2">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-slate-900"
            >
              Me
            </span>
            <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-cyan-700 px-4 py-2 text-sm sm:text-base">
              <p>{sentText}</p>
            </div>
          </div>
        ) : playing ? (
          <p className="text-sm text-slate-400" aria-live="polite">
            {waiting ? `${waiting} is waiting for your reply` : 'Waiting for your reply'}
            <span aria-hidden="true" className="ml-1 inline-block tracking-widest motion-safe:animate-pulse">
              ...
            </span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-3">
        {options.map((reply, index) => (
          <button
            key={index}
            type="button"
            disabled={!playing}
            onClick={() => void resolve(index)}
            className={`flex min-h-[48px] items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold motion-safe:transition-colors sm:text-base ${chipTone(index)}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs">
              {index + 1}
            </span>
            <span>{reply}</span>
          </button>
        ))}
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
                ? 'Good reply. '
                : feedback.kind === 'timeout'
                  ? "Time's up, no reply was sent. "
                  : 'Not the best reply. '}
            </span>
            {feedback.explanation}
          </p>
        ) : submitError ? (
          <p className="text-rose-300">{submitError}</p>
        ) : (
          <p className="text-slate-400">
            Pick the reply that is clear, respectful and moves things forward. Keys 1 to 4 pick a reply.
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
            <span className="rounded-full bg-cyan-700 px-3 py-1">Streak x{streak}</span>
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
              className="mt-4 min-h-[44px] rounded-xl bg-cyan-500 px-5 py-2 font-semibold text-slate-900 hover:bg-cyan-400"
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
