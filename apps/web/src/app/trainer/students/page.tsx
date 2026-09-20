'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

import { attendanceColor } from '@/components/charts';
import { DataTable, type Column } from '@/components/shared/data-table';
import { SearchInput } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, Switch } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { num, pct } from '@/lib/format';

export default function TrainerStudentsPage() {
  const table = useTableState('trainer-students', { pageSize: 25 });
  const batches = useApi<any[]>('/trainer/batches');
  const query = useApi<any>('/trainer/students', table.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Participant',
      sortKey: 'name',
      render: (row) => (
        <Link
          href={`/trainer/students/${row.userId}`}
          className="flex items-center gap-2.5 hover:text-indigo-600"
        >
          <Avatar name={row.name} color={row.avatarColor} size={28} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{row.name}</span>
            <span className="block text-xs text-ink-3">{row.rollNumber}</span>
          </span>
        </Link>
      ),
    },
    {
      key: 'batch',
      header: 'Batch',
      hideBelow: 'sm',
      render: (row) => row.batchName ?? '—',
    },
    {
      key: 'attendance',
      header: 'Attendance',
      align: 'right',
      render: (row) => (
        <span
          className="tnum font-semibold"
          style={{ color: attendanceColor(row.attendancePercent ?? 0) }}
        >
          {pct(row.attendancePercent, 0)}
        </span>
      ),
    },
    {
      key: 'readiness',
      header: 'Readiness',
      align: 'right',
      sortKey: 'readinessScore',
      render: (row) => (
        <span className="tnum font-semibold">
          {num(row.readinessScore, 1)}
          {row.weak && (
            <AlertTriangle className="ml-1.5 inline size-3.5 text-amber" aria-label="Weak" />
          )}
        </span>
      ),
    },
    {
      key: 'focus',
      header: 'Focus pillar',
      hideBelow: 'md',
      render: (row) =>
        row.focusPillar ? (
          <Badge tone="amber">{row.focusPillar}</Badge>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <>
      <PageHeader
        title="Participants"
        description="Everyone in your assigned batches, with the attendance and readiness you can act on."
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <SearchInput
          value={table.state.search}
          onChange={table.setSearch}
          placeholder="Search by name or roll number…"
          className="w-full sm:w-[300px]"
        />
        <div className="w-full sm:w-[220px]">
          <label htmlFor="batch" className="mb-1.5 block text-sm font-semibold">
            Batch
          </label>
          <Select
            value={table.state.filters.batchId ?? 'all'}
            onValueChange={(value) => table.setFilter('batchId', value)}
          >
            <SelectTrigger id="batch">
              <SelectValue placeholder="All my batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my batches</SelectItem>
              {(batches.data ?? []).map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2.5 pb-2 text-base">
          <Switch
            checked={table.state.filters.weakOnly === 'true'}
            onCheckedChange={(value) => table.setFilter('weakOnly', value ? 'true' : '')}
          />
          Only participants needing attention
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        loading={query.initialLoading}
        pagination={query.data?.pagination}
        onPageChange={table.setPage}
        sortBy={table.state.sortBy}
        sortDir={table.state.sortDir}
        onSort={table.toggleSort}
        rowKey={(row) => row.id}
        caption="Participants in your assigned batches"
      />
    </>
  );
}
