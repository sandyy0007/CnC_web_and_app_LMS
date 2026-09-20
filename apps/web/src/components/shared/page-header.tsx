import Link from 'next/link';
import * as React from 'react';

import { cn } from '@/lib/cn';

export function Breadcrumbs({
  items,
  className,
}: {
  items: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('mb-3 text-sm text-ink-2', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden className="text-ink-3">
                /
              </span>
            )}
            {item.href && index < items.length - 1 ? (
              <Link href={item.href} className="text-indigo-400 hover:text-indigo-300 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={index === items.length - 1 ? 'font-semibold text-ink-1' : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6', className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      {eyebrow}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[25px] font-bold tracking-[-0.015em] text-ink-1 leading-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[13.5px] sm:text-[14px] text-ink-2 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </header>
  );
}
