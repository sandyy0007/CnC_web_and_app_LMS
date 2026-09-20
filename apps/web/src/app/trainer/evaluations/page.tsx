'use client';

import { ClipboardCheck, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection, ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { ApiError, api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

/** Overriding an AI score requires a reason — the original stays on the record. */
function OverrideDialog({
  score,
  open,
  onOpenChange,
  onDone,
}: {
  score: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    for (const dimension of score.dimensions ?? []) {
      initial[dimension.code] = String(Math.round(dimension.score));
    }
    setValues(initial);
    setReason('');
  }, [open, score]);

  async function submit() {
    setPending(true);
    try {
      await api.post(`/trainer/ai-scores/${score.id}/override`, {
        reason: reason.trim(),
        // Carry each dimension's own weight so the recomputed overall keeps the rubric's
        // weighting instead of silently flattening to a plain average.
        dimensions: (score.dimensions ?? []).map((dimension: any) => ({
          code: dimension.code,
          label: dimension.label,
          weight: dimension.weight,
          score: Number(values[dimension.code] ?? dimension.score),
        })),
      });
      toast.success('AI score overridden — the original is kept on the record');
      onOpenChange(false);
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Override AI scores</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm leading-relaxed text-ink-2">
            Your scores replace the AI&apos;s for {score.studentName ?? 'this participant'}. The
            original values, your reason and your name stay attached to the record, and the
            participant is told a trainer adjusted it.
          </p>
          <div className="mt-4 space-y-3">
            {(score.dimensions ?? []).map((dimension: any) => (
              <div key={dimension.code} className="flex items-center gap-3">
                <label
                  htmlFor={`dim-${dimension.code}`}
                  className="min-w-0 flex-1 text-base font-semibold"
                >
                  {dimension.label}
                  <span className="ml-2 text-xs font-normal text-ink-3">
                    AI said {Math.round(dimension.score)}
                  </span>
                </label>
                <Input
                  id={`dim-${dimension.code}`}
                  type="number"
                  min={0}
                  max={100}
                  value={values[dimension.code] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [dimension.code]: event.target.value,
                    }))
                  }
                  className="tnum w-[84px] shrink-0 text-center"
                />
              </div>
            ))}
          </div>
          <Field
            label="Why are you changing it?"
            htmlFor="override-reason"
            className="mt-4"
            required
            hint="Stored with the override and visible in the audit trail."
          >
            <Textarea
              id="override-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={reason.trim().length < 5}
            onClick={submit}
          >
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TrainerEvaluationsPage() {
  const table = useTableState('trainer-evaluations', { pageSize: 20 });
  const evaluations = useApi<any>('/trainer/evaluations', table.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });
  const aiScores = useApi<any>('/trainer/ai-scores', { pageSize: 20, reviewState: 'all' }, {
    select: (raw) => ({ items: raw.items ?? raw.data ?? [], pagination: raw.pagination }),
  });
  const [overriding, setOverriding] = React.useState<any>(null);

  const columns: Column<any>[] = [
    {
      key: 'student',
      header: 'Participant',
      render: (row) => (
        <>
          <span className="block font-semibold">{row.studentName}</span>
          <span className="block text-xs text-ink-3">
            {row.rollNumber} · {row.batchName}
          </span>
        </>
      ),
    },
    {
      key: 'module',
      header: 'Module',
      hideBelow: 'sm',
      render: (row) => row.trainingModuleName ?? '—',
    },
    {
      key: 'completeness',
      header: 'Complete',
      align: 'right',
      hideBelow: 'md',
      render: (row) => <span className="tnum">{num(row.completeness, 0)}%</span>,
    },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      render: (row) => (
        <span className="tnum font-semibold">
          {num(row.totalScore, 1)}
          <span className="text-xs font-normal text-ink-3">/100</span>
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => <StatusBadge status={row.state} />,
    },
    {
      key: 'updated',
      header: 'Updated',
      hideBelow: 'lg',
      render: (row) => <span className="tnum text-sm">{formatDate(row.updatedAt)}</span>,
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (row) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/trainer/evaluations/${row.id}`}>Open</Link>
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Evaluations"
        description="Trainer-rated parameters across the seven pillars, plus the AI practice scores you can override."
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/trainer/evaluations/new">
              <Plus className="size-3.5" aria-hidden />
              New evaluation
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My evaluations</TabsTrigger>
          <TabsTrigger value="ai">AI practice scores</TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          <div className="mb-4 w-full sm:w-[220px]">
            <label htmlFor="state" className="mb-1.5 block text-sm font-semibold">
              State
            </label>
            <Select
              value={table.state.filters.state ?? 'all'}
              onValueChange={(value) => table.setFilter('state', value)}
            >
              <SelectTrigger id="state">
                <SelectValue placeholder="All states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {evaluations.error ? (
            <ErrorState error={evaluations.error} onRetry={evaluations.refetch} />
          ) : (
            <DataTable
              columns={columns}
              rows={evaluations.data?.items ?? []}
              loading={evaluations.initialLoading}
              pagination={evaluations.data?.pagination}
              onPageChange={table.setPage}
              rowKey={(row) => row.id}
              caption="Evaluations you have entered"
              empty={
                <div className="px-6 py-12 text-center">
                  <ClipboardCheck className="mx-auto size-6 text-ink-3" aria-hidden />
                  <p className="mt-3 text-md font-bold">No evaluations yet</p>
                  <p className="mt-1.5 text-base text-ink-2">
                    Rate a participant on the parameter set to start building their pillar scores.
                  </p>
                  <Button asChild variant="primary" size="sm" className="mt-4">
                    <Link href="/trainer/evaluations/new">New evaluation</Link>
                  </Button>
                </div>
              }
            />
          )}
        </TabsContent>

        <TabsContent value="ai">
          <AsyncSection query={aiScores} skeleton="table">
            {(data) => (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>AI practice scores</CardTitle>
                    <CardSubtitle>
                      Scored from the participant&apos;s own transcript — every dimension quotes its
                      evidence
                    </CardSubtitle>
                  </div>
                  <Sparkles className="size-4 text-indigo" aria-hidden />
                </CardHeader>
                <CardBody>
                  {data.items.length === 0 ? (
                    <p className="py-6 text-center text-base text-ink-2">
                      No scored practice sessions for your batches yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {data.items.map((row: any) => (
                        <li key={row.id} className="flex flex-wrap items-center gap-3 py-3.5">
                          <div className="min-w-[180px] flex-1">
                            <p className="text-base font-semibold">{row.studentName}</p>
                            <p className="mt-0.5 text-xs text-ink-3">
                              {row.practiceModeTitle} · {formatDate(row.createdAt, true)}
                            </p>
                          </div>
                          {row.grounded ? (
                            <Badge tone="success">Evidence-backed</Badge>
                          ) : (
                            <Badge tone="amber">Unverified</Badge>
                          )}
                          {row.trainerOverride?.dimensions && <Badge tone="purple">Overridden</Badge>}
                          <span className="tnum text-base font-bold">
                            {num(row.overall, 1)}
                            <span className="text-xs font-normal text-ink-3">/100</span>
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setOverriding(row)}
                          >
                            Override
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            )}
          </AsyncSection>
        </TabsContent>
      </Tabs>

      {overriding && (
        <OverrideDialog
          score={overriding}
          open={Boolean(overriding)}
          onOpenChange={(open) => !open && setOverriding(null)}
          onDone={() => {
            setOverriding(null);
            aiScores.refetch();
          }}
        />
      )}
    </>
  );
}
