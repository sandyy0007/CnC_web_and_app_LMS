'use client';

import * as React from 'react';
import { SearchInput } from '@/components/shared/filter-bar';
import { AsyncSection, EmptyState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

export default function PublicTrainersPage() {
  const query = useApi<any[]>('/home/trainers', { limit: 50 });
  const [search, setSearch] = React.useState('');
  const [selectedDept, setSelectedDept] = React.useState('all');

  return (
    <div className="animate-enter pb-16">
      {/* ------------------------------------------------------------------ hero */}
      <section className="relative text-white py-12 sm:py-16">
        <div className="relative mx-auto max-w-[1180px] px-5">
          <Badge tone="indigo" className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium px-3 py-1">
            Institution Faculty
          </Badge>
          <h1 className="mt-4 font-serif heading-hero text-white max-w-[700px]">
            Expert Trainers Who Mentor & Assess You
          </h1>
          <p className="mt-4 max-w-[640px] text-base sm:text-lg leading-relaxed text-white/80">
            Your own faculty members rate every parameter on evidence, never an anonymous
            algorithm. Direct mentorship across core domains.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ trainers grid */}
      <div className="mx-auto max-w-[1180px] px-5 pt-10">
        <AsyncSection query={query} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
          {(allTrainers) => {
            const departments = Array.from(
              new Set(allTrainers.map((t) => t.department).filter(Boolean)),
            ) as string[];

            const filtered = allTrainers.filter((trainer) => {
              const matchesDept =
                selectedDept === 'all' || trainer.department === selectedDept;
              const term = search.toLowerCase().trim();
              const matchesSearch =
                !term ||
                trainer.name?.toLowerCase().includes(term) ||
                trainer.department?.toLowerCase().includes(term) ||
                trainer.designation?.toLowerCase().includes(term) ||
                trainer.expertise?.some((e: string) => e.toLowerCase().includes(term));
              return matchesDept && matchesSearch;
            });

            return (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-line-soft">
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search faculty by name or skill…"
                    className="w-full sm:w-[320px]"
                  />
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by department">
                    <button
                      type="button"
                      onClick={() => setSelectedDept('all')}
                      className={cn(
                        'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150',
                        selectedDept === 'all'
                          ? 'border-indigo bg-indigo text-white shadow-xs'
                          : 'border-line bg-card text-ink-2 hover:bg-slate-50',
                      )}
                    >
                      All Departments ({allTrainers.length})
                    </button>
                    {departments.map((dept) => (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setSelectedDept(dept)}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150',
                          selectedDept === dept
                            ? 'border-indigo bg-indigo text-white shadow-xs'
                            : 'border-line bg-card text-ink-2 hover:bg-slate-50',
                        )}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <div className="pt-10">
                    <EmptyState
                      title="No trainers match that filter"
                      body="Try searching with different terms or select 'All Departments'."
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSearch('');
                            setSelectedDept('all');
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {filtered.map((trainer) => (
                      <Card
                        key={trainer.id}
                        className="card-interactive group flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover"
                      >
                        <CardBody className="p-5 flex flex-col h-full">
                          <div className="flex items-center gap-3">
                            <Avatar name={trainer.name} color={trainer.avatarColor} size={48} />
                            <div className="min-w-0 flex-1">
                              <h2 className="text-base font-semibold text-ink-1 group-hover:text-indigo-600 transition-colors truncate">
                                {trainer.name}
                              </h2>
                              <p className="text-xs font-medium text-ink-3 truncate">{trainer.department}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs font-medium text-indigo-600 uppercase tracking-wide">
                            {trainer.designation}
                          </p>
                          {trainer.bio && (
                            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-2">
                              {trainer.bio}
                            </p>
                          )}
                          {trainer.expertise?.length > 0 && (
                            <div className="mt-auto pt-4 flex flex-wrap gap-1.5">
                              {trainer.expertise.map((item: string) => (
                                <Badge key={item} tone="indigo">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </AsyncSection>
      </div>
    </div>
  );
}
