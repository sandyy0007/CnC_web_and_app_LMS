'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Loader2,
  Mic,
  Square,
  Type,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { duration } from '@/lib/format';

type Stage = 'warmup' | 'questions' | 'review';

export default function PracticeSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const query = useApi<any>(`/student/practice/sessions/${params.sessionId}`);

  const [stage, setStage] = React.useState<Stage>('warmup');
  const [index, setIndex] = React.useState(0);
  const [answered, setAnswered] = React.useState<Set<number>>(new Set());
  const [notes, setNotes] = React.useState<Record<number, string>>({});
  const [mode, setMode] = React.useState<'record' | 'type'>('record');
  const [recording, setRecording] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);
  const [uploaded, setUploaded] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const [recorderError, setRecorderError] = React.useState<string | null>(null);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);

  const session = query.data;
  const questions: { text: string; guidance?: string }[] = session?.questions ?? [];
  const consent = session?.recordingConsent !== false;

  React.useEffect(() => {
    if (!consent) setMode('type');
  }, [consent]);

  React.useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // Always release the microphone, even if the student navigates away mid-recording.
  React.useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function startRecording() {
    setRecorderError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void uploadRecording();
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
    } catch {
      setRecorderError(
        'We could not use your microphone. Allow microphone access in your browser, or type your answer instead.',
      );
      setMode('type');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  }

  async function uploadRecording() {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    if (!blob.size) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('sessionId', params.sessionId);
      form.append('mediaType', 'audio');
      form.append('durationSeconds', String(seconds));
      form.append('partial', 'false');
      form.append('file', blob, 'answer.webm');
      await api.upload('/student/practice/upload', form);
      setUploaded(true);
      setAnswered((current) => new Set(current).add(index));
      toast.success('Recording saved privately');
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setUploading(false);
    }
  }

  async function finish(partial: boolean) {
    const typed = Object.values(notes).filter(Boolean).join('\n\n').trim();
    if (!uploaded && !typed) {
      toast.error('Record or type at least one answer before finishing.');
      return;
    }
    setFinishing(true);
    try {
      const response = await api.post(
        `/student/practice/sessions/${params.sessionId}/complete`,
        {
          transcriptOverride: typed || undefined,
          answeredQuestions: Math.max(answered.size, typed ? Object.keys(notes).length : 0),
          durationSeconds: seconds,
          partial,
        },
      );
      router.push(response.data.feedbackHref ?? `/student/practice/session/${params.sessionId}/feedback`);
    } catch (caught) {
      toast.error((caught as ApiError).message);
      setFinishing(false);
    }
  }

  const stages: { code: Stage; label: string }[] = [
    { code: 'warmup', label: 'Warm-up' },
    { code: 'questions', label: 'Questions' },
    { code: 'review', label: 'Review & finish' },
  ];

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => (
        <div className="mx-auto max-w-[820px]">
          <PageHeader
            breadcrumbs={[
              { label: 'Practice Lab', href: '/student/practice' },
              { label: data.practiceModeTitle },
            ]}
            title={data.practiceModeTitle}
            description={`Attempt ${data.attemptNumber} · ${data.difficulty ?? ''}`}
            actions={
              <Badge tone={recording ? 'danger' : 'neutral'} dot={recording}>
                {recording ? 'Recording' : 'Not recording'} · {duration(seconds)}
              </Badge>
            }
          />

          {/* Stage rail */}
          <ol className="mb-5 flex flex-wrap gap-2">
            {stages.map((item, position) => {
              const currentPosition = stages.findIndex((entry) => entry.code === stage);
              const state =
                position < currentPosition
                  ? 'done'
                  : position === currentPosition
                    ? 'current'
                    : 'todo';
              return (
                <li
                  key={item.code}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold',
                    state === 'current'
                      ? 'border-indigo bg-indigo-50 text-indigo-600'
                      : state === 'done'
                        ? 'border-success-bg bg-success-bg text-success'
                        : 'border-line bg-white text-ink-3',
                  )}
                >
                  {state === 'done' ? (
                    <CheckCircle2 className="size-3.5" aria-hidden />
                  ) : (
                    <Circle className="size-3.5" aria-hidden />
                  )}
                  {item.label}
                </li>
              );
            })}
          </ol>

          {stage === 'warmup' && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Warm-up</CardTitle>
                  <CardSubtitle>30 seconds to settle before the first question</CardSubtitle>
                </div>
              </CardHeader>
              <CardBody>
                <ul className="space-y-2.5 text-base text-ink-2">
                  {[
                    'Sit where you will not be interrupted, and check your microphone.',
                    'Speak in full sentences — the score comes from what you actually say.',
                    'Structure beats speed: context, then action, then result.',
                    'You can stop and finish at any point; a partial attempt is still scored.',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <ArrowRight className="mt-1 size-3.5 shrink-0 text-indigo" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
                <Button
                  variant="primary"
                  className="mt-5"
                  onClick={() => setStage('questions')}
                >
                  I&apos;m ready
                  <ChevronRight className="size-3.5" aria-hidden />
                </Button>
              </CardBody>
            </Card>
          )}

          {stage === 'questions' && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>
                    Question {index + 1} of {questions.length}
                  </CardTitle>
                  <CardSubtitle>
                    {answered.size} answered · {questions.length - answered.size} left
                  </CardSubtitle>
                </div>
                <div className="flex gap-1.5" role="group" aria-label="Answer format">
                  <Button
                    variant={mode === 'record' ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={!consent}
                    onClick={() => setMode('record')}
                  >
                    <Mic className="size-3.5" aria-hidden />
                    Speak
                  </Button>
                  <Button
                    variant={mode === 'type' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setMode('type')}
                  >
                    <Type className="size-3.5" aria-hidden />
                    Type
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <p className="rounded-[12px] border border-line bg-surface-muted p-5 text-md leading-relaxed text-ink-1 dark:border-transparent dark:bg-navy-950 dark:text-white">
                  {questions[index]?.text}
                </p>
                {questions[index]?.guidance && (
                  <p className="mt-2.5 text-sm text-ink-2">
                    Hint: {questions[index]?.guidance}
                  </p>
                )}

                {mode === 'record' ? (
                  <div className="mt-5 flex flex-col items-center rounded-[12px] border border-line bg-app py-8">
                    <button
                      type="button"
                      onClick={recording ? stopRecording : startRecording}
                      disabled={uploading}
                      aria-label={recording ? 'Stop recording' : 'Start recording'}
                      className={cn(
                        'flex size-16 items-center justify-center rounded-full text-white transition-transform hover:scale-105',
                        recording ? 'animate-pulse bg-danger' : 'bg-indigo',
                      )}
                    >
                      {recording ? (
                        <Square className="size-6" aria-hidden />
                      ) : (
                        <Mic className="size-7" aria-hidden />
                      )}
                    </button>
                    <p className="tnum mt-3.5 text-[18px] font-bold">{duration(seconds)}</p>
                    <p className="mt-1 text-sm text-ink-2">
                      {uploading
                        ? 'Uploading your answer…'
                        : recording
                          ? 'Recording — press to stop and save'
                          : uploaded
                            ? 'Answer saved. Record another or move on.'
                            : 'Press to start recording'}
                    </p>
                    {uploading && (
                      <Loader2 className="mt-2 size-4 animate-spin text-indigo" aria-hidden />
                    )}
                    {recorderError && (
                      <p
                        role="alert"
                        className="mt-3 flex max-w-[420px] items-start gap-2 px-4 text-center text-sm font-semibold text-danger"
                      >
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {recorderError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-5">
                    <label htmlFor="typed-answer" className="mb-1.5 block text-sm font-semibold">
                      Your answer
                    </label>
                    <Textarea
                      id="typed-answer"
                      rows={7}
                      value={notes[index] ?? ''}
                      onChange={(event) => {
                        setNotes((current) => ({ ...current, [index]: event.target.value }));
                        if (event.target.value.trim()) {
                          setAnswered((current) => new Set(current).add(index));
                        }
                      }}
                      placeholder="Write your answer as you would say it out loud…"
                    />
                    <p className="mt-1.5 text-xs text-ink-3">
                      Typed answers are scored on the same six dimensions, from the words you wrote.
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={index === 0 || recording}
                      onClick={() => setIndex((value) => Math.max(0, value - 1))}
                    >
                      <ChevronLeft className="size-3.5" aria-hidden />
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={index >= questions.length - 1 || recording}
                      onClick={() =>
                        setIndex((value) => Math.min(questions.length - 1, value + 1))
                      }
                    >
                      Next question
                      <ChevronRight className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={recording || uploading}
                    onClick={() => setStage('review')}
                  >
                    Go to review
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {stage === 'review' && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Review &amp; finish</CardTitle>
                  <CardSubtitle>
                    Scoring runs in the background — you will not be kept waiting
                  </CardSubtitle>
                </div>
              </CardHeader>
              <CardBody>
                <dl className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['Questions answered', `${answered.size} of ${questions.length}`],
                    ['Time spent', duration(seconds)],
                    ['Recording', uploaded ? 'Saved privately' : 'None'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[10px] bg-app px-3.5 py-3">
                      <dt className="text-xs text-ink-3">{label}</dt>
                      <dd className="mt-0.5 text-base font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>

                {Object.values(notes).some(Boolean) && (
                  <>
                    <h2 className="mt-5 text-sm font-bold uppercase tracking-wider text-ink-3">
                      What will be scored
                    </h2>
                    <ul className="mt-2 space-y-2">
                      {questions.map((question, position) =>
                        notes[position]?.trim() ? (
                          <li key={position} className="rounded-[10px] bg-app px-3.5 py-3">
                            <p className="text-sm font-semibold">{question.text}</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">
                              {notes[position]}
                            </p>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </>
                )}

                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Button variant="primary" loading={finishing} onClick={() => finish(false)}>
                    <Upload className="size-3.5" aria-hidden />
                    Finish and get feedback
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={finishing}
                    onClick={() => finish(true)}
                  >
                    Finish as partial attempt
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/student/practice">Leave without finishing</Link>
                  </Button>
                </div>
                <p className="mt-3 text-xs text-ink-3">
                  A partial attempt is kept and scored on what you did answer — nothing is thrown
                  away.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </AsyncSection>
  );
}
