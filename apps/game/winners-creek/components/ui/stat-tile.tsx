import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  sublabel,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClass = {
    neutral: "text-ink-primary",
    success: "text-success-500",
    warning: "text-warning-500",
  }[tone];

  return (
    <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-1 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          {label}
        </span>
        {icon ? <span className="text-ink-tertiary">{icon}</span> : null}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight", toneClass)}>
        {value}
      </div>
      {sublabel ? <div className="mt-1 text-xs text-ink-tertiary">{sublabel}</div> : null}
    </div>
  );
}
