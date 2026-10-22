import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="wc-fade-in flex flex-col items-center gap-4">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-tertiary">
          Winners Creek
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-ink-primary sm:text-5xl">
          Practice. Perform. Get evaluated. Improve.
        </h1>
        <p className="max-w-xl text-base text-ink-secondary">
          The AI Soft Skills Simulation Lab puts you inside a realistic presentation and
          interview assessment — then tells you exactly what to work on next.
        </p>
        <Link href="/simulation">
          <Button size="lg" className="mt-2">
            Enter Simulation Lab
          </Button>
        </Link>
      </div>
    </main>
  );
}
