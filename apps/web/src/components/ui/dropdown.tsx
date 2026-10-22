'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';

import { cn } from '@/lib/cn';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 6, align = 'end', ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        'z-[100] min-w-[14rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl backdrop-blur-2xl text-slate-900',
        'dark:border-white/15 dark:bg-slate-900/95 dark:text-white data-[state=open]:animate-fade',
        className,
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { tone?: 'danger' }
>(({ className, tone, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2.5 rounded-[8px] px-3 py-2 text-sm font-medium outline-none transition-colors',
      '[&_svg]:size-[14px] [&_svg]:text-slate-500 dark:[&_svg]:text-slate-400',
      'data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 data-[highlighted]:[&_svg]:text-slate-900',
      'dark:data-[highlighted]:bg-white/10 dark:data-[highlighted]:text-white dark:data-[highlighted]:[&_svg]:text-white',
      tone === 'danger'
        ? 'text-rose-600 dark:text-rose-400 data-[highlighted]:bg-rose-500/15 data-[highlighted]:text-rose-700 dark:data-[highlighted]:text-rose-300 [&_svg]:text-rose-600 dark:[&_svg]:text-rose-400'
        : 'text-slate-700 dark:text-slate-200',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300', className)} {...props} />;
}

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Separator
    ref={ref}
    className={cn('my-1 h-px bg-slate-200 dark:bg-white/10', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';
