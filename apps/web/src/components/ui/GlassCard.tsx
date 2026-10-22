'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'indigo' | 'cyan' | 'purple' | 'amber';
  glow?: boolean;
  hover?: boolean;
  children: React.ReactNode;
}

const toneStyles: Record<string, string> = {
  default:
    'bg-card border-line text-ink-1 shadow-card dark:bg-slate-900/40 dark:border-white/20 dark:text-white dark:shadow-xl',
  indigo:
    'bg-indigo-50/70 border-indigo-200 text-ink-1 shadow-xs dark:bg-indigo-950/30 dark:border-indigo-500/30 dark:text-white dark:shadow-indigo-950/20',
  cyan:
    'bg-cyan-50/70 border-cyan-200 text-ink-1 shadow-xs dark:bg-cyan-950/30 dark:border-cyan-500/30 dark:text-white dark:shadow-cyan-950/20',
  purple:
    'bg-purple-50/70 border-purple-200 text-ink-1 shadow-xs dark:bg-purple-950/30 dark:border-purple-500/30 dark:text-white dark:shadow-purple-950/20',
  amber:
    'bg-amber-50/70 border-amber-200 text-ink-1 shadow-xs dark:bg-amber-950/30 dark:border-amber-500/30 dark:text-white dark:shadow-amber-950/20',
};

/**
 * GlassCard — Polished translucent glassmorphic container with backdrop blur
 * and subtle light borders for modern EdTech SaaS depth.
 */
export function GlassCard({
  tone = 'default',
  glow = false,
  hover = false,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-300',
        toneStyles[tone],
        glow && 'hover:shadow-glow',
        hover && 'hover:scale-[1.01] hover:border-white/40 hover:shadow-2xl',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

