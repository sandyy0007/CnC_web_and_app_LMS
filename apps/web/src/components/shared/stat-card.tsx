import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import * as React from 'react';

import { Card } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { Tooltip } from '@/components/ui/misc';
import { cn } from '@/lib/cn';

export type StatTone = 'indigo' | 'success' | 'danger' | 'info' | 'purple' | 'teal' | 'amber';

const TONE: Record<StatTone, string> = {
  indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  danger: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  teal: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

export function StatCard({
  label,
  value,
  suffix,
  outOf,
  icon,
  tone = 'indigo',
  delta,
  deltaLabel,
  hint,
  dark,
  hasData = true,
  className,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  outOf?: number;
  icon?: React.ReactNode;
  tone?: StatTone;
  /** Positive is good by default; `deltaLabel` carries the wording. */
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
  dark?: boolean;
  hasData?: boolean;
  className?: string;
}) {
  const showDelta = delta !== undefined && delta !== null && delta !== 0;

  const renderValue = () => {
    if (!hasData) {
      return <p className="text-[17px] font-semibold text-ink-3">No data yet</p>;
    }

    const isNumeric = typeof value === 'number' || (typeof value === 'string' && /^[-+]?\d/.test(value.trim()));

    return (
      <p className="tnum text-[26px] sm:text-[28px] font-bold leading-none tracking-tight text-ink-1">
        {isNumeric ? (
          <AnimatedCounter value={value as number | string} />
        ) : (
          value
        )}
        {suffix && <span className="ml-0.5 text-[15px] font-semibold text-ink-2">{suffix}</span>}
        {outOf !== undefined && (
          <span className={cn('ml-0.5 text-[14px] font-semibold', dark ? 'text-white/60' : 'text-ink-3')}>
            /{outOf}
          </span>
        )}
      </p>
    );
  };

  return (
    <Card
      className={cn(
        'card-interactive p-5',
        dark && 'border-navy-950 bg-navy-950 text-white hover:border-white/20',
        className,
      )}
    >
      <div
        className={cn(
          'mb-2.5 flex items-center justify-between gap-1.5 text-xs',
          dark ? 'text-white/70' : 'text-ink-2',
        )}
      >
        <div className="flex items-center gap-1.5">
          {icon && (
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-[8px] border transition-transform hover:scale-105 [&_svg]:size-3.5',
                dark ? 'border-amber/30 bg-amber/20 text-amber' : TONE[tone],
              )}
              aria-hidden
            >
              {icon}
            </span>
          )}
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em]">{label}</span>
        </div>
        {hint && (
          <Tooltip content={hint}>
            <button
              type="button"
              aria-label={`About ${label}`}
              className="text-ink-3 transition-colors hover:text-ink-1"
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>

      {renderValue()}

      {(showDelta || deltaLabel) && (
        <p
          className={cn(
            'mt-2.5 flex items-center gap-1 text-[12px] font-semibold',
            showDelta
              ? delta! > 0
                ? 'text-success'
                : 'text-danger'
              : dark
                ? 'text-white/60'
                : 'text-ink-2',
          )}
        >
          {showDelta &&
            (delta! > 0 ? (
              <ArrowUp className="size-3.5" aria-hidden />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden />
            ))}
          <span>{deltaLabel ?? `${delta! > 0 ? '+' : ''}${delta}`}</span>
        </p>
      )}
    </Card>
  );
}
