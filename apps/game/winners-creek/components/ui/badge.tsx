import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-secondary border-border-default",
  accent: "bg-accent-50 text-accent-600 border-accent-100",
  success: "bg-success-100 text-success-500 border-transparent",
  warning: "bg-warning-100 text-warning-500 border-transparent",
  danger: "bg-danger-100 text-danger-500 border-transparent",
  info: "bg-info-100 text-info-500 border-transparent",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
