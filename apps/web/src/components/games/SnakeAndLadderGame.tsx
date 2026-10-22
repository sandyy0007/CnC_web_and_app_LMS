'use client';

import * as React from 'react';
import {
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
  Trophy,
  ArrowUpRight,
  TrendingDown,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { gameAudio } from '@/lib/audio/GameAudioManager';
import type { QuestionData } from './ReadAndEscapeGame';

interface SnakeAndLadderGameProps {
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

const SNAKES: Record<number, number> = {
  99: 78,
  95: 75,
  92: 88,
  89: 68,
  74: 53,
  64: 60,
  62: 19,
  56: 48,
  49: 11,
  47: 26,
  16: 6,
};

const LADDERS: Record<number, number> = {
  2: 38,
  7: 14,
  8: 31,
  15: 26,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 99,
};

export function SnakeAndLadderGame({
  currentQuestion,
  lives,
  score,
  onAnswer,
  onNextQuestion,
  onFinishGame,
}: SnakeAndLadderGameProps) {
  const [playerPosition, setPlayerPosition] = React.useState<number>(1);
  const [isRolling, setIsRolling] = React.useState(false);
  const [diceValue, setDiceValue] = React.useState<number>(1);
  const [turnMessage, setTurnMessage] = React.useState<string>('Roll the dice to advance on your career path.');
  const [pendingSnakePosition, setPendingSnakePosition] = React.useState<number | null>(null);
  const [snakeModalOpen, setSnakeModalOpen] = React.useState(false);

  // Question state
  const [selectedOption, setSelectedOption] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [questionFeedback, setQuestionFeedback] = React.useState<{
    isCorrect: boolean;
    explanation: string;
  } | null>(null);
  const [questionStartTime, setQuestionStartTime] = React.useState<number>(Date.now());

  // Convert cell number (1-100) to grid coordinates (row 0-9 from top, col 0-9)
  const getCoordinatesForCell = (cell: number) => {
    const rowFromBottom = Math.floor((cell - 1) / 10);
    const rowFromTop = 9 - rowFromBottom;
    const colInRow = (cell - 1) % 10;
    const col = rowFromBottom % 2 === 0 ? colInRow : 9 - colInRow;
    return { row: rowFromTop, col };
  };

  const handleSelectOption = (idx: number) => {
    if (questionFeedback || isSubmitting) return;
    setSelectedOption(idx);
    gameAudio.playSelect();
  };

  const handleRollDice = () => {
    if (isRolling || snakeModalOpen) return;

    gameAudio.playDiceRoll();
    setIsRolling(true);
    let rolls = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      rolls++;
      if (rolls > 8) {
        clearInterval(interval);
        const finalRoll = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalRoll);
        setIsRolling(false);
        processMove(finalRoll);
      }
    }, 60);
  };

  // Keyboard navigation (Space to roll, 1-4 / A-D / Enter for challenge)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (snakeModalOpen) {
        if (questionFeedback || isSubmitting || !currentQuestion) {
          if (e.key === 'Enter' && questionFeedback) {
            handleDismissModal();
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
          void handleSubmitChallenge();
        }
      } else {
        if ((e.code === 'Space' || e.key === 'Enter') && !isRolling) {
          e.preventDefault();
          handleRollDice();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [snakeModalOpen, isRolling, questionFeedback, isSubmitting, selectedOption, currentQuestion]);

  const processMove = (roll: number) => {
    const targetCell = Math.min(100, playerPosition + roll);
    setPlayerPosition(targetCell);

    if (targetCell === 100) {
      gameAudio.playLockUnlock();
      setTurnMessage('Victory! You reached cell 100 and conquered the corporate board!');
      setTimeout(() => onFinishGame(), 1500);
      return;
    }

    // Check Ladder
    if (LADDERS[targetCell]) {
      const destination = LADDERS[targetCell];
      setTimeout(() => {
        gameAudio.playLockUnlock();
        setPlayerPosition(destination);
        setTurnMessage(`Executive Promotion! Climbed ladder from cell ${targetCell} to cell ${destination}!`);
      }, 600);
      return;
    }

    // Check Snake
    if (SNAKES[targetCell]) {
      setPendingSnakePosition(targetCell);
      setTimeout(() => {
        setSnakeModalOpen(true);
        setQuestionStartTime(Date.now());
        setSelectedOption(null);
        setQuestionFeedback(null);
        setTurnMessage(`Snake Encounter at cell ${targetCell}! Answer the communication challenge to avoid sliding down!`);
      }, 500);
      return;
    }

    setTurnMessage(`Moved to cell ${targetCell}. Ready for next turn.`);
  };

  const handleSubmitChallenge = async () => {
    if (selectedOption === null || !currentQuestion || isSubmitting) return;

    setIsSubmitting(true);
    const responseTimeMs = Date.now() - questionStartTime;

    try {
      const result = await onAnswer(selectedOption, responseTimeMs);
      setQuestionFeedback({
        isCorrect: result.is_correct,
        explanation: result.explanation || (result.is_correct ? 'Snake Defeated! You stay at your position.' : 'Wrong answer! Sliding down.'),
      });

      if (!result.is_correct && pendingSnakePosition) {
        // Slide down to snake tail
        gameAudio.playWrong();
        const tail = SNAKES[pendingSnakePosition];
        setPlayerPosition(tail);
        setTurnMessage(`Snake Strike! Slipped from cell ${pendingSnakePosition} down to cell ${tail}.`);
      } else {
        gameAudio.playCorrect();
        setTurnMessage(`Snake Overcome! Stayed at cell ${pendingSnakePosition}.`);
      }
    } catch {
      // Handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismissModal = () => {
    setSnakeModalOpen(false);
    setPendingSnakePosition(null);
    setQuestionFeedback(null);
    setSelectedOption(null);
    onNextQuestion();
  };

  const DiceIcon = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6][diceValue - 1];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* -------------------- 10x10 BOARD -------------------- */}
      <div className="lg:col-span-8 bg-slate-900 border border-emerald-500/20 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Trophy className="size-4" />
            </span>
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              100-Cell Communication Arena
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <ArrowUpRight className="size-3.5" /> 10 Ladders
            </span>
            <span className="flex items-center gap-1 text-red-400 font-semibold">
              <TrendingDown className="size-3.5" /> 11 Snakes
            </span>
          </div>
        </div>

        {/* 10x10 Grid */}
        <div className="grid grid-cols-10 gap-1 bg-slate-950 p-2 rounded-xl border border-slate-800 aspect-square max-w-[600px] mx-auto">
          {Array.from({ length: 100 }, (_, idx) => {
            const rowFromTop = Math.floor(idx / 10);
            const rowFromBottom = 9 - rowFromTop;
            const colInRow = idx % 10;
            const cellNumber = rowFromBottom % 2 === 0
              ? rowFromBottom * 10 + (colInRow + 1)
              : rowFromBottom * 10 + (10 - colInRow);

            const isPlayerHere = playerPosition === cellNumber;
            const isSnakeHead = Boolean(SNAKES[cellNumber]);
            const isLadderBase = Boolean(LADDERS[cellNumber]);

            return (
              <div
                key={cellNumber}
                className={cn(
                  'relative rounded-md flex flex-col items-center justify-between p-1 transition-all text-center select-none',
                  (rowFromTop + colInRow) % 2 === 0 ? 'bg-slate-900/80' : 'bg-slate-800/50',
                  isPlayerHere && 'ring-2 ring-emerald-400 bg-emerald-500/30 font-bold',
                  isSnakeHead && 'border border-red-500/40 bg-red-950/30',
                  isLadderBase && 'border border-emerald-500/40 bg-emerald-950/30'
                )}
              >
                <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-400 self-start leading-none">
                  {cellNumber}
                </span>

                {/* Player Token */}
                {isPlayerHere && (
                  <div className="size-5 sm:size-6 rounded-full bg-emerald-400 text-slate-950 font-bold flex items-center justify-center text-xs shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-bounce z-10">
                    ★
                  </div>
                )}

                {/* Snake / Ladder Badge */}
                {isSnakeHead && !isPlayerHere && (
                  <span className="text-[10px] text-red-400 font-bold leading-none" title={`Snake to ${SNAKES[cellNumber]}`}>
                    🐍 {SNAKES[cellNumber]}
                  </span>
                )}
                {isLadderBase && !isPlayerHere && (
                  <span className="text-[10px] text-emerald-400 font-bold leading-none" title={`Ladder to ${LADDERS[cellNumber]}`}>
                    🪜 {LADDERS[cellNumber]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* -------------------- RIGHT: CONTROLS & STATUS -------------------- */}
      <div className="lg:col-span-4 space-y-4">
        {/* Dice & Move Card */}
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-xl text-center">
          <p className="text-2xs font-mono uppercase tracking-wider text-slate-400 mb-3">
            Navigation Controls
          </p>

          <div className="flex justify-center my-4">
            <div
              className={cn(
                'size-24 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-slate-950 shadow-2xl shadow-emerald-500/30 transition-transform duration-150',
                isRolling && 'animate-spin scale-110'
              )}
            >
              <DiceIcon className="size-14 text-white drop-shadow-md" />
            </div>
          </div>

          <p className="text-sm font-bold text-white mb-1">
            Current Roll: <span className="text-emerald-400 text-lg font-mono">{diceValue}</span>
          </p>
          <p className="text-xs text-slate-400 mb-5">
            Player Position: Cell <strong className="text-white font-mono">{playerPosition}</strong> / 100
          </p>

          <Button
            variant="primary"
            size="lg"
            disabled={isRolling || snakeModalOpen}
            onClick={handleRollDice}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 py-6"
          >
            {isRolling ? 'Rolling Dice...' : 'Roll Dice (Advance)'}
          </Button>
        </div>

        {/* Turn Log Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <p className="text-2xs uppercase tracking-wider font-bold text-slate-400 mb-2">Live Board Status</p>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
            {turnMessage}
          </p>
        </div>
      </div>

      {/* -------------------- SNAKE CHALLENGE MODAL -------------------- */}
      {snakeModalOpen && currentQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-xl w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-red-500/20 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🐍</span>
                <div>
                  <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">
                    Snake Challenge Encountered!
                  </h3>
                  <p className="text-xs text-slate-400">Answer correctly to slay the snake and stay up</p>
                </div>
              </div>
              <Badge tone="purple">{currentQuestion.difficulty}</Badge>
            </div>

            <h4 className="text-base font-bold text-white mb-4 leading-snug">
              {currentQuestion.question}
            </h4>

            {/* Options with full state lifecycle */}
            <div className="space-y-2 mb-4">
              {currentQuestion.options.map((opt) => {
                const isSelected = selectedOption === opt.index;
                const isResult = Boolean(questionFeedback);
                const isCorrectAnswer = isResult && isSelected && questionFeedback?.isCorrect;
                const isWrongAnswer = isResult && isSelected && !questionFeedback?.isCorrect;

                return (
                  <button
                    key={opt.index}
                    type="button"
                    disabled={isSubmitting || Boolean(questionFeedback)}
                    onClick={() => handleSelectOption(opt.index)}
                    className={cn(
                      'w-full text-left p-3 rounded-xl border text-sm font-medium transition-all flex items-start gap-2.5 relative group',
                      isCorrectAnswer
                        ? 'border-emerald-500 bg-emerald-500/20 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)] ring-1 ring-emerald-500'
                        : isWrongAnswer
                        ? 'border-rose-500 bg-rose-500/20 text-white shadow-[0_0_12px_rgba(244,63,94,0.35)] ring-1 ring-rose-500'
                        : isSelected
                        ? 'border-emerald-400 bg-emerald-500/20 text-white shadow-[0_0_10px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400'
                        : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-emerald-500/40 hover:bg-slate-900',
                      (isSubmitting || Boolean(questionFeedback)) && 'cursor-default'
                    )}
                  >
                    <span
                      className={cn(
                        'size-5 rounded flex items-center justify-center text-xs font-bold font-mono shrink-0 transition-colors',
                        isCorrectAnswer
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : isWrongAnswer
                          ? 'bg-rose-500 text-white font-black'
                          : isSelected
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700'
                      )}
                    >
                      {String.fromCharCode(65 + opt.index)}
                    </span>
                    <span className="flex-1">{opt.text}</span>
                    <span className="text-3xs text-slate-600 font-mono uppercase self-center hidden sm:inline">
                      Option {opt.index + 1}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Feedback / Buttons */}
            {questionFeedback ? (
              <div
                className={cn(
                  'p-3.5 rounded-xl border mb-4 text-xs sm:text-sm',
                  questionFeedback.isCorrect
                    ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                    : 'border-red-500/40 bg-red-950/60 text-red-200'
                )}
              >
                <div className="flex items-start gap-2">
                  {questionFeedback.isCorrect ? (
                    <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-bold mb-0.5">
                      {questionFeedback.isCorrect ? 'Snake Neutralized!' : 'Snake Bit! Sliding Down.'}
                    </p>
                    <p className="text-slate-300 text-xs">{questionFeedback.explanation}</p>
                  </div>
                </div>

                <div className="mt-3 text-right">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleDismissModal}
                    className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold"
                  >
                    Continue Journey
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="primary"
                  disabled={selectedOption === null || isSubmitting}
                  loading={isSubmitting}
                  onClick={handleSubmitChallenge}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold"
                >
                  Confront Snake
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
