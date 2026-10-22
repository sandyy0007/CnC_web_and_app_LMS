'use client';

import Link from 'next/link';

import { attendanceColor } from '@/components/charts';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { BandBadge, StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/state';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { cn } from '@/lib/cn';
import { num, pct, titleCase } from '@/lib/format';

const LEGEND_TONE: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-amber',
  danger: 'bg-danger',
};

export default function HodParticipantsPage() {
  const table = useTableState('hod-participants', { pageSize: 20 });
  const query = useApi<any>('/hod/participants', table.params, {
    select: (raw) => ({
      items: raw.items,
      pagination: raw.pagination ?? {
        page: raw.page ?? 1,
        pageSize: raw.pageSize ?? 20,
        total: raw.total ?? 0,
        totalPages: raw.totalPages ?? 1,
        hasNext: raw.hasNext ?? false,
        hasPrev: raw.hasPrev ?? false,
      },
      meta: raw.meta,
    }),
  });

  const meta = query.data?.meta;

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Participant',
      sortKey: 'name',
      render: (row) => (
        <Link
          href={`/hod/participants/${row.studentUserId}`}
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
      sortKey: 'attendancePercent',
      render: (row) => (
        <span
          className="tnum font-semibold"
          style={{ color: attendanceColor(row.attendancePercent ?? 0) }}
        >
          {pct(row.attendancePercent, 1)}
        </span>
      ),
    },
    {
      key: 'band',
      header: 'Band',
      hideBelow: 'md',
      render: (row) => <BandBadge percentage={row.attendancePercent} />,
    },
    {
      key: 'score',
      header: 'Avg skill score',
      align: 'right',
      sortKey: 'averageSkillScore',
      render: (row) => (
        <span className="tnum font-semibold">{num(row.averageSkillScore, 1)}</span>
      ),
    },
    {
      key: 'enrollment',
      header: 'Enrollment',
      hideBelow: 'lg',
      render: (row) => <StatusBadge status={row.enrollmentStatus} />,
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <GlobalPageBackground
      image="/images/backgrounds/users.webp"
      variant="dark"
      orbTone="cyan"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="Participant Directory"
        description="Everyone enrolled in your department, with attendance and average skill scores." 
      />

      <div className="mb-4">
        <FilterBar
          search={table.state.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Search name or roll number…"
          filters={[
            {
              name: 'batchId',
              label: 'Batch',
              allLabel: 'All batches',
              options: (meta?.filters?.batches ?? []).map((batch: any) => ({
                value: batch.id,
                label: batch.name,
              })),
            },
            {
              name: 'enrollmentStatus',
              label: 'Enrollment',
              allLabel: 'All enrollment states',
              options: (meta?.filters?.statuses ?? []).map((status: string) => ({
                value: status,
                label: titleCase(status),
              })),
            },
          ]}
          values={table.state.filters}
          onFilterChange={table.setFilter}
          onReset={table.reset}
        />

        {meta?.legend && (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
            {meta.legend.map((entry: any) => (
              <li key={entry.label} className="flex items-center gap-1.5">
                <span
                  className={cn('size-2 rounded-full', LEGEND_TONE[entry.tone] ?? 'bg-slate-400')}
                  aria-hidden
                />
                {entry.label}
              </li>
            ))}
          </ul>
        )}
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
        rowKey={(row) => row.studentUserId}
        caption="Participants in your department"
      />
    </GlobalPageBackground>
  );
}
