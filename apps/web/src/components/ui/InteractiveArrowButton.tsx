'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/lib/cn';

export interface InteractiveArrowButtonProps {
  children?: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'gradient' | 'glass' | 'primary' | 'secondary' | 'ghost' | 'light' | 'dark' | 'link';
  size?: 'sm' | 'md' | 'lg';
  icon?: 'right' | 'up-right';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  target?: string;
  rel?: string;
}

const variantStyles: Record<string, string> = {
  gradient:
    'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 border border-white/20 hover:brightness-105',
  glass:
    'backdrop-blur-md bg-white/15 hover:bg-white/25 text-white border border-white/25 shadow-md hover:border-white/40',
  light:
    'bg-white/95 text-slate-900 border border-slate-200/90 hover:bg-white shadow-md hover:shadow-lg',
  dark:
    'bg-slate-900/90 text-white border border-white/20 hover:bg-slate-800 shadow-lg',
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md border border-indigo-500',
  secondary:
    'bg-slate-800/90 text-white border border-white/15 hover:bg-slate-700/90 hover:border-white/25 shadow-xs',
  ghost:
    'text-slate-200 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15',
  link:
    'text-indigo-400 hover:text-indigo-300 p-0 shadow-none border-none hover:bg-transparent',
};

const sizeStyles: Record<string, string> = {
  sm: 'h-9 px-3.5 text-xs gap-2.5',
  md: 'h-11 px-5 text-sm gap-3.5',
  lg: 'h-13 px-6 text-base gap-4',
};

const bubbleSizeStyles: Record<string, string> = {
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-10',
};

const bubbleVariantStyles: Record<string, string> = {
  gradient:
    'bg-white/25 border-white/40 text-white group-hover:bg-white/40 group-hover:border-white/70 shadow-inner',
  glass:
    'bg-white/25 border-white/35 text-white group-hover:bg-white/40 group-hover:border-white/60 shadow-sm',
  light:
    'bg-slate-900/15 border-slate-900/20 text-slate-900 group-hover:bg-slate-900/25 group-hover:border-slate-900/40 shadow-sm',
  dark:
    'bg-white/20 border-white/30 text-white group-hover:bg-white/35 group-hover:border-white/50 shadow-inner',
  primary:
    'bg-white/25 border-white/40 text-white group-hover:bg-white/40 group-hover:border-white/60 shadow-inner',
  secondary:
    'bg-slate-900/15 border-slate-900/20 text-slate-900 dark:bg-white/20 dark:border-white/30 dark:text-white group-hover:bg-slate-900/25 dark:group-hover:bg-white/35 shadow-sm',
  ghost:
    'bg-white/20 border-white/25 text-white group-hover:bg-white/30',
  link:
    'bg-indigo-500/25 border-indigo-500/35 text-indigo-400 group-hover:bg-indigo-500/35 shadow-sm',
};

const iconSizeStyles: Record<string, string> = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-5',
};

/**
 * InteractiveArrowButton — Premium interactive action button/link featuring
 * an explicitly visible circular bubble that smoothly expands and glows on hover
 * while the arrow glyph glides forward.
 */
export function InteractiveArrowButton({
  children,
  href,
  onClick,
  variant = 'gradient',
  size = 'md',
  icon = 'right',
  className,
  disabled = false,
  type = 'button',
  ariaLabel,
  target,
  rel,
}: InteractiveArrowButtonProps) {
  const IconComponent = icon === 'up-right' ? ArrowUpRight : ArrowRight;

  const content = (
    <>
      {children && <span className="font-semibold tracking-wide">{children}</span>}
      <span
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-out',
          'group-hover:scale-115 group-hover:shadow-md ring-1 ring-white/20',
          bubbleSizeStyles[size],
          bubbleVariantStyles[variant],
        )}
        aria-hidden
      >
        <IconComponent
          className={cn(
            'transition-transform duration-300 ease-out group-hover:translate-x-1',
            iconSizeStyles[size],
          )}
          aria-hidden
        />
      </span>
    </>
  );

  const baseClasses = cn(
    'group relative inline-flex items-center justify-center rounded-2xl font-medium select-none cursor-pointer',
    'transition-all duration-200 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
    variantStyles[variant],
    sizeStyles[size],
    disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={baseClasses}
        aria-label={ariaLabel}
        onClick={onClick}
        target={target}
        rel={target === '_blank' ? rel || 'noopener noreferrer' : rel}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
