'use client';

import { Download, FileSpreadsheet, FileText, Loader2, Paperclip, Upload, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { bytes, formatDate, titleCase } from '@/lib/format';

import { StatusBadge } from './status-badge';

// ------------------------------------------------------------------ UserAvatar
export function UserAvatar({
  name,
  secondary,
  color,
  size = 28,
  href,
  className,
}: {
  name?: string | null;
  secondary?: string | null;
  color?: string | null;
  size?: number;
  href?: string;
  className?: string;
}) {
  const content = (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={name} color={color} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink-1">{name ?? '—'}</span>
        {secondary && <span className="block truncate text-xs text-ink-2">{secondary}</span>}
      </span>
    </span>
  );
  if (href) {
    return (
      <Link href={href} className="hover:underline">
        {content}
      </Link>
    );
  }
  return content;
}

// ------------------------------------------------------------------ ActivityCard
export function ActivityCard({
  title,
  subtitle,
  meta,
  icon,
  tone = 'indigo',
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'indigo' | 'success' | 'amber' | 'purple' | 'teal' | 'info';
  action?: React.ReactNode;
  className?: string;
}) {
  const TONE = {
    indigo: 'bg-indigo-50 text-indigo-600',
    success: 'bg-success-bg text-success',
    amber: 'bg-amber-50 text-amber-dark',
    purple: 'bg-purple-bg text-purple',
    teal: 'bg-teal-bg text-teal',
    info: 'bg-info-bg text-info',
  }[tone];

  return (
    <div className={cn('flex items-start gap-3', className)}>
      {icon && (
        <span
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-4', TONE)}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-ink-1">{title}</p>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-2">{meta}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ ReportDownload
export interface ReportJob {
  id: string;
  reportType: string;
  format: string;
  status: string;
  rowCount?: number | null;
  filename?: string | null;
  downloadUrl?: string | null;
  createdAt?: string;
  requestedByLabel?: string;
  bytes?: number | null;
  error?: string | null;
}

export function ReportDownload({
  jobs,
  loading,
  emptyLabel = 'No exports yet',
}: {
  jobs: ReportJob[];
  loading?: boolean;
  emptyLabel?: string;
}) {
  const ICON: Record<string, React.ReactNode> = {
    xlsx: <FileSpreadsheet aria-hidden />,
    csv: <FileSpreadsheet aria-hidden />,
    pdf: <FileText aria-hidden />,
  };

  if (!loading && !jobs.length) {
    return <p className="px-1 py-8 text-center text-base text-ink-3">{emptyLabel}</p>;
  }

  return (
    <TableWrap>
      <Table>
        <thead>
          <Tr>
            <Th>Report type</Th>
            <Th hideBelow="md">Requested by</Th>
            <Th hideBelow="sm">Generated</Th>
            <Th>Format</Th>
            <Th>Status</Th>
            <Th align="right">File</Th>
          </Tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <Tr key={job.id}>
              <Td>
                <span className="font-semibold">{titleCase(job.reportType)}</span>
                {job.rowCount !== null && job.rowCount !== undefined && (
                  <span className="block text-xs text-ink-2">{job.rowCount} row(s)</span>
                )}
              </Td>
              <Td className="hidden text-ink-2 md:table-cell">{job.requestedByLabel ?? '—'}</Td>
              <Td className="hidden text-ink-2 sm:table-cell">{formatDate(job.createdAt, true)}</Td>
              <Td>
                <Badge tone="neutral" dot>
                  {job.format?.toUpperCase()}
                </Badge>
              </Td>
              <Td>
                <StatusBadge status={job.status} />
                {job.status === 'failed' && job.error && (
                  <span className="block text-xs text-danger">{job.error}</span>
                )}
              </Td>
              <Td align="right">
                {job.status === 'ready' && job.downloadUrl ? (
                  <Button asChild size="sm" variant="link">
                    <a href={job.downloadUrl} download={job.filename ?? undefined}>
                      <Download aria-hidden />
                      Download
                      {job.bytes ? (
                        <span className="text-ink-3"> ({bytes(job.bytes)})</span>
                      ) : null}
                    </a>
                  </Button>
                ) : job.status === 'queued' || job.status === 'processing' ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Queued as background job
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

// ------------------------------------------------------------------ FileUpload
export function FileUpload({
  accept,
  onSelect,
  label = 'Choose a file',
  hint,
  pending,
  file,
  onClear,
  className,
}: {
  accept?: string;
  onSelect: (file: File) => void;
  label?: string;
  hint?: string;
  pending?: boolean;
  file?: File | null;
  onClear?: () => void;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const id = React.useId();

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) onSelect(dropped);
        }}
        className={cn(
          'rounded-card border-2 border-dashed px-5 py-8 text-center transition-colors',
          dragging ? 'border-indigo bg-indigo-50' : 'border-line bg-app',
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) onSelect(selected);
          }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2.5">
            <Paperclip className="size-4 text-ink-3" aria-hidden />
            <span className="text-base font-semibold">{file.name}</span>
            <span className="text-sm text-ink-2">{bytes(file.size)}</span>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Remove selected file"
                className="rounded p-1 text-ink-3 hover:bg-white hover:text-ink-1"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ) : (
          <>
            <Upload className="mx-auto mb-2 size-5 text-ink-3" aria-hidden />
            <Button
              variant="secondary"
              size="sm"
              loading={pending}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {label}
            </Button>
            <p className="mt-2 text-sm text-ink-2">or drag and drop it here</p>
          </>
        )}
      </div>
      {hint && <p className="mt-2 text-sm text-ink-3">{hint}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ AuditTable
export interface AuditRow {
  id: string;
  at: string;
  actorLabel?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  detail?: string | null;
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <Tr>
            <Th>Timestamp</Th>
            <Th>Actor</Th>
            <Th>Action</Th>
            <Th hideBelow="sm">Entity</Th>
            <Th hideBelow="lg">Record ID</Th>
            <Th>Detail</Th>
          </Tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td className="whitespace-nowrap text-ink-2">{formatDate(row.at, true)}</Td>
              <Td>
                <span className="font-semibold">{row.actorLabel ?? 'System'}</span>
              </Td>
              <Td>
                <StatusBadge
                  status={
                    row.action === 'create'
                      ? 'issued'
                      : row.action === 'delete'
                        ? 'failed'
                        : row.action === 'export'
                          ? 'draft'
                          : 'submitted'
                  }
                  label={titleCase(row.action)}
                />
              </Td>
              <Td className="hidden text-ink-2 sm:table-cell">{titleCase(row.entityType)}</Td>
              <Td className="hidden font-mono text-xs text-ink-3 lg:table-cell">
                {row.entityId ? `${row.entityId.slice(-8).toUpperCase()}` : '—'}
              </Td>
              <Td className="text-ink-2">{row.detail ?? '—'}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

// ------------------------------------------------------------------ ScopePill
/** `College › Department`, required on every HOD screen (SRS §6.1). */
export function ScopePill({
  collegeName,
  departmentName,
  className,
}: {
  collegeName?: string | null;
  departmentName?: string | null;
  className?: string;
}) {
  if (!collegeName && !departmentName) return null;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-info-bg px-3.5 py-1.5 text-sm font-semibold',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-info" aria-hidden />
      <span className="text-info">{collegeName}</span>
      <span className="text-info/50" aria-hidden>
        ›
      </span>
      <span className="text-info">{departmentName}</span>
    </div>
  );
}

// ------------------------------------------------------------------ KeyboardHint
export function KeyboardHint({
  shortcuts,
  className,
}: {
  shortcuts: { keys: string; action: string }[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2', className)}>
      <span className="font-semibold">Keyboard shortcuts:</span>
      {shortcuts.map((shortcut) => (
        <span key={shortcut.keys} className="flex items-center gap-1.5">
          <kbd className="rounded-[5px] border border-line bg-white px-1.5 py-0.5 font-sans text-2xs font-semibold">
            {shortcut.keys}
          </kbd>
          {shortcut.action}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ InfoNotice
export function InfoNotice({
  children,
  tone = 'amber',
  className,
}: {
  children: React.ReactNode;
  tone?: 'amber' | 'info' | 'danger' | 'success';
  className?: string;
}) {
  const TONE = {
    amber: 'bg-amber-50 text-amber-dark',
    info: 'bg-info-bg text-info',
    danger: 'bg-danger-bg text-danger',
    success: 'bg-success-bg text-success',
  }[tone];
  return (
    <div
      className={cn('flex items-start gap-2.5 rounded-card px-4 py-3 text-base font-semibold', TONE, className)}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ DetailList
export function DetailList({
  rows,
  className,
}: {
  rows: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn('divide-y divide-dashed divide-line', className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-base text-ink-2">{row.label}</dt>
          <dd className="text-right text-base font-semibold text-ink-1">{row.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export { Card, CardBody, CardHeader, CardTitle };
