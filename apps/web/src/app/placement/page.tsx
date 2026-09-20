'use client';

import { ReservedPortal } from '@/components/auth/reserved-portal';

export default function PlacementCellPortal() {
  return (
    <ReservedPortal
      role="PLACEMENT_CELL"
      title="Placement Cell"
      purpose="Runs campus recruitment for one institution: which participants are ready, which drives are open, and who to put in front of which recruiter."
      planned={[
        'Drive calendar with eligibility computed from readiness scores and attendance',
        'Shortlisting against a recruiter’s criteria, with the evidence behind each score',
        'Recruiter invitations and access windows',
        'Placement outcomes fed back into the readiness model',
      ]}
      dataAccess={[
        'Participants in your own institution, across departments',
        'Readiness scores, certificates and practice history — not private recordings',
        'A participant’s profile only while they have consented to recruiter visibility',
      ]}
    />
  );
}
