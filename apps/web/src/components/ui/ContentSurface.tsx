'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface ContentSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'card' | 'elevated' | 'subtle';
  tone?: 'default' | 'indigo' | 'cyan' | 'purple';
  hover?: boolean;
  children: React.ReactNode;
}

/**
 * ContentSurface — Semi-transparent content surface container.
 * Keeps background imagery visible through the page while protecting content contrast.
 */
export function ContentSurface({
  variant = 'glass',
  tone = 'default',
  hover = false,
  className,
  children,
  ...props
}: ContentSurfaceProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-300',
        variant === 'glass' &&
          'bg-slate-900/70 border-white/15 text-slate-100 shadow-xl shadow-slate-950/20',
        variant === 'card' &&
          'bg-slate-900/75 border-white/12 text-slate-100 shadow-xl shadow-slate-950/20',
        variant === 'elevated' &&
          'bg-slate-900/85 border-white/20 text-white shadow-2xl',
        variant === 'subtle' &&
          'bg-slate-950/40 border-white/10 text-slate-200',
        tone === 'indigo' && 'border-indigo-500/30 bg-indigo-950/40 shadow-indigo-950/30',
        tone === 'cyan' && 'border-cyan-500/30 bg-cyan-950/40 shadow-cyan-950/30',
        tone === 'purple' && 'border-purple-500/30 bg-purple-950/40 shadow-purple-950/30',
        hover && 'hover:scale-[1.01] hover:border-white/30 hover:shadow-2xl cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

