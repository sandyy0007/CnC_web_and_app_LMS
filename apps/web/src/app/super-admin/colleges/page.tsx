'use client';

import {
  Building2,
  CheckCircle2,
  Edit2,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Search,
  Users,
} from 'lucide-react';
import * as React from 'react';

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
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

interface College {
  id: string;
  name: string;
  code: string;
  address: string;
  contact: {
    email?: string;
    phone?: string;
  };
  status: string;
  timezone: string;
  institutionType?: string;
  trainingType?: string;
  departmentsCount: number;
  studentsCount: number;
  participantsCount?: number;
  trainersCount: number;
  createdAt: string;
}

export default function SuperAdminCollegesPage() {
  const query = useApi<College[]>('/super-admin/colleges', undefined, {
    select: (res) => res.data ?? res,
  });

  const [search, setSearch] = React.useState('');
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  // Form state
  const [formName, setFormName] = React.useState('');
  const [formCode, setFormCode] = React.useState('');
  const [formType, setFormType] = React.useState('COLLEGE');
  const [formAddress, setFormAddress] = React.useState('');
  const [formEmail, setFormEmail] = React.useState('');
  const [formPhone, setFormPhone] = React.useState('');
  const [formTimezone, setFormTimezone] = React.useState('Asia/Kolkata');

  const colleges: College[] = Array.isArray(query.data) ? query.data : [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!formName || !formCode) return;

    setSubmitting(true);
    try {
      await api.post('/super-admin/colleges', {
        name: formName,
        code: formCode.toUpperCase(),
        institutionType: formType,
        address: formAddress,
        email: formEmail,
        phone: formPhone,
        timezone: formTimezone,
      });
      setCreateModalOpen(false);
      setFormName('');
      setFormCode('');
      setFormType('COLLEGE');
      setFormAddress('');
      setFormEmail('');
      setFormPhone('');
      query.refetch();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create institution');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCollegeStatus = async (college: College) => {
    const nextStatus = college.status === 'active' ? 'suspended' : 'active';
    try {
      await api.patch(`/super-admin/colleges/${college.id}`, {
        status: nextStatus,
      });
      query.refetch();
    } catch {
      // ignore
    }
  };

  const filtered = colleges.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <GlobalPageBackground image="/images/backgrounds/colleges.webp" variant="dark">
      <div className="space-y-6">
      <PageHeader
        title="Colleges & Institutions"
        description="Onboard and manage academic tenant environments, campuses, and quota configurations."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setErrorMsg('');
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Plus className="size-4" />
            Onboard New College
          </Button>
        }
      />

      {/* Filter and stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by college name, code, or city…"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <Badge tone="indigo" dot>
            {colleges.length} Institutions Total
          </Badge>
        </div>
      </div>

      {/* Colleges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((college) => (
          <Card
            key={college.id}
            className={cn(
              'flex flex-col justify-between transition-all hover:shadow-md',
              college.status !== 'active' && 'opacity-70 bg-slate-50 dark:bg-slate-900/40'
            )}
          >
            <CardBody className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="p-2.5 rounded-xl bg-indigo/10 text-indigo inline-block">
                    <Building2 className="size-5" />
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <Badge tone="indigo">
                      {college.trainingType === 'COOPERATIVE' ? 'Cooperative' : college.trainingType === 'SCHOOL' ? 'School' : 'College Training'}
                    </Badge>
                    <Badge tone={college.status === 'active' ? 'success' : 'danger'}>
                      {college.status}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900 dark:text-white line-clamp-1">
                      {college.name}
                    </h3>
                  </div>
                  <span className="text-xs font-mono text-indigo font-bold">{college.code}</span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                  {college.address && (
                    <p className="flex items-center gap-1.5 truncate">
                      <MapPin className="size-3.5 shrink-0 text-slate-400" />
                      {college.address}
                    </p>
                  )}
                  {college.contact?.email && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Mail className="size-3.5 shrink-0 text-slate-400" />
                      {college.contact.email}
                    </p>
                  )}
                  {college.contact?.phone && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Phone className="size-3.5 shrink-0 text-slate-400" />
                      {college.contact.phone}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-1 text-center">
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">
                      {num(college.departmentsCount)}
                    </p>
                    <p className="text-[10px] text-slate-400">Depts</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">
                      {num(college.participantsCount ?? college.studentsCount)}
                    </p>
                    <p className="text-[10px] text-slate-400">Participants</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">
                      {num(college.trainersCount)}
                    </p>
                    <p className="text-[10px] text-slate-400">Trainers</p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Onboarded {college.createdAt ? formatDate(college.createdAt) : 'Recently'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleCollegeStatus(college)}
                  className="text-xs flex items-center gap-1 h-7 p-1"
                >
                  <Power className="size-3" />
                  {college.status === 'active' ? 'Suspend' : 'Activate'}
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Onboard College Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Onboard New Institution</DialogTitle>
            <DialogDescription>
              Create an isolated tenant workspace for a new college, university, or institute.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs border border-rose-200">
                {errorMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Institution Type (Auto-Configures Training Model) *
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value="COLLEGE">College / University → College Training</option>
                <option value="COMPANY">Company / Corporate → Cooperative Training</option>
                <option value="SCHOOL">School / Academy → School Training</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Institution Name *
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., National Institute of Technology, Bangalore"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  College Code (Unique) *
                </label>
                <input
                  type="text"
                  required
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  placeholder="e.g., NITB"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Timezone
                </label>
                <input
                  type="text"
                  value={formTimezone}
                  onChange={(e) => setFormTimezone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Campus Address
              </label>
              <input
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="e.g., Electronic City Phase 1, Bengaluru, Karnataka"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Admin Contact Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="admin@nitb.edu.in"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Phone
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+91 80 2852 0000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting}
              >
                {submitting ? 'Creating Tenant…' : 'Create Institution'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </GlobalPageBackground>
  );
}
