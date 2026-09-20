'use client';

import Link from 'next/link';

import {
  BarCompare,
  ChartCard,
  StackedDistribution,
  attendanceColor,
} from '@/components/charts';
import { DataTable, type Column } from '@/components/shared/data-table';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { ErrorState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { num } from '@/lib/format';

const BAND_TONE: Record<string, 'success' | 'info' | 'amber' | 'danger' | 'neutral'> = {
  Excellent: 'success',
  Strong: 'info',
  Developing: 'amber',
  'Needs Work': 'danger',
};

export default function HodAssessmentsPage() {
  const table = useTableState('hod-assessments', { pageSize: 20 });
  const query = useApi<any>('/hod/assessments', table.params, {
    select: (raw) => ({
      items: raw.items,
      pagination: raw.pagination,
      analytics: raw.data,
      meta: raw.meta,
    }),
  });

  const analytics = query.data?.analytics;
  const criteria: string[] = analytics?.rubricCriteria ?? [];

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Participant',
      sortKey: 'name',
      render: (row) => (
        <Link
          href={`/hod/participants/${row.studentUserId}`}
          className="hover:text-indigo-600"
        >
          <span className="block font-semibold">{row.name}</span>
          <span className="block text-xs text-ink-3">
            {row.rollNumber} · {row.batchName}
          </span>
        </Link>
      ),
    },
    ...criteria.map(
      (criterion): Column<any> => ({
        key: criterion,
        header: criterion,
        align: 'right',
        hideBelow: 'md',
        render: (row) => (
          <span className="tnum">{num(row.scores?.[criterion], 1)}</span>
        ),
      }),
    ),
    {
      key: 'overall',
      header: 'Overall',
      align: 'right',
      sortKey: 'overall',
      render: (row) => <span className="tnum font-semibold">{num(row.overall, 1)}</span>,
    },
    {
      key: 'band',
      header: 'Band',
      render: (row) => (
        <Badge tone={BAND_TONE[row.band] ?? 'neutral'}>{row.band ?? 'No data'}</Badge>
      ),
    },
  ];

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <>
      <PageHeader
        title="Skill Assessment"
        description="Rubric results for your department, per participant and rolled up by module and batch."
      />

      <FilterBar
        search={table.state.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search name or roll number…"
        filters={[
          {
            name: 'trainingModuleId',
            label: 'Module',
            allLabel: 'All modules',
            options: (query.data?.meta?.filters?.modules ?? []).map((row: any) => ({
              value: row.id,
              label: row.name,
            })),
          },
          {
            name: 'batchId',
            label: 'Batch',
            allLabel: 'All batches',
            options: (query.data?.meta?.filters?.batches ?? []).map((row: any) => ({
              value: row.id,
              label: row.name,
            })),
          },
        ]}
        values={table.state.filters}
        onFilterChange={table.setFilter}
        onReset={table.reset}
      />

      {analytics && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Department average"
              value={num(analytics.departmentAverage.average, 1)}
              outOf={100}
              hasData={analytics.departmentAverage.hasData}
              deltaLabel={`${num(analytics.departmentAverage.count)} scores`}
            />
            <StatCard
              label="Filtered average"
              value={num(analytics.filteredAverage.average, 1)}
              outOf={100}
              tone="teal"
              hasData={analytics.filteredAverage.hasData}
              deltaLabel={`${num(analytics.filteredAverage.count)} scores in view`}
            />
            <StatCard
              label="Lowest score"
              value={num(analytics.departmentAverage.min, 0)}
              outOf={100}
              tone="danger"
              hasData={analytics.departmentAverage.hasData}
            />
            <StatCard
              label="Highest score"
              value={num(analytics.departmentAverage.max, 0)}
              outOf={100}
              tone="success"
              hasData={analytics.departmentAverage.hasData}
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Average by module"
              subtitle="Trainer-rated parameters"
              description={analytics.moduleAverages
                .map((row: any) => `${row.module}: ${row.average}`)
                .join('; ')}
              isEmpty={analytics.moduleAverages.length === 0}
              height={220}
            >
              <BarCompare
                data={analytics.moduleAverages}
                xKey="module"
                valueKey="average"
                colorBy={(row) => attendanceColor(row.average)}
              />
            </ChartCard>

            <ChartCard
              title="Average by batch"
              subtitle="Where the spread comes from"
              description={analytics.batchAverages
                .map((row: any) => `${row.batch}: ${row.average}`)
                .join('; ')}
              isEmpty={analytics.batchAverages.length === 0}
              height={220}
            >
              <BarCompare
                data={analytics.batchAverages}
                xKey="batch"
                valueKey="average"
                colorBy={(row) => attendanceColor(row.average)}
              />
            </ChartCard>

            <ChartCard
              title="Proficiency distribution"
              subtitle="How many participants sit in each band, per criterion"
              description={analytics.proficiencyDistribution
                .map(
                  (row: any) =>
                    `${row.criterion}: Expert ${row.Expert}, Advanced ${row.Advanced}, Intermediate ${row.Intermediate}, Beginner ${row.Beginner}`,
                )
                .join('; ')}
              isEmpty={analytics.proficiencyDistribution.length === 0}
              height={240}
              className="xl:col-span-2"
            >
              <StackedDistribution
                data={analytics.proficiencyDistribution}
                xKey="criterion"
                series={[
                  { key: 'Expert', label: 'Expert', color: 'var(--success)' },
                  { key: 'Advanced', label: 'Advanced', color: 'var(--indigo)' },
                  { key: 'Intermediate', label: 'Intermediate', color: 'var(--amber)' },
                  { key: 'Beginner', label: 'Beginner', color: 'var(--danger)' },
                ]}
              />
            </ChartCard>
          </div>
        </>
      )}

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Per-participant results</CardTitle>
            <CardSubtitle>
              {num(query.data?.pagination?.total ?? 0)} participant(s) in view
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardBody className="pt-0">
          <DataTable
            columns={columns}
            rows={query.data?.items ?? []}
            loading={query.initialLoading}
            pagination={query.data?.pagination}
            onPageChange={table.setPage}
            sortBy={table.state.sortBy}
            sortDir={table.state.sortDir}
            onSort={table.toggleSort}
            rowKey={(row) => row.studentUserId}
            caption="Skill assessment results by participant"
          />
        </CardBody>
      </Card>
    </>
  );
}
