'use client';

import { ShieldCheck } from 'lucide-react';

import { AuditTable } from '@/components/shared/misc';
import { Pagination } from '@/components/shared/data-table';
import { FilterBar } from '@/components/shared/filter-bar';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApi } from '@/hooks/useApi';
import { useTableState } from '@/hooks/useTableState';
import { num, titleCase } from '@/lib/format';

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' },
];

export default function AdminAuditLogPage() {
  const table = useTableState('admin-audit', { pageSize: 25, filters: { days: '7' } });
  const departments = useApi<any[]>('/admin/departments');
  const query = useApi<any>('/admin/audit-logs', table.params, {
    select: (raw) => ({
      items: raw.items,
      pagination: raw.pagination,
      summary: raw.data,
      meta: raw.meta,
    }),
  });

  return (
    <AsyncSection query={query} skeleton="table">
      {(data) => (
        <>
          <PageHeader
            title="Audit log"
            description="Append-only record of every create, update, delete and export across the institution."
          />

          {data.summary && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Events" value={num(data.summary.totalEvents)} tone="indigo" />
              <StatCard label="Created" value={num(data.summary.createEvents)} tone="success" />
              <StatCard label="Updated" value={num(data.summary.updateEvents)} tone="info" />
              <StatCard label="Deleted" value={num(data.summary.deleteEvents)} tone="danger" />
              <StatCard label="Exports" value={num(data.summary.exportEvents)} tone="purple" />
            </div>
          )}

          {data.summary?.notice && (
            <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-info-bg px-3.5 py-2.5 text-sm text-info">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {data.summary.notice}
            </p>
          )}

          <div className="mt-5">
            <FilterBar
              filters={[
                {
                  name: 'entityType',
                  label: 'Record type',
                  allLabel: 'All record types',
                  options: (data.meta?.filters?.entityTypes ?? []).map((value: string) => ({
                    value,
                    label: titleCase(value),
                  })),
                },
                {
                  name: 'action',
                  label: 'Action',
                  allLabel: 'All actions',
                  options: (data.meta?.filters?.actions ?? []).map((value: string) => ({
                    value,
                    label: titleCase(value),
                  })),
                },
                {
                  name: 'departmentId',
                  label: 'Department',
                  allLabel: 'All departments',
                  options: (departments.data ?? []).map((department) => ({
                    value: department.id,
                    label: department.name,
                  })),
                },
              ]}
              values={table.state.filters}
              onFilterChange={table.setFilter}
              onReset={table.reset}
              actions={
                <div className="w-[170px]">
                  <label htmlFor="days" className="sr-only">
                    Time window
                  </label>
                  <Select
                    value={table.state.filters.days ?? '7'}
                    onValueChange={(value) => table.setFilter('days', value)}
                  >
                    <SelectTrigger id="days">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WINDOWS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            />

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Activity</CardTitle>
                  <CardSubtitle>
                    {num(data.pagination?.total ?? 0)} event(s) in the window
                  </CardSubtitle>
                </div>
              </CardHeader>
              {data.items.length === 0 ? (
                <CardBody>
                  <p className="py-8 text-center text-base text-ink-2">
                    No activity in this window.
                  </p>
                </CardBody>
              ) : (
                <>
                  <AuditTable rows={data.items} />
                  {data.pagination && (
                    <Pagination info={data.pagination} onPageChange={table.setPage} />
                  )}
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </AsyncSection>
  );
}
