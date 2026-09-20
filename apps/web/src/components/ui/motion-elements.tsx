'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { AnimatedCounter } from './counter';

/**
 * AnimatedBackground — Layered background with AI imagery, radial gradients, and subtle noise/grid.
 */
export function AnimatedBackground({
  imageSrc,
  imageAlt = 'Abstract background',
  overlay = 'dark',
  className,
  children,
}: {
  imageSrc?: string;
  imageAlt?: string;
  overlay?: 'dark' | 'light' | 'indigo' | 'none';
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {imageSrc && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="100vw"
            priority={false}
            className={cn(
              'object-cover object-center transition-opacity duration-700',
              overlay === 'dark' && 'opacity-70',
              overlay === 'indigo' && 'opacity-65',
              overlay === 'light' && 'opacity-40',
              overlay === 'none' && 'opacity-100'
            )}
          />
          {overlay === 'dark' && (
            <div className="absolute inset-0 bg-gradient-to-b from-navy-950/50 via-navy-950/65 to-navy-950/85" />
          )}
          {overlay === 'indigo' && (
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/60 via-navy-950/70 to-navy-950/85" />
          )}
          {overlay === 'light' && (
            <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/60 to-white/90" />
          )}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * GradientOrb — Breathing, floating glowing ambient orb for high-end SaaS depth.
 */
export function GradientOrb({
  color = 'indigo',
  size = 380,
  className,
  style,
}: {
  color?: 'indigo' | 'amber' | 'teal' | 'purple';
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const colorMap = {
    indigo: 'bg-indigo/25',
    amber: 'bg-amber/20',
    teal: 'bg-teal/20',
    purple: 'bg-purple/20',
  };

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute rounded-full blur-3xl animate-pulse-slow',
        colorMap[color],
        className
      )}
      style={{
        width: size,
        height: size,
        ...style,
      }}
    />
  );
}

/**
 * SectionReveal — Animate section into view smoothly on scroll using IntersectionObserver.
 */
export function SectionReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const [isVisible, setIsVisible] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '40px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transitionDuration: '600ms',
        transitionDelay: `${delay}ms`,
      }}
      className={cn(
        'transition-all ease-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * GlassCard — Translucent card with surface depth, subtle glow border, and hover elevation.
 */
export function GlassCard({
  children,
  className,
  glow = false,
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-card border backdrop-blur-md',
        'border-white/15 bg-white/[0.07] text-white shadow-card',
        glow && 'hover:shadow-glow',
        interactive &&
          'transition-all duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.11] hover:shadow-card-hover',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * AnimatedCard — Modern card with subtle lift and glow response.
 */
export function AnimatedCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'card-interactive rounded-card border border-line bg-card shadow-card',
        'transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover hover:border-indigo/30',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * StatCounter — Formatted count-up with suffix/prefix and prominent typography.
 */
export function StatCounter({
  value,
  label,
  suffix = '',
  prefix = '',
  decimals = 0,
  sublabel,
  className,
}: {
  value?: number | null;
  label: string;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <dd className="tnum text-[28px] sm:text-[34px] font-extrabold leading-none tracking-tight text-white">
        {value !== null && value !== undefined ? (
          <>
            {prefix}
            <AnimatedCounter value={value} decimals={decimals} />
            {suffix}
          </>
        ) : (
          '—'
        )}
      </dd>
      <dt className="mt-2 text-xs sm:text-sm font-medium text-white/70">{label}</dt>
      {sublabel && <p className="mt-0.5 text-2xs text-white/40">{sublabel}</p>}
    </div>
  );
}

/**
 * FloatingVisual — Subtle floating accent element.
 */
export function FloatingVisual({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none select-none transition-transform duration-1000 animate-float',
        className
      )}
    >
      {children}
    </div>
  );
}

