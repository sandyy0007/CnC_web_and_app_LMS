'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameDifficultyTier, GameProps, QuestionData } from '../_shared/types';
import { PracticePanel } from './components/PracticePanel';
import { TimerRing } from './components/TimerRing';
import { useQuestionTimer } from './hooks/useQuestionTimer';
import { readCorrectIndex, readExplanation, readIsCorrect } from './utils/result';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { parseFacts, tracePoints } from './utils/facts';

/** Seconds per question, per adaptive tier (see design spec, Tier scaling). */
const SECONDS_BY_TIER: Record<GameDifficultyTier, number> = {
  BEGINNER: 25,
  INTERMEDIATE: 20,
  ADVANCED: 15,
};

/** Length of the optional, ungraded speak-aloud step that can follow the feedback. */
const PRACTICE_SECONDS = 15;
const PRACTICE_PROMPT = 'Explain aloud why that statement does not fit the facts.';

const FEEDBACK_MS = 1800;
const NEXT_QUESTION_WAIT_MS = 2000;

/**
 * ASSUMPTION (open question 2): when the clock runs out the game submits this
 * sentinel and expects the engine to score it as a wrong answer. If the engine
 * rejects it, the game falls back to skipping with no penalty.
 */
const TIMEOUT_OPTION = -1;

type EmitFn = (type: string, payload: Record<string, unknown>) => void;
type QuestionPhase = 'playing' | 'submitting' | 'feedback' | 'practice';

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
  practice: boolean;
  submit: GameProps['submitAnswer'];
  emit: EmitFn;
  onResolved: (correct: boolean) => void;
  onDone: (answeredId: string) => void;
}

function QuestionView({
  question,
  seconds,
  practice,
  submit,
  emit,
  onResolved,
  onDone,
}: QuestionViewProps) {
  const options = (question.options ?? []).slice(0, 4);
  const questionId = question.question_id;

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
      if (practice) {
        // The speak-aloud step ends the question when it finishes or is skipped.
        setPhase('practice');
        return;
      }
      setPhase('feedback');
      // Deliberately not cleared on unmount: the outer game must always hear that this question is done.
      setTimeout(() => onDone(questionId), FEEDBACK_MS);
    },
    [elapsedMs, emit, onDone, onResolved, practice, questionId, seconds, submit, totalMs],
  );

  useEffect(() => {
    expireRef.current = () => {
      void resolve(TIMEOUT_OPTION);
    };
  });

  // Keys 1 to 4 pick an option.
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

  const isCorrectOption = (index: number): boolean =>
    feedback !== null &&
    (feedback.correctIndex !== null
      ? index === feedback.correctIndex
      : feedback.kind === 'correct' && index === selected);

  const optionTone = (index: number): string => {
    if (feedback) {
      if (isCorrectOption(index)) return 'border-emerald-400 bg-emerald-500/20';
      if (feedback.kind === 'wrong' && index === selected) return 'border-rose-400 bg-rose-500/20';
      return 'border-slate-700 bg-slate-800/60 opacity-60';
    }
    return 'border-slate-600 bg-slate-800 hover:border-slate-300';
  };

  const feedbackBlock = (
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
              ? 'Caught it! '
              : feedback.kind === 'timeout'
                ? 'Time is up. '
                : 'Missed the slip. '}
          </span>
          {feedback.explanation}
        </p>
      ) : submitError ? (
        <p className="text-rose-300">{submitError}</p>
      ) : (
        <p className="text-slate-400">Check each statement against the known facts. One does not fit.</p>
      )}
    </div>
  );

  const practiceBlock =
    phase === 'practice' ? (
      <PracticePanel
        prompt={PRACTICE_PROMPT}
        seconds={PRACTICE_SECONDS}
        onFinish={() => onDone(questionId)}
      />
    ) : null;

  const reducedMotion = usePrefersReducedMotion();
  const facts = parseFacts(question.passage);
  const fractionLeft = totalMs > 0 ? timer.remainingMs / totalMs : 0;
  const trace = tracePoints(totalMs - timer.remainingMs, fractionLeft, reducedMotion);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          {question.scenario ? (
            <p className="text-base font-semibold sm:text-lg">{question.scenario}</p>
          ) : null}
          <div
            data-testid="known-facts"
            className="rounded-xl border border-slate-600 bg-slate-800 p-3 text-sm sm:text-base"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Known facts
            </p>
            <ul className="space-y-1">
              {facts.map((fact, index) => (
                <li key={index} className="flex gap-2">
                  <span aria-hidden="true" className="text-emerald-300">
                    &#10003;
                  </span>
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="font-semibold">{question.question}</p>
        </div>
        <TimerRing remainingMs={timer.remainingMs} totalMs={timer.totalMs} />
      </div>

      <svg
        viewBox="0 0 200 40"
        role="img"
        aria-label="Polygraph strip"
        className="h-10 w-full rounded-lg bg-slate-950"
      >
        <line x1="0" y1="20" x2="200" y2="20" className="stroke-slate-700" strokeWidth="1" />
        <polyline
          data-testid="polygraph-trace"
          points={trace}
          fill="none"
          className="stroke-rose-400"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      <div role="group" aria-label="Statements" className="grid gap-2">
        {options.map((option, index) => (
          <button
            key={index}
            type="button"
            disabled={!playing}
            aria-label={`Statement ${index + 1}: ${option}`}
            onClick={() => void resolve(index)}
            className={`flex min-h-[44px] items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors sm:text-base ${optionTone(index)}`}
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold">
              {index + 1}
            </span>
            <span className="flex-1">&ldquo;{option}&rdquo;</span>
            {feedback && isCorrectOption(index) ? (
              <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-slate-900">
                SLIP
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {feedbackBlock}
      {practiceBlock}
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
  const [practice, setPractice] = useState(false);
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

  // ASSUMPTION (open question 3): works whether the engine serves the next
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
            <span className="rounded-full bg-slate-500/30 text-slate-100 px-3 py-1">Streak x{streak}</span>
          ) : null}
          <button
            type="button"
            aria-pressed={practice}
            onClick={() => setPractice((current) => !current)}
            className={`min-h-[32px] rounded-full border px-3 py-1 ${
              practice ? 'border-white bg-white text-slate-900' : 'border-slate-500 text-slate-200'
            }`}
          >
            Speak-aloud practice: {practice ? 'On' : 'Off'}
          </button>
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
              className="mt-4 min-h-[44px] rounded-xl bg-slate-200 text-slate-900 px-5 py-2 font-semibold"
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
          practice={practice}
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
