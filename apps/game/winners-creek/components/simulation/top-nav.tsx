import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/simulation/sign-out-button";
import type { Session } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";

export function TopNav({ session }: { session: Session }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-0/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/simulation" className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-ink-primary">
              Winners Creek
            </span>
            <span className="text-sm text-ink-tertiary">Simulation Lab</span>
          </Link>
          <nav className="hidden items-center gap-6 sm:flex">
            <Link href="/simulation" className="text-sm text-ink-secondary transition-colors hover:text-ink-primary">
              Overview
            </Link>
            <Link href="/simulation/history" className="text-sm text-ink-secondary transition-colors hover:text-ink-primary">
              History
            </Link>
            {session.role !== "student" ? (
              <Link href="/trainer/simulation" className="text-sm text-ink-secondary transition-colors hover:text-ink-primary">
                Trainer Dashboard
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Badge tone="neutral" className="hidden sm:inline-flex">
            {session.name} · {session.role}
          </Badge>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
