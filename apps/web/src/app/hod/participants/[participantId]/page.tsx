'use client';

import { ArrowLeft, Award, Star, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { RadialScore, attendanceColor } from '@/components/charts';
import { DetailList } from '@/components/shared/misc';
import { PageHeader } from '@/components/shared/page-header';
import { ScoreCard, SkillBreakdown } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { formatDate, num, pct } from '@/lib/format';

export default function ParticipantProfilePage() {
  const params = useParams<{ participantId: string }>();
  const query = useApi<any>(`/hod/participants/${params.participantId}`);

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => {
        const summary = data.summary;
        return (
          <>
            <PageHeader
              breadcrumbs={[
                { label: 'Participants', href: '/hod/participants' },
                { label: data.participant.name },
              ]}
              title={data.participant.name}
              description={`${data.participant.rollNumber} · ${data.participant.batchName ?? 'No batch'} · ${data.scope.departmentName}`}
              actions={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/hod/participants">
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Directory
                  </Link>
                </Button>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Session attendance"
                value={pct(summary.sessionAttendancePercent, 1)}
                icon={summary.aboveDepartmentAverage ? <TrendingUp /> : <TrendingDown />}
                tone={summary.sessionAttendancePercent >= 75 ? 'success' : 'amber'}
                deltaLabel={`${num(summary.sessionsAttended)} attended · ${num(summary.sessionsMissed)} missed of ${num(summary.sessionsTotal)}`}
              />
              <StatCard
                label="Average skill score"
                value={num(summary.averageSkillScore, 1)}
                outOf={100}
                icon={<Star />}
                tone="indigo"
                hasData={summary.averageSkillScore != null}
                deltaLabel={`Department average ${num(summary.departmentAverageSkillScore, 1)}`}
              />
              <StatCard
                label="Proficiency"
                value={summary.proficiency ?? '—'}
                icon={<Award />}
                tone="purple"
                deltaLabel={summary.band ? `Band: ${summary.band}` : undefined}
              />
              <StatCard
                label="Trainer feedback"
                value={summary.trainerFeedbackAverage ?? '—'}
                outOf={5}
                icon={<Star />}
                tone="amber"
                hasData={summary.trainerFeedbackAverage != null}
                deltaLabel={`${num(summary.feedbackEntries)} entr(ies)`}
              />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[290px_1fr]">
              <div className="space-y-5">
                <Card>
                  <CardBody className="text-center">
                    <Avatar
                      name={data.participant.name}
                      color={data.participant.avatarColor}
                      size={60}
                      className="mx-auto"
                    />
                    <div className="mt-4">
                      <RadialScore
                        value={data.readiness.score}
                        label="Readiness"
                        size={104}
                        thickness={9}
                      />
                    </div>
                    <p className="mt-2 text-sm text-ink-2">Readiness score</p>
                    {data.readiness.focusPillar && (
                      <Badge tone="amber" className="mt-2">
                        Focus: {data.readiness.focusPillar}
                      </Badge>
                    )}
                    <div className="mt-3.5 flex flex-wrap justify-center gap-2">
                      <StatusBadge status={data.participant.enrollmentStatus} />
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Attendance</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <p
                      className="tnum text-[24px] font-bold leading-none"
                      style={{ color: attendanceColor(summary.sessionAttendancePercent ?? 0) }}
                    >
                      {pct(summary.sessionAttendancePercent, 1)}
                    </p>
                    <p className="mt-1.5 text-sm text-ink-2">
                      {summary.aboveDepartmentAverage
                        ? 'Above the department average'
                        : 'Below the department average'}
                    </p>
                  </CardBody>
                </Card>
              </div>

              <div>
                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="personal">Personal</TabsTrigger>
                    <TabsTrigger value="assessments">Assessments</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback</TabsTrigger>
                    <TabsTrigger value="enrollment">Enrollment</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-5">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Pillar scores</CardTitle>
                          <CardSubtitle>Seven employability pillars</CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody>
                        <SkillBreakdown
                          pillars={data.pillarScores.map((pillar: any) => ({
                            ...pillar,
                            hasData: pillar.score != null,
                          }))}
                          showBand={false}
                        />
                      </CardBody>
                    </Card>

                    {data.rubricScores?.length > 0 && (
                      <Card>
                        <CardHeader>
                          <div>
                            <CardTitle>Rubric breakdown</CardTitle>
                            <CardSubtitle>Averaged across submitted evaluations</CardSubtitle>
                          </div>
                        </CardHeader>
                        <CardBody className="space-y-3.5">
                          {data.rubricScores.map((row: any) => (
                            <ScoreCard
                              key={row.criterion ?? row.label}
                              label={row.criterion ?? row.label}
                              value={row.average ?? row.score}
                              outOf={row.outOf ?? 5}
                            />
                          ))}
                        </CardBody>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="personal">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Personal details</CardTitle>
                          <CardSubtitle>
                            Training record only — academic marks stay in the academic LMS
                          </CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody>
                        <DetailList
                          rows={[
                            { label: 'Full name', value: data.personalDetails.fullName },
                            { label: 'Roll number', value: data.personalDetails.rollNumber },
                            { label: 'Training batch', value: data.personalDetails.trainingBatch },
                            { label: 'Department', value: data.personalDetails.department },
                            {
                              label: 'Guardian contact',
                              value: data.personalDetails.guardianContact ?? '—',
                            },
                            {
                              label: 'Enrollment status',
                              value: (
                                <StatusBadge status={data.personalDetails.enrollmentStatus} />
                              ),
                            },
                            { label: 'Enrolled by', value: data.personalDetails.enrolledBy ?? '—' },
                            {
                              label: 'Enrolled on',
                              value: data.personalDetails.enrolledOn
                                ? formatDate(data.personalDetails.enrolledOn)
                                : '—',
                            },
                          ]}
                        />
                      </CardBody>
                    </Card>
                  </TabsContent>

                  <TabsContent value="assessments">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Submitted evaluations</CardTitle>
                          <CardSubtitle>{data.assessments.length} record(s)</CardSubtitle>
                        </div>
                      </CardHeader>
                      <TableWrap>
                        <Table>
                          <caption className="sr-only">Submitted skill assessments</caption>
                          <thead>
                            <Tr>
                              <Th>Module</Th>
                              <Th hideBelow="sm">Assessed by</Th>
                              <Th hideBelow="md">Date</Th>
                              <Th align="right">Score</Th>
                            </Tr>
                          </thead>
                          <tbody>
                            {data.assessments.map((row: any) => (
                              <Tr key={row.id}>
                                <Td className="font-semibold">{row.trainingModuleName}</Td>
                                <Td hideBelow="sm" className="text-ink-2">
                                  {row.assessedByLabel ?? '—'}
                                </Td>
                                <Td hideBelow="md" className="tnum text-ink-2">
                                  {formatDate(row.createdAt)}
                                </Td>
                                <Td align="right" className="tnum font-semibold">
                                  {num(row.totalScore, 1)}
                                </Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      </TableWrap>
                      {data.assessments.length === 0 && (
                        <CardBody>
                          <p className="py-4 text-center text-base text-ink-2">
                            No submitted evaluations yet.
                          </p>
                        </CardBody>
                      )}
                    </Card>
                  </TabsContent>

                  <TabsContent value="feedback">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Trainer feedback</CardTitle>
                          <CardSubtitle>
                            {data.feedback.length} note(s) · average{' '}
                            {summary.trainerFeedbackAverage ?? '—'}/5
                          </CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody>
                        {data.feedback.length === 0 ? (
                          <p className="py-4 text-center text-base text-ink-2">
                            No written feedback recorded.
                          </p>
                        ) : (
                          <ul className="space-y-3">
                            {data.feedback.map((row: any) => (
                              <li key={row.id} className="rounded-[10px] bg-app px-3.5 py-3">
                                <p className="text-base leading-relaxed">{row.feedbackText}</p>
                                <p className="mt-1.5 text-xs text-ink-3">
                                  {row.trainerName} · {formatDate(row.createdAt)}
                                  {row.rating ? ` · ${row.rating}/5` : ''}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardBody>
                    </Card>
                  </TabsContent>

                  <TabsContent value="enrollment" className="space-y-5">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Enrollment history</CardTitle>
                          <CardSubtitle>
                            Append-only — a transfer closes one row and opens another
                          </CardSubtitle>
                        </div>
                      </CardHeader>
                      <TableWrap>
                        <Table>
                          <caption className="sr-only">Enrollment history</caption>
                          <thead>
                            <Tr>
                              <Th>Batch</Th>
                              <Th>Status</Th>
                              <Th hideBelow="sm">Type</Th>
                              <Th hideBelow="md">Enrolled by</Th>
                              <Th align="right">Date</Th>
                            </Tr>
                          </thead>
                          <tbody>
                            {data.enrollmentHistory.map((row: any) => (
                              <Tr key={row.id}>
                                <Td className="font-semibold">{row.batchName}</Td>
                                <Td>
                                  <StatusBadge status={row.status} />
                                </Td>
                                <Td hideBelow="sm" className="text-ink-2">
                                  {row.enrollmentType}
                                </Td>
                                <Td hideBelow="md" className="text-ink-2">
                                  {row.enrolledByLabel ?? '—'}
                                </Td>
                                <Td align="right" className="tnum">
                                  {formatDate(row.enrolledAt)}
                                </Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      </TableWrap>
                    </Card>

                    {data.enrollmentEvents?.length > 0 && (
                      <Card>
                        <CardHeader>
                          <div>
                            <CardTitle>Enrollment events</CardTitle>
                            <CardSubtitle>Who changed what, and why</CardSubtitle>
                          </div>
                        </CardHeader>
                        <CardBody>
                          <ul className="divide-y divide-line-soft">
                            {data.enrollmentEvents.map((event: any) => (
                              <li key={event.id} className="py-3">
                                <p className="text-base">
                                  <span className="font-semibold">{event.action}</span>
                                  {event.reason ? ` — ${event.reason}` : ''}
                                </p>
                                <p className="mt-0.5 text-xs text-ink-3">
                                  {event.byLabel ?? event.actorLabel ?? 'system'} ·{' '}
                                  {formatDate(event.at, true)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </CardBody>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </>
        );
      }}
    </AsyncSection>
  );
}
