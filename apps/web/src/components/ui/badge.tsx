import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-[5px] rounded-full px-[9px] py-1 text-xs font-semibold',
  {
    variants: {
      tone: {
        success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
        danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
        info: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
        purple: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
        amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
        teal: 'bg-teal-500/15 text-teal-300 border border-teal-500/30',
        neutral: 'bg-white/10 text-slate-200 border border-white/15',
        indigo: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
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
