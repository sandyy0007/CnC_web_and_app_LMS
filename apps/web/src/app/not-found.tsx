import { Compass } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-[420px] rounded-card border border-line bg-card p-7 text-center shadow-card">
        <div className="mb-5 flex justify-center">
          <WinnersCreekLogo variant="full" />
        </div>
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo">
          <Compass className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-[17px] font-semibold">Page not found</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          This page does not exist, or it belongs to a portal you do not have access to.
        </p>
        <Button variant="primary" className="mt-5" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
