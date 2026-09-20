'use client';

import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  PlayCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { duration } from '@/lib/format';
import { iconFor } from '@/lib/icons';

interface Lesson {
  id: string;
  title: string;
  kind?: string;
  durationSeconds?: number;
  completed?: boolean;
  content?: string;
  summary?: string;
}

export default function CoursePlayerPage() {
  const params = useParams<{ courseId: string }>();
  const query = useApi<any>(`/student/courses/${params.courseId}`);
  const accessQuery = useApi<any>(`/student/courses/${params.courseId}/access`);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [startingTrial, setStartingTrial] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const startedAt = React.useRef<number>(Date.now());

  const lessons: Lesson[] = React.useMemo(
    () => (query.data?.modules ?? []).flatMap((module: any) => module.lessons ?? []),
    [query.data],
  );

  // Open the first unfinished lesson by default.
  React.useEffect(() => {
    if (activeId || !lessons.length) return;
    setActiveId((lessons.find((lesson) => !lesson.completed) ?? lessons[0]).id);
  }, [lessons, activeId]);

  const active = lessons.find((lesson) => lesson.id === activeId) ?? null;

  async function markComplete(lesson: Lesson) {
    setSaving(true);
    try {
      const minutes = Math.max(
        1,
        Math.min(60, Math.round((Date.now() - startedAt.current) / 60000)),
      );
      await api.post(`/student/courses/${params.courseId}/progress`, {
        lessonId: lesson.id,
        percent: 100,
        minutesSpent: minutes,
      });
      startedAt.current = Date.now();
      toast.success(`“${lesson.title}” marked complete`);
      query.refetch();
      const index = lessons.findIndex((item) => item.id === lesson.id);
      const next = lessons[index + 1];
      if (next) setActiveId(next.id);
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AsyncSection query={query} skeleton="detail">
      {(course) => {
        const Icon = iconFor(course.icon, BookOpen);
        const percent = course.progress?.percent ?? 0;
        return (
          <>
            <PageHeader
              breadcrumbs={[
                { label: 'My Learning', href: '/student/learning' },
                { label: course.title },
              ]}
              title={course.title}
              description={`${course.trainerName ?? 'Winners Creek Faculty'} · ${course.difficulty} · ${course.durationHours}h`}
              actions={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/student/learning">
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Back to My Learning
                  </Link>
                </Button>
              }
            />

            {accessQuery.data?.accessType === 'trial' && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                  <p className="text-amber-900 dark:text-amber-200">
                    <strong>7-Day Free Trial:</strong> You have {accessQuery.data.trial?.daysRemaining ?? 7} day(s) remaining. All course progress is saved automatically.
                  </p>
                </div>
                <Button asChild size="sm" variant="primary">
                  <Link href="/student/payments">Upgrade to Full Access</Link>
                </Button>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
              <div className="space-y-5">
                <Card>
                  <CardBody>
                    {active ? (
                      <>
                        <div className="flex items-start gap-3.5">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-indigo-50 text-indigo">
                            {active.kind === 'video' ? (
                              <PlayCircle className="size-5" aria-hidden />
                            ) : (
                              <FileText className="size-5" aria-hidden />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs uppercase tracking-wider text-ink-3">
                              {active.kind === 'video' ? 'Video lesson' : 'Reading'}
                              {active.durationSeconds
                                ? ` · ${duration(active.durationSeconds)}`
                                : ''}
                            </p>
                            <h2 className="mt-1 text-[17px] font-semibold">{active.title}</h2>
                          </div>
                          {active.completed && (
                            <Badge tone="success">
                              <CheckCircle2 className="size-3" aria-hidden />
                              Done
                            </Badge>
                          )}
                        </div>

                        <div className="mt-5 rounded-[12px] bg-app p-5">
                          <p className="text-base leading-relaxed text-ink-1">
                            {active.content ??
                              active.summary ??
                              'Lesson material for this session is delivered in class by your trainer. Use the practice lab to rehearse what it covers, then mark the lesson complete to keep your path up to date.'}
                          </p>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-2.5">
                          <Button
                            variant="primary"
                            onClick={() => markComplete(active)}
                            disabled={saving || active.completed}
                            loading={saving}
                          >
                            {active.completed ? 'Already complete' : 'Mark lesson complete'}
                          </Button>
                          <Button asChild variant="secondary">
                            <Link href="/student/practice">Practise this skill</Link>
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="py-8 text-center text-base text-ink-2">
                        This program has no lessons published yet.
                      </p>
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Syllabus</CardTitle>
                      <CardSubtitle>
                        {lessons.filter((lesson) => lesson.completed).length} of {lessons.length}{' '}
                        lessons complete
                      </CardSubtitle>
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    {(course.modules ?? []).map((module: any, index: number) => (
                      <div key={module.id}>
                        <p className="text-sm font-bold">
                          {index + 1}. {module.title}
                        </p>
                        <ul className="mt-2 space-y-1">
                          {(module.lessons ?? []).map((lesson: Lesson) => (
                            <li key={lesson.id}>
                              <button
                                type="button"
                                onClick={() => setActiveId(lesson.id)}
                                aria-current={lesson.id === activeId ? 'true' : undefined}
                                className={cn(
                                  'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-base transition-colors',
                                  lesson.id === activeId
                                    ? 'bg-indigo-50 font-semibold text-indigo-600'
                                    : 'hover:bg-app',
                                )}
                              >
                                {lesson.completed ? (
                                  <CheckCircle2
                                    className="size-3.5 shrink-0 text-success"
                                    aria-hidden
                                  />
                                ) : (
                                  <Circle className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                                )}
                                <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                                {lesson.durationSeconds ? (
                                  <span className="tnum shrink-0 text-xs text-ink-3">
                                    {duration(lesson.durationSeconds)}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              </div>

              <div className="space-y-5">
                <Card>
                  <CardBody>
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-[11px] bg-indigo-50 text-indigo">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-md font-semibold">{course.stage}</p>
                        <p className="text-sm text-ink-2">{course.category}</p>
                      </div>
                    </div>
                    <ProgressBar label="Program progress" value={percent} className="mt-4" />
                    <p className="mt-3 text-sm leading-relaxed text-ink-2">{course.description}</p>
                    {saving && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                        Saving your progress…
                      </p>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          </>
        );
      }}
    </AsyncSection>
  );
}
