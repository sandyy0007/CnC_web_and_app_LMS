'use client';

import { KeyRound, Laptop, LogOut, Save, ShieldCheck, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PasswordStrength, passwordScore } from '@/components/auth/password-strength';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAppDispatch } from '@/store';
import { signOutEverywhere } from '@/store/authSlice';

const TOGGLES: { key: string; label: string; help: string }[] = [
  {
    key: 'emailNotifications',
    label: 'Email notifications',
    help: 'Class reminders, assignment deadlines and score updates by email.',
  },
  {
    key: 'pushNotifications',
    label: 'Push notifications',
    help: 'Browser and mobile push for reminders and new feedback.',
  },
  {
    key: 'smsNotifications',
    label: 'SMS notifications',
    help: 'Only used for urgent notices, if your institution has SMS enabled.',
  },
  {
    key: 'classRecordings',
    label: 'Class recordings',
    help: 'Allow recordings of live classes you attend to be kept for review.',
  },
  {
    key: 'recordingConsent',
    label: 'Practice recording consent',
    help: 'Required to capture audio in the Practice Lab. Turning this off disables recording — you can still practise by typing.',
  },
  {
    key: 'profileVisibleToRecruiters',
    label: 'Profile visible to recruiters',
    help: 'Let verified recruiters brought in by your placement cell see your readiness profile.',
  },
];

export default function StudentSettingsPage() {
  const dispatch = useAppDispatch();
  const query = useApi<any>('/student/settings');

  const [prefs, setPrefs] = React.useState<Record<string, boolean>>({});
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [changing, setChanging] = React.useState(false);
  const [passwordErrors, setPasswordErrors] = React.useState<Record<string, string>>({});
  const [signOutAllOpen, setSignOutAllOpen] = React.useState(false);

  React.useEffect(() => {
    if (query.data?.preferences) setPrefs(query.data.preferences);
  }, [query.data]);

  async function savePrefs() {
    setSaving(true);
    try {
      await api.patch('/student/settings', prefs);
      toast.success('Preferences saved');
      setDirty(false);
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordErrors({});
    if (next !== confirm) {
      setPasswordErrors({ confirm: 'Passwords do not match' });
      return;
    }
    setChanging(true);
    try {
      const response = await api.post('/auth/change-password', {
        currentPassword: current,
        password: next,
        confirmPassword: confirm,
      });
      toast.success(response.message ?? 'Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
      query.refetch();
    } catch (caught) {
      const apiError = caught as ApiError;
      setPasswordErrors(apiError.fieldErrors);
      toast.error(apiError.message);
    } finally {
      setChanging(false);
    }
  }

  async function revoke(sessionId: string) {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      toast.success('That device has been signed out');
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    }
  }

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => (
        <div className="mx-auto max-w-[760px]">
          <PageHeader
            title="Settings"
            description="Notifications, privacy and the devices signed in to your account."
          />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Notifications &amp; privacy</CardTitle>
                <CardSubtitle>Applies to this account only</CardSubtitle>
              </div>
              {dirty && (
                <Button variant="primary" size="sm" loading={saving} onClick={savePrefs}>
                  <Save className="size-3.5" aria-hidden />
                  Save changes
                </Button>
              )}
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-line-soft">
                {TOGGLES.map((toggle) => (
                  <li key={toggle.key} className="flex items-start gap-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`toggle-${toggle.key}`}
                        className="text-base font-semibold"
                      >
                        {toggle.label}
                      </label>
                      <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{toggle.help}</p>
                    </div>
                    <Switch
                      id={`toggle-${toggle.key}`}
                      checked={Boolean(prefs[toggle.key])}
                      onCheckedChange={(value) => {
                        setPrefs((currentPrefs) => ({ ...currentPrefs, [toggle.key]: value }));
                        setDirty(true);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card className="mt-5">
            <CardHeader>
              <div>
                <CardTitle>Change password</CardTitle>
                <CardSubtitle>
                  Changing your password signs out every other device
                </CardSubtitle>
              </div>
              <KeyRound className="size-4 text-ink-3" aria-hidden />
            </CardHeader>
            <CardBody>
              <form onSubmit={changePassword} className="space-y-4" noValidate>
                <Field
                  label="Current password"
                  htmlFor="currentPassword"
                  required
                  error={passwordErrors.currentPassword}
                >
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                    required
                  />
                </Field>
                <div>
                  <Field
                    label="New password"
                    htmlFor="newPassword"
                    required
                    error={passwordErrors.password}
                  >
                    <Input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      value={next}
                      onChange={(event) => setNext(event.target.value)}
                      required
                    />
                  </Field>
                  <PasswordStrength value={next} />
                </div>
                <Field
                  label="Confirm new password"
                  htmlFor="confirmPassword"
                  required
                  error={passwordErrors.confirm ?? passwordErrors.confirmPassword}
                >
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                  />
                </Field>
                <Button
                  type="submit"
                  variant="primary"
                  loading={changing}
                  disabled={!current || passwordScore(next) < 2}
                >
                  Change password
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card className="mt-5">
            <CardHeader>
              <div>
                <CardTitle>Signed-in devices</CardTitle>
                <CardSubtitle>{data.sessions.length} active session(s)</CardSubtitle>
              </div>
              <ShieldCheck className="size-4 text-ink-3" aria-hidden />
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-line-soft">
                {data.sessions.map((session: any) => (
                  <li key={session.id} className="flex flex-wrap items-center gap-3 py-3.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-app text-ink-2">
                      <Laptop className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-[180px] flex-1">
                      <p className="truncate text-base font-semibold">
                        {session.userAgent ?? 'Unknown device'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-3">
                        {session.ip ?? 'unknown IP'} · last used{' '}
                        {formatDate(session.lastUsedAt, true)}
                      </p>
                    </div>
                    {session.current ? (
                      <Badge tone="success">This device</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revoke(session.sessionId)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              <Button
                variant="danger"
                size="sm"
                className="mt-4"
                onClick={() => setSignOutAllOpen(true)}
              >
                <LogOut className="size-3.5" aria-hidden />
                Sign out of all devices
              </Button>
            </CardBody>
          </Card>

          <ConfirmDialog
            open={signOutAllOpen}
            onOpenChange={setSignOutAllOpen}
            title="Sign out everywhere?"
            description="Every device, including this one, will be signed out. You'll need to sign in again."
            confirmLabel="Sign out everywhere"
            tone="danger"
            onConfirm={() => {
              void dispatch(signOutEverywhere());
            }}
          />
        </div>
      )}
    </AsyncSection>
  );
}
