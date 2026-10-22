'use client';

import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Flame,
  Gamepad2,
  Info,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  UploadCloud,
  Users,
  X,
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
import { toast } from 'sonner';

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

interface QuestionSetItem {
  id: string;
  version: number;
  title: string;
  description: string | null;
  isActive: boolean;
  totalQuestions: number;
  trainerName?: string;
  createdAt?: string;
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
  const [maxAttempts, setMaxAttempts] = React.useState<number>(3);
  const [notes, setNotes] = React.useState<string>('');
  const [assigning, setAssigning] = React.useState(false);
  const [assignSuccess, setAssignSuccess] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);

  // Question Set state
  const [questionSets, setQuestionSets] = React.useState<QuestionSetItem[]>([]);
  const [selectedQuestionSetId, setSelectedQuestionSetId] = React.useState<string>('');
  const [loadingQuestionSets, setLoadingQuestionSets] = React.useState(false);

  // CSV Upload state
  const [showCsvUpload, setShowCsvUpload] = React.useState(false);
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [csvTitle, setCsvTitle] = React.useState('');
  const [validatingCsv, setValidatingCsv] = React.useState(false);
  const [uploadingCsv, setUploadingCsv] = React.useState(false);
  const [csvReport, setCsvReport] = React.useState<any | null>(null);
  const [csvError, setCsvError] = React.useState<string | null>(null);

  // Queries
  const gamesQuery = useApi<any>('/trainer/games');
  const batchesQuery = useApi<any>('/trainer/batches');
  const analyticsQuery = useApi<any>(
    `/trainer/games/analytics${selectedBatch !== 'all' ? `?batchId=${selectedBatch}` : ''}`
  );

  const rawGames =
    gamesQuery.data?.games ??
    gamesQuery.data?.data?.games ??
    gamesQuery.data?.data ??
    gamesQuery.data ??
    [];
  const games: GameItem[] = Array.isArray(rawGames) ? rawGames : [];
  const rawBatches =
    batchesQuery.data?.items ??
    batchesQuery.data?.data ??
    batchesQuery.data ??
    [];
  const batches: BatchItem[] = Array.isArray(rawBatches) ? rawBatches : [];
  const rawAnalytics = analyticsQuery.data?.data ?? analyticsQuery.data;
  const analytics: Analytics = {
    totalPlays: rawAnalytics?.totalPlays ?? rawAnalytics?.total_attempts ?? 0,
    totalStudentsPlayed: rawAnalytics?.totalStudentsPlayed ?? rawAnalytics?.total_students_played ?? 0,
    avgScore: rawAnalytics?.avgScore ?? rawAnalytics?.avg_score ?? 0,
    completionRate: rawAnalytics?.completionRate ?? 0,
    weakSkills: Array.isArray(rawAnalytics?.weakSkills) ? rawAnalytics.weakSkills : [],
    topScorers: Array.isArray(rawAnalytics?.topScorers) ? rawAnalytics.topScorers : [],
  };

  const loadQuestionSets = React.useCallback(async (gameCode: string) => {
    if (!gameCode) return;
    setLoadingQuestionSets(true);
    try {
      const res = await api.get<any>(`/trainer/games/${gameCode}/question-sets`);
      const items = res?.data ?? res ?? [];
      const sets: QuestionSetItem[] = Array.isArray(items) ? items : [];
      setQuestionSets(sets);
      if (sets.length > 0) {
        const active = sets.find((s) => s.isActive) || sets[0];
        setSelectedQuestionSetId(active.id);
      } else {
        setSelectedQuestionSetId('');
      }
    } catch (e) {
      console.warn('Failed to load question sets:', e);
      setQuestionSets([]);
      setSelectedQuestionSetId('');
    } finally {
      setLoadingQuestionSets(false);
    }
  }, []);

  const openAssignModal = (gameCode?: string) => {
    const code = gameCode || (games.length > 0 ? games[0].code : '');
    setSelectedGameCode(code);
    if (batches.length > 0) setTargetBatchId(batches[0].id);
    else setTargetBatchId('');
    setMaxAttempts(3);
    setDueDate('');
    setNotes('');
    setAssignError(null);
    setAssignSuccess(false);
    setShowCsvUpload(false);
    setCsvFile(null);
    setCsvReport(null);
    setCsvError(null);
    setCsvTitle('');
    setAssignModalOpen(true);
    if (code) void loadQuestionSets(code);
  };

  const handleGameSelectChange = (code: string) => {
    setSelectedGameCode(code);
    setShowCsvUpload(false);
    setCsvFile(null);
    setCsvReport(null);
    setCsvError(null);
    void loadQuestionSets(code);
  };

  const handleValidateCsv = async (file: File) => {
    setCsvFile(file);
    setValidatingCsv(true);
    setCsvError(null);
    setCsvReport(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<any>('/trainer/games/validate-csv', formData);
      const report = res?.data ?? res;
      setCsvReport(report);
      if (!report.is_valid) {
        setCsvError(`CSV contains ${report.invalid_count} rejected row(s). Review row-level errors below.`);
      } else {
        toast.success(`CSV valid! ${report.valid_count} questions ready for import.`);
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'CSV validation failed.';
      setCsvError(msg);
      toast.error(msg);
    } finally {
      setValidatingCsv(false);
    }
  };

  const handleUploadAndCreateSet = async () => {
    if (!csvFile || !selectedGameCode || !csvReport?.is_valid) return;
    setUploadingCsv(true);
    setCsvError(null);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append(
        'title',
        csvTitle.trim() || `${selectedGameCode.toUpperCase()} Question Set V${(questionSets.length || 0) + 1}`
      );
      formData.append('activate', 'true');
      const res = await api.post<any>(`/trainer/games/${selectedGameCode}/questions/csv`, formData);
      toast.success(res?.message || 'Question set created and activated successfully!');
      setShowCsvUpload(false);
      setCsvFile(null);
      setCsvReport(null);
      await loadQuestionSets(selectedGameCode);
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Failed to upload question set.';
      setCsvError(msg);
      toast.error(msg);
    } finally {
      setUploadingCsv(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGameCode || !targetBatchId) {
      setAssignError('Please select both a game challenge and a batch.');
      return;
    }

    if (!selectedQuestionSetId) {
      setAssignError('Upload or select a valid question set before assigning this game.');
      return;
    }

    setAssigning(true);
    setAssignError(null);
    try {
      await api.post('/trainer/games/assign', {
        game_id: selectedGameCode,
        gameCode: selectedGameCode,
        batch_id: targetBatchId,
        batchId: targetBatchId,
        question_set_id: selectedQuestionSetId,
        questionSetId: selectedQuestionSetId,
        dueDate: dueDate || undefined,
        deadline: dueDate || undefined,
        max_attempts: maxAttempts,
        notes: notes || undefined,
      });
      setAssignSuccess(true);
      toast.success('Game assigned successfully to batch with Question Set!');
      setTimeout(() => {
        setAssignModalOpen(false);
        setAssignSuccess(false);
        gamesQuery.refetch();
        analyticsQuery.refetch();
        batchesQuery.refetch();
      }, 1200);
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Failed to assign game to batch.';
      setAssignError(msg);
      toast.error(msg);
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
              Assign Game
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('catalog')}
          className={cn(
            'px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'catalog'
              ? 'border-indigo text-indigo'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Game Catalog ({games.length})
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={cn(
            'px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'insights'
              ? 'border-indigo text-indigo'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Batch Insights & Weak Skills
        </button>
      </div>

      {/* Catalog Tab */}
      {activeTab === 'catalog' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <Card key={g.code} className="flex flex-col justify-between hover:border-indigo/50 transition-colors">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="size-10 rounded-xl bg-indigo/10 flex items-center justify-center text-indigo shrink-0">
                    <Gamepad2 className="size-5" />
                  </div>
                  <Badge tone={g.active ? 'success' : 'neutral'}>
                    {g.active ? 'Ready & Active' : 'No Question Set'}
                  </Badge>
                </div>
                <h3 className="font-bold text-base mt-3 text-slate-900 dark:text-white line-clamp-1">
                  {g.title}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 mt-1">{g.description}</p>
              </CardHeader>
              <CardBody className="p-5 pt-0 space-y-4">
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {g.skillsTrained?.map((s) => (
                    <Badge key={s} tone="neutral" className="text-2xs">
                      {s}
                    </Badge>
                  ))}
                </div>
                <div className="pt-2 flex items-center justify-between">
                  <span className="text-2xs font-mono text-slate-400 uppercase">{g.category}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                    onClick={() => openAssignModal(g.code)}
                  >
                    Assign to Batch
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Plays"
              value={num(analytics.totalPlays)}
              icon={<Gamepad2 className="size-4" />}
            />
            <StatCard
              label="Average Score"
              value={`${num(analytics.avgScore)} pts`}
              icon={<Trophy className="size-4" />}
            />
            <StatCard
              label="Completion Rate"
              value={pct(analytics.completionRate)}
              icon={<Target className="size-4" />}
            />
            <StatCard
              label="Weak Areas Identified"
              value={num(analytics.weakSkills.length)}
              icon={<AlertTriangle className="size-4" />}
            />
          </div>

          {/* Weak Skills Section */}
          <Card>
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Weak Skill Priorities (Aggregated)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Calculated from participant game attempts across assigned batches
                  </p>
                </div>
                <Flame className="size-5 text-amber-500" />
              </div>
            </CardHeader>
            <CardBody className="p-5">
              {analytics.weakSkills.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No weak skills detected yet for this batch.
                </div>
              ) : (
                <div className="space-y-4">
                  {analytics.weakSkills.map((ws) => (
                    <div key={ws.skill} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {ws.skill}
                        </span>
                        <span className="text-slate-400">
                          Avg: <strong className="text-rose-500">{ws.avgScore}%</strong> •{' '}
                          {ws.studentCount} students affected
                        </span>
                      </div>
                      <ProgressBar
                        value={ws.avgScore}
                        className="h-2 bg-slate-100 dark:bg-slate-800"
                        showValue={false}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Top Scorers Section */}
          <Card>
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Leaderboard & Top Scorers
                  </h3>
                  <p className="text-xs text-slate-400">
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Game to Batch</DialogTitle>
            <DialogDescription>
              Select a game, attach a validated Question Set, and assign to your authorized batch.
            </DialogDescription>
          </DialogHeader>

          {assignSuccess ? (
            <div className="p-6 text-center space-y-2">
              <CheckCircle2 className="size-10 text-emerald-500 mx-auto animate-bounce" />
              <p className="font-semibold text-slate-900 text-base">Game Assigned Successfully!</p>
              <p className="text-xs text-slate-500">Participants in this batch will see the challenge in their dashboard.</p>
            </div>
          ) : (
            <form onSubmit={handleAssign} className="p-6 space-y-4">
              {assignError && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <span className="flex-1">{assignError}</span>
                </div>
              )}

              {/* Game Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Game Challenge
                </label>
                <select
                  value={selectedGameCode}
                  onChange={(e) => handleGameSelectChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {games.length === 0 ? (
                    <option value="" disabled>No games available</option>
                  ) : (
                    games.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.title} ({g.category})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Question Set Selection & Inline CSV Upload */}
              <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Layers className="size-3.5 text-indigo" />
                    Question Set
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant={showCsvUpload ? 'secondary' : 'ghost'}
                    className="text-xs h-7 gap-1"
                    onClick={() => {
                      setShowCsvUpload(!showCsvUpload);
                      setCsvFile(null);
                      setCsvReport(null);
                      setCsvError(null);
                    }}
                  >
                    {showCsvUpload ? (
                      <>
                        <X className="size-3" /> Select Existing
                      </>
                    ) : (
                      <>
                        <UploadCloud className="size-3" /> Upload New CSV
                      </>
                    )}
                  </Button>
                </div>

                {!showCsvUpload ? (
                  <div>
                    {loadingQuestionSets ? (
                      <p className="text-xs text-slate-400 py-1">Loading question sets...</p>
                    ) : questionSets.length === 0 ? (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                        <p>No question set is available for this game yet.</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          className="text-xs"
                          onClick={() => setShowCsvUpload(true)}
                        >
                          <UploadCloud className="size-3 mr-1.5" /> Upload Questions CSV
                        </Button>
                      </div>
                    ) : (
                      <select
                        value={selectedQuestionSetId}
                        onChange={(e) => setSelectedQuestionSetId(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                      >
                        {questionSets.map((qs) => (
                          <option key={qs.id} value={qs.id}>
                            {qs.title} (v{qs.version} · {qs.totalQuestions} Questions){qs.isActive ? ' [ACTIVE]' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedQuestionSetId && (
                      <p className="text-2xs text-slate-500 mt-1 flex items-center gap-1">
                        <Info className="size-3 text-slate-400" />
                        Participants will be tested exclusively using questions from this immutable set version.
                      </p>
                    )}
                  </div>
                ) : (
                  /* CSV Upload Area */
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-2xs font-semibold text-slate-600 dark:text-slate-400">
                        Question Set Title (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder={`e.g., ${selectedGameCode.toUpperCase()} Lab Sprint 1`}
                        value={csvTitle}
                        onChange={(e) => setCsvTitle(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 text-center space-y-2 hover:border-indigo/50 transition-colors bg-white/50 dark:bg-slate-900/50">
                      <FileSpreadsheet className="size-8 mx-auto text-indigo" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {csvFile ? csvFile.name : 'Select or drop questions CSV file'}
                        </p>
                        <p className="text-2xs text-slate-400 mt-0.5">
                          Format: question, option_a, option_b, option_c, option_d, answer, tag, eedi_parameter, weight
                        </p>
                      </div>

                      <label className="inline-block cursor-pointer">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo/10 text-indigo hover:bg-indigo/20 text-xs font-semibold transition-colors">
                          Browse CSV File
                        </span>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleValidateCsv(file);
                          }}
                        />
                      </label>
                    </div>

                    {validatingCsv && (
                      <p className="text-xs text-indigo animate-pulse text-center">
                        Validating CSV rows against EEDI parameters on server...
                      </p>
                    )}

                    {csvError && (
                      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                        {csvError}
                      </div>
                    )}

                    {csvReport && (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                            <span className="text-2xs text-slate-400 font-mono">Total Rows</span>
                            <p className="font-bold text-slate-900 dark:text-white">{csvReport.total_rows}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                            <span className="text-2xs text-emerald-600 font-mono">Valid Rows</span>
                            <p className="font-bold text-emerald-600">{csvReport.valid_count}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
                            <span className="text-2xs text-rose-600 font-mono">Invalid Rows</span>
                            <p className="font-bold text-rose-600">{csvReport.invalid_count}</p>
                          </div>
                        </div>

                        {csvReport.errors && csvReport.errors.length > 0 && (
                          <div className="max-h-28 overflow-y-auto border border-rose-200 dark:border-rose-900 rounded-lg p-2 bg-rose-50/60 dark:bg-rose-950/30 text-2xs space-y-1">
                            {csvReport.errors.slice(0, 10).map((err: any, idx: number) => (
                              <p key={idx} className="text-rose-700 dark:text-rose-300">
                                Row {err.row} [{err.column}]: {err.message}
                              </p>
                            ))}
                          </div>
                        )}

                        {csvReport.is_valid && (
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            disabled={uploadingCsv}
                            className="w-full text-xs font-semibold"
                            onClick={() => void handleUploadAndCreateSet()}
                          >
                            {uploadingCsv ? 'Creating Question Set...' : `Create & Activate Set (${csvReport.valid_count} Questions)`}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Batch Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Assign to Batch
                </label>

                {batchesQuery.error ? (
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-center justify-between">
                    <span>Unable to load your assigned batches.</span>
                    <Button type="button" size="sm" variant="secondary" onClick={() => batchesQuery.refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : (
                  <select
                    value={targetBatchId}
                    onChange={(e) => setTargetBatchId(e.target.value)}
                    disabled={batchesQuery.loading || batches.length === 0}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {batchesQuery.loading ? (
                      <option value="" disabled>Loading assigned batches...</option>
                    ) : batches.length === 0 ? (
                      <option value="" disabled>No batches are currently assigned to you.</option>
                    ) : (
                      <>
                        <option value="">Select a batch</option>
                        {batches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                )}

                {!batchesQuery.loading && !batchesQuery.error && batches.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No batches are currently assigned to you. Ask your Admin/SPOC to assign a batch before assigning games.
                  </p>
                )}
              </div>

              {/* Max Attempts & Due Date in a 2-column grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Max Attempts
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
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
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Instructions / Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Complete before Friday's lab session to discuss results"
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
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
                  disabled={
                    assigning ||
                    batchesQuery.loading ||
                    batches.length === 0 ||
                    !targetBatchId ||
                    !selectedGameCode ||
                    !selectedQuestionSetId
                  }
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
