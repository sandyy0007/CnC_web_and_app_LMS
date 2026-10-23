'use client';

import * as React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Flag,
  Lock,
  MessageSquare,
  Share2,
  Star,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { PdfViewer } from '@/components/ebook/PdfViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/store';

export default function EbookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ebookId = params?.ebookId as string;
  const { user } = useAppSelector((state) => state.auth);

  const query = useApi<any>(`/ebooks/${ebookId}`);
  const [readingMode, setReadingMode] = React.useState<boolean>(false);
  const [reviewModal, setReviewModal] = React.useState<boolean>(false);
  const [reportModal, setReportModal] = React.useState<boolean>(false);
  const [rating, setRating] = React.useState<number>(5);
  const [reviewComment, setReviewComment] = React.useState<string>('');
  const [reportReason, setReportReason] = React.useState<string>('Incorrect Content');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  const book = query.data;

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push('/login');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/ebooks/${ebookId}/reviews`, { rating, comment: reviewComment });
      setReviewModal(false);
      setReviewComment('');
      query.refetch();
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push('/login');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/ebooks/${ebookId}/reports`, { reason: reportReason, details: reviewComment });
      setReportModal(false);
      alert('Thank you. Super Admin will review this report.');
    } finally {
      setSubmitting(false);
    }
  };

  if (query.initialLoading) {
    return (
      <div className="mx-auto max-w-[1180px] px-5 py-16 text-center text-slate-400">
        <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mx-auto mb-3" />
        <p className="text-xs">Loading eBook details…</p>
      </div>
    );
  }

  if (query.error || !book) {
    return (
      <div className="mx-auto max-w-[600px] px-5 py-20 text-center">
        <BookOpen className="size-12 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white">eBook Not Found</h2>
        <p className="mt-1 text-xs text-slate-400">
          This eBook may be unpublished or restricted.
        </p>
        <Button asChild variant="secondary" size="sm" className="mt-4">
          <Link href="/ebooks">Browse all eBooks</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-enter pb-24">
      {/* ---------------------------------------------------------------- Breadcrumb */}
      <div className="mx-auto max-w-[1180px] px-5 pt-8">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs text-ink-3 hover:text-ink-1">
          <Link href="/ebooks">
            <ArrowLeft className="size-3.5" /> Back to eBooks
          </Link>
        </Button>
      </div>

      {/* ---------------------------------------------------------------- Detail Section */}
      <div className="mx-auto max-w-[1180px] px-5 pt-6">
        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          {/* Cover & Fast Actions Card */}
          <div className="flex flex-col items-center">
            <div className="relative aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-2xl bg-slate-900 border border-white/10 shadow-2xl flex items-center justify-center">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-white">
                  <BookOpen className="size-16 text-indigo-400 mb-3" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                    {book.category}
                  </span>
                  <p className="mt-2 text-sm font-bold">{book.title}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex w-full max-w-[300px] flex-col gap-2.5">
              <Button
                variant="primary"
                size="md"
                className="w-full font-medium"
                onClick={() => setReadingMode(true)}
              >
                <BookOpen className="size-4" />
                {user ? 'Read Full eBook Online' : 'Preview First 5 Pages Free'}
              </Button>

              {book.allowDownload && user && (
                <Button asChild variant="secondary" size="sm" className="w-full gap-1.5">
                  <a href={`/api/v1/ebooks/${ebookId}/download`} download>
                    <Download className="size-3.5" /> Download Full PDF
                  </a>
                </Button>
              )}

              <div className="flex items-center justify-between px-2 pt-2 text-xs text-ink-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => (user ? setReviewModal(true) : router.push('/login'))}
                  className="hover:text-ink-1 flex items-center gap-1"
                >
                  <Star className="size-3.5 text-amber-500 fill-amber-500" /> Rate & Review
                </button>
                <button
                  type="button"
                  onClick={() => (user ? setReportModal(true) : router.push('/login'))}
                  className="hover:text-red-500 flex items-center gap-1"
                >
                  <Flag className="size-3.5" /> Report
                </button>
              </div>
            </div>
          </div>

          {/* Book Details */}
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="indigo">{book.category}</Badge>
              {book.isPinned && <Badge tone="amber">Pinned</Badge>}
              {book.isFeatured && <Badge tone="indigo">Featured</Badge>}
              <span className="text-xs text-ink-3">· {book.pageCount} Pages</span>
              <span className="text-xs text-ink-3">· {book.readsCount} Readers</span>
            </div>

            <h1 className="mt-3 text-2xl sm:text-3xl font-bold font-serif text-ink-1">{book.title}</h1>
            <p className="mt-1 text-sm text-indigo font-medium">Authored by {book.author}</p>

            {/* Rating Stars Summary */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex items-center text-amber-500">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={cn(
                      'size-4',
                      s <= Math.round(book.averageRating || 5)
                        ? 'fill-amber-500 text-amber-500'
                        : 'text-slate-300 dark:text-slate-600'
                    )}
                  />
                ))}
              </div>
              <span className="text-xs font-bold text-ink-1">{book.averageRating || '5.0'}</span>
              <span className="text-xs text-ink-3">({book.ratingsCount || 0} reviews)</span>
            </div>

            {/* Tags */}
            {book.tags && book.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {book.tags.map((t: string, idx: number) => (
                  <span
                    key={`public-ebook-tag-${t}-${idx}`}
                    className="rounded-md bg-surface-muted px-2.5 py-1 text-xs text-ink-2 border border-line"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            <div className="mt-6 border-t border-line pt-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">
                About this eBook
              </h2>
              <p className="mt-2 text-sm text-ink-2 leading-relaxed whitespace-pre-line">
                {book.description || 'Comprehensive learning material published on Winners Creek platform.'}
              </p>
            </div>

            {/* Reader Card if readingMode active */}
            {readingMode && (
              <div className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-1 flex items-center gap-2">
                    <BookOpen className="size-4 text-indigo-500 dark:text-indigo-400" />
                    Online Reader
                  </h3>
                  <button
                    type="button"
                    onClick={() => setReadingMode(false)}
                    className="text-xs text-ink-3 hover:text-ink-1"
                  >
                    Close Reader
                  </button>
                </div>
                <PdfViewer
                  ebookId={ebookId}
                  title={book.title}
                  pageCount={book.pageCount}
                  freePreviewLimit={book.freePreviewLimit || 5}
                  allowDownload={book.allowDownload}
                />
              </div>
            )}

            {/* Community Reviews */}
            <div className="mt-12 border-t border-line pt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-ink-1">Learner Reviews & Ratings</h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => (user ? setReviewModal(true) : router.push('/login'))}
                >
                  Write a Review
                </Button>
              </div>

              {book.reviews && book.reviews.length > 0 ? (
                <div className="space-y-3">
                  {book.reviews.map((rev: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-line bg-card p-4 text-xs shadow-card dark:border-white/10 dark:bg-slate-900/60"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink-1">{rev.userName}</span>
                        <div className="flex items-center text-amber-500">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={cn(
                                'size-3',
                                s <= rev.rating ? 'fill-amber-500 text-amber-500' : 'text-slate-300 dark:text-slate-700'
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      {rev.comment && <p className="mt-2 text-ink-2">{rev.comment}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-3">No reviews yet. Be the first learner to rate this eBook.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 text-ink-1 shadow-2xl dark:border-white/15 dark:bg-slate-900 dark:text-white">
            <h3 className="text-lg font-bold text-ink-1">Review & Rate this eBook</h3>
            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs text-ink-2 mb-1">Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      className="p-1 text-amber-500 hover:scale-110 transition-transform"
                    >
                      <Star className={cn('size-6', s <= rating ? 'fill-amber-500' : 'text-slate-300 dark:text-slate-600')} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-ink-2 mb-1">Comment</label>
                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share feedback on how this eBook helped your learning…"
                  className="mt-1 w-full rounded-xl border border-input-border bg-input p-2.5 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setReviewModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={submitting}>
                  Submit Review
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 text-ink-1 shadow-2xl dark:border-white/15 dark:bg-slate-900 dark:text-white">
            <h3 className="text-lg font-bold text-ink-1">Report this eBook</h3>
            <form onSubmit={handleReportSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs text-ink-2 mb-1">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input-border bg-input p-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                >
                  <option>Inappropriate Content</option>
                  <option>Copyright Concern</option>
                  <option>Incorrect Content</option>
                  <option>Broken File / Missing Pages</option>
                  <option>Spam</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink-2 mb-1">Details</label>
                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Provide details for Super Admin review…"
                  className="mt-1 w-full rounded-xl border border-input-border bg-input p-2.5 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setReportModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={submitting}>
                  Submit Report
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

