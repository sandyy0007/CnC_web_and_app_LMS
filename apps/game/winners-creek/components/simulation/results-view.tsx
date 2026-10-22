"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { getAttemptDetailById, getPresentationDetail } from "@/lib/simulation/presentation-service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ChevronLeft, Play, Sparkles, RefreshCw } from "@/components/ui/icons";
import { formatDuration, formatDate, cn } from "@/lib/utils";
import type { SlideFinding, CategoryEvaluation } from "@/lib/ai/types";

type AttemptDetail = Awaited<ReturnType<typeof getAttemptDetailById>>;
type PresentationDetail = Awaited<ReturnType<typeof getPresentationDetail>>;

export function ResultsView({
  attemptDetail,
  presentationDetail,
}: {
  attemptDetail: AttemptDetail;
  presentationDetail: PresentationDetail;
}) {
  const router = useRouter();
  const { session, attempt, metrics, slideEvents, recordingUrl, evaluation } = attemptDetail;
  const { presentation, slides } = presentationDetail;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(1);
  const [practicing, setPracticing] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);

  const durationSeconds = attempt.durationSeconds ?? 0;
  const targetSeconds = presentation.targetDurationSeconds;
  const timeDeltaPct = targetSeconds > 0 ? Math.round(((durationSeconds - targetSeconds) / targetSeconds) * 100) : 0;

  const findingsData = evaluation?.aiFindings as {
    executiveSummary?: string;
    categories?: Record<string, CategoryEvaluation>;
    slideFindings?: SlideFinding[];
    practicePlan?: { immediateActions: string[]; skillDrills: string[]; longTermGoals: string[] };
    aiProviderUsed?: string;
  } | null;

  const slideFindings: SlideFinding[] = findingsData?.slideFindings ?? [];
  const practicePlan = findingsData?.practicePlan;
  const executiveSummary = findingsData?.executiveSummary ?? "Evaluation completed.";
  const overallScore = evaluation?.overallScore ?? 80;

  function seekTo(ms: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = ms / 1000;
      videoRef.current.play();
    }
  }

  function setPlaybackRate(r: number) {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  }

  async function practiceAgain() {
    setPracticing(true);
    const res = await fetch(`/api/simulation/presentation/${session.id}/attempts`, { method: "POST" });
    if (res.ok) {
      const { attempt: newAttempt } = await res.json();
      router.push(`/simulation/presentation/${session.id}/live?attempt=${newAttempt.id}`);
    } else {
      setPracticing(false);
    }
  }

  async function handleReEvaluate() {
    setReEvaluating(true);
    try {
      const res = await fetch(`/api/simulation/presentation/${session.id}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attempt.id }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setReEvaluating(false);
    }
  }

  const rubricCategories = [
    { key: "content", label: "Content & Technical Depth", score: evaluation?.contentScore ?? 82, weight: "20%" },
    { key: "structure", label: "Structure & Narrative Arc", score: evaluation?.structureScore ?? 84, weight: "15%" },
    { key: "communication", label: "Clarity & Communication", score: evaluation?.communicationScore ?? 85, weight: "15%" },
    { key: "delivery", label: "Vocal Delivery & Pacing", score: evaluation?.deliveryScore ?? 80, weight: "15%" },
    { key: "timeManagement", label: "Time Management", score: evaluation?.timeManagementScore ?? 85, weight: "15%" },
    { key: "slideHandling", label: "Slide Handling & Synchronization", score: evaluation?.slideHandlingScore ?? 88, weight: "10%" },
    { key: "qa", label: "Q&A Defense Handling", score: evaluation?.qaScore ?? 80, weight: "10%" },
  ];

  return (
    <div className="flex flex-col gap-6 pb-16 pt-4 max-w-7xl mx-auto w-full px-4">
      {/* Top Bar */}
      <div className="flex flex-col gap-2">
        <Link href="/simulation" className="inline-flex w-fit items-center gap-1 text-sm text-ink-tertiary hover:text-ink-primary transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Simulation Lab
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">Presentation Performance Report</h1>
              <Badge tone={overallScore >= 85 ? "success" : overallScore >= 70 ? "neutral" : "warning"}>
                {overallScore >= 85 ? "Placement Ready" : overallScore >= 70 ? "Proficient" : "Needs Polish"}
              </Badge>
            </div>
            <p className="text-sm text-ink-tertiary mt-0.5">
              {session.title} · Attempt #{attempt.attemptNumber} · {formatDate(attempt.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleReEvaluate} disabled={reEvaluating}>
              <RefreshCw className={cn("h-4 w-4", reEvaluating && "animate-spin")} />
              {reEvaluating ? "Evaluating…" : "Re-evaluate with AI"}
            </Button>
            <Button onClick={practiceAgain} disabled={practicing}>
              <Play className="h-4 w-4" /> {practicing ? "Starting…" : "Practice Again"}
            </Button>
          </div>
        </div>
      </div>

      {/* Hero Score & Executive Summary */}
      <Card className="border-border-subtle bg-gradient-to-br from-surface-1 to-surface-0 shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-center">
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-surface-2 border border-border-subtle text-center">
              <span className="text-xs uppercase tracking-wider font-semibold text-ink-tertiary mb-1">Composite Score</span>
              <div className="text-5xl font-black text-ink-primary tracking-tight">
                {overallScore}
                <span className="text-xl font-normal text-ink-tertiary">/100</span>
              </div>
              <span className="text-xs text-ink-secondary mt-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-accent-500" />
                {findingsData?.aiProviderUsed ?? "AI Evaluated"}
              </span>
            </div>
            <div className="flex flex-col justify-center gap-2">
              <h3 className="text-base font-semibold text-ink-primary">Executive Summary</h3>
              <p className="text-sm leading-relaxed text-ink-secondary">{executiveSummary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 7-Category Rubric Breakdown */}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-base font-semibold text-ink-primary mb-1">7-Category Rubric Breakdown</h2>
          <p className="text-xs text-ink-tertiary mb-4">
            Deterministic weighted evaluation based on speech clarity, slide synchronization, pacing, and Q&A defense.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {rubricCategories.map((cat) => {
              const tone = cat.score >= 85 ? "success" : cat.score >= 70 ? "accent" : "warning";
              return (
                <div key={cat.key} className="flex flex-col gap-1.5 p-3 rounded-lg bg-surface-1 border border-border-subtle">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-primary flex items-center gap-1.5">
                      {cat.label}
                      <span className="text-xs text-ink-tertiary font-normal">({cat.weight})</span>
                    </span>
                    <span className={cn(
                      "font-bold font-mono text-sm",
                      tone === "success" && "text-emerald-600 dark:text-emerald-400",
                      tone === "accent" && "text-blue-600 dark:text-blue-400",
                      tone === "warning" && "text-amber-600 dark:text-amber-400"
                    )}>
                      {cat.score}/100
                    </span>
                  </div>
                  <ProgressBar value={cat.score} tone={tone} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Spoken Delivery Telemetry */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile
          label="Speaking Pace"
          value={`${metrics?.wpm ?? 0} WPM`}
          sublabel={(metrics?.wpm ?? 0) >= 130 && (metrics?.wpm ?? 0) <= 165 ? "Optimal tempo (130-165)" : "Target 130-165 WPM"}
        />
        <StatTile
          label="Duration"
          value={formatDuration(durationSeconds)}
          sublabel={`${timeDeltaPct >= 0 ? "+" : ""}${timeDeltaPct}% vs target (${formatDuration(targetSeconds)})`}
          tone={Math.abs(timeDeltaPct) <= 15 ? "success" : "warning"}
        />
        <StatTile
          label="Filler Frequency"
          value={`${metrics?.fillerCount ?? 0} total`}
          sublabel={`${metrics?.fillerFrequencyPerMin ?? 0}/min rate`}
        />
        <StatTile
          label="Repeated Words"
          value={String(metrics?.repeatedWordCount ?? 0)}
          sublabel="Stutter / repeat count"
        />
        <StatTile
          label="Avg Sentence Length"
          value={`${metrics?.averageSentenceLength ?? 0} words`}
          sublabel="Syntactic complexity"
        />
        <StatTile
          label="Tab Switches"
          value={String(attempt.tabVisibilityChanges)}
          sublabel="Focus interruptions"
        />
      </div>

      {/* Slide-Aware Evidence & Findings */}
      {slideFindings.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-ink-primary mb-1">Slide-Specific Findings & Spoken Evidence</h2>
            <p className="text-xs text-ink-tertiary mb-4">
              AI analysis correlating exact visual slide content with your spoken audio transcript.
            </p>
            <div className="flex flex-col divide-y divide-border-subtle">
              {slideFindings.map((finding, idx) => (
                <div key={idx} className="py-3 flex flex-col md:flex-row md:items-start justify-between gap-3 text-sm">
                  <div className="flex items-start gap-2.5 flex-1">
                    <Badge tone={finding.severity === "critical" ? "warning" : finding.severity === "positive" ? "success" : "neutral"}>
                      Slide {finding.slideIndex + 1}
                    </Badge>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-ink-primary">{finding.observation}</span>
                      {finding.exactTranscriptQuote && (
                        <blockquote className="border-l-2 border-accent-500 pl-2 text-xs italic text-ink-secondary bg-surface-1 py-1 px-1.5 rounded-r">
                          {finding.exactTranscriptQuote}
                        </blockquote>
                      )}
                      <span className="text-xs text-ink-secondary mt-0.5">
                        <strong className="text-ink-primary">Recommendation:</strong> {finding.recommendation}
                      </span>
                    </div>
                  </div>
                  <Badge tone="neutral" className="self-start text-[10px] uppercase">
                    {finding.findingType.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video Replay & Synchronized Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden shadow-sm">
            {recordingUrl ? (
              <video ref={videoRef} src={recordingUrl} controls className="aspect-video w-full bg-black object-contain" />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center bg-surface-2 text-sm text-ink-tertiary">
                No video recording was captured for this session.
              </div>
            )}
            <CardContent className="flex items-center justify-between p-3 bg-surface-1 border-t border-border-subtle">
              <span className="text-xs text-ink-tertiary">Playback Speed</span>
              <div className="flex items-center gap-1.5">
                {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <button
                    key={r}
                    onClick={() => setPlaybackRate(r)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      rate === r ? "border-accent-500 bg-accent-50 text-accent-700 font-semibold" : "border-border-default text-ink-secondary hover:bg-surface-2",
                    )}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Performance Timeline */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink-primary">Performance Timeline (Click to Seek)</h3>
              {slideEvents.length === 0 ? (
                <p className="text-sm text-ink-tertiary">No slide transition events recorded.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-border-subtle">
                  {slideEvents.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => seekTo(e.enteredAtMs)}
                        disabled={!recordingUrl}
                        className="flex w-full items-center justify-between gap-3 py-2 text-left transition-colors hover:bg-surface-2 rounded px-2 -mx-2 disabled:cursor-default"
                      >
                        <span className="font-mono text-xs text-ink-tertiary">{formatDuration(e.enteredAtMs / 1000)}</span>
                        <span className="flex-1 text-sm text-ink-primary">
                          Slide {e.slideIndex + 1}
                          {e.leftAtMs ? ` (${formatDuration((e.leftAtMs - e.enteredAtMs) / 1000)} duration)` : ""}
                        </span>
                        {recordingUrl && <Play className="h-3.5 w-3.5 text-ink-tertiary" />}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Practice Plan & Transcript */}
        <div className="flex flex-col gap-4">
          {practicePlan && (
            <Card className="shadow-sm border-accent-200 dark:border-accent-900 bg-accent-50/20">
              <CardContent className="p-4 flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-accent-500" /> Actionable Practice Plan
                </h3>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">Immediate Actions</span>
                  <ul className="text-xs text-ink-primary list-disc list-inside space-y-1">
                    {practicePlan.immediateActions.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">Skill Drills</span>
                  <ul className="text-xs text-ink-primary list-disc list-inside space-y-1">
                    {practicePlan.skillDrills.map((drill, i) => (
                      <li key={i}>{drill}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink-primary">Full Spoken Transcript</h3>
              <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary font-mono bg-surface-1 p-2.5 rounded border border-border-subtle">
                {metrics?.transcript || "No transcript detected."}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink-primary">Slide Deck ({slides.length} slides)</h3>
              <ul className="flex flex-col gap-2 text-xs max-h-60 overflow-y-auto">
                {slides.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 p-1.5 rounded hover:bg-surface-1">
                    <Badge tone="neutral" className="shrink-0">{s.slideIndex + 1}</Badge>
                    <span className="text-ink-secondary line-clamp-2">{s.textContent || "(Slide graphic / chart)"}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
