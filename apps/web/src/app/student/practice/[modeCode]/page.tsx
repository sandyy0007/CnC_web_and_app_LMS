'use client';

import { AlertTriangle, ArrowLeft, Lock, Play, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { iconFor } from '@/lib/icons';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

export default function PracticeBriefPage() {
  const params = useParams<{ modeCode: string }>();
  const router = useRouter();
  const query = useApi<any>('/student/practice/modes');

  const [difficulty, setDifficulty] = React.useState<string>('');
  const [consent, setConsent] = React.useState(true);
  const [starting, setStarting] = React.useState(false);
  // Stable across re-renders so a double click cannot create two attempts.
  const idempotencyKey = React.useMemo(
    () => `${params.modeCode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    [params.modeCode],
  );

  async function start() {
    setStarting(true);
    try {
      const response = await api.post('/student/practice/sessions', {
        practiceModeCode: params.modeCode,
        difficulty: difficulty || undefined,
        recordingConsent: consent,
        idempotencyKey,
      });
      router.push(`/student/practice/session/${response.data.id}`);
    } catch (caught) {
      toast.error((caught as ApiError).message);
      setStarting(false);
    }
  }

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => {
        const mode = data.modes.find((item: any) => item.code === params.modeCode);
        if (!mode) {
          return (
            <Card>
              <CardBody className="py-10 text-center">
                <p className="text-md font-semibold">That practice mode isn’t available</p>
                <Button asChild variant="primary" size="sm" className="mt-4">
                  <Link href="/student/practice">Back to the Practice Lab</Link>
                </Button>
              </CardBody>
            </Card>
          );
        }
        const Icon = iconFor(mode.icon);
        return (
          <div className="mx-auto max-w-[760px]">
            <PageHeader
              breadcrumbs={[
                { label: 'Practice Lab', href: '/student/practice' },
                { label: mode.title },
              ]}
              title={mode.title}
              description={mode.description}
              actions={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/student/practice">
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Back
                  </Link>
                </Button>
              }
            />

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Before you start</CardTitle>
                  <CardSubtitle>
                    {mode.questions?.length ?? 1} question(s) · about {mode.durationMinutes} minutes
                  </CardSubtitle>
                </div>
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
              </CardHeader>
              <CardBody>
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink-3">
                  What you&apos;ll be asked
                </h2>
                <ol className="mt-2.5 space-y-2.5">
                  {(mode.questions ?? []).map((question: any, index: number) => (
                    <li key={index} className="rounded-[10px] bg-app px-3.5 py-3">
                      <p className="text-base font-semibold">
                        {index + 1}. {question.text}
                      </p>
                      {question.guidance && (
                        <p className="mt-1 text-sm text-ink-2">{question.guidance}</p>
                      )}
                    </li>
                  ))}
                </ol>

                <h2 className="mt-6 text-sm font-bold uppercase tracking-wider text-ink-3">
                  Measured against
                </h2>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {(mode.pillars ?? []).map((pillar: string) => (
                    <li key={pillar}>
                      <Badge tone="indigo" className="capitalize">
                        {pillar.replace(/_/g, ' ')}
                      </Badge>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 max-w-[260px]">
                  <label
                    htmlFor="difficulty"
                    className="mb-1.5 block text-sm font-semibold"
                  >
                    Difficulty
                  </label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger id="difficulty">
                      <SelectValue placeholder={`Default (${mode.difficulty})`} />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((item) => (
                        <SelectItem key={item} value={item} className="capitalize">
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-6 rounded-[12px] border border-info-bg bg-info-bg/50 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-info">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    Recording consent
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                    Your audio is stored privately, encrypted, and reachable only through a
                    short-lived link issued to you and your trainer. It is used to produce your
                    feedback — nothing else — and you can withdraw consent at any time in Settings.
                  </p>
                  <label className="mt-3 flex items-start gap-2.5 text-base">
                    <Checkbox
                      checked={consent}
                      onCheckedChange={(value) => setConsent(Boolean(value))}
                      aria-describedby="consent-note"
                    />
                    <span>I consent to this session being recorded for feedback.</span>
                  </label>
                  {!consent && (
                    <p
                      id="consent-note"
                      className="mt-2.5 flex items-start gap-2 text-sm font-semibold text-amber-dark"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      Without consent you can still practise by typing your answer — audio capture
                      will be disabled.
                    </p>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  <Button variant="primary" size="lg" loading={starting} onClick={start}>
                    <Play className="size-4" aria-hidden />
                    Start session
                  </Button>
                  <p className="flex items-center gap-1.5 text-xs text-ink-3">
                    <Lock className="size-3" aria-hidden />
                    Attempt #{(mode.attempts ?? 0) + 1} · saved before anything is recorded
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>
        );
      }}
    </AsyncSection>
  );
}
