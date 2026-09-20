'use client';

import { Check, GraduationCap, MessageSquare, ShieldCheck, Star, X } from 'lucide-react';

import { DetailList } from '@/components/shared/misc';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { num } from '@/lib/format';

const ACCESS_LABELS: Record<string, string> = {
  canMarkAttendance: 'Mark attendance',
  canEvaluate: 'Enter evaluations',
  canCreateAssignments: 'Create assignments',
  canViewReports: 'View and export reports',
};

export default function TrainerProfilePage() {
  const query = useApi<any>('/trainer/profile');

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => (
        <>
          <PageHeader
            title="My profile"
            description="Your assignments and the permissions your administrator has granted."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Sessions conducted"
              value={num(data.sessionsConducted)}
              icon={<GraduationCap />}
            />
            <StatCard
              label="Average feedback"
              value={data.averageFeedback ?? '—'}
              outOf={5}
              icon={<Star />}
              tone="amber"
              hasData={data.averageFeedback != null}
              deltaLabel={`${num(data.feedbackEntries)} rating(s) from participants`}
            />
            <StatCard
              label="Active assignments"
              value={num(data.assignments.length)}
              icon={<MessageSquare />}
              tone="teal"
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardBody>
                  <DetailList
                    rows={[
                      { label: 'Name', value: data.name },
                      { label: 'Email', value: data.email },
                      { label: 'Designation', value: data.designation ?? '—' },
                      { label: 'Department', value: data.departmentName ?? '—' },
                    ]}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Permissions</CardTitle>
                    <CardSubtitle>Set by your institution administrator</CardSubtitle>
                  </div>
                  <ShieldCheck className="size-4 text-ink-3" aria-hidden />
                </CardHeader>
                <CardBody>
                  <ul className="space-y-2.5">
                    {Object.entries(ACCESS_LABELS).map(([key, label]) => {
                      // Absent means "not restricted" — the backend treats missing flags as allowed.
                      const granted = data.access?.[key] !== false;
                      return (
                        <li key={key} className="flex items-center gap-2.5 text-base">
                          {granted ? (
                            <Check className="size-4 shrink-0 text-success" aria-hidden />
                          ) : (
                            <X className="size-4 shrink-0 text-danger" aria-hidden />
                          )}
                          <span className="min-w-0 flex-1">{label}</span>
                          <Badge tone={granted ? 'success' : 'danger'}>
                            {granted ? 'Allowed' : 'Blocked'}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3.5 text-xs text-ink-3">
                    These are enforced on the server for every request — the buttons here are not
                    what decides it.
                  </p>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>My assignments</CardTitle>
                  <CardSubtitle>
                    Batch × module pairs your administrator assigned to you
                  </CardSubtitle>
                </div>
              </CardHeader>
              <TableWrap>
                <Table>
                  <caption className="sr-only">Batch and module assignments</caption>
                  <thead>
                    <Tr>
                      <Th>Batch</Th>
                      <Th>Module</Th>
                      <Th hideBelow="sm">Academic year</Th>
                      <Th align="right">State</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {data.assignments.map((row: any) => (
                      <Tr key={row.id}>
                        <Td className="font-semibold">{row.batchName}</Td>
                        <Td>{row.trainingModuleName}</Td>
                        <Td hideBelow="sm" className="text-ink-2">
                          {row.academicYear}
                        </Td>
                        <Td align="right">
                          <Badge tone={row.active ? 'success' : 'neutral'}>
                            {row.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              {data.assignments.length === 0 && (
                <CardBody>
                  <p className="py-4 text-center text-base text-ink-2">
                    You have no active batch assignments. Your administrator assigns these.
                  </p>
                </CardBody>
              )}
            </Card>
          </div>
        </>
      )}
    </AsyncSection>
  );
}
