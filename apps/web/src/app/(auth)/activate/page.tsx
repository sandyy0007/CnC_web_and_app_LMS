'use client';

import { AlertTriangle, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { PasswordStrength, passwordScore } from '@/components/auth/password-strength';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { api, type ApiError } from '@/lib/api';

interface TokenInfo {
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  collegeName: string;
  departmentName?: string;
}

export default function AccountActivationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loadingToken, setLoadingToken] = React.useState(true);
  const [tokenInfo, setTokenInfo] = React.useState<TokenInfo | null>(null);
  const [tokenError, setTokenError] = React.useState<string | null>(null);

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activated, setActivated] = React.useState(false);

  React.useEffect(() => {
    if (!token) {
      setLoadingToken(false);
      setTokenError('No activation token provided. Please use the link provided in your welcome invite.');
      return;
    }

    async function verify() {
      try {
        const res = await api.get<any>(`/auth/verify-activation-token?token=${encodeURIComponent(token)}`);
        setTokenInfo(res?.data || res);
      } catch (err: any) {
        setTokenError(err.message || 'Invalid or expired activation link.');
      } finally {
        setLoadingToken(false);
      }
    }
    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (passwordScore(password) < 3) {
      setError('Please choose a stronger password matching the security criteria.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/activate', {
        token,
        newPassword: password,
      });
      setActivated(true);
      setTimeout(() => {
        router.push('/login?activated=true');
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Activation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingToken) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="size-8 text-indigo animate-spin mb-3" />
        <p className="text-sm text-slate-500 font-medium">Validating activation link…</p>
      </div>
    );
  }

  if (tokenError || !tokenInfo) {
    return (
      <Card className="max-w-md mx-auto">
        <CardBody className="p-8 text-center space-y-4">
          <div className="size-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Activation Link Invalid or Expired</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {tokenError || 'The activation link you followed is invalid or has expired (validity: 7 days).'}
          </p>
          <div className="pt-2">
            <Button asChild variant="secondary" className="w-full">
              <Link href="/login">Return to Sign In</Link>
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (activated) {
    return (
      <Card className="max-w-md mx-auto">
        <CardBody className="p-8 text-center space-y-4">
          <div className="size-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Account Successfully Activated!</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your permanent password has been set. Redirecting to sign in…
          </p>
          <div className="pt-2">
            <Button asChild variant="primary" className="w-full">
              <Link href="/login">Proceed to Login Now</Link>
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6 space-y-2">
        <div className="flex items-center gap-2">
          <Badge tone="indigo">{tokenInfo.roleLabel}</Badge>
          <Badge tone="success">Verified Invitation</Badge>
        </div>
        <h1 className="font-serif text-[24px] font-bold text-slate-900">
          Activate Your Account
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          Welcome, <strong className="text-slate-700">{tokenInfo.name}</strong> ({tokenInfo.email})! You have been provisioned as {tokenInfo.roleLabel} for <strong className="text-slate-700">{tokenInfo.collegeName}</strong>.
          Please set your permanent password to complete account setup.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <Field label="Permanent Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose a strong password"
          />
        </Field>

        <PasswordStrength value={password} />

        <Field label="Confirm Permanent Password" htmlFor="confirmPassword" required>
          <Input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
          />
        </Field>

        <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
          <ShieldCheck className="size-4 shrink-0 text-emerald-600 mt-0.5" />
          <span>
            Your account credentials are encrypted and stored in compliance with institutional security standards. Single-use token will be consumed immediately upon submission.
          </span>
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={submitting}
          disabled={submitting || !password || !confirmPassword}
        >
          <KeyRound className="size-4 mr-2" />
          Complete Activation & Set Password
        </Button>
      </form>
    </div>
  );
}
