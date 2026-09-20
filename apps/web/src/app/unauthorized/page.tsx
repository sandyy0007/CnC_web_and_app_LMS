'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useAppSelector } from '@/store';

export default function UnauthorizedPage() {
  const user = useAppSelector((state) => state.auth.user);

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-[440px] rounded-card border border-line bg-card p-7 text-center shadow-card">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-danger-bg text-danger">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-[17px] font-semibold">You don’t have access to that</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          That page belongs to a different role, department or institution. Access is decided by the
          server on every request, so it isn’t something a link can bypass — if you think you should
          have access, your institution administrator can change it.
        </p>
        <div className="mt-5 flex justify-center gap-2.5">
          <Button variant="primary" asChild>
            <Link href={user?.home ?? '/login'}>
              {user ? 'Go to my portal' : 'Sign in'}
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/contact">Get help</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
