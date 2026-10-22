'use client';

import * as React from 'react';
import InboxRescuePluginGame from '@games/inbox-rescue/Game';
import type { GameProps } from '@games/_shared/types';

export function InboxRescueGame(props: GameProps) {
  return <InboxRescuePluginGame {...props} />;
}

export default InboxRescueGame;

