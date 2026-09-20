'use client';

import * as React from 'react';

import { cn } from '@/lib/cn';

/** Six single-character boxes that behave like one field: paste, arrows and backspace all work. */
export function OtpInput({
  value,
  onChange,
  length = 6,
  id = 'otp',
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  id?: string;
  invalid?: boolean;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  function write(index: number, next: string) {
    const cleaned = next.replace(/\D/g, '');
    if (!cleaned) {
      const chars = digits.slice();
      chars[index] = ' ';
      onChange(chars.join('').trimEnd());
      return;
    }
    const chars = digits.slice();
    // A pasted code fills the remaining boxes.
    for (let offset = 0; offset < cleaned.length && index + offset < length; offset += 1) {
      chars[index + offset] = cleaned[offset];
    }
    onChange(chars.join('').replace(/\s/g, ''));
    const focusAt = Math.min(length - 1, index + cleaned.length);
    refs.current[focusAt]?.focus();
  }

  return (
    <div className="flex gap-2" role="group" aria-label={`${length}-digit code`}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={index === 0 ? id : undefined}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={invalid || undefined}
          maxLength={length}
          value={digit.trim()}
          onChange={(event) => write(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digit.trim() && index > 0) {
              refs.current[index - 1]?.focus();
            }
            if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
            if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
          }}
          className={cn(
            'tnum h-12 w-full rounded-[10px] border bg-white text-center text-[18px] font-semibold',
            'focus-visible:border-indigo',
            invalid ? 'border-danger' : 'border-line',
          )}
        />
      ))}
    </div>
  );
}
