'use client';

import {
  ArrowRight,
  BookOpen,
  Building2,
  Clock,
  CreditCard,
  Gamepad2,
  GraduationCap,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageHero } from '@/components/ui/ImageHero';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import Image from 'next/image';
import { useApi } from '@/hooks/useApi';
import { formatDate, num } from '@/lib/format';

interface SuperAdminDashboardData {
  institutions: number;
  students: number;
  trainers: number;
  hods: number;
  admins: number;
  courses: number;
  ebooks: number;
  games: number;
  activeTrials: number;
  convertedTrials: number;
  trialConversionRate: number;
  totalRevenue: number;
  pendingPayments: number;
  verifiedPayments: number;
  onlineRevenue: number;
  offlineRevenue: number;
  totalTransactions: number;
  aiEventsCount: number;
  storageUsage: string;
  recentPayments?: Array<{
    id: string;
    studentName?: string;
    courseTitle?: string;
    courseMode?: string;
    amount: number;
    status: string;
    createdAt?: string;
  }>;
  recentSecurityEvents?: Array<{
    id: string;
    kind: string;
    detail: string;
    at?: string;
    ip?: string;
  }>;
}

export default function SuperAdminDashboardPage() {
  const query = useApi<SuperAdminDashboardData>('/super-admin/dashboard', undefined, {
    select: (res) => res.data ?? res,
  });

  return (
    <VisualPageBackground
      image="/images/backgrounds/super-admin.webp"
      imageAlt="Super Admin Command Center"
      overlay="dark"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <div className="space-y-6">
        <AsyncSection query={query} skeleton="kpis">
          {(data) => (
            <div className="space-y-6">
            {/* Visual Platform Command Header with Real Image */}
            <ImageHero
              image="/images/platform/super-admin.webp"
              imageAlt="Platform Command Center Intelligence Room"
              title="Platform Command Center"
              subtitle={`Global oversight across all ${data.institutions} higher education institutions, direct online participant cohorts, financial settlement queues, and AI infrastructure.`}
              badge={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success" dot>
                    Platform Live &amp; Isolated
                  </Badge>
                  <Badge tone="indigo">
                    <ShieldCheck className="size-3.5 mr-1" />
                    Super Admin Authority
                  </Badge>
                </div>
              }
              actions={
                <div className="flex flex-wrap gap-2.5 shrink-0">
                  <Button asChild variant="primary" size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700 shadow-md">
                    <Link href="/super-admin/courses">
                      <BookOpen className="size-3.5 mr-1.5" />
                      Launch Course
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" size="sm" className="bg-white/15 hover:bg-white/25 text-white border-white/20">
                    <Link href="/super-admin/payments">
                      <CreditCard className="size-3.5 mr-1.5" />
                      Verification Queue ({data.pendingPayments})
                    </Link>
                  </Button>
                </div>
              }
            />

            {/* 8 Primary Platform KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Institutions Onboarded"
                value={num(data.institutions)}
                tone="indigo"
                icon={<Building2 className="size-4" />}
                hint="Multi-campus tenants"
              />
              <StatCard
                label="Enrolled Participants"
                value={num(data.students)}
                tone="indigo"
                icon={<GraduationCap className="size-4" />}
                hint="Campus & online direct"
              />
              <StatCard
                label="Certified Trainers"
                value={num(data.trainers)}
                tone="teal"
                icon={<Users className="size-4" />}
                hint="Assigned faculty"
              />
              <StatCard
                label="Department SPOCs"
                value={num(data.hods)}
                tone="teal"
                icon={<ShieldCheck className="size-4" />}
                hint="Academic leads"
              />
              <StatCard
                label="Campus Admins"
                value={num(data.admins)}
                tone="teal"
                icon={<Lock className="size-4" />}
                hint="Institution owners"
              />
              <StatCard
                label="Active Courses"
                value={num(data.courses)}
                tone="amber"
                icon={<BookOpen className="size-4" />}
                hint="Offline + Online catalog"
              />
              <StatCard
                label="Pending Verification"
                value={num(data.pendingPayments)}
                tone="amber"
                icon={<Clock className="size-4" />}
                hint="Awaiting SA review"
              />
              <StatCard
                label="Gross Revenue"
                value={`₹${num(data.totalRevenue)}`}
                tone="indigo"
                icon={<CreditCard className="size-4" />}
                hint={`Online ₹${num(data.onlineRevenue)} · Offline ₹${num(data.offlineRevenue)}`}
              />
            </div>

            {/* Operations Hub: Visual Quick Navigation with Real Images */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/super-admin/colleges" className="group overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 transition-all shadow-xs hover:shadow-md flex flex-col">
                <div className="relative h-32 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <Image
                    src="/images/platform/colleges.webp"
                    alt="Colleges and campuses"
                    fill
                    sizes="(max-width: 768px) 100vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-transparent to-transparent" />
                  <span className="absolute bottom-2.5 left-2.5 p-1.5 rounded-lg bg-indigo-600/90 text-white backdrop-blur-xs">
                    <Building2 className="size-4" />
                  </span>
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">Colleges &amp; Campuses</h3>
                      <span className="arrow-bubble-wrapper">
                        <span className="bubble-circle bg-indigo-500/30" aria-hidden />
                        <ArrowRight className="arrow-glyph size-3.5 text-slate-400 group-hover:text-indigo-400" />
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Tenant quotas, admins &amp; campuses.</p>
                  </div>
                </div>
              </Link>

              <Link href="/super-admin/users" className="group overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 transition-all shadow-xs hover:shadow-md flex flex-col">
                <div className="relative h-32 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <Image
                    src="/images/tech-orbit.webp"
                    alt="Users and roles"
                    fill
                    sizes="(max-width: 768px) 100vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-transparent to-transparent" />
                  <span className="absolute bottom-2.5 left-2.5 p-1.5 rounded-lg bg-emerald-600/90 text-white backdrop-blur-xs">
                    <Users className="size-4" />
                  </span>
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">Users &amp; Roles</h3>
                      <span className="arrow-bubble-wrapper">
                        <span className="bubble-circle bg-emerald-500/30" aria-hidden />
                        <ArrowRight className="arrow-glyph size-3.5 text-slate-400 group-hover:text-emerald-400" />
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Provision staff with granular permissions.</p>
                  </div>
                </div>
              </Link>

              <Link href="/super-admin/courses" className="group overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 transition-all shadow-xs hover:shadow-md flex flex-col">
                <div className="relative h-32 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <Image
                    src="/images/platform/courses.webp"
                    alt="Course launch and catalog"
                    fill
                    sizes="(max-width: 768px) 100vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-transparent to-transparent" />
                  <span className="absolute bottom-2.5 left-2.5 p-1.5 rounded-lg bg-amber-600/90 text-white backdrop-blur-xs">
                    <BookOpen className="size-4" />
                  </span>
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">Course Launch</h3>
                      <span className="arrow-bubble-wrapper">
                        <span className="bubble-circle bg-amber-500/30" aria-hidden />
                        <ArrowRight className="arrow-glyph size-3.5 text-slate-400 group-hover:text-amber-400" />
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Course Control Centers &amp; delivery modes.</p>
                  </div>
                </div>
              </Link>

              <Link href="/super-admin/games" className="group overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500 transition-all shadow-xs hover:shadow-md flex flex-col">
                <div className="relative h-32 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <Image
                    src="/images/platform/games.webp"
                    alt="Games and interactive simulations"
                    fill
                    sizes="(max-width: 768px) 100vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-transparent to-transparent" />
                  <span className="absolute bottom-2.5 left-2.5 p-1.5 rounded-lg bg-purple-600/90 text-white backdrop-blur-xs">
                    <Gamepad2 className="size-4" />
                  </span>
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">Games &amp; Scenarios</h3>
                      <span className="arrow-bubble-wrapper">
                        <span className="bubble-circle bg-purple-500/30" aria-hidden />
                        <ArrowRight className="arrow-glyph size-3.5 text-slate-400 group-hover:text-purple-400" />
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Launch URLs &amp; course gamification.</p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Financial Activity & System Security Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Payment Settlement Stream */}
              <Card className="overflow-hidden">
                <div className="relative h-28 w-full overflow-hidden bg-slate-900">
                  <Image
                    src="/images/platform/payments.webp"
                    alt="Secure financial settlement queue"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover opacity-80 hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                  <span className="absolute bottom-2.5 left-3 text-xs font-bold text-white uppercase tracking-wider bg-indigo-600/80 px-2 py-0.5 rounded backdrop-blur-xs">
                    Fintech Gateway
                  </span>
                </div>
                <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">Recent Payment Activity</CardTitle>
                    <p className="text-xs text-slate-500">Live transaction stream across delivery modes.</p>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="text-xs h-7">
                    <Link href="/super-admin/payments">
                      View All
                      <ArrowRight className="size-3 ml-1" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardBody className="p-0">
                  {data.recentPayments && data.recentPayments.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {data.recentPayments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {p.studentName || 'Participant'}
                            </p>
                            <p className="text-slate-500 text-[11px]">
                              {p.courseTitle || 'Course'} · <span className="font-medium text-indigo">{p.courseMode || 'ONLINE'}</span>
                            </p>
                          </div>
                          <div className="text-right space-y-1">
                            <p className="font-bold text-slate-900 dark:text-white">₹{num(p.amount)}</p>
                            <Badge tone={p.status === 'completed' || p.status === 'verified' ? 'success' : p.status === 'pending' || p.status === 'pending_verification' ? 'amber' : 'danger'}>
                              {p.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No recent payment activity recorded.
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Security & Audit Events Stream */}
              <Card className="overflow-hidden">
                <div className="relative h-28 w-full overflow-hidden bg-slate-900">
                  <Image
                    src="/images/features-ai.webp"
                    alt="AI Security & Telemetry analysis"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover opacity-80 hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                  <span className="absolute bottom-2.5 left-3 text-xs font-bold text-white uppercase tracking-wider bg-emerald-600/80 px-2 py-0.5 rounded backdrop-blur-xs">
                    Security Telemetry
                  </span>
                </div>
                <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">Platform Security Events</CardTitle>
                    <p className="text-xs text-slate-500">Automated authz audit trail and security events.</p>
                  </div>
                  <Badge tone="success" dot>
                    Active Monitoring
                  </Badge>
                </CardHeader>
                <CardBody className="p-0">
                  {data.recentSecurityEvents && data.recentSecurityEvents.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {data.recentSecurityEvents.map((evt) => (
                        <div key={evt.id} className="p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 space-y-1">
                          <div className="flex items-center justify-between">
                            <Badge tone={evt.kind?.includes('denied') || evt.kind?.includes('failed') ? 'danger' : 'indigo'}>
                              {evt.kind}
                            </Badge>
                            <span className="text-[10px] text-slate-400">
                              {evt.at ? formatDate(evt.at) : 'Just now'}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 font-mono text-[11px] truncate">
                            {evt.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No security incidents logged. Platform isolated.
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Tenant Security & Isolation Matrix */}
            <Card>
              <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold">Tenant Security &amp; Isolation Architecture</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Server-side tenant scoping and course mode boundaries strictly active.
                  </p>
                </div>
                <Badge tone="success">100% Isolated</Badge>
              </CardHeader>
              <CardBody className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Tenant Scoping</p>
                    <p className="text-slate-500">MongoDB with server-side collegeId predicates</p>
                    <span className="text-[11px] text-emerald-600 font-medium">Campus Isolated</span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Course Modes</p>
                    <p className="text-slate-500">Dual ONLINE / OFFLINE scope protection</p>
                    <span className="text-[11px] text-emerald-600 font-medium">Operational Isolation</span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Staff Accounts</p>
                    <p className="text-slate-500">Super Admin provisioned with single-use tokens</p>
                    <span className="text-[11px] text-emerald-600 font-medium">Zero Public Staff Signup</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </AsyncSection>
    </div>
  </VisualPageBackground>
);
}

