'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { GameRunner } from '@/components/games/GameRunner';

export default function GamePlayPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params?.gameId;

  if (!gameId) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center">
        <p className="text-sm font-semibold text-slate-400">Loading game session...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-5rem)] py-4 sm:py-6 px-2 sm:px-4">
      <GameRunner gameId={gameId} />
    </div>
  );
}
