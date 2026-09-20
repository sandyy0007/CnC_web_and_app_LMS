'use client';

import { CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/state';
import { Button } from '@/components/ui/button';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { formatDate } from '@/lib/format';

export default function TrainerAttendancePage() {
  const search = useSearchParams();
  const table = useTableState('trainer-sessions', { pageSize: 20 });
  const batches = useApi<any[]>('/trainer/batches');

  const batchFromUrl = search.get('batchId');
  React.useEffect(() => {
    if (batchFromUrl) table.setFilter('batchId', batchFromUrl);
    // Only on first mount with a link-supplied batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchFromUrl]);

  const query = useApi<any>('/trainer/sessions', table.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const columns: Column<any>[] = [
    {
      key: 'topic',
      header: 'Session',
      render: (row) => (
        <>
          <span className="block font-semibold">{row.topic}</span>
          <span className="block text-xs text-ink-3">
            {row.batchName} · {row.trainingModuleName}
          </span>
        </>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortKey: 'date',
      render: (row) => <span className="tnum">{formatDate(row.date, true)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'sm',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'marked',
      header: 'Attendance',
      hideBelow: 'md',
      render: (row) =>
        row.attendanceMarkedAt ? (
          <span className="text-sm text-success">
            Recorded {formatDate(row.attendanceMarkedAt)}
          </span>
        ) : (
          <span className="text-sm text-ink-3">Not recorded</span>
        ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/trainer/attendance/${row.id}`}>
            <CalendarCheck className="size-3.5" aria-hidden />
            Open
          </Link>
        </Button>
      ),
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <GlobalPageBackground
      image="/images/backgrounds/attendance.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="Attendance"
        description="Every session you run, newest first. Pick one to mark or correct its attendance."
      />

      <div className="mb-4 w-full sm:w-[260px]">
        <label htmlFor="batch-filter" className="mb-1.5 block text-sm font-semibold">
          Batch
        </label>
        <Select
          value={table.state.filters.batchId ?? 'all'}
          onValueChange={(value) => table.setFilter('batchId', value)}
        >
          <SelectTrigger id="batch-filter">
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
        caption="Training sessions you run"
      />
    </GlobalPageBackground>
  );
}
