'use client';

import * as React from 'react';
import ListeningQuestPluginGame from '@games/listening-quest/Game';
import type { GameProps } from '@games/_shared/types';

export function ListeningQuestGame(props: GameProps) {
  return <ListeningQuestPluginGame {...props} />;
}

export default ListeningQuestGame;

