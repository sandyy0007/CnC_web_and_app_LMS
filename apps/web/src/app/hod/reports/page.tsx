'use client';

import { FileDown, Info, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { ReportDownload } from '@/components/shared/misc';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { num } from '@/lib/format';

const FORMATS = ['xlsx', 'csv', 'pdf'] as const;

export default function HodReportsPage() {
  const query = useApi<any>('/hod/reports', { pageSize: 25 }, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination, meta: raw.meta }),
  });
  const batches = useApi<any>('/hod/participants', { pageSize: 1 }, {
    select: (raw) => raw.meta?.filters?.batches ?? [],
  });

  const [reportType, setReportType] = React.useState('attendance');
  const [format, setFormat] = React.useState<string>('xlsx');
  const [batchId, setBatchId] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const families: any[] = query.data?.meta?.available ?? [];
  const chosen = families.find((family) => family.code === reportType);

  async function generate() {
    setPending(true);
    try {
      const response = await api.post('/hod/reports', {
        reportType,
        format,
        filters: {
          ...(batchId !== 'all' ? { batchId } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      });
      toast.success(
        response.data?.status === 'ready'
          ? 'Report ready — download it below.'
          : 'Report queued as a background job — it will appear below when ready.',
      );
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Department-scoped exports. Large ones run as a background job so the page never blocks."
        actions={
          <Button variant="secondary" size="sm" onClick={query.refetch}>
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        }
      />

      <Card className="mb-5">
        <CardHeader>
          <div>
            <CardTitle>Generate a report</CardTitle>
            <CardSubtitle>
              {families.length} report famil{families.length === 1 ? 'y' : 'ies'} available to your
              role
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {families.map((family) => (
              <button
                key={family.code}
                type="button"
                onClick={() => setReportType(family.code)}
                aria-pressed={reportType === family.code}
                className={cn(
                  'rounded-[10px] border p-3.5 text-left transition-colors',
                  reportType === family.code
                    ? 'border-indigo bg-indigo-50'
                    : 'border-line bg-white hover:bg-app',
                )}
              >
                <span className="block text-base font-semibold">{family.label}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink-2">
                  {family.description}
                </span>
                {family.signals?.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {family.signals.map((signal: string) => (
                      <Badge key={signal} tone="neutral">
                        {signal.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="batch" className="mb-1.5 block text-sm font-semibold">
                Batch
              </label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger id="batch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All batches</SelectItem>
                  {(batches.data ?? []).map((batch: any) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="from" className="mb-1.5 block text-sm font-semibold">
                From
              </label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="to" className="mb-1.5 block text-sm font-semibold">
                To
              </label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="format" className="mb-1.5 block text-sm font-semibold">
                Format
              </label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button variant="primary" className="mt-4" loading={pending} onClick={generate}>
            <FileDown className="size-3.5" aria-hidden />
            Generate {chosen?.label ?? 'report'}
          </Button>

          {query.data?.meta?.asyncNotice && (
            <p className="mt-3.5 flex items-start gap-2 text-sm text-ink-2">
              <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
              {query.data.meta.asyncNotice} (Threshold:{' '}
              {num(query.data.meta.asyncRowThreshold)} rows.)
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Generated reports</CardTitle>
            <CardSubtitle>Download links are private and expire</CardSubtitle>
          </div>
        </CardHeader>
        <AsyncSection query={query} skeleton="table">
          {(data) => (
            <ReportDownload jobs={data.items} emptyLabel="No reports generated yet" />
          )}
        </AsyncSection>
      </Card>
    </>
  );
}
