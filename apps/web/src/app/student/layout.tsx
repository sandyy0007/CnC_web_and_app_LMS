'use client';

import { PortalPage } from '@/components/auth/route-guard';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalPage allow="STUDENT" searchPlaceholder="Search courses, practice, assessments…">
      {children}
    </PortalPage>
  );
}
