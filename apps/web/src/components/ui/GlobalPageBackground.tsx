'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { useGlobalBackground } from './GlobalBackgroundLayer';

import { useTheme } from '@/lib/theme/ThemeContext';

export interface GlobalPageBackgroundProps {
  image: string;
  imageAlt?: string;
  variant?: 'dark' | 'light';
  blur?: number; // Controlled blur in px (4 - 10px)
  overlayOpacity?: number;
  withGrid?: boolean;
  withOrbs?: boolean;
  orbTone?: 'indigo' | 'cyan' | 'purple' | 'amber';
  fullBleed?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * GlobalPageBackground — The single global background architecture for Winners Creek.
 *
 * Stacking:
 *  - z-0: Real WebP background image with controlled blur (4px - 10px) & subtle scale (1.05)
 *  - z-1: Semi-transparent calibrated readability overlay (dark / light variant)
 *  - z-2: Subtle decorative visual layer (ambient tech grid + soft orbs)
 *  - z-10: 100% crisp, sharp, perfectly readable content surface
 * GlobalPageBackground — Seamlessly registers the page-specific background configuration
 * with the root continuous GlobalBackgroundLayer, while rendering its children on top
 * without creating disconnected background containers or edge breaks.
 */
export function GlobalPageBackground({
  image,
  imageAlt = 'Page background',
  variant,
  blur = 6,
  overlayOpacity,
  withGrid = true,
  withOrbs = true,
  orbTone = 'indigo',
  fullBleed = true,
  className,
  children,
}: GlobalPageBackgroundProps) {
  const { theme } = useTheme();
  const activeVariant = theme;
  // Clamp blur to safe range (4px - 10px) to prevent over-blurring or under-blurring
  const safeBlur = Math.min(Math.max(blur, 4), 10);
  const { setBackground } = useGlobalBackground();

  React.useEffect(() => {
    if (image) {
      setBackground({
        image,
        imageAlt,
        variant: activeVariant,
        blur,
        overlayOpacity,
        withGrid,
        withOrbs,
        orbTone,
      });
    }
  }, [image, imageAlt, activeVariant, blur, overlayOpacity, withGrid, withOrbs, orbTone, setBackground]);

  return (
    <div
      className={cn(
        'relative z-10 w-full transition-all duration-300',
        fullBleed && '-mx-4 -mt-5 -mb-12 sm:-mx-6 sm:-mt-6 sm:-mb-12 p-4 pt-5 pb-12 sm:p-6 sm:pt-6',
        'text-ink-1 dark:text-slate-100',
        className,
      )}
    >
      {children}
    </div>
  );
}
