'use client';

import * as React from 'react';
import EmailEscapePluginGame from '@games/email-escape/Game';
import type { GameProps } from '@games/_shared/types';

export function EmailEscapeGame(props: GameProps) {
  return <EmailEscapePluginGame {...props} />;
}

export default EmailEscapeGame;

