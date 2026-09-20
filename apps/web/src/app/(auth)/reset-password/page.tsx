'use client';

import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { OtpInput } from '@/components/auth/otp-input';
import { PasswordStrength, passwordScore } from '@/components/auth/password-strength';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const emailParam = params.get('email') ?? '';
  const token = params.get('token');

  const [email, setEmail] = React.useState(emailParam);
  const [otp, setOtp] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.push('/login'), 2500);
    return () => clearTimeout(timer);
  }, [done, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (password !== confirm) {
      setFieldErrors({ confirm: 'Passwords do not match' });
      return;
    }
    setPending(true);
    try {
      await api.post('/auth/reset-password', {
        ...(token ? { token } : { email: email.trim().toLowerCase(), otp }),
        password,
        confirmPassword: confirm,
      });
      setDone(true);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.message);
      setFieldErrors(apiError.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-success-bg text-success">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-serif text-[24px] font-semibold tracking-tight">Password updated</h1>
        <p className="mt-1.5 text-base text-ink-2">
          Every other device has been signed out. Sign in with your new password.
        </p>
        <Button asChild variant="primary" className="mt-5">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo">
        <ShieldCheck className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 font-serif text-[26px] font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-base text-ink-2">
        {token
          ? 'Your reset link is valid. Pick a password you haven’t used here before.'
          : 'Enter the code we emailed you, then pick a new password.'}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {!token && (
          <>
            <Field label="Email address" htmlFor="email" required error={fieldErrors.email}>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <div>
              <label htmlFor="otp" className="mb-1.5 block text-sm font-semibold">
                Reset code
              </label>
              <OtpInput value={otp} onChange={setOtp} invalid={Boolean(fieldErrors.otp)} />
            </div>
          </>
        )}

        <div>
          <Field label="New password" htmlFor="password" required error={fieldErrors.password}>
            <Input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <PasswordStrength value={password} />
        </div>

        <Field label="Confirm new password" htmlFor="confirm" required error={fieldErrors.confirm}>
          <Input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[10px] bg-danger-bg px-3.5 py-2.5 text-sm font-semibold text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={pending}
          disabled={passwordScore(password) < 2 || (!token && otp.length < 4)}
        >
          Update password
        </Button>
      </form>
    </>
  );
}
