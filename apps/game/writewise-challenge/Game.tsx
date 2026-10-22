'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GameProps, GameDifficultyTier } from '../_shared/types';

import { GameHeader } from './components/GameHeader';
import { WritingEditorCard } from './components/WritingEditorCard';
import { OptionCard } from './components/OptionCard';
import { FeedbackPanel } from './components/FeedbackPanel';
import { BriefingModal } from './components/BriefingModal';
import { HintModal } from './components/HintModal';
import { LevelNotification } from './components/LevelNotification';
import { GameOverModal } from './components/GameOverModal';
import {
  detectChallengeType,
  generateHintForQuestion,
} from './utils/writingChallenge';

export default function Game(props: GameProps) {
  const currentQuestion = props.currentQuestion;
  const score = props.score;
  const lives = props.lives;
  const level = props.level;

  // Local UI & interaction state
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submissionResult, setSubmissionResult] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Motivational gameplay indicators
  const [streak, setStreak] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  // Timer & hints
  const [remainingSeconds, setRemainingSeconds] = useState(
    props.gameContext.timeLimitSeconds && props.gameContext.timeLimitSeconds > 0
      ? props.gameContext.timeLimitSeconds
      : 900 // default 15 min
  );
  const [hintsLeft, setHintsLeft] = useState(3);
  const [isHintOpen, setIsHintOpen] = useState(false);

  // Adaptive difficulty tracking
  const [previousTier, setPreviousTier] = useState<GameDifficultyTier | null>(null);
  const [gameOverReason, setGameOverReason] = useState<'victory' | 'out_of_lives' | 'timeout' | null>(null);

  // Timing references
  const questionStartRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<any>(null);

  // 1. Monitor level transitions for adaptive toast & telemetry
  useEffect(() => {
    if (previousTier && previousTier !== level) {
      const tiers: GameDifficultyTier[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
      const isPromo = tiers.indexOf(level) > tiers.indexOf(previousTier);
      props.emitEvent({
        type: isPromo ? 'LEVEL_UP' : 'LEVEL_DOWN',
        payload: { fromLevel: previousTier, toLevel: level },
      }).catch(console.error);
    }
    setPreviousTier(level);
  }, [level, previousTier, props]);

  // 2. Start simulation timer once briefing is dismissed
  useEffect(() => {
    if (!hasStarted || gameOverReason) return;

    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (!prev || prev <= 1) {
          clearInterval(timerIntervalRef.current!);
          setGameOverReason('timeout');
          props.emitEvent({
            type: 'TIMEOUT',
            payload: { questionId: currentQuestion?.question_id },
          }).catch(console.error);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [hasStarted, gameOverReason, currentQuestion, props]);

  // 3. Monitor question display for telemetry & latency tracking
  useEffect(() => {
    if (hasStarted && currentQuestion) {
      questionStartRef.current = Date.now();
      props.emitEvent({
        type: 'QUESTION_SHOWN',
        payload: {
          questionId: currentQuestion.question_id,
          difficulty: currentQuestion.difficulty,
          tag: currentQuestion.tag,
        },
      }).catch(console.error);
    }
  }, [hasStarted, currentQuestion?.question_id, props]);

  // 4. Check if lives are depleted
  useEffect(() => {
    if (hasStarted && lives <= 0 && !gameOverReason) {
      setGameOverReason('out_of_lives');
    }
  }, [hasStarted, lives, gameOverReason]);

  // Handle Game Start from Briefing
  const handleStartGame = () => {
    setHasStarted(true);
    questionStartRef.current = Date.now();
    props.emitEvent({
      type: 'GAME_STARTED',
      payload: { difficulty: level, durationSeconds: remainingSeconds },
    }).catch(console.error);
  };

  // Option selection
  const handleSelectOption = (index: number) => {
    if (submissionResult || isSubmitting) return;
    setSelectedOption(index);
    props.emitEvent({
      type: 'ANSWER_SELECTED',
      payload: {
        questionId: currentQuestion?.question_id,
        optionIndex: index,
      },
    }).catch(console.error);
  };

  // Submit Answer
  const handleSubmitAnswer = async () => {
    if (selectedOption === null || !currentQuestion || isSubmitting || submissionResult) return;

    setIsSubmitting(true);
    const latencyMs = Math.max(500, Date.now() - questionStartRef.current);

    try {
      props.emitEvent({
        type: 'ANSWER_SUBMITTED',
        payload: {
          questionId: currentQuestion.question_id,
          optionIndex: selectedOption,
          responseTimeMs: latencyMs,
        },
      }).catch(console.error);

      const result = await props.submitAnswer(selectedOption, latencyMs);
      setSubmissionResult(result);
      setTotalAnswered((prev) => prev + 1);

      if (result.is_correct) {
        setStreak((prev) => prev + 1);
        setCorrectCount((prev) => prev + 1);
        props.emitEvent({
          type: 'ANSWER_CORRECT',
          payload: {
            questionId: currentQuestion.question_id,
            pointsEarned: (result as any).points_awarded ?? result.earned_score ?? 0,
            streak: streak + 1,
          },
        }).catch(console.error);
      } else {
        setStreak(0);
        props.emitEvent({
          type: 'ANSWER_WRONG',
          payload: {
            questionId: currentQuestion.question_id,
            livesRemaining: result.lives_remaining,
          },
        }).catch(console.error);

        props.emitEvent({
          type: 'LIFE_LOST',
          payload: {
            livesRemaining: result.lives_remaining,
            reason: 'WRONG_ANSWER',
          },
        }).catch(console.error);

        if (result.lives_remaining <= 0) {
          setGameOverReason('out_of_lives');
        }
      }
    } catch (err) {
      console.error('Error submitting answer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Move to Next Question
  const handleNextQuestion = async () => {
    if (isLoadingNext) return;
    setIsLoadingNext(true);

    try {
      setSelectedOption(null);
      setSubmissionResult(null);
      await props.nextQuestion();
    } catch (err) {
      console.error('Error requesting next question:', err);
    } finally {
      setIsLoadingNext(false);
    }
  };

  // Conclude game and open authoritative LMS Report Card
  const handleFinishGame = async () => {
    if (isFinishing) return;
    setIsFinishing(true);

    try {
      const finalAccuracy = totalAnswered > 0 ? (correctCount / totalAnswered) * 100 : 0;
      props.emitEvent({
        type: 'GAME_COMPLETED',
        payload: {
          finalScore: score,
          accuracy: finalAccuracy,
          totalAnswered,
          correctCount,
        },
      }).catch(console.error);

      await props.completeGame();
    } catch (err) {
      console.error('Error finalizing game attempt:', err);
    } finally {
      setIsFinishing(false);
    }
  };

  // Open Hint
  const handleOpenHint = () => {
    if (hintsLeft <= 0 || !currentQuestion) return;
    setIsHintOpen(true);
    setHintsLeft((prev) => prev - 1);
    props.emitEvent({
      type: 'HINT_USED',
      payload: {
        questionId: currentQuestion.question_id,
        hintsRemaining: hintsLeft - 1,
      },
    }).catch(console.error);
  };

  // Keyboard navigation support (1-4 or Enter)
  useEffect(() => {
    if (!hasStarted || gameOverReason) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHintOpen) return;

      if (!submissionResult) {
        if (['1', 'a', 'A'].includes(e.key)) handleSelectOption(0);
        else if (['2', 'b', 'B'].includes(e.key)) handleSelectOption(1);
        else if (['3', 'c', 'C'].includes(e.key)) handleSelectOption(2);
        else if (['4', 'd', 'D'].includes(e.key)) handleSelectOption(3);
        else if (e.key === 'Enter' && selectedOption !== null) handleSubmitAnswer();
      } else if (e.key === 'Enter' || e.key === ' ') {
        handleNextQuestion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasStarted, gameOverReason, submissionResult, selectedOption, isHintOpen]);

  // Active challenge type
  const activeType = detectChallengeType(currentQuestion);
  const hintText = currentQuestion ? generateHintForQuestion(currentQuestion) : '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-2 sm:p-6 select-none font-sans">
      {/* 1. Pre-flight Briefing Modal */}
      {!hasStarted && (
        <BriefingModal
          onStart={handleStartGame}
          gameTitle={props.gameContext.title || 'WriteWise: Professional Writing Challenge'}
          durationMinutes={Math.round((props.gameContext.timeLimitSeconds ?? 900) / 60) || 15}
          xpReward={200}
        />
      )}

      {/* 2. Adaptive Level Promotion / Demotion Toast */}
      <LevelNotification currentTier={level} previousTier={previousTier} />

      {/* 3. Hint Modal */}
      <HintModal
        hintText={hintText}
        hintsLeft={hintsLeft}
        isOpen={isHintOpen}
        onClose={() => setIsHintOpen(false)}
      />

      {/* 4. Game Over / Victory Modal */}
      {gameOverReason && (
        <GameOverModal
          reason={gameOverReason}
          score={score}
          totalAnswered={totalAnswered}
          correctCount={correctCount}
          onFinish={handleFinishGame}
          isSubmitting={isFinishing}
        />
      )}

      {/* 5. Main Game Container */}
      <div className="w-full max-w-4xl bg-slate-900/60 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-sm">
        {/* Top HUD */}
        <GameHeader
          title={props.gameContext.title || 'WriteWise'}
          level={level}
          lives={lives}
          maxLives={3}
          score={score}
          streak={streak}
          remainingSeconds={remainingSeconds ?? 900}
          hintsLeft={hintsLeft}
          onOpenHint={handleOpenHint}
          questionNumber={totalAnswered + 1}
        />

        {/* Challenge Canvas */}
        <main className="p-4 sm:p-8 flex-1 flex flex-col">
          {currentQuestion ? (
            <div className="flex flex-col flex-1">
              {/* Workplace Editor Card */}
              <WritingEditorCard question={currentQuestion} activeType={activeType} />

              {/* Options Grid */}
              <div className="grid grid-cols-1 gap-3 sm:gap-3.5 my-2">
                {currentQuestion.options.map((option, idx) => {
                  const isOptSelected = selectedOption === idx;
                  let isCorrectOpt: boolean | null = null;

                  if (submissionResult) {
                    if (idx === submissionResult.correct_option) {
                      isCorrectOpt = true;
                    } else if (isOptSelected && !submissionResult.is_correct) {
                      isCorrectOpt = false;
                    }
                  }

                  return (
                    <OptionCard
                      key={idx}
                      index={idx}
                      text={typeof option === 'string' ? option : (option as any)?.text ?? ''}
                      isSelected={isOptSelected}
                      isCorrect={isCorrectOpt}
                      isDisabled={submissionResult !== null || isSubmitting}
                      onSelect={handleSelectOption}
                      showResult={submissionResult !== null}
                    />
                  );
                })}
              </div>

              {/* Submit CTA button (Before feedback is shown) */}
              {!submissionResult && (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={selectedOption === null || isSubmitting}
                    className={`px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide transition shadow-lg flex items-center gap-2 cursor-pointer ${
                      selectedOption !== null && !isSubmitting
                        ? 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/25 active:scale-95'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <span>{isSubmitting ? 'Evaluating...' : 'Confirm Polish ➔'}</span>
                  </button>
                </div>
              )}

              {/* Immediate Feedback Panel */}
              {submissionResult && (
                <FeedbackPanel
                  result={submissionResult}
                  onNext={handleNextQuestion}
                  isLoadingNext={isLoadingNext}
                />
              )}
            </div>
          ) : (
            /* Loading State */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 mb-4 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <h3 className="text-base font-bold text-slate-200">Retrieving Adaptive Challenge...</h3>
              <p className="text-xs text-slate-400 mt-1">Connecting to Winners Creek LMS GameEngine</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
