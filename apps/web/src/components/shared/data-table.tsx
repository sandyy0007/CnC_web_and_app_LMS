'use client';

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import type { Pagination as PageInfo } from '@/lib/api';
import { cn } from '@/lib/cn';
import { num } from '@/lib/format';

import { EmptyState, LoadingSkeleton } from './state';

export interface Column<T> {
  key: string;
  header: string;
  /** Field name the API sorts by; omit for a non-sortable column. */
  sortKey?: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render: (row: T) => React.ReactNode;
  /** Hide below the given breakpoint so narrow screens stay readable (§25). */
  hideBelow?: 'sm' | 'md' | 'lg';
}

const HIDE: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

export function DataTable<T extends { id?: string } | Record<string, any>>({
  columns,
  rows,
  loading,
  pagination,
  onPageChange,
  sortBy,
  sortDir,
  onSort,
  empty,
  caption,
  rowKey,
  onRowClick,
  footer,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  pagination?: PageInfo;
  onPageChange?: (page: number) => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  empty?: React.ReactNode;
  caption?: string;
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  footer?: React.ReactNode;
  className?: string;
}) {
  if (loading) return <LoadingSkeleton variant="table" />;
  if (!rows.length) {
    return <Card className={className}>{empty ?? <EmptyState title="No records found" />}</Card>;
  }

  return (
    <div className={className}>
      <TableWrap>
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <Tr>
              {columns.map((column) => {
                const sortable = Boolean(column.sortKey && onSort);
                const isSorted = column.sortKey && sortBy === column.sortKey;
                return (
                  <Th
                    key={column.key}
                    align={column.align}
                    style={column.width ? { width: column.width } : undefined}
                    className={column.hideBelow ? HIDE[column.hideBelow] : undefined}
                    aria-sort={
                      isSorted ? (sortDir === 'desc' ? 'descending' : 'ascending') : undefined
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort!(column.sortKey!)}
                        className="inline-flex items-center gap-1 uppercase hover:text-ink-1"
                      >
                        {column.header}
                        {isSorted ? (
                          sortDir === 'desc' ? (
                            <ChevronDown className="size-3" aria-hidden />
                          ) : (
                            <ChevronUp className="size-3" aria-hidden />
                          )
                        ) : (
                          <ChevronDown className="size-3 opacity-25" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </Th>
                );
              })}
            </Tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <Tr
                key={rowKey?.(row, index) ?? (row as any).id ?? index}
                className={cn(onRowClick && 'cursor-pointer hover:bg-app')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <Td
                    key={column.key}
                    align={column.align}
                    className={column.hideBelow ? HIDE[column.hideBelow] : undefined}
                  >
                    {column.render(row)}
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      {footer}

      {pagination && pagination.totalPages > 1 && (
        <Pagination info={pagination} onPageChange={onPageChange} />
      )}
    </div>
  );
}

export function Pagination({
  info,
  onPageChange,
  label = 'records',
}: {
  info: PageInfo;
  onPageChange?: (page: number) => void;
  label?: string;
}) {
  const from = (info.page - 1) * info.pageSize + 1;
  const to = Math.min(info.total, info.page * info.pageSize);
  const windowSize = 3;
  const start = Math.max(1, Math.min(info.page - 1, info.totalPages - windowSize + 1));
  const pages = Array.from(
    { length: Math.min(windowSize, info.totalPages) },
    (_, index) => start + index,
  );

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1"
    >
      <p className="text-sm text-ink-2">
        Showing {num(from)}–{num(to)} of {num(info.total)} {label}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Previous page"
          disabled={!info.hasPrev}
          onClick={() => onPageChange?.(info.page - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        {pages.map((page) => (
          <Button
            key={page}
            size="icon"
            variant={page === info.page ? 'primary' : 'secondary'}
            aria-label={`Page ${page}`}
            aria-current={page === info.page ? 'page' : undefined}
            onClick={() => onPageChange?.(page)}
          >
            {page}
          </Button>
        ))}
        <Button
          variant="secondary"
          size="icon"
          aria-label="Next page"
          disabled={!info.hasNext}
          onClick={() => onPageChange?.(info.page + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
