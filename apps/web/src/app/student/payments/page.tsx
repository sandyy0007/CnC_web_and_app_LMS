'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Lock,
  QrCode,
  Receipt,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageHero } from '@/components/ui/ImageHero';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';
import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

interface PaymentRecord {
  id: string;
  orderId?: string;
  transactionId?: string;
  transactionRef?: string;
  courseId?: string;
  courseTitle?: string;
  courseMode?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'completed' | 'verified' | 'failed' | 'rejected' | 'refunded' | 'pending_verification';
  purpose?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt?: string;
  paidAt?: string;
  invoiceUrl?: string;
}

interface CourseTrial {
  id: string;
  courseId: string;
  courseName: string;
  startedAt: string;
  expiresAt: string;
  daysRemaining: number;
  hoursRemaining?: number;
  status: 'active' | 'expired' | 'converted';
  isActive: boolean;
  isPaid?: boolean;
}

interface InvoiceData {
  invoiceNumber: string;
  issuedAt: string;
  studentName: string;
  collegeName: string;
  items: Array<{ description: string; amount: number }>;
  total: number;
  status: string;
  paymentMethod?: string;
}

function StudentPaymentsContent() {
  const searchParams = useSearchParams();
  const targetCourseId = searchParams.get('courseId');

  const paymentsQuery = useApi<any>('/student/payments');
  const trialsQuery = useApi<any>('/student/trials');

  const [checkoutModalOpen, setCheckoutModalOpen] = React.useState(false);
  const [selectedTrialToBuy, setSelectedTrialToBuy] = React.useState<CourseTrial | null>(null);
  const [courseConfig, setCourseConfig] = React.useState<any>(null);
  const [loadingConfig, setLoadingConfig] = React.useState(false);

  const [selectedMode, setSelectedMode] = React.useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [selectedMethod, setSelectedMethod] = React.useState<'UPI' | 'GATEWAY'>('UPI');
  const [transactionRef, setTransactionRef] = React.useState('');
  const [payerUpiId, setPayerUpiId] = React.useState('');
  const [checkoutProcessing, setCheckoutProcessing] = React.useState(false);
  const [checkoutSuccessMessage, setCheckoutSuccessMessage] = React.useState<string | null>(null);

  // Invoice modal state
  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [invoiceData, setInvoiceData] = React.useState<InvoiceData | null>(null);
  const [loadingInvoice, setLoadingInvoice] = React.useState(false);

  const payments: PaymentRecord[] = React.useMemo(() => {
    const rawPayments =
      paymentsQuery.data?.payments ??
      paymentsQuery.data?.data?.payments ??
      paymentsQuery.data?.data ??
      paymentsQuery.data;
    return Array.isArray(rawPayments) ? rawPayments : [];
  }, [paymentsQuery.data]);

  const successfulPayments = React.useMemo(
    () => payments.filter(
      (p) => p.status === 'success' || p.status === 'completed' || p.status === 'verified'
    ),
    [payments]
  );

  const paidCourseIds = React.useMemo(
    () => new Set(successfulPayments.map((p) => p.courseId).filter(Boolean)),
    [successfulPayments]
  );

  const rawTrials =
    trialsQuery.data?.trials ??
    trialsQuery.data?.data?.trials ??
    trialsQuery.data?.data ??
    trialsQuery.data;

  const trials: CourseTrial[] = React.useMemo(() => {
    const list = Array.isArray(rawTrials) ? rawTrials : [];
    return list.map((t: any) => {
      const isPaid = t.isPaid || t.status === 'converted' || (t.courseId && paidCourseIds.has(t.courseId));
      const days = t.daysRemaining ?? t.remainingDays ?? 0;
      const hours = t.hoursRemaining ?? t.remainingHours ?? 0;
      const isAct = !isPaid && (t.isActive ?? (t.status === 'active' && (days > 0 || hours > 0)));
      return {
        id: String(t.id),
        courseId: String(t.courseId),
        courseName: t.courseName || t.courseTitle || 'Course',
        startedAt: t.startedAt,
        expiresAt: t.expiresAt,
        daysRemaining: days,
        hoursRemaining: hours,
        status: isPaid ? ('converted' as const) : isAct ? ('active' as const) : ('expired' as const),
        isActive: isAct,
        isPaid,
      };
    });
  }, [rawTrials, paidCourseIds]);

  const totalSpent = successfulPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const activeTrials = trials.filter((t) => t.isActive);

  // View Invoice
  const handleViewInvoice = async (paymentId: string) => {
    setLoadingInvoice(true);
    setInvoiceModalOpen(true);
    try {
      const res = await api.get<any>(`/student/payments/${paymentId}/invoice`);
      setInvoiceData(res?.invoice ?? res?.data?.invoice ?? res?.data ?? res);
    } catch {
      // ignore
    } finally {
      setLoadingInvoice(false);
    }
  };

  // Open checkout for a course trial
  const handleBuyCourse = async (trial: CourseTrial) => {
    setCourseConfig(null);
    setSelectedTrialToBuy(trial);
    setCheckoutSuccessMessage(null);
    setTransactionRef('');
    setPayerUpiId('');
    setLoadingConfig(true);
    setCheckoutModalOpen(true);

    try {
      const res = await api.get<any>(`/student/courses/${trial.courseId}`);
      const course = res.data ?? res;
      setCourseConfig(course);
    } catch {
      setCourseConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  // Open checkout by course ID directly
  const handleBuyCourseById = React.useCallback(async (courseId: string) => {
    setCourseConfig(null);
    setSelectedTrialToBuy({
      id: courseId,
      courseId: courseId,
      courseName: 'Loading course…',
      startedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      daysRemaining: 0,
      status: 'expired',
      isActive: false,
    });
    setCheckoutSuccessMessage(null);
    setTransactionRef('');
    setPayerUpiId('');
    setLoadingConfig(true);
    setCheckoutModalOpen(true);

    try {
      const res = await api.get<any>(`/student/courses/${courseId}`);
      const course = res.data ?? res;
      setCourseConfig(course);
      setSelectedTrialToBuy((prev) =>
        prev
          ? {
              ...prev,
              courseName: course.title || prev.courseName,
            }
          : null
      );
    } catch {
      setCourseConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Handle URL query target course
  const handledQueryRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!targetCourseId || handledQueryRef.current === targetCourseId) return;
    handledQueryRef.current = targetCourseId;

    if (paidCourseIds.has(targetCourseId)) {
      toast.info('You already have verified lifetime access to this course.');
      return;
    }

    const matchedTrial = trials.find((t) => t.courseId === targetCourseId);
    if (matchedTrial) {
      if (matchedTrial.status !== 'converted') {
        handleBuyCourse(matchedTrial);
      }
    } else {
      handleBuyCourseById(targetCourseId);
    }
  }, [targetCourseId, paidCourseIds, trials, handleBuyCourseById]);

  // Perform Checkout
  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrialToBuy) return;

    if (selectedMethod === 'UPI' && !transactionRef.trim()) {
      toast.error('Please enter your 12-digit UPI UTR reference number.');
      return;
    }

    setCheckoutProcessing(true);
    try {
      const res = await api.post<any>('/student/payments/checkout', {
        courseId: selectedTrialToBuy.courseId,
        courseMode: selectedMode,
        paymentMethod: selectedMethod,
        transactionRef: transactionRef.trim() || undefined,
        payerUpiId: payerUpiId.trim() || undefined,
      });

      const data = res.data ?? res;
      if (data.status === 'PENDING' || data.status === 'pending_verification') {
        setCheckoutSuccessMessage(
          'Payment submitted for verification! Your UTR reference has been recorded. Once verified by the administration, your lifetime course access will be unlocked.'
        );
      } else {
        setCheckoutSuccessMessage(
          'Payment successful! You now have full lifetime access to this course. Your progress has been preserved.'
        );
      }

      paymentsQuery.refetch();
      trialsQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Payment submission failed.');
    } finally {
      setCheckoutProcessing(false);
    }
  };

  return (
    <VisualPageBackground
      image="/images/backgrounds/payments.webp"
      imageAlt="Fintech Security and Transaction Ledger"
      overlay="dark"
      className="min-h-full rounded-2xl p-4 sm:p-6"
    >
      <div className="space-y-6">
        <ImageHero
          image="/images/backgrounds/payments.webp"
          imageAlt="Fintech Security and Transaction Ledger"
          title="Billing, Payments &amp; Subscriptions"
          subtitle="Manage active 3-day course free trials, verify UPI transactions, and download official tax receipts."
          badge={
            <Badge tone="success" className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-200 border-emerald-500/30">
              <ShieldCheck className="size-3.5" />
              PCI-DSS &amp; UPI Encrypted Payments
            </Badge>
          }
        />

        {/* Target Course Already Verified Notification */}
        {targetCourseId && paidCourseIds.has(targetCourseId) && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/40 dark:border-emerald-800 p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-xs text-emerald-900 dark:text-emerald-100">
                  You Already Have Verified Access
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  Payment for this course is verified. You have lifetime access to all lessons, class materials, and recordings.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="primary" className="bg-emerald-600 hover:bg-emerald-700 text-xs shrink-0">
              <Link href={`/student/learning/${targetCourseId}`}>
                Open Course →
              </Link>
            </Button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Invested"
            value={`₹${num(totalSpent)}`}
            tone="indigo"
            icon={<CreditCard className="size-4" />}
            hint="Settled course purchases"
          />
          <StatCard
            label="Active 3-Day Trials"
            value={num(activeTrials.length)}
            tone={activeTrials.length > 0 ? 'amber' : 'indigo'}
            icon={<Clock className="size-4" />}
            hint="72-hour server countdown active"
          />
          <StatCard
            label="Invoices Generated"
            value={num(successfulPayments.length)}
            tone="success"
            icon={<Receipt className="size-4" />}
            hint="Official receipts available"
          />
          <StatCard
            label="Payment Modes"
            value="UPI &amp; Gateway"
            tone="info"
            icon={<Sparkles className="size-4" />}
            hint="Direct UPI QR / Instant Gateway"
          />
        </div>

        {/* Active 3-Day Free Trials Section */}
        {trials.length > 0 && (
          <Card elevated>
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="size-4 text-amber-500" />
                    Your Course Free Trials (3 Days / 72 Hours)
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Full curriculum access during your 72-hour trial. Upgrade anytime to keep your learning progress and unlock all class materials and live sessions.
                  </p>
                </div>
                <Badge tone="amber">
                  72-Hour Server Clock
                </Badge>
              </div>
            </CardHeader>
            <CardBody className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trials.map((trial) => {
                  const isExpiringSoon = trial.isActive && trial.daysRemaining <= 1;
                  const isPaid = trial.status === 'converted' || paidCourseIds.has(trial.courseId);
                  return (
                    <div
                      key={trial.id}
                      className={cn(
                        'p-4 rounded-xl border surface-3d surface-3d-interactive shadow-3d-card hover:shadow-3d-hover transition-all flex flex-col justify-between space-y-3',
                        isPaid
                          ? 'border-emerald-200/80 bg-emerald-50/40 dark:bg-emerald-950/20'
                          : trial.isActive
                          ? isExpiringSoon
                            ? 'border-amber-300/80 bg-amber-50/50 dark:bg-amber-950/20'
                            : 'border-slate-200/80 dark:border-white/[0.08]'
                          : 'border-rose-200/80 bg-rose-50/30 dark:bg-rose-950/10 opacity-85'
                      )}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-1">
                            {trial.courseName}
                          </span>
                          <Badge
                            tone={
                              isPaid
                                ? 'success'
                                : trial.isActive
                                ? isExpiringSoon
                                  ? 'amber'
                                  : 'indigo'
                                : 'danger'
                            }
                          >
                            {isPaid
                              ? 'Paid & Enrolled'
                              : trial.isActive
                              ? `${trial.daysRemaining}d remaining`
                              : '3-Day Trial Expired'}
                          </Badge>
                        </div>

                        <div className="mt-2 text-xs text-slate-500 space-y-1">
                          <p>Started: {formatDate(trial.startedAt)}</p>
                          <p>Expires: {formatDate(trial.expiresAt)}</p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <Link
                          href={`/student/learning/${trial.courseId}`}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          Open Course →
                        </Link>

                        {!isPaid ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleBuyCourse(trial)}
                            className="text-xs"
                          >
                            {trial.isActive ? 'Unlock Lifetime Access' : 'Purchase Course'}
                          </Button>
                        ) : (
                          <Badge tone="success" className="text-[11px]">
                            Verified Lifetime Access
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Transaction History */}
        <Card elevated>
          <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Payment &amp; Invoices History</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit ledger of all course enrollments, UPI transactions, and verified tax receipts.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {payments.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="size-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                  No payment transactions found
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  When you purchase lifetime course access, your invoices and receipts will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3">Course / Purpose</th>
                      <th className="px-5 py-3">Mode</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">UTR / Ref</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Receipt</th>
                      <th className="px-5 py-3 text-right">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {payments.map((p) => {
                      const isAccessActive =
                        p.status === 'success' ||
                        p.status === 'completed' ||
                        p.status === 'verified';
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white max-w-xs truncate">
                            {p.courseTitle || p.purpose || 'Course Enrollment'}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge tone="neutral" className="text-[10px]">
                              {p.courseMode || 'ONLINE'}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                            ₹{num(p.amount)}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge
                              tone={
                                isAccessActive
                                  ? 'success'
                                  : p.status === 'pending' || p.status === 'pending_verification'
                                  ? 'amber'
                                  : p.status === 'refunded'
                                  ? 'neutral'
                                  : 'danger'
                              }
                            >
                              {p.status === 'pending_verification' ? 'Pending Review' : p.status.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500">
                            {p.transactionRef || p.transactionId || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-slate-500">
                            {formatDate(p.createdAt || p.paidAt)}
                          </td>
                          <td className="px-5 py-3.5">
                            {isAccessActive ? (
                              <button
                                onClick={() => handleViewInvoice(p.id)}
                                className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                              >
                                <Download className="size-3" />
                                Invoice
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {p.courseId && isAccessActive ? (
                              <Link
                                href={`/student/learning/${p.courseId}`}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                              >
                                View Course →
                              </Link>
                            ) : (
                              <span className="text-slate-400 text-[11px]">
                                {p.status === 'pending' || p.status === 'pending_verification' ? 'Verifying…' : 'Locked'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Course Checkout Modal with Real UPI and Gateway Options */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Unlock Lifetime Course Access</DialogTitle>
            <DialogDescription>
              Preserve your learning progress and gain unlimited lifetime access to all learning content.
            </DialogDescription>
          </DialogHeader>

          {checkoutSuccessMessage ? (
            <div className="p-8 text-center space-y-4">
              <CheckCircle2 className="size-12 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Payment Received
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                {checkoutSuccessMessage}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setCheckoutModalOpen(false);
                    setCheckoutSuccessMessage(null);
                  }}
                >
                  Close &amp; Return to Payments
                </Button>
                {selectedTrialToBuy?.courseId && (
                  <Button asChild variant="primary" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <Link href={`/student/learning/${selectedTrialToBuy.courseId}`}>
                      Open Purchased Course →
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : selectedTrialToBuy ? (
            <form onSubmit={handleConfirmCheckout} className="p-6 space-y-5">
              {/* Course Overview Card */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {courseConfig?.title || selectedTrialToBuy.courseName}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Payee: {courseConfig?.merchantName || 'Winners Creek LMS'} · Category: {courseConfig?.category || 'Employability'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 uppercase tracking-wider block font-semibold">Course Fee</span>
                  <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                    ₹{num(courseConfig?.fee ?? 2499)}
                  </span>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Learning Mode:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('ONLINE')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      selectedMode === 'ONLINE'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <p className="font-bold">Online Platform</p>
                    <p className="text-[11px] text-slate-500 font-normal">Self-Paced, Virtual Classrooms</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMode('OFFLINE')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      selectedMode === 'OFFLINE'
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <p className="font-bold">Campus Cohort</p>
                    <p className="text-[11px] text-slate-500 font-normal">In-Person Campus Sessions</p>
                  </button>
                </div>
              </div>

              {/* Payment Method Tabs */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Payment Method:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMethod('UPI')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all flex items-center gap-2 ${
                      selectedMethod === 'UPI'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 font-semibold text-indigo-900 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <QrCode className="size-4 text-indigo-500" />
                    <div>
                      <p className="font-bold">UPI QR / Direct Pay</p>
                      <p className="text-[10px] text-slate-500">Google Pay, PhonePe, Paytm</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMethod('GATEWAY')}
                    className={`p-3 rounded-lg border text-left text-xs transition-all flex items-center gap-2 ${
                      selectedMethod === 'GATEWAY'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 font-semibold text-indigo-900 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <CreditCard className="size-4 text-indigo-500" />
                    <div>
                      <p className="font-bold">Instant Gateway</p>
                      <p className="text-[10px] text-slate-500">Card / NetBanking / Mock</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* UPI QR Display & UTR Submission */}
              {selectedMethod === 'UPI' && (
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="size-32 bg-white p-2 rounded-xl border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
                      <img
                        src={
                          courseConfig?.qrCodeUrl ||
                          `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                            `upi://pay?pa=${courseConfig?.upiId || 'eedi@icici'}&pn=${encodeURIComponent(
                              courseConfig?.merchantName || 'Winners Creek LMS'
                            )}&am=${courseConfig?.fee ?? 2499}&cu=INR`
                          )}`
                        }
                        alt="UPI Payment QR Code"
                        className="size-28 object-contain"
                      />
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-bold text-slate-900 dark:text-white">
                        Scan with any UPI App to Pay ₹{num(courseConfig?.fee ?? 2499)}
                      </p>
                      <p className="text-slate-600 dark:text-slate-300">
                        UPI ID:{' '}
                        <strong className="font-mono text-indigo-600 dark:text-indigo-400 select-all">
                          {courseConfig?.upiId || 'eedi@icici'}
                        </strong>
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Payee: {courseConfig?.merchantName || 'Winners Creek LMS'}
                      </p>
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        {courseConfig?.paymentInstructions ||
                          'After paying, enter your 12-digit UPI UTR reference number below to verify your transaction.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        12-Digit Transaction UTR Reference *
                      </label>
                      <input
                        type="text"
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        placeholder="e.g. 429182749102"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Your UPI ID (Optional)
                      </label>
                      <input
                        type="text"
                        value={payerUpiId}
                        onChange={(e) => setPayerUpiId(e.target.value)}
                        placeholder="e.g. student@okhdfcbank"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-500" />
                  <span>Instant access without data loss (your free trial progress is preserved)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span>{courseConfig?.refundPolicy || '7-Day refund policy applies.'}</span>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCheckoutModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={checkoutProcessing}
                  className="flex items-center gap-1.5"
                >
                  <CreditCard className="size-3.5" />
                  {checkoutProcessing
                    ? 'Submitting…'
                    : selectedMethod === 'UPI'
                    ? `Submit UPI Payment (₹${num(courseConfig?.fee ?? 2499)})`
                    : `Pay ₹${num(courseConfig?.fee ?? 2499)} (Instant Checkout)`}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Invoice View Modal */}
      <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Tax Invoice &amp; Payment Receipt</DialogTitle>
            <DialogDescription>
              Official electronic receipt issued by Winners Creek LMS.
            </DialogDescription>
          </DialogHeader>

          {loadingInvoice ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Generating invoice preview…
            </div>
          ) : invoiceData ? (
            <div className="p-6 space-y-6 bg-white dark:bg-slate-900">
              <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex flex-col gap-1">
                  <WinnersCreekLogo variant="invoice" />
                  <p className="text-xs text-slate-500 mt-1">Learning &amp; Education Platform</p>
                </div>
                <div className="text-right">
                  <Badge tone="success">
                    {invoiceData.status.toUpperCase()}
                  </Badge>
                  <p className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                    #{invoiceData.invoiceNumber}
                  </p>
                  <p className="text-[11px] text-slate-400">Date: {formatDate(invoiceData.issuedAt)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="font-bold text-slate-500 uppercase text-[10px]">Billed To</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                    {invoiceData.studentName}
                  </p>
                  <p className="text-slate-500">{invoiceData.collegeName}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-500 uppercase text-[10px]">Payment Method</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                    {invoiceData.paymentMethod || 'UPI / Electronic'}
                  </p>
                  <p className="text-slate-500">Currency: INR (₹)</p>
                </div>
              </div>

              <table className="w-full text-xs text-left">
                <thead className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoiceData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-3 px-3">{item.description}</td>
                      <td className="py-3 px-3 text-right font-bold">₹{num(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-4">
                <span className="font-bold text-sm">Total Paid</span>
                <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                  ₹{num(invoiceData.total)}
                </span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </VisualPageBackground>
  );
}

export default function StudentPaymentsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-12 text-center text-xs text-slate-500">
          Loading billing and payment records…
        </div>
      }
    >
      <StudentPaymentsContent />
    </React.Suspense>
  );
}
