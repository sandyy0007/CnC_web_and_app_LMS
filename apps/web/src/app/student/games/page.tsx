'use client';

import {
  Award,
  Flame,
  Gamepad2,
  Trophy,
  Zap,
  KeyRound,
  Search,
  Dices,
  ShieldCheck,
  Inbox,
  Headphones,
  Mic,
  Clock,
  Sparkles,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardTitle, CardSubtitle } from '@/components/ui/card';
import { TiltCard } from '@/components/ui/TiltCard';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';

// Visual identity map for all 7 canonical games
const GAME_THEMES: Record<
  string,
  {
    gradient: string;
    border: string;
    glow: string;
    accentBg: string;
    accentText: string;
    icon: any;
    tagline: string;
    mechanicLabel: string;
    patternSvg: React.ReactNode;
  }
> = {
  'read-escape': {
    gradient: 'from-emerald-950 via-teal-950/70 to-slate-950',
    border: 'border-emerald-500/30 hover:border-emerald-400/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]',
    accentBg: 'bg-emerald-500/20',
    accentText: 'text-emerald-400',
    icon: KeyRound,
    tagline: 'Cryptic Chamber Vault',
    mechanicLabel: 'Lockout Puzzles & Reading Evidences',
    patternSvg: (
      <svg className="absolute inset-0 w-full h-full opacity-15" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-read" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-emerald-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-read)" />
      </svg>
    ),
  },
  'reading-detective': {
    gradient: 'from-amber-950 via-yellow-950/70 to-slate-950',
    border: 'border-amber-500/30 hover:border-amber-400/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(245,158,11,0.2)]',
    accentBg: 'bg-amber-500/20',
    accentText: 'text-amber-400',
    icon: Search,
    tagline: 'Forensic Investigation Dossier',
    mechanicLabel: 'Clue Deduction & Timeline Analysis',
    patternSvg: (
      <svg className="absolute inset-0 w-full h-full opacity-15" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-detective" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="1.5" fill="currentColor" className="text-amber-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-detective)" />
      </svg>
    ),
  },
  'snake-ladder': {
    gradient: 'from-purple-950 via-indigo-950/70 to-slate-950',
    border: 'border-purple-500/30 hover:border-purple-400/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]',
    accentBg: 'bg-purple-500/20',
    accentText: 'text-purple-400',
    icon: Dices,
    tagline: 'Dynamic Board Expedition',
    mechanicLabel: 'Dice Velocity, Ladder Ascents & Trap Evasions',
    patternSvg: (
      <svg className="absolute inset-0 w-full h-full opacity-15" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-snake" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 0 10 L 20 10 M 10 0 L 10 20" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-purple-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-snake)" />
      </svg>
    ),
  },
  'email-escape': {
    gradient: 'from-cyan-950 via-sky-950/70 to-slate-950',
    border: 'border-cyan-500/30 hover:border-cyan-400/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]',
    accentBg: 'bg-cyan-500/20',
    accentText: 'text-cyan-400',
    icon: ShieldCheck,
    tagline: 'Cyber Terminal Defense',
    mechanicLabel: 'Phishing Threat Vector Analysis & Etiquette',
    patternSvg: (
      <svg className="absolute inset-0 w-full h-full opacity-15" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-email" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 0 0 L 14 14 L 28 0" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-cyan-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-email)" />
      </svg>
    ),
  },
  'inbox-rescue': {
    gradient: 'from-rose-950 via-red-950/70 to-slate-950',
    border: 'border-rose-500/30 hover:border-rose-400/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(244,63,94,0.2)]',
    accentBg: 'bg-rose-500/20',
    accentText: 'text-rose-400',
    icon: Inbox,
    tagline: 'Critical Ticket Triage Command',
    mechanicLabel: 'SLA Escalation & Customer Sentiment Defense',
    patternSvg: (
      <svg className="absolute inset-0 w-full h-full opacity-15" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-inbox" width="24" height="24" patternUnits="userSpaceOnUse">
            <line x1="0" y1="24" x2="24" y2="0" stroke="currentColor" strokeWidth="0.5" className="text-rose-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-inbox)" />
      </svg>
    ),
  },
  'listening-quest': {
    gradient: 'from-teal-950 via-emerald-950/70 to-slate-950',
    border: 'border-teal-500/30 hover:border-teal-400/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(20,184,166,0.2)]',
    accentBg: 'bg-teal-500/20',
    accentText: 'text-teal-400',
    icon: Headphones,
    tagline: 'Acoustic Audio Intelligence',
    mechanicLabel: 'Voice Synthesis & Subtle Nuance Extraction',
    patternSvg: (
      <svg className="absolute inset-0 w-full h-full opacity-15" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-listen" width="16" height="24" patternUnits="userSpaceOnUse">
            <path d="M 0 12 Q 4 4 8 12 T 16 12" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-teal-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-listen)" />
      </svg>
    ),
  },
  'pubspeak-arena': {
    gradient: 'from-orange-950 via-amber-950/70 to-slate-950',
    border: 'border-orange-500/30 hover:border-orange-400/60',
    glow: 'group-hover:shadow-[0_0_30px_rgba(249,115,22,0.2)]',
    accentBg: 'bg-orange-500/20',
    accentText: 'text-orange-400',
    icon: Mic,
    tagline: 'Grand Auditorium Stage',
    mechanicLabel: 'Rhetoric Impact, Stage Presence & Audience Influence',
    patternSvg: (
      <svg className="absolute inset-0 w-full h-full opacity-15" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-pubspeak" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-orange-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pubspeak)" />
      </svg>
    ),
  },
};

export default function GamesPage() {
  const [category, setCategory] = React.useState('all');
  const query = useApi<any>('/student/games');

  return (
    <div className="min-h-full rounded-2xl bg-card text-ink-1 p-4 sm:p-6 border border-line shadow-2xl relative overflow-hidden">
      {/* Subtle top ambient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-indigo-500/10 blur-[120px] rounded-full" />

      <AsyncSection query={query} skeleton="cards">
        {(raw) => {
          const data = {
            games: raw?.games || [],
            categories: raw?.categories || [],
            totalPlayed: raw?.totalPlayed || 0,
            xp: raw?.xp || { total: 0, level: 1, levelFloor: 0, levelCeiling: 500 },
            streak: raw?.streak || { days: 0 },
            weeklyQuest: raw?.weeklyQuest || { earned: 0, target: 500, percent: 0, endsAt: new Date().toISOString() },
            badges: raw?.badges || [],
            leaderboard: raw?.leaderboard || [],
            ...raw,
          };
          const visible = (data.games || []).filter(
            (game: any) => category === 'all' || game.category === category,
          );

          return (
            <div className="relative z-10 space-y-6">
              <PageHeader
                title="Interactive Skill Games"
                description="Production game scenarios with adaptive progression, real-time audio synthesis, and competency-linked EEDI evaluation."
                actions={
                  <div className="flex items-center gap-2">
                    <Badge tone="amber" dot className="bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-300">
                      <Flame className="size-3 text-amber-500" aria-hidden />
                      {data.streak?.days ?? 0}-day streak
                    </Badge>
                    <Badge tone="purple" className="bg-purple-500/15 border-purple-500/30 text-purple-700 dark:text-purple-300">
                      Level {data.xp?.level ?? 1}
                    </Badge>
                  </div>
                }
              />

              {/* Status & Quest Overview Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <TiltCard maxAngle={2.5} glare className="p-5 border border-line bg-surface/70 backdrop-blur-sm shadow-xl rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wider font-semibold text-ink-3">Experience Progression</p>
                    <Sparkles className="size-4 text-indigo-500" />
                  </div>
                  <p className="tnum mt-2 text-2xl font-black leading-none text-ink-1 tracking-tight">
                    {num(data.xp?.total ?? 0)}{' '}
                    <span className="text-xs font-semibold text-indigo-500">XP</span>
                  </p>
                  <ProgressBar
                    className="mt-3 bg-surface-muted h-2"
                    showValue={false}
                    value={Math.min(100, Math.max(0,
                      (((data.xp?.total ?? 0) - (data.xp?.levelFloor ?? 0)) /
                        Math.max(1, (data.xp?.levelCeiling ?? 500) - (data.xp?.levelFloor ?? 0))) *
                      100
                    ))}
                  />
                  <p className="mt-2 text-xs text-ink-3 flex items-center justify-between">
                    <span>Next rank: Level {(data.xp?.level ?? 1) + 1}</span>
                    <span className="font-semibold text-ink-2">
                      {num((data.xp?.levelCeiling ?? 500) - (data.xp?.total ?? 0))} XP needed
                    </span>
                  </p>
                </TiltCard>

                <TiltCard maxAngle={2.5} glare className="p-5 border border-line bg-surface/70 backdrop-blur-sm shadow-xl rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wider font-semibold text-ink-3">Weekly Challenge Target</p>
                    <TrendingUp className="size-4 text-emerald-500" />
                  </div>
                  <p className="tnum mt-2 text-2xl font-black leading-none text-ink-1 tracking-tight">
                    {num(data.weeklyQuest?.earned ?? 0)}
                    <span className="text-sm font-semibold text-ink-3">
                      {' '}/ {num(data.weeklyQuest?.target ?? 500)} XP
                    </span>
                  </p>
                  <ProgressBar
                    className="mt-3 bg-surface-muted h-2"
                    showValue={false}
                    value={Math.min(100, Math.max(0, data.weeklyQuest?.percent ?? 0))}
                  />
                  <p className="mt-2 text-xs text-ink-3">
                    Cycle reset: {formatDate(data.weeklyQuest?.endsAt)}
                  </p>
                </TiltCard>

                <TiltCard maxAngle={2.5} glare className="p-5 border border-line bg-surface/70 backdrop-blur-sm shadow-xl rounded-xl sm:col-span-2 xl:col-span-1">
                  <div className="flex items-center justify-between pb-2 border-b border-line">
                    <div>
                      <CardTitle className="text-sm font-bold text-ink-1">Mastery Badges</CardTitle>
                      <CardSubtitle className="text-xs text-ink-3">
                        {(data.badges || []).filter((badge: any) => badge.earned).length} earned badges
                      </CardSubtitle>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="text-xs text-ink-3 hover:text-ink-1">
                      <Link href="/student/achievements">View All</Link>
                    </Button>
                  </div>
                  <div className="mt-3">
                    <ul className="flex flex-wrap gap-2">
                      {(data.badges || []).slice(0, 6).map((badge: any) => {
                        const Icon = iconFor(badge.icon, Award);
                        return (
                          <li key={badge.code}>
                            <span
                              title={`${badge.title} — ${badge.earned ? 'earned' : `${badge.progressPercent}%`}`}
                              className={cn(
                                'flex size-8 items-center justify-center rounded-lg transition-transform hover:scale-110 cursor-pointer border',
                                badge.earned
                                  ? 'text-white border-white/20 shadow-md'
                                  : 'bg-surface-muted text-ink-3 border-line',
                              )}
                              style={badge.earned ? { background: badge.color } : undefined}
                            >
                              <Icon className="size-4" aria-hidden />
                              <span className="sr-only">
                                {badge.title}: {badge.earned ? 'earned' : `${badge.progressPercent}% progress`}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </TiltCard>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Filter games by category">
                {['all', ...(data.categories || [])].map((item: string) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all border shadow-sm',
                      category === item
                        ? 'border-indigo-500 bg-indigo-600 text-white shadow-indigo-500/25 shadow-md'
                        : 'border-line bg-surface text-ink-2 hover:bg-surface-hover hover:border-line hover:text-ink-1',
                    )}
                  >
                    {item === 'all' ? 'All Active Arenas' : item}
                  </button>
                ))}
              </div>

              {/* Game Arenas Grid & Leaderboard */}
              <div className="grid gap-6 xl:grid-cols-[1fr_310px]">
                <div className="grid gap-5 sm:grid-cols-2">
                  {visible.map((game: any) => {
                    const theme = GAME_THEMES[game.code] || GAME_THEMES[game.id] || {
                      gradient: 'from-indigo-950 via-slate-900 to-slate-950',
                      border: 'border-slate-800 hover:border-indigo-500/60',
                      glow: 'group-hover:shadow-[0_0_25px_rgba(99,102,241,0.2)]',
                      accentBg: 'bg-indigo-500/20',
                      accentText: 'text-indigo-400',
                      icon: Gamepad2,
                      tagline: 'Interactive Skill Arena',
                      mechanicLabel: 'Real-time Scenario Progression',
                      patternSvg: null,
                    };
                    const GameIcon = theme.icon;

                    return (
                      <TiltCard
                        key={game.id}
                        maxAngle={2.5}
                        glare
                        className={cn(
                          'group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-all duration-300 shadow-xl',
                          theme.border,
                          theme.glow,
                        )}
                      >
                        {/* Unique Game Header Art Canvas */}
                        <div className={cn('relative h-32 w-full overflow-hidden bg-gradient-to-br p-4 flex flex-col justify-between', theme.gradient)}>
                          {theme.patternSvg}

                          {/* Top Badges */}
                          <div className="relative z-10 flex items-center justify-between">
                            {game.isAssigned ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 backdrop-blur-md">
                                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Batch Assigned
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-slate-300 bg-slate-950/60 border border-slate-700/60">
                                Open Arena
                              </span>
                            )}

                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-950/70 border border-white/10 text-slate-300">
                              {game.difficulty || 'Adaptive'}
                            </span>
                          </div>

                          {/* Center / Bottom Badge & Tagline */}
                          <div className="relative z-10 flex items-center gap-3">
                            <div className={cn('size-10 rounded-xl flex items-center justify-center border border-white/15 backdrop-blur-md shadow-lg', theme.accentBg, theme.accentText)}>
                              <GameIcon className="size-5" />
                            </div>
                            <div>
                              <p className={cn('text-xs font-bold uppercase tracking-wider', theme.accentText)}>
                                {theme.tagline}
                              </p>
                              <p className="text-[11px] text-slate-300 line-clamp-1">
                                {theme.mechanicLabel}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="flex flex-1 flex-col p-5 space-y-4">
                          <div>
                            <h2 className="text-lg font-bold text-ink-1 group-hover:text-indigo-500 transition-colors">
                              {game.title}
                            </h2>
                            {game.assignment?.deadline && (
                              <p className="mt-0.5 text-xs font-medium text-amber-500 flex items-center gap-1">
                                <Clock className="size-3" />
                                Due: {formatDate(game.assignment.deadline)}
                              </p>
                            )}
                            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-ink-2 line-clamp-2">
                              {game.description}
                            </p>
                          </div>

                          {/* Skill Tags */}
                          <div className="flex flex-wrap gap-1.5">
                            {(game.skills || []).map((skill: string) => (
                              <span
                                key={skill}
                                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-muted text-ink-2 border border-line"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>

                          {/* Performance Stats */}
                          <dl className="grid grid-cols-3 gap-2 text-center pt-1">
                            <div className="rounded-lg bg-surface-muted border border-line p-2">
                              <dd className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {game.bestScore ? `${num(game.bestScore)}%` : '—'}
                              </dd>
                              <dt className="text-[10px] uppercase font-semibold text-ink-3">Best Score</dt>
                            </div>
                            <div className="rounded-lg bg-surface-muted border border-line p-2">
                              <dd className="text-sm font-bold text-ink-1">
                                {num(game.attempts ?? 0)}
                              </dd>
                              <dt className="text-[10px] uppercase font-semibold text-ink-3">Attempts</dt>
                            </div>
                            <div className="rounded-lg bg-surface-muted border border-line p-2">
                              <dd className="text-sm font-bold text-amber-600 dark:text-amber-400">
                                +{game.xpReward ?? 100}
                              </dd>
                              <dt className="text-[10px] uppercase font-semibold text-ink-3">Reward XP</dt>
                            </div>
                          </dl>

                          {/* Play Quest CTA */}
                          <div className="mt-auto pt-3">
                            <Button
                              asChild
                              className={cn(
                                'w-full font-bold text-sm tracking-wide shadow-md transition-all flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10',
                                'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white',
                              )}
                            >
                              <Link href={`/student/games/${game.code || game.id}/play`}>
                                <span>{game.attempts ? 'Resume Quest' : 'Launch Game'}</span>
                                <span className="text-xs opacity-75 font-normal">· {game.durationMinutes || 10}m</span>
                                <ChevronRight className="size-4 ml-1 transition-transform group-hover:translate-x-1" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </TiltCard>
                    );
                  })}
                </div>

                {/* Batch Leaderboard Sidebar */}
                <TiltCard maxAngle={2} glare className="self-start p-5 border border-line bg-surface/70 backdrop-blur-sm shadow-xl rounded-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <div>
                      <CardTitle className="text-sm font-bold text-ink-1">Cohort Standings</CardTitle>
                      <CardSubtitle className="text-xs text-ink-3">Current Batch Leaderboard</CardSubtitle>
                    </div>
                    <Trophy className="size-5 text-amber-500" aria-hidden />
                  </div>
                  <div>
                    <ol className="space-y-2">
                      {(data.leaderboard || []).map((row: any) => (
                        <li
                          key={row.participantUserId ?? row.studentUserId ?? row.name}
                          className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-hover border border-transparent hover:border-line"
                        >
                          <span
                            className={cn(
                              'w-6 text-center text-xs font-bold rounded-md py-0.5',
                              row.rank === 1
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40'
                                : row.rank === 2
                                ? 'bg-slate-300/30 text-slate-700 dark:text-slate-200 border border-slate-300/40'
                                : row.rank === 3
                                ? 'bg-orange-500/20 text-orange-600 dark:text-orange-300 border border-orange-500/40'
                                : 'text-ink-3',
                            )}
                          >
                            {row.rank}
                          </span>
                          <Avatar name={row.name} color={row.avatarColor} size={28} />
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-1">{row.name}</span>
                          <span className="tnum flex shrink-0 items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                            <Zap className="size-3" aria-hidden />
                            {num(row.xp)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </TiltCard>
              </div>
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}
