'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { motionConfig, usePrefersReducedMotion } from '@/lib/motion-config';

export interface ProgressRingProps {
  value: number; // 0 to 100
  size?: number; // diameter in px
  strokeWidth?: number; // thickness in px
  tone?: 'indigo' | 'cyan' | 'teal' | 'amber' | 'purple' | 'emerald';
  label?: string;
  sublabel?: string;
  className?: string;
}

const toneMap = {
  indigo: {
    stroke: '#6366f1',
    gradient: ['#818cf8', '#4f46e5'],
    glow: 'rgba(99, 102, 241, 0.35)',
  },
  cyan: {
    stroke: '#06b6d4',
    gradient: ['#22d3ee', '#0891b2'],
    glow: 'rgba(6, 182, 212, 0.35)',
  },
  teal: {
    stroke: '#14b8a6',
    gradient: ['#2dd4bf', '#0d9488'],
    glow: 'rgba(20, 184, 166, 0.35)',
  },
  amber: {
    stroke: '#f59e0b',
    gradient: ['#fbbf24', '#d97706'],
    glow: 'rgba(245, 158, 11, 0.35)',
  },
  purple: {
    stroke: '#a855f7',
    gradient: ['#c084fc', '#7e22ce'],
    glow: 'rgba(168, 85, 247, 0.35)',
  },
  emerald: {
    stroke: '#10b981',
    gradient: ['#34d399', '#059669'],
    glow: 'rgba(16, 185, 129, 0.35)',
  },
};

/**
 * ProgressRing — Premium circular SVG meter with animated dashoffset, glowing gradient, and centered readout.
 */
export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 9,
  tone = 'indigo',
  label,
  sublabel,
  className,
}: ProgressRingProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const clampedValue = Math.min(100, Math.max(0, value));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedValue / 100) * circumference;

  const currentTone = toneMap[tone];
  const gradientId = React.useId();

  return (
    <div
      className={cn('relative inline-flex flex-col items-center justify-center select-none', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{
          filter: `drop-shadow(0 0 8px ${currentTone.glow})`,
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={currentTone.gradient[0]} />
            <stop offset="100%" stopColor={currentTone.gradient[1]} />
          </linearGradient>
        </defs>

        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
        />

        {/* Progress indicator */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: prefersReducedMotion
              ? 'none'
              : `stroke-dashoffset ${motionConfig.durations.spacious}ms ${motionConfig.easings.springSmooth}`,
          }}
        />
      </svg>

      {/* Centered Readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-bold text-white tracking-tight" style={{ fontSize: `${Math.round(size * 0.24)}px` }}>
          {label ?? `${Math.round(clampedValue)}%`}
        </span>
        {sublabel && (
          <span
            className="text-white/60 font-medium tracking-wide uppercase"
            style={{ fontSize: `${Math.max(10, Math.round(size * 0.09))}px` }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

