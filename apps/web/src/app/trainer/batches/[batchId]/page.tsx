'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { attendanceColor } from '@/components/charts';
import { DataTable, type Column } from '@/components/shared/data-table';
import { SearchInput } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { num, pct } from '@/lib/format';

export default function TrainerBatchRosterPage() {
  const params = useParams<{ batchId: string }>();
  const table = useTableState(`trainer-batch-${params.batchId}`, { pageSize: 25 });
  const query = useApi<any>(`/trainer/batches/${params.batchId}/students`, table.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Participant',
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
      key: 'attendance',
      header: 'Attendance',
      align: 'right',
      render: (row) => (
        <span
          className="tnum font-semibold"
          style={{ color: attendanceColor(row.attendancePercent ?? 0) }}
        >
          {pct(row.attendancePercent, 0)}
          <span className="ml-1 text-xs font-normal text-ink-3">
            ({row.sessionsAttended ?? 0}/{row.sessionsTotal ?? 0})
          </span>
        </span>
      ),
    },
    {
      key: 'readiness',
      header: 'Readiness',
      align: 'right',
      render: (row) => <span className="tnum font-semibold">{num(row.readinessScore, 1)}</span>,
    },
    {
      key: 'focus',
      header: 'Focus pillar',
      hideBelow: 'md',
      render: (row) =>
        row.focusPillar ? <Badge tone="amber">{row.focusPillar}</Badge> : <span className="text-ink-3">—</span>,
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'My Batches', href: '/trainer/batches' }, { label: 'Roster' }]}
        title="Batch roster"
        description="Attendance and readiness for every participant in this batch."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/trainer/batches">
              <ArrowLeft className="size-3.5" aria-hidden />
              All batches
            </Link>
          </Button>
        }
      />

      <SearchInput
        value={table.state.search}
        onChange={table.setSearch}
        placeholder="Search by name or roll number…"
        className="mb-4 w-full sm:w-[320px]"
      />

      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        loading={query.initialLoading}
        pagination={query.data?.pagination}
        onPageChange={table.setPage}
        rowKey={(row) => row.id}
        caption="Participants in this batch with attendance and readiness"
      />
    </>
  );
}
