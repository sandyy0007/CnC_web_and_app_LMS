'use client';

import * as React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Flag,
  Lock,
  Maximize2,
  Minimize2,
  RotateCcw,
  Share2,
  Star,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/store';

interface PdfViewerProps {
  ebookId: string;
  title: string;
  pageCount: number;
  freePreviewLimit?: number;
  initialPage?: number;
  allowDownload?: boolean;
  onPageChange?: (page: number) => void;
}

export function PdfViewer({
  ebookId,
  title,
  pageCount,
  freePreviewLimit = 5,
  initialPage = 1,
  allowDownload = false,
  onPageChange,
}: PdfViewerProps) {
  const { user } = useAppSelector((state) => state.auth);
  const isAuthenticated = Boolean(user);

  const [currentPage, setCurrentPage] = React.useState<number>(initialPage);
  const [zoom, setZoom] = React.useState<number>(100);
  const [fullscreen, setFullscreen] = React.useState<boolean>(false);
  const [showPaywall, setShowPaywall] = React.useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  // We track the blob URL in a ref so the effect cleanup can always revoke
  // the *latest* URL without needing pdfBlobUrl in the dependency array
  // (which would cause an infinite fetch loop).
  const blobUrlRef = React.useRef<string | null>(null);

  // Load appropriate PDF stream (authenticated vs preview)
  React.useEffect(() => {
    let active = true;
    const fetchPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const endpoint = isAuthenticated
          ? `/api/v1/ebooks/${ebookId}/read`
          : `/api/v1/ebooks/${ebookId}/preview`;

        const res = await fetch(endpoint, {
          headers: isAuthenticated ? { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } : {},
          credentials: 'include',
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error('You need an active account or permission to read this eBook.');
          }
          throw new Error('Failed to load eBook document.');
        }

        const blob = await res.blob();
        if (active) {
          // Revoke the previous blob URL before creating a new one
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setPdfBlobUrl(url);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Error loading PDF.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchPdf();
    return () => {
      active = false;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [ebookId, isAuthenticated]);

  const handlePageChange = (newPage: number) => {
    // Unauthenticated restriction: max page is freePreviewLimit (5)
    if (!isAuthenticated && newPage > freePreviewLimit) {
      setShowPaywall(true);
      return;
    }
    const safePage = Math.max(1, Math.min(pageCount, newPage));
    setCurrentPage(safePage);
    setShowPaywall(false);
    onPageChange?.(safePage);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!fullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-col rounded-2xl border border-line-soft bg-slate-950 text-white overflow-hidden shadow-2xl transition-all',
        fullscreen ? 'fixed inset-0 z-50 rounded-none' : 'w-full min-h-[700px]'
      )}
    >
      {/* ---------------------------------------------------------------- Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <BookOpen className="size-4 text-indigo-400 shrink-0" />
          <span className="truncate text-xs font-semibold text-white/90">{title}</span>
          {!isAuthenticated && (
            <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
              Free 5-Page Preview
            </span>
          )}
        </div>

        {/* Center Page Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1 || loading}
            onClick={() => handlePageChange(currentPage - 1)}
            className="h-8 px-2.5 text-xs"
          >
            <ChevronLeft className="size-3.5" />
            Prev
          </Button>

          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={isAuthenticated ? pageCount : freePreviewLimit}
              value={currentPage}
              onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
              className="h-7 w-12 rounded border border-white/20 bg-slate-800 text-center font-mono text-xs text-white"
            />
            <span>of {isAuthenticated ? pageCount : freePreviewLimit}</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => handlePageChange(currentPage + 1)}
            className="h-8 px-2.5 text-xs"
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        {/* Right Tools (Zoom, Fullscreen, Download) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(75, z - 15))}
            className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="text-[11px] font-mono text-slate-400 w-10 text-center">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(175, z + 15))}
            className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            title="Toggle Fullscreen"
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          {allowDownload && isAuthenticated && (
            <Button asChild variant="secondary" size="sm" className="h-8 gap-1 text-xs">
              <a href={`/api/v1/ebooks/${ebookId}/download`} download>
                <Download className="size-3.5" />
                PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- Reader Body */}
      <div className="relative flex-1 bg-slate-950/80 p-4 sm:p-8 flex items-center justify-center overflow-auto">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-xs">Preparing secure eBook viewer…</p>
          </div>
        )}

        {error && (
          <div className="max-w-md rounded-xl border border-red-500/20 bg-red-950/40 p-6 text-center text-red-200">
            <p className="text-sm font-semibold">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
              className="mt-4 gap-1 text-xs"
            >
              <RotateCcw className="size-3.5" /> Try Again
            </Button>
          </div>
        )}

        {/* Embedded Controlled Viewer */}
        {!loading && !error && pdfBlobUrl && (
          <div
            className="transition-transform duration-200 shadow-2xl rounded-lg overflow-hidden border border-white/10"
            style={{ width: `${zoom}%`, maxWidth: '100%' }}
          >
            <iframe
              src={`${pdfBlobUrl}#page=${currentPage}&toolbar=0&navpanes=0`}
              title={title}
              className="w-full min-h-[680px] bg-white rounded-lg"
            />
          </div>
        )}

        {/* -------------------------------------------------------------- Page 6+ Paywall Gate */}
        {showPaywall && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 animate-enter">
            <div className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900/95 p-8 text-center shadow-2xl">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Lock className="size-7" />
              </div>
              <h3 className="text-xl font-bold text-white">Continue Reading</h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                You’ve reached the end of the free 5-page preview. Create or sign in to your Winners Creek
                account to unlock the complete eBook, progress tracking, and annotations.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button asChild variant="primary" size="md" className="w-full sm:w-auto font-medium">
                  <Link href="/signup">Create Free Account</Link>
                </Button>
                <Button asChild variant="secondary" size="md" className="w-full sm:w-auto font-medium">
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPaywall(false);
                  setCurrentPage(5);
                }}
                className="mt-4 text-xs text-slate-400 hover:text-white"
              >
                ← Return to Page 5
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- Progress Tracker Bar */}
      <div className="border-t border-white/10 bg-slate-900/80 px-4 py-2 flex items-center justify-between text-2xs text-slate-400">
        <span>
          Viewing Page {currentPage} of {isAuthenticated ? pageCount : freePreviewLimit}
        </span>
        <span>
          {Math.round((currentPage / (isAuthenticated ? pageCount : freePreviewLimit)) * 100)}%
          Completed
        </span>
      </div>
    </div>
  );
}

