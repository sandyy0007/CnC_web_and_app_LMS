'use client';

import {
  AlertCircle,
  Archive,
  ArrowRight,
  BookOpen,
  CheckCircle,
  CheckCircle2,
  Clock,
  Download,
  Edit,
  Eye,
  FileText,
  FileUp,
  Filter,
  Flame,
  Globe,
  Lock,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldAlert,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { UploadEbookModal } from '@/components/ebook/UploadEbookModal';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
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
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

interface EbookItem {
  id: string;
  slug?: string;
  title: string;
  author: string;
  category: string;
  uploaderRole: string;
  uploadedBy?: string;
  status: string;
  published: boolean;
  isFeatured: boolean;
  isPinned: boolean;
  pageCount: number;
  fileSizeBytes: number;
  coverUrl?: string;
  readsCount: number;
  allowDownload: boolean;
  rejectionReason?: string;
  deletedAt?: string;
  createdAt?: string;
  publishedAt?: string;
}

interface PublishRequest {
  id: string;
  ebookId: string;
  title: string;
  author: string;
  category: string;
  requesterRole: string;
  requesterName: string;
  requestMessage?: string;
  pageCount: number;
  fileSizeBytes: number;
  coverUrl?: string;
  createdAt: string;
}

interface ReportItem {
  id: string;
  ebookId: string;
  reason: string;
  details?: string;
  reporterUserId: string;
  createdAt: string;
}

export default function SuperAdminEbooksPage() {
  const [activeTab, setActiveTab] = React.useState<
    'pending' | 'published' | 'drafts' | 'rejected' | 'pinned' | 'featured' | 'all' | 'reports'
  >('pending');
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);

  // Rejection modal
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [selectedBookForReject, setSelectedBookForReject] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);

  // Edit metadata modal
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editingBook, setEditingBook] = React.useState<EbookItem | null>(null);
  const [editForm, setEditForm] = React.useState({
    title: '',
    description: '',
    category: 'General',
    tags: '',
    allowDownload: false,
  });
  const [savingEdit, setSavingEdit] = React.useState(false);

  // Fetch eBooks with status filter
  const statusParam =
    activeTab === 'published'
      ? 'status=PUBLISHED'
      : activeTab === 'drafts'
        ? 'status=DRAFT'
        : activeTab === 'rejected'
          ? 'status=REJECTED'
          : activeTab === 'pinned'
            ? 'status=PINNED'
            : activeTab === 'featured'
              ? 'status=FEATURED'
              : activeTab === 'pending'
                ? 'status=PENDING_REVIEW'
                : '';

  const queryUrl = `/super-admin/ebooks?limit=100${statusParam ? `&${statusParam}` : ''}${
    categoryFilter !== 'all' ? `&category=${encodeURIComponent(categoryFilter)}` : ''
  }${search ? `&search=${encodeURIComponent(search)}` : ''}`;

  const ebooksQuery = useApi<{
    data: EbookItem[];
    meta: {
      total: number;
      counts: {
        all: number;
        pending: number;
        published: number;
        unpublished: number;
        rejected: number;
        drafts: number;
        featured: number;
        pinned: number;
        deleted: number;
      };
    };
  }>(queryUrl);

  // Fetch pending requests specifically
  const requestsQuery = useApi<PublishRequest[]>('/super-admin/ebooks/requests', undefined, {
    select: (res) => res.data ?? res,
  });

  // Fetch reports
  const reportsQuery = useApi<ReportItem[]>('/super-admin/ebooks/reports', undefined, {
    select: (res) => res.data ?? res,
  });

  const ebooks = ebooksQuery.data?.data || [];
  const counts = ebooksQuery.data?.meta?.counts || {
    all: 0,
    pending: 0,
    published: 0,
    unpublished: 0,
    rejected: 0,
    drafts: 0,
    featured: 0,
    pinned: 0,
    deleted: 0,
  };
  const requests = requestsQuery.data || [];
  const reports = reportsQuery.data || [];

  const refreshAll = () => {
    ebooksQuery.refetch();
    requestsQuery.refetch();
    reportsQuery.refetch();
  };

  // Actions
  const handleApprove = async (ebookId: string) => {
    try {
      await api.post(`/super-admin/ebooks/${ebookId}/approve`);
      toast.success('eBook approved and published live!');
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve eBook.');
    }
  };

  const handleOpenReject = (ebookId: string) => {
    setSelectedBookForReject(ebookId);
    setRejectionReason('');
    setRejectModalOpen(true);
  };

  const submitReject = async () => {
    if (!selectedBookForReject || !rejectionReason.trim()) {
      toast.error('Please specify a rejection reason.');
      return;
    }
    setRejecting(true);
    try {
      await api.post(`/super-admin/ebooks/${selectedBookForReject}/reject`, {
        reason: rejectionReason.trim(),
      });
      toast.success('Publication request rejected with feedback provided.');
      setRejectModalOpen(false);
      setSelectedBookForReject(null);
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject eBook.');
    } finally {
      setRejecting(false);
    }
  };

  const togglePublish = async (book: EbookItem) => {
    try {
      if (book.published) {
        await api.post(`/super-admin/ebooks/${book.id}/unpublish`);
        toast.info('eBook unpublished.');
      } else {
        await api.post(`/super-admin/ebooks/${book.id}/publish`);
        toast.success('eBook published live.');
      }
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Action failed.');
    }
  };

  const togglePin = async (book: EbookItem) => {
    try {
      if (book.isPinned) {
        await api.post(`/super-admin/ebooks/${book.id}/unpin`);
        toast.info('eBook unpinned.');
      } else {
        await api.post(`/super-admin/ebooks/${book.id}/pin`);
        toast.success('eBook pinned to top.');
      }
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Action failed.');
    }
  };

  const toggleFeature = async (book: EbookItem) => {
    try {
      if (book.isFeatured) {
        await api.post(`/super-admin/ebooks/${book.id}/unfeature`);
        toast.info('Removed from Featured.');
      } else {
        await api.post(`/super-admin/ebooks/${book.id}/feature`);
        toast.success('Marked as Featured!');
      }
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Action failed.');
    }
  };

  const handleDelete = async (ebookId: string) => {
    if (!confirm('Are you sure you want to remove this eBook?')) return;
    try {
      await api.delete(`/super-admin/ebooks/${ebookId}`);
      toast.success('eBook soft-deleted.');
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete.');
    }
  };

  const handleRestore = async (ebookId: string) => {
    try {
      await api.post(`/super-admin/ebooks/${ebookId}/restore`);
      toast.success('eBook restored as draft.');
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore.');
    }
  };

  const openEditModal = (book: EbookItem) => {
    setEditingBook(book);
    setEditForm({
      title: book.title || '',
      description: '',
      category: book.category || 'General',
      tags: '',
      allowDownload: !!book.allowDownload,
    });
    setEditModalOpen(true);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBook) return;
    setSavingEdit(true);
    try {
      await api.patch(`/super-admin/ebooks/${editingBook.id}`, {
        title: editForm.title.trim(),
        category: editForm.category,
        allowDownload: editForm.allowDownload,
      });
      toast.success('eBook metadata updated.');
      setEditModalOpen(false);
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update metadata.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <GlobalPageBackground image="/images/backgrounds/courses.webp" variant="dark">
      <div className="space-y-6">
        <PageHeader
          title="eBook Publishing & Moderation Engine"
          description="Manage community PDF uploads, moderate publish requests, pin featured editions, and review reports."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={refreshAll}>
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
              <Button variant="primary" size="sm" onClick={() => setUploadModalOpen(true)}>
                <FileUp className="size-3.5" />
                Upload PDF eBook
              </Button>
            </div>
          }
        />

        {/* KPI Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Publish Requests"
            value={num(counts.pending || requests.length)}
            tone="amber"
            icon={<Clock className="size-3.5" />}
            hint="Awaiting super admin review"
          />
          <StatCard
            label="Live Published"
            value={num(counts.published)}
            tone="success"
            icon={<Globe className="size-3.5" />}
            hint="Publicly visible in library"
          />
          <StatCard
            label="Total Library Items"
            value={num(counts.all)}
            tone="indigo"
            icon={<BookOpen className="size-3.5" />}
            hint="All formats, drafts, published"
          />
          <StatCard
            label="Community Reports"
            value={num(reports.length)}
            tone={reports.length > 0 ? 'danger' : 'info'}
            icon={<ShieldAlert className="size-3.5" />}
            hint="Flagged content & broken files"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'pending'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-white/80 text-ink-2 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              <Clock className="size-3.5" />
              Pending Requests
              {counts.pending > 0 && (
                <span className="rounded-full bg-white/30 px-1.5 py-0.2 text-[10px] font-bold">
                  {counts.pending}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('published')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'published'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white/80 text-ink-2 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              <Globe className="size-3.5" />
              Published ({counts.published})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('featured')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'featured'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/80 text-ink-2 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              <Flame className="size-3.5 text-amber-300" />
              Featured ({counts.featured})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pinned')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'pinned'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/80 text-ink-2 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              <Pin className="size-3.5" />
              Pinned ({counts.pinned})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('drafts')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'drafts'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/80 text-ink-2 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              <FileText className="size-3.5" />
              Drafts ({counts.drafts})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rejected')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'rejected'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white/80 text-ink-2 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              <XCircle className="size-3.5" />
              Rejected ({counts.rejected})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white/80 text-ink-2 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              <BookOpen className="size-3.5" />
              All eBooks ({counts.all})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'reports'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white/80 text-ink-2 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              <ShieldAlert className="size-3.5" />
              Reports ({reports.length})
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-ink-3" />
              <input
                type="text"
                placeholder="Search title, author, role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-lg border border-line-soft bg-white pl-8 pr-3 text-xs text-ink-1 focus:border-indigo focus:outline-none dark:bg-slate-900 dark:border-slate-700"
              />
            </div>
          </div>
        </div>

        {/* TAB CONTENT: PENDING REQUESTS */}
        {activeTab === 'pending' && (
          <div className="space-y-4">
            {requests.length === 0 ? (
              <Card>
                <CardBody className="p-8 text-center text-ink-3">
                  <CheckCircle className="mx-auto size-12 text-emerald-500 mb-3" />
                  <p className="text-sm font-semibold text-ink-1">All Caught Up!</p>
                  <p className="text-xs mt-1">There are no pending eBook publish requests requiring review.</p>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-4">
                {requests.map((req) => (
                  <Card key={req.id} className="border-amber-200/50 bg-amber-50/10 hover:shadow-md transition-shadow">
                    <CardBody className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="size-16 rounded-lg bg-slate-900 border border-line-soft overflow-hidden flex items-center justify-center shrink-0">
                            {req.coverUrl ? (
                              <img src={req.coverUrl} alt={req.title} className="h-full w-full object-cover" />
                            ) : (
                              <BookOpen className="size-7 text-indigo-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-ink-1 text-sm">{req.title}</h4>
                              <Badge tone="amber">Pending Review</Badge>
                              <Badge tone="neutral">{req.category}</Badge>
                            </div>
                            <p className="text-xs text-ink-2 mt-1">
                              By <span className="font-semibold">{req.author}</span> • Requested by{' '}
                              <span className="font-semibold text-indigo-600">{req.requesterName}</span> ({req.requesterRole})
                            </p>
                            {req.requestMessage && (
                              <p className="mt-2 text-xs italic text-ink-3 bg-white/60 dark:bg-slate-800/60 p-2 rounded border border-line-soft">
                                &quot;{req.requestMessage}&quot;
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-2xs text-ink-3 mt-2">
                              <span>{req.pageCount} pages</span>
                              <span>{(req.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                              <span>Submitted {formatDate(req.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <Link href={`/ebooks/${req.ebookId}`} target="_blank">
                            <Button variant="secondary" size="sm">
                              <Eye className="size-3.5" />
                              Inspect
                            </Button>
                          </Link>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleOpenReject(req.ebookId)}
                          >
                            <XCircle className="size-3.5" />
                            Reject
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleApprove(req.ebookId)}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="size-3.5" />
                            Approve & Publish
                          </Button>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: REPORTS */}
        {activeTab === 'reports' && (
          <Card>
            <CardHeader>
              <CardTitle>Community Content & Quality Reports</CardTitle>
            </CardHeader>
            <CardBody className="p-0 overflow-x-auto">
              {reports.length === 0 ? (
                <div className="p-8 text-center text-ink-3 text-xs">
                  No reports logged. The library content is clean.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line-soft bg-slate-50/70 text-ink-3 uppercase font-semibold text-2xs tracking-wider dark:bg-slate-900/60">
                    <tr>
                      <th className="px-4 py-3">eBook ID</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Details</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {reports.map((rep) => (
                      <tr key={rep.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-ink-2">{rep.ebookId.slice(-8)}</td>
                        <td className="px-4 py-3.5 font-semibold text-rose-600">{rep.reason}</td>
                        <td className="px-4 py-3.5 text-ink-2 max-w-xs truncate">{rep.details || '—'}</td>
                        <td className="px-4 py-3.5 text-ink-3">{formatDate(rep.createdAt)}</td>
                        <td className="px-4 py-3.5 text-right">
                          <Link href={`/ebooks/${rep.ebookId}`} target="_blank">
                            <Button variant="secondary" size="sm">
                              <Eye className="size-3" />
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        )}

        {/* TAB CONTENT: EBOOKS TABLE (FOR ALL OTHER TABS) */}
        {activeTab !== 'pending' && activeTab !== 'reports' && (
          <Card>
            <CardBody className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line-soft bg-slate-50/70 text-ink-3 uppercase font-semibold text-2xs tracking-wider dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-3">eBook & Details</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Pages / Size</th>
                    <th className="px-4 py-3">Uploader</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Reads</th>
                    <th className="px-4 py-3 text-right">Moderation Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {ebooks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                        No eBooks found in this view.
                      </td>
                    </tr>
                  ) : (
                    ebooks.map((book) => (
                      <tr key={book.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-md bg-slate-900 border border-line-soft overflow-hidden flex items-center justify-center shrink-0">
                              {book.coverUrl ? (
                                <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover" />
                              ) : (
                                <BookOpen className="size-5 text-indigo-400" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-ink-1 text-sm">{book.title}</p>
                                {book.isPinned && (
                                  <span title="Pinned to top">
                                    <Pin className="size-3 text-indigo-600 fill-indigo-600" />
                                  </span>
                                )}
                                {book.isFeatured && (
                                  <span title="Featured">
                                    <Flame className="size-3 text-amber-500 fill-amber-500" />
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-ink-3">by {book.author}</p>
                              {book.rejectionReason && (
                                <p className="text-2xs text-rose-500 mt-0.5">
                                  Reason: {book.rejectionReason}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge tone="neutral">{book.category}</Badge>
                        </td>
                        <td className="px-4 py-3.5 text-ink-2">
                          {book.pageCount} pages
                          <br />
                          <span className="text-2xs text-ink-3">
                            {(book.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge
                            tone={
                              book.uploaderRole === 'SUPER_ADMIN'
                                ? 'indigo'
                                : book.uploaderRole === 'TRAINER'
                                  ? 'success'
                                  : 'neutral'
                            }
                          >
                            {book.uploaderRole}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge
                            tone={
                              book.status === 'PUBLISHED'
                                ? 'success'
                                : book.status === 'PENDING_REVIEW'
                                  ? 'amber'
                                  : book.status === 'REJECTED'
                                    ? 'danger'
                                    : 'neutral'
                            }
                          >
                            {book.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-ink-1">
                          {num(book.readsCount || 0)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Inspect/Read */}
                            <Link href={`/ebooks/${book.id}`} target="_blank">
                              <Button variant="secondary" size="sm" title="Preview Public Page">
                                <Eye className="size-3" />
                              </Button>
                            </Link>

                            {/* Pin / Unpin */}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => togglePin(book)}
                              title={book.isPinned ? 'Unpin' : 'Pin to Top'}
                            >
                              <Pin
                                className={`size-3 ${book.isPinned ? 'text-indigo-600 fill-indigo-600' : ''}`}
                              />
                            </Button>

                            {/* Feature / Unfeature */}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => toggleFeature(book)}
                              title={book.isFeatured ? 'Remove Feature' : 'Mark as Featured'}
                            >
                              <Flame
                                className={`size-3 ${book.isFeatured ? 'text-amber-500 fill-amber-500' : ''}`}
                              />
                            </Button>

                            {/* Publish / Unpublish Toggle */}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => togglePublish(book)}
                              title={book.published ? 'Unpublish' : 'Publish Live'}
                            >
                              {book.published ? (
                                <Lock className="size-3 text-amber-500" />
                              ) : (
                                <Globe className="size-3 text-emerald-600" />
                              )}
                            </Button>

                            {/* Edit Metadata */}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openEditModal(book)}
                              title="Edit Metadata"
                            >
                              <Edit className="size-3" />
                            </Button>

                            {/* Delete / Restore */}
                            {book.status === 'DELETED' ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRestore(book.id)}
                                title="Restore"
                              >
                                <RotateCcw className="size-3 text-emerald-600" />
                              </Button>
                            ) : (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDelete(book.id)}
                                title="Soft Delete"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>

      {/* REJECT MODAL */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Publication Request</DialogTitle>
            <DialogDescription>
              Please provide clear, actionable feedback to the author explaining why this eBook
              was rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-ink-1 mb-1">
                Rejection Reason *
              </label>
              <textarea
                rows={4}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Please format table of contents, fix low-resolution diagrams, or replace copyrighted material on page 14."
                className="w-full rounded-lg border border-line-soft bg-white p-2.5 text-xs text-ink-1 focus:border-indigo focus:outline-none dark:bg-slate-900"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRejectModalOpen(false)}
                disabled={rejecting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={submitReject}
                disabled={rejecting || !rejectionReason.trim()}
              >
                {rejecting ? 'Submitting...' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT METADATA MODAL */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit eBook Metadata</DialogTitle>
            <DialogDescription>
              Update catalog details, category, and download permissions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold text-ink-1 mb-1">Title *</label>
              <input
                type="text"
                required
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full rounded-lg border border-line-soft bg-white p-2 text-xs text-ink-1 focus:border-indigo focus:outline-none dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-1 mb-1">Category</label>
              <select
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                className="w-full rounded-lg border border-line-soft bg-white p-2 text-xs text-ink-1 focus:border-indigo focus:outline-none dark:bg-slate-900"
              >
                <option value="Programming">Programming</option>
                <option value="DSA">DSA</option>
                <option value="Web Development">Web Development</option>
                <option value="AI/ML">AI/ML</option>
                <option value="Cloud Computing">Cloud Computing</option>
                <option value="Cyber Security">Cyber Security</option>
                <option value="Data Science">Data Science</option>
                <option value="Interview Preparation">Interview Preparation</option>
                <option value="Academic">Academic</option>
                <option value="Career">Career</option>
                <option value="General">General</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="editAllowDownload"
                checked={editForm.allowDownload}
                onChange={(e) => setEditForm({ ...editForm, allowDownload: e.target.checked })}
                className="rounded border-line-soft text-indigo focus:ring-0"
              />
              <label htmlFor="editAllowDownload" className="text-xs text-ink-2 select-none">
                Allow authenticated users to download original PDF
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditModalOpen(false)}
                disabled={savingEdit}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* UPLOAD MODAL */}
      <UploadEbookModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={refreshAll}
        uploaderRole="SUPER_ADMIN"
      />
    </GlobalPageBackground>
  );
}
