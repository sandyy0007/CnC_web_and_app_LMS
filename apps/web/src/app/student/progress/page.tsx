'use client';

import { Award, Download, Flame, Sparkles, Target, TrendingUp, Trophy } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { ChartCard, LineTrend } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { SkillBreakdown } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { TiltCard } from '@/components/ui/TiltCard';
import { AnimatedCounter } from '@/components/ui/counter';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';

export default function ProgressPage() {
  const query = useApi<any>('/student/progress');
  const [requesting, setRequesting] = React.useState(false);

  async function requestReport() {
    setRequesting(true);
    try {
      const response = await api.post('/student/reports/progress', {});
      toast.success(
        response.message ?? 'Your progress report is being prepared — it will appear in downloads.',
      );
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <AsyncSection query={query} skeleton="kpis">
      {(rawData) => {
        const data = {
          readiness: {
            score: rawData?.readiness?.score ?? null,
            delta: rawData?.readiness?.delta ?? null,
            hasData: Boolean(rawData?.readiness?.hasData),
          },
          practiceSessions: rawData?.practiceSessions ?? 0,
          streak: {
            days: rawData?.streak?.days ?? 0,
            lastActiveOn: rawData?.streak?.lastActiveOn ?? '—',
          },
          batchRank: {
            rank: rawData?.batchRank?.rank ?? null,
            outOf: rawData?.batchRank?.outOf ?? null,
          },
          trend: Array.isArray(rawData?.trend) ? rawData.trend : [],
          skillBreakdown: Array.isArray(rawData?.skillBreakdown) ? rawData.skillBreakdown : [],
          dayOneVsToday: {
            rows: Array.isArray(rawData?.dayOneVsToday?.rows) ? rawData.dayOneVsToday.rows : [],
            dayOneAt: rawData?.dayOneVsToday?.dayOneAt ?? null,
          },
          strongestSkill: rawData?.strongestSkill ?? null,
          focusArea: rawData?.focusArea ?? null,
          nextRecommendedActivity: rawData?.nextRecommendedActivity ?? null,
          achievements: Array.isArray(rawData?.achievements) ? rawData.achievements : [],
          semesterTracking: Array.isArray(rawData?.semesterTracking) ? rawData.semesterTracking : [],
        };
        return (
        <>
          <PageHeader
            title="My Progress"
            description="Where you started, where you are, and what moves the number next."
            actions={
              <Button variant="secondary" size="sm" loading={requesting} onClick={requestReport}>
                <Download className="size-3.5" aria-hidden />
                Download progress report
              </Button>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Readiness score"
              value={data.readiness.score ?? '—'}
              outOf={100}
              icon={<TrendingUp />}
              delta={data.readiness.delta}
              deltaLabel={
                data.readiness.delta
                  ? `${data.readiness.delta > 0 ? '+' : ''}${data.readiness.delta} since last update`
                  : undefined
              }
              hasData={data.readiness.hasData}
            />
            <StatCard
              label="Practice sessions"
              value={num(data.practiceSessions)}
              icon={<Target />}
              tone="teal"
            />
            <StatCard
              label="Current streak"
              value={`${data.streak.days} days`}
              icon={<Flame />}
              tone="amber"
              deltaLabel={`Last active ${data.streak.lastActiveOn}`}
            />
            <StatCard
              label="Batch rank"
              value={data.batchRank.rank ? `#${data.batchRank.rank}` : '—'}
              icon={<Trophy />}
              tone="purple"
              deltaLabel={data.batchRank.outOf ? `of ${num(data.batchRank.outOf)} participants` : 'Cohort pending'}
            />
          </div>

          {data.semesterTracking.length > 0 && (
            <TiltCard maxAngle={1.5} glare className="mt-5 p-5 border-line bg-card/90 shadow-card">
              <div className="flex flex-col gap-1 pb-3 border-b border-line-soft sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Semester-Wise EEDI Progression</CardTitle>
                  <CardSubtitle>
                    Official academic semester tracking across Arya College employability milestones
                  </CardSubtitle>
                </div>
                <Badge tone="indigo" className="self-start sm:self-auto">
                  8-Semester Track
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.semesterTracking.map((sem: any) => {
                  const isCurrent = sem.isCurrent;
                  const isEvaluated = sem.score !== null && sem.score !== undefined;
                  const isUpcoming = sem.status === 'UPCOMING';

                  let badgeTone: 'success' | 'info' | 'amber' | 'neutral' = 'neutral';
                  if (isEvaluated) badgeTone = 'success';
                  else if (isCurrent) badgeTone = 'info';
                  else if (isUpcoming) badgeTone = 'neutral';

                  return (
                    <div
                      key={sem.semester}
                      className={cn(
                        'relative rounded-xl border p-4 transition-all',
                        isCurrent
                          ? 'border-indigo-500/40 bg-indigo-500/5 shadow-sm ring-1 ring-indigo-500/20'
                          : 'border-line/70 bg-card-subtle/50 hover:border-line',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                          Semester {sem.semester}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                            Current
                          </span>
                        )}
                      </div>

                      <div className="mt-2.5">
                        <div className="text-lg font-bold text-ink-1">
                          {isEvaluated ? (
                            <span className="text-success">{Number(sem.score).toFixed(1)} EEDI</span>
                          ) : (
                            <span className="text-ink-3 font-medium text-sm">
                              {isCurrent ? 'In Progress' : isUpcoming ? 'Upcoming' : 'Not Evaluated'}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-ink-2 line-clamp-2">{sem.label}</p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-line-soft/60 flex items-center justify-between text-[11px] text-ink-3">
                        <span>{sem.courseTitle}</span>
                        <Badge tone={badgeTone} className="text-[10px] py-0 px-1.5">
                          {sem.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TiltCard>
          )}

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <ChartCard
              title="Readiness over time"
              subtitle="Recalculated whenever a trainer rating or AI score lands"
              description={`Readiness trend across ${data.trend.length} recalculations, currently ${data.readiness.score}.`}
              isEmpty={data.trend.length < 2}
              emptyLabel="Two recalculations are needed before a trend can be drawn"
              height={230}
            >
              <LineTrend
                data={data.trend.map((point: any) => ({
                  label: formatDate(point.at),
                  score: point.score,
                }))}
                xKey="label"
                series={[{ key: 'score', label: 'Readiness' }]}
                domain={[0, 100]}
              />
            </ChartCard>

            <TiltCard maxAngle={2} glare className="p-5 border-line bg-card/90 shadow-card">
              <div className="pb-3 border-b border-line-soft">
                <CardTitle>Skill breakdown</CardTitle>
                <CardSubtitle>Seven employability pillars</CardSubtitle>
              </div>
              <div className="mt-4">
                <SkillBreakdown pillars={data.skillBreakdown} />
              </div>
            </TiltCard>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <TiltCard maxAngle={2} glare className="p-5 border-line bg-card/90 shadow-card">
              <div className="pb-3 border-b border-line-soft">
                <CardTitle>Day one vs today</CardTitle>
                <CardSubtitle>
                  Baseline taken {formatDate(data.dayOneVsToday.dayOneAt)}
                </CardSubtitle>
              </div>
              <TableWrap className="mt-3">
                <Table>
                  <thead>
                    <Tr>
                      <Th>Measure</Th>
                      <Th align="right">Day one</Th>
                      <Th align="right">Today</Th>
                      <Th align="right">Change</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {data.dayOneVsToday.rows.map((row: any) => {
                      const change = Number(row.today) - Number(row.dayOne);
                      return (
                        <Tr key={row.metric}>
                          <Td>{row.metric}</Td>
                          <Td align="right" className="tnum">
                            {num(row.dayOne, 1)}
                          </Td>
                          <Td align="right" className="tnum">
                            {num(row.today, 1)}
                          </Td>
                          <Td align="right" className="tnum">
                            <span
                              className={
                                change > 0 ? 'text-success' : change < 0 ? 'text-danger' : undefined
                              }
                            >
                              {change > 0 ? '+' : ''}
                              {num(change, 1)}
                            </span>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            </TiltCard>

            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <TiltCard maxAngle={2.5} glare className="p-5 border-success-bg bg-success-bg/40 shadow-card">
                  <p className="text-xs font-bold uppercase tracking-wider text-success">
                    Strongest skill
                  </p>
                  <p className="mt-1.5 text-md font-semibold text-ink-1">{data.strongestSkill?.label}</p>
                  <p className="tnum mt-1 text-[22px] font-bold">
                    <AnimatedCounter value={data.strongestSkill?.score} />
                  </p>
                  <p className="mt-0.5 text-xs text-ink-2">{data.strongestSkill?.band}</p>
                </TiltCard>

                <TiltCard maxAngle={2.5} glare className="p-5 border-amber/40 bg-amber-50/60 shadow-card">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-dark">
                    Focus area
                  </p>
                  <p className="mt-1.5 text-md font-semibold text-ink-1">{data.focusArea?.label}</p>
                  <p className="tnum mt-1 text-[22px] font-bold">
                    <AnimatedCounter value={data.focusArea?.score} />
                  </p>
                  <p className="mt-0.5 text-xs text-ink-2">{data.focusArea?.band}</p>
                </TiltCard>
              </div>

              {data.nextRecommendedActivity && (
                <TiltCard maxAngle={2} glare className="p-5 border-line bg-card/90 shadow-card">
                  <div className="flex items-center justify-between pb-3 border-b border-line-soft">
                    <div>
                      <CardTitle>Recommended next</CardTitle>
                      <CardSubtitle>
                        Because {data.nextRecommendedActivity.weakestDimensionLabel} is your lowest
                        dimension
                      </CardSubtitle>
                    </div>
                    <Sparkles className="size-4 text-amber" aria-hidden />
                  </div>
                  <div className="mt-3.5">
                    <p className="text-md font-semibold text-ink-1">
                      {data.nextRecommendedActivity.exerciseTitle}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                      {data.nextRecommendedActivity.reason}
                    </p>
                    <Button asChild variant="primary" size="sm" className="mt-3.5">
                      <Link href="/student/practice">Start practice</Link>
                    </Button>
                  </div>
                </TiltCard>
              )}

              <TiltCard maxAngle={2} glare className="p-5 border-line bg-card/90 shadow-card">
                <div className="flex items-center justify-between pb-3 border-b border-line-soft">
                  <div>
                    <CardTitle>Achievements</CardTitle>
                    <CardSubtitle>
                      {(data.achievements ?? []).filter((badge: any) => badge.earned).length} earned
                    </CardSubtitle>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/student/achievements">All</Link>
                  </Button>
                </div>
                <div className="mt-3.5">
                  <ul className="flex flex-wrap gap-2">
                    {(data.achievements ?? []).slice(0, 8).map((badge: any) => {
                      const Icon = iconFor(badge.icon, Award);
                      return (
                        <li key={badge.code} className="transition-transform hover:scale-105">
                          <Badge tone={badge.earned ? 'success' : 'neutral'}>
                            <Icon className="size-3" aria-hidden />
                            {badge.title}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </TiltCard>
            </div>
          </div>
        </>
        );
      }}
    </AsyncSection>
  );
}
