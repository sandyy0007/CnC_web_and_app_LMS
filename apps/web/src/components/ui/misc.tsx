'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

// ------------------------------------------------------------------ switch
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[19px] w-[34px] shrink-0 cursor-pointer items-center rounded-full',
      'border-2 border-transparent transition-colors data-[state=checked]:bg-indigo',
      'data-[state=unchecked]:bg-line disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-[15px] rounded-full bg-white shadow-sm ring-0',
        'transition-transform data-[state=checked]:translate-x-[15px]',
        'data-[state=unchecked]:translate-x-0',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

// ------------------------------------------------------------------ checkbox
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer size-[17px] shrink-0 rounded-[5px] border border-white/20 bg-slate-900/80',
      'data-[state=checked]:border-indigo-600 data-[state=checked]:bg-indigo-600',
      'data-[state=checked]:text-white disabled:opacity-50 transition-colors',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      <Check className="size-3" strokeWidth={3} aria-hidden />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

// ------------------------------------------------------------------ progress
export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    value?: number | null;
    barClassName?: string;
    thin?: boolean;
  }
>(({ className, value, barClassName, thin, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    value={value ?? 0}
    className={cn(
      'relative w-full overflow-hidden rounded-full bg-line-soft',
      thin ? 'h-1.5' : 'h-[7px]',
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn('h-full rounded-full bg-indigo transition-transform duration-700 ease-out', barClassName)}
      style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value ?? 0))}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';

// ------------------------------------------------------------------ avatar
export function Avatar({
  name,
  color,
  size = 28,
  className,
  src,
}: {
  name?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
  src?: string | null;
}) {
  const label = (name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <AvatarPrimitive.Root
      className={cn('inline-flex shrink-0 select-none overflow-hidden rounded-full', className)}
      style={{ width: size, height: size }}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name ?? ''} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className="flex size-full items-center justify-center font-bold text-white"
        style={{
          background: color || 'var(--indigo)',
          fontSize: Math.max(9, Math.round(size * 0.38)),
        }}
      >
        {label}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

// ------------------------------------------------------------------ separator
export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-line-soft',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

// ------------------------------------------------------------------ tooltip
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  children,
  content,
  side = 'top',
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[150] max-w-xs rounded-[8px] border border-white/15 bg-slate-900/95 px-2.5 py-1.5 text-xs font-medium text-white shadow-2xl backdrop-blur-md"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-slate-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
