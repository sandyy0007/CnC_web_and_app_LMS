'use client';

import {
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  GraduationCap,
  Layers,
  Radio,
  Server,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { BarCompare, ChartCard, LineTrend, attendanceColor } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { ImageHero } from '@/components/ui/ImageHero';
import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import { useApi } from '@/hooks/useApi';
import { formatTime, num, pct, titleCase } from '@/lib/format';

export default function AdminDashboardPage() {
  const query = useApi<any>('/admin/dashboard');

  return (
    <VisualPageBackground
      image="/images/backgrounds/admin.webp"
      imageAlt="Institutional Administration Node"
      overlay="dark"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <AsyncSection query={query} skeleton="kpis">
        {(rawData) => {
          const data = {
            institution: rawData?.institution ?? { name: 'Institution', code: '' },
            quickActions: Array.isArray(rawData?.quickActions) ? rawData.quickActions : [],
            kpis: {
              totalStudents: rawData?.kpis?.totalStudents ?? 0,
              totalTrainers: rawData?.kpis?.totalTrainers ?? 0,
              departments: rawData?.kpis?.departments ?? 0,
              activeBatches: rawData?.kpis?.activeBatches ?? 0,
              averageInstitutionalEediScore: rawData?.kpis?.averageInstitutionalEediScore ?? null,
              averageScoreHasData: Boolean(rawData?.kpis?.averageScoreHasData),
            },
            attendanceTrend: Array.isArray(rawData?.attendanceTrend) ? rawData.attendanceTrend : [],
            studentsPerDepartment: Array.isArray(rawData?.studentsPerDepartment) ? rawData.studentsPerDepartment : [],
            classMonitoring: {
              sessionsToday: rawData?.classMonitoring?.sessionsToday ?? 0,
              liveNow: rawData?.classMonitoring?.liveNow ?? 0,
              sessions: Array.isArray(rawData?.classMonitoring?.sessions) ? rawData.classMonitoring.sessions : [],
            },
            enrollments: rawData?.enrollments ?? {},
            systemAndAiUsage: rawData?.systemAndAiUsage ?? {
              aiCalls24h: 0,
              averageLatencyMs: 0,
              failures24h: 0,
              queue: { active: 0, queued: 0 },
              providers: {},
            },
          };
          return (
          <>
          <ImageHero
            image="/images/platform/colleges.webp"
            imageAlt={data.institution.name}
            title={data.institution.name}
            subtitle={`Institution code ${data.institution.code} — one college, every department under unified governance.`}
            badge={
              <Badge tone="indigo" dot className="bg-indigo-500/20 text-indigo-200 border-indigo-500/30">
                Institutional Campus Node
              </Badge>
            }
            actions={
              <div className="flex flex-wrap gap-2">
                {(data.quickActions ?? []).map((action: any) => (
                  <Button key={action.code} asChild variant="secondary" size="sm" className="bg-white/15 hover:bg-white/25 text-white border-white/20">
                    <Link href={action.href}>{action.label}</Link>
                  </Button>
                ))}
              </div>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Participants" value={num(data.kpis.totalStudents)} icon={<Users />} />
            <StatCard
              label="Trainers"
              value={num(data.kpis.totalTrainers)}
              icon={<GraduationCap />}
              tone="teal"
            />
            <StatCard
              label="Departments"
              value={num(data.kpis.departments)}
              icon={<Building2 />}
              tone="purple"
            />
            <StatCard
              label="Active batches"
              value={num(data.kpis.activeBatches)}
              icon={<Layers />}
              tone="info"
            />
            <StatCard
              label="Average readiness score"
              value={num(data.kpis.averageInstitutionalEediScore, 1)}
              outOf={100}
              icon={<Activity />}
              tone="indigo"
              hasData={data.kpis.averageScoreHasData}
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Attendance trend"
              subtitle="Institution-wide, last eight weeks"
              description={data.attendanceTrend
                .map((week: any) => `${week.label}: ${week.percentage}%`)
                .join('; ')}
              isEmpty={!data.attendanceTrend.some((week: any) => week.hasSession)}
              height={220}
            >
              <LineTrend
                data={data.attendanceTrend}
                xKey="label"
                series={[{ key: 'percentage', label: 'Attendance %' }]}
                unit="%"
              />
            </ChartCard>

            <ChartCard
              title="Participants per department"
              subtitle="Where the cohort sits"
              description={data.studentsPerDepartment
                .map((row: any) => `${row.code}: ${row.students}`)
                .join('; ')}
              isEmpty={data.studentsPerDepartment.length === 0}
              height={220}
            >
              <BarCompare
                data={data.studentsPerDepartment}
                xKey="code"
                valueKey="students"
                domain={[0, Math.max(...data.studentsPerDepartment.map((r: any) => r.students), 10)]}
              />
            </ChartCard>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_1fr]">
            <Card elevated className="card-interactive">
              <CardHeader>
                <div>
                  <CardTitle>Class monitoring</CardTitle>
                  <CardSubtitle>
                    {num(data.classMonitoring.sessionsToday)} session(s) today ·{' '}
                    {num(data.classMonitoring.liveNow)} live now
                  </CardSubtitle>
                </div>
                <Radio
                  className={
                    data.classMonitoring.liveNow > 0
                      ? 'size-4 animate-pulse text-danger'
                      : 'size-4 text-ink-3'
                  }
                  aria-hidden
                />
              </CardHeader>
              <CardBody>
                {data.classMonitoring.sessions.length === 0 ? (
                  <p className="py-6 text-center text-base text-ink-2">
                    No sessions scheduled today.
                  </p>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {data.classMonitoring.sessions.map((session: any) => (
                      <li key={session.id} className="flex flex-wrap items-center gap-3 py-3 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <div className="min-w-[180px] flex-1">
                          <p className="text-base font-semibold">{session.topic}</p>
                          <p className="mt-0.5 text-xs text-ink-3">
                            {session.batchName} · {session.trainerName}
                          </p>
                        </div>
                        <p className="tnum flex items-center gap-1.5 text-sm">
                          <Clock className="size-3.5 text-ink-3" aria-hidden />
                          {formatTime(session.date)} – {formatTime(session.endsAt)}
                        </p>
                        <StatusBadge status={session.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <div className="space-y-5">
              <Card elevated className="card-interactive">
                <CardHeader>
                  <div>
                    <CardTitle>Enrollment mix</CardTitle>
                    <CardSubtitle>Across the institution</CardSubtitle>
                  </div>
                </CardHeader>
                <CardBody>
                  <ul className="space-y-2.5">
                    {Object.entries(data.enrollments).map(([status, count]) => (
                      <li key={status} className="flex items-center justify-between gap-3">
                        <StatusBadge status={status} />
                        <span className="tnum text-base font-bold">{num(count as number)}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>

              <Card elevated className="card-interactive">
                <CardHeader>
                  <div>
                    <CardTitle>AI &amp; system</CardTitle>
                    <CardSubtitle>Last 24 hours</CardSubtitle>
                  </div>
                  <Server className="size-4 text-ink-3" aria-hidden />
                </CardHeader>
                <CardBody>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ['AI calls', num(data.systemAndAiUsage.aiCalls24h)],
                      ['Avg latency', `${num(data.systemAndAiUsage.averageLatencyMs)}ms`],
                      ['Failures', num(data.systemAndAiUsage.failures24h)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl surface-3d border border-slate-200/80 dark:border-white/[0.08] px-2 py-2">
                        <dd className="tnum text-md font-bold">{value}</dd>
                        <dt className="text-2xs text-ink-3">{label}</dt>
                      </div>
                    ))}
                  </dl>

                  <ul className="mt-3.5 space-y-2">
                    {Object.entries(data.systemAndAiUsage.providers ?? {}).map(
                      ([key, provider]: [string, any]) => (
                        <li key={key} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold">{titleCase(key)}</span>
                          <Badge tone={provider.usingDevelopmentFallback ? 'amber' : 'success'}>
                            {provider.active}
                          </Badge>
                          {provider.usingDevelopmentFallback && (
                            <span className="text-xs text-amber-dark">
                              development fallback — no vendor credentials configured
                            </span>
                          )}
                        </li>
                      ),
                    )}
                  </ul>

                  {data.systemAndAiUsage.queue?.dead > 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-danger">
                      <AlertTriangle className="size-3.5" aria-hidden />
                      {num(data.systemAndAiUsage.queue.dead)} dead-lettered job(s)
                    </p>
                  )}

                  <Button asChild variant="secondary" size="sm" className="mt-3.5 w-full">
                    <Link href="/admin/system">Open AI &amp; server usage</Link>
                  </Button>
                </CardBody>
              </Card>
            </div>
          </div>
          </>
          );
        }}
      </AsyncSection>
  </VisualPageBackground>
);
}
