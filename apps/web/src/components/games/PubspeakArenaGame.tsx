'use client';

import * as React from 'react';
import PubspeakArenaPluginGame from '@games/pubspeak-arena/Game';
import type { GameProps } from '@games/_shared/types';

export function PubspeakArenaGame(props: GameProps) {
  return <PubspeakArenaPluginGame {...props} />;
}

export default PubspeakArenaGame;

