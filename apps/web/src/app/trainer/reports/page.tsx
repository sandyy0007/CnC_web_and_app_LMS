'use client';

import { FileDown, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { ReportDownload } from '@/components/shared/misc';
import { AsyncSection } from '@/components/shared/state';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';

const TYPES = [
  { value: 'attendance', label: 'Attendance', help: 'Per-session attendance for your batches.' },
  { value: 'assessment', label: 'Assessment scores', help: 'Trainer-rated parameter results.' },
  { value: 'defaulters', label: 'Attendance defaulters', help: 'Participants below the threshold.' },
  { value: 'feedback', label: 'Feedback given', help: 'Your written feedback and ratings.' },
  { value: 'practice', label: 'Practice sessions', help: 'AI-scored practice attempts.' },
  { value: 'learning', label: 'Learning progress', help: 'Course and module completion.' },
];

const FORMATS = ['xlsx', 'csv', 'pdf'] as const;

export default function TrainerReportsPage() {
  const batches = useApi<any[]>('/trainer/batches');
  const jobs = useApi<any>('/trainer/reports', { pageSize: 25 }, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const [reportType, setReportType] = React.useState('attendance');
  const [format, setFormat] = React.useState<string>('xlsx');
  const [batchId, setBatchId] = React.useState('all');
  const [pending, setPending] = React.useState(false);

  async function generate() {
    setPending(true);
    try {
      const response = await api.post('/trainer/reports', {
        reportType,
        format,
        filters: batchId !== 'all' ? { batchId } : {},
      });
      const status = response.data?.status;
      toast.success(
        status === 'ready'
          ? 'Report ready — download it below.'
          : 'Report queued — it will appear below when it is ready.',
      );
      jobs.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  const chosen = TYPES.find((type) => type.value === reportType);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Exports are generated as a background job and delivered through a private, expiring link."
        actions={
          <Button variant="secondary" size="sm" onClick={jobs.refetch}>
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        }
      />

      <Card className="mb-5">
        <CardHeader>
          <div>
            <CardTitle>Generate a report</CardTitle>
            <CardSubtitle>Scoped to your assigned batches automatically</CardSubtitle>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="reportType" className="mb-1.5 block text-sm font-semibold">
                Report
              </label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger id="reportType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chosen && <p className="mt-1.5 text-sm text-ink-3">{chosen.help}</p>}
            </div>

            <div>
              <label htmlFor="batch" className="mb-1.5 block text-sm font-semibold">
                Batch
              </label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger id="batch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All my batches</SelectItem>
                  {(batches.data ?? []).map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            Generate report
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>My exports</CardTitle>
            <CardSubtitle>Links expire — regenerate rather than share them</CardSubtitle>
          </div>
        </CardHeader>
        <AsyncSection query={jobs} skeleton="table">
          {(data) => <ReportDownload jobs={data.items} emptyLabel="You have not exported anything yet" />}
        </AsyncSection>
      </Card>
    </>
  );
}
