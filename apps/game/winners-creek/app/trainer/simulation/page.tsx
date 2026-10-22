import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listAllSessionsForTrainer, getTrainerOverview } from "@/lib/simulation/trainer-service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { Mic, Briefcase, ChevronRight, Lock } from "@/components/ui/icons";
import { formatDate, formatDuration } from "@/lib/utils";

export default async function TrainerDashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const [rows, overview] = await Promise.all([
    listAllSessionsForTrainer(session),
    getTrainerOverview(session),
  ]);

  return (
    <div className="flex flex-col gap-6 pb-16 pt-4">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-tertiary">Trainer Dashboard</span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-primary">All Simulation Sessions</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Students" value={String(overview.totalStudents)} />
        <StatTile label="Total sessions" value={String(overview.totalSessions)} />
        <StatTile label="Presentations" value={String(rows.filter((r) => r.type === "presentation").length)} />
        <StatTile label="Interviews" value={String(rows.filter((r) => r.type === "interview").length)} />
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" />
          <p className="text-xs text-ink-tertiary">
            Score overrides, evaluation-weight configuration, simulation assignment and question-bank authoring
            arrive in Phase 6, alongside batch analytics and weakest-parameter trends. This view already gives you
            real session-level review — AI score and trainer feedback will stay separately identifiable once
            scoring (Phase 3) ships.
          </p>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-ink-secondary">No sessions recorded yet.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-[var(--radius-lg)] border border-border-subtle bg-surface-1">
          {rows.map((r) => (
            <div key={r.sessionId} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-2 text-ink-secondary">
                  {r.type === "presentation" ? <Mic className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-primary">{r.title}</p>
                  <p className="text-xs text-ink-tertiary">
                    {r.studentName} · {formatDate(r.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-ink-tertiary">
                  {r.durationSeconds ? formatDuration(r.durationSeconds) : "—"}
                </span>
                <Badge tone={r.status === "completed" ? "success" : "neutral"}>{r.status.replace("_", " ")}</Badge>
                {r.latestAttemptId && r.status === "completed" ? (
                  <Link href={`/simulation/results/${r.latestAttemptId}`} className="inline-flex items-center gap-1 text-sm text-accent-500 hover:text-accent-600">
                    Review <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span className="text-xs text-ink-tertiary">In progress</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
