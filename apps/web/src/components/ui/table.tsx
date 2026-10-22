import * as React from 'react';

import { cn } from '@/lib/cn';

/** A table that scrolls horizontally rather than breaking the page layout (§25). */
export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'table-scroll scroll-thin surface-3d rounded-2xl border border-line bg-card/95 backdrop-blur-xl overflow-hidden',
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-base', className)} {...props} />;
}

/** Columns that may be dropped on narrow screens rather than squeezing the whole table. */
const HIDE_BELOW: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

export function Th({
  className,
  align = 'left',
  hideBelow,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line bg-slate-100/90 dark:bg-slate-800/80 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 backdrop-blur-md',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        hideBelow && HIDE_BELOW[hideBelow],
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  align = 'left',
  hideBelow,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <td
      className={cn(
        'border-b border-line/60 px-4 py-3.5 align-middle text-[13.5px] sm:text-[14px] text-ink-1',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        hideBelow && HIDE_BELOW[hideBelow],
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'transition-colors duration-150 hover:bg-slate-500/[0.04] dark:hover:bg-white/[0.05] last:[&>td]:border-b-0',
        className,
      )}
      {...props}
    />
  );
}
