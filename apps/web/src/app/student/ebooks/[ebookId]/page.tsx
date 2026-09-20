'use client';

import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { PdfViewer } from '@/components/ebook/PdfViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function StudentEbookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ebookId = params?.ebookId as string;

  const query = useApi<any>(`/student/ebooks/${ebookId}`);
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (query.data?.currentPage) {
      setCurrentPage(Math.max(1, query.data.currentPage));
    }
  }, [query.data]);

  const updatePage = async (newPage: number, totalPages: number) => {
    const valid = Math.max(1, Math.min(totalPages, newPage));
    setCurrentPage(valid);
    setSaving(true);
    try {
      await api.post(`/student/ebooks/${ebookId}/progress`, {
        currentPage: valid,
        totalPages,
      });
    } finally {
      setSaving(false);
    }
  };

  const markCompleted = async (totalPages: number) => {
    setSaving(true);
    try {
      await api.post(`/student/ebooks/${ebookId}/progress`, {
        currentPage: totalPages,
        totalPages,
        completed: true,
      });
      query.refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AsyncSection query={query} skeleton="detail">
      {(book) => {
        const totalPages = book.pageCount || 100;
        const progressPct = Math.min(100, Math.round((currentPage / totalPages) * 100));

        return (
          <>
            <div className="mb-4">
              <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs text-ink-2">
                <Link href="/student/ebooks">
                  <ArrowLeft className="size-3.5" />
                  Back to Library
                </Link>
              </Button>
            </div>

            <PageHeader
              title={book.title}
              description={`Authored by ${book.author} · Category: ${book.category}`}
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone={book.completed ? 'success' : 'indigo'}>
                    {book.completed ? 'Completed' : `${progressPct}% Completed`}
                  </Badge>
                  {book.fileUrl && (
                    <Button asChild variant="secondary" size="sm">
                      <a href={book.fileUrl} download={`${book.title}.pdf`}>
                        <Download className="size-3.5" />
                        Download PDF
                      </a>
                    </Button>
                  )}
                </div>
              }
            />

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              {/* Main PDF Reader View */}
              <div className="flex flex-col gap-4">
                <PdfViewer
                  ebookId={ebookId}
                  title={book.title}
                  pageCount={book.pageCount}
                  initialPage={currentPage}
                  allowDownload={book.allowDownload}
                  onPageChange={(p) => updatePage(p, totalPages)}
                />
              </div>

              {/* Sidebar Metadata */}
              <div className="space-y-4">
                <Card>
                  <CardBody className="p-4">
                    <h3 className="text-sm font-bold text-ink-1 mb-2">Reading Progress</h3>
                    <ProgressBar value={progressPct} label={`${progressPct}% Complete`} />
                    <p className="mt-2 text-2xs text-ink-3">
                      {totalPages - currentPage} pages remaining
                    </p>

                    <div className="mt-4 border-t border-line-soft pt-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ink-3">Author:</span>
                        <span className="font-semibold text-ink-1">{book.author}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-3">Category:</span>
                        <span className="font-semibold text-ink-1">{book.category}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-3">Total Pages:</span>
                        <span className="font-semibold text-ink-1">{totalPages}</span>
                      </div>
                      {book.courseTitle && (
                        <div className="flex justify-between">
                          <span className="text-ink-3">Course:</span>
                          <span className="font-semibold text-ink-1">{book.courseTitle}</span>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="p-4">
                    <h3 className="text-sm font-bold text-ink-1 mb-2">About this Book</h3>
                    <p className="text-xs text-ink-2 leading-relaxed">{book.description}</p>
                    {book.tags?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {book.tags.map((tag: string, idx: number) => (
                          <span
                            key={`ebook-tag-${tag}-${idx}`}
                            className="rounded-md bg-app px-2 py-0.5 text-2xs font-semibold text-ink-3"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          </>
        );
      }}
    </AsyncSection>
  );
}

