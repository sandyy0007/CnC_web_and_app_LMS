'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] font-semibold ' +
    'transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 disabled:active:scale-100 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-glow border border-indigo-400/30 active:scale-[0.98]',
        gradient:
          'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-glow hover:shadow-lg hover:brightness-105 border border-white/20',
        glass:
          'backdrop-blur-md bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-xs',
        secondary:
          'bg-slate-800/80 hover:bg-slate-700/80 text-white border border-white/14 backdrop-blur-md shadow-xs hover:border-white/25',
        ghost: 'text-slate-300 hover:bg-white/10 hover:text-white',
        danger:
          'bg-rose-600 text-white hover:bg-rose-500 border border-rose-500/40 hover:shadow-sm shadow-xs',
        subtle:
          'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25',
        dark:
          'bg-slate-950/80 text-white hover:bg-slate-900 border border-white/15 hover:shadow-sm',
        link:
          'text-indigo-400 hover:text-indigo-300 hover:underline underline-offset-4 p-0 h-auto active:scale-100',
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
