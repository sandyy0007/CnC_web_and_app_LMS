'use client';

import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gamepad2,
  Plus,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { num, pct } from '@/lib/format';

interface GameItem {
  code: string;
  title: string;
  description: string;
  category: string;
  skillsTrained: string[];
  active: boolean;
}

interface BatchItem {
  id: string;
  name: string;
  code: string;
}

interface Analytics {
  totalPlays: number;
  totalStudentsPlayed: number;
  avgScore: number;
  completionRate: number;
  weakSkills: Array<{ skill: string; avgScore: number; studentCount: number }>;
  topScorers: Array<{
    studentId: string;
    studentName: string;
    score: number;
    gameTitle: string;
  }>;
}

export default function TrainerGamesPage() {
  const [selectedBatch, setSelectedBatch] = React.useState<string>('all');
  const [activeTab, setActiveTab] = React.useState<'catalog' | 'insights'>('catalog');
  const [assignModalOpen, setAssignModalOpen] = React.useState(false);
  const [selectedGameCode, setSelectedGameCode] = React.useState<string>('');
  const [targetBatchId, setTargetBatchId] = React.useState<string>('');
  const [dueDate, setDueDate] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');
  const [assigning, setAssigning] = React.useState(false);
  const [assignSuccess, setAssignSuccess] = React.useState(false);

  // Queries
  const gamesQuery = useApi<any>('/trainer/games');
  const batchesQuery = useApi<BatchItem[]>('/trainer/batches');
  const analyticsQuery = useApi<Analytics>(
    `/trainer/games/analytics${selectedBatch !== 'all' ? `?batchId=${selectedBatch}` : ''}`
  );

  const games: GameItem[] =
    gamesQuery.data?.games ?? gamesQuery.data?.data?.games ?? gamesQuery.data ?? [];
  const batches: BatchItem[] = batchesQuery.data ?? [];
  const analytics: Analytics = analyticsQuery.data ?? {
    totalPlays: 0,
    totalStudentsPlayed: 0,
    avgScore: 0,
    completionRate: 0,
    weakSkills: [],
    topScorers: [],
  };

  const openAssignModal = (gameCode?: string) => {
    if (gameCode) setSelectedGameCode(gameCode);
    else if (games.length > 0) setSelectedGameCode(games[0].code);
    if (batches.length > 0) setTargetBatchId(batches[0].id);
    setAssignSuccess(false);
    setAssignModalOpen(true);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGameCode || !targetBatchId) return;

    setAssigning(true);
    try {
      await api.post('/trainer/games/assign', {
        gameCode: selectedGameCode,
        batchId: targetBatchId,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      });
      setAssignSuccess(true);
      setTimeout(() => {
        setAssignModalOpen(false);
        setAssignSuccess(false);
        analyticsQuery.refetch();
      }, 1200);
    } catch {
      // error handled
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interactive Games & Skill Challenges"
        description="Assign cognitive, communication, and technical mini-games to reinforce participant learning."
        actions={
          <div className="flex items-center gap-3">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
            >
              <option value="all">All Assigned Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={() => openAssignModal()}
            >
              <Plus className="size-4" />
              Assign Game to Batch
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Game Plays"
          value={num(analytics.totalPlays)}
          tone="indigo"
          icon={<Gamepad2 className="size-4" />}
          hint="Sessions across assigned batches"
        />
        <StatCard
          label="Active Participants"
          value={num(analytics.totalStudentsPlayed)}
          tone="success"
          icon={<Users className="size-4" />}
          hint="Participants who played"
        />
        <StatCard
          label="Average Score"
          value={analytics.avgScore ? `${num(analytics.avgScore, 1)}%` : '0%'}
          tone="amber"
          icon={<Trophy className="size-4" />}
          hint="Skill proficiency indicator"
        />
        <StatCard
          label="Completion Rate"
          value={pct(analytics.completionRate)}
          tone="info"
          icon={<Target className="size-4" />}
          hint="Target goal completions"
        />
      </div>

      {/* Subnav Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('catalog')}
          className={cn(
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'catalog'
              ? 'border-indigo text-indigo dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          )}
        >
          <Gamepad2 className="size-4" />
          Games Catalog ({games.length})
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={cn(
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'insights'
              ? 'border-indigo text-indigo dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          )}
        >
          <Flame className="size-4" />
          Weak Skills & Leaderboard
        </button>
      </div>

      {activeTab === 'catalog' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {games.map((game) => (
            <Card key={game.code} className="flex flex-col justify-between hover:shadow-md transition-shadow">
              <CardBody className="p-5 flex flex-col justify-between h-full space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="p-2.5 rounded-xl bg-indigo/10 text-indigo inline-block">
                      <Gamepad2 className="size-5" />
                    </span>
                    <Badge tone="indigo">
                      {game.category}
                    </Badge>
                  </div>

                  <h3 className="font-bold text-base text-slate-900 dark:text-white mt-3">
                    {game.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                    {game.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {game.skillsTrained.map((skill) => (
                      <span
                        key={skill}
                        className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">{game.code}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openAssignModal(game.code)}
                    className="text-xs flex items-center gap-1"
                  >
                    Assign to Batch
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weak Skills Section */}
          <Card>
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                    Skill Gap Analysis
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Skills where students in this batch struggled the most
                  </p>
                </div>
                <AlertTriangle className="size-5 text-amber-500" />
              </div>
            </CardHeader>
            <CardBody className="p-5 space-y-4">
              {analytics.weakSkills.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No skill gap data recorded yet. Assign games to generate proficiency insights.
                </div>
              ) : (
                analytics.weakSkills.map((gap) => (
                  <div key={gap.skill} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {gap.skill}
                      </span>
                      <span className="text-slate-500">
                        Avg: <strong className="text-amber-600">{gap.avgScore}%</strong> ({gap.studentCount} participants)
                      </span>
                    </div>
                    <ProgressBar
                      value={gap.avgScore}
                      tone={gap.avgScore < 50 ? 'danger' : 'warning'}
                    />
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          {/* Leaderboard Section */}
          <Card>
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                    Batch Top Scorers
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Highest game scores achieved by participants
                  </p>
                </div>
                <Award className="size-5 text-indigo" />
              </div>
            </CardHeader>
            <CardBody className="p-5">
              {analytics.topScorers.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No scores recorded yet for this batch.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-2">
                  {analytics.topScorers.map((item, index) => (
                    <div
                      key={item.studentId + index}
                      className="pt-2 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0',
                            index === 0
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : index === 1
                              ? 'bg-slate-200 text-slate-700 dark:bg-slate-700'
                              : 'bg-indigo/10 text-indigo'
                          )}
                        >
                          #{index + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">
                            {item.studentName}
                          </p>
                          <p className="text-xs text-slate-400">{item.gameTitle}</p>
                        </div>
                      </div>
                      <Badge tone="success">
                        {item.score} pts
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Assign Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Game to Batch</DialogTitle>
            <DialogDescription>
              Select a batch and set an optional completion deadline for participants.
            </DialogDescription>
          </DialogHeader>

          {assignSuccess ? (
            <div className="p-6 text-center space-y-2">
              <CheckCircle2 className="size-10 text-emerald-500 mx-auto animate-bounce" />
              <p className="font-semibold text-slate-900 text-base">Game Assigned Successfully!</p>
              <p className="text-xs text-slate-500">Participants will see this challenge in their dashboard.</p>
            </div>
          ) : (
            <form onSubmit={handleAssign} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Game Challenge
                </label>
                <select
                  value={selectedGameCode}
                  onChange={(e) => setSelectedGameCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {games.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.title} ({g.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Assign to Batch
                </label>
                <select
                  value={targetBatchId}
                  onChange={(e) => setTargetBatchId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Instructions / Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Complete before Friday's lab session to discuss results"
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAssignModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={assigning}
                >
                  {assigning ? 'Assigning…' : 'Confirm Assignment'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
