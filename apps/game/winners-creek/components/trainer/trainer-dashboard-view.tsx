"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import {
  Mic,
  Briefcase,
  ChevronRight,
  Sliders,
  CheckCircle,
  X,
} from "@/components/ui/icons";
import { formatDate } from "@/lib/utils";

interface SessionRow {
  sessionId: string;
  title: string;
  type: string;
  status: string;
  evaluationMode: string;
  createdAt: Date;
  studentName: string;
  studentEmail: string;
  latestAttemptId: string | null;
  durationSeconds: number | null;
}

interface OverviewData {
  totalStudents: number;
  totalSessions: number;
}

export function TrainerDashboardView({
  sessions,
  overview,
}: {
  sessions: SessionRow[];
  overview: OverviewData;
}) {
  const [filterType, setFilterType] = useState<"all" | "presentation" | "interview">("all");
  const [search, setSearch] = useState("");
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [trainerComment, setTrainerComment] = useState("");
  const [scoreOverride, setScoreOverride] = useState<number | "">("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const filteredSessions = sessions.filter((s) => {
    if (filterType !== "all" && s.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.studentName.toLowerCase().includes(q) ||
        s.studentEmail.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function submitTrainerFeedback() {
    if (!activeSession || !trainerComment.trim()) return;
    setSubmittingFeedback(true);
    setFeedbackSuccess(false);

    try {
      const res = await fetch("/api/trainer/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: activeSession.type === "presentation" ? "presentation_attempt" : "interview_session",
          targetId: activeSession.latestAttemptId ?? activeSession.sessionId,
          comment: trainerComment.trim(),
          scoreOverride: scoreOverride !== "" ? { overall: Number(scoreOverride) } : undefined,
        }),
      });

      if (res.ok) {
        setFeedbackSuccess(true);
        setTimeout(() => {
          setActiveSession(null);
          setTrainerComment("");
          setScoreOverride("");
          setFeedbackSuccess(false);
        }, 1200);
      }
    } finally {
      setSubmittingFeedback(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-16 pt-4 max-w-7xl mx-auto w-full px-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Trainer Command Center</h1>
          <p className="text-sm text-ink-tertiary">
            Monitor student simulation attempts, review AI evaluations, and issue manual feedback overrides.
          </p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile label="Enrolled Students" value={String(overview.totalStudents)} sublabel="Active cohort" />
        <StatTile label="Total Simulations" value={String(overview.totalSessions)} sublabel="Across all tracks" />
        <StatTile
          label="Presentations"
          value={String(sessions.filter((s) => s.type === "presentation").length)}
          sublabel="Slide deck briefs"
        />
        <StatTile
          label="Interviews"
          value={String(sessions.filter((s) => s.type === "interview").length)}
          sublabel="STAR behavioral sessions"
        />
      </div>

      {/* Filter and Search Bar */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {(["all", "presentation", "interview"] as const).map((t) => (
              <Button
                key={t}
                variant={filterType === t ? "primary" : "secondary"}
                size="sm"
                onClick={() => setFilterType(t)}
                className="capitalize"
              >
                {t === "all" ? "All Simulations" : t}
              </Button>
            ))}
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Search student or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border-default bg-surface-0 px-3 py-1.5 text-xs text-ink-primary focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2/60 border-b border-border-default text-ink-tertiary uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Simulation Title</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-ink-secondary">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-tertiary">
                      No matching simulation sessions found.
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((s) => (
                    <tr key={s.sessionId} className="hover:bg-surface-1/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-ink-primary">{s.studentName}</div>
                        <div className="text-[11px] text-ink-tertiary">{s.studentEmail}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-ink-primary">{s.title}</td>
                      <td className="py-3 px-4">
                        <Badge tone="neutral" className="capitalize flex items-center gap-1 w-fit">
                          {s.type === "presentation" ? <Mic className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}
                          {s.type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 capitalize font-mono text-[11px]">{s.evaluationMode.replace("_", " ")}</td>
                      <td className="py-3 px-4">{formatDate(s.createdAt)}</td>
                      <td className="py-3 px-4">
                        <Badge tone={s.status === "completed" ? "success" : "neutral"} className="capitalize">
                          {s.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setActiveSession(s)}
                          >
                            <Sliders className="h-3 w-3" /> Feedback
                          </Button>
                          {s.latestAttemptId && (
                            <Link href={`/simulation/results/${s.latestAttemptId}`}>
                              <Button size="sm" variant="ghost">
                                View <ChevronRight className="h-3 w-3 ml-0.5" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Trainer Feedback & Score Override Modal */}
      {activeSession && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-0 border border-border-default rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div>
                <h3 className="text-base font-semibold text-ink-primary">Trainer Review & Feedback</h3>
                <p className="text-xs text-ink-tertiary">
                  {activeSession.studentName} — {activeSession.title}
                </p>
              </div>
              <button
                onClick={() => setActiveSession(null)}
                className="p-1 rounded-md text-ink-tertiary hover:bg-surface-2 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-ink-secondary">
                Trainer Comments & Recommendations:
              </label>
              <textarea
                rows={4}
                value={trainerComment}
                onChange={(e) => setTrainerComment(e.target.value)}
                placeholder="Add constructive notes, observations on body language, or recommendations for next practice round…"
                className="w-full rounded-md border border-border-default bg-surface-1 p-3 text-xs text-ink-primary focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink-secondary">
                Score Override (Optional, 0-100):
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={scoreOverride}
                onChange={(e) => setScoreOverride(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 88 (leave empty to keep AI score)"
                className="w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-xs text-ink-primary focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>

            {feedbackSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Feedback saved successfully.
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
              <Button variant="secondary" onClick={() => setActiveSession(null)}>
                Cancel
              </Button>
              <Button
                onClick={submitTrainerFeedback}
                disabled={submittingFeedback || !trainerComment.trim()}
              >
                {submittingFeedback ? "Saving…" : "Submit Feedback"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
