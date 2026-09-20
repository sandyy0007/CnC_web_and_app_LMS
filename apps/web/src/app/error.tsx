'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';

/**
 * Last-resort boundary. It shows what the user can do next and never a stack trace
 * (§29 — internal details are not part of an error message).
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-[420px] rounded-card border border-line bg-card p-7 text-center shadow-card">
        <div className="mb-5 flex justify-center">
          <WinnersCreekLogo variant="full" />
        </div>
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-danger-bg text-danger">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-[17px] font-semibold">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          The page could not be displayed. You can try again — if it keeps happening, please
          contact your institution&apos;s administrator.
        </p>
        <div className="mt-5 flex justify-center gap-2.5">
          <Button variant="primary" onClick={reset}>
            <RefreshCw className="size-3.5" aria-hidden />
            Try again
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
