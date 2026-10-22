'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameDifficultyTier, GameProps, QuestionData } from '../_shared/types';
import { TimerRing } from './components/TimerRing';
import { useQuestionTimer } from './hooks/useQuestionTimer';
import { parsePairs } from './utils/pairs';
import type { WordPair } from './utils/pairs';
import { readCorrectIndex, readExplanation, readIsCorrect } from './utils/result';

/** Seconds to study the cards for each adaptive tier (see design spec, Tier scaling). */
const MEMORISE_SECONDS_BY_TIER: Record<GameDifficultyTier, number> = {
  BEGINNER: 12,
  INTERMEDIATE: 9,
  ADVANCED: 6,
};

/** Seconds to answer once the cards have flipped. The speed bonus clock starts here. */
const ANSWER_SECONDS = 15;

const FEEDBACK_MS = 1600;
const NEXT_QUESTION_WAIT_MS = 2000;

/**
 * ASSUMPTION (open question 1): when the answer timer runs out the game
 * submits this sentinel and expects the engine to score it as a wrong answer.
 * If the engine rejects it, the game falls back to skipping with no penalty.
 */
const TIMEOUT_OPTION = -1;

type EmitFn = (type: string, payload: Record<string, unknown>) => void;
type QuestionPhase = 'memorise' | 'answering' | 'submitting' | 'feedback';

interface Feedback {
  kind: 'correct' | 'wrong' | 'timeout';
  correctIndex: number | null;
  explanation: string | null;
}

/** The word cards, face up for study and review, face down during recall. */
function Cards({
  pairs,
  faceUp,
  highlightWord,
}: {
  pairs: WordPair[];
  faceUp: boolean;
  highlightWord: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {pairs.map((pair, index) => {
        const highlighted =
          faceUp && highlightWord !== null && pair.word.toLowerCase() === highlightWord.toLowerCase();
        return faceUp ? (
          <div
            key={index}
            className={`rounded-xl border-2 px-4 py-3 ${
              highlighted ? 'border-emerald-400 bg-emerald-500/20' : 'border-slate-500 bg-slate-800'
            }`}
          >
            <p className="text-lg font-bold">{pair.word}</p>
            <p className="text-sm text-slate-200 sm:text-base">{pair.meaning}</p>
          </div>
        ) : (
          <div
            key={index}
            aria-hidden="true"
            className="flex items-center justify-center rounded-xl border-2 border-slate-600 bg-slate-700 px-4 py-5 text-2xl font-bold text-slate-400"
          >
            ?
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* One question: memorise phase, then recall phase                          */
/* ------------------------------------------------------------------------ */

interface QuestionViewProps {
  question: QuestionData;
  memoriseSeconds: number;
  submit: GameProps['submitAnswer'];
  emit: EmitFn;
  onResolved: (correct: boolean) => void;
  onDone: (answeredId: string) => void;
}

function QuestionView({
  question,
  memoriseSeconds,
  submit,
  emit,
  onResolved,
  onDone,
}: QuestionViewProps) {
  const options = (question.options ?? []).slice(0, 4);
  const questionId = question.question_id;
  const pairs = parsePairs(question.passage);

  // No cards supplied: skip straight to the question.
  const [phase, setPhase] = useState<QuestionPhase>(pairs.length > 0 ? 'memorise' : 'answering');
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lockedRef = useRef(false);
  const shownEmittedRef = useRef(false);
  const expireRef = useRef<() => void>(() => undefined);

  const startRecall = useCallback(() => {
    setPhase((current) => (current === 'memorise' ? 'answering' : current));
  }, []);

  // Study clock: counts down while the cards are face up.
  const memoriseTimer = useQuestionTimer(
    questionId,
    memoriseSeconds,
    phase === 'memorise',
    startRecall,
  );

  // Answer clock: held back (null key) until recall begins, so the response
  // time reported to the server excludes the study time.
  const answerTimer = useQuestionTimer(
    phase === 'memorise' ? null : questionId,
    ANSWER_SECONDS,
    phase === 'answering',
    () => expireRef.current(),
  );

  // QUESTION_SHOWN marks the start of recall, the moment the answer clock starts.
  useEffect(() => {
    if (phase !== 'answering' || shownEmittedRef.current) return;
    shownEmittedRef.current = true;
    emit('QUESTION_SHOWN', { questionId, timestamp: Date.now() });
  }, [emit, phase, questionId]);

  const { totalMs, elapsedMs } = answerTimer;

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
        emit('TIMEOUT', { questionId, allowedDuration: ANSWER_SECONDS });
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
    [elapsedMs, emit, onDone, onResolved, questionId, submit, totalMs],
  );

  useEffect(() => {
    expireRef.current = () => {
      void resolve(TIMEOUT_OPTION);
    };
  });

  // Keys 1 to 4 pick an option during recall.
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

  const correctWord =
    feedback === null
      ? null
      : feedback.correctIndex !== null
        ? (options[feedback.correctIndex] ?? null)
        : feedback.kind === 'correct' && selected !== null
          ? (options[selected] ?? null)
          : null;

  const optionTone = (index: number) => {
    if (feedback) {
      const isCorrectOption =
        feedback.correctIndex !== null
          ? index === feedback.correctIndex
          : feedback.kind === 'correct' && index === selected;
      if (isCorrectOption) return 'border-emerald-400 bg-emerald-500/20';
      if (feedback.kind === 'wrong' && index === selected) return 'border-rose-400 bg-rose-500/20';
      return 'border-slate-700 bg-slate-800/60 opacity-60';
    }
    return 'border-slate-600 bg-slate-800 hover:border-slate-300';
  };

  if (phase === 'memorise') {
    const fraction =
      memoriseTimer.totalMs > 0
        ? Math.max(0, Math.min(1, memoriseTimer.remainingMs / memoriseTimer.totalMs))
        : 0;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-300">
            {question.scenario ? question.scenario : 'Memorise each word and its meaning'}
          </p>
          <span className="text-sm tabular-nums text-slate-300">
            {Math.ceil(memoriseTimer.remainingMs / 1000)}s
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Study time left"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          className="h-2 rounded-full bg-slate-700"
        >
          <div className="h-2 rounded-full bg-slate-200" style={{ width: `${fraction * 100}%` }} />
        </div>
        <Cards pairs={pairs} faceUp highlightWord={null} />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={startRecall}
            className="min-h-[44px] rounded-xl bg-slate-200 px-6 py-2 font-semibold text-slate-900 hover:bg-white"
          >
            I am ready
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-300">
          Answer from memory
        </p>
        <TimerRing remainingMs={answerTimer.remainingMs} totalMs={answerTimer.totalMs} />
      </div>

      <Cards pairs={pairs} faceUp={feedback !== null} highlightWord={correctWord} />

      <p className="text-lg font-semibold sm:text-xl">{question.question}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((word, index) => (
          <button
            key={index}
            type="button"
            disabled={!answering}
            onClick={() => void resolve(index)}
            className={`flex min-h-[48px] items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base font-semibold motion-safe:transition-colors ${optionTone(index)}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs">
              {index + 1}
            </span>
            <span>{word}</span>
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
                ? 'Correct. '
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
            Every option was on the list, so pick the one whose meaning you remember. Keys 1 to 4 pick an option.
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

  const memoriseSeconds =
    MEMORISE_SECONDS_BY_TIER[level] ?? MEMORISE_SECONDS_BY_TIER.BEGINNER;

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
            <span className="rounded-full bg-slate-600 px-3 py-1">Streak x{streak}</span>
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
              className="mt-4 min-h-[44px] rounded-xl bg-slate-200 px-5 py-2 font-semibold text-slate-900 hover:bg-white"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : activeQuestion ? (
        <QuestionView
          key={activeQuestion.question_id}
          question={activeQuestion}
          memoriseSeconds={memoriseSeconds}
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
