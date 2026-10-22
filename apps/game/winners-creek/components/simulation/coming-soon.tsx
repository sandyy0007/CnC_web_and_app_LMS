import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft } from "@/components/ui/icons";

export function ComingSoon({
  icon,
  title,
  phase,
  description,
  bullets,
}: {
  icon: React.ReactNode;
  title: string;
  phase: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div className="flex flex-col gap-6 pb-16 pt-4">
      <Link href="/simulation" className="inline-flex w-fit items-center gap-1 text-sm text-ink-tertiary hover:text-ink-primary">
        <ChevronLeft className="h-3.5 w-3.5" /> Simulation Lab
      </Link>

      <Card className="wc-fade-in mx-auto w-full max-w-xl">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-accent-50 text-accent-600">
            {icon}
          </span>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink-primary">{title}</h1>
            <Badge tone="accent">{phase}</Badge>
          </div>
          <p className="text-sm text-ink-secondary">{description}</p>
          <ul className="flex flex-col gap-1.5 text-left text-sm text-ink-tertiary">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-tertiary" />
                {b}
              </li>
            ))}
          </ul>
          <Link href="/simulation/presentation" className="mt-2">
            <Button variant="secondary">Try the Presentation Simulator instead</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
