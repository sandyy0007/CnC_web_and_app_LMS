'use client';

import * as React from 'react';
import { AlertCircle, FileUp, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface UploadEbookModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  uploaderRole: 'STUDENT' | 'TRAINER' | 'SUPER_ADMIN';
}

const CATEGORIES = [
  'Programming',
  'DSA',
  'Web Development',
  'AI/ML',
  'Cloud Computing',
  'Cyber Security',
  'Data Science',
  'Interview Preparation',
  'Academic',
  'Career',
  'General',
];

export function UploadEbookModal({ open, onClose, onSuccess, uploaderRole }: UploadEbookModalProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [cover, setCover] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [author, setAuthor] = React.useState('');
  const [category, setCategory] = React.useState('General');
  const [description, setDescription] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [requestPublishImmediately, setRequestPublishImmediately] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith('.pdf') && selected.type !== 'application/pdf') {
      setError('Only PDF files (.pdf) are allowed.');
      e.target.value = '';
      return;
    }

    if (selected.size > 100 * 1024 * 1024) {
      setError('PDF file size must not exceed 100MB.');
      e.target.value = '';
      return;
    }

    setFile(selected);
    if (!title) {
      // Pre-fill title without .pdf extension
      setTitle(selected.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF document.');
      return;
    }
    if (!title.trim()) {
      setError('Please provide a title for your eBook.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (cover) formData.append('cover', cover);
    formData.append('title', title.trim());
    formData.append('author', author.trim());
    formData.append('category', category);
    formData.append('description', description.trim());
    formData.append('tags', tags.trim());

    try {
      let endpoint = '/student/ebooks/upload';
      if (uploaderRole === 'TRAINER') endpoint = '/trainer/ebooks';
      if (uploaderRole === 'SUPER_ADMIN') endpoint = '/super-admin/ebooks/upload';

      if (uploaderRole === 'SUPER_ADMIN') {
        formData.append('published', requestPublishImmediately ? 'true' : 'false');
      }

      const res = await api.post<any>(endpoint, formData);

      // If immediate publishing was requested and not super admin
      if (requestPublishImmediately && res.data?.id && uploaderRole !== 'SUPER_ADMIN') {
        const reqEndpoint =
          uploaderRole === 'STUDENT'
            ? `/student/ebooks/${res.data.id}/request-publish`
            : `/trainer/ebooks/${res.data.id}/request-publish`;
        await api.post(reqEndpoint, { message: 'Requesting publication upon upload.' });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload eBook.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-slate-900 p-6 sm:p-8 text-white shadow-2xl animate-enter my-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-bold">Upload PDF eBook</h3>
            <p className="text-xs text-slate-400">
              Publish community resources or save personal study handbooks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-950/40 p-3 text-xs text-red-300">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs">
          {/* PDF Input */}
          <div>
            <label className="block font-semibold text-slate-200 mb-1.5">
              PDF Document <span className="text-red-400">* (.pdf only)</span>
            </label>
            <div className="rounded-xl border border-dashed border-white/20 bg-slate-800/60 p-5 text-center">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="ebook-pdf-file"
              />
              <label
                htmlFor="ebook-pdf-file"
                className="cursor-pointer flex flex-col items-center justify-center"
              >
                <FileUp className="size-8 text-indigo-400 mb-2" />
                <span className="font-semibold text-indigo-300">
                  {file ? file.name : 'Click to select PDF file'}
                </span>
                <span className="mt-1 text-[11px] text-slate-400">
                  {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'Maximum file size: 100MB'}
                </span>
              </label>
            </div>
          </div>

          {/* Title & Author */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block font-semibold text-slate-200 mb-1">Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Master Tech Interview STAR Stories"
                className="w-full rounded-lg border border-white/15 bg-slate-800 p-2.5 text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-200 mb-1">Author Name</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Defaults to your name"
                className="w-full rounded-lg border border-white/15 bg-slate-800 p-2.5 text-white"
              />
            </div>
          </div>

          {/* Category & Tags */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block font-semibold text-slate-200 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-slate-800 p-2 text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-200 mb-1">Tags (comma separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. python, dsa, placement"
                className="w-full rounded-lg border border-white/15 bg-slate-800 p-2.5 text-white"
              />
            </div>
          </div>

          {/* Optional Cover Image */}
          <div>
            <label className="block font-semibold text-slate-200 mb-1">
              Custom Cover Image <span className="text-slate-400 font-normal">(Optional — will auto-extract from PDF Page 1 if omitted)</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setCover(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-600"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-semibold text-slate-200 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline what learners will master with this handbook…"
              className="w-full rounded-lg border border-white/15 bg-slate-800 p-2.5 text-white"
            />
          </div>

          {/* Publishing Choice Checkbox */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="requestPublishImmediately"
              checked={requestPublishImmediately}
              onChange={(e) => setRequestPublishImmediately(e.target.checked)}
              className="size-4 rounded border-white/20 bg-slate-800 text-indigo-600"
            />
            <label htmlFor="requestPublishImmediately" className="text-slate-300 select-none cursor-pointer">
              Request to Publish immediately (Super Admin will review and make it public)
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={submitting}>
              {submitting ? 'Processing & Validating PDF…' : 'Save & Upload'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
