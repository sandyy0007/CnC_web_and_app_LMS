'use client';

import {
  Award,
  BarChart3,
  CalendarCheck,
  ChevronRight,
  GraduationCap,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { BarCompare, ChartCard, LineTrend, attendanceColor } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { ScopePill } from '@/components/shared/misc';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { ImageHero } from '@/components/ui/ImageHero';
import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import { AnimatedCounter } from '@/components/ui/counter';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate, num, pct } from '@/lib/format';

const ALERT_TONE: Record<string, string> = {
  warning: 'border-amber/40 bg-amber-50/60',
  danger: 'border-danger-bg bg-danger-bg/40',
  info: 'border-info-bg bg-info-bg/40',
};

export default function HodDashboardPage() {
  const query = useApi<any>('/hod/dashboard');

  return (
    <VisualPageBackground
      image="/images/backgrounds/hod.webp"
      imageAlt="Department Coordination Studio"
      overlay="dark"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <AsyncSection query={query} skeleton="kpis">
        {(rawData) => {
          const data = {
            scope: rawData?.scope ?? {
              departmentName: 'Department',
              breadcrumb: 'Department Oversight',
              readOnly: false,
              isolationNotice: 'Department Scoped',
              departmentCode: '',
              collegeName: 'Institution',
            },
            kpis: {
              participants: {
                value: rawData?.kpis?.participants?.value ?? 0,
                delta: rawData?.kpis?.participants?.delta,
                deltaLabel: rawData?.kpis?.participants?.deltaLabel ?? 'in this department',
              },
              trainers: {
                value: rawData?.kpis?.trainers?.value ?? 0,
                deltaLabel: rawData?.kpis?.trainers?.deltaLabel ?? 'assigned faculty',
              },
              averageSessionAttendance: {
                value: rawData?.kpis?.averageSessionAttendance?.value ?? 0,
                hasData: Boolean(rawData?.kpis?.averageSessionAttendance?.hasData),
              },
              averageSkillScore: {
                value: rawData?.kpis?.averageSkillScore?.value ?? null,
                outOf: rawData?.kpis?.averageSkillScore?.outOf ?? 100,
                hasData: Boolean(rawData?.kpis?.averageSkillScore?.hasData),
              },
            },
            thresholds: rawData?.thresholds ?? { attendance: 75, certificateAttendance: 80, certificateScore: 70 },
            alerts: Array.isArray(rawData?.alerts) ? rawData.alerts : [],
            attendanceTrend: Array.isArray(rawData?.attendanceTrend) ? rawData.attendanceTrend : [],
            moduleAttendance: Array.isArray(rawData?.moduleAttendance) ? rawData.moduleAttendance : [],
            moduleScores: Array.isArray(rawData?.moduleScores) ? rawData.moduleScores : [],
            recentEnrollments: Array.isArray(rawData?.recentEnrollments) ? rawData.recentEnrollments : [],
          };
          return (
          <>
            <ImageHero
              image="/images/backgrounds/hod.webp"
              imageAlt="Department Leadership and Cohort Coordination"
              title={`${data.scope.departmentName} Dashboard`}
              subtitle={`${data.scope.breadcrumb} — department oversight and cohort management.`}
              badge={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info" className="bg-indigo-500/20 text-indigo-200 border-indigo-500/30">
                    <ShieldCheck className="size-3 mr-1" aria-hidden />
                    Department Scoped
                  </Badge>
                  {data.scope.readOnly && <Badge tone="amber">Read-only</Badge>}
                </div>
              }
            />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Participants"
              value={num(data.kpis.participants.value)}
              icon={<Users />}
              delta={data.kpis.participants.delta}
              deltaLabel={data.kpis.participants.deltaLabel}
            />
            <StatCard
              label="Trainers"
              value={num(data.kpis.trainers.value)}
              icon={<GraduationCap />}
              tone="teal"
              deltaLabel={data.kpis.trainers.deltaLabel}
            />
            <StatCard
              label="Session attendance"
              value={pct(data.kpis.averageSessionAttendance.value, 1)}
              icon={<CalendarCheck />}
              tone={data.kpis.averageSessionAttendance.value >= 75 ? 'success' : 'amber'}
              hasData={data.kpis.averageSessionAttendance.hasData}
              hint={`Threshold ${num(data.thresholds.attendance, 0)}% — below that a participant is a defaulter.`}
            />
            <StatCard
              label="Average skill score"
              value={num(data.kpis.averageSkillScore.value, 1)}
              outOf={data.kpis.averageSkillScore.outOf}
              icon={<BarChart3 />}
              tone="indigo"
              hasData={data.kpis.averageSkillScore.hasData}
            />
          </div>

          {data.alerts?.length > 0 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {data.alerts.map((alert: any) => (
                <Link key={alert.code} href={alert.href} className="group">
                  <Card
                    elevated
                    className={cn(
                      'h-full surface-3d surface-3d-interactive shadow-3d-card hover:shadow-3d-hover transition-all duration-300',
                      ALERT_TONE[alert.tone] ?? '',
                    )}
                  >
                    <CardBody>
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                        {alert.label}
                      </p>
                      <p className="tnum mt-1.5 flex items-baseline gap-2 text-[26px] font-bold leading-none">
                        <AnimatedCounter value={alert.count} />
                        <ChevronRight
                          className="size-4 text-ink-3 transition-transform group-hover:translate-x-1"
                          aria-hidden
                        />
                      </p>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Session attendance trend"
              subtitle="Weekly, across the department"
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
              title="Attendance by module"
              subtitle="Where participants are actually turning up"
              description={data.moduleAttendance
                .map((row: any) => `${row.key}: ${row.percentage}%`)
                .join('; ')}
              isEmpty={data.moduleAttendance.length === 0}
              height={220}
            >
              <BarCompare
                data={data.moduleAttendance}
                xKey="key"
                valueKey="percentage"
                unit="%"
                threshold={data.thresholds.attendance}
                thresholdLabel={`${num(data.thresholds.attendance, 0)}% threshold`}
                colorBy={(row) => attendanceColor(row.percentage)}
              />
            </ChartCard>

            <ChartCard
              title="Average score by module"
              subtitle="Trainer-rated parameters"
              description={data.moduleScores
                .map((row: any) => `${row.module}: ${row.average}`)
                .join('; ')}
              isEmpty={data.moduleScores.length === 0}
              height={220}
            >
              <BarCompare
                data={data.moduleScores}
                xKey="module"
                valueKey="average"
                colorBy={(row) => attendanceColor(row.average)}
              />
            </ChartCard>

            <Card elevated className="card-interactive">
              <CardHeader>
                <div>
                  <CardTitle>Recent enrollments</CardTitle>
                  <CardSubtitle>Append-only history — transfers keep both rows</CardSubtitle>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/hod/enrollment">All enrollments</Link>
                </Button>
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-line-soft">
                  {data.recentEnrollments.map((row: any) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <div className="min-w-[160px] flex-1">
                        <p className="text-base font-semibold">{row.participantName ?? row.studentName}</p>
                        <p className="mt-0.5 text-xs text-ink-3">
                          {row.rollNumber} · {row.batchName}
                        </p>
                      </div>
                      <span className="tnum text-sm text-ink-2">
                        {formatDate(row.enrolledAt)}
                      </span>
                      <StatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <div className="mt-5">
            <Card elevated className="card-interactive border-info-bg bg-info-bg/30">
              <CardBody>
                <p className="flex items-center gap-1.5 text-sm font-bold text-info">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Multi-Tenant Department Scope
                </p>
                <p className="mt-2 text-base leading-relaxed text-ink-1">
                  {data.scope.isolationNotice}
                </p>
                <p className="mt-2 text-sm text-ink-2">
                  You are the SPOC of {data.scope.departmentName} ({data.scope.departmentCode}) at{' '}
                  {data.scope.collegeName}. Other departments and other institutions are strictly isolated by the
                  server, not merely hidden from this menu.
                </p>
              </CardBody>
            </Card>
          </div>
          </>
          );
        }}
      </AsyncSection>
  </VisualPageBackground>
);
}
