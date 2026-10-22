import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listRecentSessions, getProgress } from "@/lib/simulation/dashboard-service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { Mic, Briefcase, ChevronRight, Flame, TrendingUp, Clock } from "@/components/ui/icons";
import { formatDate, formatDuration } from "@/lib/utils";

export default async function SimulationLandingPage() {
  const session = await getSession();
  if (!session) return null;

  const [recent, { progress }] = await Promise.all([
    listRecentSessions(session.userId, 6),
    getProgress(session.userId),
  ]);

  return (
    <div className="flex flex-col gap-10 pb-16">
      <section className="wc-fade-in flex flex-col gap-3 pt-4">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-tertiary">
          Simulation Lab
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
          Experience realistic presentation and interview assessments powered by AI.
        </h1>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <SimulatorCard
          href="/simulation/presentation"
          icon={<Mic className="h-5 w-5" />}
          title="Presentation Simulator"
          description="Upload your presentation, rehearse in a realistic environment and receive AI feedback on delivery, communication, content and presentation skills."
          cta="Start Presentation"
        />
        <SimulatorCard
          href="/simulation/interview"
          icon={<Briefcase className="h-5 w-5" />}
          title="AI Interview Simulator"
          description="Face an adaptive AI interviewer that asks questions, follows up on your answers and evaluates your interview performance."
          cta="Start Interview"
          badge="Phase 4"
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-ink-primary">Your Progress</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total Simulations" value={String(progress?.totalSimulations ?? 0)} />
          <StatTile label="Presentations" value={String(progress?.presentationsCompleted ?? 0)} />
          <StatTile label="Interviews" value={String(progress?.interviewsCompleted ?? 0)} />
          <StatTile
            label="Average Score"
            value={progress?.averageScore != null ? String(Math.round(progress.averageScore)) : "—"}
            sublabel="Scoring arrives in Phase 3"
          />
          <StatTile
            label="Best Score"
            value={progress?.bestScore != null ? String(progress.bestScore) : "—"}
            tone="success"
          />
          <StatTile
            label="Practice Streak"
            value={`${progress?.practiceStreakDays ?? 0}d`}
            icon={<Flame className="h-4 w-4" />}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-ink-primary">Recent Sessions</h2>
          <Link href="/simulation/history" className="text-sm text-accent-500 hover:text-accent-600">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-ink-secondary">
                No sessions yet. Start a presentation simulation to see it here.
              </p>
              <Link href="/simulation/presentation">
                <Button variant="secondary">Start your first simulation</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-[var(--radius-lg)] border border-border-subtle bg-surface-1">
            {recent.map(({ session: s, latestAttempt }) => (
              <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-2 text-ink-secondary">
                    {s.type === "presentation" ? <Mic className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-primary">{s.title}</p>
                    <p className="text-xs text-ink-tertiary">{formatDate(s.createdAt)}</p>
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
      </section>
    </div>
  );
}

function SimulatorCard({
  href,
  icon,
  title,
  description,
  cta,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  badge?: string;
}) {
  return (
    <Card className="wc-fade-in flex flex-col justify-between p-6 transition-transform duration-200 hover:-translate-y-0.5">
      <div>
        <div className="flex items-center justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-accent-50 text-accent-600">
            {icon}
          </span>
          {badge ? <Badge tone="accent">{badge}</Badge> : null}
        </div>
        <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink-primary">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{description}</p>
      </div>
      <Link href={href} className="mt-6">
        <Button className="w-full sm:w-auto">
          {cta}
          <TrendingUp className="ml-1.5 h-4 w-4 -rotate-45" />
        </Button>
      </Link>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" ? "success" : status === "in_progress" ? "accent" : status === "abandoned" ? "danger" : "neutral";
  const label = status.replace("_", " ");
  return <Badge tone={tone as "success" | "accent" | "danger" | "neutral"}>{label}</Badge>;
}
