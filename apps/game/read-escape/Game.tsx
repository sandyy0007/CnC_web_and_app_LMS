'use client';

import * as React from 'react';
import type { GameProps } from '../_shared/types';
import { ReadAndEscapeGame } from '@/components/games/ReadAndEscapeGame';

export default function ReadEscapePluginGame(props: GameProps) {
  return (
    <ReadAndEscapeGame
      currentQuestion={props.currentQuestion}
      lives={props.lives}
      score={props.score}
      onAnswer={props.submitAnswer}
      onNextQuestion={() => void props.nextQuestion()}
      onFinishGame={() => void props.completeGame()}
    />
  );
}

