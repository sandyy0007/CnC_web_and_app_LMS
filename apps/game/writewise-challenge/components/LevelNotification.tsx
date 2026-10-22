'use client';

import React, { useEffect, useState } from 'react';
import type { GameDifficultyTier } from '../../_shared/types';
import { getTierDisplay } from '../utils/writingChallenge';

interface LevelNotificationProps {
  currentTier: GameDifficultyTier;
  previousTier: GameDifficultyTier | null;
}

export const LevelNotification: React.FC<LevelNotificationProps> = ({
  currentTier,
  previousTier,
}) => {
  const [visible, setVisible] = useState(false);
  const [isPromotion, setIsPromotion] = useState(true);

  useEffect(() => {
    if (!previousTier || previousTier === currentTier) return;

    const tiers: GameDifficultyTier[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
    const prevIdx = tiers.indexOf(previousTier);
    const currIdx = tiers.indexOf(currentTier);

    setIsPromotion(currIdx > prevIdx);
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
    }, 4000);

    return () => clearTimeout(timer);
  }, [currentTier, previousTier]);

  if (!visible) return null;

  const tierInfo = getTierDisplay(currentTier);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
      <div
        className={`px-6 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 backdrop-blur-md ${
          isPromotion
            ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
            : 'bg-amber-950/90 border-amber-500 text-amber-200'
        }`}
      >
        <span className="text-2xl">{isPromotion ? '🚀' : '⚖️'}</span>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider block">
            {isPromotion ? 'Difficulty Promoted!' : 'Difficulty Adjusted'}
          </span>
          <p className="text-sm font-bold">
            {isPromotion ? `Welcome to ${tierInfo.title}` : `Returning to ${tierInfo.title}`}
          </p>
        </div>
      </div>
    </div>
  );
};
