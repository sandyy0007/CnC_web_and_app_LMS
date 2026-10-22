'use client';

import { Copy, KeyRound, Plus, RotateCcw, UserMinus, UserPlus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
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
import { Field, Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/misc';
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
import { formatDate, titleCase } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/nav';
import { useAppSelector } from '@/store';

const DEPARTMENT_ROLES = ['HOD', 'STUDENT'];

function CreateUserDialog({
  open,
  onOpenChange,
  onDone,
  roles,
  departments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  roles: { value: string; label: string }[];
  departments: any[];
}) {
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    role: 'STUDENT',
    departmentId: '',
    institutionId: '',
    designation: '',
  });
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [created, setCreated] = React.useState<any>(null);

  const departmentRequired = DEPARTMENT_ROLES.includes(form.role);

  async function submit() {
    setPending(true);
    setFieldErrors({});
    try {
      const response = await api.post('/admin/users', {
        name: form.name,
        email: form.email.toLowerCase(),
        role: form.role,
        departmentId: form.departmentId || undefined,
        institutionId: form.institutionId || undefined,
        designation: form.designation || undefined,
      });
      setCreated(response.data);
      toast.success(response.message ?? 'Account created');
      onDone();
    } catch (caught) {
      const apiError = caught as ApiError;
      setFieldErrors(apiError.fieldErrors);
      toast.error(apiError.message);
    } finally {
      setPending(false);
    }
  }

  function close() {
    onOpenChange(false);
    setCreated(null);
    setForm({
      name: '',
      email: '',
      role: 'STUDENT',
      departmentId: '',
      institutionId: '',
      designation: '',
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? 'Account created' : 'New user'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {created ? (
            <>
              <p className="text-base leading-relaxed">
                <strong className="font-semibold">{created.email}</strong> can sign in with the
                temporary password below. They will be asked to change it immediately.
              </p>
              <div className="mt-3.5 flex items-center gap-2 rounded-[10px] bg-app px-3.5 py-3">
                <KeyRound className="size-4 shrink-0 text-ink-3" aria-hidden />
                <code className="min-w-0 flex-1 truncate text-base font-semibold">
                  {created.temporaryPassword}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(created.temporaryPassword)
                      .then(() => toast.success('Copied'))
                      .catch(() => toast.error('Could not copy — select it manually'));
                  }}
                >
                  <Copy className="size-3.5" aria-hidden />
                  Copy
                </Button>
              </div>
              <p className="mt-2.5 text-sm text-ink-3">
                Share it over a channel you trust. It is shown once and is not stored in readable
                form.
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <Field label="Full name" htmlFor="user-name" required error={fieldErrors.name}>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="Email" htmlFor="user-email" required error={fieldErrors.email}>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="user-role" className="mb-1.5 block text-sm font-semibold">
                    Role
                  </label>
                  <Select
                    value={form.role}
                    onValueChange={(value) => setForm({ ...form, role: value })}
                  >
                    <SelectTrigger id="user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="user-department" className="mb-1.5 block text-sm font-semibold">
                    Department {departmentRequired && <span className="text-danger">*</span>}
                  </label>
                  <Select
                    value={form.departmentId}
                    onValueChange={(value) => setForm({ ...form, departmentId: value })}
                  >
                    <SelectTrigger id="user-department">
                      <SelectValue placeholder={departmentRequired ? 'Required' : 'Optional'} />
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
                <Field
                  label="Institution ID"
                  htmlFor="user-institutionId"
                  hint="Roll number or staff ID — lets them sign in with it."
                  error={fieldErrors.institutionId}
                >
                  <Input
                    id="user-institutionId"
                    value={form.institutionId}
                    onChange={(event) =>
                      setForm({ ...form, institutionId: event.target.value.toUpperCase() })
                    }
                  />
                </Field>
                <Field label="Designation" htmlFor="user-designation">
                  <Input
                    id="user-designation"
                    value={form.designation}
                    onChange={(event) => setForm({ ...form, designation: event.target.value })}
                    placeholder="Assistant Professor"
                  />
                </Field>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {created ? (
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={pending}
                disabled={
                  !form.name || !form.email || (departmentRequired && !form.departmentId)
                }
                onClick={submit}
              >
                Create account
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleChangeDialog({
  user,
  open,
  onOpenChange,
  onDone,
  departments,
}: {
  user: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  departments: any[];
}) {
  const [role, setRole] = React.useState(user?.role ?? '');
  const [departmentId, setDepartmentId] = React.useState(user?.departmentId ?? '');
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setRole(user?.role ?? '');
    setDepartmentId(user?.departmentId ?? '');
  }, [user]);

  async function submit(reason: string) {
    setPending(true);
    try {
      const response = await api.patch(`/admin/users/${user.id}/role`, {
        role,
        reason,
        departmentId: DEPARTMENT_ROLES.includes(role) ? departmentId : undefined,
      });
      toast.success(response.message ?? 'Role changed');
      onOpenChange(false);
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Change role — ${user?.name}`}
      description="Changing a role re-scopes the account and signs the user out of every device immediately."
      confirmLabel="Change role"
      requireReason
      reasonLabel="Why is the role changing?"
      pending={pending}
      onConfirm={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-role" className="mb-1.5 block text-sm font-semibold">
            New role
          </label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="new-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['STUDENT', 'TRAINER', 'HOD', 'ADMIN', 'PARENT'].map(
                (value) => (
                  <SelectItem key={value} value={value}>
                    {ROLE_LABEL[value] ?? titleCase(value)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        {DEPARTMENT_ROLES.includes(role) && (
          <div>
            <label htmlFor="role-department" className="mb-1.5 block text-sm font-semibold">
              Department
            </label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger id="role-department">
                <SelectValue placeholder="Required for this role" />
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
        )}
      </div>
    </ConfirmDialog>
  );
}

export default function AdminUsersPage() {
  const me = useAppSelector((state) => state.auth.user);
  const table = useTableState('admin-users', { pageSize: 25 });
  const departments = useApi<any[]>('/admin/departments');
  const query = useApi<any>('/admin/users', table.params, {
    select: (raw) => ({
      items: raw.items,
      pagination: raw.pagination ?? {
        page: raw.page ?? 1,
        pageSize: raw.pageSize ?? 25,
        total: raw.total ?? 0,
        totalPages: raw.totalPages ?? 1,
        hasNext: raw.hasNext ?? false,
        hasPrev: raw.hasPrev ?? false,
      },
      meta: raw.meta,
    }),
  });

  const [creating, setCreating] = React.useState(false);
  const [reRoling, setReRoling] = React.useState<any>(null);
  const [deactivating, setDeactivating] = React.useState<any>(null);
  const [pending, setPending] = React.useState(false);

  async function deactivate(reason: string) {
    setPending(true);
    try {
      const response = await api.post(`/admin/users/${deactivating.id}/deactivate`, { reason });
      const warnings: string[] = response.data?.warnings ?? [];
      toast.success(response.message ?? 'Account deactivated');
      for (const warning of warnings) toast.warning(warning);
      setDeactivating(null);
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  async function reactivate(user: any) {
    try {
      const response = await api.post(`/admin/users/${user.id}/reactivate`);
      toast.success(response.message ?? 'Account reactivated');
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    }
  }

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'User',
      sortKey: 'name',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} color={row.avatarColor} size={28} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{row.name}</span>
            <span className="block truncate text-xs text-ink-3">{row.email}</span>
          </span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <Badge tone="indigo">{row.roleLabel ?? ROLE_LABEL[row.role] ?? titleCase(row.role)}</Badge>,
    },
    {
      key: 'department',
      header: 'Department',
      hideBelow: 'md',
      render: (row) => row.departmentName ?? '—',
    },
    {
      key: 'batch',
      header: 'Batch',
      hideBelow: 'md',
      render: (row) =>
        row.role === 'STUDENT' ? (
          row.batchName ? (
            <Badge tone="teal">{row.batchName}</Badge>
          ) : (
            <span className="text-xs text-ink-3">Unassigned</span>
          )
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: 'institutionId',
      header: 'ID',
      hideBelow: 'lg',
      render: (row) =>
        row.institutionId ? (
          <span className="tnum text-sm">{row.institutionId}</span>
        ) : (
          <span className="text-ink-3">—</span>
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
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => {
        const isSelf = row.id === me?.id;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={isSelf}
              onClick={() => setReRoling(row)}
              title={isSelf ? 'You cannot change your own role' : undefined}
            >
              Role
            </Button>
            {row.status === 'deactivated' ? (
              <Button variant="ghost" size="sm" onClick={() => reactivate(row)}>
                <RotateCcw className="size-3.5" aria-hidden />
                Reactivate
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={isSelf}
                onClick={() => setDeactivating(row)}
                title={isSelf ? 'You cannot deactivate your own account' : undefined}
              >
                <UserMinus className="size-3.5" aria-hidden />
                Deactivate
              </Button>
            )}
          </div>
        );
      },
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
        title="Users & roles"
        description="Every account in your institution. Deactivation is immediate and reversible; history is never deleted."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" aria-hidden />
            New user
          </Button>
        }
      />

      <FilterBar
        search={table.state.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search name, email or ID…"
        filters={[
          {
            name: 'role',
            label: 'Role',
            allLabel: 'All roles',
            options: (query.data?.meta?.roles ?? []).map((role: any) => ({
              value: role.value,
              label: role.label,
            })),
          },
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
            options: (query.data?.meta?.statuses ?? []).map((status: string) => ({
              value: status,
              label: titleCase(status),
            })),
          },
        ]}
        values={table.state.filters}
        onFilterChange={table.setFilter}
        onReset={table.reset}
        actions={
          <span className="text-sm text-ink-2">
            {query.data?.pagination?.total ?? 0} account(s)
          </span>
        }
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
        caption="User accounts in your institution"
        empty={
          <div className="px-6 py-12 text-center">
            <UserPlus className="mx-auto size-6 text-ink-3" aria-hidden />
            <p className="mt-3 text-md font-bold">No accounts match those filters</p>
          </div>
        }
      />

      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        onDone={query.refetch}
        roles={query.data?.meta?.roles ?? [{ value: 'STUDENT', label: 'Participant' }]}
        departments={departments.data ?? []}
      />

      {reRoling && (
        <RoleChangeDialog
          user={reRoling}
          open={Boolean(reRoling)}
          onOpenChange={(open) => !open && setReRoling(null)}
          onDone={query.refetch}
          departments={departments.data ?? []}
        />
      )}

      <ConfirmDialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Deactivate ${deactivating?.name ?? ''}?`}
        description="Every session is invalidated immediately. Their records, evaluations and history are kept, and a trainer's batch assignments are restored if you reactivate them."
        confirmLabel="Deactivate account"
        tone="danger"
        requireReason
        reasonLabel="Reason"
        pending={pending}
        onConfirm={deactivate}
      />
    </GlobalPageBackground>
  );
}
