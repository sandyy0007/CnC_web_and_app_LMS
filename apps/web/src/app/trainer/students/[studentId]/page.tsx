'use client';

import { ArrowLeft, ClipboardCheck, FileSpreadsheet, MessageSquarePlus, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { RadialScore, attendanceColor } from '@/components/charts';
import { DetailList } from '@/components/shared/misc';
import { PageHeader } from '@/components/shared/page-header';
import { SkillBreakdown } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { EvaluationReportModal } from '@/components/trainer/EvaluationReportModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';
import { Avatar } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { EvaluationReport } from '@/lib/domain';
import { formatDate, num, pct } from '@/lib/format';

function FeedbackDialog({
  studentUserId,
  studentName,
  open,
  onOpenChange,
  onDone,
}: {
  studentUserId: string;
  studentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [text, setText] = React.useState('');
  const [rating, setRating] = React.useState(4);
  const [pending, setPending] = React.useState(false);

  async function submit() {
    setPending(true);
    try {
      await api.post('/trainer/feedback', {
        studentUserId,
        rating,
        feedbackText: text.trim(),
      });
      toast.success(`Feedback sent to ${studentName}`);
      onOpenChange(false);
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feedback for {studentName}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Rating</legend>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Rating out of 5">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} out of 5`}
                  onClick={() => setRating(value)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-[9px] border transition-colors',
                    rating >= value
                      ? 'border-amber bg-amber text-white'
                      : 'border-line bg-white text-ink-3 hover:bg-app',
                  )}
                >
                  <Star className="size-4" aria-hidden />
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="What should they work on?" htmlFor="feedbackText" className="mt-4" required>
            <Textarea
              id="feedbackText"
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Be specific — name the behaviour and what to do instead."
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={text.trim().length < 10}
            onClick={submit}
          >
            Send feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EvaluateEediDialog({
  studentUserId,
  studentName,
  open,
  onOpenChange,
  onCompleted,
}: {
  studentUserId: string;
  studentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (report: EvaluationReport) => void;
}) {
  const [comm, setComm] = React.useState(78);
  const [conf, setConf] = React.useState(75);
  const [prof, setProf] = React.useState(80);
  const [lead, setLead] = React.useState(72);
  const [career, setCareer] = React.useState(70);
  const [tech, setTech] = React.useState(75);
  const [behav, setBehav] = React.useState(82);

  const [notes, setNotes] = React.useState('Participant demonstrates strong analytical capabilities and consistent presence.');
  const [strengths, setStrengths] = React.useState('Active verbal participation, Collaborative attitude');
  const [weaknesses, setWeaknesses] = React.useState('Pacing in rapid problem solving');
  const [improvements, setImprovements] = React.useState('Practice structured time-limited technical responses');
  const [overall, setOverall] = React.useState('High potential candidate with strong dedication to soft-skill refinement.');
  const [rating, setRating] = React.useState(4);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        studentUserId,
        pillarScores: {
          communication: comm,
          confidence: conf,
          professionalism: prof,
          leadership: lead,
          career_readiness: career,
          technical_fluency: tech,
          behaviour: behav,
        },
        trainerFeedback: {
          qualitativeNotes: notes.trim(),
          strengths: strengths.split(',').map((s) => s.trim()).filter(Boolean),
          weaknesses: weaknesses.split(',').map((w) => w.trim()).filter(Boolean),
          improvementAreas: improvements.split(',').map((i) => i.trim()).filter(Boolean),
          overallAssessment: overall.trim(),
          rating,
        },
      };

      const res = await api.post('/trainer/evaluations/eedi-complete', payload);
      toast.success(`EEDI evaluation completed for ${studentName}`);
      onOpenChange(false);
      if (res.data) {
        onCompleted(res.data);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit evaluation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-line pb-3">
          <DialogTitle className="text-lg font-bold text-ink-1 flex items-center gap-2">
            <Sparkles className="size-5 text-indigo-500 dark:text-indigo-400" />
            Evaluate EEDI & Generate Report for {studentName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          {/* Pillar Sliders */}
          <div className="space-y-2 p-3 rounded-2xl border border-line bg-surface-muted dark:border-white/10 dark:bg-slate-900/50">
            <h4 className="font-bold text-ink-1 uppercase tracking-wider text-[11px]">
              Evaluate Core Competency Pillars (50–100)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {[
                { label: 'Communication', val: comm, set: setComm },
                { label: 'Confidence', val: conf, set: setConf },
                { label: 'Professionalism', val: prof, set: setProf },
                { label: 'Leadership', val: lead, set: setLead },
                { label: 'Career Readiness', val: career, set: setCareer },
                { label: 'Behaviour & Ethics', val: behav, set: setBehav },
              ].map((p) => (
                <div key={p.label} className="p-2 rounded-xl bg-card border border-line dark:bg-slate-950/60 dark:border-white/6">
                  <div className="flex justify-between font-semibold text-ink-1">
                    <span>{p.label}</span>
                    <span className="text-indigo font-bold">{p.val}</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    value={p.val}
                    onChange={(e) => p.set(Number(e.target.value))}
                    className="w-full mt-1 accent-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Qualitative Feedback */}
          <div className="space-y-2.5 p-3 rounded-2xl border border-line bg-surface-muted dark:border-white/10 dark:bg-slate-900/50">
            <h4 className="font-bold text-ink-1 uppercase tracking-wider text-[11px]">
              Trainer Feedback & Qualitative Analysis
            </h4>

            <div>
              <label className="block font-semibold text-ink-2">Overall Assessment *</label>
              <textarea
                required
                rows={2}
                value={overall}
                onChange={(e) => setOverall(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input-border bg-input p-2.5 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block font-semibold text-ink-2">Strengths (comma separated)</label>
                <input
                  type="text"
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input-border bg-input px-2.5 py-1.5 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-ink-2">Weaknesses (comma separated)</label>
                <input
                  type="text"
                  value={weaknesses}
                  onChange={(e) => setWeaknesses(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input-border bg-input px-2.5 py-1.5 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-ink-2">Improvements (comma separated)</label>
                <input
                  type="text"
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input-border bg-input px-2.5 py-1.5 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-line pt-3">
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Complete Evaluation & Generate Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TrainerStudentDetailPage() {
  const params = useParams<{ studentId: string }>();
  const query = useApi<any>(`/trainer/students/${params.studentId}`);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [evaluateOpen, setEvaluateOpen] = React.useState(false);
  const [reportModalOpen, setReportModalOpen] = React.useState(false);
  const [activeReport, setActiveReport] = React.useState<EvaluationReport | null>(null);

  const handleEvaluationCompleted = (report: EvaluationReport) => {
    setActiveReport(report);
    setReportModalOpen(true);
    query.refetch();
  };

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => (
        <>
          <PageHeader
            breadcrumbs={[
              { label: 'Participants', href: '/trainer/students' },
              { label: data.profile.name },
            ]}
            title={data.profile.name}
            description={`${data.profile.rollNumber} · ${data.profile.batchName ?? 'No batch'} · ${data.profile.departmentName}`}
            actions={
              <>
                <Button variant="primary" size="sm" onClick={() => setEvaluateOpen(true)}>
                  <Sparkles className="size-3.5" aria-hidden />
                  EEDI Evaluation & Report
                </Button>
                {activeReport && (
                  <Button variant="secondary" size="sm" onClick={() => setReportModalOpen(true)}>
                    <FileSpreadsheet className="size-3.5" aria-hidden />
                    View Report
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setFeedbackOpen(true)}>
                  <MessageSquarePlus className="size-3.5" aria-hidden />
                  Add feedback
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/trainer/students">
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Back
                  </Link>
                </Button>
              </>
            }
          />

          <div className="grid gap-5 lg:grid-cols-[290px_1fr]">
            <div className="space-y-5">
              <Card>
                <CardBody className="text-center">
                  <Avatar
                    name={data.profile.name}
                    color={data.profile.avatarColor}
                    size={60}
                    className="mx-auto"
                  />
                  <p className="mt-3 text-md font-semibold">{data.profile.name}</p>
                  <p className="text-sm text-ink-2">{data.profile.rollNumber}</p>
                  <div className="mt-4">
                    <RadialScore
                      value={data.eediScore?.finalScore}
                      label="Readiness"
                      size={104}
                      thickness={9}
                    />
                  </div>
                  <p className="mt-2 text-sm text-ink-2">Readiness score</p>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Attendance</CardTitle>
                </CardHeader>
                <CardBody>
                  <p
                    className="tnum text-[24px] font-bold leading-none"
                    style={{ color: attendanceColor(data.attendance?.percentage ?? 0) }}
                  >
                    {pct(data.attendance?.percentage, 1)}
                  </p>
                  <p className="mt-1.5 text-sm text-ink-2">
                    {num(data.attendance?.present)} of {num(data.attendance?.total)} sessions
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardBody>
                  <DetailList
                    rows={[
                      { label: 'Semester', value: data.profile.semester ?? '—' },
                      { label: 'Section', value: data.profile.section ?? '—' },
                      { label: 'Program', value: data.profile.program ?? '—' },
                      { label: 'Status', value: data.profile.status },
                    ]}
                  />
                </CardBody>
              </Card>
            </div>

            <div>
              <Tabs defaultValue="pillars">
                <TabsList>
                  <TabsTrigger value="pillars">Pillars</TabsTrigger>
                  <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
                  <TabsTrigger value="practice">AI practice</TabsTrigger>
                  <TabsTrigger value="feedback">Feedback given</TabsTrigger>
                </TabsList>

                <TabsContent value="pillars">
                  <Card>
                    <CardHeader>
                      <div>
                        <CardTitle>Seven pillars</CardTitle>
                        <CardSubtitle>
                          {data.eediScore?.scoringVersion
                            ? `Scoring v${data.eediScore.scoringVersion}`
                            : 'Not yet scored'}
                        </CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <SkillBreakdown
                        pillars={data.pillars.map((pillar: any) => ({
                          ...pillar,
                          hasData: pillar.score != null,
                        }))}
                        showBand={false}
                      />
                    </CardBody>
                  </Card>
                </TabsContent>

                <TabsContent value="evaluations">
                  <Card>
                    <CardHeader>
                      <div>
                        <CardTitle>Skill assessments</CardTitle>
                        <CardSubtitle>{data.assessments.length} record(s)</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody>
                      {data.assessments.length === 0 ? (
                        <p className="py-6 text-center text-base text-ink-2">
                          No evaluation has been recorded for this participant yet.
                        </p>
                      ) : (
                        <ul className="divide-y divide-line-soft">
                          {data.assessments.map((row: any) => (
                            <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                              <div className="min-w-[160px] flex-1">
                                <p className="text-base font-semibold">
                                  {row.trainingModuleName ?? 'Evaluation'}
                                </p>
                                <p className="mt-0.5 text-xs text-ink-3">
                                  {formatDate(row.createdAt)} · {row.assessedByName ?? 'You'}
                                </p>
                              </div>
                              <Badge tone={row.state === 'submitted' ? 'success' : 'neutral'}>
                                {row.state}
                              </Badge>
                              <span className="tnum text-base font-bold">
                                {num(row.overallScore, 1)}
                                <span className="text-xs font-semibold text-ink-3">/100</span>
                              </span>
                              <Button asChild variant="ghost" size="sm">
                                <Link href={`/trainer/evaluations/${row.id}`}>Open</Link>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardBody>
                  </Card>
                </TabsContent>

                <TabsContent value="practice">
                  <Card>
                    <CardHeader>
                      <div>
                        <CardTitle>AI practice scores</CardTitle>
                        <CardSubtitle>
                          Scored from the participant&apos;s own transcript
                        </CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody>
                      {data.aiScores.length === 0 ? (
                        <p className="py-6 text-center text-base text-ink-2">
                          This participant has not completed a scored practice session yet.
                        </p>
                      ) : (
                        <ul className="divide-y divide-line-soft">
                          {data.aiScores.map((row: any) => (
                            <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                              <div className="min-w-[160px] flex-1">
                                <p className="text-base font-semibold">
                                  {row.practiceModeTitle ?? 'Practice session'}
                                </p>
                                <p className="mt-0.5 text-xs text-ink-3">
                                  {formatDate(row.createdAt, true)}
                                  {row.grounded ? ' · evidence-backed' : ''}
                                </p>
                              </div>
                              {row.trainerOverride?.dimensions && (
                                <Badge tone="amber">Overridden</Badge>
                              )}
                              <span className="tnum text-base font-bold">
                                {num(row.overall, 1)}
                                <span className="text-xs font-semibold text-ink-3">/100</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Button asChild variant="secondary" size="sm" className="mt-4">
                        <Link href="/trainer/evaluations?tab=ai">Review AI scores</Link>
                      </Button>
                    </CardBody>
                  </Card>
                </TabsContent>

                <TabsContent value="feedback">
                  <Card>
                    <CardHeader>
                      <div>
                        <CardTitle>Feedback given</CardTitle>
                        <CardSubtitle>{data.feedback.length} note(s)</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody>
                      {data.feedback.length === 0 ? (
                        <p className="py-6 text-center text-base text-ink-2">
                          No written feedback yet.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {data.feedback.map((row: any) => (
                            <li key={row.id} className="rounded-[10px] bg-app px-3.5 py-3">
                              <p className="text-base leading-relaxed">{row.feedbackText}</p>
                              <p className="mt-1.5 text-xs text-ink-3">
                                {row.trainerName} · {formatDate(row.createdAt)}
                                {row.rating ? ` · rated ${row.rating}/5` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardBody>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <FeedbackDialog
            studentUserId={data.profile.userId}
            studentName={data.profile.name}
            open={feedbackOpen}
            onOpenChange={setFeedbackOpen}
            onDone={query.refetch}
          />

          <EvaluateEediDialog
            studentUserId={data.profile.userId}
            studentName={data.profile.name}
            open={evaluateOpen}
            onOpenChange={setEvaluateOpen}
            onCompleted={handleEvaluationCompleted}
          />

          <EvaluationReportModal
            report={activeReport}
            open={reportModalOpen}
            onOpenChange={setReportModalOpen}
          />
        </>
      )}
    </AsyncSection>
  );
}
