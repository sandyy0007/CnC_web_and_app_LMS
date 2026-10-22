'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameDifficultyTier, GameProps, QuestionData } from '../_shared/types';
import { TimerRing } from './components/TimerRing';
import { useQuestionTimer } from './hooks/useQuestionTimer';
import {
  GRID,
  START,
  CORNERS,
  advanceTrail,
  buildBoard,
  chaserIndex,
  colOf,
  isJunction,
  optionAt,
  rowOf,
  shortestPath,
  stepFrom,
} from './utils/maze';
import type { Cell, Direction } from './utils/maze';
import { readCorrectIndex, readExplanation, readIsCorrect } from './utils/result';

/** Seconds before the alarm catches the player, per adaptive tier (see design spec, Tier scaling). */
const SECONDS_BY_TIER: Record<GameDifficultyTier, number> = {
  BEGINNER: 25,
  INTERMEDIATE: 20,
  ADVANCED: 15,
};

/** Milliseconds per cell when the game walks the player to a tapped chamber. */
const AUTOWALK_STEP_MS = 130;

/** At most this many MOVE_MADE events per question (junction crossings only). */
const MAX_MOVE_EVENTS = 12;

const FEEDBACK_MS = 1500;
const NEXT_QUESTION_WAIT_MS = 2000;

/**
 * ASSUMPTION (open question 1): when the alarm catches the player the game
 * submits this sentinel and expects the engine to score it as a wrong answer.
 * If the engine rejects it, the game falls back to skipping with no penalty.
 */
const TIMEOUT_OPTION = -1;

type EmitFn = (type: string, payload: Record<string, unknown>) => void;
type QuestionPhase = 'playing' | 'submitting' | 'feedback';

interface Feedback {
  kind: 'correct' | 'wrong' | 'timeout';
  correctIndex: number | null;
  explanation: string | null;
}

/** Chamber colours. The option number is always printed too, so colour never carries meaning alone. */
const CHAMBER_COLOURS = ['bg-sky-400', 'bg-amber-400', 'bg-fuchsia-400', 'bg-lime-400'] as const;

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

const DPAD: ReadonlyArray<{ direction: Direction; label: string; glyph: string; area: string }> = [
  { direction: 'up', label: 'Move up', glyph: '▲', area: 'col-start-2 row-start-1' },
  { direction: 'left', label: 'Move left', glyph: '◀', area: 'col-start-1 row-start-2' },
  { direction: 'right', label: 'Move right', glyph: '▶', area: 'col-start-3 row-start-2' },
  { direction: 'down', label: 'Move down', glyph: '▼', area: 'col-start-2 row-start-3' },
];

const CELL_PERCENT = 100 / GRID;

/* ------------------------------------------------------------------------ */
/* One question                                                             */
/* ------------------------------------------------------------------------ */

interface QuestionViewProps {
  question: QuestionData;
  level: GameDifficultyTier;
  seconds: number;
  submit: GameProps['submitAnswer'];
  emit: EmitFn;
  onResolved: (correct: boolean) => void;
  onDone: (answeredId: string) => void;
}

function QuestionView({
  question,
  level,
  seconds,
  submit,
  emit,
  onResolved,
  onDone,
}: QuestionViewProps) {
  const options = (question.options ?? []).slice(0, 4).map((o: any) => typeof o === 'string' ? o : o?.text ?? '');
  const questionId = question.question_id;
  const board = useMemo(() => buildBoard(questionId, level), [questionId, level]);

  const [phase, setPhase] = useState<QuestionPhase>('playing');
  const [trail, setTrail] = useState<Cell[]>([START]);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trailRef = useRef<Cell[]>([START]);
  const lockedRef = useRef(false);
  const walkRef = useRef<number | null>(null);
  const moveEventsRef = useRef(0);
  const lastEventTileRef = useRef<Cell>(START);
  const expireRef = useRef<() => void>(() => undefined);

  const cancelWalk = useCallback(() => {
    if (walkRef.current !== null) {
      window.clearTimeout(walkRef.current);
      walkRef.current = null;
    }
  }, []);

  // Never leave a walk running after the question is gone.
  useEffect(() => cancelWalk, [cancelWalk]);

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
      cancelWalk();

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
          // The player stands in the chamber, so step back out one cell to allow re-entering it.
          const current = trailRef.current;
          if (current.length > 1) {
            const back = current.slice(0, -1);
            trailRef.current = back;
            setTrail(back);
          }
          lockedRef.current = false;
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
    [cancelWalk, elapsedMs, emit, onDone, onResolved, questionId, seconds, submit, totalMs],
  );

  useEffect(() => {
    expireRef.current = () => {
      void resolve(TIMEOUT_OPTION);
    };
  });

  /** Moves the player onto a floor cell. Stepping into a chamber submits that option. */
  const moveTo = useCallback(
    (cell: Cell) => {
      if (lockedRef.current) return;
      const nextTrail = advanceTrail(trailRef.current, cell);
      trailRef.current = nextTrail;
      setTrail(nextTrail);
      setSubmitError(null);

      if (isJunction(board.open, cell) && moveEventsRef.current < MAX_MOVE_EVENTS) {
        moveEventsRef.current += 1;
        emit('MOVE_MADE', {
          questionId,
          fromTile: lastEventTileRef.current,
          toTile: cell,
        });
        lastEventTileRef.current = cell;
      }

      const chamber = optionAt(board, cell, options.length);
      if (chamber >= 0) void resolve(chamber);
    },
    [board, emit, options.length, questionId, resolve],
  );

  const tryMove = useCallback(
    (direction: Direction) => {
      if (lockedRef.current) return;
      cancelWalk();
      const here = trailRef.current[trailRef.current.length - 1];
      const next = stepFrom(board.open, here, direction);
      if (next !== null) moveTo(next);
    },
    [board.open, cancelWalk, moveTo],
  );

  /** Walks the shortest route to a chamber, never cutting through the other chambers. */
  const walkToChamber = useCallback(
    (optionIndex: number) => {
      if (lockedRef.current) return;
      const target = board.chamberCells[optionIndex];
      if (target === undefined || optionIndex >= options.length) return;
      cancelWalk();

      const here = trailRef.current[trailRef.current.length - 1];
      const avoid = new Set<Cell>(CORNERS.filter((corner) => corner !== target));
      const path = shortestPath(board.open, here, target, avoid);
      if (!path || path.length < 2) return;

      let index = 1;
      const stepOnce = () => {
        walkRef.current = null;
        if (lockedRef.current || index >= path.length) return;
        const cell = path[index];
        index += 1;
        moveTo(cell);
        if (index < path.length && !lockedRef.current) {
          walkRef.current = window.setTimeout(stepOnce, AUTOWALK_STEP_MS);
        }
      };
      stepOnce();
    },
    [board, cancelWalk, moveTo, options.length],
  );

  // Arrow keys and WASD walk; keys 1 to 4 walk to that option's chamber.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== 'playing') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const direction = KEY_DIRECTIONS[event.key];
      if (direction) {
        event.preventDefault();
        tryMove(direction);
        return;
      }
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < options.length) {
        event.preventDefault();
        walkToChamber(index);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, options.length, tryMove, walkToChamber]);

  /* ---------------------------- rendering ---------------------------- */

  const playing = phase === 'playing';
  const progress = totalMs > 0 ? 1 - timer.remainingMs / totalMs : 0;
  const chaserAt = chaserIndex(trail.length, progress);
  const chaserCell = chaserAt >= 0 ? trail[chaserAt] : null;
  const playerCell = trail[trail.length - 1];
  const onTrail = new Set<Cell>(trail);

  const chamberOfCorner = (corner: Cell): number => optionAt(board, corner, options.length);

  const correctOption = (index: number): boolean =>
    feedback !== null &&
    (feedback.correctIndex !== null
      ? index === feedback.correctIndex
      : feedback.kind === 'correct' && index === selected);

  const chipTone = (index: number): string => {
    if (feedback) {
      if (correctOption(index)) return 'border-emerald-400 bg-emerald-500/20';
      if (feedback.kind === 'wrong' && index === selected) return 'border-rose-400 bg-rose-500/20';
      return 'border-slate-700 bg-slate-800/60 opacity-60';
    }
    return 'border-slate-600 bg-slate-800 hover:border-slate-300';
  };

  const chip = (corner: Cell) => {
    const index = chamberOfCorner(corner);
    if (index < 0) return <div key={corner} className="flex-1" />;
    return (
      <button
        key={corner}
        type="button"
        disabled={!playing}
        onClick={() => walkToChamber(index)}
        aria-label={`Chamber ${index + 1}: ${options[index]}. Walk there.`}
        className={`flex min-h-[48px] flex-1 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold motion-safe:transition-colors sm:text-base ${chipTone(index)}`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-slate-900 ${CHAMBER_COLOURS[index]}`}
        >
          {index + 1}
        </span>
        <span className="break-words">{options[index]}</span>
      </button>
    );
  };

  const tokenStyle = (cell: Cell) => ({
    left: `${colOf(cell) * CELL_PERCENT}%`,
    top: `${rowOf(cell) * CELL_PERCENT}%`,
    width: `${CELL_PERCENT}%`,
    height: `${CELL_PERCENT}%`,
  });

  const cells: ReactNode[] = [];
  for (let cell = 0; cell < GRID * GRID; cell += 1) {
    const chamber = chamberOfCorner(cell);
    if (chamber >= 0) {
      cells.push(
        <div
          key={cell}
          aria-hidden="true"
          className={`flex items-center justify-center text-[10px] font-bold text-slate-900 sm:text-sm ${CHAMBER_COLOURS[chamber]}`}
        >
          {chamber + 1}
        </div>,
      );
    } else if (!board.open[cell]) {
      cells.push(<div key={cell} aria-hidden="true" className="bg-cyan-900" />);
    } else {
      cells.push(
        <div
          key={cell}
          aria-hidden="true"
          className={onTrail.has(cell) ? 'bg-slate-600' : 'bg-slate-800'}
        />,
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-lg font-semibold sm:text-xl">{question.question}</p>
          {question.scenario ? (
            <p className="text-sm text-slate-300 sm:text-base">{question.scenario}</p>
          ) : null}
        </div>
        <TimerRing remainingMs={timer.remainingMs} totalMs={timer.totalMs} />
      </div>

      <div className="mx-auto w-full max-w-md space-y-2">
        <div className="flex gap-2">
          {chip(CORNERS[0])}
          {chip(CORNERS[1])}
        </div>

        <div
          role="img"
          aria-label="Maze. You start in the middle and the four answer chambers are in the corners. Use the buttons above and below the maze to walk to a chamber, or the movement pad."
          className="relative aspect-square w-full rounded-xl bg-slate-950 p-1.5"
        >
          <div className="relative h-full w-full">
            <div
              className="grid h-full w-full gap-px"
              style={{
                gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${GRID}, minmax(0, 1fr))`,
              }}
            >
              {cells}
            </div>

            {chaserCell !== null ? (
              <div
                aria-hidden="true"
                style={tokenStyle(chaserCell)}
                className="pointer-events-none absolute flex items-center justify-center text-sm motion-safe:transition-all motion-safe:duration-300 sm:text-lg"
              >
                ⏰
              </div>
            ) : null}

            <div
              aria-hidden="true"
              style={tokenStyle(playerCell)}
              className="pointer-events-none absolute flex items-center justify-center motion-safe:transition-all motion-safe:duration-100"
            >
              <span className="h-3/4 w-3/4 rounded-full border-2 border-slate-900 bg-white" />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {chip(CORNERS[2])}
          {chip(CORNERS[3])}
        </div>
      </div>

      <div
        role="group"
        aria-label="Movement pad"
        className="mx-auto grid w-40 grid-cols-3 grid-rows-3 gap-1"
      >
        {DPAD.map((button) => (
          <button
            key={button.direction}
            type="button"
            disabled={!playing}
            onClick={() => tryMove(button.direction)}
            aria-label={button.label}
            className={`${button.area} flex min-h-[48px] items-center justify-center rounded-lg border-2 border-slate-600 bg-slate-800 text-lg hover:border-slate-300 disabled:opacity-50`}
          >
            <span aria-hidden="true">{button.glyph}</span>
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
                  ? 'The alarm caught you. '
                  : 'Not quite. '}
            </span>
            {feedback.explanation}
          </p>
        ) : submitError ? (
          <p className="text-rose-300">{submitError}</p>
        ) : (
          <p className="text-slate-400">
            Arrow keys or WASD to walk. Keys 1 to 4, or tapping a chamber, walk you there. Stepping into a chamber locks in your answer.
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
            <span className="rounded-full bg-sky-700 px-3 py-1">Streak x{streak}</span>
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
              className="mt-4 min-h-[44px] rounded-xl bg-sky-500 px-5 py-2 font-semibold text-slate-900 hover:bg-sky-400"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : activeQuestion ? (
        <QuestionView
          key={activeQuestion.question_id}
          question={activeQuestion}
          level={level}
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
