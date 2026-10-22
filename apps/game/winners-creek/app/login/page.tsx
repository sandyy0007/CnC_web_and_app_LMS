"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("student@winnerscreek.dev");
  const [password, setPassword] = useState("student123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign in failed. Please try again.");
        return;
      }
      router.push(params.get("next") ?? "/simulation");
      router.refresh();
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="wc-fade-in w-full max-w-sm">
        <CardHeader>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-tertiary">
            Winners Creek
          </span>
          <CardTitle className="mt-1 text-2xl">Sign in</CardTitle>
          <CardDescription>Access your Simulation Lab.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-secondary">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 rounded-[var(--radius-sm)] border border-border-default bg-surface-0 px-3 text-ink-primary outline-none focus-visible:border-accent-500"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-secondary">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-[var(--radius-sm)] border border-border-default bg-surface-0 px-3 text-ink-primary outline-none focus-visible:border-accent-500"
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-danger-500">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={loading} className="mt-2 w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-5 text-xs text-ink-tertiary">
            Demo accounts — student: student@winnerscreek.dev / student123 · trainer:
            trainer@winnerscreek.dev / trainer123
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
