'use client';

import { PortalPage } from '@/components/auth/route-guard';

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalPage allow="TRAINER" searchPlaceholder="Search participants, batches, evaluations…">
      {children}
    </PortalPage>
  );
}
