'use client';

import * as React from 'react';
import { GlobalPageBackground, GlobalPageBackgroundProps } from './GlobalPageBackground';

export type VisualPageBackgroundProps = Partial<GlobalPageBackgroundProps> & {
  image?: string;
  overlay?: 'dark' | 'glass' | 'subtle' | 'none';
  orbColor?: 'indigo' | 'cyan' | 'purple' | 'amber';
  children: React.ReactNode;
};

/**
 * VisualPageBackground — Wraps GlobalPageBackground for backward compatibility,
 * delegating to the unified 4-layer background system.
 */
export function VisualPageBackground({
  image = '/images/backgrounds/courses.webp',
  overlay = 'dark',
  orbColor = 'indigo',
  variant,
  children,
  ...rest
}: VisualPageBackgroundProps) {
  const chosenVariant = variant || (overlay === 'dark' ? 'dark' : 'light');
  return (
    <GlobalPageBackground
      image={image}
      variant={chosenVariant}
      orbTone={orbColor}
      {...rest}
    >
      {children}
    </GlobalPageBackground>
  );
}
