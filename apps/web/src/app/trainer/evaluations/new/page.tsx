'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import {
  EvaluationForm,
  toParameterScores,
  useEvaluationSave,
} from '@/components/trainer/evaluation-form';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/shared/filter-bar';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function NewEvaluationPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [studentUserId, setStudentUserId] = React.useState(params.get('studentUserId') ?? '');
  const [moduleId, setModuleId] = React.useState('');
  const [semesterId, setSemesterId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [scores, setScores] = React.useState<Record<string, number>>({});
  const [remarks, setRemarks] = React.useState('');
  const [rubric, setRubric] = React.useState<Record<string, number>>({});

  const students = useApi<any>('/trainer/students', { search, pageSize: 20 }, {
    select: (raw) => ({ items: raw.items }),
  });
  const modules = useApi<any>('/trainer/training-modules', undefined, {
    select: (raw) => ({ items: raw.data, semesters: raw.meta?.semesters ?? [] }),
  });
  const { saving, submitting, run } = useEvaluationSave();

  const chosen = (students.data?.items ?? []).find((row: any) => row.userId === studentUserId);
  const ready = Boolean(studentUserId && moduleId);

  async function save(state: 'draft' | 'submitted') {
    const result = await run(
      state === 'draft' ? 'draft' : 'submit',
      () =>
        api.post('/trainer/evaluations', {
          studentUserId,
          trainingModuleId: moduleId,
          semesterId: semesterId || undefined,
          parameterScores: toParameterScores(scores),
          rubricScores: Object.entries(rubric).map(([criterion, score]) => ({
            criterion,
            score,
          })),
          remarks: remarks || undefined,
          state,
        }),
    );
    if (result?.data?.id) router.push(`/trainer/evaluations/${result.data.id}`);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Evaluations', href: '/trainer/evaluations' },
          { label: 'New evaluation' },
        ]}
        title="New evaluation"
        description="Rate a participant across the seven pillars. A draft is saved privately; submitting recalculates their readiness score."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/trainer/evaluations">
              <ArrowLeft className="size-3.5" aria-hidden />
              Back
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <div>
            <CardTitle>Who and what</CardTitle>
            <CardSubtitle>
              Only participants in your assigned batches can be evaluated
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <label htmlFor="student-search" className="mb-1.5 block text-sm font-semibold">
                Participant
              </label>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search name or roll number…"
                label="Search participants"
              />
              <div className="scroll-thin mt-2 max-h-[190px] overflow-y-auto rounded-[10px] border border-line">
                {(students.data?.items ?? []).map((row: any) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setStudentUserId(row.userId)}
                    aria-pressed={studentUserId === row.userId}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                      studentUserId === row.userId
                        ? 'bg-indigo-50 font-semibold text-indigo-600'
                        : 'hover:bg-app',
                    )}
                  >
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span className="shrink-0 text-xs text-ink-3">{row.rollNumber}</span>
                  </button>
                ))}
                {students.data?.items?.length === 0 && (
                  <p className="px-3 py-3 text-sm text-ink-2">No participants match that search.</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="module" className="mb-1.5 block text-sm font-semibold">
                Training module
              </label>
              <Select value={moduleId} onValueChange={setModuleId}>
                <SelectTrigger id="module">
                  <SelectValue placeholder="Select a module" />
                </SelectTrigger>
                <SelectContent>
                  {(modules.data?.items ?? []).map((row: any) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label htmlFor="semester" className="mb-1.5 mt-4 block text-sm font-semibold">
                Semester
              </label>
              <Select value={semesterId} onValueChange={setSemesterId}>
                <SelectTrigger id="semester">
                  <SelectValue placeholder="Current semester" />
                </SelectTrigger>
                <SelectContent>
                  {(modules.data?.semesters ?? []).map((row: any) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-[10px] bg-app p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-3">Evaluating</p>
              {chosen ? (
                <>
                  <p className="mt-1.5 text-md font-semibold">{chosen.name}</p>
                  <p className="text-sm text-ink-2">
                    {chosen.rollNumber} · {chosen.batchName}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-sm text-ink-2">
                  Pick a participant to start rating.
                </p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {ready ? (
        <EvaluationForm
          scores={scores}
          onChange={(code, value) => setScores((current) => ({ ...current, [code]: value }))}
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
        />
      ) : (
        <Card>
          <CardBody className="py-10 text-center text-base text-ink-2">
            Choose a participant and a module to open the parameter form.
          </CardBody>
        </Card>
      )}
    </>
  );
}
