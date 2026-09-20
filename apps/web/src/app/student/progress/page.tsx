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
import { AnimatedCounter } from '@/components/ui/counter';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
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
      {(data) => (
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
              value={`#${data.batchRank.rank}`}
              icon={<Trophy />}
              tone="purple"
              deltaLabel={`of ${num(data.batchRank.outOf)} participants`}
            />
          </div>

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

            <Card className="card-interactive">
              <CardHeader>
                <div>
                  <CardTitle>Skill breakdown</CardTitle>
                  <CardSubtitle>Seven employability pillars</CardSubtitle>
                </div>
              </CardHeader>
              <CardBody>
                <SkillBreakdown pillars={data.skillBreakdown} />
              </CardBody>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card className="card-interactive">
              <CardHeader>
                <div>
                  <CardTitle>Day one vs today</CardTitle>
                  <CardSubtitle>
                    Baseline taken {formatDate(data.dayOneVsToday.dayOneAt)}
                  </CardSubtitle>
                </div>
              </CardHeader>
              <TableWrap>
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
            </Card>

            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="card-interactive border-success-bg bg-success-bg/40">
                  <CardBody>
                    <p className="text-xs font-bold uppercase tracking-wider text-success">
                      Strongest skill
                    </p>
                    <p className="mt-1.5 text-md font-semibold text-ink-1">{data.strongestSkill?.label}</p>
                    <p className="tnum text-[22px] font-bold">{data.strongestSkill?.score}</p>
                    <p className="tnum text-[22px] font-bold">
                      <AnimatedCounter value={data.strongestSkill?.score} />
                    </p>
                    <p className="text-xs text-ink-2">{data.strongestSkill?.band}</p>
                  </CardBody>
                </Card>
                <Card className="card-interactive border-amber/40 bg-amber-50/60">
                  <CardBody>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-dark">
                      Focus area
                    </p>
                    <p className="mt-1.5 text-md font-semibold text-ink-1">{data.focusArea?.label}</p>
                    <p className="tnum text-[22px] font-bold">{data.focusArea?.score}</p>
                    <p className="tnum text-[22px] font-bold">
                      <AnimatedCounter value={data.focusArea?.score} />
                    </p>
                    <p className="text-xs text-ink-2">{data.focusArea?.band}</p>
                  </CardBody>
                </Card>
              </div>

              {data.nextRecommendedActivity && (
                <Card className="card-interactive">
                  <CardHeader>
                    <div>
                      <CardTitle>Recommended next</CardTitle>
                      <CardSubtitle>
                        Because {data.nextRecommendedActivity.weakestDimensionLabel} is your lowest
                        dimension
                      </CardSubtitle>
                    </div>
                    <Sparkles className="size-4 text-amber" aria-hidden />
                  </CardHeader>
                  <CardBody>
                    <p className="text-md font-semibold text-ink-1">
                      {data.nextRecommendedActivity.exerciseTitle}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                      {data.nextRecommendedActivity.reason}
                    </p>
                    <Button asChild variant="primary" size="sm" className="mt-3.5">
                      <Link href="/student/practice">Start practice</Link>
                    </Button>
                  </CardBody>
                </Card>
              )}

              <Card className="card-interactive">
                <CardHeader>
                  <div>
                    <CardTitle>Achievements</CardTitle>
                    <CardSubtitle>
                      {(data.achievements ?? []).filter((badge: any) => badge.earned).length} earned
                    </CardSubtitle>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/student/achievements">All</Link>
                  </Button>
                </CardHeader>
                <CardBody>
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
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}
    </AsyncSection>
  );
}
