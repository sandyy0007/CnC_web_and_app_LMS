'use client';

import { AlertTriangle, ArrowLeft, GraduationCap, Save, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { SearchInput } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
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
import { Field, Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { num, pct } from '@/lib/format';

/**
 * Admin batch management: capacity, the roster, and who teaches it. Assignments are refused
 * server-side when a participant belongs to another department, so the rejected rows are shown
 * back with the reason rather than silently dropped.
 */
export default function AdminBatchDetailPage() {
  const params = useParams<{ batchId: string }>();
  const batches = useApi<any>('/admin/batches', { pageSize: 100 }, {
    select: (raw) => ({ items: raw.items }),
  });
  const batch = (batches.data?.items ?? []).find((row: any) => row.id === params.batchId);

  const [search, setSearch] = React.useState('');
  const students = useApi<any>(
    '/admin/users',
    { role: 'STUDENT', search, pageSize: 20, departmentId: batch?.departmentId },
    { select: (raw) => ({ items: raw.items }), enabled: Boolean(batch) },
  );
  const trainers = useApi<any>('/admin/trainers', { pageSize: 100 }, {
    select: (raw) => ({ items: raw.items }),
  });
  const modules = useApi<any[]>('/admin/training-modules');

  const [selectedStudents, setSelectedStudents] = React.useState<string[]>([]);
  const [selectedTrainers, setSelectedTrainers] = React.useState<string[]>([]);
  const [moduleId, setModuleId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [rejected, setRejected] = React.useState<any[]>([]);
  const [editing, setEditing] = React.useState(false);

  async function assignStudents() {
    setPending(true);
    setRejected([]);
    try {
      const response = await api.post(`/admin/batches/${params.batchId}/students`, {
        studentUserIds: selectedStudents,
        enrollmentType: 'regular',
        reason: reason || undefined,
      });
      toast.success(
        `${response.data.assigned.length} participant(s) assigned; enrollment history appended`,
      );
      setRejected(response.data.rejected ?? []);
      setSelectedStudents([]);
      setReason('');
      batches.refetch();
      students.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  async function assignTrainers() {
    setPending(true);
    setRejected([]);
    try {
      const response = await api.post(`/admin/batches/${params.batchId}/trainers`, {
        trainerUserIds: selectedTrainers,
        trainingModuleId: moduleId || undefined,
      });
      toast.success(
        `${response.data.assigned.length} trainer(s) assigned — their live sessions were invalidated so the new scope takes effect`,
      );
      setRejected(response.data.rejected ?? []);
      setSelectedTrainers([]);
      batches.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  const studentColumns: Column<any>[] = [
    {
      key: 'select',
      header: '',
      width: '40px',
      render: (row) => (
        <Checkbox
          aria-label={`Select ${row.name}`}
          checked={selectedStudents.includes(row.id)}
          onCheckedChange={(value) =>
            setSelectedStudents((current) =>
              value ? [...current, row.id] : current.filter((id) => id !== row.id),
            )
          }
        />
      ),
    },
    {
      key: 'name',
      header: 'Participant',
      render: (row) => (
        <>
          <span className="block font-semibold">{row.name}</span>
          <span className="block text-xs text-ink-3">
            {row.institutionId ?? row.email}
          </span>
        </>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      hideBelow: 'sm',
      render: (row) => row.departmentName ?? '—',
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <AsyncSection query={batches} skeleton="detail">
      {() =>
        !batch ? (
          <Card>
            <CardBody className="py-10 text-center">
              <p className="text-md font-semibold">That batch is not in your institution</p>
              <Button asChild variant="primary" size="sm" className="mt-4">
                <Link href="/admin/departments">Back to departments &amp; batches</Link>
              </Button>
            </CardBody>
          </Card>
        ) : (
          <>
            <PageHeader
              breadcrumbs={[
                { label: 'Departments & batches', href: '/admin/departments' },
                { label: batch.name },
              ]}
              title={`${batch.name} · ${batch.code}`}
              description={`${batch.departmentName}${batch.semesterNumber ? ` · Semester ${batch.semesterNumber}` : ''}`}
              actions={
                <>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    <Save className="size-3.5" aria-hidden />
                    Edit batch
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/departments">
                      <ArrowLeft className="size-3.5" aria-hidden />
                      Back
                    </Link>
                  </Button>
                </>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Participants" value={num(batch.students)} icon={<UserPlus />} />
              <StatCard label="Capacity" value={num(batch.capacity)} tone="info" />
              <StatCard
                label="Utilisation"
                value={pct(batch.utilisationPercent, 1)}
                tone={batch.utilisationPercent > 95 ? 'amber' : 'success'}
              />
              <StatCard
                label="Trainers assigned"
                value={num(batch.trainersAssigned)}
                icon={<GraduationCap />}
                tone="teal"
              />
            </div>

            <Card className="mt-4">
              <CardBody>
                <ProgressBar
                  label={`${num(batch.students)} of ${num(batch.capacity)} places used`}
                  value={batch.utilisationPercent}
                />
                {batch.utilisationPercent >= 100 && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-amber-dark">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    This batch is full — further assignments are refused until capacity is raised.
                  </p>
                )}
              </CardBody>
            </Card>

            {rejected.length > 0 && (
              <div
                role="alert"
                className="mt-4 rounded-[10px] bg-danger-bg px-3.5 py-3 text-sm text-danger"
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {rejected.length} assignment(s) were refused
                </p>
                <ul className="mt-1.5 list-disc pl-5">
                  {rejected.map((row, index) => (
                    <li key={index}>{row.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <Tabs defaultValue="students" className="mt-5">
              <TabsList>
                <TabsTrigger value="students">Assign participants</TabsTrigger>
                <TabsTrigger value="trainers">Assign trainers</TabsTrigger>
              </TabsList>

              <TabsContent value="students">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Add participants</CardTitle>
                      <CardSubtitle>
                        Only participants in {batch.departmentName} can join this batch
                      </CardSubtitle>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={pending}
                      disabled={selectedStudents.length === 0}
                      onClick={assignStudents}
                    >
                      Assign {selectedStudents.length || ''}
                    </Button>
                  </CardHeader>
                  <CardBody>
                    <div className="flex flex-wrap items-end gap-3">
                      <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Search participants…"
                        className="w-full sm:w-[300px]"
                      />
                      <Field
                        label="Reason (kept in the enrollment history)"
                        htmlFor="reason"
                        className="w-full sm:w-[320px]"
                      >
                        <Input
                          id="reason"
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="e.g. Batch rebalance for Semester 6"
                        />
                      </Field>
                    </div>

                    <div className="mt-4">
                      <DataTable
                        columns={studentColumns}
                        rows={students.data?.items ?? []}
                        loading={students.initialLoading}
                        rowKey={(row) => row.id}
                        caption="Participants eligible for this batch"
                      />
                    </div>
                    <p className="mt-3 text-xs text-ink-3">
                      Moving a participant closes their current enrollment as{' '}
                      <strong className="font-semibold">transferred</strong> and opens a new row —
                      the old one stays on their record.
                    </p>
                  </CardBody>
                </Card>
              </TabsContent>

              <TabsContent value="trainers">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Assign trainers</CardTitle>
                      <CardSubtitle>
                        Assigning re-scopes the trainer and ends their live sessions
                      </CardSubtitle>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={pending}
                      disabled={selectedTrainers.length === 0}
                      onClick={assignTrainers}
                    >
                      Assign {selectedTrainers.length || ''}
                    </Button>
                  </CardHeader>
                  <CardBody>
                    <div className="max-w-[280px]">
                      <label htmlFor="module" className="mb-1.5 block text-sm font-semibold">
                        Module (optional)
                      </label>
                      <Select value={moduleId} onValueChange={setModuleId}>
                        <SelectTrigger id="module">
                          <SelectValue placeholder="Any module" />
                        </SelectTrigger>
                        <SelectContent>
                          {(modules.data ?? []).map((row: any) => (
                            <SelectItem key={row.id} value={row.id}>
                              {row.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <ul className="scroll-thin mt-4 max-h-[340px] divide-y divide-line-soft overflow-y-auto rounded-[10px] border border-line">
                      {(trainers.data?.items ?? []).map((trainer: any) => (
                        <li key={trainer.id} className="flex items-center gap-3 px-3.5 py-2.5">
                          <Checkbox
                            aria-label={`Select ${trainer.name}`}
                            checked={selectedTrainers.includes(trainer.id)}
                            onCheckedChange={(value) =>
                              setSelectedTrainers((current) =>
                                value
                                  ? [...current, trainer.id]
                                  : current.filter((id) => id !== trainer.id),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold">{trainer.name}</span>
                            <span className="block text-xs text-ink-3">
                              {trainer.departmentName} · {trainer.designation ?? ''}
                            </span>
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {(trainer.modules ?? []).map((module: string) => (
                              <Badge key={module} tone="indigo">
                                {module}
                              </Badge>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              </TabsContent>
            </Tabs>

            <EditBatchDialog
              batch={batch}
              open={editing}
              onOpenChange={setEditing}
              onDone={batches.refetch}
            />
          </>
        )
      }
    </AsyncSection>
  );
}

function EditBatchDialog({
  batch,
  open,
  onOpenChange,
  onDone,
}: {
  batch: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(batch?.name ?? '');
  const [capacity, setCapacity] = React.useState(String(batch?.capacity ?? ''));
  const [status, setStatus] = React.useState(batch?.status ?? 'active');
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(batch?.name ?? '');
    setCapacity(String(batch?.capacity ?? ''));
    setStatus(batch?.status ?? 'active');
  }, [open, batch]);

  async function submit() {
    setPending(true);
    try {
      await api.patch(`/admin/batches/${batch.id}`, {
        name,
        capacity: Number(capacity),
        status,
      });
      toast.success('Batch updated');
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
          <DialogTitle>Edit {batch?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Name" htmlFor="edit-name" required>
            <Input
              id="edit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="Capacity"
            htmlFor="edit-capacity"
            hint="Lowering it below the current roster is refused by the server."
          >
            <Input
              id="edit-capacity"
              type="number"
              min={1}
              max={500}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
          </Field>
          <div>
            <label htmlFor="edit-status" className="mb-1.5 block text-sm font-semibold">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-sm text-ink-3">
              Archiving keeps every record — it only stops new activity.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} disabled={!name} onClick={submit}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
