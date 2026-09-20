'use client';

import { Check, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * Mirrors the backend's password policy so a user is not told "too weak" only after submitting.
 * The backend is still the authority: it re-checks the same rules on every write.
 */
export const PASSWORD_RULES = [
  { test: (value: string) => value.length >= 8, label: 'At least 8 characters' },
  { test: (value: string) => /[A-Z]/.test(value), label: 'One uppercase letter' },
  { test: (value: string) => /[a-z]/.test(value), label: 'One lowercase letter' },
  { test: (value: string) => /\d/.test(value), label: 'One number' },
  { test: (value: string) => /[^A-Za-z0-9]/.test(value), label: 'One symbol' },
];

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const TONES = ['bg-danger', 'bg-danger', 'bg-amber', 'bg-success', 'bg-success'];

export function passwordScore(value: string): number {
  if (!value) return 0;
  const passed = PASSWORD_RULES.filter((rule) => rule.test(value)).length;
  return Math.max(0, Math.min(4, passed - 1));
}

export function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value);
  const unmet = PASSWORD_RULES.filter((rule) => !rule.test(value));

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                value && index <= score ? TONES[score] : 'bg-line',
              )}
            />
          ))}
        </div>
        <span className="w-[76px] text-right text-xs font-semibold text-ink-2">
          {value ? LABELS[score] : ''}
        </span>
      </div>
      <p role="status" className="sr-only">
        {value ? `Password strength: ${LABELS[score]}` : ''}
      </p>
      {value && unmet.length > 0 && (
        <ul className="mt-2 space-y-1">
          {PASSWORD_RULES.map((rule) => {
            const ok = rule.test(value);
            return (
              <li
                key={rule.label}
                className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-success' : 'text-ink-3')}
              >
                {ok ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
                {rule.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
