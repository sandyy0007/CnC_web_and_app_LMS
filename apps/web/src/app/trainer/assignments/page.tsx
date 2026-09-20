'use client';

import { CalendarClock, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
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
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

function CreateAssignmentDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const batches = useApi<any[]>('/trainer/batches');
  const modules = useApi<any>('/trainer/training-modules', undefined, {
    select: (raw) => ({ items: raw.data }),
  });

  const [form, setForm] = React.useState({
    title: '',
    description: '',
    batchId: '',
    trainingModuleId: '',
    dueAt: '',
    maxScore: '100',
  });
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function submit() {
    setPending(true);
    setFieldErrors({});
    try {
      await api.post('/trainer/assignments', {
        title: form.title,
        description: form.description || undefined,
        batchId: form.batchId,
        trainingModuleId: form.trainingModuleId || undefined,
        // `datetime-local` has no zone; send it as the browser's local instant.
        dueAt: new Date(form.dueAt).toISOString(),
        maxScore: Number(form.maxScore),
      });
      toast.success('Assignment created — the batch has been notified');
      onOpenChange(false);
      onDone();
    } catch (caught) {
      const apiError = caught as ApiError;
      setFieldErrors(apiError.fieldErrors);
      toast.error(apiError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New assignment</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <Field label="Title" htmlFor="title" required error={fieldErrors.title}>
              <Input
                id="title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </Field>
            <Field label="Brief" htmlFor="description" error={fieldErrors.description}>
              <Textarea
                id="description"
                rows={4}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What to submit, and how it will be marked."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="batchId" className="mb-1.5 block text-sm font-semibold">
                  Batch
                </label>
                <Select
                  value={form.batchId}
                  onValueChange={(value) => setForm({ ...form, batchId: value })}
                >
                  <SelectTrigger id="batchId">
                    <SelectValue placeholder="Select a batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {(batches.data ?? []).map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="moduleId" className="mb-1.5 block text-sm font-semibold">
                  Module (optional)
                </label>
                <Select
                  value={form.trainingModuleId}
                  onValueChange={(value) => setForm({ ...form, trainingModuleId: value })}
                >
                  <SelectTrigger id="moduleId">
                    <SelectValue placeholder="No module" />
                  </SelectTrigger>
                  <SelectContent>
                    {(modules.data?.items ?? []).map((row: any) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="Due date & time" htmlFor="dueAt" required error={fieldErrors.dueAt}>
                <Input
                  id="dueAt"
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
                />
              </Field>
              <Field label="Out of" htmlFor="maxScore" error={fieldErrors.maxScore}>
                <Input
                  id="maxScore"
                  type="number"
                  min={1}
                  value={form.maxScore}
                  onChange={(event) => setForm({ ...form, maxScore: event.target.value })}
                />
              </Field>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!form.title || !form.batchId || !form.dueAt}
            onClick={submit}
          >
            Create assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TrainerAssignmentsPage() {
  const query = useApi<any>('/trainer/assignments', { pageSize: 50 }, {
    select: (raw) => ({ items: raw.items, pagination: raw.pagination }),
  });
  const [creating, setCreating] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Set work, watch submissions land, and grade them. Due dates must be in the future."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" aria-hidden />
            New assignment
          </Button>
        }
      />

      <AsyncSection query={query} skeleton="table" isEmpty={(data) => data.items.length === 0}>
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.items.map((assignment: any) => (
              <Card key={assignment.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{assignment.title}</CardTitle>
                    <CardSubtitle>
                      {assignment.batchName}
                      {assignment.trainingModuleName
                        ? ` · ${assignment.trainingModuleName}`
                        : ''}
                    </CardSubtitle>
                  </div>
                  <StatusBadge status={assignment.status} />
                </CardHeader>
                <CardBody>
                  <p className="flex items-center gap-1.5 text-sm text-ink-2">
                    <CalendarClock className="size-3.5" aria-hidden />
                    Due {formatDate(assignment.dueAt, true)} · out of {assignment.maxScore}
                  </p>

                  <div className="mt-3.5">
                    <ProgressBar
                      label={`${num(assignment.submittedCount)} of ${num(assignment.rosterSize)} submitted`}
                      value={
                        (assignment.submittedCount / Math.max(1, assignment.rosterSize)) * 100
                      }
                    />
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    {assignment.pendingCount > 0 && (
                      <Badge tone="amber">
                        <Users className="size-3" aria-hidden />
                        {assignment.pendingCount} outstanding
                      </Badge>
                    )}
                    <Button asChild variant="primary" size="sm" className="ml-auto">
                      <Link href={`/trainer/assignments/${assignment.id}`}>
                        Review submissions
                      </Link>
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </AsyncSection>

      <CreateAssignmentDialog
        open={creating}
        onOpenChange={setCreating}
        onDone={query.refetch}
      />
    </>
  );
}
