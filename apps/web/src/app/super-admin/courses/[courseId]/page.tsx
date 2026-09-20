'use client';

import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Gamepad2,
  GraduationCap,
  Layers,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { formatDate, num } from '@/lib/format';

export default function SuperAdminCourseControlCenterPage() {
  const params = useParams<{ courseId: string }>();
  const query = useApi<any>(`/super-admin/courses/${params.courseId}/control-center`, undefined, {
    select: (res) => res.data ?? res,
  });

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/super-admin/courses">
          <ArrowLeft className="size-3.5 mr-1.5" />
          Back to Course Catalog
        </Link>
      </Button>

      <AsyncSection query={query} skeleton="detail">
        {(data) => {
          const { course, analytics, hierarchy, attachedGames } = data;
          return (
            <div className="space-y-6">
              {/* Visual Course Header */}
              <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-navy-950 via-slate-900 to-indigo-950 p-6 sm:p-8 text-white shadow-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={course.courseMode === 'ONLINE' ? 'indigo' : 'teal'}>
                        {course.courseMode === 'BOTH' ? 'ONLINE + OFFLINE DUAL MODE' : course.courseMode}
                      </Badge>
                      <Badge tone={course.published ? 'success' : 'neutral'}>
                        {course.published ? 'Active & Published' : 'Draft'}
                      </Badge>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      {course.title}
                    </h1>
                    <p className="text-xs text-slate-300 font-mono">
                      Slug: /{course.slug} · Lead Faculty: {course.trainerName} · Fee: ₹{num(course.price)}
                    </p>
                  </div>
                  <div className="text-right space-y-1 shrink-0 bg-white/10 px-4 py-3 rounded-xl border border-white/10">
                    <p className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Course Revenue</p>
                    <p className="text-2xl font-bold text-white">₹{num(analytics.totalRevenue)}</p>
                    <span className="text-[11px] text-emerald-400 font-medium">
                      {analytics.verifiedPayments} Settled Payments
                    </span>
                  </div>
                </div>
              </div>

              {/* Course-Isolated KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Enrolled Students"
                  value={num(analytics.totalEnrolled)}
                  tone="indigo"
                  icon={<GraduationCap className="size-4" />}
                  hint={`Active: ${analytics.activeStudents}`}
                />
                <StatCard
                  label="Campus Cohort"
                  value={num(analytics.offlineStudents)}
                  tone="teal"
                  icon={<Building2 className="size-4" />}
                  hint="College attendance tracked"
                />
                <StatCard
                  label="Online Platform"
                  value={num(analytics.onlineStudents)}
                  tone="indigo"
                  icon={<Layers className="size-4" />}
                  hint="Independent learners"
                />
                <StatCard
                  label="Average Progress"
                  value={`${analytics.averageProgress}%`}
                  tone="amber"
                  icon={<TrendingUp className="size-4" />}
                  hint="Across all modules"
                />
              </div>

              {/* Course -> College -> HOD -> Trainer -> Student Hierarchy */}
              <Card>
                <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">
                      Participating College &amp; Institutional Hierarchy
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      Multi-tenant operational breakdown for offline campus cohorts enrolled in this course.
                    </p>
                  </div>
                  <Badge tone="indigo">
                    {analytics.participatingCollegesCount} Institutions
                  </Badge>
                </CardHeader>
                <CardBody className="p-0">
                  {hierarchy && hierarchy.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {hierarchy.map((col: any) => (
                        <div key={col.collegeId} className="p-4 space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building2 className="size-4 text-indigo" />
                              <span className="font-bold text-slate-900 dark:text-white text-sm">
                                {col.collegeName}
                              </span>
                            </div>
                            <Badge tone="teal">
                              {col.studentCount} Students
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300">
                            <div>
                              <span className="text-slate-400 font-medium">Campus Admin:</span>{' '}
                              <strong>{col.admin}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Department HODs:</span>{' '}
                              <strong>{col.hods?.join(', ') || 'None assigned'}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Assigned Trainers:</span>{' '}
                              <strong>{col.trainers?.join(', ') || 'None assigned'}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No institutional campus cohorts currently attached. This course is operating in pure direct online mode.
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Attached Course Games */}
              <Card>
                <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">Contextual Games &amp; Simulations</CardTitle>
                    <p className="text-xs text-slate-500">
                      Skill challenges connected contextually to this course curriculum.
                    </p>
                  </div>
                  <Button asChild variant="secondary" size="sm" className="text-xs h-7">
                    <Link href="/super-admin/games">
                      <Gamepad2 className="size-3 mr-1" />
                      Manage Games
                    </Link>
                  </Button>
                </CardHeader>
                <CardBody className="p-4">
                  {attachedGames && attachedGames.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {attachedGames.map((g: any) => (
                        <div key={g.code} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-xs text-slate-900 dark:text-white">{g.title}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{g.code} · +{g.xpReward} XP</p>
                          </div>
                          {g.gameUrl && (
                            <Button asChild size="sm" variant="ghost" className="h-7 text-xs text-indigo">
                              <a href={g.gameUrl} target="_blank" rel="noopener noreferrer">
                                Test Launch
                              </a>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No games specifically attached to this course yet. Attach games via Games Management.
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}

