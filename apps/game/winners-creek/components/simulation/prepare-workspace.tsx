"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { getPresentationDetail } from "@/lib/simulation/presentation-service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { ChevronLeft, ChevronRight, Play, FileText, Sun, AlertTriangle, Sparkles, RefreshCw } from "@/components/ui/icons";
import { formatDuration } from "@/lib/utils";
import { recommendedPaceLabel } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Detail = Awaited<ReturnType<typeof getPresentationDetail>>;
type ScriptMode = "ai_script" | "own_notes" | "none";

export function PrepareWorkspace({ detail }: { detail: Detail }) {
  const router = useRouter();
  const { session, presentation, slides, estimatedSpeakingSeconds } = detail;
  const [activeIndex, setActiveIndex] = useState(0);
  const [scriptMode, setScriptMode] = useState<ScriptMode>((presentation.scriptMode as ScriptMode) ?? "none");
  const [scriptContent, setScriptContent] = useState(presentation.scriptContent ?? "");
  const [savingScript, setSavingScript] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = slides[activeIndex];
  const pace = useMemo(
    () => recommendedPaceLabel(presentation.targetDurationSeconds, slides.length),
    [presentation.targetDurationSeconds, slides.length],
  );

  async function saveScript(mode: ScriptMode, content: string) {
    setSavingScript(true);
    try {
      await fetch(`/api/simulation/presentation/${session.id}/script`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptMode: mode, scriptContent: content }),
      });
    } finally {
      setSavingScript(false);
    }
  }

  async function handleGenerateAIScript() {
    setGeneratingScript(true);
    setError(null);
    try {
      const res = await fetch(`/api/simulation/presentation/${session.id}/script/generate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate AI script.");
      }
      const data = await res.json();
      setScriptContent(data.script ?? "");
      setScriptMode("ai_script");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI script.");
    } finally {
      setGeneratingScript(false);
    }
  }

  async function startPresentation() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/simulation/presentation/${session.id}/attempts`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not start the session.");
      }
      const { attempt } = await res.json();
      router.push(`/simulation/presentation/${session.id}/live?attempt=${attempt.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session.");
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-16 pt-4">
      <div className="flex flex-col gap-2">
        <Link href="/simulation" className="inline-flex w-fit items-center gap-1 text-sm text-ink-tertiary hover:text-ink-primary">
          <ChevronLeft className="h-3.5 w-3.5" /> Simulation Lab
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">{session.title}</h1>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{presentation.presentationType}</Badge>
            <Badge tone="neutral">{presentation.audience}</Badge>
            <Badge tone="accent">{session.evaluationMode.replace("_", " ")}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[160px_1fr_320px]">
        {/* Left: thumbnails */}
        <div className="flex gap-3 overflow-x-auto lg:flex-col lg:overflow-visible">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveIndex(i)}
              className={cn(
                "flex shrink-0 flex-col gap-1 overflow-hidden rounded-[var(--radius-sm)] border-2 text-left transition-colors",
                i === activeIndex ? "border-accent-500" : "border-transparent hover:border-border-strong",
              )}
            >
              <div className="relative flex aspect-video w-32 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-surface-2 lg:w-full">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt={`Slide ${i + 1} thumbnail`} className="h-full w-full object-cover" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-warning-500" />
                )}
              </div>
              <span className="text-xs text-ink-tertiary">Slide {i + 1}</span>
            </button>
          ))}
        </div>

        {/* Center: current slide */}
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            <div className="relative flex aspect-video items-center justify-center bg-surface-2">
              {active?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={active.imageUrl} alt={`Slide ${activeIndex + 1}`} className="h-full w-full object-contain" />
              ) : (
                <div className="flex max-w-lg flex-col items-center gap-2 p-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-warning-500" />
                  <p className="font-semibold text-ink-primary">Visual slide image unavailable</p>
                  <p className="text-xs text-ink-tertiary">Slide {activeIndex + 1} rasterization missing</p>
                </div>
              )}
            </div>
            <CardContent className="flex items-center justify-between p-4">
              <button
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((i) => i - 1)}
                className="inline-flex items-center gap-1 text-sm text-ink-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="text-xs text-ink-tertiary">
                {activeIndex + 1} / {slides.length}
              </span>
              <button
                disabled={activeIndex === slides.length - 1}
                onClick={() => setActiveIndex((i) => i + 1)}
                className="inline-flex items-center gap-1 text-sm text-ink-secondary disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>

          {active?.notes ? (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Speaker notes</p>
                <p className="mt-1 text-sm text-ink-secondary">{active.notes}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-ink-tertiary" />
                <p className="text-sm font-medium text-ink-primary">Presentation brief</p>
                <Badge tone="neutral">structural</Badge>
              </div>
              <p className="text-sm text-ink-secondary">
                This deck has {slides.length} slide{slides.length === 1 ? "" : "s"} targeting{" "}
                {formatDuration(presentation.targetDurationSeconds)}. Recommended pace: {pace}.
              </p>
              <p className="text-xs text-ink-tertiary">
                Presentation brief synthesized from slide structure, target duration, and recommended pace.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: info + script + start */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Slides" value={String(slides.length)} />
            <StatTile label="Target" value={formatDuration(presentation.targetDurationSeconds)} />
            <StatTile label="Est. speaking" value={formatDuration(estimatedSpeakingSeconds)} />
            <StatTile label="Pace" value={pace.split(" — ")[0]} />
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <p className="text-sm font-medium text-ink-primary">Script</p>
              <div className="flex flex-col gap-2">
                {(["ai_script", "own_notes", "none"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setScriptMode(mode);
                      saveScript(mode, scriptContent);
                    }}
                    className={cn(
                      "rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm transition-colors",
                      scriptMode === mode ? "border-accent-500 bg-accent-50 text-accent-700" : "border-border-default text-ink-secondary hover:border-border-strong",
                    )}
                  >
                    {mode === "ai_script" && "Use AI script"}
                    {mode === "own_notes" && "Use my own notes"}
                    {mode === "none" && "No script"}
                  </button>
                ))}
              </div>
              {scriptMode === "ai_script" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-secondary">Gemini AI Script</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={generatingScript}
                      onClick={handleGenerateAIScript}
                      className="gap-1.5 text-xs"
                    >
                      {generatingScript ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 text-accent-500" />
                          {scriptContent ? "Regenerate" : "Generate with AI"}
                        </>
                      )}
                    </Button>
                  </div>
                  {scriptContent ? (
                    <textarea
                      value={scriptContent}
                      onChange={(e) => setScriptContent(e.target.value)}
                      onBlur={() => saveScript("ai_script", scriptContent)}
                      rows={8}
                      className="rounded-[var(--radius-sm)] border border-border-default bg-surface-0 p-2 text-xs font-mono leading-relaxed text-ink-primary outline-none focus-visible:border-accent-500"
                    />
                  ) : (
                    <p className="rounded-[var(--radius-sm)] border border-dashed border-border-default p-3 text-center text-xs text-ink-tertiary">
                      Click &ldquo;Generate with AI&rdquo; to create a rehearsable slide-by-slide script powered by Gemini.
                    </p>
                  )}
                </div>
              ) : null}
              {scriptMode === "own_notes" ? (
                <textarea
                  value={scriptContent}
                  onChange={(e) => setScriptContent(e.target.value)}
                  onBlur={() => saveScript("own_notes", scriptContent)}
                  rows={6}
                  placeholder="Paste or write your notes here…"
                  className="rounded-[var(--radius-sm)] border border-border-default bg-surface-0 p-2 text-sm text-ink-primary outline-none focus-visible:border-accent-500"
                />
              ) : null}
              {savingScript ? <p className="text-xs text-ink-tertiary">Saving…</p> : null}
            </CardContent>
          </Card>

          {error ? <p className="text-sm text-danger-500">{error}</p> : null}

          <Button size="lg" disabled={starting || slides.length === 0} onClick={startPresentation} className="w-full">
            <Play className="h-4 w-4" />
            {starting ? "Starting…" : "Start Presentation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
