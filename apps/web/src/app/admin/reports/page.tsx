'use client';

import { FileDown, Info, Layers, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { ReportDownload } from '@/components/shared/misc';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
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
import { num, titleCase } from '@/lib/format';

const FORMATS = ['xlsx', 'csv', 'pdf'] as const;

export default function AdminReportsPage() {
  const catalogue = useApi<any>('/admin/reports/catalogue');
  const departments = useApi<any[]>('/admin/departments');
  const jobs = useApi<any>('/admin/reports', { pageSize: 25 }, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });

  const [family, setFamily] = React.useState('attendance');
  const [timeGrain, setTimeGrain] = React.useState('weekly');
  const [entity, setEntity] = React.useState('department');
  const [format, setFormat] = React.useState<string>('xlsx');
  const [departmentId, setDepartmentId] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const families: any[] = catalogue.data?.families ?? [];
  const runnable: string[] = catalogue.data?.runnableDatasets ?? [];
  const chosen = families.find((item) => item.code === family);
  const isRunnable = runnable.includes(family);

  async function generate() {
    setPending(true);
    try {
      const response = await api.post('/admin/reports', {
        reportType: family,
        format,
        filters: {
          timeGrain,
          entity,
          ...(departmentId !== 'all' ? { departmentId } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      });
      toast.success(
        response.data?.status === 'ready'
          ? 'Report ready — download it below.'
          : 'Report queued as a background job.',
      );
      jobs.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <GlobalPageBackground
      image="/images/backgrounds/reports.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="Reports & analytics"
        description="The report catalogue is a matrix: a family, a time grain and an entity. Pick one combination and export it."
        actions={
          <Button variant="secondary" size="sm" onClick={jobs.refetch}>
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        }
      />

      <AsyncSection query={catalogue} skeleton="cards">
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Report combinations"
                value={num(data.totalReports)}
                icon={<Layers />}
                hint="Families × time grains × entities. Not every combination has a dataset behind it yet."
              />
              <StatCard label="Families" value={num(data.families.length)} tone="teal" />
              <StatCard label="Time grains" value={num(data.timeGrains.length)} tone="purple" />
              <StatCard
                label="Runnable now"
                value={num(data.runnableDatasets.length)}
                tone="success"
                deltaLabel="Families with a live dataset"
              />
            </div>

            <Card className="mt-5">
              <CardHeader>
                <div>
                  <CardTitle>Build a report</CardTitle>
                  <CardSubtitle>
                    Every export is scoped to your institution on the server
                  </CardSubtitle>
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.families.map((item: any) => {
                    const available = data.runnableDatasets.includes(item.code);
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => setFamily(item.code)}
                        aria-pressed={family === item.code}
                        className={cn(
                          'rounded-[10px] border p-3.5 text-left transition-colors',
                          family === item.code
                            ? 'border-indigo-500 bg-indigo-500/20 text-white'
                            : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-200',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-base font-semibold">{item.label}</span>
                          {!available && <Badge tone="neutral">No dataset yet</Badge>}
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed text-slate-400">
                          {item.description}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                  <div>
                    <label htmlFor="timeGrain" className="mb-1.5 block text-sm font-semibold">
                      Time grain
                    </label>
                    <Select value={timeGrain} onValueChange={setTimeGrain}>
                      <SelectTrigger id="timeGrain">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {data.timeGrains.map((grain: string) => (
                          <SelectItem key={grain} value={grain}>
                            {titleCase(grain)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="entity" className="mb-1.5 block text-sm font-semibold">
                      Entity
                    </label>
                    <Select value={entity} onValueChange={setEntity}>
                      <SelectTrigger id="entity">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {data.entities.map((ent: string) => (
                          <SelectItem key={ent} value={ent}>
                            {titleCase(ent)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="department" className="mb-1.5 block text-sm font-semibold">
                      Department
                    </label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger id="department">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All departments</SelectItem>
                        {(departments.data ?? []).map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
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

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    loading={pending}
                    disabled={!isRunnable}
                    onClick={generate}
                  >
                    <FileDown className="size-3.5" aria-hidden />
                    Generate {chosen?.label ?? 'report'}
                  </Button>
                  <code className="rounded-[6px] bg-white/10 px-2 py-1 text-sm text-slate-200">
                    {family}.{timeGrain}.{entity}
                  </code>
                  {!isRunnable && (
                    <span className="flex items-center gap-1.5 text-sm text-amber-400">
                      <Info className="size-3.5" aria-hidden />
                      This family has no dataset wired up yet, so it cannot be exported.
                    </span>
                  )}
                </div>
              </CardBody>
            </Card>
          </>
        )}
      </AsyncSection>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Generated reports</CardTitle>
            <CardSubtitle>Private, expiring download links</CardSubtitle>
          </div>
        </CardHeader>
        <AsyncSection query={jobs} skeleton="table">
          {(data) => <ReportDownload jobs={data.items} emptyLabel="No reports generated yet" />}
        </AsyncSection>
      </Card>
    </GlobalPageBackground>
  );
}
