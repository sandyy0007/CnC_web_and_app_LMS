'use client';

import { Award, Flag, Star } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { ApiError, api } from '@/lib/api';
import { formatDate, num, pct } from '@/lib/format';

export default function HodCertificatesPage() {
  const table = useTableState('hod-certificates', { pageSize: 20 });
  const query = useApi<any>('/hod/certificates', table.params, {
    select: (raw) => ({
      items: raw.items,
      pagination: raw.pagination,
      summary: raw.data,
      meta: raw.meta,
    }),
  });
  const feedback = useApi<any>('/hod/feedback', { pageSize: 20 }, {
    select: (raw) => ({ items: raw.items, meta: raw.meta }),
  });

  const [flagging, setFlagging] = React.useState<any>(null);
  const [pending, setPending] = React.useState(false);

  async function flag(reason: string) {
    setPending(true);
    try {
      await api.post(`/hod/certificates/${flagging.certificateId}/flag`, { reason });
      toast.success('Flagged for administrator review');
      setFlagging(null);
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
      key: 'name',
      header: 'Participant',
      render: (row) => (
        <Link href={`/hod/participants/${row.studentUserId}`} className="hover:text-indigo-600">
          <span className="block font-semibold">{row.name}</span>
          <span className="block text-xs text-ink-3">
            {row.rollNumber} · {row.batchName}
          </span>
        </Link>
      ),
    },
    {
      key: 'attendance',
      header: 'Attendance',
      align: 'right',
      render: (row) => <span className="tnum">{pct(row.attendancePercent, 0)}</span>,
    },
    {
      key: 'score',
      header: 'Avg score',
      align: 'right',
      render: (row) => <span className="tnum">{num(row.averageScore, 1)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <>
          <StatusBadge status={row.status} />
          {row.flaggedForReview && (
            <Badge tone="amber" className="ml-1.5">
              Flagged
            </Badge>
          )}
        </>
      ),
    },
    {
      key: 'reason',
      header: 'Why',
      hideBelow: 'lg',
      render: (row) =>
        row.reason ? (
          <span className="text-sm text-ink-2">{row.reason}</span>
        ) : (
          <span className="text-sm text-success">Criteria met</span>
        ),
    },
    {
      key: 'certificateNo',
      header: 'Certificate no.',
      hideBelow: 'md',
      render: (row) =>
        row.certificateNo ? (
          <span className="tnum text-sm">{row.certificateNo}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: 'flag',
      header: '',
      align: 'right',
      render: (row) =>
        row.flaggedForReview ? (
          <span className="text-sm text-ink-3">Under review</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setFlagging(row)}>
            <Flag className="size-3.5" aria-hidden />
            Flag
          </Button>
        ),
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <>
      <PageHeader
        title="Certificates & trainer feedback"
        description="Certificate eligibility is computed from attendance and scores — a SPOC flags a case for review rather than issuing one."
      />

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Certificates issued"
            value={num(summary.certificatesIssued)}
            icon={<Award />}
            tone="success"
            deltaLabel={`${pct(summary.issuedPercentOfParticipants, 0)} of participants`}
          />
          <StatCard
            label="Pending review"
            value={num(summary.pendingReview)}
            icon={<Flag />}
            tone="amber"
          />
          <StatCard
            label="Not eligible"
            value={num(summary.notEligible)}
            icon={<Award />}
            tone="danger"
          />
          <StatCard
            label="Average trainer rating"
            value={summary.averageTrainerRating ?? '—'}
            outOf={5}
            icon={<Star />}
            tone="indigo"
            hasData={summary.averageTrainerRating != null}
            deltaLabel={`${num(summary.feedbackEntries)} feedback entr(ies)`}
          />
        </div>
      )}

      <Tabs defaultValue="certificates" className="mt-5">
        <TabsList>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
          <TabsTrigger value="feedback">Trainer feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="certificates">
          <FilterBar
            search={table.state.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search name or roll number…"
            filters={[
              {
                name: 'status',
                label: 'Status',
                allLabel: 'All statuses',
                options: (query.data?.meta?.filters?.statuses ?? [
                  'issued',
                  'pending',
                  'not_eligible',
                  'revoked',
                ]).map((status: string) => ({ value: status, label: status.replace(/_/g, ' ') })),
              },
              {
                name: 'batchId',
                label: 'Batch',
                allLabel: 'All batches',
                options: (query.data?.meta?.filters?.batches ?? []).map((batch: any) => ({
                  value: batch.id,
                  label: batch.name,
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
            rowKey={(row) => row.certificateId ?? row.studentUserId}
            caption="Certificate eligibility by participant"
          />
        </TabsContent>

        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent trainer feedback</CardTitle>
                <CardSubtitle>
                  Average {feedback.data?.meta?.summary?.average ?? '—'}/5 across{' '}
                  {num(feedback.data?.meta?.summary?.count ?? 0)} entr(ies)
                </CardSubtitle>
              </div>
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-line-soft">
                {(feedback.data?.items ?? []).map((row: any) => (
                  <li key={row.id} className="py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/hod/participants/${row.studentUserId}`}
                        className="text-base font-semibold hover:text-indigo-600"
                      >
                        {row.studentName}
                      </Link>
                      <span className="text-xs text-ink-3">{row.rollNumber}</span>
                      <Badge tone="amber">{row.rating}/5</Badge>
                    </div>
                    <p className="mt-1 text-base leading-relaxed text-ink-1">
                      {row.feedbackText}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {row.trainerName} · {row.trainingModuleName} · {row.sessionLabel} ·{' '}
                      {formatDate(row.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
              {feedback.data?.items?.length === 0 && (
                <p className="py-6 text-center text-base text-ink-2">
                  No trainer feedback recorded yet.
                </p>
              )}
            </CardBody>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={Boolean(flagging)}
        onOpenChange={(open) => !open && setFlagging(null)}
        title={`Flag ${flagging?.name ?? ''} for review?`}
        description="This asks your institution administrator to look at the eligibility decision. It does not change the certificate itself."
        confirmLabel="Flag for review"
        requireReason
        reasonLabel="What should they check?"
        pending={pending}
        onConfirm={flag}
      />
    </>
  );
}
