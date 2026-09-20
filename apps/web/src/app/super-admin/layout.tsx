'use client';

import { PortalPage } from '@/components/auth/route-guard';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalPage allow="SUPER_ADMIN" searchPlaceholder="Search colleges, platform users, games, telemetry…">
      {children}
    </PortalPage>
  );
}

