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
    className: 'h-9 sm:h-10 w-auto object-contain',
    width: 150,
    height: 100,
  },
  sidebar: {
    className: 'h-10 sm:h-11 w-auto max-w-[190px] object-contain',
    width: 165,
    height: 110,
  },
  compact: {
    className: 'h-7 w-auto object-contain',
    width: 105,
    height: 70,
  },
  footer: {
    className: 'h-10 sm:h-11 w-auto object-contain',
    width: 165,
    height: 110,
  },
  auth: {
    className: 'h-11 sm:h-12 w-auto object-contain',
    width: 180,
    height: 120,
  },
  invoice: {
    className: 'h-9 sm:h-10 w-auto object-contain',
    width: 150,
    height: 100,
  },
  intro: {
    className: 'h-24 sm:h-32 md:h-40 w-auto object-contain',
    width: 360,
    height: 240,
  },
  full: {
    className: 'h-10 w-auto object-contain',
    width: 150,
    height: 100,
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

