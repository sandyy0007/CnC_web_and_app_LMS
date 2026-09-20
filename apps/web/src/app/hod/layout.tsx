'use client';

import { PortalPage } from '@/components/auth/route-guard';
import { ScopePill } from '@/components/shared/misc';
import { useApi } from '@/hooks/useApi';

/**
 * Every HOD screen carries the `College › Department` scope pill (SRS §6.1) so the boundary the
 * server enforces is visible at all times.
 */
export default function HodLayout({ children }: { children: React.ReactNode }) {
  const scope = useApi<any>('/hod/scope', undefined, { select: (raw) => raw.data.scope });

  return (
    <PortalPage
      allow="HOD"
      searchPlaceholder="Search participants, trainers, certificates…"
      headerSlot={
        scope.data ? (
          <ScopePill
            collegeName={scope.data.collegeName}
            departmentName={scope.data.departmentName}
            className="hidden lg:inline-flex"
          />
        ) : null
      }
    >
      {children}
    </PortalPage>
  );
}
