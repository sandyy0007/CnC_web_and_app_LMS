'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

const fieldClasses =
  'w-full rounded-[9px] border border-white/14 bg-slate-900/75 px-3 py-2 text-base text-white ' +
  'placeholder:text-slate-400 transition-all duration-150 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 focus:outline-none ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500/20 backdrop-blur-md';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldClasses, 'h-9', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldClasses, 'min-h-[84px] resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, children, required, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('mb-1.5 block text-sm font-semibold text-slate-200', className)}
    {...props}
  >
    {children}
    {required && (
      <span className="ml-0.5 text-rose-400" aria-hidden>
        *
      </span>
    )}
  </LabelPrimitive.Root>
));
Label.displayName = 'Label';

/** Field-level error, announced to screen readers (§28). */
export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-rose-400">
      <AlertCircle className="mt-[2px] size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error && <p className="mt-1.5 text-sm text-slate-300">{hint}</p>}
      <FieldError id={`${htmlFor}-error`}>{error}</FieldError>
    </div>
  );
}
