'use client';

import { AlertTriangle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/misc';
import { Field, Input, Label } from '@/components/ui/input';
import { ROLE_LABEL, type Role } from '@/lib/roleRoutes';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearAuthError, signIn } from '@/store/authSlice';

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useSearchParams();
  const { signingIn, error, status, user } = useAppSelector((state) => state.auth);

  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);
  const [needsVerification, setNeedsVerification] = React.useState<string | null>(null);

  const hintedRole = params.get('role') as Role | null;
  const next = params.get('next');

  // Already signed in (or just signed in): go where this role belongs.
  React.useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace(next && next.startsWith('/') ? next : user.home);
    }
  }, [status, user, next, router]);

  React.useEffect(() => () => void dispatch(clearAuthError()), [dispatch]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNeedsVerification(null);
    const result = await dispatch(
      signIn({ identifier: identifier.trim(), password, rememberMe: remember }),
    );
    const payload = result.payload as any;
    if (result.meta.requestStatus === 'rejected' && payload?.verificationRequired) {
      setNeedsVerification(payload.email ?? identifier.trim());
    }
  }

  return (
    <>
      <h1 className="font-serif heading-section font-semibold tracking-tight text-ink-1">Sign in</h1>
      <p className="mt-2 text-base text-ink-2">
        {hintedRole
          ? `${ROLE_LABEL[hintedRole] ?? 'Portal'} access — use your institution email or ID.`
          : 'Use your institution email address or your institution ID.'}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="Email or institution ID" htmlFor="identifier">
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="you@college.edu or CSE21042"
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={reveal ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
            >
              {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
          <Checkbox checked={remember} onCheckedChange={(value) => setRemember(Boolean(value))} />
          Keep me signed in on this device
        </label>

        {error && !needsVerification && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/15 border border-rose-500/30 px-3.5 py-2.5 text-sm font-semibold text-rose-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-rose-400" aria-hidden />
            {error}
          </p>
        )}

        {needsVerification && (
          <div role="alert" className="rounded-xl bg-amber-500/15 border border-amber-500/30 px-3.5 py-3 text-sm text-amber-200">
            <p className="font-semibold text-amber-300">Your email isn’t verified yet</p>
            <p className="mt-1 text-slate-200">We’ve sent a fresh code to {needsVerification}.</p>
            <Link
              href={`/verify-email?email=${encodeURIComponent(needsVerification)}`}
              className="mt-2 inline-flex items-center gap-1 font-semibold text-amber-300 underline hover:text-amber-200"
            >
              Enter the code
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        )}

        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={signingIn}>
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-sm text-slate-300">
        Don’t have an account?{' '}
        <Link href="/signup" className="font-semibold text-indigo-400 hover:text-indigo-300 hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}
