'use client';

import { Bookmark, BookOpen, CheckCircle, Clock, Plus, Search, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { UploadEbookModal } from '@/components/ebook/UploadEbookModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const CATEGORIES = [
  'all',
  'Interview',
  'Communication',
  'Technical',
  'Problem Solving',
  'Behaviour',
  'Confidence',
];

export default function StudentEbooksPage() {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [tab, setTab] = React.useState<'library' | 'my-uploads'>('library');
  const [showUploadModal, setShowUploadModal] = React.useState(false);

  const query = useApi<any[]>('/student/ebooks');
  const myUploadsQuery = useApi<any[]>('/student/ebooks/my-uploads');

  const toggleBookmark = async (e: React.MouseEvent, ebookId: string) => {
    e.preventDefault();
    e.stopPropagation();
    await api.post(`/student/ebooks/${ebookId}/bookmark`);
    query.refetch();
  };

  const requestPublish = async (e: React.MouseEvent, ebookId: string) => {
    e.preventDefault();
    e.stopPropagation();
    await api.post(`/student/ebooks/${ebookId}/request-publish`, { message: 'Publish request from student portal' });
    myUploadsQuery.refetch();
  };

  return (
    <>
      <UploadEbookModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => {
          myUploadsQuery.refetch();
          query.refetch();
          setTab('my-uploads');
        }}
        uploaderRole="STUDENT"
      />

      <PageHeader
        title="Digital Library & E-Books"
        description="Curated learning materials, interview guides, and technical references for your career preparation."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => setShowUploadModal(true)} className="gap-1.5">
              <Upload className="size-3.5" />
              Upload eBook
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-line-soft pb-3">
        <button
          type="button"
          onClick={() => setTab('library')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
            tab === 'library'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
              : 'text-ink-2 hover:text-ink-1'
          )}
        >
          Curriculum Library ({query.data?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setTab('my-uploads')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
            tab === 'my-uploads'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
              : 'text-ink-2 hover:text-ink-1'
          )}
        >
          My Uploads & Requests ({myUploadsQuery.data?.length ?? 0})
        </button>
      </div>

      {tab === 'my-uploads' ? (
        <div className="space-y-4">
          {(myUploadsQuery.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-line-soft bg-card p-12 text-center">
              <BookOpen className="mx-auto size-12 text-ink-3" />
              <h3 className="mt-3 text-base font-bold text-ink-1">You have not uploaded any eBooks yet</h3>
              <p className="mt-1 text-xs text-ink-3">Upload your study notes, interview summaries, or handbooks as PDFs.</p>
              <Button variant="primary" size="sm" className="mt-4 gap-1.5" onClick={() => setShowUploadModal(true)}>
                <Upload className="size-3.5" /> Upload Now
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(myUploadsQuery.data ?? []).map((book: any) => (
                <Card key={book.id} className="p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xs font-bold uppercase text-indigo-600">{book.category}</span>
                      <Badge
                        tone={
                          book.status === 'PUBLISHED'
                            ? 'success'
                            : book.status === 'PENDING_REVIEW'
                            ? 'indigo'
                            : book.status === 'REJECTED'
                            ? 'danger'
                            : 'neutral'
                        }
                      >
                        {book.status === 'PENDING_REVIEW' ? 'Pending Review' : book.status}
                      </Badge>
                    </div>
                    <h3 className="mt-2 text-base font-bold text-ink-1 line-clamp-1">{book.title}</h3>
                    <p className="text-xs text-ink-3">{book.pageCount} Pages</p>
                    {book.rejectionReason && (
                      <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                        <span className="font-bold">Rejection Note: </span>
                        {book.rejectionReason}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-line-soft flex items-center justify-between">
                    {book.status === 'DRAFT' || book.status === 'REJECTED' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => requestPublish(e, book.id)}
                        className="w-full text-xs"
                      >
                        Request to Publish
                      </Button>
                    ) : book.status === 'PENDING_REVIEW' ? (
                      <span className="text-xs text-indigo-600 font-medium">In Super Admin Review…</span>
                    ) : (
                      <Button asChild variant="secondary" size="sm" className="w-full text-xs">
                        <Link href={`/ebooks/${book.id}`}>View Live eBook</Link>
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <AsyncSection query={query} skeleton="cards">
          {(books) => {
            const inProgress = books.filter((b) => b.currentPage > 0 && !b.completed);
            const filtered = books.filter((b) => {
              const matchCat = category === 'all' || b.category === category;
              const matchSearch =
            !search ||
            b.title.toLowerCase().includes(search.toLowerCase()) ||
            b.author.toLowerCase().includes(search.toLowerCase());
          return matchCat && matchSearch;
        });

        return (
          <>
            <PageHeader
              title="Digital Library & E-Books"
              description="Curated learning materials, interview guides, and technical references for your career preparation."
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone="indigo" dot>
                    {books.length} e-Books available
                  </Badge>
                </div>
              }
            />

            {inProgress.length > 0 && (
              <div className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <Clock className="size-4 text-indigo-600" />
                  <h2 className="text-base font-bold text-ink-1">Continue Reading</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {inProgress.slice(0, 3).map((book) => (
                    <Card key={book.id} className="card-interactive border-indigo/20 bg-indigo-50/20">
                      <CardBody className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-2xs font-bold uppercase tracking-wider text-indigo-600">
                              {book.category}
                            </span>
                            <h3 className="truncate text-base font-bold text-ink-1">{book.title}</h3>
                            <p className="text-xs text-ink-3">by {book.author}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => toggleBookmark(e, book.id)}
                            className="text-ink-3 hover:text-amber"
                            aria-label="Bookmark"
                          >
                            <Bookmark
                              className={cn('size-4', book.isBookmarked && 'fill-amber text-amber')}
                            />
                          </button>
                        </div>
                        <ProgressBar
                          className="mt-3"
                          value={book.progressPercent}
                          label={`Page ${book.currentPage} of ${book.pageCount}`}
                        />
                        <Button asChild variant="primary" size="sm" className="mt-3 w-full">
                          <Link href={`/student/ebooks/${book.id}`}>Resume Reading</Link>
                        </Button>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Filter and Search Bar */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="scroll-thin flex flex-wrap items-center gap-1.5 overflow-x-auto">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors',
                      category === cat
                        ? 'bg-indigo text-white shadow-xs'
                        : 'bg-white text-ink-2 hover:bg-slate-100 border border-line-soft',
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search books, authors..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8.5 w-full rounded-[9px] border border-input-border bg-input pl-8.5 pr-3 text-xs text-ink-1 placeholder:text-ink-3 focus:border-brand-primary focus:outline-none"
                />
              </div>
            </div>

            {/* E-Book Grid */}
            {filtered.length === 0 ? (
              <div className="rounded-card border border-line bg-card backdrop-blur-xl p-12 text-center shadow-card dark:border-white/10 dark:bg-slate-900/70">
                <BookOpen className="mx-auto size-10 text-ink-3" />
                <p className="mt-3 text-base font-bold text-ink-1">No e-books found</p>
                <p className="mt-1 text-xs text-ink-3">Try adjusting your search or category filter.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((book) => (
                  <Card key={book.id} className="card-interactive flex flex-col justify-between overflow-hidden">
                    <CardBody className="p-4">
                      <div className="relative mb-3 flex h-36 items-center justify-center rounded-[10px] bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-line">
                        <BookOpen className="size-12 text-indigo-500 opacity-60" />
                        <button
                          type="button"
                          onClick={(e) => toggleBookmark(e, book.id)}
                          className="absolute right-2 top-2 rounded-full bg-white/80 p-1.5 backdrop-blur-xs transition hover:bg-white"
                          aria-label="Bookmark"
                        >
                          <Bookmark
                            className={cn('size-3.5', book.isBookmarked && 'fill-amber text-amber')}
                          />
                        </button>
                        {book.completed && (
                          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-bold text-emerald-600">
                            <CheckCircle className="size-3" />
                            Completed
                          </div>
                        )}
                      </div>

                      <span className="text-2xs font-bold uppercase tracking-wider text-indigo-600">
                        {book.category}
                      </span>
                      <h3 className="line-clamp-1 text-base font-bold text-ink-1">{book.title}</h3>
                      <p className="text-xs text-ink-3">by {book.author}</p>
                      <p className="mt-1.5 line-clamp-2 text-xs text-ink-2">{book.description}</p>

                      <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-2.5 text-2xs text-ink-3">
                        <span>{book.pageCount} pages</span>
                        <span>{book.completed ? '100%' : `${book.progressPercent}% read`}</span>
                      </div>

                      <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
                        <Link href={`/student/ebooks/${book.id}`}>
                          {book.currentPage > 0 ? 'Continue Reading' : 'Start Reading'}
                        </Link>
                      </Button>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </>
        );
      }}
    </AsyncSection>
      )}
    </>
  );
}

