'use client';

import * as React from 'react';
import type {
  GameProps,
  GameEvent,
  AnswerSubmissionResult,
  GameCompletionResult,
  GameQuestion,
  GameDifficultyTier,
} from '../_shared/types';
export { GameErrorBoundary } from './GameErrorBoundary';

const GameContextReact = React.createContext<GameProps | null>(null);

export interface GameProviderProps {
  props: GameProps;
  children: React.ReactNode;
}

export function GameProvider({ props, children }: GameProviderProps) {
  return (
    <GameContextReact.Provider value={props}>
      {children}
    </GameContextReact.Provider>
  );
}

/**
 * Access the full Game runner context within any plugin component.
 */
export function useGame(): GameProps {
  const ctx = React.useContext(GameContextReact);
  if (!ctx) {
    throw new Error('useGame must be used within a <GameProvider>');
  }
  return ctx;
}

/**
 * Access the active question.
 */
export function useGameQuestion(): GameQuestion | null {
  const game = useGame();
  return game.currentQuestion;
}

/**
 * Access current adaptive difficulty level.
 */
export function useGameLevel(): GameDifficultyTier {
  const game = useGame();
  return game.level;
}

/**
 * Access score and lives.
 */
export function useGameScore(): { score: number; lives: number } {
  const game = useGame();
  return { score: game.score, lives: game.lives };
}

/**
 * Helper to emit a structured game event.
 */
export function emitGameEvent(game: GameProps, event: GameEvent): void {
  void game.emitEvent({
    type: event.type,
    payload: event.payload,
  });
}

/**
 * Helper to submit answer.
 */
export async function submitGameAnswer(
  game: GameProps,
  selectedOption: number,
  responseTimeMs: number
): Promise<AnswerSubmissionResult> {
  return await game.submitAnswer(selectedOption, responseTimeMs);
}

/**
 * Helper to complete game.
 */
export async function completeGame(game: GameProps): Promise<GameCompletionResult> {
  return await game.completeGame();
}


