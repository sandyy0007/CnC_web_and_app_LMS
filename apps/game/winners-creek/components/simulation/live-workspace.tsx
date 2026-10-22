"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { getPresentationDetail } from "@/lib/simulation/presentation-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Mic, Play, Pause, Square, ChevronLeft, ChevronRight, AlertTriangle, FileText } from "@/components/ui/icons";
import { formatDuration, cn } from "@/lib/utils";
import { usePresentationSession } from "./use-presentation-session";
import { computeBasicSpeechMetrics } from "@/lib/analysis/speech";

type Detail = Awaited<ReturnType<typeof getPresentationDetail>>;

export function LiveWorkspace({ detail, attemptId }: { detail: Detail; attemptId: string }) {
  const router = useRouter();
  const { session, presentation, slides } = detail;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const showLiveMetrics = session.evaluationMode === "practice";

  // Preload all slide images immediately so network request fires on page load and images cache instantly
  useEffect(() => {
    slides.forEach((slide) => {
      if (slide.imageUrl) {
        const img = new Image();
        img.src = slide.imageUrl;
      }
    });
  }, [slides]);

  const {
    phase,
    countdown,
    stream,
    cameraOn,
    micOn,
    mediaError,
    speechSupported,
    finalTranscript,
    interimTranscript,
    elapsedMs,
    tabVisibilityChanges,
    activeSlideIndex,
    setCameraOn,
    setMicOn,
    start,
    pause,
    resume,
    end,
    goToSlide,
  } = usePresentationSession(slides.length);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const elapsedSeconds = elapsedMs / 1000;
  const target = presentation.targetDurationSeconds;
  const overTime = elapsedSeconds > target;

  const liveMetrics = computeBasicSpeechMetrics(`${finalTranscript} ${interimTranscript}`, Math.max(elapsedSeconds, 1));

  async function handleEnd() {
    const result = await end();
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (result.blob) {
        const form = new FormData();
        form.set("recording", result.blob, "presentation.webm");
        await fetch(`/api/simulation/presentation/${session.id}/attempts/${attemptId}/recording`, {
          method: "POST",
          body: form,
        });
      }
      const res = await fetch(`/api/simulation/presentation/${session.id}/attempts/${attemptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationSeconds: result.durationSeconds,
          tabVisibilityChanges: result.tabVisibilityChanges,
          transcript: result.transcript,
          slideEvents: result.slideEvents,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save your session.");
      }
      router.push(`/simulation/results/${attemptId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not save your session. Your recording is preserved locally — please try again.");
      setSubmitting(false);
    }
  }

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

  const activeSlide = slides[activeSlideIndex];

  return (
    <div ref={containerRef} className="flex min-h-screen flex-col bg-surface-0">
      {/* top bar */}
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink-primary">{session.title}</span>
          <Badge tone={session.evaluationMode === "practice" ? "neutral" : "warning"}>
            {session.evaluationMode.replace("_", " ")}
          </Badge>
        </div>
        <div className="flex items-center gap-3 font-mono text-lg tabular-nums">
          <span className={overTime ? "text-warning-500" : "text-ink-primary"}>{formatDuration(elapsedSeconds)}</span>
          <span className="text-ink-tertiary">/ {formatDuration(target)}</span>
        </div>
        <div className="flex items-center gap-2">
          <IconToggle active={cameraOn} onClick={() => setCameraOn((v) => !v)} label="Toggle camera">
            <Camera className="h-4 w-4" />
          </IconToggle>
          <IconToggle active={micOn} onClick={() => setMicOn((v) => !v)} label="Toggle microphone">
            <Mic className="h-4 w-4" />
          </IconToggle>
          <IconToggle active={fullscreen} onClick={toggleFullscreen} label="Toggle fullscreen">
            <span className="text-xs font-semibold">⤢</span>
          </IconToggle>
        </div>
      </div>

      {mediaError ? (
        <div className="flex items-center gap-2 bg-warning-100 px-6 py-2 text-sm text-warning-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {mediaError}
        </div>
      ) : null}
      {!speechSupported ? (
        <div className="flex items-center gap-2 bg-info-100 px-6 py-2 text-sm text-info-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Live transcription isn&apos;t supported in this browser (try Chrome). Your video will still record.
        </div>
      ) : null}

      {phase === "setup" ? (
        <ReadinessScreen
          stream={stream}
          videoRef={videoRef}
          cameraOn={cameraOn}
          micOn={micOn}
          onStart={start}
          slideCount={slides.length}
        />
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_320px]">
          {/* slide viewer + webcam */}
          <div className="flex flex-col gap-4">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-border-subtle bg-surface-2">
              {phase === "countdown" ? (
                <span className="text-7xl font-semibold text-ink-primary">{countdown || "Go"}</span>
              ) : activeSlide?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeSlide.imageUrl} alt={`Slide ${activeSlideIndex + 1}`} className="h-full w-full object-contain" />
              ) : (
                <div className="max-w-lg p-8 text-center text-ink-secondary">
                  <FileText className="mx-auto mb-2 h-6 w-6 text-ink-tertiary" />
                  {activeSlide?.textContent || "No text on this slide."}
                </div>
              )}

              <div className="absolute bottom-4 right-4 h-32 w-48 overflow-hidden rounded-[var(--radius-sm)] border border-border-strong bg-surface-1 shadow-lg">
                {stream ? (
                  <video ref={videoRef} autoPlay muted playsInline className={cn("h-full w-full object-cover", !cameraOn && "hidden")} />
                ) : null}
                {!cameraOn || !stream ? (
                  <div className="flex h-full w-full items-center justify-center text-ink-tertiary">
                    <Camera className="h-5 w-5" />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-border-subtle bg-surface-1 p-3">
              <button
                onClick={() => goToSlide(activeSlideIndex - 1)}
                disabled={activeSlideIndex === 0 || phase !== "live"}
                className="inline-flex items-center gap-1 text-sm text-ink-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev slide
              </button>
              <span className="text-xs text-ink-tertiary">
                Slide {activeSlideIndex + 1} / {slides.length}
              </span>
              <button
                onClick={() => goToSlide(activeSlideIndex + 1)}
                disabled={activeSlideIndex === slides.length - 1 || phase !== "live"}
                className="inline-flex items-center gap-1 text-sm text-ink-secondary disabled:opacity-40"
              >
                Next slide <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-3">
              {phase === "live" ? (
                <Button variant="secondary" onClick={pause}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              ) : phase === "paused" ? (
                <Button variant="secondary" onClick={resume}>
                  <Play className="h-4 w-4" /> Resume
                </Button>
              ) : null}
              {(phase === "live" || phase === "paused") && (
                <Button variant="danger" onClick={handleEnd} disabled={submitting}>
                  <Square className="h-4 w-4" /> {submitting ? "Saving…" : "End Presentation"}
                </Button>
              )}
            </div>
            {submitError ? <p className="text-center text-sm text-danger-500">{submitError}</p> : null}
          </div>

          {/* live performance panel */}
          <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border-subtle bg-surface-1 p-4">
            <p className="text-sm font-semibold text-ink-primary">Live Performance</p>
            {showLiveMetrics ? (
              <>
                <MetricRow label="Words spoken" value={String(liveMetrics.wordCount)} />
                <MetricRow label="Pace (WPM)" value={String(liveMetrics.wpm)} />
                <MetricRow label="Fillers detected" value={String(liveMetrics.fillerCount)} />
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-tertiary">Live transcript</p>
                  <p className="max-h-48 overflow-y-auto rounded-[var(--radius-sm)] bg-surface-2 p-2 text-xs text-ink-secondary">
                    {finalTranscript || interimTranscript ? (
                      <>
                        {finalTranscript}
                        <span className="text-ink-tertiary">{interimTranscript}</span>
                      </>
                    ) : (
                      <span className="text-ink-tertiary">Transcript will appear as you speak…</span>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-tertiary">
                Live metrics are hidden in {session.evaluationMode.replace("_", " ")} mode, as in a real
                assessment. You&apos;ll see full results after you finish.
              </p>
            )}
            <div className="mt-auto flex flex-col gap-1 border-t border-border-subtle pt-3 text-xs text-ink-tertiary">
              <span>Recording: {stream ? "camera + mic" : "unavailable — timer only"}</span>
              {session.evaluationMode !== "practice" ? <span>Tab switches detected: {tabVisibilityChanges}</span> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadinessScreen({
  stream,
  videoRef,
  cameraOn,
  micOn,
  onStart,
  slideCount,
}: {
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraOn: boolean;
  micOn: boolean;
  onStart: () => void;
  slideCount: number;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="h-56 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-border-default bg-surface-2">
        {stream && cameraOn ? (
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-tertiary">
            <Camera className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink-primary">Ready when you are</h2>
        <p className="max-w-md text-sm text-ink-secondary">
          {slideCount} slides loaded. You&apos;ll get a 3-second countdown, then your timer, transcript and
          recording begin.
        </p>
        <p className="mt-2 flex items-center justify-center gap-1 text-xs text-ink-tertiary">
          <AlertTriangle className="h-3.5 w-3.5" />
          Camera{" "}
          {stream ? (micOn ? "and microphone are on" : "is on, microphone is muted") : "and microphone are unavailable"} —
          your video is stored privately and visible only to you and your trainer.
        </p>
      </div>
      <Button size="lg" onClick={onStart}>
        <Play className="h-4 w-4" /> Start Presentation
      </Button>
    </div>
  );
}

function IconToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border transition-colors",
        active ? "border-accent-500 text-accent-600" : "border-border-default text-ink-tertiary",
      )}
    >
      {children}
    </button>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-tertiary">{label}</span>
      <span className="font-medium tabular-nums text-ink-primary">{value}</span>
    </div>
  );
}
