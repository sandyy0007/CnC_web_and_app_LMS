'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { motionConfig, useIsPointerFine, usePrefersReducedMotion } from '@/lib/motion-config';

export interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  perspective?: number;
  maxAngle?: number;
  scale?: number;
  glare?: boolean;
}

/**
 * TiltCard — High performance, pointer-aware 3D card tilt with specular glare.
 * Automatically disabled on touch screens and when reduced motion is preferred.
 */
export function TiltCard({
  children,
  className,
  perspective = motionConfig.tilt.perspective,
  maxAngle = motionConfig.tilt.maxAngle,
  scale = motionConfig.tilt.scale,
  glare = true,
  style,
  ...props
}: TiltCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);
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

    cardRef.current.style.transform = `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, 1)`;
    cardRef.current.style.setProperty('--mouse-x', `${(xRatio * 100).toFixed(1)}%`);
    cardRef.current.style.setProperty('--mouse-y', `${(yRatio * 100).toFixed(1)}%`);
    cardRef.current.style.setProperty('--glare-opacity', `${motionConfig.tilt.glareMaxOpacity}`);
  };

  const handlePointerEnter = () => {
    if (prefersReducedMotion || !isPointerFine) return;
    setIsHovered(true);
    if (cardRef.current) {
      cardRef.current.style.transition = 'transform 120ms ease-out';
    }
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    if (cardRef.current) {
      cardRef.current.style.transition = `transform ${motionConfig.tilt.returnDurationMs}ms ${motionConfig.easings.springSmooth}`;
      cardRef.current.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
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
        'relative rounded-2xl border transition-colors',
        'border-line bg-card shadow-card dark:border-white/10 dark:bg-slate-900/60 dark:backdrop-blur-xl',
        isPointerFine && !prefersReducedMotion && 'preserve-3d will-change-transform',
        className
      )}
      style={{
        ...style,
      }}
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

