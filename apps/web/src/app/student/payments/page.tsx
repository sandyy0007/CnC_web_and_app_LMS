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
  Receipt,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

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
  courseId?: string;
  courseTitle?: string;
  courseMode?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'completed' | 'verified' | 'failed' | 'refunded' | 'pending_verification';
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
  status: 'active' | 'expired' | 'converted';
  isActive: boolean;
}

interface InvoiceData {
  invoiceNumber: string;
  issuedAt: string;
  studentName: string;
  collegeName: string;
  items: Array<{ description: string; amount: number }>;
  total: number;
  status: string;
}

export default function StudentPaymentsPage() {
  const paymentsQuery = useApi<any>('/student/payments');
  const trialsQuery = useApi<any>('/student/trials');

  const [checkoutModalOpen, setCheckoutModalOpen] = React.useState(false);
  const [selectedTrialToBuy, setSelectedTrialToBuy] = React.useState<CourseTrial | null>(null);
  const [selectedMode, setSelectedMode] = React.useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [checkoutProcessing, setCheckoutProcessing] = React.useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = React.useState(false);

  // Invoice modal state
  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [invoiceData, setInvoiceData] = React.useState<InvoiceData | null>(null);
  const [loadingInvoice, setLoadingInvoice] = React.useState(false);

  const payments: PaymentRecord[] =
    paymentsQuery.data?.payments ?? paymentsQuery.data?.data?.payments ?? paymentsQuery.data ?? [];
  const trials: CourseTrial[] =
    trialsQuery.data?.trials ?? trialsQuery.data?.data?.trials ?? trialsQuery.data ?? [];

  const successfulPayments = payments.filter((p) => p.status === 'success');
  const totalSpent = successfulPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const activeTrials = trials.filter((t) => t.isActive);

  // View Invoice
  const handleViewInvoice = async (paymentId: string) => {
    setLoadingInvoice(true);
    setInvoiceModalOpen(true);
    try {
      const res = await api.get<any>(`/student/payments/${paymentId}/invoice`);
      setInvoiceData(res?.invoice ?? res?.data?.invoice ?? res);
    } catch {
      // ignore
    } finally {
      setLoadingInvoice(false);
    }
  };

  // Open checkout for a course trial
  const handleBuyCourse = (trial: CourseTrial) => {
    setSelectedTrialToBuy(trial);
    setCheckoutSuccess(false);
    setCheckoutModalOpen(true);
  };

  // Perform Mock/Standard Checkout
  const handleConfirmCheckout = async () => {
    if (!selectedTrialToBuy) return;
    setCheckoutProcessing(true);
    try {
      const res = await api.post<any>('/student/payments/checkout', {
        courseId: selectedTrialToBuy.courseId,
        courseMode: selectedMode,
        amount: 2499,
        currency: 'INR',
        purpose: `Full Lifetime Access: ${selectedTrialToBuy.courseName} (${selectedMode})`,
        referenceType: 'course',
        referenceId: selectedTrialToBuy.courseId,
      });

      // If mock checkout simulates immediate redirect/success
      setCheckoutSuccess(true);
      setTimeout(() => {
        setCheckoutModalOpen(false);
        setCheckoutSuccess(false);
        setSelectedTrialToBuy(null);
        paymentsQuery.refetch();
        trialsQuery.refetch();
      }, 1500);
    } catch {
      // error handled
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
          title="Billing, Payments & Subscriptions"
          subtitle="View your active course trials, verify transactions, and download official tax receipts."
          badge={
            <Badge tone="success" className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-200 border-emerald-500/30">
              <ShieldCheck className="size-3.5" />
              PCI-DSS Encrypted Payments
            </Badge>
          }
        />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Invested"
          value={`₹${num(totalSpent)}`}
          tone="indigo"
          icon={<CreditCard className="size-4" />}
          hint="Lifetime course & cert purchases"
        />
        <StatCard
          label="Active 7-Day Trials"
          value={num(activeTrials.length)}
          tone={activeTrials.length > 0 ? 'amber' : 'indigo'}
          icon={<Clock className="size-4" />}
          hint="Courses currently on free trial"
        />
        <StatCard
          label="Invoices Generated"
          value={num(successfulPayments.length)}
          tone="success"
          icon={<Receipt className="size-4" />}
          hint="Available for download"
        />
        <StatCard
          label="Payment Gateway"
          value="Verified Safe"
          tone="info"
          icon={<Sparkles className="size-4" />}
          hint="Mock / Razorpay / Stripe ready"
        />
      </div>

      {/* Active 7-Day Trials Section */}
      {trials.length > 0 && (
        <Card>
          <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="size-4 text-amber-500" />
                  Your Course Free Trials (7 Days)
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Full curriculum access during your trial period. Upgrade anytime to keep your progress and earn verified certificates.
                </p>
              </div>
              <Badge tone="amber">
                7-Day Server Countdown
              </Badge>
            </div>
          </CardHeader>
          <CardBody className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trials.map((trial) => {
                const isExpiringSoon = trial.isActive && trial.daysRemaining <= 2;
                return (
                  <div
                    key={trial.id}
                    className={cn(
                      'p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3',
                      trial.status === 'converted'
                        ? 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : trial.isActive
                        ? isExpiringSoon
                          ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                        : 'border-rose-200 bg-rose-50/30 dark:bg-rose-950/10 opacity-75'
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-1">
                          {trial.courseName}
                        </span>
                        <Badge
                          tone={
                            trial.status === 'converted'
                              ? 'success'
                              : trial.isActive
                              ? isExpiringSoon
                                ? 'amber'
                                : 'indigo'
                              : 'danger'
                          }
                        >
                          {trial.status === 'converted'
                            ? 'Purchased'
                            : trial.isActive
                            ? `${trial.daysRemaining} days left`
                            : 'Trial Expired'}
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
                        className="text-xs text-indigo hover:underline font-medium"
                      >
                        Open Course →
                      </Link>

                      {trial.status !== 'converted' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleBuyCourse(trial)}
                          className="text-xs"
                        >
                          {trial.isActive ? 'Unlock Lifetime' : 'Purchase Course'}
                        </Button>
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
      <Card>
        <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Payment & Invoices History</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete log of all course enrollments, assessment fees, and certifications
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
                When you purchase lifetime course access or certifications, your invoices and payment receipts will appear here.
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
                    <th className="px-5 py-3">Txn ID</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Receipt</th>
                    <th className="px-5 py-3 text-right">Course Access</th>
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
                          <Badge tone={p.courseMode === 'OFFLINE' ? 'amber' : 'indigo'}>
                            {p.courseMode === 'OFFLINE' ? 'Offline' : 'Online'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">
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
                                ? 'info'
                                : 'danger'
                            }
                          >
                            {p.status === 'pending_verification'
                              ? 'Pending Approval'
                              : p.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-600 dark:text-slate-300 font-medium">
                          {p.transactionId || p.orderId || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">
                          {formatDate(p.createdAt || p.paidAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          {isAccessActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-indigo hover:text-indigo/80 p-1 flex items-center gap-1"
                              onClick={() => handleViewInvoice(p.id)}
                            >
                              <FileText className="size-3.5" />
                              View
                            </Button>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {isAccessActive && p.courseId ? (
                            <Link
                              href={`/student/learning/${p.courseId}`}
                              className="inline-flex items-center gap-1 text-xs text-indigo font-semibold hover:underline"
                            >
                              Go to Course →
                            </Link>
                          ) : p.status === 'pending_verification' ? (
                            <span className="text-[11px] text-amber-600 font-medium">Awaiting Verification</span>
                          ) : (
                            <span className="text-slate-400">—</span>
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

      {/* Checkout Modal */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Full Lifetime Access</DialogTitle>
            <DialogDescription>
              Transition from 7-day trial to permanent course enrollment with verified certificate.
            </DialogDescription>
          </DialogHeader>

          {checkoutSuccess ? (
            <div className="p-8 text-center space-y-3">
              <CheckCircle2 className="size-12 text-emerald-500 mx-auto animate-bounce" />
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Payment Successful!
              </h3>
              <p className="text-xs text-slate-500">
                You now have full lifetime access to this program. An official GST invoice has been generated.
              </p>
            </div>
          ) : selectedTrialToBuy ? (
            <div className="p-6 space-y-5">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-800 dark:text-slate-200">{selectedTrialToBuy.courseName}</span>
                  <span className="text-indigo font-bold">₹2,499</span>
                </div>
                <p className="text-xs text-slate-500">
                  Includes all interactive lab lessons, lifetime updates, and verifiable certificate of completion.
                </p>
              </div>

              {/* Mode Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Choose Learning Mode:
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
                    <p className="text-[11px] text-slate-500 font-normal">Self-Paced, Cloud Labs</p>
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
                    <p className="text-[11px] text-slate-500 font-normal">In-Person Sessions</p>
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-500" />
                  <span>Instant access without data loss (your trial progress is preserved)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span>30-Day Money Back Guarantee</span>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCheckoutModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={checkoutProcessing}
                  onClick={handleConfirmCheckout}
                  className="flex items-center gap-1.5"
                >
                  <CreditCard className="size-3.5" />
                  {checkoutProcessing ? 'Processing Payment…' : 'Pay ₹2,499 (Instant Checkout)'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Invoice View Modal */}
      <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Tax Invoice & Payment Receipt</DialogTitle>
            <DialogDescription>
              Official electronic receipt issued by Winners Creek Platform.
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
                    Online / Electronic
                  </p>
                  <p className="text-slate-500">Currency: INR (₹)</p>
                </div>
              </div>

              <table className="w-full text-xs text-left">
                <thead className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoiceData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {item.description}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        ₹{num(item.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold text-sm bg-slate-50/60 dark:bg-slate-800/40">
                    <td className="py-3 px-3">Total Paid</td>
                    <td className="py-3 px-3 text-right text-indigo font-mono">
                      ₹{num(invoiceData.total)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="pt-2 flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Download className="size-3.5" />
                  Print / Save PDF
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      </div>
    </VisualPageBackground>
  );
}
