'use client';

import { ArrowLeft, Download, Save } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

export default function AssignmentSubmissionsPage() {
  const params = useParams<{ assignmentId: string }>();
  const query = useApi<any>(`/trainer/assignments/${params.assignmentId}/submissions`);

  const [grades, setGrades] = React.useState<Record<string, string>>({});
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const rows = query.data?.submissions;
    if (!rows) return;
    const nextGrades: Record<string, string> = {};
    const nextRemarks: Record<string, string> = {};
    for (const row of rows) {
      if (row.submissionId) {
        if (row.grade != null) nextGrades[row.submissionId] = String(row.grade);
        if (row.remarks) nextRemarks[row.submissionId] = row.remarks;
      }
    }
    setGrades(nextGrades);
    setRemarks(nextRemarks);
  }, [query.data]);

  async function grade(submissionId: string, maxScore: number) {
    const value = Number(grades[submissionId]);
    if (Number.isNaN(value) || value < 0 || value > maxScore) {
      toast.error(`The grade must be between 0 and ${maxScore}.`);
      return;
    }
    setSavingId(submissionId);
    try {
      await api.patch(`/trainer/submissions/${submissionId}`, {
        grade: value,
        remarks: remarks[submissionId] || undefined,
        state: 'reviewed',
      });
      toast.success('Graded — the student has been notified');
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AsyncSection query={query} skeleton="table">
      {(data) => {
        const assignment = data.assignment;
        const rows: any[] = data.submissions;
        const submitted = rows.filter((row) => row.submissionId).length;
        return (
          <>
            <PageHeader
              breadcrumbs={[
                { label: 'Assignments', href: '/trainer/assignments' },
                { label: assignment.title },
              ]}
              title={assignment.title}
              description={`${assignment.batchName} · due ${formatDate(assignment.dueAt, true)} · out of ${assignment.maxScore}`}
              actions={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/trainer/assignments">
                    <ArrowLeft className="size-3.5" aria-hidden />
                    All assignments
                  </Link>
                </Button>
              }
            />

            <Card className="mb-4">
              <CardBody>
                <ProgressBar
                  label={`${submitted} of ${rows.length} submitted`}
                  value={(submitted / Math.max(1, rows.length)) * 100}
                />
                {assignment.description && (
                  <p className="mt-3.5 text-base leading-relaxed text-ink-2">
                    {assignment.description}
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Submissions</CardTitle>
                  <CardSubtitle>
                    Whole roster, so the outstanding ones are visible too
                  </CardSubtitle>
                </div>
              </CardHeader>
              <TableWrap>
                <Table>
                  <caption className="sr-only">
                    Submissions for {assignment.title}
                  </caption>
                  <thead>
                    <Tr>
                      <Th>Student</Th>
                      <Th>State</Th>
                      <Th hideBelow="md">Submitted</Th>
                      <Th hideBelow="lg">Note &amp; files</Th>
                      <Th align="right">Grade</Th>
                      <Th align="right">Save</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <Tr key={row.studentUserId}>
                        <Td>
                          <span className="block font-semibold">{row.name}</span>
                          <span className="block text-xs text-ink-3">{row.rollNumber}</span>
                        </Td>
                        <Td>
                          <StatusBadge status={row.state} />
                          {row.late && (
                            <Badge tone="danger" className="ml-1.5">
                              Late
                            </Badge>
                          )}
                        </Td>
                        <Td hideBelow="md">
                          <span className="tnum text-sm">
                            {row.submittedAt ? formatDate(row.submittedAt, true) : '—'}
                          </span>
                        </Td>
                        <Td hideBelow="lg">
                          {row.note && (
                            <p className="max-w-[260px] text-sm text-ink-2">{row.note}</p>
                          )}
                          {row.files?.map((file: any) => (
                            <a
                              key={file.filename}
                              href={file.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-indigo hover:underline"
                            >
                              <Download className="size-3" aria-hidden />
                              {file.filename}
                            </a>
                          ))}
                          {row.submissionId ? (
                            <Textarea
                              aria-label={`Remark for ${row.name}`}
                              rows={2}
                              value={remarks[row.submissionId] ?? ''}
                              onChange={(event) =>
                                setRemarks((current) => ({
                                  ...current,
                                  [row.submissionId]: event.target.value,
                                }))
                              }
                              placeholder="Remark shown to the student"
                              className="mt-2 max-w-[260px] text-sm"
                            />
                          ) : (
                            !row.note && <span className="text-sm text-ink-3">—</span>
                          )}
                        </Td>
                        <Td align="right">
                          {row.submissionId ? (
                            <div className="flex items-center justify-end gap-2">
                              <Input
                                aria-label={`Grade for ${row.name}`}
                                type="number"
                                min={0}
                                max={assignment.maxScore}
                                value={grades[row.submissionId] ?? ''}
                                onChange={(event) =>
                                  setGrades((current) => ({
                                    ...current,
                                    [row.submissionId]: event.target.value,
                                  }))
                                }
                                className="tnum h-8 w-[72px] text-center"
                              />
                              <span className="text-xs text-ink-3">
                                /{num(assignment.maxScore, 0)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-ink-3">Not submitted</span>
                          )}
                        </Td>
                        <Td align="right">
                          {row.submissionId && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={savingId === row.submissionId}
                              onClick={() => grade(row.submissionId, assignment.maxScore)}
                            >
                              <Save className="size-3.5" aria-hidden />
                              Save
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              <CardBody>
                <p className="text-xs text-ink-3">
                  Grades save one row at a time on purpose — a mis-click should not regrade a
                  whole batch. The student sees the grade and your remark as soon as you save.
                </p>
              </CardBody>
            </Card>
          </>
        );
      }}
    </AsyncSection>
  );
}
