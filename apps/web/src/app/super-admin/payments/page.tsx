'use client';

import {
  AlertTriangle,
  ArrowDownLeft,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSpreadsheet,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

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
import { Field, Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

interface SuperAdminPayment {
  id: string;
  collegeName: string;
  studentName: string;
  studentEmail?: string;
  courseTitle: string;
  courseMode: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  transactionId: string;
  invoiceNumber?: string;
  createdAt: string | null;
}

export default function SuperAdminPaymentsPage() {
  const [activeTab, setActiveTab] = React.useState<'ledger' | 'queue'>('ledger');
  const [search, setSearch] = React.useState('');

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectingPaymentId, setRejectingPaymentId] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('Payment not received / Invalid UTR');
  const [processingAction, setProcessingAction] = React.useState(false);

  const query = useApi<SuperAdminPayment[]>('/super-admin/payments', undefined, {
    select: (res) => res.data ?? res,
  });

  const queueQuery = useApi<SuperAdminPayment[]>('/super-admin/payments/verification-queue', undefined, {
    select: (res) => res.data ?? res,
  });

  const payments: SuperAdminPayment[] = Array.isArray(query.data) ? query.data : [];
  const queueItems: SuperAdminPayment[] = Array.isArray(queueQuery.data) ? queueQuery.data : [];

  const completed = payments.filter((p) => p.status === 'completed' || p.status === 'success' || p.status === 'verified');
  const grossRevenue = completed.reduce((acc, p) => acc + (p.amount || 0), 0);
  const avgTicket = completed.length > 0 ? grossRevenue / completed.length : 0;

  const handleVerify = async (paymentId: string) => {
    setProcessingAction(true);
    try {
      await api.post(`/super-admin/payments/${paymentId}/verify`, {
        note: 'Approved and verified by Super Admin',
      });
      toast.success('Payment verified! Course access activated server-side.');
      query.refetch();
      queueQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Verification failed.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingPaymentId) return;
    setProcessingAction(true);
    try {
      await api.post(`/super-admin/payments/${rejectingPaymentId}/reject`, {
        reason: rejectionReason,
      });
      toast.success('Payment rejected and enrollment cancelled.');
      setRejectModalOpen(false);
      setRejectingPaymentId(null);
      query.refetch();
      queueQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Rejection failed.');
    } finally {
      setProcessingAction(false);
    }
  };

  const filtered = payments.filter(
    (p) =>
      p.collegeName.toLowerCase().includes(search.toLowerCase()) ||
      p.studentName.toLowerCase().includes(search.toLowerCase()) ||
      p.courseTitle.toLowerCase().includes(search.toLowerCase()) ||
      p.transactionId.toLowerCase().includes(search.toLowerCase())
  );

  const filteredQueue = queueItems.filter(
    (p) =>
      p.studentName.toLowerCase().includes(search.toLowerCase()) ||
      p.courseTitle.toLowerCase().includes(search.toLowerCase()) ||
      p.transactionId.toLowerCase().includes(search.toLowerCase()) ||
      (p.studentEmail && p.studentEmail.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <GlobalPageBackground image="/images/backgrounds/payments.webp" variant="dark">
      <div className="space-y-6">
      <PageHeader
        title="Platform Financial Operations & Verification"
        description="Dual-mode course payment processing, Super Admin verification queue, and cross-tenant revenue tracking."
        actions={
          <div className="flex items-center gap-3">
            {queueItems.length > 0 && (
              <Badge tone="amber" dot className="animate-pulse">
                {queueItems.length} Pending Approval
              </Badge>
            )}
            <Badge tone="success" className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              Gateway Health: 100% OK
            </Badge>
          </div>
        }
      />

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Gross Platform Revenue"
          value={`₹${num(grossRevenue)}`}
          tone="indigo"
          icon={<CreditCard className="size-4" />}
          hint="Verified across online & offline"
        />
        <StatCard
          label="Verification Queue"
          value={num(queueItems.length)}
          tone={queueItems.length > 0 ? 'amber' : 'success'}
          icon={<Clock className="size-4" />}
          hint="Awaiting admin approval"
        />
        <StatCard
          label="Settled Transactions"
          value={num(completed.length)}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
          hint="Cleared orders"
        />
        <StatCard
          label="Average Ticket Size"
          value={`₹${num(avgTicket, 0)}`}
          tone="info"
          icon={<Receipt className="size-4" />}
          hint="Per enrolled participant"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'ledger'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileSpreadsheet className="size-4" />
          All Transactions Ledger ({payments.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'queue'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="size-4" />
          Verification Queue
          {queueItems.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 font-bold">
              {queueItems.length}
            </span>
          )}
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'queue' ? (
        <Card>
          <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="size-4 text-amber-500" />
                  Offline & Direct Payment Verification Queue
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Transactions pending admin verification. Approving activates participant course access immediately server-side.
                </p>
              </div>

              <div className="relative max-w-xs w-full">
                <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search participant, course, txn ID…"
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {filteredQueue.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                <CheckCircle2 className="size-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">All caught up!</p>
                <p className="text-slate-400 mt-0.5">No transactions currently pending verification.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3">Txn ID</th>
                      <th className="px-5 py-3">Participant</th>
                      <th className="px-5 py-3">Course</th>
                      <th className="px-5 py-3">Mode</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3 text-right">Verification Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredQueue.map((p) => (
                      <tr key={p.id} className="hover:bg-amber-50/20 dark:hover:bg-amber-950/10">
                        <td className="px-5 py-3.5 font-mono font-medium text-slate-700 dark:text-slate-300">
                          {p.transactionId}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900 dark:text-white">{p.studentName}</p>
                          {p.studentEmail && (
                            <p className="text-[11px] text-slate-400">{p.studentEmail}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                          {p.courseTitle}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={p.courseMode === 'OFFLINE' ? 'amber' : 'indigo'}>
                            {p.courseMode === 'OFFLINE' ? 'Offline (College)' : 'Online (Direct)'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                          ₹{num(p.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">
                          {p.createdAt ? formatDate(p.createdAt) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setRejectingPaymentId(p.id);
                                setRejectionReason('Payment not received / Invalid UTR');
                                setRejectModalOpen(true);
                              }}
                              disabled={processingAction}
                              className="h-7 px-2 text-[11px] text-rose-600 hover:bg-rose-50"
                            >
                              <XCircle className="size-3 mr-1" />
                              Reject
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleVerify(p.id)}
                              disabled={processingAction}
                              className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <Check className="size-3 mr-1" />
                              Verify & Activate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Global Transaction Ledger</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Every transaction logged across colleges and direct online learners with course mode isolation
                </p>
              </div>

              <div className="relative max-w-xs w-full">
                <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search college, participant, course…"
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No transactions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3">Txn ID</th>
                      <th className="px-5 py-3">Institution / Platform</th>
                      <th className="px-5 py-3">Participant</th>
                      <th className="px-5 py-3">Course</th>
                      <th className="px-5 py-3">Mode</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Method</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3.5 font-mono text-slate-600 dark:text-slate-300 font-medium">
                          {p.transactionId}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                          {p.collegeName}
                        </td>
                        <td className="px-5 py-3.5 text-slate-900 dark:text-white font-medium">
                          {p.studentName}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                          {p.courseTitle}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={p.courseMode === 'OFFLINE' ? 'amber' : 'indigo'}>
                            {p.courseMode === 'OFFLINE' ? 'Offline' : 'Online'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                          ₹{num(p.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">{p.paymentMethod}</td>
                        <td className="px-5 py-3.5 text-slate-500">
                          {p.createdAt ? formatDate(p.createdAt) : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge
                            tone={
                              p.status === 'completed' || p.status === 'success' || p.status === 'verified'
                                ? 'success'
                                : p.status === 'pending' || p.status === 'pending_verification'
                                ? 'amber'
                                : 'danger'
                            }
                          >
                            {p.status === 'pending_verification' ? 'Pending Approval' : p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Reject Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Payment Transaction</DialogTitle>
            <DialogDescription>
              Specify a reason for rejecting this payment. The associated course enrollment will be cancelled.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <Field label="Rejection Reason / Note" htmlFor="rejReason" required>
              <Input
                id="rejReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., UTR mismatch, payment not received, fraud"
              />
            </Field>

            <div className="pt-3 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setRejectModalOpen(false)}
                disabled={processingAction}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleReject}
                loading={processingAction}
                disabled={processingAction || !rejectionReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </GlobalPageBackground>
  );
}
