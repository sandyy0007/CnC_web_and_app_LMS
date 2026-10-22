'use client';

import * as React from 'react';

/**
 * Winners Creek Centralized Motion & 3D Tokens
 * High-performance, tactile, accessible animation parameters.
 */
export const motionConfig = {
  durations: {
    instant: 100,
    fast: 180,
    normal: 280,
    slow: 420,
    spacious: 600,
  },
  easings: {
    // Highly responsive spring feel without unnatural overshoot
    springSmooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
    // Subtle tactile pop for badges, pills, and indicators
    springBouncy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    // Gentle deceleration for large spatial surfaces
    springGentle: 'cubic-bezier(0.25, 1, 0.5, 1)',
    // Clean exit curve
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  },
  tilt: {
    perspective: 1200, // px
    maxAngle: 4.0, // degrees
    scale: 1.015,
    glareMaxOpacity: 0.18,
    returnDurationMs: 380,
  },
  depth: {
    cardElevationZ: 14, // px
    badgeElevationZ: 26, // px
    actionElevationZ: 32, // px
  },
} as const;

/**
 * Hook to respect user's system motion preferences (WCAG 2.2 §2.3.3)
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return prefersReducedMotion;
}

/**
 * Hook to detect whether the user has a fine-pointer device (mouse/trackpad)
 * ensuring 3D tilt effects do not interfere with mobile touch scrolling.
 */
export function useIsPointerFine(): boolean {
  const [isPointerFine, setIsPointerFine] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    setIsPointerFine(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      setIsPointerFine(event.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return isPointerFine;
}

