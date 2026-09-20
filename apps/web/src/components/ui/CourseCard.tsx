'use client';

import { Clock, Layers, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { cn } from '@/lib/cn';
import { iconFor } from '@/lib/icons';

export interface CourseCardProps {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category?: string;
  courseMode?: 'ONLINE' | 'OFFLINE' | string;
  difficulty?: string;
  durationHours?: number;
  stage?: string;
  icon?: string;
  image?: string;
  enrolledCount?: number;
  progressPct?: number;
  className?: string;
}

/**
 * CourseCard — Premium colorful visual card for courses and employability programs.
 * Integrates image zoom header, category badge, delivery mode pill, and InteractiveArrowButton.
 */
export function CourseCard({
  id,
  slug,
  title,
  description,
  category,
  courseMode,
  difficulty = 'Beginner',
  durationHours,
  stage,
  icon,
  image = '/images/backgrounds/courses.webp',
  enrolledCount,
  progressPct,
  className,
}: CourseCardProps) {
  const Icon = iconFor(icon);
  const isOffline = courseMode === 'OFFLINE';

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800',
        'bg-white dark:bg-slate-900/90 shadow-sm hover:shadow-xl hover:-translate-y-1',
        'transition-all duration-300',
        className,
      )}
    >
      {/* 1. Card Thumbnail Header with hover zoom */}
      <div className="relative h-44 w-full overflow-hidden bg-slate-900">
        <Image
          src={image}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105 opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          {category && (
            <span className="rounded-md bg-indigo-600/90 backdrop-blur-xs px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs">
              {category}
            </span>
          )}
          <Badge
            tone={isOffline ? 'amber' : 'success'}
            className="text-[11px] shadow-xs"
          >
            {isOffline ? 'Campus Cohort' : 'Online Platform'}
          </Badge>
        </div>

        {/* Floating Icon Badge */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-md border border-white/30 shadow-sm">
            <Icon className="size-4.5" aria-hidden />
          </span>
          <span className="text-xs font-medium text-slate-200 capitalize">
            {difficulty}
          </span>
        </div>
      </div>

      {/* 2. Content Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-bold text-base text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 transition-colors">
          {title}
        </h3>

        {description && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
            {description}
          </p>
        )}

        {/* Progress bar if student enrolled */}
        {typeof progressPct === 'number' && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1 font-medium">
              <span className="text-slate-500">Progress</span>
              <span className="text-indigo-600 font-bold">{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Metadata Footer */}
        <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            {durationHours && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {durationHours}h
              </span>
            )}
            {stage && (
              <span className="flex items-center gap-1">
                <Layers className="size-3.5" aria-hidden />
                {stage}
              </span>
            )}
            {typeof enrolledCount === 'number' && enrolledCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {enrolledCount}
              </span>
            )}
          </div>

          <InteractiveArrowButton
            href={`/courses/${slug}`}
            variant="ghost"
            size="sm"
            className="text-indigo-600 font-semibold hover:text-indigo-700"
          >
            Explore
          </InteractiveArrowButton>
        </div>
      </div>
    </div>
  );
}

