'use client';

import { Award, Briefcase, Building2, Plus, Users } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection, ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/misc';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { ApiError, api } from '@/lib/api';
import { formatDate, num, pct } from '@/lib/format';

function CreateDriveDialog({
  open,
  onOpenChange,
  onDone,
  batches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  batches: any[];
}) {
  const [form, setForm] = React.useState({
    company: '',
    title: '',
    startsAt: '',
    endsAt: '',
    minReadinessScore: '70',
    recruiterEmails: '',
  });
  const [selected, setSelected] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function submit() {
    setPending(true);
    setFieldErrors({});
    try {
      await api.post('/admin/placements', {
        company: form.company,
        title: form.title,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        eligibleBatchIds: selected,
        minReadinessScore: Number(form.minReadinessScore),
        recruiterEmails: form.recruiterEmails
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean),
      });
      toast.success('Placement drive created');
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
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New placement drive</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="company" required error={fieldErrors.company}>
              <Input
                id="company"
                value={form.company}
                onChange={(event) => setForm({ ...form, company: event.target.value })}
              />
            </Field>
            <Field label="Drive title" htmlFor="title" required error={fieldErrors.title}>
              <Input
                id="title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Campus 2026"
              />
            </Field>
            <Field label="Starts" htmlFor="startsAt" required error={fieldErrors.startsAt}>
              <Input
                id="startsAt"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
              />
            </Field>
            <Field label="Ends" htmlFor="endsAt" error={fieldErrors.endsAt}>
              <Input
                id="endsAt"
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
              />
            </Field>
            <Field
              label="Minimum readiness score"
              htmlFor="minReadinessScore"
              error={fieldErrors.minReadinessScore}
            >
              <Input
                id="minReadinessScore"
                type="number"
                min={0}
                max={100}
                value={form.minReadinessScore}
                onChange={(event) =>
                  setForm({ ...form, minReadinessScore: event.target.value })
                }
              />
            </Field>
            <Field
              label="Recruiter emails"
              htmlFor="recruiterEmails"
              hint="Comma separated"
              error={fieldErrors.recruiterEmails}
            >
              <Input
                id="recruiterEmails"
                value={form.recruiterEmails}
                onChange={(event) => setForm({ ...form, recruiterEmails: event.target.value })}
              />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Eligible batches</legend>
            <div className="scroll-thin max-h-[170px] space-y-1.5 overflow-y-auto rounded-[10px] border border-line p-3">
              {batches.map((batch) => (
                <label key={batch.id} className="flex items-center gap-2.5 text-base">
                  <Checkbox
                    checked={selected.includes(batch.id)}
                    onCheckedChange={(value) =>
                      setSelected((current) =>
                        value
                          ? [...current, batch.id]
                          : current.filter((id) => id !== batch.id),
                      )
                    }
                  />
                  {batch.name} · {batch.departmentName}
                </label>
              ))}
            </div>
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!form.company || !form.title || !form.startsAt}
            onClick={submit}
          >
            Create drive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTemplateDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [form, setForm] = React.useState({
    name: '',
    code: '',
    minAttendance: '75',
    minAvgScore: '60',
  });
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function submit() {
    setPending(true);
    setFieldErrors({});
    try {
      await api.post('/admin/certificate-templates', {
        name: form.name,
        code: form.code.toUpperCase(),
        minAttendance: Number(form.minAttendance),
        minAvgScore: Number(form.minAvgScore),
        active: true,
      });
      toast.success('Certificate template created');
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
          <DialogTitle>New certificate template</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Name" htmlFor="template-name" required error={fieldErrors.name}>
            <Input
              id="template-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Code" htmlFor="template-code" required error={fieldErrors.code}>
            <Input
              id="template-code"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Minimum attendance %"
              htmlFor="minAttendance"
              error={fieldErrors.minAttendance}
            >
              <Input
                id="minAttendance"
                type="number"
                min={0}
                max={100}
                value={form.minAttendance}
                onChange={(event) => setForm({ ...form, minAttendance: event.target.value })}
              />
            </Field>
            <Field
              label="Minimum average score"
              htmlFor="minAvgScore"
              error={fieldErrors.minAvgScore}
            >
              <Input
                id="minAvgScore"
                type="number"
                min={0}
                max={100}
                value={form.minAvgScore}
                onChange={(event) => setForm({ ...form, minAvgScore: event.target.value })}
              />
            </Field>
          </div>
          <p className="text-sm text-ink-3">
            Both criteria must be met before a certificate can be issued. Changing a template does
            not retroactively revoke anything already issued.
          </p>
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
            Create template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPlacementsPage() {
  const drives = useApi<any[]>('/admin/placements');
  const templates = useApi<any[]>('/admin/certificate-templates');
  const batches = useApi<any>('/admin/batches', { pageSize: 100 }, {
    select: (raw) => ({ items: raw.items }),
  });

  const certTable = useTableState('admin-certificates', { pageSize: 25 });
  const certificates = useApi<any>('/admin/certificates', certTable.params, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination, meta: raw.meta }),
  });

  const [creatingDrive, setCreatingDrive] = React.useState(false);
  const [creatingTemplate, setCreatingTemplate] = React.useState(false);
  const [issuing, setIssuing] = React.useState<any>(null);
  const [pending, setPending] = React.useState(false);

  async function issue() {
    setPending(true);
    try {
      const response = await api.post('/admin/certificates/issue', {
        certificateId: issuing.id,
      });
      toast.success(response.message ?? 'Certificate issued');
      setIssuing(null);
      certificates.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  const certColumns: Column<any>[] = [
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
      key: 'attendance',
      header: 'Attendance',
      align: 'right',
      render: (row) => (
        <span className="tnum">
          {pct(row.attendancePct, 0)}
          <span className="text-xs text-ink-3">
            {' '}
            / {pct(row.criteria?.minAttendance, 0)}
          </span>
        </span>
      ),
    },
    {
      key: 'score',
      header: 'Avg score',
      align: 'right',
      render: (row) => (
        <span className="tnum">
          {num(row.avgScore, 1)}
          <span className="text-xs text-ink-3"> / {num(row.criteria?.minAvgScore, 0)}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
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
      key: 'issue',
      header: '',
      align: 'right',
      render: (row) =>
        row.status === 'issued' ? (
          <span className="tnum text-sm text-ink-2">{row.certificateNo ?? 'Issued'}</span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={!row.eligibilityMet}
            title={row.eligibilityMet ? undefined : 'Criteria are not met'}
            onClick={() => setIssuing(row)}
          >
            <Award className="size-3.5" aria-hidden />
            Issue
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Placements & certificates"
        description="Drives, certificate templates and who is eligible for what."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreatingTemplate(true)}>
              <Plus className="size-3.5" aria-hidden />
              New template
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreatingDrive(true)}>
              <Plus className="size-3.5" aria-hidden />
              New drive
            </Button>
          </>
        }
      />

      {certificates.data?.meta?.counts && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Issued"
            value={num(certificates.data.meta.counts.issued)}
            icon={<Award />}
            tone="success"
          />
          <StatCard
            label="Pending"
            value={num(certificates.data.meta.counts.pending)}
            icon={<Award />}
            tone="amber"
          />
          <StatCard
            label="Not eligible"
            value={num(certificates.data.meta.counts.not_eligible)}
            icon={<Award />}
            tone="danger"
          />
          <StatCard
            label="Revoked"
            value={num(certificates.data.meta.counts.revoked)}
            icon={<Award />}
            tone="purple"
          />
        </div>
      )}

      <Tabs defaultValue="drives" className="mt-5">
        <TabsList>
          <TabsTrigger value="drives">Placement drives</TabsTrigger>
          <TabsTrigger value="templates">Certificate templates</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
        </TabsList>

        <TabsContent value="drives">
          <AsyncSection query={drives} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
            {(rows) => (
              <div className="grid gap-4 lg:grid-cols-2">
                {rows.map((drive) => (
                  <Card key={drive.id}>
                    <CardHeader>
                      <div className="min-w-0">
                        <CardTitle>{drive.title}</CardTitle>
                        <CardSubtitle>{drive.company}</CardSubtitle>
                      </div>
                      <StatusBadge status={drive.status} />
                    </CardHeader>
                    <CardBody>
                      <dl className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <dt className="text-xs text-ink-3">Window</dt>
                          <dd className="text-sm font-semibold">
                            {formatDate(drive.startsAt)}
                            {drive.endsAt ? ` – ${formatDate(drive.endsAt)}` : ''}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-3">Min readiness</dt>
                          <dd className="tnum text-sm font-semibold">
                            {num(drive.minReadinessScore, 0)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-3">Eligible</dt>
                          <dd className="tnum flex items-center gap-1 text-sm font-semibold">
                            <Users className="size-3.5 text-ink-3" aria-hidden />
                            {num(drive.eligibleParticipants)}
                          </dd>
                        </div>
                      </dl>
                      {drive.recruiterEmails?.length > 0 && (
                        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
                          <Building2 className="size-3.5" aria-hidden />
                          {drive.recruiterEmails.join(', ')}
                        </p>
                      )}
                      <p className="mt-2.5 text-xs text-ink-3">
                        {drive.eligibleBatchIds?.length ?? 0} batch(es) invited
                      </p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </AsyncSection>
        </TabsContent>

        <TabsContent value="templates">
          <AsyncSection query={templates} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
            {(rows) => (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((template) => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="min-w-0">
                        <CardTitle>{template.name}</CardTitle>
                        <CardSubtitle>{template.code}</CardSubtitle>
                      </div>
                      <Badge tone={template.active ? 'success' : 'neutral'}>
                        {template.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </CardHeader>
                    <CardBody>
                      <dl className="tnum grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-[8px] bg-app px-2 py-2">
                          <dd className="text-md font-bold">
                            {num(template.criteria?.minAttendance, 0)}%
                          </dd>
                          <dt className="text-2xs text-ink-3">Min attendance</dt>
                        </div>
                        <div className="rounded-[8px] bg-app px-2 py-2">
                          <dd className="text-md font-bold">
                            {num(template.criteria?.minAvgScore, 0)}
                          </dd>
                          <dt className="text-2xs text-ink-3">Min score</dt>
                        </div>
                        <div className="rounded-[8px] bg-app px-2 py-2">
                          <dd className="text-md font-bold">{num(template.issuedToDate)}</dd>
                          <dt className="text-2xs text-ink-3">Issued</dt>
                        </div>
                      </dl>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </AsyncSection>
        </TabsContent>

        <TabsContent value="certificates">
          <FilterBar
            search={certTable.state.search}
            onSearchChange={certTable.setSearch}
            searchPlaceholder="Search participant or roll number…"
            filters={[
              {
                name: 'status',
                label: 'Status',
                allLabel: 'All statuses',
                options: [
                  { value: 'issued', label: 'Issued' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'not_eligible', label: 'Not eligible' },
                  { value: 'revoked', label: 'Revoked' },
                ],
              },
            ]}
            values={certTable.state.filters}
            onFilterChange={certTable.setFilter}
            onReset={certTable.reset}
          />

          {certificates.error ? (
            <ErrorState error={certificates.error} onRetry={certificates.refetch} />
          ) : (
            <DataTable
              columns={certColumns}
              rows={certificates.data?.items ?? []}
              loading={certificates.initialLoading}
              pagination={certificates.data?.pagination}
              onPageChange={certTable.setPage}
              rowKey={(row) => row.id}
              caption="Certificate eligibility across the institution"
            />
          )}
        </TabsContent>
      </Tabs>

      <CreateDriveDialog
        open={creatingDrive}
        onOpenChange={setCreatingDrive}
        onDone={drives.refetch}
        batches={batches.data?.items ?? []}
      />
      <CreateTemplateDialog
        open={creatingTemplate}
        onOpenChange={setCreatingTemplate}
        onDone={templates.refetch}
      />

      <ConfirmDialog
        open={Boolean(issuing)}
        onOpenChange={(open) => !open && setIssuing(null)}
        title={`Issue a certificate to ${issuing?.studentName ?? ''}?`}
        description="A certificate number is generated and the participant is notified. Issuing is recorded in the audit trail and cannot be silently undone."
        confirmLabel="Issue certificate"
        pending={pending}
        onConfirm={issue}
      />
    </>
  );
}
