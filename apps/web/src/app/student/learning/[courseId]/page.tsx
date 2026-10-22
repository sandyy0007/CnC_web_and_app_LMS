'use client';

import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Lock,
  PlayCircle,
  ShieldAlert,
  Video,
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
import { duration, formatDate, num } from '@/lib/format';
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
  const courseId = params.courseId;

  const query = useApi<any>(`/student/courses/${courseId}`);
  const accessQuery = useApi<any>(`/student/courses/${courseId}/access`);
  const materialsQuery = useApi<any>(`/student/courses/${courseId}/materials`);
  const recordingsQuery = useApi<any>(`/student/courses/${courseId}/recordings`);
  const sessionsQuery = useApi<any>(`/student/courses/${courseId}/sessions`);

  const [activeTab, setActiveTab] = React.useState<'lessons' | 'materials' | 'recordings' | 'sessions'>('lessons');
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const startedAt = React.useRef<number>(Date.now());

  const lessons: Lesson[] = React.useMemo(
    () => (query.data?.modules ?? []).flatMap((module: any) => module.lessons ?? []),
    [query.data],
  );

  // Open first unfinished lesson by default
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
      await api.post(`/student/courses/${courseId}/progress`, {
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

  const access = accessQuery.data;
  const isTrialActive = access?.accessType === 'trial' && !access?.trialExpired;
  const isTrialExpired = access?.trialExpired || (access?.accessType === 'none' && access?.trial?.status === 'expired');
  const hasAccess = access?.hasAccess !== false && !isTrialExpired;

  return (
    <AsyncSection query={query} skeleton="detail">
      {(course) => {
        const Icon = iconFor(course.icon, BookOpen);
        const percent = course.progress?.percent ?? 0;

        return (
          <div className="space-y-6">
            <PageHeader
              breadcrumbs={[
                { label: 'My Learning', href: '/student/learning' },
                { label: course.title },
              ]}
              title={course.title}
              description={`${course.trainerName ?? 'Winners Creek Faculty'} · ${course.difficulty ?? 'All Levels'} · ${course.durationHours ?? 40}h`}
              actions={
                <div className="flex items-center gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/student/learning">
                      <ArrowLeft className="size-3.5 mr-1" aria-hidden />
                      My Learning
                    </Link>
                  </Button>
                  {!hasAccess && (
                    <Button asChild variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-700">
                      <Link href="/student/payments">
                        Unlock Full Access (₹{num(course.fee ?? 2499)})
                      </Link>
                    </Button>
                  )}
                </div>
              }
            />

            {/* Trial Active Banner */}
            {isTrialActive && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                  <p className="text-amber-900 dark:text-amber-200">
                    <strong>3-Day Free Trial (72 Hours):</strong>{' '}
                    {access?.hoursRemaining !== undefined
                      ? `${access.hoursRemaining} hours remaining.`
                      : `${access?.trial?.daysRemaining ?? 3} days remaining.`}{' '}
                    All progress is automatically saved to your account.
                  </p>
                </div>
                <Button asChild size="sm" variant="primary" className="bg-amber-600 hover:bg-amber-700 text-xs">
                  <Link href="/student/payments">Upgrade to Full Access (₹{num(course.fee ?? 2499)})</Link>
                </Button>
              </div>
            )}

            {/* Trial Expired / Locked Barrier Banner */}
            {!hasAccess && (
              <div className="rounded-2xl border border-rose-300 bg-rose-50/80 p-6 dark:border-rose-900/50 dark:bg-rose-950/30 text-center space-y-3 shadow-md">
                <ShieldAlert className="size-8 text-rose-500 mx-auto" />
                <h3 className="font-bold text-base text-rose-950 dark:text-rose-100">
                  {isTrialExpired ? 'Your 3-Day Free Trial Has Expired' : 'Enrolment Required to Access Course Content'}
                </h3>
                <p className="text-xs text-rose-800 dark:text-rose-200 max-w-lg mx-auto leading-relaxed">
                  Your learning progress and completed lessons are securely preserved. To continue accessing lessons, class materials, live interactive sessions, and certificates, unlock lifetime course access.
                </p>
                <div className="pt-2">
                  <Button asChild size="md" variant="primary" className="bg-indigo-600 hover:bg-indigo-700 font-bold px-6">
                    <Link href="/student/payments">
                      Unlock Full Access for ₹{num(course.fee ?? 2499)}
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            {/* Content Navigation Tabs */}
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200 dark:border-slate-700/60 text-xs w-fit">
              <button
                onClick={() => setActiveTab('lessons')}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'lessons'
                    ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Curriculum Lessons
              </button>
              <button
                onClick={() => setActiveTab('materials')}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'materials'
                    ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Class Materials ({materialsQuery.data?.length ?? 0})
              </button>
              <button
                onClick={() => setActiveTab('recordings')}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'recordings'
                    ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Recordings ({recordingsQuery.data?.length ?? 0})
              </button>
              <button
                onClick={() => setActiveTab('sessions')}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'sessions'
                    ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Live Classes &amp; Meetings ({sessionsQuery.data?.length ?? 0})
              </button>
            </div>

            {/* TAB 1: CURRICULUM LESSONS */}
            {activeTab === 'lessons' && (
              <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
                <div className="space-y-5">
                  <Card elevated>
                    <CardBody>
                      {active ? (
                        <>
                          <div className="flex items-start gap-3.5">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
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

                          <div className="mt-5 rounded-xl surface-3d border border-slate-200/80 dark:border-white/[0.08] p-5">
                            {!hasAccess ? (
                              <div className="text-center py-6 space-y-2">
                                <Lock className="size-6 text-slate-400 mx-auto" />
                                <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                                  Lesson Content Locked
                                </p>
                                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                  Your free trial has ended. Complete your course payment to view this lesson.
                                </p>
                              </div>
                            ) : (
                              <p className="text-base leading-relaxed text-ink-1">
                                {active.content ??
                                  active.summary ??
                                  'Lesson material for this session is delivered in class by your trainer. Use the practice lab to rehearse what it covers, then mark the lesson complete to keep your path up to date.'}
                              </p>
                            )}
                          </div>

                          {hasAccess && (
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
                          )}
                        </>
                      ) : (
                        <p className="py-8 text-center text-base text-ink-2">
                          This program has no lessons published yet.
                        </p>
                      )}
                    </CardBody>
                  </Card>

                  <Card elevated>
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
                                    'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-base transition-all duration-150',
                                    lesson.id === activeId
                                      ? 'bg-indigo-50 dark:bg-indigo-950/50 font-semibold text-indigo-600 dark:text-indigo-400 shadow-3d-card'
                                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]',
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
                    <CardHeader>
                      <CardTitle>Your Progress</CardTitle>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink-2">Completion</span>
                        <span className="font-bold text-ink-1">{percent}%</span>
                      </div>
                      <ProgressBar value={percent} tone="indigo" />
                      <p className="text-xs text-slate-500">
                        {lessons.filter((l) => l.completed).length} of {lessons.length} lessons finished.
                      </p>
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}

            {/* TAB 2: CLASS MATERIALS */}
            {activeTab === 'materials' && (
              <Card elevated>
                <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderOpen className="size-4 text-indigo-500" />
                    Class Notes, Handouts &amp; Reading Materials
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Course resources and documentation published by your assigned trainers.
                  </p>
                </CardHeader>
                <CardBody className="p-0">
                  {!hasAccess ? (
                    <div className="p-12 text-center space-y-2">
                      <Lock className="size-8 text-slate-400 mx-auto" />
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        Class Materials Locked
                      </p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Enroll in this course or activate your free trial to download learning materials.
                      </p>
                    </div>
                  ) : materialsQuery.data && materialsQuery.data.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {materialsQuery.data.map((m: any) => (
                        <div key={m.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <div className="flex items-center gap-3">
                            <span className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600">
                              <FileText className="size-4" />
                            </span>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white text-sm">{m.title}</p>
                              <p className="text-[11px] text-slate-500">
                                {m.materialType} · Uploaded by {m.trainerName || 'Trainer'} · {formatDate(m.createdAt)}
                              </p>
                              {m.description && <p className="text-slate-600 dark:text-slate-400 mt-1">{m.description}</p>}
                            </div>
                          </div>
                          <Button asChild size="sm" variant="secondary" className="text-xs">
                            <a href={m.fileUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="size-3 mr-1" />
                              Download
                            </a>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-xs text-slate-500">
                      No supplementary class materials uploaded for this course yet.
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {/* TAB 3: RECORDINGS */}
            {activeTab === 'recordings' && (
              <Card elevated>
                <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Video className="size-4 text-indigo-500" />
                    Archived Session Recordings
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Watch replay videos of past lecture sessions and lab walkthroughs.
                  </p>
                </CardHeader>
                <CardBody className="p-0">
                  {!hasAccess ? (
                    <div className="p-12 text-center space-y-2">
                      <Lock className="size-8 text-slate-400 mx-auto" />
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        Recordings Locked
                      </p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Upgrade your account to watch recorded lectures and coding walkthroughs.
                      </p>
                    </div>
                  ) : recordingsQuery.data && recordingsQuery.data.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {recordingsQuery.data.map((r: any) => (
                        <div key={r.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <div className="flex items-center gap-3">
                            <span className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600">
                              <PlayCircle className="size-4" />
                            </span>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white text-sm">{r.title}</p>
                              <p className="text-[11px] text-slate-500">
                                Faculty: {r.trainerName || 'Faculty'} · {formatDate(r.createdAt)}
                                {r.durationSeconds ? ` · ${Math.round(r.durationSeconds / 60)} mins` : ''}
                              </p>
                            </div>
                          </div>
                          <Button asChild size="sm" variant="primary" className="text-xs">
                            <a href={r.recordingUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="size-3 mr-1" />
                              Watch Recording
                            </a>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-xs text-slate-500">
                      No class recordings available yet for this course.
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {/* TAB 4: LIVE CLASSES & MEETING LINKS */}
            {activeTab === 'sessions' && (
              <Card elevated>
                <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="size-4 text-indigo-500" />
                    Live Virtual Classroom Schedule
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Interactive live training sessions. Meeting links are displayed exclusively to verified enrolled or active trial participants.
                  </p>
                </CardHeader>
                <CardBody className="p-0">
                  {sessionsQuery.data && sessionsQuery.data.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {sessionsQuery.data.map((s: any) => (
                        <div key={s.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-900 dark:text-white text-sm">{s.topic}</p>
                            <p className="text-[11px] text-slate-500">
                              Date: {s.date || 'TBD'} · Time: {s.startTime || 'TBD'} - {s.endTime || 'TBD'}
                            </p>
                            {s.meetingPassword && hasAccess && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                                Passcode: {s.meetingPassword}
                              </p>
                            )}
                          </div>
                          <div>
                            {hasAccess && s.meetingLink ? (
                              <Button asChild size="sm" variant="primary" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                                <a href={s.meetingLink} target="_blank" rel="noopener noreferrer">
                                  <Video className="size-3 mr-1" />
                                  Join Meeting
                                </a>
                              </Button>
                            ) : (
                              <Badge tone="neutral" className="flex items-center gap-1 text-[11px]">
                                <Lock className="size-3" />
                                {!hasAccess ? 'Access Locked' : 'Link Pending'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-xs text-slate-500">
                      No live sessions currently scheduled for this course. Check back soon.
                    </div>
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        );
      }}
    </AsyncSection>
  );
}
