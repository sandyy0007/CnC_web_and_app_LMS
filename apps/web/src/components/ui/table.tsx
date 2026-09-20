import * as React from 'react';

import { cn } from '@/lib/cn';

/** A table that scrolls horizontally rather than breaking the page layout (§25). */
export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('table-scroll scroll-thin rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-md', className)} {...props} />;
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
        'border-b border-white/10 bg-slate-900/60 px-3 pb-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-300',
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
        'border-b border-white/10 px-3 py-3 align-middle text-[13.5px] sm:text-[14px] text-slate-100',
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
        'transition-colors duration-150 hover:bg-white/[0.04] last:[&>td]:border-b-0',
        className,
      )}
      {...props}
    />
  );
}
