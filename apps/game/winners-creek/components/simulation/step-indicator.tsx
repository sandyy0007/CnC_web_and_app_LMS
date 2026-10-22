import { cn } from "@/lib/utils";
import { Check } from "@/components/ui/icons";

export function StepIndicator({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "upcoming";
        return (
          <li key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  state === "done" && "border-accent-500 bg-accent-500 text-white",
                  state === "active" && "border-accent-500 text-accent-600",
                  state === "upcoming" && "border-border-default text-ink-tertiary",
                )}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  state === "upcoming" ? "text-ink-tertiary" : "text-ink-primary font-medium",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <span className="h-px w-6 bg-border-default sm:w-10" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
