'use client';

import * as React from 'react';
import type { GameProps } from '../_shared/types';
import { SnakeAndLadderGame } from '@/components/games/SnakeAndLadderGame';

export default function SnakeLadderPluginGame(props: GameProps) {
  return (
    <SnakeAndLadderGame
      currentQuestion={props.currentQuestion}
      lives={props.lives}
      score={props.score}
      onAnswer={props.submitAnswer}
      onNextQuestion={() => void props.nextQuestion()}
      onFinishGame={() => void props.completeGame()}
    />
  );
}

