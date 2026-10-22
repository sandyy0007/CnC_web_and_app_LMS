import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-[5px] rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md shadow-xs transition-all duration-200',
  {
    variants: {
      tone: {
        success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-[inset_0_1px_0_0_rgba(16,185,129,0.2)]',
        danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 shadow-[inset_0_1px_0_0_rgba(244,63,94,0.2)]',
        info: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 shadow-[inset_0_1px_0_0_rgba(59,130,246,0.2)]',
        purple: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 shadow-[inset_0_1px_0_0_rgba(168,85,247,0.2)]',
        amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 shadow-[inset_0_1px_0_0_rgba(245,158,11,0.2)]',
        teal: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30 shadow-[inset_0_1px_0_0_rgba(20,184,166,0.2)]',
        neutral: 'bg-slate-200/80 text-slate-800 border border-slate-300 dark:bg-white/10 dark:text-slate-200 dark:border-white/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)]',
        indigo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shadow-[inset_0_1px_0_0_rgba(99,102,241,0.2)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({ className, tone, dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), 'transition-colors', className)} {...props}>
      {dot && (
        <span className="relative flex size-[6px] items-center justify-center" aria-hidden>
          {pulse && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
          )}
          <span className="relative inline-flex size-[6px] rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
