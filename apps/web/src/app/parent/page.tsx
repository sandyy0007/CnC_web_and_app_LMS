'use client';

import { ReservedPortal } from '@/components/auth/reserved-portal';

export default function ParentPortal() {
  return (
    <ReservedPortal
      role="PARENT"
      title="Parent / Guardian"
      purpose="A read-only view of one linked participant's training progress, so a guardian conversation can be based on the same facts the trainer sees."
      planned={[
        'Attendance and readiness trend for the linked participant',
        'Performance breakdown across employability parameters',
        'Notices from the programme office and the participant’s trainers',
      ]}
      dataAccess={[
        'Only the participant(s) explicitly linked to your account — the link is checked on every request',
        'Progress and attendance records; read-only throughout',
        'Never other participants, and never a participant’s practice recordings',
      ]}
    />
  );
}
