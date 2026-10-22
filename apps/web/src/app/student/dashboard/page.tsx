'use client';

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  Gauge,
  ListChecks,
  Sparkles,
  Target,
  Trophy,
  Video,
} from 'lucide-react';
import Link from 'next/link';

import { RadialScore } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar, SkillBreakdown } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { TiltCard } from '@/components/ui/TiltCard';
import { DepthCard, DepthLayer } from '@/components/ui/DepthCard';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ImageHero } from '@/components/ui/ImageHero';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { formatDate, formatTime, hours, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { cn } from '@/lib/cn';

export default function StudentDashboardPage() {
  const query = useApi<any>('/student/dashboard');
  const path = useApi<any>('/student/learning-path');

  return (
    <VisualPageBackground
      image="/images/backgrounds/student.webp"
      imageAlt="Participant Learning Platform"
      overlay="dark"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <AsyncSection query={query} skeleton="kpis">
        {(data) => (
          <div className="space-y-5">
            <ImageHero
              image="/images/career-launch.webp"
              imageAlt="Career Acceleration and Employability Launchpad"
              title={`Welcome back, ${data.student.firstName ?? data.student.name}`}
              subtitle={`${data.student.rollNumber} · ${data.student.batchName ?? 'Independent Cohort'} · ${data.student.departmentName}`}
              badge={
                <Badge tone="amber" dot className="bg-amber-500/20 text-amber-200 border-amber-500/30">
                  <Flame className="size-3 mr-1" aria-hidden />
                  {data.streak.days}-day streak
                </Badge>
              }
              actions={
                <InteractiveArrowButton
                  href="/student/practice"
                  variant="gradient"
                  size="md"
                >
                  Practise now
                </InteractiveArrowButton>
              }
            />

          {/* -------------------------------------------------------------- KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Communication readiness"
              value={data.readiness.score ?? '—'}
              outOf={data.readiness.outOf}
              icon={<Gauge />}
              tone="indigo"
              delta={data.readiness.delta}
              deltaLabel={
                data.readiness.delta
                  ? `${data.readiness.delta > 0 ? '+' : ''}${data.readiness.delta} since last update`
                  : 'No change yet'
              }
              hasData={data.readiness.hasData}
              hint={`Blended from trainer ratings (${data.readiness.trainerComponent ?? '—'}) and AI practice scores (${data.readiness.aiComponent ?? '—'}). Scoring v${data.readiness.scoringVersion}.`}
            />
            <StatCard
              label="Learning this week"
              value={hours(Math.round((data.learningHoursThisWeek ?? 0) * 60))}
              icon={<Clock />}
              tone="teal"
            />
            <StatCard
              label="Pending tasks"
              value={num(data.pendingTasks.total)}
              icon={<ListChecks />}
              tone="amber"
              deltaLabel={`${data.pendingTasks.assignments} assignment(s) · ${data.pendingTasks.awaitingTrainerReview} awaiting review`}
            />
            <StatCard
              label="Leaderboard"
              value={`#${data.leaderboard.myRank ?? '—'}`}
              icon={<Trophy />}
              tone="purple"
              deltaLabel={`of ${num(data.leaderboard.outOf)} in your batch`}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <div className="space-y-5">
              {/* ------------------------------------------------ continue learning */}
              {data.continueLearning && (
                <DepthCard maxAngle={2.5} glare className="p-5 border-line bg-card/90 shadow-card">
                  <div className="flex items-center justify-between pb-3 border-b border-line-soft">
                    <DepthLayer z={12}>
                      <div>
                        <CardTitle>Continue learning</CardTitle>
                        <CardSubtitle>{data.continueLearning.moduleLabel}</CardSubtitle>
                      </div>
                    </DepthLayer>
                    <DepthLayer z={20}>
                      <Button asChild variant="primary" size="sm">
                        <Link href={`/student/learning/${data.continueLearning.courseId}`}>
                          {data.continueLearning.percent >= 100 ? 'Review' : 'Resume'}
                        </Link>
                      </Button>
                    </DepthLayer>
                  </div>
                  <DepthLayer z={16} className="mt-4">
                    <div className="flex items-start gap-3.5">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-indigo-50 text-indigo shadow-xs">
                        {(() => {
                          const Icon = iconFor(data.continueLearning.icon, BookOpen);
                          return <Icon className="size-5" aria-hidden />;
                        })()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-md font-semibold">{data.continueLearning.courseTitle}</p>
                        <p className="mt-0.5 text-sm text-ink-2">
                          {data.continueLearning.nextLesson
                            ? `Next: ${data.continueLearning.nextLesson}`
                            : 'All lessons complete'}
                          {data.continueLearning.timeRemainingMinutes
                            ? ` · ${data.continueLearning.timeRemainingMinutes} min left`
                            : ''}
                        </p>
                        <ProgressBar value={data.continueLearning.percent} className="mt-3" />
                      </div>
                    </div>
                  </DepthLayer>
                </DepthCard>
              )}

              {/* ------------------------------------------------------ daily quest */}
              {data.dailyQuest && (
                <TiltCard maxAngle={2} glare className="p-5 border-line bg-card/90 shadow-card">
                  <div className="flex items-center justify-between pb-3 border-b border-line-soft">
                    <div>
                      <CardTitle>Today&apos;s quest</CardTitle>
                      <CardSubtitle>
                        {data.dailyQuest.completed} of {data.dailyQuest.total} done ·{' '}
                        {data.dailyQuest.earnedXp}/{data.dailyQuest.totalXp} XP
                      </CardSubtitle>
                    </div>
                    <Badge tone="indigo">Resets {formatTime(data.dailyQuest.resetsAt)}</Badge>
                  </div>
                  <div className="mt-3.5">
                    <ul className="space-y-2">
                      {(data.dailyQuest.tasks ?? []).map((task: any) => (
                        <li key={task.code}>
                          <Link
                            href={task.href}
                            className={cn(
                              'flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 transition-colors',
                              task.done
                                ? 'border-success-bg bg-success-bg/50'
                                : 'border-line hover:bg-app',
                            )}
                          >
                            {task.done ? (
                              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                            ) : (
                              <Circle className="size-4 shrink-0 text-ink-3" aria-hidden />
                            )}
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate text-base font-semibold',
                                task.done && 'text-ink-2 line-through',
                              )}
                            >
                              {task.label}
                            </span>
                            <span className="tnum shrink-0 text-xs font-bold text-amber-dark">
                              +{task.xp} XP
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TiltCard>
              )}

              {/* -------------------------------------------------- week at a glance */}
              <TiltCard maxAngle={2} glare className="p-5 border-line bg-card/90 shadow-card">
                <div className="flex items-center justify-between pb-3 border-b border-line-soft">
                  <div>
                    <CardTitle>Your week</CardTitle>
                    <CardSubtitle>Classes, assessments and assignment deadlines</CardSubtitle>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/student/live-classes">
                      <CalendarDays className="size-3.5" aria-hidden />
                      Full calendar
                    </Link>
                  </Button>
                </div>
                <div className="mt-3.5">
                  <ol className="grid gap-2 sm:grid-cols-7">
                    {(data.weekAtAGlance ?? []).map((day: any) => (
                      <li
                        key={day.label}
                        className={cn(
                          'min-h-[96px] rounded-[10px] border p-2.5 transition-all duration-150 hover:border-indigo/40',
                          day.isToday ? 'border-indigo bg-indigo-50/60 shadow-xs' : 'border-line-soft bg-app/60',
                        )}
                      >
                        <p
                          className={cn(
                            'text-xs font-bold',
                            day.isToday ? 'text-indigo-600' : 'text-ink-2',
                          )}
                        >
                          {day.label}
                        </p>
                        {day.restDay ? (
                          <p className="mt-1.5 text-2xs text-ink-3">Rest day</p>
                        ) : (
                          <ul className="mt-1.5 space-y-1">
                            {(day.items ?? []).map((item: any, index: number) => (
                              <li
                                key={index}
                                className="rounded-[6px] bg-white px-1.5 py-1 text-2xs leading-snug text-ink-2 shadow-[0_1px_2px_rgba(23,19,64,.05)] transition-transform hover:scale-[1.02]"
                              >
                                <span className="block font-bold text-ink-1">{item.label}</span>
                                <span className="block truncate">{item.title}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </TiltCard>
            </div>

            {/* ---------------------------------------------------------- right rail */}
            <div className="space-y-5">
              <TiltCard maxAngle={2.5} glare className="p-5 border-line bg-card/90 shadow-card">
                <div className="flex items-center justify-between pb-3 border-b border-line-soft">
                  <div>
                    <CardTitle>Communication readiness</CardTitle>
                    <CardSubtitle>
                      Trainer {data.readiness.trainerComponent ?? '—'} · AI{' '}
                      {data.readiness.aiComponent ?? '—'}
                    </CardSubtitle>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-5">
                  <ProgressRing
                    value={data.readiness.hasData ? data.readiness.score : 0}
                    label={data.readiness.hasData ? `${data.readiness.score}` : '—'}
                    sublabel="/100"
                    size={98}
                    tone="indigo"
                  />
                  <p className="text-sm leading-relaxed text-ink-2">
                    Blended from your trainers&apos; parameter ratings and your AI-scored practice
                    attempts, weighted towards recent work.
                  </p>
                </div>
              </TiltCard>

              {data.upcomingLiveSession && (
                <TiltCard maxAngle={2} glare className="p-5 border-line bg-card/90 shadow-card">
                  <div className="pb-3 border-b border-line-soft">
                    <CardTitle>Next live class</CardTitle>
                  </div>
                  <div className="mt-3.5">
                    <p className="text-md font-semibold">{data.upcomingLiveSession.title}</p>
                    <p className="mt-1 text-sm text-ink-2">
                      {data.upcomingLiveSession.trainerName}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                      <CalendarDays className="size-3.5" aria-hidden />
                      {formatDate(data.upcomingLiveSession.startsAt, true)}
                    </p>
                    <Button asChild variant="primary" size="sm" className="mt-3.5 w-full">
                      <Link href="/student/live-classes">
                        <Video className="size-3.5" aria-hidden />
                        Go to live classes
                      </Link>
                    </Button>
                  </div>
                </TiltCard>
              )}

              {data.recommendedActivity && (
                <TiltCard maxAngle={2} glare className="p-5 border-amber/40 bg-amber-50/60 shadow-card">
                  <div className="pb-3 border-b border-amber/20">
                    <CardTitle>Recommended next</CardTitle>
                    <CardSubtitle>
                      Weakest area: {data.recommendedActivity.weakestDimensionLabel} (
                      {data.recommendedActivity.weakestScore})
                    </CardSubtitle>
                  </div>
                  <div className="mt-3.5">
                    <p className="text-md font-semibold text-ink-1">{data.recommendedActivity.exerciseTitle}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                      {data.recommendedActivity.reason}
                    </p>
                    <p className="mt-2.5 text-xs text-ink-2">
                      ~{data.recommendedActivity.estimatedMinutes} min · +
                      {data.recommendedActivity.xpReward} XP
                    </p>
                    <Button asChild variant="primary" size="sm" className="mt-3.5 w-full">
                      <Link href="/student/practice">
                        <Target className="size-3.5" aria-hidden />
                        Start practice
                      </Link>
                    </Button>
                  </div>
                </TiltCard>
              )}

              <TiltCard maxAngle={2} glare className="p-5 border-line bg-card/90 shadow-card">
                <div className="flex items-center justify-between pb-3 border-b border-line-soft">
                  <div>
                    <CardTitle>Skill breakdown</CardTitle>
                    <CardSubtitle>Seven employability pillars</CardSubtitle>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/student/progress">Details</Link>
                  </Button>
                </div>
                <div className="mt-3.5">
                  <SkillBreakdown pillars={data.skillBreakdown} />
                </div>
              </TiltCard>

              {data.coachInsight && (
                <TiltCard maxAngle={2} glare className="p-5 border-indigo-500/20 bg-indigo-500/10 shadow-card">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-400">
                      <Sparkles className="size-3.5" aria-hidden />
                      Coach insight
                    </p>
                    <p className="mt-2 text-base leading-relaxed text-ink-1">
                      {data.coachInsight.observation}
                    </p>
                    <p className="mt-2 text-sm text-ink-2">
                      Focus area: <strong className="font-semibold text-ink-1">{data.coachInsight.focusArea}</strong>
                      {data.coachInsight.recommendedPractice
                        ? ` · Try “${data.coachInsight.recommendedPractice}”`
                        : ''}
                    </p>
                  </div>
                </TiltCard>
              )}

              {path.data && (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Learning path</CardTitle>
                      <CardSubtitle>{path.data.overallPercent}% overall</CardSubtitle>
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-3">
                    {(path.data.stages ?? []).map((stage: any) => (
                      <ProgressBar
                        key={stage.stage}
                        label={`${stage.stage} · ${stage.courses} program(s)`}
                        value={stage.percent}
                      />
                    ))}
                  </CardBody>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Batch leaderboard</CardTitle>
                    <CardSubtitle>You are #{data.leaderboard.myRank}</CardSubtitle>
                  </div>
                </CardHeader>
                <CardBody>
                  <ol className="space-y-2.5">
                    {(data.leaderboard.top ?? []).map((row: any) => (
                      <li key={row.studentUserId} className="flex items-center gap-2.5">
                        <span className="tnum w-5 shrink-0 text-sm font-bold text-ink-3">
                          {row.rank}
                        </span>
                        <Avatar name={row.name} color={row.avatarColor} size={26} />
                        <span className="min-w-0 flex-1 truncate text-base">{row.name}</span>
                        <span className="tnum shrink-0 text-sm font-bold">{num(row.xp)} XP</span>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      )}
    </AsyncSection>
  </VisualPageBackground>
);
}
