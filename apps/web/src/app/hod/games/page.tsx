'use client';

import {
  Award,
  Gamepad2,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { num, pct } from '@/lib/format';

interface HodGameAnalytics {
  totalPlays: number;
  totalStudentsPlayed: number;
  avgScore: number;
  completionRate: number;
  byBatch: Array<{
    batchId: string;
    batchName: string;
    plays: number;
    avgScore: number;
  }>;
  topGames: Array<{
    code: string;
    title: string;
    plays: number;
    avgScore: number;
  }>;
}

export default function HodGamesPage() {
  const query = useApi<HodGameAnalytics>('/hod/games/analytics');

  return (
    <AsyncSection query={query} skeleton="kpis">
      {(data) => (
        <div className="space-y-6">
          <PageHeader
            title="Department Games & Skill Challenges"
            description="Cognitive and technical game engagement scoped strictly to your department's batches."
            actions={
              <Badge tone="info" className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                Department Scoped
              </Badge>
            }
          />

          {/* Department KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Department Plays"
              value={num(data.totalPlays)}
              tone="indigo"
              icon={<Gamepad2 className="size-4" />}
              hint="Total challenge completions"
            />
            <StatCard
              label="Active Participants"
              value={num(data.totalStudentsPlayed)}
              tone="success"
              icon={<Users className="size-4" />}
              hint="Department learners engaged"
            />
            <StatCard
              label="Average Score"
              value={`${num(data.avgScore, 1)}%`}
              tone="amber"
              icon={<Trophy className="size-4" />}
              hint="Mean proficiency rating"
            />
            <StatCard
              label="Goal Completion"
              value={pct(data.completionRate)}
              tone="info"
              icon={<Target className="size-4" />}
              hint="Completed vs abandoned"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Batch Breakdown */}
            <Card>
              <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Batch Engagement</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Activity and average score distribution across department batches
                    </p>
                  </div>
                  <TrendingUp className="size-5 text-indigo" />
                </div>
              </CardHeader>
              <CardBody className="p-5">
                {!data.byBatch || data.byBatch.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No batch activity recorded yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {data.byBatch.map((batch) => (
                      <div key={batch.batchId} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {batch.batchName}
                          </span>
                          <span className="text-slate-500">
                            <strong>{batch.plays} plays</strong> · Avg: {num(batch.avgScore, 1)}%
                          </span>
                        </div>
                        <ProgressBar
                          value={batch.avgScore}
                          tone={batch.avgScore >= 70 ? 'emerald' : batch.avgScore >= 50 ? 'indigo' : 'warning'}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Top Games in Department */}
            <Card>
              <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Most Played Challenges</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Popular game modules among department participants
                    </p>
                  </div>
                  <Award className="size-5 text-amber-500" />
                </div>
              </CardHeader>
              <CardBody className="p-5">
                {!data.topGames || data.topGames.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No game play statistics recorded yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-3">
                    {data.topGames.map((game, idx) => (
                      <div key={game.code} className="pt-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-indigo/10 text-indigo flex items-center justify-center font-bold text-xs">
                            #{idx + 1}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-slate-900 dark:text-white">
                              {game.title}
                            </p>
                            <p className="text-xs text-slate-400 font-mono">{game.code}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {game.plays} plays
                          </p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            {num(game.avgScore, 1)}% avg
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </AsyncSection>
  );
}
