'use client';

import { Award, Flame, Gamepad2, Play, Trophy, Zap } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import Image from 'next/image';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';

export default function GamesPage() {
  const [category, setCategory] = React.useState('all');
  const query = useApi<any>('/student/games');

  return (
    <VisualPageBackground
      image="/images/backgrounds/games.webp"
      imageAlt="Skill Games & Interactive Arena"
      overlay="dark"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <AsyncSection query={query} skeleton="cards">
        {(data) => {
          const visible = data.games.filter(
            (game: any) => category === 'all' || game.category === category,
          );
          return (
            <>
            <PageHeader
              title="Skill Games"
              description="Short scenario games that score real decisions — every attempt is recorded and feeds your skills."
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone="amber" dot>
                    <Flame className="size-3" aria-hidden />
                    {data.streak.days}-day streak
                  </Badge>
                  <Badge tone="purple">Level {data.xp.level}</Badge>
                </div>
              }
            />

            <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Card className="card-interactive">
                <CardBody>
                  <p className="text-xs uppercase tracking-wider text-ink-2">Experience</p>
                  <p className="tnum mt-1.5 text-[22px] font-bold leading-none">
                    {num(data.xp.total)} XP
                  </p>
                  <ProgressBar
                    className="mt-3"
                    showValue={false}
                    value={
                      ((data.xp.total - data.xp.levelFloor) /
                        Math.max(1, data.xp.levelCeiling - data.xp.levelFloor)) *
                      100
                    }
                  />
                  <p className="mt-1.5 text-xs text-ink-3">
                    {num(data.xp.levelCeiling - data.xp.total)} XP to level {data.xp.level + 1}
                  </p>
                </CardBody>
              </Card>

              <Card className="card-interactive">
                <CardBody>
                  <p className="text-xs uppercase tracking-wider text-ink-2">Weekly quest</p>
                  <p className="tnum mt-1.5 text-[22px] font-bold leading-none">
                    {num(data.weeklyQuest.earned)}
                    <span className="text-[14px] font-semibold text-ink-3">
                      /{num(data.weeklyQuest.target)} XP
                    </span>
                  </p>
                  <ProgressBar className="mt-3" showValue={false} value={data.weeklyQuest.percent} />
                  <p className="mt-1.5 text-xs text-ink-3">
                    Ends {formatDate(data.weeklyQuest.endsAt)}
                  </p>
                </CardBody>
              </Card>

              <Card className="card-interactive">
                <CardHeader>
                  <div>
                    <CardTitle>Badges</CardTitle>
                    <CardSubtitle>
                      {data.badges.filter((badge: any) => badge.earned).length} earned
                    </CardSubtitle>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/student/achievements">All</Link>
                  </Button>
                </CardHeader>
                <CardBody>
                  <ul className="flex flex-wrap gap-2">
                    {data.badges.slice(0, 6).map((badge: any) => {
                      const Icon = iconFor(badge.icon, Award);
                      return (
                        <li key={badge.code}>
                          <span
                            title={`${badge.title} — ${badge.earned ? 'earned' : `${badge.progressPercent}%`}`}
                            className={cn(
                              'flex size-9 items-center justify-center rounded-[10px] transition-transform hover:scale-110 cursor-pointer',
                              badge.earned ? 'text-white shadow-xs' : 'bg-app text-ink-3',
                            )}
                            style={badge.earned ? { background: badge.color } : undefined}
                          >
                            <Icon className="size-[18px]" aria-hidden />
                            <span className="sr-only">
                              {badge.title}: {badge.earned ? 'earned' : `${badge.progressPercent}% progress`}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
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
                  {item === 'all' ? 'All games' : item}
                </button>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
              <div className="grid gap-4 sm:grid-cols-2">
                {visible.map((game: any) => {
                  const Icon = iconFor(game.icon, Gamepad2);
                  return (
                    <Card key={game.id} className="card-interactive group flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                      <div className="relative h-28 w-full overflow-hidden bg-slate-900">
                        <Image
                          src="/images/backgrounds/games.webp"
                          alt={game.title}
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover opacity-85 group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                        <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-lg bg-purple-600 text-white backdrop-blur-md">
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="text-xs font-semibold text-white drop-shadow-xs">{game.category || 'Scenario'}</span>
                        </div>
                        <Badge tone="neutral" className="absolute top-2.5 right-2.5 bg-slate-900/80 backdrop-blur-md text-white border-white/20">
                          {game.difficulty}
                        </Badge>
                      </div>
                      <CardBody className="flex flex-1 flex-col p-4 sm:p-5">
                        <h2 className="mt-1 text-md font-bold text-ink-1 group-hover:text-purple-600 transition-colors">{game.title}</h2>
                        <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-ink-2 line-clamp-2">
                          {game.description}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {game.skills.map((skill: string) => (
                            <Badge key={skill} tone="indigo" className="text-[11px]">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                        <dl className="tnum mt-3.5 grid grid-cols-3 gap-2 text-center">
                          {[
                            ['Best', game.bestScore ? num(game.bestScore) : '—'],
                            ['Tries', num(game.attempts)],
                            ['XP', `+${game.xpReward}`],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-[8px] bg-slate-100 dark:bg-slate-800/60 px-2 py-1.5">
                              <dd className="text-sm font-bold text-slate-900 dark:text-white">{value}</dd>
                              <dt className="text-2xs text-slate-500">{label}</dt>
                            </div>
                          ))}
                        </dl>
                        <ProgressBar value={game.progressPercent} className="mt-3" showValue={false} thin />
                        <div className="mt-auto pt-4">
                          <InteractiveArrowButton
                            href={`/student/games/${game.id}/play`}
                            variant="gradient"
                            size="sm"
                            className="w-full"
                          >
                            {game.attempts ? 'Play again' : 'Play Quest'} · {game.durationMinutes}m
                          </InteractiveArrowButton>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>

              <Card className="card-interactive self-start">
                <CardHeader>
                  <div>
                    <CardTitle>Leaderboard</CardTitle>
                    <CardSubtitle>Your batch, this month</CardSubtitle>
                  </div>
                  <Trophy className="size-4 text-amber" aria-hidden />
                </CardHeader>
                <CardBody>
                  <ol className="space-y-1.5">
                    {data.leaderboard.map((row: any) => (
                      <li key={row.studentUserId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50/60">
                        <span className="tnum w-5 shrink-0 text-sm font-bold text-ink-3">
                          {row.rank}
                        </span>
                        <Avatar name={row.name} color={row.avatarColor} size={26} />
                        <span className="min-w-0 flex-1 truncate text-base">{row.name}</span>
                        <span className="tnum flex shrink-0 items-center gap-1 text-sm font-bold">
                          <Zap className="size-3 text-amber" aria-hidden />
                          {num(row.xp)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            </div>
          </>
          );
        }}
      </AsyncSection>
    </VisualPageBackground>
  );
}
