'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { motionConfig, useIsPointerFine, usePrefersReducedMotion } from '@/lib/motion-config';

export interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  pullDistance?: number; // max displacement in px (default 5)
  variant?: 'primary' | 'secondary' | 'glass' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * MagneticButton — Tactile interactive button that gently pulls toward the cursor on hover.
 */
export function MagneticButton({
  children,
  className,
  pullDistance = 5,
  variant = 'primary',
  size = 'md',
  style,
  ...props
}: MagneticButtonProps) {
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPointerFine = useIsPointerFine();

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion || !isPointerFine || !btnRef.current) return;

    const rect = btnRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - centerX) / (rect.width / 2);
    const deltaY = (e.clientY - centerY) / (rect.height / 2);

    const pullX = (deltaX * pullDistance).toFixed(1);
    const pullY = (deltaY * pullDistance).toFixed(1);

    btnRef.current.style.transform = `translate3d(${pullX}px, ${pullY}px, 0)`;
  };

  const handlePointerLeave = () => {
    if (btnRef.current) {
      btnRef.current.style.transition = `transform ${motionConfig.durations.normal}ms ${motionConfig.easings.springSmooth}`;
      btnRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  };

  const handlePointerEnter = () => {
    if (btnRef.current) {
      btnRef.current.style.transition = 'transform 100ms ease-out';
    }
  };

  const variantClasses = {
    primary: 'bg-indigo hover:bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/30',
    secondary: 'bg-white/10 hover:bg-white/15 text-white border border-white/20 shadow-sm backdrop-blur-md',
    glass: 'bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/15 backdrop-blur-lg',
    ghost: 'bg-transparent hover:bg-white/[0.08] text-white/90 border border-transparent',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-lg font-medium gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl font-semibold gap-2',
    lg: 'px-6 py-3 text-base rounded-xl font-bold gap-2.5',
  };

  return (
    <button
      ref={btnRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'inline-flex items-center justify-center transition-all cursor-pointer magnetic-press select-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}

