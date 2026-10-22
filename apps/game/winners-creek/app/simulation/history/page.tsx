import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listRecentSessions } from "@/lib/simulation/dashboard-service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Briefcase, ChevronRight, Clock } from "@/components/ui/icons";
import { formatDate, formatDuration } from "@/lib/utils";

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) return null;

  const sessions = await listRecentSessions(session.userId, 50);

  return (
    <div className="flex flex-col gap-6 pb-16 pt-4">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-tertiary">Simulation Lab</span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-primary">Session History</h1>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-ink-secondary">
            No sessions yet.{" "}
            <Link href="/simulation/presentation" className="text-accent-500 hover:text-accent-600">
              Start your first simulation
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-[var(--radius-lg)] border border-border-subtle bg-surface-1">
          {sessions.map(({ session: s, latestAttempt }) => (
            <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-2 text-ink-secondary">
                  {s.type === "presentation" ? <Mic className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-primary">{s.title}</p>
                  <p className="text-xs text-ink-tertiary">
                    {formatDate(s.createdAt)} · {s.evaluationMode.replace("_", " ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="hidden items-center gap-1 text-xs text-ink-tertiary sm:flex">
                  <Clock className="h-3.5 w-3.5" />
                  {latestAttempt?.durationSeconds ? formatDuration(latestAttempt.durationSeconds) : "—"}
                </span>
                <StatusBadge status={s.status} />
                <Link
                  href={
                    s.status === "completed" && latestAttempt
                      ? `/simulation/results/${latestAttempt.id}`
                      : `/simulation/presentation/${s.id}/prepare`
                  }
                  className="inline-flex items-center gap-1 text-sm text-accent-500 hover:text-accent-600"
                >
                  {s.status === "completed" ? "View report" : "Continue"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" ? "success" : status === "in_progress" ? "accent" : status === "abandoned" ? "danger" : "neutral";
  const label = status.replace("_", " ");
  return <Badge tone={tone as "success" | "accent" | "danger" | "neutral"}>{label}</Badge>;
}
