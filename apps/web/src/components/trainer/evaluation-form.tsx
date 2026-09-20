'use client';

import { AlertTriangle, ChevronDown, Clock, Save, Send } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ProgressBar } from '@/components/shared/progress-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { num } from '@/lib/format';

export interface ParameterDefinition {
  code: string;
  label: string;
  description?: string;
  maxScore: number;
  weight: number;
  scale: string;
}

export interface PillarGroup {
  pillar: string;
  label: string;
  parameterCount: number;
  parameters: ParameterDefinition[];
}

/**
 * The 95+ parameter rating form (§11.4).
 *
 * Kept deliberately keyboard-first: each parameter is a radio group of whole-number buttons, so
 * a trainer can rate a whole pillar without reaching for the mouse. Nothing is submitted until
 * the trainer says so, and a submit is confirmed because it triggers a score recalculation.
 */
export function EvaluationForm({
  scores,
  onChange,
  remarks,
  onRemarksChange,
  rubricScores,
  onRubricChange,
  rubricCriteria,
  onSaveDraft,
  onSubmit,
  saving,
  submitting,
  editWindowNote,
  semester,
}: {
  scores: Record<string, number>;
  onChange: (code: string, value: number) => void;
  remarks: string;
  onRemarksChange: (value: string) => void;
  rubricScores?: Record<string, number>;
  onRubricChange?: (criterion: string, value: number) => void;
  rubricCriteria?: string[];
  onSaveDraft: () => void;
  onSubmit: () => void;
  saving?: boolean;
  submitting?: boolean;
  editWindowNote?: string;
  semester?: number;
}) {
  const query = useApi<{ pillars: PillarGroup[]; totalParameters: number; editWindowHours: number }>(
    '/trainer/evaluations/parameters',
    semester ? { semester } : undefined,
  );
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const pillars = query.data?.pillars ?? [];
  const total = query.data?.totalParameters ?? 0;
  const rated = pillars.reduce(
    (count, pillar) =>
      count + pillar.parameters.filter((parameter) => scores[parameter.code] != null).length,
    0,
  );
  const completeness = total ? Math.round((rated / total) * 100) : 0;

  React.useEffect(() => {
    // Open the first pillar so the form does not start as a wall of collapsed headers.
    if (pillars.length && Object.keys(open).length === 0) {
      setOpen({ [pillars[0].pillar]: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillars.length]);

  function pillarProgress(pillar: PillarGroup) {
    const done = pillar.parameters.filter((p) => scores[p.code] != null).length;
    return { done, total: pillar.parameters.length };
  }

  function pillarAverage(pillar: PillarGroup) {
    const values = pillar.parameters
      .filter((p) => scores[p.code] != null)
      .map((p) => (scores[p.code] / (p.maxScore || 5)) * 100);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function fillPillar(pillar: PillarGroup, fraction: number) {
    for (const parameter of pillar.parameters) {
      onChange(parameter.code, Math.round((parameter.maxScore || 5) * fraction));
    }
  }

  return (
    <>
      <Card className="mb-4 sticky top-[62px] z-10">
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="min-w-[200px] flex-1">
            <ProgressBar
              label={`${rated} of ${total} parameters rated`}
              value={completeness}
            />
          </div>
          {completeness < 60 && (
            <Badge tone="amber">
              <AlertTriangle className="size-3" aria-hidden />
              60% needed to submit
            </Badge>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" loading={saving} onClick={onSaveDraft}>
              <Save className="size-3.5" aria-hidden />
              Save draft
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={submitting}
              disabled={completeness < 60}
              onClick={() => setConfirmOpen(true)}
            >
              <Send className="size-3.5" aria-hidden />
              Submit
            </Button>
          </div>
        </CardBody>
      </Card>

      {editWindowNote && (
        <p className="mb-4 flex items-start gap-2 rounded-[10px] bg-info-bg px-3.5 py-2.5 text-sm text-info">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {editWindowNote}
        </p>
      )}

      <div className="space-y-3.5">
        {pillars.map((pillar) => {
          const progress = pillarProgress(pillar);
          const average = pillarAverage(pillar);
          const isOpen = Boolean(open[pillar.pillar]);
          return (
            <Card key={pillar.pillar}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`pillar-${pillar.pillar}`}
                onClick={() =>
                  setOpen((current) => ({ ...current, [pillar.pillar]: !current[pillar.pillar] }))
                }
                className="flex w-full items-center gap-3 px-5 py-4 text-left"
              >
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-ink-3 transition-transform',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-md font-semibold">{pillar.label}</span>
                  <span className="block text-xs text-ink-3">
                    {progress.done} of {progress.total} rated
                  </span>
                </span>
                {average != null && (
                  <span className="tnum shrink-0 text-base font-bold">
                    {num(average, 1)}
                    <span className="text-xs font-normal text-ink-3">/100</span>
                  </span>
                )}
                <span className="hidden w-[120px] shrink-0 sm:block">
                  <ProgressBar
                    value={(progress.done / Math.max(1, progress.total)) * 100}
                    showValue={false}
                    thin
                  />
                </span>
              </button>

              {isOpen && (
                <div id={`pillar-${pillar.pillar}`} className="border-t border-line-soft px-5 py-4">
                  <div className="mb-3.5 flex flex-wrap gap-2">
                    <span className="text-xs text-ink-3">Fill this pillar:</span>
                    {[
                      ['Low', 0.4],
                      ['Average', 0.6],
                      ['Good', 0.8],
                      ['Excellent', 1],
                    ].map(([label, fraction]) => (
                      <button
                        key={label as string}
                        type="button"
                        onClick={() => fillPillar(pillar, fraction as number)}
                        className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-app"
                      >
                        {label as string}
                      </button>
                    ))}
                  </div>

                  <ul className="divide-y divide-line-soft">
                    {pillar.parameters.map((parameter) => (
                      <li key={parameter.code} className="py-3">
                        <fieldset>
                          <legend className="text-base font-semibold">
                            {parameter.label}
                            {parameter.weight > 1 && (
                              <span className="ml-2 text-xs font-normal text-ink-3">
                                weight ×{parameter.weight}
                              </span>
                            )}
                          </legend>
                          {parameter.description && (
                            <p className="mt-0.5 text-sm leading-relaxed text-ink-2">
                              {parameter.description}
                            </p>
                          )}
                          <div
                            className="mt-2 flex flex-wrap gap-1.5"
                            role="radiogroup"
                            aria-label={parameter.label}
                          >
                            {Array.from(
                              { length: (parameter.maxScore || 5) + 1 },
                              (_, value) => value,
                            ).map((value) => {
                              const active = scores[parameter.code] === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  onClick={() => onChange(parameter.code, value)}
                                  className={cn(
                                    'tnum flex size-8 items-center justify-center rounded-[8px] border text-sm font-bold transition-colors',
                                    active
                                      ? 'border-indigo bg-indigo text-white'
                                      : 'border-line bg-white text-ink-2 hover:bg-app',
                                  )}
                                >
                                  {value}
                                </button>
                              );
                            })}
                            <span className="ml-1 self-center text-xs text-ink-3">
                              of {parameter.maxScore} ({parameter.scale})
                            </span>
                          </div>
                        </fieldset>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {rubricCriteria && rubricCriteria.length > 0 && onRubricChange && (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Rubric</CardTitle>
              <CardSubtitle>Module rubric criteria, rated out of 5</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-line-soft">
              {rubricCriteria.map((criterion) => (
                <li key={criterion} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 text-base font-semibold">{criterion}</span>
                  <div className="flex gap-1.5" role="radiogroup" aria-label={criterion}>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = rubricScores?.[criterion] === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => onRubricChange(criterion, value)}
                          className={cn(
                            'tnum flex size-8 items-center justify-center rounded-[8px] border text-sm font-bold',
                            active
                              ? 'border-teal bg-teal text-white'
                              : 'border-line bg-white text-ink-2 hover:bg-app',
                          )}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card className="mt-4">
        <CardBody>
          <Field
            label="Remarks for the participant"
            htmlFor="remarks"
            hint="Shown to the participant with their score. Name the behaviour, not the person."
          >
            <Textarea
              id="remarks"
              rows={4}
              value={remarks}
              onChange={(event) => onRemarksChange(event.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit this evaluation?"
        description={`${rated} of ${total} parameters are rated (${completeness}%). Submitting recalculates the participant's readiness score and notifies them. You can still correct it inside the edit window.`}
        confirmLabel="Submit evaluation"
        pending={submitting}
        onConfirm={() => {
          setConfirmOpen(false);
          onSubmit();
        }}
      />

      {query.error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-danger">
          The parameter set could not be loaded: {query.error.message}
        </p>
      )}
    </>
  );
}

/** Small helper the pages share: turn `{code: score}` into the API's array form. */
export function toParameterScores(scores: Record<string, number>) {
  return Object.entries(scores).map(([code, score]) => ({ code, score }));
}

export function useEvaluationSave() {
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function run(
    kind: 'draft' | 'submit',
    fn: () => Promise<any>,
    onSuccess?: (result: any) => void,
  ) {
    const setter = kind === 'draft' ? setSaving : setSubmitting;
    setter(true);
    try {
      const result = await fn();
      toast.success(result?.message ?? (kind === 'draft' ? 'Draft saved' : 'Evaluation submitted'));
      onSuccess?.(result);
      return result;
    } catch (caught) {
      toast.error((caught as ApiError).message);
      return null;
    } finally {
      setter(false);
    }
  }

  return { saving, submitting, run };
}
