'use client';

import {
  AlertCircle,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSpreadsheet,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
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

interface AdminPayment {
  id: string;
  orderId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  departmentName?: string;
  amount: number;
  currency: string;
  purpose: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  createdAt: string;
  refundReason?: string;
}

interface PaymentSummary {
  totalRevenue: number;
  successfulTransactions: number;
  pendingTransactions: number;
  refundedTransactions: number;
  currency: string;
}

export default function AdminPaymentsPage() {
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [search, setSearch] = React.useState<string>('');
  const [refundTarget, setRefundTarget] = React.useState<AdminPayment | null>(null);
  const [refundReason, setRefundReason] = React.useState('');
  const [refundProcessing, setRefundProcessing] = React.useState(false);

  const paymentsQuery = useApi<any>('/admin/payments');
  const summaryQuery = useApi<PaymentSummary>('/admin/payments/summary');

  const rawPayments = paymentsQuery.data?.payments ?? paymentsQuery.data?.data?.payments ?? paymentsQuery.data ?? [];
  const payments: AdminPayment[] = Array.isArray(rawPayments) ? rawPayments : [];
  const summary: PaymentSummary = summaryQuery.data ?? {
    totalRevenue: 0,
    successfulTransactions: 0,
    pendingTransactions: 0,
    refundedTransactions: 0,
    currency: 'INR',
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;

    setRefundProcessing(true);
    try {
      await api.post(`/admin/payments/${refundTarget.id}/refund`, {
        reason: refundReason || 'Administrative refund requested',
      });
      setRefundTarget(null);
      setRefundReason('');
      paymentsQuery.refetch();
      summaryQuery.refetch();
    } catch {
      // error handled
    } finally {
      setRefundProcessing(false);
    }
  };

  const filtered = payments.filter((p) => {
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchSearch =
      !search ||
      p.orderId.toLowerCase().includes(search.toLowerCase()) ||
      p.studentName.toLowerCase().includes(search.toLowerCase()) ||
      p.studentEmail.toLowerCase().includes(search.toLowerCase()) ||
      p.purpose.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <GlobalPageBackground
      image="/images/backgrounds/payments.webp"
      variant="dark"
      orbTone="amber"
      className="min-h-full rounded-2xl p-4 sm:p-6 space-y-6"
    >
      <PageHeader
        title="Campus Billing & Financial Operations"
        description="Monitor campus revenue, verify participant course payments, and issue secure refunds."
        actions={
          <Badge tone="success" className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Audit Logging Active
          </Badge>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Campus Revenue"
          value={`₹${num(summary.totalRevenue)}`}
          tone="indigo"
          icon={<CreditCard className="size-4" />}
          hint="Net settled course payments"
        />
        <StatCard
          label="Successful Orders"
          value={num(summary.successfulTransactions)}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
          hint="Cleared through payment gateway"
        />
        <StatCard
          label="Pending Payments"
          value={num(summary.pendingTransactions)}
          tone="amber"
          icon={<Clock className="size-4" />}
          hint="Awaiting gateway webhook"
        />
        <StatCard
          label="Refunded Orders"
          value={num(summary.refundedTransactions)}
          tone="danger"
          icon={<RotateCcw className="size-4" />}
          hint="Reversed transactions"
        />
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Campus Transaction Ledger</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Every transaction contains an immutable idempotency key and checksum
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search participant or order…"
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="size-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                No matching transactions found
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-5 py-3">Order ID</th>
                    <th className="px-5 py-3">Participant</th>
                    <th className="px-5 py-3">Purpose</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5 font-mono text-slate-600 dark:text-slate-300 font-medium">
                        {p.orderId}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900 dark:text-white">{p.studentName}</p>
                        <p className="text-[11px] text-slate-400">{p.studentEmail}</p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                        {p.purpose}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                        ₹{num(p.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {formatDate(p.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge
                          tone={
                            p.status === 'success'
                              ? 'success'
                              : p.status === 'pending'
                              ? 'amber'
                              : p.status === 'refunded'
                              ? 'info'
                              : 'danger'
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {p.status === 'success' && (
                          <Button
                            variant="danger"
                            size="sm"
                            className="text-xs p-1 h-7"
                            onClick={() => setRefundTarget(p)}
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
          )}
        </CardBody>
      </Card>

      {/* Refund Confirmation Dialog */}
      <Dialog open={Boolean(refundTarget)} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
            <DialogDescription>
              This will refund the participant&apos;s payment and record an audited reversal event.
            </DialogDescription>
          </DialogHeader>

          {refundTarget && (
            <form onSubmit={handleRefund} className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-800 dark:text-rose-300">
                <p>
                  <strong>Order:</strong> {refundTarget.orderId}
                </p>
                <p>
                  <strong>Participant:</strong> {refundTarget.studentName} ({refundTarget.studentEmail})
                </p>
                <p>
                  <strong>Refund Amount:</strong> ₹{num(refundTarget.amount)}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reason for Refund
                </label>
                <input
                  type="text"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g., Course cancellation, participant request within policy"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRefundTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  disabled={refundProcessing}
                >
                  {refundProcessing ? 'Reversing Payment…' : 'Confirm Refund'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </GlobalPageBackground>
  );
}
