'use client';

import {
  CheckCircle2,
  Clock,
  CreditCard,
  FileSpreadsheet,
  Receipt,
  ShieldCheck,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { formatDate, num } from '@/lib/format';

interface TrainerPayment {
  id: string;
  orderId: string;
  studentName: string;
  studentEmail: string;
  batchName: string;
  amount: number;
  currency: string;
  purpose: string;
  status: string;
  createdAt: string;
}

export default function TrainerPaymentsPage() {
  const query = useApi<any>('/trainer/payments');

  const rawPayments = query.data?.payments ?? query.data?.data?.payments ?? query.data ?? [];
  const payments: TrainerPayment[] = Array.isArray(rawPayments) ? rawPayments : [];

  const successful = payments.filter((p) => p.status === 'success');
  const totalRevenue = successful.reduce((acc, p) => acc + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch Payments & Enrollments"
        description="Monitor participant course fee transactions and enrollment fee status across your assigned batches."
        actions={
          <Badge tone="indigo" dot>
            {payments.length} Transactions Recorded
          </Badge>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Batch Course Revenue"
          value={`₹${num(totalRevenue)}`}
          tone="indigo"
          icon={<CreditCard className="size-4" />}
          hint="From enrolled batch participants"
        />
        <StatCard
          label="Paid Enrollments"
          value={num(successful.length)}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
          hint="Verified course fee receipts"
        />
        <StatCard
          label="Pending Payments"
          value={num(payments.filter((p) => p.status === 'pending').length)}
          tone="amber"
          icon={<Clock className="size-4" />}
          hint="Awaiting gateway clearance"
        />
        <StatCard
          label="Batches in Scope"
          value={num(new Set(payments.map((p) => p.batchName)).size || 1)}
          tone="info"
          icon={<Users className="size-4" />}
          hint="Active assigned batches"
        />
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Batch Payment Ledger</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time tracking of participant course purchases and certification settlements
              </p>
            </div>
            <Receipt className="size-5 text-indigo" />
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {payments.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="size-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                No transactions recorded for your batches yet
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                As participants in your batches purchase courses or convert from trials, their fee records will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-5 py-3">Order ID</th>
                    <th className="px-5 py-3">Participant</th>
                    <th className="px-5 py-3">Batch</th>
                    <th className="px-5 py-3">Item / Purpose</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5 font-mono text-slate-600 dark:text-slate-300 font-medium">
                        {p.orderId}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900 dark:text-white">{p.studentName}</p>
                        <p className="text-[11px] text-slate-400">{p.studentEmail}</p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-medium">
                        {p.batchName}
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
                              : 'danger'
                          }
                        >
                          {p.status}
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
    </div>
  );
}
