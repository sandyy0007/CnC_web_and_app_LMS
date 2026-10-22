import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';

export type LogoVariant =
  | 'full'
  | 'compact'
  | 'header'
  | 'sidebar'
  | 'footer'
  | 'auth'
  | 'invoice'
  | 'intro';

export interface WinnersCreekLogoProps {
  variant?: LogoVariant;
  className?: string;
  priority?: boolean;
  alt?: string;
}

const VARIANT_STYLES: Record<LogoVariant, { className: string; width: number; height: number }> = {
  header: {
    className: 'h-10 sm:h-12 md:h-12 w-auto max-w-[210px] object-contain',
    width: 210,
    height: 140,
  },
  sidebar: {
    className: 'h-11 sm:h-12 md:h-13 w-auto max-w-[215px] object-contain',
    width: 215,
    height: 140,
  },
  compact: {
    className: 'h-8 sm:h-9 w-auto object-contain',
    width: 130,
    height: 85,
  },
  footer: {
    className: 'h-11 sm:h-12 w-auto object-contain',
    width: 180,
    height: 120,
  },
  auth: {
    className: 'h-12 sm:h-14 md:h-16 w-auto object-contain',
    width: 240,
    height: 160,
  },
  invoice: {
    className: 'h-10 sm:h-11 w-auto object-contain',
    width: 170,
    height: 110,
  },
  intro: {
    className: 'h-24 sm:h-36 md:h-44 w-auto object-contain',
    width: 400,
    height: 260,
  },
  full: {
    className: 'h-12 sm:h-14 md:h-16 w-auto object-contain',
    width: 240,
    height: 160,
  },
};

/**
 * Centralized, shared Winners Creek Logo Component.
 * Uses the official asset `/images/winnerscreek.png` with strict aspect-ratio preservation,
 * responsive scaling, and zero duplicated brand text.
 */
export function WinnersCreekLogo({
  variant = 'full',
  className,
  priority = false,
  alt = 'Winners Creek',
}: WinnersCreekLogoProps) {
  const config = VARIANT_STYLES[variant] || VARIANT_STYLES.full;

  return (
    <div className={cn('inline-flex items-center justify-center shrink-0', className)}>
      <Image
        src="/images/winnerscreek.png"
        alt={alt}
        width={config.width}
        height={config.height}
        className={cn(config.className, 'transition-transform duration-200')}
        priority={priority}
      />
    </div>
  );
}

