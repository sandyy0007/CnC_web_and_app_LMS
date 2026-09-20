'use client';

import { BarCompare, ChartCard, attendanceColor } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { num, pct } from '@/lib/format';

export default function CourseProgressPage() {
  const table = useTableState('trainer-course-progress');
  const batches = useApi<any[]>('/trainer/batches');
  const query = useApi<any>(
    '/trainer/course-progress',
    table.state.filters.batchId && table.state.filters.batchId !== 'all'
      ? { batchId: table.state.filters.batchId }
      : undefined,
  );

  return (
    <>
      <PageHeader
        title="Course Progress"
        description="How far each module and batch has actually got — session completion, not intention."
      />

      <div className="mb-4 w-full sm:w-[240px]">
        <label htmlFor="batch" className="mb-1.5 block text-sm font-semibold">
          Batch
        </label>
        <Select
          value={table.state.filters.batchId ?? 'all'}
          onValueChange={(value) => table.setFilter('batchId', value)}
        >
          <SelectTrigger id="batch">
            <SelectValue placeholder="All my batches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All my batches</SelectItem>
            {(batches.data ?? []).map((batch) => (
              <SelectItem key={batch.id} value={batch.id}>
                {batch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AsyncSection query={query} skeleton="chart">
        {(data) => (
          <div className="space-y-5">
            <ChartCard
              title="Average score by module"
              subtitle="Trainer-rated parameters, normalised to 100"
              description={data.modules
                .map((row: any) => `${row.name}: ${row.averageScore ?? 'no data'}`)
                .join('; ')}
              isEmpty={data.modules.length === 0}
              height={220}
            >
              <BarCompare
                data={data.modules.map((row: any) => ({
                  module: row.name,
                  average: row.averageScore ?? 0,
                }))}
                xKey="module"
                valueKey="average"
                colorBy={(row) => attendanceColor(row.average)}
              />
            </ChartCard>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Modules</CardTitle>
                  <CardSubtitle>Session completion and the score it produced</CardSubtitle>
                </div>
              </CardHeader>
              <TableWrap>
                <Table>
                  <caption className="sr-only">Module completion and average score</caption>
                  <thead>
                    <Tr>
                      <Th>Module</Th>
                      <Th align="right">Sessions</Th>
                      <Th align="right">Completed</Th>
                      <Th>Progress</Th>
                      <Th align="right">Avg score</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {data.modules.map((row: any) => (
                      <Tr key={row.id}>
                        <Td className="font-semibold">{row.name}</Td>
                        <Td align="right" className="tnum">
                          {num(row.totalSessions)}
                        </Td>
                        <Td align="right" className="tnum">
                          {num(row.completedSessions)}
                        </Td>
                        <Td>
                          <ProgressBar value={row.percent} showValue={false} thin />
                          <span className="tnum mt-1 block text-xs text-ink-3">
                            {pct(row.percent, 1)}
                          </span>
                        </Td>
                        <Td align="right" className="tnum font-semibold">
                          {row.averageScore != null ? num(row.averageScore, 1) : '—'}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Batches</CardTitle>
                  <CardSubtitle>Completion across the whole syllabus</CardSubtitle>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                {data.batches.map((row: any) => (
                  <ProgressBar
                    key={row.id}
                    label={`${row.name} · ${num(row.studentCount)} students`}
                    value={row.percent}
                  />
                ))}
              </CardBody>
            </Card>
          </div>
        )}
      </AsyncSection>
    </>
  );
}
