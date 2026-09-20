'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';

interface ImageHeroProps {
  image: string;
  imageAlt?: string;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: 'banner' | 'split' | 'card';
  className?: string;
  imageClassName?: string;
  overlayOpacity?: 'light' | 'medium' | 'dark';
}

export function ImageHero({
  image,
  imageAlt = 'Platform visual',
  title,
  subtitle,
  eyebrow,
  badge,
  actions,
  variant = 'banner',
  className,
  imageClassName,
  overlayOpacity = 'medium',
}: ImageHeroProps) {
  const overlayClasses = {
    light: 'bg-navy-950/30 backdrop-blur-[2px]',
    medium: 'bg-navy-950/50 backdrop-blur-[1px]',
    dark: 'bg-navy-950/70',
  };

  if (variant === 'split') {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm',
          className
        )}
      >
        <div className="grid lg:grid-cols-12 items-center">
          <div className="lg:col-span-7 p-6 sm:p-8 space-y-4">
            {badge || (eyebrow && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800">
                {eyebrow}
              </span>
            ))}
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300 max-w-xl">
                {subtitle}
              </p>
            )}
            {actions && <div className="pt-2 flex flex-wrap gap-3">{actions}</div>}
          </div>

          <div className="lg:col-span-5 relative h-56 sm:h-72 lg:h-full min-h-[220px] overflow-hidden bg-slate-100 dark:bg-slate-800">
            <Image
              src={image}
              alt={imageAlt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 40vw"
              className={cn('object-cover object-center transition-transform duration-700 hover:scale-105', imageClassName)}
            />
            <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-white dark:from-slate-900 via-transparent to-transparent lg:w-24 pointer-events-none" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/10 shadow-lg min-h-[190px] sm:min-h-[240px] flex flex-col justify-end p-6 sm:p-8 text-white',
        className
      )}
    >
      {/* 1. Underlying Real Image */}
      <Image
        src={image}
        alt={imageAlt}
        fill
        priority
        sizes="100vw"
        className={cn('object-cover object-center', imageClassName)}
      />

      {/* 2. Translucent Gradient Overlay (NEVER completely opaque solid) */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-r from-navy-950/85 via-navy-950/60 to-navy-950/30',
          overlayClasses[overlayOpacity]
        )}
      />

      {/* 3. Content Layer */}
      <div className="relative z-10 space-y-2 max-w-2xl">
        {badge || (eyebrow && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-white/15 text-indigo-200 backdrop-blur-md border border-white/20">
            {eyebrow}
          </span>
        ))}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white drop-shadow-md">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed font-normal max-w-xl drop-shadow-sm">
            {subtitle}
          </p>
        )}
        {actions && <div className="pt-3 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  );
}

