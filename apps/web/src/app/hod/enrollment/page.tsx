'use client';

import { ArrowRightLeft, History, Info } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/state';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { ApiError, api } from '@/lib/api';
import { formatDate, num, pct, titleCase } from '@/lib/format';

export default function HodEnrollmentPage() {
  const table = useTableState('hod-enrollments', { pageSize: 20 });
  const query = useApi<any>('/hod/enrollments', table.params, {
    select: (raw) => ({
      items: raw.items,
      pagination: raw.pagination,
      summary: raw.data,
      allowedTransitions: raw.allowedTransitions ?? raw.data?.allowedTransitions ?? {},
    }),
  });

  const [moving, setMoving] = React.useState<any>(null);
  const [target, setTarget] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const transitions: string[] = moving
    ? (query.data?.allowedTransitions?.[moving.status] ?? [])
    : [];

  async function changeStatus(reason: string) {
    if (!target) {
      toast.error('Choose the new status first.');
      return;
    }
    setPending(true);
    try {
      const response = await api.patch(`/hod/enrollments/${moving.id}/status`, {
        status: target,
        reason,
        expectedVersion: moving.version,
      });
      toast.success(response.message ?? 'Enrollment updated');
      setMoving(null);
      setTarget('');
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  const summary = query.data?.summary;

  const columns: Column<any>[] = [
    {
      key: 'student',
      header: 'Participant',
      render: (row) => (
        <Link href={`/hod/participants/${row.studentUserId}`} className="hover:text-indigo-600">
          <span className="block font-semibold">{row.studentName}</span>
          <span className="block text-xs text-ink-3">{row.rollNumber}</span>
        </Link>
      ),
    },
    { key: 'batch', header: 'Batch', hideBelow: 'sm', render: (row) => row.batchName },
    {
      key: 'type',
      header: 'Type',
      hideBelow: 'md',
      render: (row) => <span className="text-ink-2">{titleCase(row.enrollmentType)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'enrolledBy',
      header: 'Enrolled by',
      hideBelow: 'lg',
      render: (row) => <span className="text-ink-2">{row.enrolledByLabel ?? '—'}</span>,
    },
    {
      key: 'enrolledAt',
      header: 'Enrolled',
      align: 'right',
      render: (row) => <span className="tnum text-sm">{formatDate(row.enrolledAt)}</span>,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => {
        const allowed: string[] = query.data?.allowedTransitions?.[row.status] ?? [];
        return allowed.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMoving(row);
              setTarget('');
            }}
          >
            <ArrowRightLeft className="size-3.5" aria-hidden />
            Change
          </Button>
        ) : (
          <span className="text-sm text-ink-3">Final</span>
        );
      },
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <>
      <PageHeader
        title="Enrollment"
        description="Status changes append a new history row — the previous record is never overwritten."
      />

      {summary?.counts && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['active', 'Active', 'success'],
            ['on_hold', 'On hold', 'amber'],
            ['completed', 'Completed', 'info'],
            ['transferred', 'Transferred', 'purple'],
            ['dropped', 'Dropped', 'danger'],
          ].map(([key, label, tone]) => (
            <StatCard
              key={key}
              label={label as string}
              value={num(summary.counts[key as string] ?? 0)}
              tone={tone as any}
              deltaLabel={
                key === 'active' && summary.activePercentOfRoster != null
                  ? `${pct(summary.activePercentOfRoster, 1)} of the roster`
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {summary?.note && (
        <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-info-bg px-3.5 py-2.5 text-sm text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {summary.note}
        </p>
      )}

      <div className="mt-5">
        <FilterBar
          search={table.state.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Search name or roll number…"
          filters={[
            {
              name: 'status',
              label: 'Status',
              allLabel: 'All statuses',
              options: Object.keys(query.data?.allowedTransitions ?? {}).map((status) => ({
                value: status,
                label: titleCase(status),
              })),
            },
          ]}
          values={table.state.filters}
          onFilterChange={table.setFilter}
          onReset={table.reset}
        />

        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          loading={query.initialLoading}
          pagination={query.data?.pagination}
          onPageChange={table.setPage}
          rowKey={(row) => row.id}
          caption="Enrollment records for your department"
        />
      </div>

      {summary?.recentEvents?.length > 0 && (
        <Card className="mt-5">
          <CardHeader>
            <div>
              <CardTitle>Recent status changes</CardTitle>
              <CardSubtitle>{summary.note ?? 'Full history preserved'}</CardSubtitle>
            </div>
            <History className="size-4 text-ink-3" aria-hidden />
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-line-soft">
              {summary.recentEvents.map((event: any) => (
                <li key={event.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-base">
                      <span className="font-semibold">
                        {event.fromStatus ? titleCase(event.fromStatus) : 'New'}
                      </span>{' '}
                      → <span className="font-semibold">{titleCase(event.toStatus)}</span>
                      {event.reason ? ` — ${event.reason}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {event.actorLabel} · {formatDate(event.at, true)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(moving)}
        onOpenChange={(open) => {
          if (!open) {
            setMoving(null);
            setTarget('');
          }
        }}
        title={`Change enrollment for ${moving?.studentName ?? ''}`}
        description={`Currently ${titleCase(moving?.status ?? '')}. A transfer or hold opens a new record and keeps this one — nothing is deleted.`}
        confirmLabel="Save change"
        requireReason
        reasonLabel="Reason for the change"
        pending={pending}
        onConfirm={changeStatus}
      >
        <div className="mb-4">
          <label htmlFor="new-status" className="mb-1.5 block text-sm font-semibold">
            New status
          </label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="new-status">
              <SelectValue placeholder="Select the new status" />
            </SelectTrigger>
            <SelectContent>
              {transitions.map((status) => (
                <SelectItem key={status} value={status}>
                  {titleCase(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {transitions.length === 0 && (
            <p className="mt-1.5 text-sm text-ink-3">
              This status is final — no further transition is permitted.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
