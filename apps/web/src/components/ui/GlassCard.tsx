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
    'bg-white/10 dark:bg-slate-900/40 border-white/20 text-white shadow-xl',
  indigo:
    'bg-indigo-950/30 border-indigo-500/30 text-white shadow-indigo-950/20 shadow-xl',
  cyan:
    'bg-cyan-950/30 border-cyan-500/30 text-white shadow-cyan-950/20 shadow-xl',
  purple:
    'bg-purple-950/30 border-purple-500/30 text-white shadow-purple-950/20 shadow-xl',
  amber:
    'bg-amber-950/30 border-amber-500/30 text-white shadow-amber-950/20 shadow-xl',
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

