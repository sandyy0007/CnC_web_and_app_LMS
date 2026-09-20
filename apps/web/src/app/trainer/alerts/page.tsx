'use client';

import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

export default function TrainerAlertsPage() {
  const [resolved, setResolved] = React.useState('open');
  const query = useApi<any>(
    '/trainer/alerts',
    { resolved: resolved === 'resolved', pageSize: 50 },
    { select: (raw) => ({ items: raw.items, meta: raw.meta }) },
  );
  const [resolving, setResolving] = React.useState<any>(null);
  const [pending, setPending] = React.useState(false);

  async function resolve(note: string) {
    setPending(true);
    try {
      await api.patch(`/trainer/alerts/${resolving.id}`, { resolved: true, note });
      toast.success('Alert resolved');
      setResolving(null);
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Raised automatically when a pillar score falls below the institution's threshold. Resolving one records what you did about it."
      />

      <Tabs value={resolved} onValueChange={setResolved} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>

      <AsyncSection query={query} skeleton="table">
        {(data) => (
          <>
            {data.meta?.threshold != null && (
              <p className="mb-4 flex items-center gap-1.5 text-sm text-ink-2">
                <ShieldCheck className="size-3.5" aria-hidden />
                Threshold: a pillar below {num(data.meta.threshold, 0)} raises an alert.
              </p>
            )}

            {data.items.length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <CheckCircle2 className="mx-auto size-6 text-success" aria-hidden />
                  <p className="mt-3 text-md font-bold">
                    {resolved === 'open' ? 'No open alerts' : 'Nothing resolved yet'}
                  </p>
                  <p className="mt-1.5 text-base text-ink-2">
                    {resolved === 'open'
                      ? 'Every student in your batches is above the threshold.'
                      : 'Resolved alerts will be listed here with the note you left.'}
                  </p>
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-3.5">
                {data.items.map((alert: any) => (
                  <Card
                    key={alert.id}
                    className={alert.resolvedAt ? undefined : 'border-amber/40 bg-amber-50/40'}
                  >
                    <CardHeader>
                      <div className="min-w-0">
                        <CardTitle>{alert.studentName}</CardTitle>
                        <CardSubtitle>
                          {alert.rollNumber} · raised {formatDate(alert.createdAt)}
                        </CardSubtitle>
                      </div>
                      {alert.resolvedAt ? (
                        <Badge tone="success">Resolved {formatDate(alert.resolvedAt)}</Badge>
                      ) : (
                        <Badge tone="amber">
                          <AlertTriangle className="size-3" aria-hidden />
                          Needs attention
                        </Badge>
                      )}
                    </CardHeader>
                    <CardBody>
                      <p className="text-base leading-relaxed text-ink-1">{alert.remark}</p>

                      <div className="mt-3.5 flex flex-wrap gap-1.5">
                        {(alert.weakPillars ?? [{ pillarLabel: alert.pillarLabel, score: alert.score, threshold: alert.threshold }]).map(
                          (pillar: any) => (
                            <Badge key={pillar.pillarLabel} tone="danger">
                              {pillar.pillarLabel}: {num(pillar.score, 1)} (needs{' '}
                              {num(pillar.threshold, 0)})
                            </Badge>
                          ),
                        )}
                      </div>

                      {alert.resolutionNote && (
                        <p className="mt-3.5 rounded-[10px] bg-app px-3.5 py-2.5 text-sm text-ink-2">
                          <strong className="font-semibold text-ink-1">What was done: </strong>
                          {alert.resolutionNote}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/trainer/students/${alert.studentUserId}`}>
                            Open profile
                          </Link>
                        </Button>
                        {!alert.resolvedAt && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setResolving(alert)}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </AsyncSection>

      <ConfirmDialog
        open={Boolean(resolving)}
        onOpenChange={(open) => !open && setResolving(null)}
        title={`Resolve the alert for ${resolving?.studentName ?? ''}?`}
        description="Say what you did — a counselling session, extra practice, a guardian conversation. The note stays on the record for the HOD."
        confirmLabel="Resolve alert"
        requireReason
        reasonLabel="What did you do?"
        pending={pending}
        onConfirm={resolve}
      />
    </>
  );
}
