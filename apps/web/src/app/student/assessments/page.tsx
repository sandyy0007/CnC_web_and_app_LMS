'use client';

import {
  CalendarClock,
  ClipboardList,
  FileUp,
  PlayCircle,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

function AssignmentSubmitDialog({
  assignment,
  open,
  onOpenChange,
  onDone,
}: {
  assignment: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [note, setNote] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit() {
    if (!note.trim() && !file) {
      toast.error('Add a note or attach a file before submitting.');
      return;
    }
    setPending(true);
    try {
      const form = new FormData();
      form.append('note', note);
      if (file) form.append('file', file);
      const response = await api.upload(
        `/student/assignments/${assignment.id}/submit`,
        form,
      );
      toast.success(response.message ?? 'Submitted');
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
          <DialogTitle>Submit: {assignment.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field label="Note for your trainer" htmlFor="note">
            <Textarea
              id="note"
              rows={5}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What you did, and anything your trainer should know…"
            />
          </Field>
          <div className="mt-4">
            <label htmlFor="assignment-file" className="mb-1.5 block text-sm font-semibold">
              Attach a file (optional, up to 25 MB)
            </label>
            <input
              id="assignment-file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-[9px] border border-input-border bg-input text-ink-1 px-3 py-2 text-sm file:mr-3 file:rounded-[6px] file:border-0 file:bg-surface-muted file:text-ink-1 file:px-2.5 file:py-1 file:text-sm file:font-semibold hover:file:bg-surface-hover cursor-pointer"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={submit}>
            <Upload className="size-3.5" aria-hidden />
            Submit work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AssessmentsPage() {
  const quizzes = useApi<any[]>('/student/assessments');
  const assignments = useApi<any[]>('/student/assignments');
  const [submitting, setSubmitting] = React.useState<any>(null);

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Quizzes set for your batch, and the assignments your trainers expect back."
      />

      <Tabs defaultValue="quizzes">
        <TabsList>
          <TabsTrigger value="quizzes">Quizzes &amp; tests</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="quizzes">
          <AsyncSection query={quizzes} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
            {(rows) => (
              <div className="grid gap-4 lg:grid-cols-2">
                {rows.map((quiz) => {
                  const open = quiz.state === 'available' || quiz.state === 'open';
                  return (
                    <Card key={quiz.id}>
                      <CardBody>
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex size-9 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo">
                            <ClipboardList className="size-[18px]" aria-hidden />
                          </span>
                          <StatusBadge status={quiz.state} />
                        </div>
                        <h2 className="mt-3.5 text-md font-semibold">{quiz.title}</h2>
                        <p className="mt-1 text-sm text-ink-2">
                          {quiz.questions} question(s) · {quiz.durationMinutes} minutes
                        </p>
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
                          <CalendarClock className="size-3.5" aria-hidden />
                          Open {formatDate(quiz.opensAt)} — closes {formatDate(quiz.closesAt)}
                        </p>

                        {quiz.myScore != null ? (
                          <div className="mt-4 flex items-center justify-between rounded-[10px] bg-app px-3.5 py-3">
                            <span className="text-sm text-ink-2">Your score</span>
                            <span className="tnum text-md font-bold">
                              {quiz.myScore}
                              <span className="text-xs font-semibold text-ink-3">
                                /{quiz.maxScore}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <Button asChild variant="primary" size="sm" className="mt-4 w-full">
                            <Link href={`/student/assessments/${quiz.id}`}>
                              <PlayCircle className="size-3.5" aria-hidden />
                              {open ? 'Start assessment' : 'View assessment'}
                            </Link>
                          </Button>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </AsyncSection>
        </TabsContent>

        <TabsContent value="assignments">
          <AsyncSection query={assignments} skeleton="table" isEmpty={(rows) => rows.length === 0}>
            {(rows) => (
              <div className="space-y-3.5">
                {rows.map((assignment) => {
                  const overdue =
                    assignment.state === 'pending' &&
                    typeof assignment.daysLeft === 'number' &&
                    assignment.daysLeft < 0;
                  return (
                    <Card key={assignment.id}>
                      <CardHeader>
                        <div className="min-w-0">
                          <CardTitle>{assignment.title}</CardTitle>
                          <CardSubtitle>
                            {assignment.trainerName} · {assignment.trainingModuleName} ·{' '}
                            {assignment.batchName}
                          </CardSubtitle>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={assignment.state} />
                          {overdue && <Badge tone="danger">Overdue</Badge>}
                        </div>
                      </CardHeader>
                      <CardBody>
                        <p className="text-base leading-relaxed text-ink-2">
                          {assignment.description}
                        </p>
                        <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                          <span
                            className={cn(
                              'flex items-center gap-1.5',
                              overdue ? 'font-semibold text-danger' : 'text-ink-2',
                            )}
                          >
                            <CalendarClock className="size-3.5" aria-hidden />
                            Due {formatDate(assignment.dueAt, true)}
                            {typeof assignment.daysLeft === 'number' &&
                              ` · ${assignment.daysLeft >= 0 ? `${assignment.daysLeft} day(s) left` : `${Math.abs(assignment.daysLeft)} day(s) late`}`}
                          </span>
                          <span className="text-ink-2">Out of {assignment.maxScore}</span>
                        </div>

                        {assignment.submission ? (
                          <div className="mt-4 rounded-[10px] bg-app px-3.5 py-3">
                            <p className="text-sm font-semibold">
                              Submitted {formatDate(assignment.submission.submittedAt, true)}
                            </p>
                            {assignment.submission.note && (
                              <p className="mt-1 text-sm text-ink-2">
                                {assignment.submission.note}
                              </p>
                            )}
                            {assignment.submission.grade != null ? (
                              <p className="tnum mt-2 text-base font-bold">
                                Graded: {assignment.submission.grade}/{assignment.maxScore}
                                {assignment.submission.feedback && (
                                  <span className="mt-1 block text-sm font-normal text-ink-2">
                                    {assignment.submission.feedback}
                                  </span>
                                )}
                              </p>
                            ) : (
                              <p className="mt-2 text-sm text-ink-3">
                                Waiting for your trainer to grade it.
                              </p>
                            )}
                          </div>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            className="mt-4"
                            disabled={assignment.status === 'closed' && overdue}
                            onClick={() => setSubmitting(assignment)}
                          >
                            <FileUp className="size-3.5" aria-hidden />
                            Submit work
                          </Button>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </AsyncSection>
        </TabsContent>
      </Tabs>

      {submitting && (
        <AssignmentSubmitDialog
          assignment={submitting}
          open={Boolean(submitting)}
          onOpenChange={(open) => !open && setSubmitting(null)}
          onDone={() => {
            setSubmitting(null);
            assignments.refetch();
          }}
        />
      )}
    </>
  );
}
