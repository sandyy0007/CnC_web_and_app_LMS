'use client';

import { AlertTriangle, KeyRound, MailCheck } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <>
        <span className="flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo">
          <MailCheck className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-serif text-[26px] font-semibold tracking-tight">Check your email</h1>
        <p className="mt-1.5 text-base text-ink-2">
          If an account exists for {email.trim().toLowerCase()}, we’ve sent a reset code and a
          one-click link. The code expires shortly, so use it soon.
        </p>
        <Button asChild variant="primary" className="mt-5 w-full" size="lg">
          <Link href={`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}>
            I have a code
          </Link>
        </Button>
        <p className="mt-5 text-base text-ink-2">
          <Link href="/login" className="font-semibold text-indigo hover:underline">
            Back to sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo">
        <KeyRound className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 font-serif text-[26px] font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-base text-ink-2">
        Enter the email address on your account and we’ll send a code. Resetting signs you out of
        every device.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="Email address" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[10px] bg-danger-bg px-3.5 py-2.5 text-sm font-semibold text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Send reset instructions
        </Button>
      </form>

      <p className="mt-5 text-base text-ink-2">
        <Link href="/login" className="font-semibold text-indigo hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
