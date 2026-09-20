'use client';

import { AlertTriangle, CheckCircle2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { OtpInput } from '@/components/auth/otp-input';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token');

  const [otp, setOtp] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [resent, setResent] = React.useState(false);

  // One-click verification from the emailed link.
  const verifyToken = React.useCallback(async (linkToken: string) => {
    setPending(true);
    try {
      await api.post('/auth/verify-email', { token: linkToken });
      setDone(true);
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }, []);

  React.useEffect(() => {
    if (token) void verifyToken(token);
  }, [token, verifyToken]);

  React.useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.push('/login'), 2500);
    return () => clearTimeout(timer);
  }, [done, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post('/auth/verify-email', { email, otp });
      setDone(true);
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setError(null);
    setResent(false);
    try {
      await api.post('/auth/resend-otp', { email, purpose: 'verify' });
      setResent(true);
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-success-bg text-success">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-serif text-[24px] font-semibold tracking-tight">Email verified</h1>
        <p className="mt-1.5 text-base text-ink-2">
          Your account is ready. Taking you to sign in…
        </p>
        <Button asChild variant="primary" className="mt-5">
          <Link href="/login">Sign in now</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo">
        <MailCheck className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 font-serif text-[26px] font-semibold tracking-tight">Verify your email</h1>
      <p className="mt-1.5 text-base text-ink-2">
        {email ? (
          <>
            Enter the 6-digit code we sent to <strong className="font-semibold">{email}</strong>.
          </>
        ) : (
          'Enter the 6-digit code from your verification email.'
        )}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="otp" className="mb-1.5 block text-sm font-semibold">
            Verification code
          </label>
          <OtpInput value={otp} onChange={setOtp} invalid={Boolean(error)} />
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[10px] bg-danger-bg px-3.5 py-2.5 text-sm font-semibold text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
        {resent && (
          <p role="status" className="rounded-[10px] bg-success-bg px-3.5 py-2.5 text-sm font-semibold text-success">
            A new code is on its way.
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={pending}
          disabled={otp.length < 4}
        >
          Verify email
        </Button>
      </form>

      <p className="mt-5 text-base text-ink-2">
        Didn’t get it?{' '}
        <button type="button" onClick={resend} className="font-semibold text-indigo hover:underline">
          Send another code
        </button>
      </p>
    </>
  );
}
