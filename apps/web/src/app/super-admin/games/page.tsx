'use client';

import {
  CheckCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Gamepad2,
  Play,
  Plus,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
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
import { num } from '@/lib/format';

interface SuperAdminGame {
  id: string;
  code: string;
  title: string;
  description?: string;
  category: string;
  difficulty: string;
  xpReward: number;
  published: boolean;
  status: string;
  gameUrl?: string;
  launchUrl?: string;
  courseId?: string | null;
  durationMinutes: number;
  levelsCount: number;
  totalAttempts: number;
  uniquePlayers?: number;
  launches?: number;
  averageScore: number;
}

export default function SuperAdminGamesPage() {
  const query = useApi<SuperAdminGame[]>('/super-admin/games', undefined, {
    select: (res) => res.data ?? res,
  });

  const coursesQuery = useApi<any[]>('/super-admin/courses', undefined, {
    select: (res) => res.data ?? res,
  });

  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Form state
  const [formCode, setFormCode] = React.useState('');
  const [formTitle, setFormTitle] = React.useState('');
  const [formDesc, setFormDesc] = React.useState('');
  const [formGameUrl, setFormGameUrl] = React.useState('');
  const [formCourseId, setFormCourseId] = React.useState('');
  const [formCategory, setFormCategory] = React.useState('Technical');
  const [formDifficulty, setFormDifficulty] = React.useState('Beginner');
  const [formXp, setFormXp] = React.useState(50);
  const [formDuration, setFormDuration] = React.useState(5);

  const games: SuperAdminGame[] = Array.isArray(query.data) ? query.data : [];
  const courses = Array.isArray(coursesQuery.data) ? coursesQuery.data : [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode || !formTitle) return;

    setSubmitting(true);
    try {
      await api.post('/super-admin/games', {
        code: formCode.toLowerCase().trim(),
        title: formTitle.trim(),
        description: formDesc.trim(),
        gameUrl: formGameUrl.trim() || undefined,
        courseId: formCourseId || undefined,
        category: formCategory,
        difficulty: formDifficulty,
        xpReward: Number(formXp),
        durationMinutes: Number(formDuration),
        published: true,
        status: 'ACTIVE',
      });
      setCreateModalOpen(false);
      setFormCode('');
      setFormTitle('');
      setFormDesc('');
      setFormGameUrl('');
      setFormCourseId('');
      query.refetch();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePublish = async (game: SuperAdminGame) => {
    try {
      await api.patch(`/super-admin/games/${game.code}`, {
        published: !game.published,
      });
      query.refetch();
    } catch {
      // ignore
    }
  };

  const totalAttempts = games.reduce((acc, g) => acc + (g.totalAttempts || 0), 0);
  const totalLaunches = games.reduce((acc, g) => acc + (g.launches || g.totalAttempts || 0), 0);
  const publishedCount = games.filter((g) => g.published).length;

  return (
    <GlobalPageBackground image="/images/backgrounds/games.webp" variant="dark">
      <div className="space-y-6">
      <PageHeader
        title="Game Management & Gamification Engine"
        description="Author, publish, connect to courses, and configure interactive cognitive challenges, external playable game URLs, and skill rewards."
        actions={
          <Button
            onClick={() => setCreateModalOpen(true)}
            variant="primary"
            size="sm"
            className="flex items-center gap-1.5"
          >
            <Plus className="size-4" />
            Author New Game
          </Button>
        }
      />

      {/* Gamification KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Catalog Challenges"
          value={num(games.length)}
          tone="indigo"
          icon={<Gamepad2 className="size-4" />}
          hint="Interactive exercises"
        />
        <StatCard
          label="Total Game Launches"
          value={num(totalLaunches)}
          tone="teal"
          icon={<Play className="size-4" />}
          hint="Platform participant plays"
        />
        <StatCard
          label="Player Submissions"
          value={num(totalAttempts)}
          tone="amber"
          icon={<Trophy className="size-4" />}
          hint="Evaluated completions"
        />
        <StatCard
          label="Published Status"
          value={`${publishedCount} / ${games.length}`}
          tone="indigo"
          icon={<CheckCircle className="size-4" />}
          hint="Active in participant catalog"
        />
      </div>

      {/* Games Table */}
      <Card>
        <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <CardTitle className="text-sm font-bold">Game Definitions &amp; Playable URLs</CardTitle>
          <Badge tone="indigo">Course Gamification Matrix</Badge>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">Code &amp; Title</th>
                  <th className="px-4 py-3">Game Link / URL</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">XP Reward</th>
                  <th className="px-4 py-3">Launches &amp; Attempts</th>
                  <th className="px-4 py-3">Avg Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {games.map((game) => (
                  <tr key={game.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-900 dark:text-white">{game.title}</p>
                      <p className="text-[11px] font-mono text-indigo">{game.code}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      {game.gameUrl ? (
                        <a
                          href={game.gameUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-indigo hover:underline truncate max-w-[180px]"
                        >
                          <ExternalLink className="size-3 shrink-0" />
                          <span className="truncate">{game.gameUrl}</span>
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Internal Scenario</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                      {game.category}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge
                        tone={
                          game.difficulty === 'Beginner'
                            ? 'success'
                            : game.difficulty === 'Intermediate'
                            ? 'amber'
                            : 'danger'
                        }
                      >
                        {game.difficulty}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                      +{game.xpReward} XP
                    </td>
                    <td className="px-4 py-3.5 text-slate-800 dark:text-slate-200">
                      <span className="font-bold">{num(game.launches || game.totalAttempts)}</span>{' '}
                      <span className="text-slate-400">({num(game.totalAttempts)} scored)</span>
                    </td>
                    <td className="px-4 py-3.5 font-medium">
                      {game.averageScore > 0 ? `${num(game.averageScore, 1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={game.published ? 'success' : 'neutral'}>
                        {game.published ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-1">
                      {game.gameUrl && (
                        <Button
                          asChild
                          size="sm"
                          variant="secondary"
                          className="text-xs p-1 h-7 px-2"
                        >
                          <a href={game.gameUrl} target="_blank" rel="noopener noreferrer">
                            <Play className="size-3 mr-1 text-emerald-600" />
                            Play
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTogglePublish(game)}
                        className="text-xs p-1 h-7 px-2"
                      >
                        {game.published ? (
                          <>
                            <EyeOff className="size-3 mr-1 text-slate-500" />
                            Unpublish
                          </>
                        ) : (
                          <>
                            <Eye className="size-3 mr-1 text-indigo" />
                            Publish
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Create Game Definition Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent wide className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Author Game Challenge</DialogTitle>
            <DialogDescription>
              Create an interactive scenario challenge or configure an external playable game launch URL.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Game Code *
                </label>
                <input
                  type="text"
                  required
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toLowerCase())}
                  placeholder="e.g., debug-maze-runner"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  XP Reward
                </label>
                <input
                  type="number"
                  value={formXp}
                  onChange={(e) => setFormXp(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Title *
              </label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g., Syntax Error Maze Runner"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            {/* Game URL / Launch URL */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Playable Game Launch URL (External or Interactive iframe)
              </label>
              <input
                type="url"
                value={formGameUrl}
                onChange={(e) => setFormGameUrl(e.target.value)}
                placeholder="https://games.winnerscreek.com/maze-game or https://example.com/play"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
              />
              <p className="text-[11px] text-slate-500">
                If specified, participants can click Play to launch this game directly with telemetry tracking.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Course Attachment (Contextual Game)
                </label>
                <select
                  value={formCourseId}
                  onChange={(e) => setFormCourseId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">Platform-Wide (All Courses)</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.courseMode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Est. Duration (Minutes)
                </label>
                <input
                  type="number"
                  value={formDuration}
                  onChange={(e) => setFormDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="Technical">Technical</option>
                  <option value="Problem Solving">Problem Solving</option>
                  <option value="Interview">Interview</option>
                  <option value="Communication">Communication</option>
                  <option value="Behaviour">Behaviour</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Difficulty
                </label>
                <select
                  value={formDifficulty}
                  onChange={(e) => setFormDifficulty(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Description &amp; Instructions
              </label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                placeholder="Explain the rules, scenario context, and skills evaluated."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Publish Game'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </GlobalPageBackground>
  );
}
