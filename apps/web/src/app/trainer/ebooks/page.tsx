'use client';

import {
  Archive,
  BookOpen,
  CheckCircle,
  Eye,
  FileUp,
  Globe,
  Lock,
  Plus,
  Send,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import * as React from 'react';
import { toast } from 'sonner';

import { UploadEbookModal } from '@/components/ebook/UploadEbookModal';
import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { num } from '@/lib/format';

interface TrainerEbook {
  id: string;
  title: string;
  author: string;
  category: string;
  coverUrl?: string;
  pageCount: number;
  courseTitle?: string;
  published: boolean;
  status: string;
  rejectionReason?: string;
  readsCount: number;
  completionsCount: number;
  isOwner: boolean;
  createdAt?: string;
}

export default function TrainerEbooksPage() {
  const query = useApi<TrainerEbook[]>('/trainer/ebooks');
  const [showUploadModal, setShowUploadModal] = React.useState(false);
  const [requestingId, setRequestingId] = React.useState<string | null>(null);

  const togglePublish = async (bookId: string, current: boolean) => {
    await api.patch(`/trainer/ebooks/${bookId}`, { published: !current });
    toast.success(current ? 'eBook unpublished from class view.' : 'eBook published.');
    query.refetch();
  };

  const archiveBook = async (bookId: string) => {
    if (confirm('Archive this e-book? It will be removed from student view.')) {
      await api.delete(`/trainer/ebooks/${bookId}`);
      toast.success('eBook archived.');
      query.refetch();
    }
  };

  const handleRequestPublish = async (bookId: string) => {
    try {
      setRequestingId(bookId);
      await api.post(`/trainer/ebooks/${bookId}/request-publish`, {
        message: 'Trainer requested publication to public catalog.',
      });
      toast.success('Publish request submitted to Super Admin review.');
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit publish request.');
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <AsyncSection query={query} skeleton="cards">
      {(books) => {
        const totalReads = books.reduce((acc, b) => acc + (b.readsCount || 0), 0);
        const totalCompletions = books.reduce((acc, b) => acc + (b.completionsCount || 0), 0);

        return (
          <>
            <PageHeader
              title="E-Book & Digital Library Management"
              description="Publish PDF study materials, interview preparation handbooks, and reference guides for students."
              actions={
                <Button variant="primary" size="sm" onClick={() => setShowUploadModal(true)}>
                  <Plus className="size-3.5" />
                  Upload PDF eBook
                </Button>
              }
            />

            {/* Readership KPIs */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Card>
                <CardBody className="p-4">
                  <span className="text-xs uppercase tracking-wider text-ink-3">Total E-Books</span>
                  <p className="tnum mt-1 text-2xl font-bold text-ink-1">{num(books.length)}</p>
                  <p className="mt-1 text-2xs text-ink-3">
                    {books.filter((b) => b.published).length} published live
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="p-4">
                  <span className="text-xs uppercase tracking-wider text-ink-3">Total Readership</span>
                  <p className="tnum mt-1 text-2xl font-bold text-indigo-600">{num(totalReads)}</p>
                  <p className="mt-1 text-2xs text-ink-3">Student reading sessions</p>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="p-4">
                  <span className="text-xs uppercase tracking-wider text-ink-3">Full Completions</span>
                  <p className="tnum mt-1 text-2xl font-bold text-emerald-600">
                    {num(totalCompletions)}
                  </p>
                  <p className="mt-1 text-2xs text-ink-3">Students completed full reading</p>
                </CardBody>
              </Card>
            </div>

            {/* E-Books List Table */}
            <Card>
              <CardBody className="p-0 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line-soft bg-slate-50/70 text-ink-3 uppercase font-semibold text-2xs tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Title & Author</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Pages</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Reads</th>
                      <th className="px-4 py-3 text-center">Completions</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {books.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                          No eBooks uploaded yet. Click &quot;Upload PDF eBook&quot; to add your first title.
                        </td>
                      </tr>
                    ) : (
                      books.map((book) => (
                        <tr key={book.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-50 text-indigo-600">
                                {book.coverUrl ? (
                                  <Image
                                    src={book.coverUrl}
                                    alt={book.title}
                                    fill
                                    sizes="36px"
                                    className="rounded-lg object-cover"
                                  />
                                ) : (
                                  <BookOpen className="size-4" />
                                )}
                              </span>
                              <div>
                                <p className="font-bold text-ink-1 text-sm">{book.title}</p>
                                <p className="text-xs text-ink-3">by {book.author}</p>
                                {book.rejectionReason && (
                                  <p className="text-2xs text-rose-500 mt-0.5">
                                    Rejection Feedback: {book.rejectionReason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge tone="neutral">{book.category}</Badge>
                          </td>
                          <td className="px-4 py-3.5 text-ink-2">{book.pageCount} pages</td>
                          <td className="px-4 py-3.5">
                            <Badge
                              tone={
                                book.status === 'PUBLISHED' || book.published
                                  ? 'success'
                                  : book.status === 'PENDING_REVIEW'
                                    ? 'amber'
                                    : book.status === 'REJECTED'
                                      ? 'danger'
                                      : 'neutral'
                              }
                            >
                              {book.status || (book.published ? 'Published' : 'Draft')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-center font-semibold text-ink-1">
                            {num(book.readsCount || 0)}
                          </td>
                          <td className="px-4 py-3.5 text-center font-semibold text-emerald-600">
                            {num(book.completionsCount || 0)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Public link/reader */}
                              <Link href={`/ebooks/${book.id}`} target="_blank">
                                <Button variant="secondary" size="sm" title="Preview Reader">
                                  <Eye className="size-3" />
                                </Button>
                              </Link>

                              {/* Request Publish if DRAFT or REJECTED */}
                              {(book.status === 'DRAFT' || book.status === 'REJECTED') && book.isOwner && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleRequestPublish(book.id)}
                                  disabled={requestingId === book.id}
                                  title="Request Super Admin Review to Publish"
                                  className="text-amber-600 border-amber-300 hover:bg-amber-50"
                                >
                                  <Send className="size-3" />
                                  <span className="hidden sm:inline">Request Publish</span>
                                </Button>
                              )}

                              {book.isOwner && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => archiveBook(book.id)}
                                  title="Archive"
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

            {/* Upload Modal with real PDF handling */}
            <UploadEbookModal
              open={showUploadModal}
              onClose={() => setShowUploadModal(false)}
              onSuccess={() => query.refetch()}
              uploaderRole="TRAINER"
            />
          </>
        );
      }}
    </AsyncSection>
  );
}
