'use client';

import { Building2, Layers, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection, ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
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
import { num, pct } from '@/lib/format';

function CreateDepartmentDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const hods = useApi<any>('/admin/users', { role: 'HOD', pageSize: 50 }, {
    select: (raw) => ({ items: raw.items }),
  });
  const [form, setForm] = React.useState({ name: '', code: '', hodUserId: '', description: '' });
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function submit() {
    setPending(true);
    setFieldErrors({});
    try {
      await api.post('/admin/departments', {
        name: form.name,
        code: form.code.toUpperCase(),
        hodUserId: form.hodUserId || undefined,
        description: form.description || undefined,
      });
      toast.success('Department created');
      onOpenChange(false);
      setForm({ name: '', code: '', hodUserId: '', description: '' });
      onDone();
    } catch (caught) {
      const apiError = caught as ApiError;
      setFieldErrors(apiError.fieldErrors);
      toast.error(apiError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New department</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Name" htmlFor="dept-name" required error={fieldErrors.name}>
            <Input
              id="dept-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Mechanical Engineering"
            />
          </Field>
          <Field
            label="Code"
            htmlFor="dept-code"
            required
            error={fieldErrors.code}
            hint="Short, unique within your institution — used in roll numbers and batch codes."
          >
            <Input
              id="dept-code"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              placeholder="MECH"
            />
          </Field>
          <div>
            <label htmlFor="dept-hod" className="mb-1.5 block text-sm font-semibold">
              Single Point of Contact (SPOC)
            </label>
            <Select
              value={form.hodUserId}
              onValueChange={(value) => setForm({ ...form, hodUserId: value })}
            >
              <SelectTrigger id="dept-hod">
                <SelectValue placeholder="Assign later" />
              </SelectTrigger>
              <SelectContent>
                {(hods.data?.items ?? []).map((user: any) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-sm text-ink-3">
              Assigning a SPOC moves their scope to this department and signs them out of any live
              session.
            </p>
          </div>
          <Field label="Description" htmlFor="dept-description">
            <Textarea
              id="dept-description"
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
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
            disabled={!form.name || !form.code}
            onClick={submit}
          >
            Create department
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateBatchDialog({
  open,
  onOpenChange,
  onDone,
  departments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  departments: any[];
}) {
  const semesters = useApi<any[]>('/admin/semesters');
  const [form, setForm] = React.useState({
    name: '',
    code: '',
    departmentId: '',
    semesterId: '',
    capacity: '60',
  });
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const eligibleSemesters = (semesters.data ?? []).filter(
    (semester) => !form.departmentId || semester.departmentId === form.departmentId,
  );

  async function submit() {
    setPending(true);
    setFieldErrors({});
    try {
      await api.post('/admin/batches', {
        name: form.name,
        code: form.code.toUpperCase(),
        departmentId: form.departmentId,
        semesterId: form.semesterId || undefined,
        capacity: Number(form.capacity),
      });
      toast.success('Batch created');
      onOpenChange(false);
      onDone();
    } catch (caught) {
      const apiError = caught as ApiError;
      setFieldErrors(apiError.fieldErrors);
      toast.error(apiError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New batch</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <label htmlFor="batch-department" className="mb-1.5 block text-sm font-semibold">
              Department
            </label>
            <Select
              value={form.departmentId}
              onValueChange={(value) => setForm({ ...form, departmentId: value, semesterId: '' })}
            >
              <SelectTrigger id="batch-department">
                <SelectValue placeholder="Select a department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="batch-name" required error={fieldErrors.name}>
              <Input
                id="batch-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Batch D"
              />
            </Field>
            <Field label="Code" htmlFor="batch-code" required error={fieldErrors.code}>
              <Input
                id="batch-code"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                placeholder="CSE-D"
              />
            </Field>
            <div>
              <label htmlFor="batch-semester" className="mb-1.5 block text-sm font-semibold">
                Semester
              </label>
              <Select
                value={form.semesterId}
                onValueChange={(value) => setForm({ ...form, semesterId: value })}
                disabled={!form.departmentId}
              >
                <SelectTrigger id="batch-semester">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleSemesters.map((semester) => (
                    <SelectItem key={semester.id} value={semester.id}>
                      {semester.label} · {semester.academicYear}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Capacity" htmlFor="batch-capacity" error={fieldErrors.capacity}>
              <Input
                id="batch-capacity"
                type="number"
                min={1}
                max={500}
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
              />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!form.name || !form.code || !form.departmentId}
            onClick={submit}
          >
            Create batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDepartmentsPage() {
  const departments = useApi<any[]>('/admin/departments');
  const batchTable = useTableState('admin-batches', { pageSize: 25 });
  const batches = useApi<any>('/admin/batches', batchTable.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const [creatingDepartment, setCreatingDepartment] = React.useState(false);
  const [creatingBatch, setCreatingBatch] = React.useState(false);

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
    { key: 'department', header: 'Department', hideBelow: 'sm', render: (row) => row.departmentName },
    {
      key: 'semester',
      header: 'Semester',
      hideBelow: 'md',
      render: (row) => (row.semesterNumber ? `Semester ${row.semesterNumber}` : '—'),
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
      hideBelow: 'lg',
      render: (row) => (
        <div className="min-w-[110px]">
          <ProgressBar value={row.utilisationPercent} showValue={false} thin />
          <span className="tnum mt-1 block text-xs text-ink-3">
            {pct(row.utilisationPercent, 1)}
          </span>
        </div>
      ),
    },
    {
      key: 'trainers',
      header: 'Trainers',
      align: 'right',
      hideBelow: 'md',
      render: (row) => <span className="tnum">{num(row.trainersAssigned)}</span>,
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
    <GlobalPageBackground
      image="/images/backgrounds/colleges.webp"
      variant="dark"
      orbTone="purple"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="Departments & batches"
        description="The institution's structure. Creating a department does not touch anyone's data until you assign people to it."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreatingBatch(true)}>
              <Plus className="size-3.5" aria-hidden />
              New batch
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreatingDepartment(true)}>
              <Plus className="size-3.5" aria-hidden />
              New department
            </Button>
          </>
        }
      />

      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="departments">
          <AsyncSection query={departments} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
            {(rows) => (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((department) => (
                  <Card key={department.id}>
                    <CardHeader>
                      <div className="min-w-0">
                        <CardTitle>{department.name}</CardTitle>
                        <CardSubtitle>{department.code}</CardSubtitle>
                      </div>
                      <StatusBadge status={department.status} />
                    </CardHeader>
                    <CardBody>
                      <p className="text-sm text-ink-2">
                        SPOC:{' '}
                        {department.hodName ? (
                          <span className="font-semibold text-ink-1">{department.hodName}</span>
                        ) : (
                          <Badge tone="amber">Not assigned</Badge>
                        )}
                      </p>
                      <dl className="tnum mt-3.5 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-[8px] bg-app px-2 py-2">
                          <dd className="text-md font-bold">{num(department.students)}</dd>
                          <dt className="text-2xs text-ink-3">Participants</dt>
                        </div>
                        <div className="rounded-[8px] bg-app px-2 py-2">
                          <dd className="text-md font-bold">{num(department.activeBatches)}</dd>
                          <dt className="text-2xs text-ink-3">Batches</dt>
                        </div>
                        <div className="rounded-[8px] bg-app px-2 py-2">
                          <dd className="text-md font-bold">
                            {num(department.trainersAssigned)}
                          </dd>
                          <dt className="text-2xs text-ink-3">Trainers</dt>
                        </div>
                      </dl>
                      <Button asChild variant="secondary" size="sm" className="mt-4 w-full">
                        <Link href={`/admin/departments/${department.id}`}>
                          <Building2 className="size-3.5" aria-hidden />
                          Open department
                        </Link>
                      </Button>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </AsyncSection>
        </TabsContent>

        <TabsContent value="batches">
          {batches.error ? (
            <ErrorState error={batches.error} onRetry={batches.refetch} />
          ) : (
            <DataTable
              columns={batchColumns}
              rows={batches.data?.items ?? []}
              loading={batches.initialLoading}
              pagination={batches.data?.pagination}
              onPageChange={batchTable.setPage}
              rowKey={(row) => row.id}
              caption="Batches across the institution"
              empty={
                <div className="px-6 py-12 text-center">
                  <Layers className="mx-auto size-6 text-ink-3" aria-hidden />
                  <p className="mt-3 text-md font-bold">No batches yet</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-4"
                    onClick={() => setCreatingBatch(true)}
                  >
                    <Users className="size-3.5" aria-hidden />
                    Create the first batch
                  </Button>
                </div>
              }
            />
          )}
        </TabsContent>
      </Tabs>

      <CreateDepartmentDialog
        open={creatingDepartment}
        onOpenChange={setCreatingDepartment}
        onDone={departments.refetch}
      />
      <CreateBatchDialog
        open={creatingBatch}
        onOpenChange={setCreatingBatch}
        onDone={() => {
          batches.refetch();
          departments.refetch();
        }}
        departments={departments.data ?? []}
      />
    </GlobalPageBackground>
  );
}
