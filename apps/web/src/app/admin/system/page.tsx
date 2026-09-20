'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { BarCompare, ChartCard, LineTrend } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { formatDate, num, titleCase } from '@/lib/format';

function HealthRow({
  label,
  ok,
  detail,
  icon,
}: {
  label: string;
  ok: boolean;
  detail?: string;
  icon: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-app text-ink-2 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-base font-semibold">{label}</span>
      {detail && <span className="text-sm text-ink-2">{detail}</span>}
      {ok ? (
        <Badge tone="success">
          <CheckCircle2 className="size-3" aria-hidden />
          Healthy
        </Badge>
      ) : (
        <Badge tone="danger">
          <XCircle className="size-3" aria-hidden />
          Attention
        </Badge>
      )}
    </li>
  );
}

export default function AdminSystemPage() {
  const usage = useApi<any>('/admin/ai-usage');
  const health = useApi<any>('/admin/system-health');
  const [recalculating, setRecalculating] = React.useState(false);

  async function recalculate() {
    setRecalculating(true);
    try {
      const response = await api.post('/admin/recalculate-scores', {});
      toast.success(
        response.message ??
          'Recalculation queued — scores update in the background as the jobs run.',
      );
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AI & server usage"
        description="What the AI is doing, how the queue is coping, and whether anything is running on a development fallback."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                usage.refetch();
                health.refetch();
              }}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={recalculating}
              onClick={recalculate}
            >
              Recalculate all scores
            </Button>
          </>
        }
      />

      <AsyncSection query={usage} skeleton="kpis">
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={`AI calls (${data.windowHours}h)`}
                value={num(data.series.reduce((sum: number, row: any) => sum + row.calls, 0))}
                icon={<Cpu />}
              />
              <StatCard
                label="Trainer overrides"
                value={num(data.trainerOverrides)}
                icon={<ShieldAlert />}
                tone="amber"
                hint="Every override keeps the original AI score, the new score and the reason — the dataset needed to improve the model."
              />
              <StatCard
                label="Active practice sessions"
                value={num(data.activeSessions)}
                icon={<ListChecks />}
                tone="teal"
              />
              <StatCard
                label="Failures in window"
                value={num(data.series.reduce((sum: number, row: any) => sum + row.failures, 0))}
                icon={<AlertTriangle />}
                tone="danger"
              />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <ChartCard
                title="AI calls over time"
                subtitle={`Hourly, last ${data.windowHours} hours`}
                description={`${data.series.length} hourly buckets of AI call volume.`}
                isEmpty={data.series.length === 0}
                height={220}
              >
                <LineTrend
                  data={data.series}
                  xKey="at"
                  series={[{ key: 'calls', label: 'Calls' }]}
                  domain={[0, Math.max(...data.series.map((row: any) => row.calls), 5)]}
                />
              </ChartCard>

              <ChartCard
                title="Average latency"
                subtitle="Milliseconds per call"
                description={`Latency across ${data.series.length} buckets.`}
                isEmpty={data.series.length === 0}
                height={220}
              >
                <LineTrend
                  data={data.series}
                  xKey="at"
                  series={[{ key: 'averageLatencyMs', label: 'Latency (ms)' }]}
                  unit="ms"
                  domain={[
                    0,
                    Math.max(...data.series.map((row: any) => row.averageLatencyMs), 1000),
                  ]}
                />
              </ChartCard>

              <ChartCard
                title="Calls by kind"
                subtitle="Where the AI budget goes"
                description={data.byKind
                  .map((row: any) => `${row.kind}: ${row.calls}`)
                  .join('; ')}
                isEmpty={data.byKind.length === 0}
                height={220}
              >
                <BarCompare
                  data={data.byKind}
                  xKey="kind"
                  valueKey="calls"
                  domain={[0, Math.max(...data.byKind.map((row: any) => row.calls), 5)]}
                />
              </ChartCard>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Job queue</CardTitle>
                    <CardSubtitle>
                      {data.queue.eager
                        ? 'Running inline (development mode)'
                        : 'Background worker'}
                    </CardSubtitle>
                  </div>
                </CardHeader>
                <CardBody>
                  <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-4">
                    {[
                      ['Ready', data.queue.ready],
                      ['Delayed', data.queue.delayed],
                      ['Processing', data.queue.processing],
                      ['Dead', data.queue.dead],
                      ['Enqueued', data.queue.enqueued],
                      ['Completed', data.queue.completed],
                      ['Retried', data.queue.retried],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-[8px] bg-app px-2 py-2">
                        <dd className="tnum text-md font-bold">{num(value as number)}</dd>
                        <dt className="text-2xs text-ink-3">{label as string}</dt>
                      </div>
                    ))}
                  </dl>
                  {data.queue.dead > 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-danger">
                      <AlertTriangle className="size-3.5" aria-hidden />
                      {num(data.queue.dead)} job(s) dead-lettered — they failed every retry and
                      need looking at.
                    </p>
                  )}
                  <p className="mt-3 text-xs text-ink-3">
                    Handlers registered: {data.queue.handlers?.length ?? 0} ·{' '}
                    {data.queue.handlers?.join(', ')}
                  </p>
                </CardBody>
              </Card>
            </div>

            <Card className="mt-5">
              <CardHeader>
                <div>
                  <CardTitle>AI providers</CardTitle>
                  <CardSubtitle>
                    A development fallback means no vendor credentials are configured
                  </CardSubtitle>
                </div>
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-line-soft">
                  {Object.entries(data.providers).map(([key, provider]: [string, any]) => (
                    <li key={key} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold">{titleCase(key)}</span>
                        <span className="block text-xs text-ink-3">
                          configured: {provider.configured}
                          {provider.model ? ` · model ${provider.model}` : ''}
                          {provider.requiresEvidence ? ' · evidence required' : ''}
                        </span>
                      </span>
                      <Badge tone={provider.usingDevelopmentFallback ? 'amber' : 'success'}>
                        {provider.active}
                      </Badge>
                      {provider.usingDevelopmentFallback && (
                        <span className="text-sm text-amber-dark">
                          deterministic fallback in use
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </>
        )}
      </AsyncSection>

      <AsyncSection query={health} skeleton="table">
        {(data) => (
          <Card className="mt-5">
            <CardHeader>
              <div>
                <CardTitle>System health</CardTitle>
                <CardSubtitle>Checked {formatDate(data.checkedAt, true)}</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-line-soft">
                <HealthRow
                  label="Database"
                  ok={data.database.ok}
                  detail={
                    data.database.usingDevelopmentFallback
                      ? 'in-process development store'
                      : 'MongoDB'
                  }
                  icon={<Database aria-hidden />}
                />
                <HealthRow label="Cache & sessions" ok={data.cache.ok} detail="Redis" icon={<Cpu aria-hidden />} />
                <HealthRow
                  label="Object storage"
                  ok={Boolean(data.storage.driver)}
                  detail={`driver: ${data.storage.driver}`}
                  icon={<HardDrive aria-hidden />}
                />
                <HealthRow
                  label="Job queue"
                  ok={data.jobQueue.dead === 0}
                  detail={`${num(data.jobQueue.ready)} ready · ${num(data.jobQueue.dead)} dead`}
                  icon={<ListChecks aria-hidden />}
                />
                <HealthRow
                  label="Report generation"
                  ok={data.reports.failed === 0}
                  detail={`${num(data.reports.inFlight)} in flight · ${num(data.reports.failed)} failed`}
                  icon={<ListChecks aria-hidden />}
                />
              </ul>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[10px] bg-app px-3.5 py-3">
                  <p className="text-xs text-ink-3">Errors (24h)</p>
                  <p className="tnum mt-0.5 text-md font-bold">{num(data.errors24h)}</p>
                </div>
                <div className="rounded-[10px] bg-app px-3.5 py-3">
                  <p className="text-xs text-ink-3">Security events (24h)</p>
                  <p className="tnum mt-0.5 text-md font-bold">{num(data.securityEvents24h)}</p>
                </div>
              </div>

              {data.database.usingDevelopmentFallback && (
                <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-sm text-amber-dark">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  This instance is running on development fallbacks. Production startup refuses to
                  boot in this configuration.
                </p>
              )}
            </CardBody>
          </Card>
        )}
      </AsyncSection>
    </>
  );
}
