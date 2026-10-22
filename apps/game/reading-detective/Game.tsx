'use client';

import * as React from 'react';
import type { GameProps } from '../_shared/types';
import { ReadingDetectiveGame } from '@/components/games/ReadingDetectiveGame';

export default function ReadingDetectivePluginGame(props: GameProps) {
  return (
    <ReadingDetectiveGame
      currentQuestion={props.currentQuestion}
      lives={props.lives}
      score={props.score}
      onAnswer={props.submitAnswer}
      onNextQuestion={() => void props.nextQuestion()}
      onFinishGame={() => void props.completeGame()}
    />
  );
}

