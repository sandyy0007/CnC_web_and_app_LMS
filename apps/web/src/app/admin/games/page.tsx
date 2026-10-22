'use client';

import {
  CheckCircle,
  Eye,
  EyeOff,
  Gamepad2,
  Lock,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { num } from '@/lib/format';

interface AdminGame {
  code: string;
  title: string;
  description?: string;
  category: string;
  difficulty?: string;
  xpReward?: number;
  skillsTrained: string[];
  active?: boolean;
  isEnabled?: boolean;
  availableInCollege: boolean;
  collegePlays: number;
  collegeAvgScore: number;
}

export default function AdminGamesPage() {
  const query = useApi<any>('/admin/games');
  const [togglingCode, setTogglingCode] = React.useState<string | null>(null);

  const rawGames = query.data?.data ?? query.data?.games ?? query.data ?? [];
  const games: AdminGame[] = (Array.isArray(rawGames) ? rawGames : []).map((g: any) => ({
    code: g.code,
    title: g.title || g.code,
    description: g.description || `Gamified ${g.category || ''} cognitive challenge.`,
    category: g.category || 'General',
    difficulty: g.difficulty || 'Intermediate',
    xpReward: g.xpReward ?? 50,
    availableInCollege: Boolean(g.isEnabled ?? g.availableInCollege ?? true),
    collegePlays: g.totalAttempts ?? g.collegePlays ?? 0,
    collegeAvgScore: g.averageScore ?? g.collegeAvgScore ?? 0,
    skillsTrained: Array.isArray(g.skillsTrained) ? g.skillsTrained : [g.category, g.difficulty].filter(Boolean),
  }));

  const handleToggle = async (game: AdminGame) => {
    setTogglingCode(game.code);
    try {
      await api.patch(`/admin/games/${game.code}/availability`, {
        enabled: !game.availableInCollege,
      });
      query.refetch();
    } catch {
      // error handled
    } finally {
      setTogglingCode(null);
    }
  };

  const totalPlays = games.reduce((acc, g) => acc + (g.collegePlays || 0), 0);
  const enabledCount = games.filter((g) => g.availableInCollege).length;
  const avgScore =
    games.filter((g) => g.collegePlays > 0).length > 0
      ? games.reduce((acc, g) => acc + (g.collegeAvgScore || 0), 0) /
        games.filter((g) => g.collegePlays > 0).length
      : 0;

  return (
    <GlobalPageBackground
      image="/images/backgrounds/games.webp"
      variant="dark"
      orbTone="purple"
      className="min-h-full rounded-2xl p-4 sm:p-6 space-y-6"
    >
      <PageHeader
        title="Institution Games & Gamification"
        description="Control game availability across the institution and monitor campus-wide cognitive skill development."
        actions={
          <Badge tone="indigo" dot>
            {enabledCount} of {games.length} Games Active
          </Badge>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Campus Game Plays"
          value={num(totalPlays)}
          tone="indigo"
          icon={<Gamepad2 className="size-4" />}
          hint="Total participant attempts"
        />
        <StatCard
          label="Active Challenges"
          value={`${enabledCount} / ${games.length}`}
          tone="success"
          icon={<CheckCircle className="size-4" />}
          hint="Available to participants"
        />
        <StatCard
          label="Campus Avg Score"
          value={avgScore > 0 ? `${num(avgScore, 1)}%` : 'N/A'}
          tone="amber"
          icon={<Trophy className="size-4" />}
          hint="Average participant performance"
        />
        <StatCard
          label="Catalog Coverage"
          value={`${games.length} Modules`}
          tone="info"
          icon={<Sparkles className="size-4" />}
          hint="Across soft & tech skills"
        />
      </div>

      {/* Games list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {games.map((game) => {
          const isToggling = togglingCode === game.code;
          return (
            <Card
              key={game.code}
              className={cn(
                'flex flex-col justify-between transition-all',
                !game.availableInCollege && 'opacity-70 bg-slate-50/70 dark:bg-slate-900/40'
              )}
            >
              <CardBody className="p-5 flex flex-col justify-between h-full space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'p-2.5 rounded-xl inline-block',
                        game.availableInCollege
                          ? 'bg-indigo/10 text-indigo'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                      )}
                    >
                      <Gamepad2 className="size-5" />
                    </span>
                    <Badge tone={game.availableInCollege ? 'success' : 'neutral'}>
                      {game.availableInCollege ? 'Enabled for Campus' : 'Disabled'}
                    </Badge>
                  </div>

                  <h3 className="font-bold text-base text-slate-900 dark:text-white mt-3">
                    {game.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                    {game.description}
                  </p>

                  <div className="flex flex-wrap gap-1 mt-3">
                    <Badge tone="neutral">
                      {game.category}
                    </Badge>
                    {(game.skillsTrained || []).slice(0, 2).map((s) => (
                      <span
                        key={s}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {game.collegePlays}
                      </p>
                      <p className="text-[10px] text-slate-400">Campus Plays</p>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {game.collegeAvgScore ? `${num(game.collegeAvgScore, 1)}%` : '—'}
                      </p>
                      <p className="text-[10px] text-slate-400">Avg Score</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">{game.code}</span>
                  <Button
                    size="sm"
                    variant={game.availableInCollege ? 'secondary' : 'primary'}
                    disabled={isToggling}
                    onClick={() => handleToggle(game)}
                    className="text-xs flex items-center gap-1.5"
                  >
                    {game.availableInCollege ? (
                      <>
                        <EyeOff className="size-3.5" />
                        Disable
                      </>
                    ) : (
                      <>
                        <Eye className="size-3.5" />
                        Enable for Campus
                      </>
                    )}
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </GlobalPageBackground>
  );
}
