'use client';

import { GraduationCap, Info, Send, Star } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { StatusBadge } from '@/components/shared/status-badge';
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
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { num } from '@/lib/format';

/**
 * An HOD cannot reassign a trainer directly — that is the institution admin's call. The HOD
 * raises a request, which is exactly what the endpoint records.
 */
function ReassignmentDialog({
  trainer,
  open,
  onOpenChange,
}: {
  trainer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function submit() {
    setPending(true);
    try {
      const response = await api.post(
        `/hod/trainers/${trainer.trainerUserId}/reassignment-request`,
        { reason: reason.trim() },
      );
      toast.success(response.message ?? 'Reassignment request submitted');
      onOpenChange(false);
      setReason('');
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
          <DialogTitle>Request reassignment — {trainer?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm leading-relaxed text-ink-2">
            Module assignments are changed by the institution administrator. This sends them a
            request with your reason attached; nothing changes until they act on it.
          </p>
          <Field
            label="Why is a change needed?"
            htmlFor="reason"
            className="mt-4"
            required
            hint="Workload, subject fit, availability — whatever the administrator needs to decide."
          >
            <Textarea
              id="reason"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
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
            disabled={reason.trim().length < 10}
            onClick={submit}
          >
            <Send className="size-3.5" aria-hidden />
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function HodTrainersPage() {
  const query = useApi<any>('/hod/trainers');
  const [requesting, setRequesting] = React.useState<any>(null);

  return (
    <AsyncSection query={query} skeleton="table">
      {(data) => (
        <>
          <PageHeader
            title="Trainers"
            description="Who is teaching what in your department, and how much of it."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Active trainers"
              value={num(data.activeTrainers)}
              icon={<GraduationCap />}
            />
            <StatCard
              label="Average feedback"
              value={data.averageFeedback ?? '—'}
              outOf={5}
              icon={<Star />}
              tone="amber"
              hasData={data.averageFeedback != null}
            />
            <StatCard
              label="Sessions this cycle"
              value={num(data.sessionsThisCycle)}
              icon={<GraduationCap />}
              tone="teal"
            />
          </div>

          {data.notice && (
            <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-info-bg px-3.5 py-2.5 text-sm text-info">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {data.notice}
            </p>
          )}

          <Card className="mt-5">
            <CardHeader>
              <div>
                <CardTitle>Trainer roster</CardTitle>
                <CardSubtitle>Read-focused — changes go through your administrator</CardSubtitle>
              </div>
            </CardHeader>
            <TableWrap>
              <Table>
                <caption className="sr-only">Trainers in your department</caption>
                <thead>
                  <Tr>
                    <Th>Trainer</Th>
                    <Th hideBelow="md">Modules</Th>
                    <Th align="right">Sessions</Th>
                    <Th align="right" hideBelow="sm">
                      Feedback
                    </Th>
                    <Th align="right" hideBelow="lg">
                      Workload
                    </Th>
                    <Th align="right">Action</Th>
                  </Tr>
                </thead>
                <tbody>
                  {data.roster.map((row: any) => (
                    <Tr key={row.trainerUserId}>
                      <Td>
                        <span className="block font-semibold">{row.name}</span>
                        <span className="block text-xs text-ink-3">{row.designation}</span>
                      </Td>
                      <Td hideBelow="md">
                        <div className="flex flex-wrap gap-1.5">
                          {row.modulesAssigned.map((module: string) => (
                            <Badge key={module} tone="indigo">
                              {module}
                            </Badge>
                          ))}
                          {row.modulesAssigned.length === 0 && (
                            <span className="text-sm text-ink-3">None</span>
                          )}
                        </div>
                      </Td>
                      <Td align="right" className="tnum">
                        {num(row.sessionsConducted)}
                      </Td>
                      <Td align="right" hideBelow="sm" className="tnum">
                        {row.averageFeedback != null ? (
                          <>
                            {row.averageFeedback}
                            <span className="text-xs font-normal text-ink-3">
                              /5 ({num(row.feedbackEntries)})
                            </span>
                          </>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </Td>
                      <Td align="right" hideBelow="lg" className="tnum text-ink-2">
                        {num(row.workloadHoursPerWeek, 1)} h/wk
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          <StatusBadge status={row.status} />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRequesting(row)}
                          >
                            Request change
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          {requesting && (
            <ReassignmentDialog
              trainer={requesting}
              open={Boolean(requesting)}
              onOpenChange={(open) => !open && setRequesting(null)}
            />
          )}
        </>
      )}
    </AsyncSection>
  );
}
