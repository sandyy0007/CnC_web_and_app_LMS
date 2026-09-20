'use client';

import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { RadialScore } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { ScoreCard } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { formatDate, num } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Dimension {
  code: string;
  label: string;
  score: number;
  weight?: number;
  summary?: string;
  evidence?: { quote: string; note?: string; startSeconds?: number }[];
}

export default function PracticeFeedbackPage() {
  const params = useParams<{ sessionId: string }>();
  const query = useApi<any>(`/student/practice/sessions/${params.sessionId}/feedback`);
  const compare = useApi<any>(`/student/practice/sessions/${params.sessionId}/compare`, undefined, {
    enabled: Boolean(query.data?.ready),
  });

  // Scoring is a background job: poll gently until it lands, then stop.
  const ready = Boolean(query.data?.ready);
  const failed = query.data?.state === 'failed';
  React.useEffect(() => {
    if (ready || failed) return;
    const timer = setInterval(() => query.refetch(), 2500);
    return () => clearInterval(timer);
  }, [ready, failed, query]);

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => {
        if (!data.ready) {
          return (
            <div className="mx-auto max-w-[560px]">
              <Card>
                <CardBody className="py-12 text-center">
                  {failed ? (
                    <>
                      <p className="text-md font-semibold">We couldn&apos;t score this attempt</p>
                      <p className="mx-auto mt-1.5 max-w-[380px] text-base text-ink-2">
                        {data.message}
                      </p>
                      <Button asChild variant="primary" className="mt-5">
                        <Link href="/student/practice">Try another attempt</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Loader2 className="mx-auto size-6 animate-spin text-indigo" aria-hidden />
                      <p className="mt-4 text-md font-semibold">Analysing your answers</p>
                      <p className="mx-auto mt-1.5 max-w-[380px] text-base text-ink-2">
                        {data.message} You can leave this page — your feedback will be waiting in
                        the Practice Lab.
                      </p>
                      <Button asChild variant="secondary" className="mt-5">
                        <Link href="/student/practice">Back to the Practice Lab</Link>
                      </Button>
                    </>
                  )}
                </CardBody>
              </Card>
            </div>
          );
        }

        const dimensions: Dimension[] = data.dimensions ?? [];
        return (
          <div className="mx-auto max-w-[980px]">
            <PageHeader
              breadcrumbs={[
                { label: 'Practice Lab', href: '/student/practice' },
                { label: 'Feedback' },
              ]}
              title={`${data.session.practiceModeTitle} — attempt ${data.session.attemptNumber}`}
              description={`Completed ${formatDate(data.session.completedAt, true)}`}
              actions={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/student/practice">
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Practice Lab
                  </Link>
                </Button>
              }
            />

            <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
              {/* ------------------------------------------------------- score rail */}
              <div className="space-y-5">
                <Card>
                  <CardBody className="text-center">
                    <RadialScore value={data.overall} label="Overall" size={120} thickness={10} />
                    <p className="mt-3 text-md font-semibold">Overall score</p>
                    {data.delta != null && data.previousOverall != null && (
                      <p
                        className={cn(
                          'tnum mt-1 text-sm font-bold',
                          data.delta >= 0 ? 'text-success' : 'text-danger',
                        )}
                      >
                        {data.delta >= 0 ? '+' : ''}
                        {data.delta} vs your last attempt ({data.previousOverall})
                      </p>
                    )}
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-2xs text-ink-3">
                      <ShieldCheck className="size-3" aria-hidden />
                      {data.grounded
                        ? 'Every score below quotes your own words'
                        : 'Scored from your transcript'}
                      {data.modelVersion ? ` · ${data.modelVersion}` : ''}
                    </p>
                  </CardBody>
                </Card>

                {data.metrics && Object.keys(data.metrics).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Speech metrics</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <dl className="space-y-2.5">
                        {Object.entries(data.metrics).map(([key, value]) => (
                          <div key={key} className="flex items-baseline justify-between gap-3">
                            <dt className="text-sm capitalize text-ink-2">
                              {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                            </dt>
                            <dd className="tnum text-sm font-bold">
                              {typeof value === 'number' ? num(value, 1) : String(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </CardBody>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Trainer review</CardTitle>
                      <CardSubtitle>
                        {data.trainerReview.state === 'pending'
                          ? 'Awaiting your trainer'
                          : 'Reviewed'}
                      </CardSubtitle>
                    </div>
                    <UserCheck className="size-4 text-ink-3" aria-hidden />
                  </CardHeader>
                  <CardBody>
                    {data.trainerReview.comment ? (
                      <>
                        <p className="text-base leading-relaxed text-ink-1">
                          {data.trainerReview.comment}
                        </p>
                        <p className="mt-2 text-xs text-ink-3">
                          {data.trainerReview.reviewedBy}
                          {data.trainerReview.rating ? ` · rated ${data.trainerReview.rating}/5` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-2">
                        Your trainer has not added a comment on this attempt yet.
                      </p>
                    )}
                    {data.trainerReview.overridden && (
                      <p className="mt-3 rounded-[8px] bg-amber-50 px-3 py-2 text-sm text-amber-dark">
                        A trainer adjusted some AI scores on this attempt.
                        {data.trainerReview.overrideReason
                          ? ` Reason: ${data.trainerReview.overrideReason}`
                          : ''}
                      </p>
                    )}
                  </CardBody>
                </Card>
              </div>

              {/* ----------------------------------------------------------- detail */}
              <div>
                <Tabs defaultValue="dimensions">
                  <TabsList>
                    <TabsTrigger value="dimensions">Scores &amp; evidence</TabsTrigger>
                    <TabsTrigger value="plan">Improvement plan</TabsTrigger>
                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                    <TabsTrigger value="compare">Compare</TabsTrigger>
                  </TabsList>

                  <TabsContent value="dimensions" className="space-y-4">
                    {dimensions.map((dimension) => (
                      <Card key={dimension.code}>
                        <CardBody>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <h2 className="text-md font-semibold">{dimension.label}</h2>
                              {dimension.weight ? (
                                <p className="text-xs text-ink-3">
                                  {Math.round(dimension.weight * 100)}% of the overall score
                                </p>
                              ) : null}
                            </div>
                            <p className="tnum text-[20px] font-bold">
                              {Math.round(dimension.score)}
                              <span className="text-xs font-semibold text-ink-3">/100</span>
                            </p>
                          </div>
                          <div className="mt-3 h-[7px] overflow-hidden rounded-full bg-line-soft">
                            <div
                              className="h-full rounded-full bg-indigo"
                              style={{ width: `${Math.min(100, dimension.score)}%` }}
                            />
                          </div>
                          {dimension.summary && (
                            <p className="mt-3 text-base leading-relaxed text-ink-2">
                              {dimension.summary}
                            </p>
                          )}
                          {dimension.evidence && dimension.evidence.length > 0 && (
                            <ul className="mt-3.5 space-y-2.5">
                              {dimension.evidence.map((item, index) => (
                                <li
                                  key={index}
                                  className="rounded-[10px] border-l-[3px] border-indigo bg-app px-3.5 py-2.5"
                                >
                                  <p className="flex items-start gap-2 text-base italic text-ink-1">
                                    <Quote className="mt-0.5 size-3.5 shrink-0 text-indigo" aria-hidden />
                                    “{item.quote}”
                                  </p>
                                  {item.note && (
                                    <p className="mt-1.5 pl-5 text-sm text-ink-2">{item.note}</p>
                                  )}
                                  {item.startSeconds != null && (
                                    <p className="mt-1 flex items-center gap-1 pl-5 text-2xs text-ink-3">
                                      <Clock className="size-3" aria-hidden />
                                      at {Math.floor(item.startSeconds)}s
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </CardBody>
                      </Card>
                    ))}
                  </TabsContent>

                  <TabsContent value="plan" className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>What worked</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <ul className="space-y-2">
                            {(data.strengths ?? []).map((item: string) => (
                              <li key={item} className="flex items-start gap-2 text-base">
                                <CheckCircle2
                                  className="mt-0.5 size-3.5 shrink-0 text-success"
                                  aria-hidden
                                />
                                {item}
                              </li>
                            ))}
                            {!data.strengths?.length && (
                              <li className="text-sm text-ink-2">
                                Nothing stood out yet — keep practising.
                              </li>
                            )}
                          </ul>
                        </CardBody>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>Focus next</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <ul className="space-y-2">
                            {(data.focusNext ?? []).map((item: string) => (
                              <li key={item} className="flex items-start gap-2 text-base">
                                <Target className="mt-0.5 size-3.5 shrink-0 text-amber" aria-hidden />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </CardBody>
                      </Card>
                    </div>

                    {data.improvementChecklist?.length > 0 && (
                      <Card>
                        <CardHeader>
                          <div>
                            <CardTitle>Improvement checklist</CardTitle>
                            <CardSubtitle>Do these before your next attempt</CardSubtitle>
                          </div>
                        </CardHeader>
                        <CardBody>
                          <ol className="space-y-2.5">
                            {data.improvementChecklist.map((item: any, index: number) => (
                              <li
                                key={index}
                                className="flex items-start gap-3 rounded-[10px] bg-app px-3.5 py-3"
                              >
                                <span className="tnum mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo text-2xs font-bold text-white">
                                  {index + 1}
                                </span>
                                <span className="min-w-0 flex-1 text-base">
                                  {typeof item === 'string' ? item : item.label ?? item.text}
                                  {typeof item !== 'string' && item.why && (
                                    <span className="mt-0.5 block text-sm text-ink-2">
                                      {item.why}
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </CardBody>
                      </Card>
                    )}

                    {data.personalizedExercise && (
                      <Card className="border-amber/40 bg-amber-50/60">
                        <CardBody className="flex flex-wrap items-center gap-4">
                          <span className="flex size-10 items-center justify-center rounded-full bg-amber text-white">
                            <Sparkles className="size-5" aria-hidden />
                          </span>
                          <div className="min-w-[220px] flex-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-dark">
                              Your next exercise
                            </p>
                            <p className="mt-1 text-md font-semibold">
                              {data.personalizedExercise.title ?? data.personalizedExercise.exerciseTitle}
                            </p>
                            {data.personalizedExercise.reason && (
                              <p className="mt-0.5 text-sm text-ink-2">
                                {data.personalizedExercise.reason}
                              </p>
                            )}
                          </div>
                          <Button asChild variant="primary" size="sm">
                            <Link href="/student/practice">
                              Start it
                              <ChevronRight className="size-3.5" aria-hidden />
                            </Link>
                          </Button>
                        </CardBody>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="transcript">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Transcript</CardTitle>
                          <CardSubtitle>
                            {data.transcript?.wordCount ?? 0} words ·{' '}
                            {data.transcript?.provider === 'student_submitted'
                              ? 'typed by you'
                              : `transcribed (${data.transcript?.provider ?? 'unknown'})`}
                          </CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody>
                        {data.playbackUrl && (
                          <figure className="mb-4">
                            <figcaption className="mb-1.5 text-sm font-semibold">
                              Your recording
                            </figcaption>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <audio controls src={data.playbackUrl} className="w-full">
                              Your browser cannot play this recording.
                            </audio>
                            <p className="mt-1.5 text-2xs text-ink-3">
                              Private link, valid for a short time only.
                            </p>
                          </figure>
                        )}
                        {data.transcript?.text ? (
                          <p className="whitespace-pre-wrap rounded-[10px] bg-app p-4 text-base leading-relaxed">
                            {data.transcript.text}
                          </p>
                        ) : (
                          <p className="text-sm text-ink-2">No transcript is stored for this attempt.</p>
                        )}
                        <p className="mt-3 text-2xs text-ink-3">{data.privacyNotice}</p>
                      </CardBody>
                    </Card>
                  </TabsContent>

                  <TabsContent value="compare">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Against your previous attempt</CardTitle>
                          <CardSubtitle>
                            {compare.data?.previous
                              ? `Compared with ${formatDate(compare.data.previous.at)}`
                              : 'This is your first scored attempt in this mode'}
                          </CardSubtitle>
                        </div>
                        <TrendingUp className="size-4 text-ink-3" aria-hidden />
                      </CardHeader>
                      <CardBody className="space-y-3.5">
                        {(compare.data?.dimensions ?? []).map((row: any) => (
                          <div key={row.code}>
                            <ScoreCard
                              label={row.label}
                              value={row.current}
                              band={
                                row.delta == null
                                  ? undefined
                                  : `${row.delta >= 0 ? '+' : ''}${Math.round(row.delta)} vs previous (${Math.round(row.previous)})`
                              }
                            />
                          </div>
                        ))}
                        {!compare.data && (
                          <p className="text-sm text-ink-2">
                            Comparison will appear once this attempt is scored.
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        );
      }}
    </AsyncSection>
  );
}
