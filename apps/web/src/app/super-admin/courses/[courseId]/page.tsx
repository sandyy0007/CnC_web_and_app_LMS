'use client';

import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Gamepad2,
  GraduationCap,
  Layers,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

export default function SuperAdminCourseControlCenterPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const controlQuery = useApi<any>(`/super-admin/courses/${courseId}/control-center`, undefined, {
    select: (res) => res.data ?? res,
  });

  const paymentConfigQuery = useApi<any>(`/super-admin/courses/${courseId}/payment-config`, undefined, {
    select: (res) => res.data ?? res,
  });

  const revenueQuery = useApi<any>(`/super-admin/courses/${courseId}/revenue`, undefined, {
    select: (res) => res.data ?? res,
  });

  const txQuery = useApi<any>(`/super-admin/courses/${courseId}/transactions`, undefined, {
    select: (res) => res.data ?? res,
  });

  const trainersQuery = useApi<any>(`/super-admin/courses/${courseId}/trainers`, undefined, {
    select: (res) => res.data ?? res,
  });

  // State
  const [activeTab, setActiveTab] = React.useState<'overview' | 'payment_config' | 'revenue' | 'trainers'>('overview');
  const [lifecycleLoading, setLifecycleLoading] = React.useState(false);

  // Payment Form state
  const [fee, setFee] = React.useState<number>(0);
  const [trialDays, setTrialDays] = React.useState<number>(3);
  const [trialEnabled, setTrialEnabled] = React.useState<boolean>(true);
  const [paymentMethods, setPaymentMethods] = React.useState<string[]>(['UPI', 'GATEWAY']);
  const [upiId, setUpiId] = React.useState<string>('');
  const [merchantName, setMerchantName] = React.useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = React.useState<string>('');
  const [paymentInstructions, setPaymentInstructions] = React.useState<string>('');
  const [refundPolicy, setRefundPolicy] = React.useState<string>('');
  const [enrollmentOpen, setEnrollmentOpen] = React.useState<boolean>(true);
  const [savingConfig, setSavingConfig] = React.useState(false);

  // Sync payment config form when loaded
  React.useEffect(() => {
    if (paymentConfigQuery.data) {
      const d = paymentConfigQuery.data;
      setFee(d.fee ?? 0);
      setTrialDays(d.trialDurationDays ?? 3);
      setTrialEnabled(d.trialEnabled ?? true);
      setPaymentMethods(d.paymentMethods ?? ['UPI', 'GATEWAY']);
      setUpiId(d.upiId ?? '');
      setMerchantName(d.merchantName ?? '');
      setQrCodeUrl(d.qrCodeUrl ?? '');
      setPaymentInstructions(d.paymentInstructions ?? '');
      setRefundPolicy(d.refundPolicy ?? '');
      setEnrollmentOpen(d.enrollmentOpen ?? true);
    }
  }, [paymentConfigQuery.data]);

  // Trainer Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = React.useState(false);
  const [trainerUserId, setTrainerUserId] = React.useState('');
  const [assigningTrainer, setAssigningTrainer] = React.useState(false);

  // Lifecycle actions
  const handleLifecycleAction = async (action: 'publish' | 'unpublish' | 'suspend' | 'restore' | 'archive') => {
    setLifecycleLoading(true);
    try {
      await api.post(`/super-admin/courses/${courseId}/${action}`, {});
      toast.success(`Course successfully updated (${action}).`);
      controlQuery.refetch();
      paymentConfigQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} course.`);
    } finally {
      setLifecycleLoading(false);
    }
  };

  // Save payment config
  const handleSavePaymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api.put(`/super-admin/courses/${courseId}/payment-config`, {
        fee,
        trialDurationDays: trialDays,
        trialEnabled,
        paymentMethods,
        upiId,
        merchantName,
        qrCodeUrl,
        paymentInstructions,
        refundPolicy,
        enrollmentOpen,
      });
      toast.success('Course payment & free-trial configuration saved successfully!');
      paymentConfigQuery.refetch();
      controlQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update payment configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Verify / Reject / Refund Transaction
  const handleTransactionAction = async (txId: string, action: 'verify' | 'reject' | 'refund') => {
    try {
      if (action === 'verify') {
        await api.post(`/super-admin/payments/${txId}/verify`, {});
        toast.success('Payment verified. Paid course access granted.');
      } else if (action === 'reject') {
        const reason = window.prompt('Enter reason for payment rejection:', 'Invalid UTR reference');
        if (!reason) return;
        await api.post(`/super-admin/payments/${txId}/reject`, { reason });
        toast.success('Payment rejected.');
      } else if (action === 'refund') {
        const confirmRefund = window.confirm('Are you sure you want to refund this transaction? Student access will be revoked.');
        if (!confirmRefund) return;
        await api.post(`/super-admin/payments/${txId}/refund`, { reason: 'Administrative refund' });
        toast.success('Payment refunded and course access updated.');
      }
      txQuery.refetch();
      revenueQuery.refetch();
      controlQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} payment.`);
    }
  };

  // Assign Trainer
  const handleAssignTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainerUserId.trim()) return;
    setAssigningTrainer(true);
    try {
      await api.post(`/super-admin/courses/${courseId}/trainers`, {
        trainerUserId: trainerUserId.trim(),
      });
      toast.success('Trainer assigned to course.');
      setAssignModalOpen(false);
      setTrainerUserId('');
      trainersQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign trainer.');
    } finally {
      setAssigningTrainer(false);
    }
  };

  // Remove Trainer
  const handleRemoveTrainer = async (tId: string) => {
    if (!window.confirm('Remove this trainer from the course?')) return;
    try {
      await api.delete(`/super-admin/courses/${courseId}/trainers/${tId}`);
      toast.success('Trainer removed from course.');
      trainersQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove trainer.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/super-admin/courses">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Course Catalog
          </Link>
        </Button>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200 dark:border-slate-700/60 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'overview'
                ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Overview & Hierarchy
          </button>
          <button
            onClick={() => setActiveTab('payment_config')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'payment_config'
                ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Payment & 3-Day Trial Config
          </button>
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'revenue'
                ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Revenue & Financials
          </button>
          <button
            onClick={() => setActiveTab('trainers')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'trainers'
                ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Assigned Trainers
          </button>
        </div>
      </div>

      <AsyncSection query={controlQuery} skeleton="detail">
        {(data) => {
          const { course, analytics, hierarchy, attachedGames } = data;
          const status = course.status || (course.published ? 'PUBLISHED' : 'DRAFT');

          return (
            <div className="space-y-6">
              {/* Visual Course Header with 3D Depth */}
              <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-navy-950 via-slate-900 to-indigo-950 p-6 sm:p-8 text-white shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={course.courseMode === 'ONLINE' ? 'indigo' : 'teal'}>
                        {course.courseMode === 'BOTH' ? 'ONLINE + OFFLINE DUAL MODE' : course.courseMode}
                      </Badge>
                      <Badge
                        tone={
                          status === 'PUBLISHED'
                            ? 'success'
                            : status === 'SUSPENDED'
                            ? 'danger'
                            : status === 'ARCHIVED'
                            ? 'neutral'
                            : 'amber'
                        }
                      >
                        {status}
                      </Badge>
                      {paymentConfigQuery.data?.trialEnabled && (
                        <Badge tone="amber" className="bg-amber-500/20 text-amber-200 border-amber-500/30">
                          {paymentConfigQuery.data?.trialDurationDays ?? 3}-Day Free Trial Active
                        </Badge>
                      )}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                      {course.title}
                    </h1>
                    <p className="text-xs text-slate-300 font-mono">
                      Slug: /{course.slug} · Code: {course.code} · Fee: ₹{num(course.price ?? course.fee)}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
                    <div className="text-right space-y-1 bg-white/10 px-4 py-3 rounded-xl border border-white/10 backdrop-blur-md">
                      <p className="text-xs text-slate-300 uppercase tracking-wider font-semibold">Course Revenue</p>
                      <p className="text-2xl font-bold text-white">₹{num(analytics.totalRevenue)}</p>
                      <span className="text-[11px] text-emerald-400 font-medium">
                        {analytics.verifiedPayments} Settled Payments
                      </span>
                    </div>

                    {/* Quick Lifecycle Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {status !== 'PUBLISHED' && (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('publish')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                        >
                          <PlayCircle className="size-3.5 mr-1" />
                          Publish
                        </Button>
                      )}
                      {status === 'PUBLISHED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('unpublish')}
                          className="text-xs"
                        >
                          <PauseCircle className="size-3.5 mr-1 text-amber-400" />
                          Unpublish
                        </Button>
                      )}
                      {status !== 'SUSPENDED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('suspend')}
                          className="text-xs text-rose-300 hover:text-rose-200"
                        >
                          <ShieldAlert className="size-3.5 mr-1 text-rose-400" />
                          Suspend
                        </Button>
                      )}
                      {status === 'SUSPENDED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('restore')}
                          className="text-xs text-emerald-300"
                        >
                          <RotateCcw className="size-3.5 mr-1 text-emerald-400" />
                          Restore
                        </Button>
                      )}
                      {status !== 'ARCHIVED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={lifecycleLoading}
                          onClick={() => handleLifecycleAction('archive')}
                          className="text-xs text-slate-300"
                        >
                          <Archive className="size-3.5 mr-1" />
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* TAB 1: OVERVIEW & HIERARCHY */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Course KPIs */}
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

                  {/* Course Hierarchy */}
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
                                  <Building2 className="size-4 text-indigo-500" />
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
                          No institutional campus cohorts currently attached. This course is operating in direct online mode.
                        </div>
                      )}
                    </CardBody>
                  </Card>

                  {/* Contextual Games */}
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
                            <div key={g.id || g.title} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-xs text-slate-900 dark:text-white">{g.title}</p>
                                <p className="text-[10px] text-slate-400 font-mono">Status: {g.status}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 text-center py-4">
                          No games attached yet.
                        </p>
                      )}
                    </CardBody>
                  </Card>
                </div>
              )}

              {/* TAB 2: COURSE PAYMENT & 3-DAY FREE TRIAL CONFIG */}
              {activeTab === 'payment_config' && (
                <Card>
                  <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="size-4 text-indigo-500" />
                      Course-Specific Payment &amp; Free Trial Configuration (Phases 2 &amp; 3)
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      Configure independent pricing, 3-day (72-hour) free trial entitlement, UPI payment details, QR code, and refund policies.
                    </p>
                  </CardHeader>
                  <CardBody className="p-6">
                    <form onSubmit={handleSavePaymentConfig} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Course Fee */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Course Fee (INR ₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={fee}
                            onChange={(e) => setFee(Number(e.target.value))}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="e.g. 2499"
                            required
                          />
                          <p className="text-[11px] text-slate-400">Set 0 for completely free courses.</p>
                        </div>

                        {/* Free Trial Duration */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Free Trial Duration (Days)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={trialDays}
                            onChange={(e) => setTrialDays(Number(e.target.value))}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="3"
                            required
                          />
                          <p className="text-[11px] text-slate-400">Default: 3 days (exactly 72 hours server-side).</p>
                        </div>

                        {/* Free Trial Enabled */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Free Trial Availability
                          </label>
                          <div className="flex items-center gap-3 pt-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={trialEnabled}
                                onChange={(e) => setTrialEnabled(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                            <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                              {trialEnabled ? 'Enabled for new learners' : 'Disabled (Direct Pay Only)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* UPI ID */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Merchant / Payee UPI ID
                          </label>
                          <input
                            type="text"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                            placeholder="e.g. winnerscreek@icici"
                          />
                          <p className="text-[11px] text-slate-400">Used for direct peer-to-peer UPI transfer.</p>
                        </div>

                        {/* Payee Name */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Payee / Merchant Display Name
                          </label>
                          <input
                            type="text"
                            value={merchantName}
                            onChange={(e) => setMerchantName(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="e.g. Winners Creek Education Pvt Ltd"
                          />
                        </div>
                      </div>

                      {/* QR Code URL & Preview */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Custom UPI QR Code Image URL (Optional)
                        </label>
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={qrCodeUrl}
                            onChange={(e) => setQrCodeUrl(e.target.value)}
                            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="https://... or leave empty to auto-generate from UPI ID & fee"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400">
                          If empty, a dynamic UPI QR code (`upi://pay?pa=...&pn=...&am=...`) will be generated automatically for participants.
                        </p>
                      </div>

                      {/* Payment Instructions */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Payment Instructions (Shown to Students at Checkout)
                        </label>
                        <textarea
                          rows={2}
                          value={paymentInstructions}
                          onChange={(e) => setPaymentInstructions(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Scan the QR code or pay to the UPI ID. Once completed, enter your 12-digit transaction reference number (UTR) to activate your course access."
                        />
                      </div>

                      {/* Refund Policy */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Refund &amp; Cancellation Policy
                        </label>
                        <textarea
                          rows={2}
                          value={refundPolicy}
                          onChange={(e) => setRefundPolicy(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Refunds permitted within 7 days of purchase upon administrative review if less than 20% course completed."
                        />
                      </div>

                      {/* Enrollment Open Checkbox */}
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="checkbox"
                          id="enrollmentOpen"
                          checked={enrollmentOpen}
                          onChange={(e) => setEnrollmentOpen(e.target.checked)}
                          className="size-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        <label htmlFor="enrollmentOpen" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Enrollment is Open (Students can initiate trials and purchases)
                        </label>
                      </div>

                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                        <Button
                          type="submit"
                          variant="primary"
                          disabled={savingConfig}
                          className="flex items-center gap-2"
                        >
                          <Save className="size-4" />
                          {savingConfig ? 'Saving Configuration…' : 'Save Payment & Trial Config'}
                        </Button>
                      </div>
                    </form>
                  </CardBody>
                </Card>
              )}

              {/* TAB 3: REVENUE & TRANSACTIONS */}
              {activeTab === 'revenue' && (
                <div className="space-y-6">
                  {/* Revenue Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                      label="Gross Revenue"
                      value={`₹${num(revenueQuery.data?.grossRevenue ?? 0)}`}
                      tone="indigo"
                      icon={<DollarSign className="size-4" />}
                      hint="Total collected all-time"
                    />
                    <StatCard
                      label="Net Revenue"
                      value={`₹${num(revenueQuery.data?.netRevenue ?? 0)}`}
                      tone="success"
                      icon={<CheckCircle2 className="size-4" />}
                      hint="Gross minus refunds"
                    />
                    <StatCard
                      label="Refunds Issued"
                      value={`₹${num(revenueQuery.data?.totalRefunded ?? 0)}`}
                      tone="danger"
                      icon={<RotateCcw className="size-4" />}
                      hint="Revoked enrollments"
                    />
                    <StatCard
                      label="Verified Transactions"
                      value={num(revenueQuery.data?.verifiedCount ?? 0)}
                      tone="teal"
                      icon={<CreditCard className="size-4" />}
                      hint="Settled payments"
                    />
                  </div>

                  {/* Transaction Ledger */}
                  <Card>
                    <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-bold">Course Transaction Ledger</CardTitle>
                        <p className="text-xs text-slate-500">
                          Real-time audit log of all participant transactions for this course. Verify, reject, or refund payments with instant access reconciliation.
                        </p>
                      </div>
                      <Badge tone="indigo">
                        {txQuery.data?.length ?? 0} Transactions
                      </Badge>
                    </CardHeader>
                    <CardBody className="p-0">
                      {txQuery.data && txQuery.data.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 font-semibold text-slate-600 dark:text-slate-300">
                              <tr>
                                <th className="p-3">Participant</th>
                                <th className="p-3">Institution</th>
                                <th className="p-3">Amount</th>
                                <th className="p-3">UTR / Ref</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Date</th>
                                <th className="p-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {txQuery.data.map((tx: any) => (
                                <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                  <td className="p-3 font-medium text-slate-900 dark:text-white">
                                    <div>{tx.studentName}</div>
                                    <div className="text-[10px] text-slate-400 font-normal">{tx.studentEmail}</div>
                                  </td>
                                  <td className="p-3 text-slate-500">{tx.institutionName || 'Direct Online'}</td>
                                  <td className="p-3 font-semibold text-slate-900 dark:text-white">₹{num(tx.amount)}</td>
                                  <td className="p-3 font-mono text-[11px] text-slate-500">{tx.transactionRef || 'N/A'}</td>
                                  <td className="p-3">
                                    <Badge
                                      tone={
                                        tx.status === 'VERIFIED'
                                          ? 'success'
                                          : tx.status === 'REJECTED'
                                          ? 'danger'
                                          : tx.status === 'REFUNDED'
                                          ? 'neutral'
                                          : 'amber'
                                      }
                                    >
                                      {tx.status}
                                    </Badge>
                                  </td>
                                  <td className="p-3 text-slate-500">{formatDate(tx.createdAt)}</td>
                                  <td className="p-3 text-right space-x-1">
                                    {tx.status === 'PENDING' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="primary"
                                          className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                                          onClick={() => handleTransactionAction(tx.id, 'verify')}
                                        >
                                          Verify
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="h-6 px-2 text-[10px] text-rose-500 hover:text-rose-600"
                                          onClick={() => handleTransactionAction(tx.id, 'reject')}
                                        >
                                          Reject
                                        </Button>
                                      </>
                                    )}
                                    {tx.status === 'VERIFIED' && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-6 px-2 text-[10px] text-slate-500 hover:text-rose-500"
                                        onClick={() => handleTransactionAction(tx.id, 'refund')}
                                      >
                                        Refund
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-500">
                          No transactions recorded for this course yet.
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </div>
              )}

              {/* TAB 4: ASSIGNED TRAINERS */}
              {activeTab === 'trainers' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">Course Faculty &amp; Trainers</h2>
                      <p className="text-xs text-slate-500">
                        Trainers explicitly authorized to schedule live sessions, publish meeting links, and post materials for this course.
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setAssignModalOpen(true)}
                      className="flex items-center gap-1.5"
                    >
                      <UserPlus className="size-3.5" />
                      Assign Trainer
                    </Button>
                  </div>

                  <Card>
                    <CardBody className="p-0">
                      {trainersQuery.data && trainersQuery.data.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                          {trainersQuery.data.map((tr: any) => (
                            <div key={tr.id || tr.trainer_user_id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-full bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                  {(tr.trainer_name || 'T')[0]}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                                    {tr.trainer_name || 'Trainer'}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {tr.trainer_email} · Assigned {formatDate(tr.assigned_at)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleRemoveTrainer(tr.trainer_user_id)}
                                className="h-7 text-xs text-rose-500 hover:text-rose-600"
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-500">
                          No trainers currently assigned directly to this course.
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </div>
              )}
            </div>
          );
        }}
      </AsyncSection>

      {/* Assign Trainer Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Trainer to Course</DialogTitle>
            <DialogDescription>
              Grant a trainer administrative oversight for scheduling classes, meeting links, notes, and recordings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssignTrainer} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Trainer User UUID
              </label>
              <input
                type="text"
                value={trainerUserId}
                onChange={(e) => setTrainerUserId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder="e.g. 5d92688c-44b8-41b7-b2f4-af87c482ae8f"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAssignModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={assigningTrainer}>
                {assigningTrainer ? 'Assigning…' : 'Assign Trainer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
