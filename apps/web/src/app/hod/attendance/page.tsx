'use client';

import { AlertTriangle, CalendarCheck, Info } from 'lucide-react';
import Link from 'next/link';

import { BarCompare, ChartCard, LineTrend, attendanceColor } from '@/components/charts';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { num, pct } from '@/lib/format';

export default function HodAttendancePage() {
  const table = useTableState('hod-attendance');
  const query = useApi<any>(
    '/hod/attendance',
    {
      trainingModuleId: table.state.filters.trainingModuleId,
      batchId: table.state.filters.batchId,
    },
    { select: (raw) => ({ ...raw.data, meta: raw.meta }) },
  );

  return (
    <GlobalPageBackground
      image="/images/backgrounds/attendance.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <AsyncSection query={query} skeleton="kpis">
      {(data) => (
        <>
          <PageHeader
            title="Session Attendance"
            description="Soft-skills session attendance for your department — separate from curriculum attendance."
          />

          <FilterBar
            filters={[
              {
                name: 'trainingModuleId',
                label: 'Module',
                allLabel: 'All modules',
                options: (data.meta?.filters?.modules ?? []).map((row: any) => ({
                  value: row.id,
                  label: row.name,
                })),
              },
              {
                name: 'batchId',
                label: 'Batch',
                allLabel: 'All batches',
                options: (data.meta?.filters?.batches ?? []).map((row: any) => ({
                  value: row.id,
                  label: row.name,
                })),
              },
            ]}
            values={table.state.filters}
            onFilterChange={table.setFilter}
            onReset={table.reset}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Overall attendance"
              value={pct(data.overall.percentage, 1)}
              icon={<CalendarCheck />}
              tone={data.overall.percentage >= data.threshold ? 'success' : 'amber'}
              hasData={data.overall.hasData}
              deltaLabel={`${num(data.overall.present)} of ${num(data.overall.total)} marks`}
            />
            <StatCard
              label="Sessions conducted"
              value={num(data.sessionsConducted)}
              icon={<CalendarCheck />}
              tone="teal"
            />
            <StatCard
              label="Sessions without data"
              value={num(data.sessionsWithoutAttendanceData)}
              icon={<Info />}
              tone="info"
              deltaLabel="Excluded from the denominator"
            />
            <StatCard
              label="Defaulters"
              value={num(data.defaulterCount)}
              icon={<AlertTriangle />}
              tone={data.defaulterCount > 0 ? 'danger' : 'success'}
              deltaLabel={`Below ${num(data.threshold, 0)}%`}
            />
          </div>

          {data.notes?.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {data.notes.map((note: string) => (
                <li key={note} className="flex items-start gap-2 text-sm text-ink-2">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
                  {note}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Weekly trend"
              subtitle="Last eight weeks"
              description={data.weeklyTrend
                .map((week: any) => `${week.label}: ${week.percentage}%`)
                .join('; ')}
              isEmpty={!data.weeklyTrend.some((week: any) => week.hasSession)}
              height={220}
            >
              <LineTrend
                data={data.weeklyTrend}
                xKey="label"
                series={[{ key: 'percentage', label: 'Attendance %' }]}
                unit="%"
              />
            </ChartCard>

            <ChartCard
              title="Monthly trend"
              subtitle="Rolled up by calendar month"
              description={data.monthlyTrend
                .map((month: any) => `${month.label}: ${month.percentage}%`)
                .join('; ')}
              isEmpty={data.monthlyTrend.length === 0}
              height={220}
            >
              <BarCompare
                data={data.monthlyTrend}
                xKey="label"
                valueKey="percentage"
                unit="%"
                threshold={data.threshold}
                thresholdLabel={`${num(data.threshold, 0)}%`}
                colorBy={(row) => attendanceColor(row.percentage)}
              />
            </ChartCard>

            <ChartCard
              title="By batch"
              subtitle="Where the gap is"
              description={data.batchWise
                .map((row: any) => `${row.key}: ${row.percentage}%`)
                .join('; ')}
              isEmpty={data.batchWise.length === 0}
              height={220}
            >
              <BarCompare
                data={data.batchWise}
                xKey="key"
                valueKey="percentage"
                unit="%"
                threshold={data.threshold}
                colorBy={(row) => attendanceColor(row.percentage)}
              />
            </ChartCard>

            <ChartCard
              title="By module"
              subtitle="Which topics people skip"
              description={data.moduleWise
                .map((row: any) => `${row.key}: ${row.percentage}%`)
                .join('; ')}
              isEmpty={data.moduleWise.length === 0}
              height={220}
            >
              <BarCompare
                data={data.moduleWise}
                xKey="key"
                valueKey="percentage"
                unit="%"
                threshold={data.threshold}
                colorBy={(row) => attendanceColor(row.percentage)}
              />
            </ChartCard>
          </div>

          <Card className="mt-5">
            <CardHeader>
              <div>
                <CardTitle>Attendance defaulters</CardTitle>
                <CardSubtitle>
                  {num(data.defaulterCount)} participant(s) below {num(data.threshold, 0)}%
                </CardSubtitle>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href="/hod/reports">Export the list</Link>
              </Button>
            </CardHeader>
            <TableWrap>
              <Table>
                <caption className="sr-only">Attendance defaulters</caption>
                <thead>
                  <Tr>
                    <Th>Participant</Th>
                    <Th hideBelow="sm">Batch</Th>
                    <Th align="right">Attendance</Th>
                    <Th align="right" hideBelow="md">
                      Sessions
                    </Th>
                  </Tr>
                </thead>
                <tbody>
                  {data.defaulters.map((row: any) => (
                    <Tr key={row.studentUserId}>
                      <Td>
                        <Link
                          href={`/hod/participants/${row.studentUserId}`}
                          className="font-semibold hover:text-indigo-600"
                        >
                          {row.name}
                        </Link>
                        <span className="block text-xs text-ink-3">{row.rollNumber}</span>
                      </Td>
                      <Td hideBelow="sm" className="text-ink-2">
                        {row.batchName}
                      </Td>
                      <Td
                        align="right"
                        className="tnum font-semibold"
                        style={{ color: attendanceColor(row.attendancePct) }}
                      >
                        {pct(row.attendancePct, 1)}
                      </Td>
                      <Td align="right" hideBelow="md" className="tnum text-ink-2">
                        {num(row.sessionsAttended)}/{num(row.sessionsTotal)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            {data.defaulters.length === 0 && (
              <CardBody>
                <p className="py-4 text-center text-base text-success">
                  No defaulters — everyone is above the threshold.
                </p>
              </CardBody>
            )}
          </Card>
        </>
      )}
    </AsyncSection>
    </GlobalPageBackground>
  );
}
