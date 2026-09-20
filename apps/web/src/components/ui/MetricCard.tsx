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
    iconBg: 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30',
    text: 'text-indigo-400',
  },
  cyan: {
    bg: 'from-cyan-600/10 via-cyan-600/5 to-transparent border-cyan-500/20',
    iconBg: 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30',
    text: 'text-cyan-400',
  },
  purple: {
    bg: 'from-purple-600/10 via-purple-600/5 to-transparent border-purple-500/20',
    iconBg: 'bg-purple-600/20 text-purple-400 border border-purple-500/30',
    text: 'text-purple-400',
  },
  amber: {
    bg: 'from-amber-600/10 via-amber-600/5 to-transparent border-amber-500/20',
    iconBg: 'bg-amber-600/20 text-amber-400 border border-amber-500/30',
    text: 'text-amber-400',
  },
  emerald: {
    bg: 'from-emerald-600/10 via-emerald-600/5 to-transparent border-emerald-500/20',
    iconBg: 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30',
    text: 'text-emerald-400',
  },
  rose: {
    bg: 'from-rose-600/10 via-rose-600/5 to-transparent border-rose-500/20',
    iconBg: 'bg-rose-600/20 text-rose-400 border border-rose-500/30',
    text: 'text-rose-400',
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
        'relative overflow-hidden rounded-2xl border bg-gradient-to-b p-5',
        'backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg',
        'bg-slate-900/80',
        styles.bg,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <span className={cn('flex size-9 items-center justify-center rounded-xl', styles.iconBg)}>
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-bold text-2xl sm:text-3xl text-white tracking-tight">
          {isNumeric ? <AnimatedCounter value={numericValue} /> : value}
        </span>
        {subValue && (
          <span className="text-xs text-slate-400 font-medium">
            {subValue}
          </span>
        )}
      </div>

      {(delta || hint) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs border-t border-white/5 pt-2.5">
          {delta && (
            <span
              className={cn(
                'font-semibold inline-flex items-center gap-1',
                delta.positive ? 'text-emerald-400' : 'text-rose-400',
              )}
            >
              {delta.positive ? '↑' : '↓'} {delta.value}
            </span>
          )}
          {hint && (
            <span className="text-[11px] text-slate-400 truncate">
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

