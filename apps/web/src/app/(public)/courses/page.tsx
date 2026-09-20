'use client';

import * as React from 'react';

import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/shared/state';
import { SearchInput } from '@/components/shared/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CourseCard } from '@/components/ui/CourseCard';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

export default function CoursesPage() {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');

  const { data, error, initialLoading, refetch } = useApi<{ items: any[]; categories: string[] }>(
    '/home/courses',
    { search, category, limit: 50 },
    { select: (raw) => ({ items: raw.data, categories: raw.meta?.categories ?? [] }) },
  );

  return (
    <div className="animate-enter pb-16">
      {/* ------------------------------------------------------------------ hero */}
      <section className="relative text-white py-12 sm:py-16">
        <div className="relative mx-auto max-w-[1180px] px-5">
          <Badge tone="indigo" className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium px-3 py-1">
            Structured Curriculum
          </Badge>
          <h1 className="mt-4 font-serif heading-hero text-white max-w-[700px]">
            Explore Employability Programs
          </h1>
          <p className="mt-4 max-w-[620px] text-base sm:text-lg leading-relaxed text-white/80">
            Every program is an outcome-driven path: structured modules, real-world practice, and
            objective evaluations that calculate your true readiness score.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ content */}
      <div className="mx-auto max-w-[1180px] px-5 pt-10">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-line-soft">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search programs…"
            className="w-full sm:w-[320px]"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            {['all', ...(data?.categories ?? [])].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95',
                  category === item
                    ? 'border-indigo bg-indigo text-white shadow-xs'
                    : 'border-line bg-card text-ink-2 hover:bg-slate-50 hover:border-line-soft',
                )}
              >
                {item === 'all' ? 'All Programs' : item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          {initialLoading ? (
            <LoadingSkeleton variant="cards" />
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !data?.items?.length ? (
            <div className="pt-6">
              <EmptyState
                title="No programs match that search"
                body="Try a different keyword, or clear the category filter."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setCategory('all');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((course) => (
                <CourseCard
                  key={course.id}
                  id={course.id}
                  slug={course.slug}
                  title={course.title}
                  description={course.description}
                  category={course.category}
                  courseMode={course.courseMode}
                  difficulty={course.difficulty}
                  durationHours={course.durationHours}
                  stage={course.stage}
                  icon={course.icon}
                  image="/images/backgrounds/courses.webp"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
