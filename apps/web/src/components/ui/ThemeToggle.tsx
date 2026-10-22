'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { cn } from '@/lib/cn';

export interface ThemeToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'icon' | 'pill' | 'menu-item';
}

export function ThemeToggle({ variant = 'icon', className, ...props }: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-full p-1 border transition-colors',
          'border-slate-300 bg-slate-100 text-slate-700 dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-300',
          className,
        )}
      >
        <button
          type="button"
          onClick={() => toggleTheme()}
          aria-pressed={!isDark}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all',
            !isDark
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
              : 'text-slate-400 hover:text-white',
          )}
        >
          <Sun className="size-3.5 text-amber-500" aria-hidden />
          <span>Light</span>
        </button>
        <button
          type="button"
          onClick={() => toggleTheme()}
          aria-pressed={isDark}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all',
            isDark
              ? 'bg-slate-800 text-indigo-300 shadow-sm border border-white/10'
              : 'text-slate-600 hover:text-slate-900',
          )}
        >
          <Moon className="size-3.5 text-indigo-400" aria-hidden />
          <span>Dark</span>
        </button>
      </div>
    );
  }

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          'flex w-full items-center justify-between px-3 py-2 text-sm rounded-md transition-colors',
          'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10',
          className,
        )}
        {...props}
      >
        <span className="flex items-center gap-2">
          {mounted && !isDark ? (
            <Sun className="size-4 text-amber-500" aria-hidden />
          ) : (
            <Moon className="size-4 text-indigo-400" aria-hidden />
          )}
          <span>Appearance</span>
        </span>
        <span className="text-2xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-white/10">
          {mounted ? (isDark ? 'Dark' : 'Light') : 'Theme'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={mounted ? (isDark ? 'Switch to Light theme' : 'Switch to Dark theme') : 'Toggle theme'}
      title={mounted ? (isDark ? 'Switch to Light theme' : 'Switch to Dark theme') : 'Toggle theme'}
      className={cn(
        'group relative flex size-[36px] shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 surface-3d hover:shadow-3d-hover',
        'border-slate-300/80 bg-white/95 text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        'dark:border-white/15 dark:bg-slate-900/90 dark:text-white dark:hover:bg-slate-800',
        className,
      )}
      {...props}
    >
      <span className="relative flex size-4 items-center justify-center">
        {/* Sun Icon for Light */}
        <Sun
          className={cn(
            'absolute size-4 text-amber-500 transition-all duration-300',
            mounted && !isDark
              ? 'scale-100 rotate-0 opacity-100'
              : 'scale-0 rotate-90 opacity-0 pointer-events-none',
          )}
          aria-hidden
        />
        {/* Moon Icon for Dark */}
        <Moon
          className={cn(
            'absolute size-4 text-indigo-300 transition-all duration-300',
            !mounted || isDark
              ? 'scale-100 rotate-0 opacity-100'
              : 'scale-0 -rotate-90 opacity-0 pointer-events-none',
          )}
          aria-hidden
        />
      </span>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

