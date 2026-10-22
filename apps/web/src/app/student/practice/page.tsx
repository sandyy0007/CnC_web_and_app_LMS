'use client';

import { Flame, History, Mic, Play, Sparkles, Target, Video } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { iconFor } from '@/lib/icons';

export default function PracticeLabPage() {
  const [category, setCategory] = React.useState('all');
  const query = useApi<any>('/student/practice/modes');

  return (
    <AsyncSection query={query} skeleton="cards">
      {(data) => {
        const visible = data.modes.filter(
          (mode: any) => category === 'all' || mode.category === category,
        );
        return (
          <>
            <PageHeader
              title="Practice Lab"
              description="Rehearse interviews, group discussions and presentations. Every attempt is scored against the transcript, with the evidence shown."
              actions={
                <Badge tone="amber" dot>
                  <Flame className="size-3" aria-hidden />
                  {data.streak.days}-day streak
                </Badge>
              }
            />

            <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
              <div>
                {data.recommended && (
                  <Card className="mb-4 card-interactive border-amber/40 bg-amber-50/60">
                    <CardBody className="flex flex-wrap items-center gap-4">
                      <span className="flex size-10 items-center justify-center rounded-full bg-amber text-white shadow-xs">
                        <Sparkles className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-[220px] flex-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-dark">
                          Recommended for you
                        </p>
                        <p className="mt-1 text-md font-semibold text-ink-1">
                          {data.recommended.exerciseTitle}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-2">
                          {data.recommended.reason} · Weakest area:{' '}
                          {data.recommended.weakestDimensionLabel} (
                          {data.recommended.weakestScore})
                        </p>
                      </div>
                      <Button asChild variant="primary" size="sm">
                        <Link
                          href={`/student/practice/${data.recommended.practiceModeCode}`}
                        >
                          <Target className="size-3.5" aria-hidden />
                          Start · {data.recommended.estimatedMinutes} min
                        </Link>
                      </Button>
                    </CardBody>
                  </Card>
                )}

                {/* AI Presentation Simulator Card */}
                <Card className="mb-4 card-interactive border-indigo/30 bg-gradient-to-r from-indigo-50/70 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20">
                  <CardBody className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-indigo text-white shadow-xs">
                      <Video className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-[220px] flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-indigo">
                          Interactive Simulation Arena
                        </p>
                        <Badge tone="indigo" className="text-[10px] py-0 px-1.5">
                          8-Stage Simulator
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-md font-bold text-ink-1 dark:text-white">
                        AI Presentation Simulator & Speech Coach
                      </p>
                      <p className="mt-0.5 text-xs text-ink-2 dark:text-slate-300">
                        Live slide delivery (SIH 2026 Bhoorakshak deck), real-time speech-to-text, WPM cadence tracking, and verbal filler diagnostics.
                      </p>
                    </div>
                    <Button asChild variant="primary" size="sm" className="px-4">
                      <Link href="/student/practice/presentation-coach">
                        <Play className="size-3.5 mr-1" aria-hidden />
                        Launch Simulator
                      </Link>
                    </Button>
                  </CardBody>
                </Card>

                <div
                  className="mb-4 flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Filter by category"
                >
                  {['all', ...data.categories].map((item: string) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      aria-pressed={category === item}
                      className={cn(
                        'tactile-press rounded-full border px-3 py-1.5 text-sm font-semibold transition-all duration-150',
                        category === item
                          ? 'border-indigo bg-indigo text-white shadow-xs'
                          : 'border-line bg-white text-ink-2 hover:bg-app hover:border-line-hover',
                      )}
                    >
                      {item === 'all' ? 'All modes' : item}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {visible.map((mode: any) => {
                    const Icon = iconFor(mode.icon, Target);
                    return (
                      <Card key={mode.id} className="card-interactive group flex flex-col">
                        <CardBody className="flex flex-1 flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex size-9 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo transition-transform duration-200 group-hover:scale-110">
                              <Icon className="size-[18px]" aria-hidden />
                            </span>
                            <Badge tone="neutral" className="capitalize">
                              {mode.difficulty}
                            </Badge>
                          </div>
                          <h2 className="mt-3.5 text-md font-semibold text-ink-1">{mode.title}</h2>
                          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                            {mode.description}
                          </p>
                          <dl className="tnum mt-3.5 grid grid-cols-3 gap-2 text-center">
                            {[
                              ['Attempts', String(mode.attempts ?? 0)],
                              ['Last', mode.lastScore != null ? String(mode.lastScore) : '—'],
                              ['Best', mode.bestScore != null ? String(mode.bestScore) : '—'],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-[8px] bg-app px-2 py-1.5">
                                <dd className="text-sm font-bold">{value}</dd>
                                <dt className="text-2xs text-ink-3">{label}</dt>
                              </div>
                            ))}
                          </dl>
                          <p className="mt-3 text-xs text-ink-3">
                            {mode.questions?.length ?? 1} question(s) · ~{mode.durationMinutes} min
                          </p>
                          <div className="mt-auto pt-4">
                            <Button asChild variant="primary" size="sm" className="w-full">
                              <Link href={`/student/practice/${mode.code}`}>
                                <Play className="size-3.5" aria-hidden />
                                {mode.attempts ? 'Practise again' : 'Start practice'}
                              </Link>
                            </Button>
                          </div>
                        </CardBody>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-5">
                <Card className="card-interactive">
                  <CardHeader>
                    <div>
                      <CardTitle>This week</CardTitle>
                      <CardSubtitle>
                        Resets {formatDate(data.weeklyProgress.resetsAt)}
                      </CardSubtitle>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <p className="tnum text-[22px] font-bold leading-none">
                      {data.weeklyProgress.completed}
                      <span className="text-[14px] font-semibold text-ink-3">
                        /{data.weeklyProgress.target} sessions
                      </span>
                    </p>
                    <ProgressBar
                      className="mt-3"
                      showValue={false}
                      value={
                        (data.weeklyProgress.completed /
                          Math.max(1, data.weeklyProgress.target)) *
                        100
                      }
                    />
                  </CardBody>
                </Card>

                <Card className="card-interactive">
                  <CardHeader>
                    <div>
                      <CardTitle>Recent attempts</CardTitle>
                      <CardSubtitle>Your last few sessions</CardSubtitle>
                    </div>
                    <History className="size-4 text-ink-3" aria-hidden />
                  </CardHeader>
                  <CardBody>
                    {data.recentAttempts.length === 0 ? (
                      <p className="py-4 text-center text-sm text-ink-2">
                        No attempts yet — pick a mode to start.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {data.recentAttempts.map((attempt: any) => (
                          <li key={attempt.id}>
                            <Link
                              href={`/student/practice/session/${attempt.id}/feedback`}
                              className="block rounded-[10px] border border-line-soft px-3.5 py-3 transition-all duration-200 hover:border-line-hover hover:bg-slate-50/60 hover:translate-x-0.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="min-w-0 truncate text-base font-semibold">
                                  {attempt.practiceModeTitle}
                                </p>
                                {attempt.overallScore != null ? (
                                  <span className="tnum shrink-0 text-base font-bold">
                                    {attempt.overallScore}
                                    <span className="text-xs text-ink-3">/100</span>
                                  </span>
                                ) : (
                                  <StatusBadge status={attempt.state} />
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-ink-3">
                                Attempt {attempt.attemptNumber} ·{' '}
                                {formatDate(attempt.completedAt ?? attempt.startedAt)}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
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
