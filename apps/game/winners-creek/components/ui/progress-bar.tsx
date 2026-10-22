import { clamp, cn } from "@/lib/utils";

export function ProgressBar({
  value,
  max = 100,
  className,
  tone = "accent",
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  const pct = clamp((value / max) * 100, 0, 100);
  const toneColor = {
    accent: "bg-accent-500",
    success: "bg-success-500",
    warning: "bg-warning-500",
    danger: "bg-danger-500",
  }[tone];

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-[var(--score-track)]", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", toneColor)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 80 ? "success" : value >= 60 ? "accent" : value >= 40 ? "warning" : "danger";
  return (
    <div className="flex items-center gap-4">
      <span className="w-40 shrink-0 text-sm text-ink-secondary">{label}</span>
      <ProgressBar value={value} tone={tone} className="flex-1" />
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-primary">
        {value}
      </span>
    </div>
  );
}
