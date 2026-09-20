'use client';

import { PortalPage } from '@/components/auth/route-guard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalPage allow="ADMIN" searchPlaceholder="Search users, batches, departments…">
      {children}
    </PortalPage>
  );
}
