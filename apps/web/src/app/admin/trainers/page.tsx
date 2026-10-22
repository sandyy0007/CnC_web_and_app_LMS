'use client';

import { Calendar, GraduationCap, ShieldCheck, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';

const WEEKDAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PERMISSIONS: { key: string; label: string; help: string }[] = [
  {
    key: 'canMarkAttendance',
    label: 'Mark attendance',
    help: 'Record and correct attendance for their own sessions.',
  },
  {
    key: 'canEvaluate',
    label: 'Enter evaluations',
    help: 'Rate participants on the parameter set and submit scores.',
  },
  {
    key: 'canCreateAssignments',
    label: 'Create assignments',
    help: 'Set work for their batches and grade submissions.',
  },
  {
    key: 'canViewReports',
    label: 'View and export reports',
    help: 'Generate exports scoped to their own batches.',
  },
];

function AccessDialog({
  trainer,
  open,
  onOpenChange,
  onDone,
}: {
  trainer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, boolean>>({});
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const permission of PERMISSIONS) {
      next[permission.key] = trainer.access?.[permission.key] !== false;
    }
    setValues(next);
  }, [open, trainer]);

  async function submit() {
    setPending(true);
    try {
      await api.patch(`/admin/trainers/${trainer.id}/access`, values);
      toast.success(`Permissions updated for ${trainer.name}`);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permissions — {trainer?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm leading-relaxed text-ink-2">
            These are enforced on the server for every request. Removing one takes effect on the
            trainer&apos;s next action, not just in their menu.
          </p>
          <ul className="mt-4 divide-y divide-line-soft">
            {PERMISSIONS.map((permission) => (
              <li key={permission.key} className="flex items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`perm-${permission.key}`}
                    className="text-base font-semibold"
                  >
                    {permission.label}
                  </label>
                  <p className="mt-0.5 text-sm text-ink-2">{permission.help}</p>
                </div>
                <Switch
                  id={`perm-${permission.key}`}
                  checked={Boolean(values[permission.key])}
                  onCheckedChange={(value) =>
                    setValues((current) => ({ ...current, [permission.key]: value }))
                  }
                />
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={submit}>
            Save permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTrainersPage() {
  const table = useTableState('admin-trainers', { pageSize: 25 });
  const departments = useApi<any[]>('/admin/departments');
  const query = useApi<any>('/admin/trainers', table.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });
  const [editing, setEditing] = React.useState<any>(null);
  const [managingAssignments, setManagingAssignments] = React.useState<any>(null);

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Trainer',
      sortKey: 'name',
      render: (row) => (
        <>
          <span className="block font-semibold">{row.name}</span>
          <span className="block text-xs text-ink-3">{row.email}</span>
        </>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      hideBelow: 'sm',
      render: (row) => (
        <>
          <span className="block">{row.departmentName ?? '—'}</span>
          <span className="block text-xs text-ink-3">{row.designation ?? ''}</span>
        </>
      ),
    },
    {
      key: 'batches',
      header: 'Batches',
      hideBelow: 'md',
      render: (row) =>
        row.batches?.length ? (
          <div className="flex flex-wrap gap-1">
            {row.batches.map((batch: string) => (
              <Badge key={batch} tone="neutral">
                {batch}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-ink-3">None</span>
        ),
    },
    {
      key: 'modules',
      header: 'Modules',
      hideBelow: 'lg',
      render: (row) =>
        row.modules?.length ? (
          <div className="flex flex-wrap gap-1">
            {row.modules.map((module: string) => (
              <Badge key={module} tone="indigo">
                {module}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-ink-3">None</span>
        ),
    },
    {
      key: 'lastActive',
      header: 'Last active',
      hideBelow: 'lg',
      render: (row) => (
        <span className="tnum text-sm text-ink-2">
          {row.lastActiveAt ? formatDate(row.lastActiveAt) : 'Never'}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'access',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setManagingAssignments(row)}>
            <Calendar className="size-3.5" aria-hidden />
            Assignments
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(row)}>
            <ShieldCheck className="size-3.5" aria-hidden />
            Permissions
          </Button>
        </div>
      ),
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <GlobalPageBackground
      image="/images/backgrounds/trainer.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="Trainers & access"
        description="Who teaches what, and what each of them is allowed to do."
      />

      <FilterBar
        search={table.state.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search name or email…"
        filters={[
          {
            name: 'departmentId',
            label: 'Department',
            allLabel: 'All departments',
            options: (departments.data ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            })),
          },
          {
            name: 'status',
            label: 'Status',
            allLabel: 'All statuses',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'deactivated', label: 'Deactivated' },
            ],
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
        sortBy={table.state.sortBy}
        sortDir={table.state.sortDir}
        onSort={table.toggleSort}
        rowKey={(row) => row.id}
        caption="Trainers in your institution"
      />

      {editing && (
        <AccessDialog
          trainer={editing}
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          onDone={query.refetch}
        />
      )}

      {managingAssignments && (
        <TrainerAssignmentsDialog
          trainer={managingAssignments}
          open={Boolean(managingAssignments)}
          onOpenChange={(open) => !open && setManagingAssignments(null)}
          onDone={query.refetch}
        />
      )}
    </GlobalPageBackground>
  );
}

function TrainerAssignmentsDialog({
  trainer,
  open,
  onOpenChange,
  onDone,
}: {
  trainer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const assignments = useApi<any[]>(
    `/admin/trainers/${trainer?.id}/assignments`,
    {},
    { enabled: Boolean(trainer?.id && open) }
  );
  const [unassigningId, setUnassigningId] = React.useState<string | null>(null);

  async function handleUnassign(batchId: string, batchName: string) {
    if (!window.confirm(`Unassign ${trainer.name} from batch ${batchName}? Active sessions will be revoked.`)) {
      return;
    }
    setUnassigningId(batchId);
    try {
      await api.delete(`/admin/batches/${batchId}/trainers/${trainer.id}`);
      toast.success(`${trainer.name} unassigned from ${batchName}`);
      assignments.refetch();
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setUnassigningId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch assignments: {trainer?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-ink-2">
            Batches and teaching schedules assigned to this trainer across your institution.
          </p>

          {assignments.loading ? (
            <p className="py-8 text-center text-sm text-ink-3">Loading assignments...</p>
          ) : !assignments.data || assignments.data.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-line p-8 text-center">
              <GraduationCap className="mx-auto size-8 text-ink-3" aria-hidden />
              <p className="mt-2 text-base font-semibold text-ink-1">No batch assignments</p>
              <p className="mt-1 text-sm text-ink-2">
                This trainer is currently not assigned to teach any active batches.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line-soft rounded-[10px] border border-line">
              {assignments.data.map((item: any) => (
                <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-ink-1">
                        {item.batchName} ({item.batchCode})
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
                      {item.departmentName && <span>Dept: {item.departmentName}</span>}
                      <span>Sem {item.semester} ({item.academicYear})</span>
                      <span>{item.studentCount} students</span>
                      {(item.startDate || item.endDate) && (
                        <span className="flex items-center gap-1 font-medium text-ink-1">
                          <Calendar className="size-3 text-ink-3" aria-hidden />
                          {item.startDate ? formatDate(item.startDate) : 'Start'} – {item.endDate ? formatDate(item.endDate) : 'Ongoing'}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-ink-3">Days:</span>
                      {(item.weekdays || []).map((w: number) => (
                        <span
                          key={w}
                          className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-semibold text-indigo-400"
                        >
                          {WEEKDAY_NAMES[w] || `Day ${w}`}
                        </span>
                      ))}
                      {item.notes && (
                        <span className="ml-2 rounded bg-panel-2 px-2 py-0.5 text-xs italic text-ink-2">
                          &ldquo;{item.notes}&rdquo;
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={unassigningId === item.batchId}
                      onClick={() => handleUnassign(item.batchId, item.batchName)}
                      className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Unassign
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

