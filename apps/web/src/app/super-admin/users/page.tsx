'use client';

import {
  Ban,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  GraduationCap,
  Key,
  Loader2,
  Lock,
  Mail,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { api, type ApiError } from '@/lib/api';
import { formatDate, num } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/nav';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  employeeId?: string;
  role: string;
  collegeId: string | null;
  collegeName: string;
  departmentId?: string | null;
  departmentName?: string | null;
  designation?: string;
  qualification?: string;
  specialization?: string;
  status: string;
  accountStatus: string;
  permissions?: string[];
  mustChangePassword?: boolean;
  activationToken?: string;
  createdAt: string | null;
}

interface UsersApiResponse {
  items: UserRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export default function SuperAdminUsersPage() {
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>('');
  const [page, setPage] = React.useState<number>(1);

  // Modal States
  const [provisionOpen, setProvisionOpen] = React.useState(false);
  const [provisioning, setProvisioning] = React.useState(false);
  const [provisionResult, setProvisionResult] = React.useState<{
    activationToken: string;
    activationUrl: string;
    temporaryPassword?: string;
    user: any;
  } | null>(null);

  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedPassword, setCopiedPassword] = React.useState(false);

  // Form State
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    mobile: '',
    employeeId: '',
    role: 'TRAINER',
    collegeId: '',
    departmentId: '',
    designation: '',
    qualification: '',
    specialization: '',
    temporaryPassword: '',
  });

  const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([
    'VIEW_ASSIGNED_CLASSES',
    'MARK_ATTENDANCE',
    'VIEW_ASSIGNED_STUDENTS',
    'VIEW_ASSIGNED_COURSE',
    'MANAGE_ASSIGNED_CONTENT',
    'VIEW_ASSIGNED_ANALYTICS',
  ]);

  const ROLE_PERMISSION_OPTIONS: Record<string, string[]> = {
    ADMIN: [
      'VIEW_STUDENTS', 'VIEW_TRAINERS', 'MANAGE_TRAINERS', 'ASSIGN_TRAINER',
      'VIEW_ATTENDANCE', 'MANAGE_ATTENDANCE', 'VIEW_COURSES', 'MANAGE_CLASSES',
      'VIEW_COLLEGE_PAYMENTS', 'VIEW_REPORTS'
    ],
    TRAINER: [
      'VIEW_ASSIGNED_CLASSES', 'MARK_ATTENDANCE', 'VIEW_ASSIGNED_STUDENTS',
      'VIEW_ASSIGNED_COURSE', 'MANAGE_ASSIGNED_CONTENT', 'VIEW_ASSIGNED_ANALYTICS'
    ],
    HOD: [
      'VIEW_DEPARTMENT_STUDENTS', 'VIEW_DEPARTMENT_TRAINERS', 'ASSIGN_DEPARTMENT_TRAINERS',
      'VIEW_DEPARTMENT_ATTENDANCE', 'VIEW_DEPARTMENT_REPORTS'
    ],
    SUPER_ADMIN: ['ALL_PERMISSIONS'],
  };

  const handleRoleChange = (newRole: string) => {
    setForm({ ...form, role: newRole });
    setSelectedPermissions(ROLE_PERMISSION_OPTIONS[newRole] || []);
  };

  const togglePermission = (perm: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useApi<UsersApiResponse>('/super-admin/users', {
    role: roleFilter !== 'all' ? roleFilter : undefined,
    search: debouncedSearch || undefined,
    page,
    pageSize: 20,
  });

  const collegesQuery = useApi<any[]>('/super-admin/colleges', undefined, {
    select: (res) => res.data ?? res,
  });

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination ?? {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  };

  const colleges = Array.isArray(collegesQuery.data) ? collegesQuery.data : [];

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    try {
      const res = await api.post<any>('/super-admin/users', {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile.trim(),
        employeeId: form.employeeId.trim(),
        role: form.role,
        permissions: selectedPermissions,
        collegeId: form.collegeId || undefined,
        departmentId: form.departmentId || undefined,
        designation: form.designation.trim(),
        qualification: form.qualification.trim(),
        specialization: form.specialization.trim(),
        temporaryPassword: form.temporaryPassword.trim() || undefined,
      });

      toast.success('User account provisioned successfully!');
      setProvisionResult({
        activationToken: res.activationToken,
        activationUrl: res.activationUrl,
        temporaryPassword: res.temporaryPassword,
        user: res.data,
      });
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to provision user.');
    } finally {
      setProvisioning(false);
    }
  };

  const handleStatusChange = async (userId: string, action: 'activate' | 'suspend' | 'deactivate') => {
    try {
      await api.post(`/super-admin/users/${userId}/${action}`);
      toast.success(`User successfully updated (${action}).`);
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || `Failed to update user.`);
    }
  };

  const handleCopy = (text: string, type: 'link' | 'password') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success('Activation link copied to clipboard!');
    } else {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
      toast.success('Temporary password copied to clipboard!');
    }
  };

  const getRoleTone = (role: string): 'danger' | 'indigo' | 'info' | 'amber' | 'success' | 'neutral' => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'danger';
      case 'ADMIN':
        return 'indigo';
      case 'HOD':
        return 'info';
      case 'TRAINER':
        return 'amber';
      case 'STUDENT':
        return 'success';
      default:
        return 'neutral';
    }
  };

  const getStatusTone = (status: string): 'success' | 'amber' | 'danger' | 'neutral' => {
    switch (status) {
      case 'active':
        return 'success';
      case 'pending_verification':
        return 'amber';
      case 'suspended':
        return 'danger';
      case 'inactive':
      default:
        return 'neutral';
    }
  };

  return (
    <GlobalPageBackground image="/images/backgrounds/users.webp" variant="dark">
      <div className="space-y-6">
      <PageHeader
        title="Cross-Tenant Users & RBAC Management"
        description="Provision privileged accounts (Admin, SPOC, Trainer), manage tenant affiliations, and monitor activation status."
        actions={
          <div className="flex items-center gap-3">
            <Badge tone="indigo" dot>
              {num(pagination.total)} Registered Users
            </Badge>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setProvisionResult(null);
                setForm({
                  name: '',
                  email: '',
                  mobile: '',
                  employeeId: '',
                  role: 'TRAINER',
                  collegeId: colleges[0]?.id || '',
                  departmentId: '',
                  designation: '',
                  qualification: '',
                  specialization: '',
                  temporaryPassword: '',
                });
                setProvisionOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <UserPlus className="size-4" />
              Provision Staff Account
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, email, or employee ID…"
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium w-full sm:w-auto"
              >
                <option value="all">All Roles</option>
                <option value="STUDENT">Participants</option>
                <option value="TRAINER">Trainers</option>
                <option value="HOD">SPOCs</option>
                <option value="ADMIN">College Admins</option>
                <option value="SUPER_ADMIN">Super Admins</option>
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Directory Table */}
      <Card>
        <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <CardTitle className="text-base">User Directory & Status Management</CardTitle>
          <span className="text-xs text-slate-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No users matching criteria found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-5 py-3">User & Contact</th>
                    <th className="px-5 py-3">Role & Employee ID</th>
                    <th className="px-5 py-3">Institution & Dept</th>
                    <th className="px-5 py-3">Account Status</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-xs">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{u.name}</p>
                            <p className="text-[11px] text-slate-400">{u.email}</p>
                            {u.mobile && (
                              <p className="text-[10px] text-slate-400">Ph: {u.mobile}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="space-y-1">
                          <Badge tone={getRoleTone(u.role)}>
                            {ROLE_LABEL[u.role] || u.role.replace('_', ' ')}
                          </Badge>
                          {u.employeeId && (
                            <p className="text-[11px] font-mono text-slate-500">ID: {u.employeeId}</p>
                          )}
                          {u.designation && (
                            <p className="text-[11px] text-slate-400">{u.designation}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-700 dark:text-slate-300">{u.collegeName}</p>
                        {u.departmentName && (
                          <p className="text-[11px] text-slate-400">{u.departmentName}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="space-y-1">
                          <Badge tone={getStatusTone(u.accountStatus || u.status)}>
                            {u.accountStatus === 'pending_verification'
                              ? 'Pending Activation'
                              : u.accountStatus || u.status}
                          </Badge>
                          {u.mustChangePassword && (
                            <span className="block text-[10px] text-amber-600 font-medium">
                              Must change pwd
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {u.createdAt ? formatDate(u.createdAt) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.accountStatus === 'pending_verification' && (
                            <>
                              {u.activationToken && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleCopy(
                                      `${window.location.origin}/activate?token=${u.activationToken}`,
                                      'link'
                                    )
                                  }
                                  title="Copy single-use activation link"
                                  className="h-7 px-2 text-[11px]"
                                >
                                  <Copy className="size-3 mr-1" />
                                  Link
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleStatusChange(u.id, 'activate')}
                                className="h-7 px-2 text-[11px] text-emerald-600 hover:text-emerald-700"
                              >
                                Activate
                              </Button>
                            </>
                          )}
                          {u.status === 'active' && u.role !== 'SUPER_ADMIN' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStatusChange(u.id, 'suspend')}
                              className="h-7 px-2 text-[11px] text-rose-500 hover:bg-rose-50"
                            >
                              Suspend
                            </Button>
                          )}
                          {u.status === 'suspended' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleStatusChange(u.id, 'activate')}
                              className="h-7 px-2 text-[11px] text-emerald-600"
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
              {pagination.total} entries
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!pagination.hasPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 px-2 flex items-center gap-1 text-xs"
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 px-2 flex items-center gap-1 text-xs"
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Provisioning Modal */}
      <Dialog open={provisionOpen} onOpenChange={setProvisionOpen}>
        <DialogContent wide className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {provisionResult ? 'Account Credentials & Activation' : 'Provision Privileged Staff Account'}
            </DialogTitle>
            <DialogDescription>
              {provisionResult
                ? 'Share this single-use activation link with the staff member to let them set their password.'
                : 'Super Admin provisioning for Institutional Admins, Department HODs, and Lead Trainers.'}
            </DialogDescription>
          </DialogHeader>

          {provisionResult ? (
            <div className="p-6 space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  Account successfully provisioned in PENDING_VERIFICATION state!
                </div>
                <p className="text-xs text-emerald-700">
                  User: <strong>{provisionResult.user?.name}</strong> ({provisionResult.user?.email}) · Role: {provisionResult.user?.role}
                </p>
              </div>

              {/* Activation Link */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Single-Use Activation URL (Expires in 7 days):</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={
                      typeof window !== 'undefined'
                        ? `${window.location.origin}${provisionResult.activationUrl}`
                        : provisionResult.activationUrl
                    }
                    className="flex-1 bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg font-mono text-slate-700"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      handleCopy(
                        `${window.location.origin}${provisionResult.activationUrl}`,
                        'link'
                      )
                    }
                    className="flex items-center gap-1 shrink-0"
                  >
                    {copiedLink ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copiedLink ? 'Copied' : 'Copy Link'}
                  </Button>
                </div>
              </div>

              {/* Temporary Password */}
              {provisionResult.temporaryPassword && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Generated Initial Password:</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={provisionResult.temporaryPassword}
                      className="flex-1 bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg font-mono font-bold text-indigo-700"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy(provisionResult.temporaryPassword!, 'password')}
                      className="flex items-center gap-1 shrink-0"
                    >
                      {copiedPassword ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiedPassword ? 'Copied' : 'Copy Pwd'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    User will be forced to change this password on first sign-in (mustChangePassword = true).
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => {
                    setProvisionOpen(false);
                    setProvisionResult(null);
                  }}
                >
                  Done & Close
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleProvisionSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name" htmlFor="pName" required>
                  <Input
                    id="pName"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Dr. Rajesh Sharma"
                  />
                </Field>

                <Field label="Institutional Email" htmlFor="pEmail" required>
                  <Input
                    id="pEmail"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="rsharma@rvce.edu.in"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Role" htmlFor="pRole" required>
                  <select
                    id="pRole"
                    value={form.role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium"
                  >
                    <option value="TRAINER">Lead Trainer</option>
                    <option value="HOD">Single Point of Contact (SPOC)</option>
                    <option value="ADMIN">College Administrator</option>
                    <option value="SUPER_ADMIN">Platform Super Admin</option>
                  </select>
                </Field>

                <Field label="Mobile Number" htmlFor="pMobile">
                  <Input
                    id="pMobile"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </Field>

                <Field label="Employee / Trainer ID" htmlFor="pEmpId">
                  <Input
                    id="pEmpId"
                    value={form.employeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                    placeholder="EMP-2026-99"
                  />
                </Field>
              </div>

              {/* Granular Permission Badges Selector */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800">
                    Granular Access Permissions ({selectedPermissions.length} granted)
                  </label>
                  <span className="text-[11px] text-slate-500">Super Admin Enforced</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(ROLE_PERMISSION_OPTIONS[form.role] || []).map((perm) => {
                    const active = selectedPermissions.includes(perm);
                    return (
                      <button
                        type="button"
                        key={perm}
                        onClick={() => togglePermission(perm)}
                        className={`text-[11px] px-2.5 py-1 rounded-md font-mono transition-all ${
                          active
                            ? 'bg-indigo text-white shadow-xs font-semibold'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {perm}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.role !== 'SUPER_ADMIN' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Institution / College" htmlFor="pCollege" required>
                    <select
                      id="pCollege"
                      value={form.collegeId}
                      onChange={(e) => setForm({ ...form, collegeId: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium"
                    >
                      <option value="">Select College…</option>
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Designation" htmlFor="pDesig">
                    <Input
                      id="pDesig"
                      value={form.designation}
                      onChange={(e) => setForm({ ...form, designation: e.target.value })}
                      placeholder="Senior Technical Trainer"
                    />
                  </Field>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Qualification" htmlFor="pQual">
                  <Input
                    id="pQual"
                    value={form.qualification}
                    onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                    placeholder="M.Tech CSE / Ph.D"
                  />
                </Field>

                <Field label="Specialization" htmlFor="pSpec">
                  <Input
                    id="pSpec"
                    value={form.specialization}
                    onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                    placeholder="Full Stack, DSA, Aptitude"
                  />
                </Field>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setProvisionOpen(false)}
                  disabled={provisioning}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={provisioning}
                  disabled={provisioning || !form.name || !form.email}
                >
                  Provision User Account
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  </GlobalPageBackground>
  );
}
