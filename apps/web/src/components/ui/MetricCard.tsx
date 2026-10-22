'use client';

import * as React from 'react';
import { AnimatedCounter } from '@/components/ui/counter';
import { cn } from '@/lib/cn';

export interface MetricCardProps {
  label: string;
  value: number | string;
  subValue?: string;
  icon?: React.ReactNode;
  tone?: 'indigo' | 'cyan' | 'purple' | 'amber' | 'emerald' | 'rose';
  delta?: { value: string; positive: boolean };
  hint?: string;
  className?: string;
}

const toneGradients: Record<string, { bg: string; iconBg: string; text: string }> = {
  indigo: {
    bg: 'from-indigo-600/10 via-indigo-600/5 to-transparent border-indigo-500/20',
    iconBg: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-400 border border-indigo-500/30',
    text: 'text-indigo-700 dark:text-indigo-400',
  },
  cyan: {
    bg: 'from-cyan-600/10 via-cyan-600/5 to-transparent border-cyan-500/20',
    iconBg: 'bg-cyan-500/15 text-cyan-700 dark:bg-cyan-600/20 dark:text-cyan-400 border border-cyan-500/30',
    text: 'text-cyan-700 dark:text-cyan-400',
  },
  purple: {
    bg: 'from-purple-600/10 via-purple-600/5 to-transparent border-purple-500/20',
    iconBg: 'bg-purple-500/15 text-purple-700 dark:bg-purple-600/20 dark:text-purple-400 border border-purple-500/30',
    text: 'text-purple-700 dark:text-purple-400',
  },
  amber: {
    bg: 'from-amber-600/10 via-amber-600/5 to-transparent border-amber-500/20',
    iconBg: 'bg-amber-500/15 text-amber-700 dark:bg-amber-600/20 dark:text-amber-400 border border-amber-500/30',
    text: 'text-amber-700 dark:text-amber-400',
  },
  emerald: {
    bg: 'from-emerald-600/10 via-emerald-600/5 to-transparent border-emerald-500/20',
    iconBg: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-400 border border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  rose: {
    bg: 'from-rose-600/10 via-rose-600/5 to-transparent border-rose-500/20',
    iconBg: 'bg-rose-500/15 text-rose-700 dark:bg-rose-600/20 dark:text-rose-400 border border-rose-500/30',
    text: 'text-rose-700 dark:text-rose-400',
  },
};

/**
 * MetricCard — Colorful, modern KPI card with gradient backing, animated icon badge,
 * and optional trend delta for executive dashboards.
 */
export function MetricCard({
  label,
  value,
  subValue,
  icon,
  tone = 'indigo',
  delta,
  hint,
  className,
}: MetricCardProps) {
  const styles = toneGradients[tone] || toneGradients.indigo;
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  const isNumeric = !isNaN(numericValue) && !String(value).includes(' ');

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-line bg-card shadow-card p-5',
        'backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg',
        'dark:border-white/10 dark:bg-slate-900/80',
        styles.bg,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-ink-3 uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <span className={cn('flex size-9 items-center justify-center rounded-xl', styles.iconBg)}>
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-bold text-2xl sm:text-3xl text-ink-1 tracking-tight">
          {isNumeric ? <AnimatedCounter value={numericValue} /> : value}
        </span>
        {subValue && (
          <span className="text-xs text-ink-3 font-medium">
            {subValue}
          </span>
        )}
      </div>

      {(delta || hint) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs border-t border-line pt-2.5">
          {delta && (
            <span
              className={cn(
                'font-semibold inline-flex items-center gap-1',
                delta.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {delta.positive ? '↑' : '↓'} {delta.value}
            </span>
          )}
          {hint && (
            <span className="text-[11px] text-ink-3 truncate">
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

