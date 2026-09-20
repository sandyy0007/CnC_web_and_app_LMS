'use client';

import { BookOpen, CheckCircle2, Clock, PlayCircle } from 'lucide-react';
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
              {path.data.stages.map((stage: any, index: number) => (
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

      <AsyncSection query={courses} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
        {(rows) => {
          const filtered = rows.filter((course) => {
            if (filter === 'all') return true;
            return course.state === filter;
          });

          return (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((course) => {
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
