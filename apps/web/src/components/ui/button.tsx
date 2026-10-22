'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold ' +
    'transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-md hover:shadow-glow border border-indigo-400/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]',
        gradient:
          'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-glow hover:shadow-lg hover:brightness-105 border border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.3)]',
        glass:
          'backdrop-blur-xl bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/20 text-slate-900 dark:text-white border border-slate-200/60 dark:border-white/20 shadow-xs',
        secondary:
          'bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-white/14 backdrop-blur-md shadow-xs hover:border-slate-300 dark:hover:border-white/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]',
        ghost:
          'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white',
        danger:
          'bg-rose-600 text-white hover:bg-rose-500 border border-rose-500/40 hover:shadow-sm shadow-xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)]',
        subtle:
          'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25',
        dark:
          'bg-slate-950 text-white hover:bg-slate-900 border border-white/15 hover:shadow-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]',
        link:
          'text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline underline-offset-4 p-0 h-auto active:scale-100',
      },
      size: {
        sm: 'h-8 px-[11px] text-sm [&_svg]:size-[13px]',
        md: 'h-9 px-[15px] text-base [&_svg]:size-[14px]',
        lg: 'h-11 px-5 text-md [&_svg]:size-4',
        icon: 'h-[34px] w-[34px] [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Component>
    );
  },
);
Button.displayName = 'Button';
export { buttonVariants };
