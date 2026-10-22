'use client';

import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  PlayCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { ErrorState, LoadingSkeleton } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { duration, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { useAppSelector } from '@/store';

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const { data, error, initialLoading, refetch } = useApi<any>(`/home/courses/${params.slug}`);
  const [startingTrial, setStartingTrial] = React.useState(false);

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

  const courseFee = data?.fee ?? data?.price ?? 2499;
  const trialDuration = data?.trial_duration_days ?? data?.trialDurationDays ?? 3;
  const isTrialAvailable = data?.trial_enabled ?? data?.trialEnabled ?? true;

  const handleStartTrial = async () => {
    if (!user) {
      router.push(`/signup?redirect=/courses/${params.slug}`);
      return;
    }
    if (user.role !== 'STUDENT') {
      toast.info('Please log in with a student account to initiate a course trial.');
      return;
    }

    setStartingTrial(true);
    try {
      await api.post(`/student/courses/${data.id}/start-trial`, {});
      toast.success(`3-Day (72-Hour) Free Trial activated! Enjoy full access.`);
      router.push(`/student/learning/${data.id}`);
    } catch (err: any) {
      if (err.message && err.message.includes('already used')) {
        toast.info('You have already used your 3-day free trial for this course.');
        router.push(`/student/payments?courseId=${data.id}`);
      } else {
        toast.error(err.message || 'Failed to start trial.');
      }
    } finally {
      setStartingTrial(false);
    }
  };

  return (
    <GlobalPageBackground
      image="/images/backgrounds/course-detail.webp"
      orbTone="indigo"
      className="min-h-screen py-10 px-4"
    >
      <div className="mx-auto max-w-[900px]">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink-1"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All programs
        </Link>

        <div className="mt-5 flex flex-col md:flex-row items-start justify-between gap-6">
          <div className="flex items-start gap-4 flex-1">
            <span className="flex size-12 items-center justify-center rounded-[12px] bg-indigo-500/20 border border-indigo-500/30 text-indigo-500 shrink-0">
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="indigo">{data.category}</Badge>
                <Badge tone={data.courseMode === 'OFFLINE' ? 'amber' : 'success'}>
                  {data.courseMode === 'OFFLINE' ? 'Offline (Campus Cohort)' : 'Online (Direct Platform)'}
                </Badge>
                {isTrialAvailable && (
                  <Badge tone="amber" className="bg-amber-500/20 text-amber-200 border-amber-500/30">
                    <Sparkles className="size-3 mr-1 inline" />
                    {trialDuration}-Day Free Trial (72 Hours)
                  </Badge>
                )}
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  <Clock className="size-3.5" aria-hidden />
                  {data.durationHours} hours
                </span>
              </div>
              <h1 className="mt-2.5 font-serif text-[28px] font-semibold leading-tight tracking-tight text-ink-1">
                {data.title}
              </h1>
              <p className="mt-2 text-md leading-relaxed text-ink-2">{data.description}</p>
            </div>
          </div>

          {/* Pricing & CTA Card */}
          <div className="w-full md:w-72 shrink-0 p-5 rounded-2xl border border-indigo-500/20 bg-slate-900/80 backdrop-blur-md text-white shadow-xl space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">Course Price</span>
                <span className="text-3xl font-extrabold text-white">
                  ₹{num(courseFee)}
                </span>
              </div>
              {isTrialAvailable && (
                <Badge tone="amber" className="text-[10px]">
                  {trialDuration}-Day Trial
                </Badge>
              )}
            </div>

            <div className="space-y-2 pt-2">
              {isTrialAvailable && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleStartTrial}
                  disabled={startingTrial}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="size-4" />
                  {startingTrial ? 'Starting Trial…' : `Start ${trialDuration}-Day Free Trial`}
                </Button>
              )}

              {user?.role === 'STUDENT' ? (
                <Button
                  asChild
                  variant="secondary"
                  size="md"
                  className="w-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700 flex items-center justify-center gap-1.5"
                >
                  <Link href={`/student/payments`}>
                    <CreditCard className="size-4" />
                    Buy Lifetime Access
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild
                  variant="secondary"
                  size="md"
                  className="w-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700 flex items-center justify-center gap-1.5"
                >
                  <Link href={`/signup`}>Create Account to Enrol</Link>
                </Button>
              )}
            </div>

            <div className="space-y-1.5 pt-2 text-[11px] text-slate-400 border-t border-slate-800">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="size-3.5" />
                <span>UPI ID, QR Code &amp; Gateway accepted</span>
              </div>
              <p>Full 72 hours trial · Progress saved automatically</p>
            </div>
          </div>
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
                <dt className="text-xs text-ink-3">{label}</dt>
                <dd className="mt-1 text-md font-semibold text-ink-1">{value}</dd>
              </CardBody>
            </Card>
          ))}
        </dl>

        <h2 className="mt-9 text-lg font-semibold text-ink-1">What you will cover</h2>
        <div className="mt-3.5 space-y-3">
          {(data.modules ?? []).map((module: any, index: number) => (
            <Card key={module.id}>
              <CardBody className="p-5">
                <div className="flex items-start gap-3">
                  <span className="tnum mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-bold text-ink-1 border border-line dark:bg-white/10 dark:text-white dark:border-transparent">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-md font-semibold text-ink-1">{module.title}</h3>
                    {module.description && (
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">{module.description}</p>
                    )}
                    {module.lessons?.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {module.lessons.map((lesson: any) => (
                          <li key={lesson.id} className="flex items-center gap-2 text-sm text-ink-2">
                            {lesson.kind === 'video' ? (
                              <PlayCircle className="size-3.5 shrink-0 text-indigo" aria-hidden />
                            ) : (
                              <CheckCircle2 className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                            {lesson.durationSeconds ? (
                              <span className="tnum shrink-0 text-xs text-ink-3">
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
