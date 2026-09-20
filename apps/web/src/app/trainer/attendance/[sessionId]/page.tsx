'use client';

import { AlertTriangle, ArrowLeft, Check, Save } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SearchInput } from '@/components/shared/filter-bar';
import { InfoNotice } from '@/components/shared/misc';
import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

const STATUS_TONE: Record<string, string> = {
  present: 'bg-success text-white border-success',
  absent: 'bg-danger text-white border-danger',
  late: 'bg-amber text-white border-amber',
  leave: 'bg-info text-white border-info',
};

export default function MarkAttendancePage() {
  const params = useParams<{ sessionId: string }>();
  const query = useApi<any>(`/trainer/sessions/${params.sessionId}/attendance`);

  const [marks, setMarks] = React.useState<Record<string, string>>({});
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [search, setSearch] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [rejected, setRejected] = React.useState<any[]>([]);

  React.useEffect(() => {
    const roster = query.data?.roster;
    if (!roster) return;
    const initial: Record<string, string> = {};
    const initialRemarks: Record<string, string> = {};
    for (const row of roster) {
      if (row.status) initial[row.studentUserId] = row.status;
      if (row.remark) initialRemarks[row.studentUserId] = row.remark;
    }
    setMarks(initial);
    setRemarks(initialRemarks);
  }, [query.data]);

  const roster: any[] = query.data?.roster ?? [];
  const statuses: string[] = query.data?.statuses ?? ['present', 'absent', 'late', 'leave'];
  const alreadyMarked = Boolean(query.data?.alreadyMarked);
  const visible = roster.filter(
    (row) =>
      !search ||
      row.name?.toLowerCase().includes(search.toLowerCase()) ||
      row.rollNumber?.toLowerCase().includes(search.toLowerCase()),
  );
  const markedCount = Object.keys(marks).length;

  function setAll(status: string) {
    const next: Record<string, string> = { ...marks };
    for (const row of visible) next[row.studentUserId] = status;
    setMarks(next);
  }

  async function save(overwrite: boolean) {
    setSaving(true);
    setRejected([]);
    try {
      const response = await api.post('/trainer/attendance', {
        trainingSessionId: params.sessionId,
        overwrite,
        entries: Object.entries(marks).map(([studentUserId, status]) => ({
          studentUserId,
          status,
          remark: remarks[studentUserId] || undefined,
        })),
      });
      toast.success(response.message ?? 'Attendance saved');
      setRejected(response.data?.rejected ?? []);
      query.refetch();
      setConfirmOpen(false);
    } catch (caught) {
      const apiError = caught as ApiError;
      // A 409 means a record already exists — offer the explicit overwrite.
      if (apiError.status === 409 && !overwrite) {
        setConfirmOpen(true);
      } else {
        toast.error(apiError.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AsyncSection query={query} skeleton="table">
      {(data) => (
        <>
          <PageHeader
            breadcrumbs={[
              { label: "Today's Classes", href: '/trainer/classes' },
              { label: 'Attendance' },
            ]}
            title={data.session.topic ?? 'Session attendance'}
            description={`${data.session.batchName} · ${data.session.trainingModuleName} · ${formatDate(data.session.date, true)}`}
            actions={
              <Button asChild variant="secondary" size="sm">
                <Link href="/trainer/classes">
                  <ArrowLeft className="size-3.5" aria-hidden />
                  Back to classes
                </Link>
              </Button>
            }
          />

          {alreadyMarked && (
            <InfoNotice className="mb-4" tone="info">
              <span className="font-normal">
                <strong className="font-semibold">Already recorded — </strong>
                this session has attendance saved. Changes are kept as a correction with your name
                and the time against them; nothing is silently replaced.
              </span>
            </InfoNotice>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Roster</CardTitle>
                <CardSubtitle>
                  {markedCount} of {roster.length} marked
                </CardSubtitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {statuses.map((status) => (
                  <Button
                    key={status}
                    variant="secondary"
                    size="sm"
                    onClick={() => setAll(status)}
                    className="capitalize"
                  >
                    All {status}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardBody>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Find a student…"
                className="mb-4 w-full sm:w-[300px]"
              />

              <TableWrap>
                <Table>
                  <caption className="sr-only">
                    Attendance for {data.session.topic} on {formatDate(data.session.date)}
                  </caption>
                  <thead>
                    <Tr>
                      <Th>Student</Th>
                      <Th>Status</Th>
                      <Th hideBelow="md">Remark</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <Tr key={row.studentUserId}>
                        <Td>
                          <span className="block font-semibold">{row.name}</span>
                          <span className="block text-xs text-ink-3">{row.rollNumber}</span>
                        </Td>
                        <Td>
                          <div
                            className="flex flex-wrap gap-1.5"
                            role="radiogroup"
                            aria-label={`Attendance for ${row.name}`}
                          >
                            {statuses.map((status) => {
                              const active = marks[row.studentUserId] === status;
                              return (
                                <button
                                  key={status}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  onClick={() =>
                                    setMarks((current) => ({
                                      ...current,
                                      [row.studentUserId]: status,
                                    }))
                                  }
                                  className={cn(
                                    'rounded-full border px-2.5 py-1 text-xs font-semibold capitalize transition-colors',
                                    active
                                      ? STATUS_TONE[status]
                                      : 'border-line bg-white text-ink-2 hover:bg-app',
                                  )}
                                >
                                  {active && <Check className="mr-1 inline size-3" aria-hidden />}
                                  {status}
                                </button>
                              );
                            })}
                          </div>
                        </Td>
                        <Td hideBelow="md">
                          <Input
                            aria-label={`Remark for ${row.name}`}
                            value={remarks[row.studentUserId] ?? ''}
                            onChange={(event) =>
                              setRemarks((current) => ({
                                ...current,
                                [row.studentUserId]: event.target.value,
                              }))
                            }
                            placeholder="Optional"
                            className="h-8 max-w-[220px]"
                          />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>

              {rejected.length > 0 && (
                <div
                  role="alert"
                  className="mt-4 rounded-[10px] bg-danger-bg px-3.5 py-3 text-sm text-danger"
                >
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {rejected.length} entr(ies) were refused
                  </p>
                  <ul className="mt-1.5 list-disc pl-5">
                    {rejected.map((row) => (
                      <li key={row.studentUserId}>{row.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  loading={saving}
                  disabled={markedCount === 0}
                  onClick={() => save(alreadyMarked)}
                >
                  <Save className="size-3.5" aria-hidden />
                  {alreadyMarked ? 'Save correction' : 'Save attendance'}
                </Button>
                {markedCount < roster.length && (
                  <Badge tone="amber">
                    {roster.length - markedCount} student(s) still unmarked
                  </Badge>
                )}
              </div>
            </CardBody>
          </Card>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Overwrite the recorded attendance?"
            description="Attendance for this session already exists. Saving again records a correction attributed to you — the previous values stay in the audit trail."
            confirmLabel="Save correction"
            pending={saving}
            onConfirm={() => save(true)}
          />
        </>
      )}
    </AsyncSection>
  );
}
