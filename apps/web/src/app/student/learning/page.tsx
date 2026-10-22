'use client';

import { ArrowRight, BookOpen, CheckCircle2, Clock, PlayCircle, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { iconFor } from '@/lib/icons';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'not_started', label: 'Not started' },
  { value: 'completed', label: 'Completed' },
];

export default function MyLearningPage() {
  const [filter, setFilter] = React.useState('all');
  const courses = useApi<any[]>('/student/courses');
  const path = useApi<any>('/student/learning-path');
  const recs = useApi<any>('/student/recommendations/courses');

  return (
    <GlobalPageBackground
      image="/images/backgrounds/courses.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <PageHeader
        title="My Learning"
        description="Your enrolled programs, in the order your learning path suggests."
      />

      {/* Diagnosed Skill-Gap Course Recommendations */}
      {/* Diagnosed Skill-Gap Course Recommendations */}
      {recs.data && (
        recs.data.recommendations && recs.data.recommendations.length > 0 ? (
          <Card className="mb-5 card-interactive border-indigo/30 bg-gradient-to-r from-indigo-50/70 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-lg bg-indigo text-white shadow-xs">
                      <Sparkles className="size-3.5" aria-hidden />
                    </span>
                    <CardTitle className="text-base text-ink-1 dark:text-white">
                      Recommended Soft Skills Programs
                    </CardTitle>
                    <Badge tone="indigo" className="text-[10px] py-0 px-1.5 capitalize">
                      {recs.data.diagnosedWeakPillar?.replace('_', ' ') || 'Communication'} Focus
                    </Badge>
                  </div>
                  <CardSubtitle className="mt-1 text-xs">
                    Deterministic curriculum recommendations ranked to close identified growth areas.
                  </CardSubtitle>
                </div>
                <Button asChild variant="secondary" size="sm" className="text-xs">
                  <Link href="/courses">
                    Browse Soft Skills Catalog
                    <ArrowRight className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardBody className="pt-0">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {recs.data.recommendations.slice(0, 4).map((rec: any) => (
                  <div
                    key={rec.courseId}
                    className="rounded-xl bg-white dark:bg-slate-900 p-3.5 border border-line dark:border-slate-800 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <Badge
                          tone={rec.priority === 'HIGH' ? 'danger' : rec.priority === 'MEDIUM' ? 'amber' : 'neutral'}
                          className="text-[10px] py-0 px-1.5"
                        >
                          {rec.priority} Priority
                        </Badge>
                        <span className="text-[10px] font-mono text-ink-3 dark:text-slate-400">
                          Match {rec.score}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-ink-1 dark:text-white line-clamp-1">
                        {rec.title}
                      </h4>
                      <p className="text-[11px] text-ink-2 dark:text-slate-400 mt-1 line-clamp-2">
                        {rec.reasons?.[0] || 'Directly addresses your primary growth area.'}
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-line/60 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-indigo">
                        {rec.category || 'Soft Skills'}
                      </span>
                      <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
                        <Link href={`/student/learning/${rec.courseId}`}>
                          View
                          <ArrowRight className="size-2.5 ml-0.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : (
          <Card className="mb-5 border border-line-soft bg-card/60 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-lg bg-indigo/10 text-indigo">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-1">
                    {recs.data.message || 'No eligible Soft Skills courses available right now.'}
                  </p>
                  <p className="text-xs text-ink-3">
                    You are enrolled in all active Soft Skills modules configured for your cohort.
                  </p>
                </div>
              </div>
              <Button asChild variant="secondary" size="sm" className="text-xs shrink-0">
                <Link href="/courses">
                  Browse Catalog
                  <ArrowRight className="size-3 ml-1" />
                </Link>
              </Button>
            </div>
          </Card>
        )
      )}

      {path.data && (
        <Card className="mb-5 card-interactive">
          <CardHeader>
            <div>
              <CardTitle>Learning path</CardTitle>
              <CardSubtitle>{path.data.overallPercent}% of the full journey complete</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(path.data.stages ?? []).map((stage: any, index: number) => (
                <li key={stage.stage} className="rounded-lg p-1.5 transition-colors hover:bg-slate-50/60">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'tnum flex size-5 items-center justify-center rounded-full text-2xs font-bold',
                        stage.state === 'completed'
                          ? 'bg-success text-white'
                          : stage.state === 'in_progress'
                            ? 'bg-indigo text-white'
                            : 'bg-line-soft text-ink-3',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold">{stage.title}</span>
                  </div>
                  <ProgressBar value={stage.percent} className="mt-2" thin />
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      <div className="mb-4">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {FILTERS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <AsyncSection query={courses} skeleton="cards" isEmpty={(rows) => (rows ?? []).length === 0}>
        {(rawRows) => {
          const rows = Array.isArray(rawRows) ? rawRows : (rawRows as any)?.items ?? (rawRows as any)?.data ?? [];
          const filtered = rows.filter((course: any) => {
            if (filter === 'all') return true;
            return course.state === filter;
          });

          return (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((course: any) => {
                const Icon = iconFor(course.category);
                return (
                  <Card key={course.id} className="flex flex-col">
                    <CardBody className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-indigo/10 text-indigo">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <Badge
                          tone={
                            course.state === 'completed'
                              ? 'success'
                              : course.state === 'in_progress'
                                ? 'indigo'
                                : 'neutral'
                          }
                        >
                          {course.state === 'in_progress'
                            ? 'In progress'
                            : course.state === 'completed'
                              ? 'Completed'
                              : 'Not started'}
                        </Badge>
                      </div>

                      <h2 className="mt-3.5 text-md font-semibold text-ink-1">{course.title}</h2>
                      <p className="mt-0.5 text-sm text-ink-2">
                        {course.trainerName} · {course.difficulty}
                      </p>

                      <ProgressBar value={course.percent} className="mt-3.5" />

                      <div className="mt-3 flex items-center gap-3 text-xs text-ink-3">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3.5" aria-hidden />
                          {course.timeRemainingMinutes
                            ? `${course.timeRemainingMinutes} min left`
                            : `${course.durationHours}h program`}
                        </span>
                        <span>{course.stage}</span>
                      </div>

                      {course.nextLesson && (
                        <p className="mt-2.5 truncate text-sm text-ink-2">
                          Next: <span className="font-semibold text-ink-1">{course.nextLesson}</span>
                        </p>
                      )}

                      <div className="mt-auto pt-4">
                        <Button
                          asChild
                          variant={course.state === 'completed' ? 'secondary' : 'primary'}
                          size="sm"
                          className="w-full"
                        >
                          <Link href={`/student/learning/${course.id}`}>
                            <PlayCircle className="size-3.5" aria-hidden />
                            {course.state === 'completed'
                              ? 'Review program'
                              : course.state === 'in_progress'
                                ? 'Continue'
                                : 'Start program'}
                          </Link>
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          );
        }}
      </AsyncSection>
    </GlobalPageBackground>
  );
}
