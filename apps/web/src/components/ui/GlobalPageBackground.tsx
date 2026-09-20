'use client';

import Image from 'next/image';
import * as React from 'react';
import { cn } from '@/lib/cn';
import { useGlobalBackground } from './GlobalBackgroundLayer';

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
  variant = 'dark',
  blur = 6,
  overlayOpacity,
  withGrid = true,
  withOrbs = true,
  orbTone = 'indigo',
  fullBleed = true,
  className,
  children,
}: GlobalPageBackgroundProps) {
  // Clamp blur to safe range (4px - 10px) to prevent over-blurring or under-blurring
  const safeBlur = Math.min(Math.max(blur, 4), 10);
  const { setBackground } = useGlobalBackground();

  React.useEffect(() => {
    if (image) {
      setBackground({
        image,
        imageAlt,
        variant,
        blur,
        overlayOpacity,
        withGrid,
        withOrbs,
        orbTone,
      });
    }
  }, [image, imageAlt, variant, blur, overlayOpacity, withGrid, withOrbs, orbTone, setBackground]);

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden transition-all duration-300',
        fullBleed && '-mx-4 -mt-5 -mb-12 sm:-mx-6 sm:-mt-6 sm:-mb-12 p-4 pt-5 pb-12 sm:p-6 sm:pt-6',
        variant === 'dark' ? 'text-slate-100' : 'text-slate-900',
        className,
      )}
    >
      {/* 1. Background Image Layer (z-0) — Controlled Blur */}
      <div className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes="100vw"
          priority={false}
          className="object-cover object-center transition-all duration-700"
          style={{
            filter: `blur(${safeBlur}px)`,
            transform: 'scale(1.05)', // Prevent boundary vignette from CSS blur
          }}
        />
      </div>

      {/* 2. Readability Overlay Layer (z-1) — Calibrated Translucency */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-[1] transition-colors duration-500',
          variant === 'dark'
            ? 'bg-gradient-to-b from-slate-950/70 via-slate-950/60 to-slate-950/85'
            : 'bg-gradient-to-b from-white/80 via-slate-50/75 to-white/90',
        )}
        style={overlayOpacity !== undefined ? { opacity: overlayOpacity } : undefined}
      />

      {/* 3. Decorative Visual Layer (z-2) — Subtle Grid & Radiant Orbs */}
      {withGrid && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-[2]',
            variant === 'dark'
              ? 'bg-grid-cyber opacity-40'
              : 'bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:24px_24px] opacity-25',
          )}
        />
      )}

      {withOrbs && (
        <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
          <div
            className={cn(
              'absolute -top-32 -right-32 size-[440px] rounded-full blur-[130px] opacity-20',
              orbTone === 'indigo' && 'bg-indigo-500',
              orbTone === 'cyan' && 'bg-cyan-500',
              orbTone === 'purple' && 'bg-purple-600',
              orbTone === 'amber' && 'bg-amber-500',
            )}
          />
          <div className="absolute top-1/2 -left-36 size-[380px] rounded-full bg-blue-600 blur-[120px] opacity-15" />
          <div className="absolute -bottom-32 right-1/4 size-[420px] rounded-full bg-violet-600 blur-[130px] opacity-15" />
        </div>
      )}

      {/* 4. Actual Sharp Content Layer (z-10) — Never Blurred */}
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
