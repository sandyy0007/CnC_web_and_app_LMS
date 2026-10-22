'use client';

import { CalendarCheck, Users } from 'lucide-react';
import Link from 'next/link';

import { attendanceColor } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { useApi } from '@/hooks/useApi';
import { num, pct } from '@/lib/format';

export default function TrainerBatchesPage() {
  const query = useApi<any[]>('/trainer/batches');

  return (
    <GlobalPageBackground
      image="/images/backgrounds/colleges.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <AsyncSection query={query} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
      {(rows) => (
        <>
          <PageHeader
            title="My Batches"
            description="The batches you are assigned to. Anything else is refused by the server, not just hidden."
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((batch) => (
              <Card key={batch.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-md font-semibold">{batch.name}</h2>
                      <p className="mt-0.5 text-sm text-ink-2">
                        {batch.code} · Semester {batch.semesterNumber}
                      </p>
                    </div>
                    <Badge tone={batch.status === 'active' ? 'success' : 'neutral'}>
                      {batch.status}
                    </Badge>
                  </div>

                  <dl className="tnum mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-[8px] bg-app px-2 py-2">
                      <dd className="text-md font-bold">{num(batch.studentCount)}</dd>
                      <dt className="text-2xs text-ink-3">Participants</dt>
                    </div>
                    <div className="rounded-[8px] bg-app px-2 py-2">
                      <dd
                        className="text-md font-bold"
                        style={{ color: attendanceColor(batch.attendancePercent ?? 0) }}
                      >
                        {pct(batch.attendancePercent, 0)}
                      </dd>
                      <dt className="text-2xs text-ink-3">Attendance</dt>
                    </div>
                    <div className="rounded-[8px] bg-app px-2 py-2">
                      <dd className="text-md font-bold">{num(batch.averageScore, 1)}</dd>
                      <dt className="text-2xs text-ink-3">Avg score</dt>
                    </div>
                  </dl>

                  <ProgressBar
                    className="mt-3.5"
                    label="Capacity used"
                    value={(batch.studentCount / Math.max(1, batch.capacity)) * 100}
                  />

                  <div className="mt-4 flex gap-2">
                    <Button asChild variant="primary" size="sm" className="flex-1">
                      <Link href={`/trainer/batches/${batch.id}`}>
                        <Users className="size-3.5" aria-hidden />
                        Roster
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" size="sm" className="flex-1">
                      <Link href={`/trainer/attendance?batchId=${batch.id}`}>
                        <CalendarCheck className="size-3.5" aria-hidden />
                        Attendance
                      </Link>
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </AsyncSection>
    </GlobalPageBackground>
  );
}
