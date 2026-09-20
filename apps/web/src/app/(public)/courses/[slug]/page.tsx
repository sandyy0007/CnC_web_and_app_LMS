'use client';

import { ArrowLeft, BookOpen, CheckCircle2, Clock, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ErrorState, LoadingSkeleton } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { useApi } from '@/hooks/useApi';
import { duration } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { useAppSelector } from '@/store';

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const user = useAppSelector((state) => state.auth.user);
  const { data, error, initialLoading, refetch } = useApi<any>(`/home/courses/${params.slug}`);
  const Icon = iconFor(data?.icon, BookOpen);

  if (initialLoading) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10">
        <LoadingSkeleton variant="detail" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10">
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  const lessonCount = (data?.modules ?? []).reduce(
    (total: number, module: any) => total + (module.lessons?.length ?? 0),
    0,
  );

  return (
    <GlobalPageBackground
      image="/images/backgrounds/course-detail.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-screen py-10 px-4"
    >
      <div className="mx-auto max-w-[900px]">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-white"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All programs
        </Link>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex size-12 items-center justify-center rounded-[12px] bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="min-w-[240px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="indigo">{data.category}</Badge>
                <Badge tone={data.courseMode === 'OFFLINE' ? 'amber' : 'success'}>
                  {data.courseMode === 'OFFLINE' ? 'Offline (Campus Cohort)' : 'Online (Direct Platform)'}
                </Badge>
                <Badge tone="neutral">{data.difficulty}</Badge>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="size-3.5" aria-hidden />
                  {data.durationHours} hours
                </span>
              </div>
              <h1 className="mt-2.5 font-serif text-[28px] font-semibold leading-tight tracking-tight text-white">
                {data.title}
              </h1>
              <p className="mt-2 text-md leading-relaxed text-slate-300">{data.description}</p>
            </div>
          </div>
          <InteractiveArrowButton
            href={user?.role === 'STUDENT' ? '/student/learning' : '/signup'}
            variant="gradient"
            size="md"
          >
            {user?.role === 'STUDENT' ? 'Open in My Learning' : 'Create an account to enrol'}
          </InteractiveArrowButton>
        </div>

        <dl className="mt-7 grid gap-4 sm:grid-cols-4">
          {[
            ['Delivery Mode', data.courseMode === 'OFFLINE' ? 'Campus Cohort' : 'Online / Hybrid'],
            ['Stage', data.stage],
            ['Modules', String(data.modules?.length ?? 0)],
            ['Lessons', String(lessonCount)],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardBody className="p-4">
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="mt-1 text-md font-semibold text-white">{value}</dd>
              </CardBody>
            </Card>
          ))}
        </dl>

        <h2 className="mt-9 text-lg font-semibold text-white">What you will cover</h2>
        <div className="mt-3.5 space-y-3">
          {(data.modules ?? []).map((module: any, index: number) => (
            <Card key={module.id}>
              <CardBody className="p-5">
                <div className="flex items-start gap-3">
                  <span className="tnum mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-md font-semibold text-white">{module.title}</h3>
                    {module.description && (
                      <p className="mt-1 text-sm leading-relaxed text-slate-300">{module.description}</p>
                    )}
                    {module.lessons?.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {module.lessons.map((lesson: any) => (
                          <li key={lesson.id} className="flex items-center gap-2 text-sm text-slate-300">
                            {lesson.kind === 'video' ? (
                              <PlayCircle className="size-3.5 shrink-0 text-indigo-400" aria-hidden />
                            ) : (
                              <CheckCircle2 className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                            {lesson.durationSeconds ? (
                              <span className="tnum shrink-0 text-xs text-slate-400">
                                {duration(lesson.durationSeconds)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
          {!data.modules?.length && (
            <Card>
              <CardBody className="p-5 text-sm text-slate-400">
                The syllabus for this program is being finalised by the programme office.
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </GlobalPageBackground>
  );
}
