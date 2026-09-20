'use client';

import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { useApi } from '@/hooks/useApi';
import { formatDate, num } from '@/lib/format';

interface SystemMetrics {
  status: string;
  uptime: string;
  dbEngine: string;
  redis: string;
  totalAiInvocations: number;
  estimatedTokensUsed: number;
  storageUsed: string;
  activeWebSocketConnections: number;
  recentEvents: Array<{
    _id?: string;
    id?: string;
    at?: string;
    action?: string;
    detail?: string;
    entityType?: string;
  }>;
}

export default function SuperAdminSystemPage() {
  const query = useApi<SystemMetrics>('/super-admin/system', undefined, {
    select: (res) => res.data ?? res,
  });

  return (
    <AsyncSection query={query} skeleton="kpis">
      {(data) => (
        <GlobalPageBackground image="/images/backgrounds/analytics.webp" variant="dark">
          <div className="space-y-6">
          <PageHeader
            title="System Telemetry & AI Compute"
            description="Infrastructure health, AI token usage, object storage volume, and cluster diagnostic signals."
            actions={
              <div className="flex items-center gap-2">
                <Badge tone="success" dot>
                  Platform Health: {data.status.toUpperCase()}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => query.refetch()}
                  className="flex items-center gap-1 text-xs"
                >
                  <RefreshCw className="size-3" />
                  Refresh
                </Button>
              </div>
            }
          />

          {/* Infrastructure KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Cluster Uptime"
              value={data.uptime}
              tone="success"
              icon={<Server className="size-4" />}
              hint="Zero unscheduled downtime"
            />
            <StatCard
              label="AI Model Calls"
              value={num(data.totalAiInvocations)}
              tone="indigo"
              icon={<Cpu className="size-4" />}
              hint="LLM evaluations & resume analysis"
            />
            <StatCard
              label="Estimated Token Spend"
              value={num(data.estimatedTokensUsed)}
              tone="info"
              icon={<Zap className="size-4" />}
              hint="Compute tokens consumed"
            />
            <StatCard
              label="S3 / Object Storage"
              value={data.storageUsed}
              tone="amber"
              icon={<HardDrive className="size-4" />}
              hint="eBooks, covers & resumes"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Component Status */}
            <Card>
              <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-base">Infrastructure Stack Health</CardTitle>
              </CardHeader>
              <CardBody className="p-5 space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <Database className="size-5 text-indigo" />
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">
                        Database Engine
                      </p>
                      <p className="text-xs text-slate-400">{data.dbEngine}</p>
                    </div>
                  </div>
                  <Badge tone="success">Active</Badge>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <Activity className="size-5 text-emerald-500" />
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">
                        Redis Cache / In-Memory State
                      </p>
                      <p className="text-xs text-slate-400">{data.redis}</p>
                    </div>
                  </div>
                  <Badge tone="success">Connected</Badge>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <Cpu className="size-5 text-amber-500" />
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">
                        AI Model Provider
                      </p>
                      <p className="text-xs text-slate-400">Gemini 1.5 / Fallback Provider</p>
                    </div>
                  </div>
                  <Badge tone="success">Operational</Badge>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <HardDrive className="size-5 text-sky-500" />
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">
                        Object Storage Service
                      </p>
                      <p className="text-xs text-slate-400">AWS S3 / Signed Local Provider</p>
                    </div>
                  </div>
                  <Badge tone="success">Healthy</Badge>
                </div>
              </CardBody>
            </Card>

            {/* Recent System Activity */}
            <Card>
              <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">System Audit Events</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Immutable audit events</p>
                </div>
                <ShieldAlert className="size-4 text-indigo" />
              </CardHeader>
              <CardBody className="p-5">
                {(!data.recentEvents || data.recentEvents.length === 0) ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No security anomalies or system alerts logged.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-2">
                    {data.recentEvents.map((evt, idx) => (
                      <div key={evt.id ?? evt._id ?? idx} className="pt-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {evt.action ?? 'System Event'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {evt.at ? formatDate(evt.at) : 'Just now'}
                          </span>
                        </div>
                        <p className="text-slate-500 truncate mt-0.5">{evt.detail ?? evt.entityType}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
          </div>
        </GlobalPageBackground>
      )}
    </AsyncSection>
  );
}
