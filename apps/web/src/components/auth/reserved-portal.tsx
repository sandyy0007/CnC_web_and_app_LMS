'use client';

import { ArrowRight, Construction, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { RouteGuard } from '@/components/auth/route-guard';
import { PortalShell } from '@/components/layout/portal-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import type { Role } from '@/lib/roleRoutes';
import { useAppSelector } from '@/store';

/**
 * Reserved-role portals (§3).
 *
 * These roles exist in the auth model now — the route is protected, the backend enforces the
 * role, and the session is scoped — but their feature set lands in a later phase. The page is
 * deliberately explicit about that rather than showing a fake dashboard.
 */
export function ReservedPortal({
  role,
  title,
  purpose,
  planned,
  dataAccess,
}: {
  role: Role;
  title: string;
  purpose: string;
  planned: string[];
  dataAccess: string[];
}) {
  const user = useAppSelector((state) => state.auth.user);

  return (
    <RouteGuard allow={role}>
      <PortalShell>
        <div className="mx-auto max-w-[760px] animate-enter">
          <header className="mb-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="amber">
                <Construction className="size-3" aria-hidden />
                Phase 2 portal
              </Badge>
              <Badge tone="info">
                <ShieldCheck className="size-3" aria-hidden />
                Route protected &amp; role-enforced
              </Badge>
            </div>
            <h1 className="mt-3 text-[24px] font-bold leading-tight tracking-tight text-ink-1">
              {title}
            </h1>
            <p className="mt-1.5 text-base text-ink-2">
              Signed in as <span className="font-semibold text-ink-1">{user?.name}</span> ({user?.roleLabel}).
            </p>
          </header>

          <Card className="card-interactive">
            <CardHeader>
              <div>
                <CardTitle>What this portal is for</CardTitle>
                <CardSubtitle>Its place in the platform is already decided</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-base leading-relaxed text-ink-1">{purpose}</p>

              <h2 className="mt-5 text-xs font-bold uppercase tracking-wider text-ink-3">
                Planned in this portal
              </h2>
              <ul className="mt-2 space-y-1">
                {planned.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 rounded-lg p-1.5 -mx-1.5 text-base text-ink-2 transition-colors hover:bg-slate-50/70"
                  >
                    <ArrowRight className="mt-1 size-3.5 shrink-0 text-indigo" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>

              <h2 className="mt-5 text-xs font-bold uppercase tracking-wider text-ink-3">
                Data this role will be able to see
              </h2>
              <ul className="mt-2 space-y-1">
                {dataAccess.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 rounded-lg p-1.5 -mx-1.5 text-base text-ink-2 transition-colors hover:bg-slate-50/70"
                  >
                    <ShieldCheck className="mt-1 size-3.5 shrink-0 text-info" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>

              <p className="mt-5 rounded-[10px] bg-info-bg px-3.5 py-3 text-sm leading-relaxed text-info">
                Nothing is shown here that the server would not already allow this role to read.
                The scoping rules, session handling and audit trail are the same ones the live
                portals use — only the screens are still to come.
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <Button asChild variant="secondary">
                  <Link href="/contact">Ask about access</Link>
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </PortalShell>
    </RouteGuard>
  );
}
