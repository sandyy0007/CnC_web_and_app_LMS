'use client';

import {
  AlertTriangle,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChartCard, attendanceColor } from '@/components/charts';

const LineTrend = dynamic(
  () => import('@/components/charts').then((mod) => mod.LineTrend),
  {
    ssr: false,
    loading: () => <div className="h-[210px] w-full animate-pulse rounded-lg bg-slate-100/70" />,
  },
);

const BarCompare = dynamic(
  () => import('@/components/charts').then((mod) => mod.BarCompare),
  {
    ssr: false,
    loading: () => <div className="h-[210px] w-full animate-pulse rounded-lg bg-slate-100/70" />,
  },
);
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { ImageHero } from '@/components/ui/ImageHero';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import { AnimatedCounter } from '@/components/ui/counter';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatTime, num, pct } from '@/lib/format';

export default function TrainerDashboardPage() {
  const query = useApi<any>('/trainer/dashboard');

  return (
    <VisualPageBackground
      image="/images/backgrounds/trainer.webp"
      imageAlt="Trainer Command Studio"
      overlay="dark"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <AsyncSection query={query} skeleton="kpis">
        {(data) => (
          <>
          <ImageHero
            image="/images/trainer-ai.webp"
            imageAlt="Trainer Command and Cohort Analytics"
            title="Trainer Command Studio"
            subtitle="Authoritative oversight for your assigned student cohorts and institutional batches."
            badge={
              <div className="flex flex-wrap items-center gap-1.5">
                {data.assignedBatches.map((batch: any) => (
                  <Badge key={batch.id} tone="indigo" className="bg-indigo-500/20 text-indigo-200 border-indigo-500/30">
                    {batch.name}
                  </Badge>
                ))}
              </div>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Students"
              value={num(data.studentCount)}
              icon={<Users />}
              deltaLabel={`${data.assignedBatches.length} batch(es) assigned`}
            />
            <StatCard
              label="Attendance"
              value={pct(data.attendance.percentage, 1)}
              icon={<CalendarCheck />}
              tone={data.attendance.percentage >= 75 ? 'success' : 'amber'}
              hasData={data.attendance.hasData}
              deltaLabel={`${num(data.attendance.present)} of ${num(data.attendance.total)} marks present`}
            />
            <StatCard
              label="Assessment average"
              value={num(data.assessments.average, 1)}
              outOf={100}
              icon={<GraduationCap />}
              tone="teal"
              hasData={data.assessments.hasData}
              deltaLabel={`${num(data.assessments.count)} scores · range ${data.assessments.min}–${data.assessments.max}`}
            />
            <StatCard
              label="Pending evaluations"
              value={num(data.pendingEvaluations)}
              icon={<ClipboardCheck />}
              tone={data.pendingEvaluations > 0 ? 'amber' : 'success'}
              deltaLabel={
                data.pendingEvaluations > 0 ? 'Drafts not yet submitted' : 'Nothing in draft'
              }
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <div className="space-y-5">
              <Card className="card-interactive">
                <CardHeader>
                  <div>
                    <CardTitle>Today&apos;s classes</CardTitle>
                    <CardSubtitle>
                      {data.todaysClasses.total} scheduled ·{' '}
                      {data.todaysClasses.attendanceNotMarked} without attendance
                    </CardSubtitle>
                  </div>
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/trainer/classes">All classes</Link>
                  </Button>
                </CardHeader>
                <CardBody>
                  {data.todaysClasses.sessions.length === 0 ? (
                    <p className="py-6 text-center text-base text-ink-2">
                      No classes scheduled today.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {data.todaysClasses.sessions.map((session: any) => (
                        <li
                          key={session.id}
                          className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line-soft px-4 py-3.5 transition-all duration-200 hover:border-line-hover hover:bg-slate-50/60 hover:shadow-xs"
                        >
                          <div className="min-w-[180px] flex-1">
                            <p className="text-base font-semibold">{session.topic}</p>
                            <p className="mt-0.5 text-sm text-ink-2">
                              {session.batchName} · {session.trainingModuleName}
                            </p>
                          </div>
                          <p className="tnum text-sm font-semibold">
                            {formatTime(session.date)} – {formatTime(session.endsAt)}
                          </p>
                          <Button asChild variant="primary" size="sm">
                            <Link href={`/trainer/attendance/${session.id}`}>
                              <CalendarCheck className="size-3.5" aria-hidden />
                              Mark attendance
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <ChartCard
                title="Attendance trend"
                subtitle="Last eight weeks across your batches"
                description={`Weekly attendance percentage across ${data.attendanceTrend.length} weeks.`}
                isEmpty={!data.attendanceTrend.some((week: any) => week.hasSession)}
                height={210}
              >
                <LineTrend
                  data={data.attendanceTrend}
                  xKey="label"
                  series={[{ key: 'percentage', label: 'Attendance %' }]}
                  unit="%"
                />
              </ChartCard>

              <ChartCard
                title="Average score by module"
                subtitle="Trainer-rated parameters, normalised to 100"
                description={data.moduleScores
                  .map((row: any) => `${row.module}: ${row.average}`)
                  .join('; ')}
                isEmpty={data.moduleScores.length === 0}
                height={210}
              >
                <BarCompare
                  data={data.moduleScores}
                  xKey="module"
                  valueKey="average"
                  colorBy={(row) => attendanceColor(row.average)}
                />
              </ChartCard>
            </div>

            <div className="space-y-5">
              <Card className="card-interactive">
                <CardHeader>
                  <div>
                    <CardTitle>Course completion</CardTitle>
                    <CardSubtitle>Across your assigned batches</CardSubtitle>
                  </div>
                  <TrendingUp className="size-4 text-ink-3" aria-hidden />
                </CardHeader>
                <CardBody>
                  <ProgressBar value={data.courseCompletionPercent} />
                  <Button asChild variant="secondary" size="sm" className="mt-3.5 w-full">
                    <Link href="/trainer/course-progress">Open course progress</Link>
                  </Button>
                </CardBody>
              </Card>

              <Card
                className={cn(
                  'card-interactive transition-all duration-200',
                  data.weakStudentAlerts > 0 && 'border-amber/50 bg-amber-50/50',
                )}
              >
                <CardHeader>
                  <div>
                    <CardTitle>Weak student alerts</CardTitle>
                    <CardSubtitle>Raised automatically from scores and attendance</CardSubtitle>
                  </div>
                  <AlertTriangle
                    className={
                      data.weakStudentAlerts > 0 ? 'size-4 text-amber-dark' : 'size-4 text-ink-3'
                    }
                    aria-hidden
                  />
                </CardHeader>
                <CardBody>
                  <p className="tnum text-[26px] font-bold leading-none">
                    <AnimatedCounter value={data.weakStudentAlerts} />
                  </p>
                  <p className="mt-1.5 text-sm text-ink-2">
                    {data.weakStudentAlerts > 0
                      ? 'Students who need attention this week.'
                      : 'No open alerts for your batches.'}
                  </p>
                  <Button asChild variant="secondary" size="sm" className="mt-3.5 w-full">
                    <Link href="/trainer/alerts">Review alerts</Link>
                  </Button>
                </CardBody>
              </Card>

              <Card className="card-interactive">
                <CardHeader>
                  <div>
                    <CardTitle>My batches</CardTitle>
                    <CardSubtitle>{data.assignedBatches.length} assigned</CardSubtitle>
                  </div>
                </CardHeader>
                <CardBody>
                  <ul className="space-y-2">
                    {data.assignedBatches.map((batch: any) => (
                      <li key={batch.id}>
                        <Link
                          href={`/trainer/batches/${batch.id}`}
                          className="flex items-center justify-between gap-3 rounded-[10px] border border-line-soft px-3.5 py-3 transition-all duration-200 hover:border-line-hover hover:bg-slate-50/60 hover:translate-x-0.5"
                        >
                          <span className="min-w-0">
                            <span className="block text-base font-semibold">{batch.name}</span>
                            <span className="block text-xs text-ink-3">
                              {batch.code} · {batch.departmentName}
                            </span>
                          </span>
                          <Badge tone={batch.status === 'active' ? 'success' : 'neutral'}>
                            {batch.status}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}
    </AsyncSection>
  </VisualPageBackground>
);
}
