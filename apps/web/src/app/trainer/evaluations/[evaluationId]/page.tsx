'use client';

import { ArrowLeft, History, Lock, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import {
  EvaluationForm,
  toParameterScores,
  useEvaluationSave,
} from '@/components/trainer/evaluation-form';
import { PageHeader } from '@/components/shared/page-header';
import { SkillBreakdown } from '@/components/shared/progress-bits';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

const PILLAR_LABELS: Record<string, string> = {
  behaviour: 'Behaviour',
  communication: 'Communication',
  confidence: 'Confidence',
  leadership: 'Leadership',
  technical: 'Technical',
  problem_solving: 'Problem Solving',
  career_readiness: 'Career Readiness',
};

export default function EvaluationDetailPage() {
  const params = useParams<{ evaluationId: string }>();
  const query = useApi<any>(`/trainer/evaluations/${params.evaluationId}`);
  const { saving, submitting, run } = useEvaluationSave();

  const [scores, setScores] = React.useState<Record<string, number>>({});
  const [remarks, setRemarks] = React.useState('');
  const [rubric, setRubric] = React.useState<Record<string, number>>({});
  const [editReason, setEditReason] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const data = query.data;
    if (!data || loaded) return;
    const next: Record<string, number> = {};
    for (const entry of data.parameterScores ?? []) next[entry.code] = entry.score;
    setScores(next);
    setRemarks(data.remarks ?? '');
    const nextRubric: Record<string, number> = {};
    for (const entry of data.rubricScores ?? []) {
      if (entry?.criterion) nextRubric[entry.criterion] = entry.score;
    }
    setRubric(nextRubric);
    setLoaded(true);
  }, [query.data, loaded]);

  async function save(state: 'draft' | 'submitted') {
    await run(
      state === 'draft' ? 'draft' : 'submit',
      () =>
        api.patch(`/trainer/evaluations/${params.evaluationId}`, {
          parameterScores: toParameterScores(scores),
          rubricScores: Object.entries(rubric).map(([criterion, score]) => ({
            criterion,
            score,
          })),
          remarks,
          state,
          expectedVersion: query.data?.version,
          editReason: editReason || undefined,
        }),
      () => {
        setEditReason('');
        query.refetch();
      },
    );
  }

  async function submitOnly() {
    await run(
      'submit',
      () => api.post(`/trainer/evaluations/${params.evaluationId}/submit`),
      () => query.refetch(),
    );
  }

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => (
        <>
          <PageHeader
            breadcrumbs={[
              { label: 'Evaluations', href: '/trainer/evaluations' },
              { label: data.studentName },
            ]}
            title={`${data.studentName} — ${data.trainingModuleName}`}
            description={`${data.rollNumber} · ${data.batchName} · ${data.semesterLabel ?? 'current semester'}`}
            actions={
              <>
                <StatusBadge status={data.state} />
                {data.state === 'draft' && (
                  <Button variant="primary" size="sm" loading={submitting} onClick={submitOnly}>
                    <Send className="size-3.5" aria-hidden />
                    Submit as-is
                  </Button>
                )}
                <Button asChild variant="secondary" size="sm">
                  <Link href="/trainer/evaluations">
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Back
                  </Link>
                </Button>
              </>
            }
          />

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardBody>
                <p className="text-xs uppercase tracking-wider text-ink-2">Total score</p>
                <p className="tnum mt-1.5 text-[22px] font-bold leading-none">
                  {num(data.totalScore, 1)}
                  <span className="text-[14px] font-semibold text-ink-3">/100</span>
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs uppercase tracking-wider text-ink-2">Completeness</p>
                <p className="tnum mt-1.5 text-[22px] font-bold leading-none">
                  {num(data.completeness, 0)}%
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs uppercase tracking-wider text-ink-2">Version</p>
                <p className="tnum mt-1.5 text-[22px] font-bold leading-none">v{data.version}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {data.versions?.length ?? 0} recorded change(s)
                </p>
              </CardBody>
            </Card>
          </div>

          {data.pillarScores && Object.keys(data.pillarScores).length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <div>
                  <CardTitle>Pillar scores from this evaluation</CardTitle>
                  <CardSubtitle>
                    Each parameter normalised to its own maximum, then weighted per pillar
                  </CardSubtitle>
                </div>
              </CardHeader>
              <CardBody>
                <SkillBreakdown
                  pillars={Object.entries(data.pillarScores).map(([code, value]) => ({
                    code,
                    label: PILLAR_LABELS[code] ?? code,
                    score: value as number,
                  }))}
                  showBand={false}
                />
              </CardBody>
            </Card>
          )}

          {!data.editable ? (
            <Card className="mb-4 border-amber/40 bg-amber-50/60">
              <CardBody className="flex flex-wrap items-center gap-3">
                <Lock className="size-4 shrink-0 text-amber-dark" aria-hidden />
                <p className="min-w-[200px] flex-1 text-base text-ink-1">
                  The edit window for this submitted evaluation has closed. Ask your administrator
                  to reopen it — the record stays exactly as submitted until then.
                </p>
              </CardBody>
            </Card>
          ) : (
            <>
              {data.state === 'submitted' && (
                <Card className="mb-4">
                  <CardBody>
                    <Field
                      label="Reason for this correction"
                      htmlFor="editReason"
                      hint="Kept with the version history so the change is explainable later."
                    >
                      <Input
                        id="editReason"
                        value={editReason}
                        onChange={(event) => setEditReason(event.target.value)}
                        placeholder="e.g. re-rated Confidence after the re-attempt"
                      />
                    </Field>
                  </CardBody>
                </Card>
              )}

              <EvaluationForm
                scores={scores}
                onChange={(code, value) =>
                  setScores((current) => ({ ...current, [code]: value }))
                }
                remarks={remarks}
                onRemarksChange={setRemarks}
                rubricScores={rubric}
                onRubricChange={(criterion, value) =>
                  setRubric((current) => ({ ...current, [criterion]: value }))
                }
                rubricCriteria={[
                  'Clarity',
                  'Structure',
                  'Confidence',
                  'Engagement',
                  'Professionalism',
                ]}
                onSaveDraft={() => save('draft')}
                onSubmit={() => save('submitted')}
                saving={saving}
                submitting={submitting}
                editWindowNote={
                  data.editWindowEndsAt
                    ? `Corrections are allowed until ${formatDate(data.editWindowEndsAt, true)}. Every change is versioned with your name against it.`
                    : undefined
                }
              />
            </>
          )}

          {data.versions?.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <div>
                  <CardTitle>Change history</CardTitle>
                  <CardSubtitle>Append-only — nothing is overwritten</CardSubtitle>
                </div>
                <History className="size-4 text-ink-3" aria-hidden />
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-line-soft">
                  {data.versions.map((version: any) => (
                    <li key={version.id} className="flex flex-wrap items-center gap-3 py-3">
                      <Badge tone="neutral">v{version.version}</Badge>
                      <div className="min-w-[180px] flex-1">
                        <p className="text-base">{version.reason}</p>
                        <p className="mt-0.5 text-xs text-ink-3">
                          {version.changedByLabel} · {formatDate(version.changedAt, true)}
                        </p>
                      </div>
                      <span className="tnum text-sm font-semibold">
                        {num(version.snapshot?.totalScore, 1)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </AsyncSection>
  );
}
