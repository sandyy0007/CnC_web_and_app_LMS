'use client';

import { ReservedPortal } from '@/components/auth/reserved-portal';

export default function RecruiterPortal() {
  return (
    <ReservedPortal
      role="RECRUITER"
      title="Recruiter"
      purpose="A narrow, time-boxed window for an external recruiter invited to a specific drive — enough to shortlist, and nothing more."
      planned={[
        'Drive-scoped candidate lists with readiness bands and skill breakdowns',
        'Shortlist, schedule and record interview outcomes',
        'Structured feedback back to the placement cell',
      ]}
      dataAccess={[
        'Only candidates in a drive you have been invited to, for as long as the window is open',
        'Only participants who consented to recruiter visibility in their own settings',
        'Aggregate skill evidence — never a participant’s practice recordings or private notes',
      ]}
    />
  );
}
