'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Upload,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { API_BASE, ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

const ENTITIES = [
  {
    code: 'students',
    label: 'Participants',
    help: 'Columns: name, email, rollNumber, departmentCode, batchCode, semester, section.',
  },
  {
    code: 'trainers',
    label: 'Trainers',
    help: 'Columns: name, email, departmentCode, designation, specializations, phone, assignedBatchCode.',
  },
  {
    code: 'batches',
    label: 'Batches',
    help: 'Columns: name, code, departmentCode, semester, capacity, status.',
  },
  {
    code: 'attendance',
    label: 'Attendance',
    help: 'Columns: rollNumber, sessionId, status (PRESENT|ABSENT|LATE|EXCUSED), remarks.',
  },
];

export default function BulkImportPage() {
  const jobs = useApi<any>('/admin/import/jobs', { pageSize: 20 }, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const [entity, setEntity] = React.useState('students');
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [guidelines, setGuidelines] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await api.upload(`/admin/import/${entity}`, form);
      setResult(response.data);
      setGuidelines(response.meta?.guidelines ?? []);
      if (response.data.failureCount > 0) {
        toast.warning(response.message ?? 'Import finished with rejected rows');
      } else {
        toast.success(response.message ?? 'Import complete');
      }
      jobs.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const chosen = ENTITIES.find((item) => item.code === entity);

  return (
    <GlobalPageBackground
      image="/images/backgrounds/colleges.webp"
      variant="dark"
      orbTone="cyan"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="Bulk import"
        description="Every row is validated before it commits. Valid rows are imported; rejected rows come back with the exact reason."
      />

      <Card elevated className="mb-5">
        <CardHeader>
          <div>
            <CardTitle>Import a CSV</CardTitle>
            <CardSubtitle>Download the template first — the header row matters</CardSubtitle>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {ENTITIES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setEntity(item.code)}
                aria-pressed={entity === item.code}
                className={cn(
                  'rounded-xl border p-3.5 text-left transition-all duration-200 active:scale-[0.98]',
                  entity === item.code
                    ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-3d-hover'
                    : 'border-white/10 surface-3d hover:border-white/20 text-slate-200 hover:shadow-3d-card',
                )}
              >
                <span className="flex items-center gap-2 text-base font-semibold">
                  <FileSpreadsheet className="size-4 text-slate-300" aria-hidden />
                  {item.label}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-400">{item.help}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button asChild variant="secondary" size="sm">
              <a href={`${API_BASE}/admin/import/template/${entity}`} download>
                <Download className="size-3.5" aria-hidden />
                Download {chosen?.label} CSV Template
              </a>
            </Button>
            <input
              ref={inputRef}
              id="import-file"
              type="file"
              accept=".csv,.txt"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              variant="primary"
              size="sm"
              loading={uploading}
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-3.5" aria-hidden />
              Upload {chosen?.label} CSV
            </Button>
          </div>

          {guidelines.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {guidelines.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-slate-300">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-cyan-400" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {result && (
        <Card className="mb-5">
          <CardHeader>
            <div>
              <CardTitle>Import result</CardTitle>
              <CardSubtitle>
                {result.entity} · {num(result.totalRows)} row(s) in the file
              </CardSubtitle>
            </div>
            <StatusBadge status={result.status} />
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[10px] bg-emerald-500/20 border border-emerald-500/30 px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Imported
                </p>
                <p className="tnum mt-0.5 text-[22px] font-bold text-emerald-300">{num(result.insertedCount ?? result.successCount)}</p>
              </div>
              <div className="rounded-[10px] bg-cyan-500/20 border border-cyan-500/30 px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Updated
                </p>
                <p className="tnum mt-0.5 text-[22px] font-bold text-cyan-300">{num(result.updatedCount ?? 0)}</p>
              </div>
              <div className="rounded-[10px] bg-amber-500/20 border border-amber-500/30 px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <Info className="size-3.5" aria-hidden />
                  Duplicates Skipped
                </p>
                <p className="tnum mt-0.5 text-[22px] font-bold text-amber-300">{num(result.skippedDuplicates ?? 0)}</p>
              </div>
              <div className="rounded-[10px] bg-rose-500/20 border border-rose-500/30 px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  Rejected
                </p>
                <p className="tnum mt-0.5 text-[22px] font-bold text-rose-300">{num(result.failureCount)}</p>
              </div>
            </div>

            {((result.errors && result.errors.length > 0) || (result.failedRows && result.failedRows.length > 0)) && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Errors ({(result.errors ?? result.failedRows).length})
                </p>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-[8px] border border-white/10 bg-slate-900/60 p-2 text-xs">
                  {(result.errors ?? result.failedRows).map((err: any, idx: number) => (
                    <div key={idx} className="border-b border-white/5 py-1 text-slate-300 last:border-b-0">
                      Row {err.row}: <span className="text-rose-400">{err.error ?? err.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Import history</CardTitle>
            <CardSubtitle>Recent bulk upload operations</CardSubtitle>
          </div>
        </CardHeader>
        <AsyncSection query={jobs} skeleton="table">
          {(data) =>
            data.items.length === 0 ? (
              <CardBody className="py-8 text-center text-slate-400">No import jobs recorded</CardBody>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <Tr>
                      <Th>Entity</Th>
                      <Th hideBelow="md">File</Th>
                      <Th hideBelow="sm">Run by</Th>
                      <Th align="right">Rows</Th>
                      <Th align="right">Imported</Th>
                      <Th align="right">Rejected</Th>
                      <Th>Status</Th>
                      <Th align="right" hideBelow="lg">
                        When
                      </Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {data.items.map((job: any) => (
                      <Tr key={job.id}>
                        <Td className="font-semibold text-ink-1">{job.entity}</Td>
                        <Td hideBelow="md" className="text-ink-2">
                          {job.filename ?? '—'}
                        </Td>
                        <Td hideBelow="sm" className="text-ink-2">
                          {job.requestedByLabel ?? '—'}
                        </Td>
                        <Td align="right" className="tnum text-ink-2">
                          {num(job.totalRows)}
                        </Td>
                        <Td align="right" className="tnum text-emerald-400 font-semibold">
                          {num(job.successCount)}
                        </Td>
                        <Td align="right" className="tnum text-rose-400 font-semibold">
                          {num(job.failureCount)}
                        </Td>
                        <Td>
                          <StatusBadge status={job.status} />
                        </Td>
                        <Td align="right" hideBelow="lg" className="tnum text-sm text-slate-400">
                          {formatDate(job.createdAt, true)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )
          }
        </AsyncSection>
      </Card>
    </GlobalPageBackground>
  );
}
