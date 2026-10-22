'use client';

import {
  CalendarDays,
  FileText,
  Pencil,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { RadialScore } from '@/components/charts';
import { DetailList } from '@/components/shared/misc';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar, ScoreCard } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Avatar } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num, pct } from '@/lib/format';
import { useAppDispatch } from '@/store';
import { userUpdated } from '@/store/authSlice';

export default function StudentProfilePage() {
  const dispatch = useAppDispatch();
  const query = useApi<any>('/student/profile');

  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [form, setForm] = React.useState<Record<string, string>>({});

  // Goal editing
  const [goalForm, setGoalForm] = React.useState<Record<string, string>>({});
  const [savingGoal, setSavingGoal] = React.useState(false);

  React.useEffect(() => {
    const data = query.data;
    if (!data) return;
    setForm({
      name: data.account.name ?? '',
      phone: data.account.phone ?? '',
      section: data.profile.section ?? '',
      program: data.profile.program ?? '',
      guardianName: data.profile.guardianInfo?.name ?? '',
      guardianPhone: data.profile.guardianInfo?.phone ?? '',
      bio: data.profile.bio ?? '',
    });
    if (data.placementGoal) {
      setGoalForm({
        targetRole: data.placementGoal.targetRole ?? '',
        targetScore: String(data.placementGoal.targetScore ?? ''),
        targetDate: String(data.placementGoal.targetDate ?? '').slice(0, 10),
        focusAreas: (data.placementGoal.focusAreas ?? []).join(', '),
      });
    }
  }, [query.data]);

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const response = await api.patch('/student/profile', {
        name: form.name || undefined,
        phone: form.phone || undefined,
        section: form.section || undefined,
        program: form.program || undefined,
        guardianName: form.guardianName || undefined,
        guardianPhone: form.guardianPhone || undefined,
        bio: form.bio || undefined,
      });
      toast.success(response.message ?? 'Profile updated');
      if (form.name) dispatch(userUpdated({ name: form.name }));
      setEditing(false);
      query.refetch();
    } catch (caught) {
      const apiError = caught as ApiError;
      setFieldErrors(apiError.fieldErrors);
      toast.error(apiError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveGoal() {
    setSavingGoal(true);
    try {
      await api.put('/student/placement-goal', {
        targetRole: goalForm.targetRole,
        targetScore: Number(goalForm.targetScore),
        targetDate: goalForm.targetDate,
        focusAreas: goalForm.focusAreas
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      toast.success('Career goal saved');
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setSavingGoal(false);
    }
  }

  return (
    <GlobalPageBackground
      image="/images/backgrounds/profile.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <AsyncSection query={query} skeleton="detail">
      {(data) => {
        const goal = data.placementGoal;
        return (
          <>
            <PageHeader
              title="My Profile & Plan"
              description="Your details, your career goals and the roadmap the platform derives from your scores."
              actions={
                <Button
                  variant={editing ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => setEditing((value) => !value)}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  {editing ? 'Cancel editing' : 'Edit profile'}
                </Button>
              }
            />

            <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
              {/* ---------------------------------------------------------- summary */}
              <div className="space-y-5">
                <Card>
                  <CardBody className="text-center">
                    <Avatar
                      name={data.profile.name}
                      color={data.profile.avatarColor}
                      size={64}
                      className="mx-auto"
                    />
                    <p className="mt-3 text-md font-semibold">{data.profile.name}</p>
                    <p className="text-sm text-ink-2">{data.profile.rollNumber}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {data.profile.departmentName} · {data.profile.batchName}
                    </p>
                    <div className="mt-4">
                      <ProgressBar
                        label="Profile completeness"
                        value={data.profileCompleteness}
                      />
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="text-center">
                    <RadialScore
                      value={data.readiness.score}
                      label="Readiness"
                      size={104}
                      thickness={9}
                    />
                    <p className="mt-2.5 text-md font-semibold">Readiness score</p>
                    {data.readiness.delta != null && (
                      <p
                        className={cn(
                          'tnum text-sm font-bold',
                          data.readiness.delta >= 0 ? 'text-success' : 'text-danger',
                        )}
                      >
                        {data.readiness.delta >= 0 ? '+' : ''}
                        {data.readiness.delta} since last update
                      </p>
                    )}
                    <Button asChild variant="ghost" size="sm" className="mt-2.5">
                      <Link href="/student/progress">
                        <TrendingUp className="size-3.5" aria-hidden />
                        See my progress
                      </Link>
                    </Button>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Resume</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <p className="flex items-center gap-2 text-base">
                      <FileText className="size-4 text-ink-3" aria-hidden />
                      {data.resume.status === 'missing' ? 'Not uploaded yet' : 'Uploaded'}
                    </p>
                    {data.resume.lastUpdatedAt && (
                      <p className="mt-1 text-xs text-ink-3">
                        Updated {formatDate(data.resume.lastUpdatedAt)}
                      </p>
                    )}
                    <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
                      <Link href="/student/resume-analyzer">Open Resume Analyzer</Link>
                    </Button>
                  </CardBody>
                </Card>
              </div>

              {/* ----------------------------------------------------------- detail */}
              <div>
                <Tabs defaultValue="details">
                  <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="plan">Career plan</TabsTrigger>
                    <TabsTrigger value="week">This week</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Personal details</CardTitle>
                          <CardSubtitle>
                            Your roll number, department and batch are set by your institution
                          </CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody>
                        {editing ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
                              <Input
                                id="name"
                                value={form.name ?? ''}
                                onChange={(event) =>
                                  setForm((current) => ({ ...current, name: event.target.value }))
                                }
                              />
                            </Field>
                            <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
                              <Input
                                id="phone"
                                value={form.phone ?? ''}
                                onChange={(event) =>
                                  setForm((current) => ({ ...current, phone: event.target.value }))
                                }
                              />
                            </Field>
                            <Field label="Section" htmlFor="section" error={fieldErrors.section}>
                              <Input
                                id="section"
                                value={form.section ?? ''}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    section: event.target.value,
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Program" htmlFor="program" error={fieldErrors.program}>
                              <Input
                                id="program"
                                value={form.program ?? ''}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    program: event.target.value,
                                  }))
                                }
                              />
                            </Field>
                            <Field
                              label="Guardian name"
                              htmlFor="guardianName"
                              error={fieldErrors.guardianName}
                            >
                              <Input
                                id="guardianName"
                                value={form.guardianName ?? ''}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    guardianName: event.target.value,
                                  }))
                                }
                              />
                            </Field>
                            <Field
                              label="Guardian phone"
                              htmlFor="guardianPhone"
                              error={fieldErrors.guardianPhone}
                            >
                              <Input
                                id="guardianPhone"
                                value={form.guardianPhone ?? ''}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    guardianPhone: event.target.value,
                                  }))
                                }
                              />
                            </Field>
                            <Field
                              label="About me"
                              htmlFor="bio"
                              className="sm:col-span-2"
                              error={fieldErrors.bio}
                            >
                              <Textarea
                                id="bio"
                                rows={4}
                                value={form.bio ?? ''}
                                onChange={(event) =>
                                  setForm((current) => ({ ...current, bio: event.target.value }))
                                }
                              />
                            </Field>
                            <div className="sm:col-span-2">
                              <Button variant="primary" loading={saving} onClick={save}>
                                <Save className="size-3.5" aria-hidden />
                                Save changes
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <DetailList
                            rows={[
                              { label: 'Full name', value: data.account.name },
                              { label: 'Email', value: data.account.email },
                              { label: 'Phone', value: data.account.phone ?? '—' },
                              { label: 'Roll number', value: data.profile.rollNumber },
                              { label: 'Department', value: data.profile.departmentName },
                              {
                                label: 'Batch',
                                value: data.profile.batchName
                                  ? data.profile.batchCode
                                    ? `${data.profile.batchName} (${data.profile.batchCode})`
                                    : data.profile.batchName
                                  : '—',
                              },
                              {
                                label: 'Semester',
                                value: data.profile.semester != null ? `Semester ${data.profile.semester}` : '—',
                              },
                              { label: 'Section', value: data.profile.section ?? '—' },
                              { label: 'Program', value: data.profile.program ?? '—' },
                              {
                                label: 'Guardian',
                                value: data.profile.guardianInfo?.name
                                  ? `${data.profile.guardianInfo.name} · ${data.profile.guardianInfo.phone ?? ''}`
                                  : '—',
                              },
                            ]}
                          />
                        )}
                      </CardBody>
                    </Card>

                    <Card className="mt-5">
                      <CardHeader>
                        <div>
                          <CardTitle>Account security</CardTitle>
                          <CardSubtitle>Manage devices and your password in Settings</CardSubtitle>
                        </div>
                        <ShieldCheck className="size-4 text-ink-3" aria-hidden />
                      </CardHeader>
                      <CardBody>
                        <DetailList
                          rows={[
                            {
                              label: 'Password changed',
                              value: data.account.lastPasswordChangeAt
                                ? formatDate(data.account.lastPasswordChangeAt, true)
                                : 'Never changed',
                            },
                            {
                              label: 'Two-factor',
                              value: data.account.twoFactorEnabled ? 'Enabled' : 'Not enabled',
                            },
                          ]}
                        />
                        <Button asChild variant="secondary" size="sm" className="mt-3.5">
                          <Link href="/student/settings">Open Settings</Link>
                        </Button>
                      </CardBody>
                    </Card>
                  </TabsContent>

                  <TabsContent value="plan">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>Career goal</CardTitle>
                          <CardSubtitle>
                            {goal
                              ? `Target ${goal.targetScore} by ${formatDate(goal.targetDate)}`
                              : 'Set a target and the roadmap follows'}
                          </CardSubtitle>
                        </div>
                        <Target className="size-4 text-amber" aria-hidden />
                      </CardHeader>
                      <CardBody>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Target role" htmlFor="targetRole">
                            <Input
                              id="targetRole"
                              value={goalForm.targetRole ?? ''}
                              onChange={(event) =>
                                setGoalForm((current) => ({
                                  ...current,
                                  targetRole: event.target.value,
                                }))
                              }
                              placeholder="Software Engineer"
                            />
                          </Field>
                          <Field label="Target readiness score" htmlFor="targetScore">
                            <Input
                              id="targetScore"
                              type="number"
                              min={0}
                              max={100}
                              value={goalForm.targetScore ?? ''}
                              onChange={(event) =>
                                setGoalForm((current) => ({
                                  ...current,
                                  targetScore: event.target.value,
                                }))
                              }
                            />
                          </Field>
                          <Field label="Target date" htmlFor="targetDate">
                            <Input
                              id="targetDate"
                              type="date"
                              value={goalForm.targetDate ?? ''}
                              onChange={(event) =>
                                setGoalForm((current) => ({
                                  ...current,
                                  targetDate: event.target.value,
                                }))
                              }
                            />
                          </Field>
                          <Field
                            label="Focus areas"
                            htmlFor="focusAreas"
                            hint="Comma separated"
                          >
                            <Input
                              id="focusAreas"
                              value={goalForm.focusAreas ?? ''}
                              onChange={(event) =>
                                setGoalForm((current) => ({
                                  ...current,
                                  focusAreas: event.target.value,
                                }))
                              }
                            />
                          </Field>
                        </div>
                        <Button
                          variant="primary"
                          className="mt-4"
                          loading={savingGoal}
                          onClick={saveGoal}
                          disabled={!goalForm.targetRole || !goalForm.targetDate}
                        >
                          <Save className="size-3.5" aria-hidden />
                          Save goal
                        </Button>
                      </CardBody>
                    </Card>

                    {goal && (
                      <>
                        <Card className="mt-5">
                          <CardHeader>
                            <div>
                              <CardTitle>Gap to target</CardTitle>
                              <CardSubtitle>
                                Currently {num(goal.currentScore, 1)} of {num(goal.targetScore, 0)}
                              </CardSubtitle>
                            </div>
                          </CardHeader>
                          <CardBody>
                            <ProgressBar
                              value={(goal.currentScore / Math.max(1, goal.targetScore)) * 100}
                              label={`${pct((goal.currentScore / Math.max(1, goal.targetScore)) * 100, 0)} of the way there`}
                            />
                            <div className="mt-4 space-y-3.5">
                              {(goal.skillGaps ?? []).map((gap: any) => (
                                <ScoreCard key={gap.label} label={gap.label} value={gap.score} />
                              ))}
                            </div>
                            {goal.focusAreas?.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-1.5">
                                {goal.focusAreas.map((area: string) => (
                                  <Badge key={area} tone="indigo">
                                    {area}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </CardBody>
                        </Card>

                        <Card className="mt-5">
                          <CardHeader>
                            <div>
                              <CardTitle>Roadmap</CardTitle>
                              <CardSubtitle>Derived from your lowest pillar scores</CardSubtitle>
                            </div>
                          </CardHeader>
                          <CardBody>
                            <ol className="space-y-3.5">
                              {(goal.roadmap ?? []).map((step: any) => (
                                <li key={step.step} className="flex items-start gap-3">
                                  <span className="tnum mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo text-2xs font-bold text-white">
                                    {step.step}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-base font-semibold">{step.title}</p>
                                    <p className="mt-0.5 text-sm text-ink-2">{step.detail}</p>
                                    <ProgressBar
                                      value={step.percent}
                                      className="mt-2"
                                      showValue={false}
                                      thin
                                    />
                                  </div>
                                  <Badge tone={step.state === 'completed' ? 'success' : 'neutral'}>
                                    {step.percent}%
                                  </Badge>
                                </li>
                              ))}
                            </ol>
                          </CardBody>
                        </Card>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="week">
                    <Card>
                      <CardHeader>
                        <div>
                          <CardTitle>This week</CardTitle>
                          <CardSubtitle>Classes, assessments and deadlines</CardSubtitle>
                        </div>
                        <CalendarDays className="size-4 text-ink-3" aria-hidden />
                      </CardHeader>
                      <CardBody>
                        <ol className="space-y-2.5">
                          {data.weekSchedule.map((day: any) => (
                            <li
                              key={day.label}
                              className={cn(
                                'rounded-[10px] border px-3.5 py-3',
                                day.isToday ? 'border-indigo bg-indigo-50/60' : 'border-line-soft',
                              )}
                            >
                              <p className="text-sm font-bold">
                                {day.label}
                                {day.isToday && (
                                  <span className="ml-2 text-xs font-semibold text-indigo-600">
                                    Today
                                  </span>
                                )}
                              </p>
                              {day.restDay || day.items.length === 0 ? (
                                <p className="mt-1 text-sm text-ink-3">Nothing scheduled</p>
                              ) : (
                                <ul className="mt-1.5 space-y-1">
                                  {day.items.map((item: any, index: number) => (
                                    <li key={index} className="text-sm text-ink-2">
                                      <span className="font-semibold text-ink-1">{item.label}:</span>{' '}
                                      {item.title}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ol>
                      </CardBody>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </>
        );
      }}
    </AsyncSection>
    </GlobalPageBackground>
  );
}
