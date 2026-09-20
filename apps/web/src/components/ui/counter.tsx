'use client';

import * as React from 'react';

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

export interface AnimatedCounterProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number | string;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  formatNumber?: boolean;
}

export function AnimatedCounter({
  value,
  duration = 800,
  decimals,
  prefix = '',
  suffix = '',
  formatNumber = true,
  className,
  ...props
}: AnimatedCounterProps) {
  // Parse numeric target from value (handles numbers or numeric strings like "428" or "82.6%")
  const rawString = String(value ?? '').trim();
  const numericMatch = rawString.replace(/,/g, '').match(/^([^\d.-]*)([-+]?\d*\.?\d+)(.*)$/);

  const numericTarget = numericMatch ? parseFloat(numericMatch[2]) : null;
  const inferredPrefix = numericMatch && !prefix ? numericMatch[1] : prefix;
  const inferredSuffix = numericMatch && !suffix ? numericMatch[3] : suffix;

  // Detect decimal places if not explicitly provided
  const targetDecimals =
    decimals !== undefined
      ? decimals
      : numericMatch && numericMatch[2].includes('.')
        ? numericMatch[2].split('.')[1].length
        : 0;

  const [current, setCurrent] = React.useState<number>(numericTarget ?? 0);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (numericTarget === null) return;

    // Check prefers-reduced-motion
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setCurrent(numericTarget);
      return;
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const startValue = 0;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      const nextValue = startValue + (numericTarget - startValue) * easedProgress;
      setCurrent(nextValue);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setCurrent(numericTarget);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [numericTarget, duration]);

  // Fallback for non-numeric strings
  if (numericTarget === null || isNaN(numericTarget)) {
    return (
      <span className={className} {...props}>
        {value}
      </span>
    );
  }

  // During SSR or before mount, render final value so there's zero hydration mismatch or layout jump
  if (!mounted) {
    const formattedTarget = formatNumber
      ? numericTarget.toLocaleString(undefined, {
          minimumFractionDigits: targetDecimals,
          maximumFractionDigits: targetDecimals,
        })
      : numericTarget.toFixed(targetDecimals);

    return (
      <span className={className} {...props}>
        {inferredPrefix}
        {formattedTarget}
        {inferredSuffix}
      </span>
    );
  }

  const formattedValue = formatNumber
    ? current.toLocaleString(undefined, {
        minimumFractionDigits: targetDecimals,
        maximumFractionDigits: targetDecimals,
      })
    : current.toFixed(targetDecimals);

  return (
    <span className={className} {...props}>
      {inferredPrefix}
      {formattedValue}
      {inferredSuffix}
    </span>
  );
}

