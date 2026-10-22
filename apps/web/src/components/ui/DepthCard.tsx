'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { motionConfig, useIsPointerFine, usePrefersReducedMotion } from '@/lib/motion-config';

export interface DepthCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  maxAngle?: number;
  scale?: number;
  glare?: boolean;
}

/**
 * DepthCard — Multi-layer 3D spatial card container.
 * Children can use `<DepthLayer z={16}>` to elevate floating elements in Z-space.
 */
export function DepthCard({
  children,
  className,
  maxAngle = motionConfig.tilt.maxAngle,
  scale = motionConfig.tilt.scale,
  glare = true,
  style,
  ...props
}: DepthCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPointerFine = useIsPointerFine();

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !isPointerFine || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xRatio = Math.max(0, Math.min(1, x / rect.width));
    const yRatio = Math.max(0, Math.min(1, y / rect.height));

    const rotateX = ((0.5 - yRatio) * 2 * maxAngle).toFixed(2);
    const rotateY = ((xRatio - 0.5) * 2 * maxAngle).toFixed(2);

    cardRef.current.style.transform = `perspective(${motionConfig.tilt.perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, 1)`;
    cardRef.current.style.setProperty('--mouse-x', `${(xRatio * 100).toFixed(1)}%`);
    cardRef.current.style.setProperty('--mouse-y', `${(yRatio * 100).toFixed(1)}%`);
    cardRef.current.style.setProperty('--glare-opacity', `${motionConfig.tilt.glareMaxOpacity}`);
  };

  const handlePointerEnter = () => {
    if (prefersReducedMotion || !isPointerFine) return;
    if (cardRef.current) {
      cardRef.current.style.transition = 'transform 100ms ease-out';
    }
  };

  const handlePointerLeave = () => {
    if (cardRef.current) {
      cardRef.current.style.transition = `transform ${motionConfig.tilt.returnDurationMs}ms ${motionConfig.easings.springSmooth}`;
      cardRef.current.style.transform = `perspective(${motionConfig.tilt.perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      cardRef.current.style.setProperty('--glare-opacity', '0');
    }
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'relative rounded-2xl border border-line bg-card p-6 shadow-card dark:border-white/10 dark:bg-slate-900/60 dark:backdrop-blur-xl',
        isPointerFine && !prefersReducedMotion && 'preserve-3d will-change-transform',
        className
      )}
      style={style}
      {...props}
    >
      {glare && isPointerFine && !prefersReducedMotion && (
        <div aria-hidden className="specular-glare" />
      )}
      <div className={cn('relative z-[1]', isPointerFine && !prefersReducedMotion && 'preserve-3d')}>
        {children}
      </div>
    </div>
  );
}

/**
 * DepthLayer — Elevated sublayer inside a DepthCard or TiltCard that floats along the Z-axis.
 */
export function DepthLayer({
  z = 16,
  children,
  className,
  style,
  ...props
}: {
  z?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLDivElement>) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPointerFine = useIsPointerFine();

  const elevationStyle: React.CSSProperties =
    !prefersReducedMotion && isPointerFine
      ? {
          transform: `translateZ(${z}px)`,
          transformStyle: 'preserve-3d',
        }
      : {};

  return (
    <div
      className={cn('transition-transform duration-200', className)}
      style={{
        ...elevationStyle,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

