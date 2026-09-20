'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  XCircle,
  Zap,
  Play,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { KeyboardHint } from '@/components/shared/misc';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { num } from '@/lib/format';

interface Option {
  id: string;
  text: string;
  tag?: string;
  skills?: string[];
}

interface Level {
  level: number;
  title: string;
  scenario: string;
  dialogue?: { speaker: string; line: string }[];
  question: string;
  options: Option[];
  objectives?: string[];
  hint?: string;
  timeLimitSeconds: number;
  skillsAssessed?: string[];
}

interface Result {
  score: number;
  xpEarned: number;
  skillDeltas: Record<string, number>;
  choices: { optionId: string; text: string; tag?: string; delta: number; feedback?: string; best: boolean }[];
  nextLevel: number | null;
  levelsTotal: number;
}

export default function GamePlayPage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const query = useApi<any>(`/student/games/${params.gameId}`);

  const [levelIndex, setLevelIndex] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [hintShown, setHintShown] = React.useState(false);
  const [hintsUsed, setHintsUsed] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  const levels: Level[] = query.data?.levels ?? [];
  const level = levels[levelIndex] ?? null;
  const remaining = level ? Math.max(0, level.timeLimitSeconds - elapsed) : 0;

  // The clock runs while a level is open; it stops once the answer is in.
  React.useEffect(() => {
    if (!level || result) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [level, result]);

  const submit = React.useCallback(
    async (optionId: string | null) => {
      if (!level || submitting) return;
      setSubmitting(true);
      try {
        const response = await api.post(`/student/games/${params.gameId}/attempts`, {
          level: level.level,
          choices: optionId ? [{ optionId }] : [],
          completed: true,
          comboMax: optionId ? 1 : 0,
          durationSeconds: elapsed,
          hintsUsed,
        });
        setResult(response.data as Result);
      } catch (caught) {
        toast.error((caught as ApiError).message);
      } finally {
        setSubmitting(false);
      }
    },
    [level, submitting, params.gameId, elapsed, hintsUsed],
  );

  // Keyboard shortcuts the API advertises under `accessibility.keyboardShortcuts`.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (result || !level) return;
      const numeric = Number(event.key);
      if (numeric >= 1 && numeric <= level.options.length) {
        setSelected(level.options[numeric - 1].id);
        return;
      }
      if (event.key.toLowerCase() === 'h' && level.hint) {
        setHintShown(true);
        setHintsUsed((value) => value + (hintShown ? 0 : 1));
      }
      if (event.key === 'Enter' && selected) void submit(selected);
      if (event.key === 'Escape') router.push('/student/games');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [level, selected, result, hintShown, submit, router]);

  function nextLevel() {
    if (!result?.nextLevel) return;
    setLevelIndex(result.nextLevel - 1);
    setSelected(null);
    setResult(null);
    setHintShown(false);
    setElapsed(0);
  }

  function replay() {
    setSelected(null);
    setResult(null);
    setHintShown(false);
    setHintsUsed(0);
    setElapsed(0);
  }

  return (
    <AsyncSection query={query} skeleton="detail">
      {(game) => (
        <div className="mx-auto max-w-[860px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/student/games">
                <ArrowLeft className="size-3.5" aria-hidden />
                Exit game
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">
                Level {level?.level ?? 1} of {levels.length}
              </Badge>
              <Badge tone={remaining < 30 ? 'danger' : 'indigo'}>
                <Timer className="size-3" aria-hidden />
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </Badge>
              <Badge tone="amber">+{game.xpReward} XP</Badge>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>{game.title}</CardTitle>
                <CardSubtitle>{level?.title ?? game.category}</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody>
              {game.gameUrl ? (
                <div className="space-y-4 py-4 text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo">
                    <Sparkles className="size-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-900">Playable Game Experience</h3>
                    <p className="max-w-md mx-auto text-xs text-slate-500">
                      This interactive challenge is hosted on our gamified execution environment. Click below to launch with automatic telemetry tracking.
                    </p>
                  </div>
                  <div className="pt-2 flex justify-center gap-3">
                    <Button asChild variant="primary" size="lg" className="px-6 shadow-md">
                      <a
                        href={game.gameUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          api.post(`/student/games/${params.gameId}/launch`).catch(() => {});
                        }}
                      >
                        <Play className="size-4 mr-2 text-white" />
                        Launch Game in New Tab
                      </a>
                    </Button>
                  </div>
                </div>
              ) : !level ? (
                <p className="py-8 text-center text-base text-ink-2">
                  This game has no levels published yet.
                </p>
              ) : result ? (
                /* ------------------------------------------------------ result */
                <div>
                  <div className="flex flex-wrap items-center gap-4 rounded-[12px] bg-app p-5">
                    <span className="flex size-11 items-center justify-center rounded-full bg-indigo text-white">
                      <Trophy className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-[160px] flex-1">
                      <p className="text-xs uppercase tracking-wider text-ink-2">Level score</p>
                      <p className="tnum text-[26px] font-bold leading-none">{num(result.score)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-ink-2">XP earned</p>
                      <p className="tnum flex items-center gap-1 text-[20px] font-bold leading-none">
                        <Zap className="size-4 text-amber" aria-hidden />+{result.xpEarned}
                      </p>
                    </div>
                  </div>

                  <h3 className="mt-5 text-md font-semibold">What your choice said</h3>
                  <ul className="mt-2.5 space-y-2.5">
                    {result.choices.map((choice) => (
                      <li
                        key={choice.optionId}
                        className={cn(
                          'rounded-[10px] border p-3.5',
                          choice.best
                            ? 'border-success bg-success-bg/50'
                            : choice.delta > 0
                              ? 'border-line bg-white'
                              : 'border-danger-bg bg-danger-bg/40',
                        )}
                      >
                        <p className="flex items-start gap-2 text-base font-semibold">
                          {choice.best ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                          ) : (
                            <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                          )}
                          {choice.text}
                        </p>
                        {choice.feedback && (
                          <p className="mt-1.5 pl-6 text-sm leading-relaxed text-ink-2">
                            {choice.feedback}
                          </p>
                        )}
                        {choice.tag && (
                          <p className="mt-1.5 pl-6">
                            <Badge tone="neutral">{choice.tag}</Badge>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>

                  {Object.keys(result.skillDeltas).length > 0 && (
                    <>
                      <h3 className="mt-5 text-md font-semibold">Skill movement</h3>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(result.skillDeltas).map(([skill, delta]) => (
                          <li key={skill}>
                            <Badge tone={delta >= 0 ? 'success' : 'danger'}>
                              {skill} {delta >= 0 ? '+' : ''}
                              {delta}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  <div className="mt-6 flex flex-wrap gap-2.5">
                    {result.nextLevel ? (
                      <Button variant="primary" onClick={nextLevel}>
                        Next level
                      </Button>
                    ) : (
                      <Button asChild variant="primary">
                        <Link href="/student/games">Back to games</Link>
                      </Button>
                    )}
                    <Button variant="secondary" onClick={replay}>
                      <RotateCcw className="size-3.5" aria-hidden />
                      Replay this level
                    </Button>
                  </div>
                </div>
              ) : (
                /* -------------------------------------------------------- play */
                <div>
                  <p className="rounded-[12px] bg-navy-950 p-5 text-base leading-relaxed text-white/85">
                    {level.scenario}
                  </p>

                  {level.dialogue && level.dialogue.length > 0 && (
                    <ul className="mt-4 space-y-2.5">
                      {level.dialogue.map((line, index) => (
                        <li key={index} className="rounded-[10px] bg-app px-3.5 py-2.5">
                          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                            {line.speaker}
                          </p>
                          <p className="mt-0.5 text-base text-ink-1">{line.line}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <fieldset className="mt-5">
                    <legend className="text-md font-semibold">{level.question}</legend>
                    <div className="mt-3 space-y-2">
                      {level.options.map((option, index) => (
                        <label
                          key={option.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-[10px] border p-3.5 transition-colors',
                            selected === option.id
                              ? 'border-indigo bg-indigo-50'
                              : 'border-line hover:bg-app',
                          )}
                        >
                          <input
                            type="radio"
                            name="option"
                            value={option.id}
                            checked={selected === option.id}
                            onChange={() => setSelected(option.id)}
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              'tnum mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] text-2xs font-bold',
                              selected === option.id
                                ? 'bg-indigo text-white'
                                : 'bg-app text-ink-2',
                            )}
                            aria-hidden
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 text-base">{option.text}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {level.hint && (
                    <div className="mt-4">
                      {hintShown ? (
                        <p className="flex items-start gap-2 rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-sm text-amber-dark">
                          <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {level.hint}
                        </p>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setHintShown(true);
                            setHintsUsed((value) => value + 1);
                          }}
                        >
                          <Lightbulb className="size-3.5" aria-hidden />
                          Show hint (costs 5 points)
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button
                      variant="primary"
                      disabled={!selected}
                      loading={submitting}
                      onClick={() => submit(selected)}
                    >
                      <Sparkles className="size-3.5" aria-hidden />
                      Submit answer
                    </Button>
                    {game.accessibility?.keyboardShortcuts && (
                      <KeyboardHint shortcuts={game.accessibility.keyboardShortcuts} />
                    )}
                  </div>

                  {level.objectives && level.objectives.length > 0 && (
                    <div className="mt-5 border-t border-line-soft pt-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-3">
                        What this level measures
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {(level.skillsAssessed ?? level.objectives).map((item) => (
                          <li key={item}>
                            <Badge tone="indigo">{item}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </AsyncSection>
  );
}
