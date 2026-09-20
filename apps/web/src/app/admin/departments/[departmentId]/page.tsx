'use client';

import { ArrowLeft, Building2, GraduationCap, Layers, Plus, Save, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { DetailList } from '@/components/shared/misc';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { num, pct } from '@/lib/format';

function AddSemesterDialog({
  departmentId,
  open,
  onOpenChange,
  onDone,
}: {
  departmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [number, setNumber] = React.useState('6');
  const [academicYear, setAcademicYear] = React.useState('2026-27');
  const [pending, setPending] = React.useState(false);

  async function submit() {
    setPending(true);
    try {
      await api.post('/admin/semesters', {
        departmentId,
        number: Number(number),
        academicYear,
        active: true,
      });
      toast.success('Semester added');
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
          <DialogTitle>Add a semester</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Semester number" htmlFor="semester-number" required>
            <Input
              id="semester-number"
              type="number"
              min={1}
              max={12}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
          </Field>
          <Field label="Academic year" htmlFor="academic-year">
            <Input
              id="academic-year"
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              placeholder="2026-27"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={submit}>
            Add semester
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDepartmentDetailPage() {
  const params = useParams<{ departmentId: string }>();
  const departments = useApi<any[]>('/admin/departments');
  const semesters = useApi<any[]>('/admin/semesters');
  const batches = useApi<any>('/admin/batches', { departmentId: params.departmentId, pageSize: 50 }, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });
  const hods = useApi<any>('/admin/users', { role: 'HOD', pageSize: 50 }, {
    select: (raw) => ({ items: raw.items }),
  });

  const department = (departments.data ?? []).find((row) => row.id === params.departmentId);

  const [name, setName] = React.useState('');
  const [hodUserId, setHodUserId] = React.useState('');
  const [status, setStatus] = React.useState('active');
  const [saving, setSaving] = React.useState(false);
  const [addingSemester, setAddingSemester] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);

  React.useEffect(() => {
    if (!department) return;
    setName(department.name ?? '');
    setHodUserId(department.hodUserId ?? '');
    setStatus(department.status ?? 'active');
  }, [department]);

  async function save() {
    setSaving(true);
    try {
      const response = await api.patch(`/admin/departments/${params.departmentId}`, {
        name,
        hodUserId: hodUserId || undefined,
        status,
      });
      toast.success(response.message ?? 'Department updated');
      departments.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function archive(reason: string) {
    setSaving(true);
    try {
      const response = await api.delete(`/admin/departments/${params.departmentId}`, { reason });
      toast.success(response.message ?? 'Department archived — records are preserved');
      setArchiving(false);
      departments.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  const departmentSemesters = (semesters.data ?? []).filter(
    (semester) => semester.departmentId === params.departmentId,
  );

  const batchColumns: Column<any>[] = [
    {
      key: 'name',
      header: 'Batch',
      render: (row) => (
        <>
          <span className="block font-semibold">{row.name}</span>
          <span className="block text-xs text-ink-3">{row.code}</span>
        </>
      ),
    },
    {
      key: 'students',
      header: 'Participants',
      align: 'right',
      render: (row) => (
        <span className="tnum">
          {num(row.students)}
          <span className="text-xs text-ink-3">/{num(row.capacity)}</span>
        </span>
      ),
    },
    {
      key: 'utilisation',
      header: 'Utilisation',
      hideBelow: 'sm',
      render: (row) => (
        <div className="min-w-[110px]">
          <ProgressBar value={row.utilisationPercent} showValue={false} thin />
          <span className="tnum mt-1 block text-xs text-ink-3">
            {pct(row.utilisationPercent, 1)}
          </span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'manage',
      header: '',
      align: 'right',
      render: (row) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/admin/batches/${row.id}`}>Manage</Link>
        </Button>
      ),
    },
  ];

  return (
    <AsyncSection query={departments} skeleton="detail">
      {() =>
        !department ? (
          <Card>
            <CardBody className="py-10 text-center">
              <p className="text-md font-semibold">That department is not in your institution</p>
              <Button asChild variant="primary" size="sm" className="mt-4">
                <Link href="/admin/departments">Back to departments</Link>
              </Button>
            </CardBody>
          </Card>
        ) : (
          <>
            <PageHeader
              breadcrumbs={[
                { label: 'Departments & batches', href: '/admin/departments' },
                { label: department.name },
              ]}
              title={department.name}
              description={`${department.code} · ${department.description ?? 'Soft-skills and employability programme'}`}
              actions={
                <>
                  <Button variant="secondary" size="sm" onClick={() => setAddingSemester(true)}>
                    <Plus className="size-3.5" aria-hidden />
                    Add semester
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
              <StatCard label="Participants" value={num(department.students)} icon={<Users />} />
              <StatCard
                label="Active batches"
                value={num(department.activeBatches)}
                icon={<Layers />}
                tone="info"
              />
              <StatCard
                label="Trainers assigned"
                value={num(department.trainersAssigned)}
                icon={<GraduationCap />}
                tone="teal"
              />
              <StatCard
                label="Semesters"
                value={num(department.semesters)}
                icon={<Building2 />}
                tone="purple"
              />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Department settings</CardTitle>
                      <CardSubtitle>Changing the SPOC re-scopes their access</CardSubtitle>
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <Field label="Name" htmlFor="dept-name" required>
                      <Input
                        id="dept-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </Field>
                    <div>
                      <label htmlFor="dept-hod" className="mb-1.5 block text-sm font-semibold">
                        Single Point of Contact (SPOC)
                      </label>
                      <Select value={hodUserId} onValueChange={setHodUserId}>
                        <SelectTrigger id="dept-hod">
                          <SelectValue placeholder="Not assigned" />
                        </SelectTrigger>
                        <SelectContent>
                          {(hods.data?.items ?? []).map((user: any) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label htmlFor="dept-status" className="mb-1.5 block text-sm font-semibold">
                        Status
                      </label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger id="dept-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="archived">Archived (read-only)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" loading={saving} onClick={save}>
                        <Save className="size-3.5" aria-hidden />
                        Save changes
                      </Button>
                      {department.status !== 'archived' && (
                        <Button variant="secondary" onClick={() => setArchiving(true)}>
                          Archive department
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Semesters</CardTitle>
                      <CardSubtitle>{departmentSemesters.length} configured</CardSubtitle>
                    </div>
                  </CardHeader>
                  <CardBody>
                    {departmentSemesters.length === 0 ? (
                      <p className="py-4 text-center text-base text-ink-2">
                        No semester configured yet — batches can still be created without one.
                      </p>
                    ) : (
                      <DetailList
                        rows={departmentSemesters.map((semester) => ({
                          label: semester.label ?? `Semester ${semester.number}`,
                          value: (
                            <span className="flex items-center gap-2">
                              <span className="text-sm text-ink-2">{semester.academicYear}</span>
                              <StatusBadge status={semester.active ? 'active' : 'archived'} />
                            </span>
                          ),
                        }))}
                      />
                    )}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Batches in this department</CardTitle>
                    <CardSubtitle>
                      {num(batches.data?.pagination?.total ?? 0)} batch(es)
                    </CardSubtitle>
                  </div>
                </CardHeader>
                <CardBody className="pt-0">
                  <DataTable
                    columns={batchColumns}
                    rows={batches.data?.items ?? []}
                    loading={batches.initialLoading}
                    rowKey={(row) => row.id}
                    caption={`Batches in ${department.name}`}
                  />
                </CardBody>
              </Card>
            </div>

            <AddSemesterDialog
              departmentId={params.departmentId}
              open={addingSemester}
              onOpenChange={setAddingSemester}
              onDone={semesters.refetch}
            />

            <ConfirmDialog
              open={archiving}
              onOpenChange={setArchiving}
              title={`Archive ${department.name}?`}
              description="Archiving makes the department read-only. Nothing is deleted: participants, evaluations, attendance and certificates all stay exactly as they are."
              confirmLabel="Archive department"
              tone="danger"
              requireReason
              reasonLabel="Reason"
              pending={saving}
              onConfirm={archive}
            />
          </>
        )
      }
    </AsyncSection>
  );
}
