'use client';

import {
  CheckCircle2,
  Download,
  FileText,
  Info,
  Target,
  Upload,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { RadialScore } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { bytes, formatDate, titleCase } from '@/lib/format';

const SECTIONS = ['contact', 'education', 'experience', 'projects', 'skills', 'achievements'];

export default function ResumeAnalyzerPage() {
  const query = useApi<any>('/student/resume/analysis', undefined, {
    select: (raw) => ({ latest: raw.data, history: raw.meta?.history ?? [] }),
  });
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await api.upload('/student/resume', form);
      toast.success(response.message ?? 'Resume analysed');
      query.refetch();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => {
        const latest = data.latest;
        const analysis = latest?.analysis;
        return (
          <div className="mx-auto max-w-[900px]">
            <PageHeader
              title="Resume Analyzer"
              description="Structural feedback on your resume: which sections exist, how your bullets read, and what a recruiter will look for and not find."
              actions={
                <>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="sr-only"
                    id="resume-file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                    }}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={uploading}
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="size-3.5" aria-hidden />
                    {latest ? 'Upload a new version' : 'Upload resume'}
                  </Button>
                </>
              }
            />

            {!latest ? (
              <Card className="card-interactive">
                <CardBody className="py-12 text-center">
                  <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo">
                    <FileText className="size-5" aria-hidden />
                  </span>
                  <p className="mt-4 text-md font-semibold text-ink-1">No resume uploaded yet</p>
                  <p className="mx-auto mt-1.5 max-w-[420px] text-base text-ink-2">
                    Upload a text-based PDF or Word file (under 10 MB). It is stored privately —
                    only you and your trainer can open it, through a short-lived link.
                  </p>
                  <Button
                    variant="primary"
                    className="mt-5"
                    loading={uploading}
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="size-3.5" aria-hidden />
                    Choose a file
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
                <div className="space-y-5">
                  <Card className="card-interactive">
                    <CardBody className="text-center">
                      <RadialScore value={analysis?.score} label="Resume score" size={116} thickness={10} />
                      <p className="mt-3 text-md font-semibold text-ink-1">Resume score</p>
                      <p className="mt-1 text-xs text-ink-3">{analysis?.basis}</p>
                    </CardBody>
                  </Card>

                  <Card className="card-interactive">
                    <CardHeader>
                      <div>
                        <CardTitle>Current file</CardTitle>
                        <CardSubtitle>{formatDate(latest.createdAt, true)}</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <p className="truncate text-base font-semibold text-ink-1">{latest.filename}</p>
                      <p className="mt-0.5 text-sm text-ink-2">
                        {bytes(latest.bytes)} · {latest.extractedCharacters} characters read
                      </p>
                      {latest.downloadUrl && (
                        <Button asChild variant="secondary" size="sm" className="mt-3.5 w-full">
                          <a href={latest.downloadUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="size-3.5" aria-hidden />
                            Download my resume
                          </a>
                        </Button>
                      )}
                      <p className="mt-2.5 text-2xs text-ink-3">
                        Private link, valid for a short time only.
                      </p>
                    </CardBody>
                  </Card>

                  {data.history.length > 0 && (
                    <Card className="card-interactive">
                      <CardHeader>
                        <div>
                          <CardTitle>Earlier versions</CardTitle>
                          <CardSubtitle>Nothing is deleted</CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody>
                        <ul className="space-y-1.5">
                          {data.history.map((row: any) => (
                            <li key={row.id} className="flex items-baseline justify-between gap-3 rounded-lg p-1.5 -mx-1.5 transition-colors hover:bg-slate-50/60">
                              <span className="min-w-0 truncate text-sm">
                                {formatDate(row.createdAt)}
                              </span>
                              <span className="tnum shrink-0 text-sm font-bold">
                                {row.analysis?.score ?? '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </CardBody>
                    </Card>
                  )}
                </div>

                <div className="space-y-5">
                  <Card className="card-interactive">
                    <CardHeader>
                      <div>
                        <CardTitle>Sections</CardTitle>
                        <CardSubtitle>What a recruiter scans for first</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {SECTIONS.map((section) => {
                          const found = analysis?.sectionsFound?.includes(section);
                          return (
                            <li
                              key={section}
                              className="flex items-center gap-2.5 rounded-[10px] bg-app px-3.5 py-2.5 transition-transform duration-150 hover:scale-[1.01]"
                            >
                              {found ? (
                                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                              ) : (
                                <XCircle className="size-4 shrink-0 text-danger" aria-hidden />
                              )}
                              <span className="text-base font-semibold text-ink-1">{titleCase(section)}</span>
                              <span className="ml-auto text-xs text-ink-3">
                                {found ? 'Found' : 'Missing'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </CardBody>
                  </Card>

                  <Card className="card-interactive">
                    <CardHeader>
                      <div>
                        <CardTitle>How your bullets read</CardTitle>
                        <CardSubtitle>Measured from the text, not guessed</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[10px] bg-app px-3.5 py-3 transition-transform duration-150 hover:scale-[1.01]">
                          <dt className="text-xs text-ink-3">Strong action verbs</dt>
                          <dd className="tnum mt-0.5 text-md font-bold text-ink-1">
                            {analysis?.actionVerbCount ?? 0}
                          </dd>
                        </div>
                        <div className="rounded-[10px] bg-app px-3.5 py-3 transition-transform duration-150 hover:scale-[1.01]">
                          <dt className="text-xs text-ink-3">Quantified claims</dt>
                          <dd className="tnum mt-0.5 text-md font-bold text-ink-1">
                            {analysis?.quantifiedClaims ?? 0}
                          </dd>
                        </div>
                      </dl>
                    </CardBody>
                  </Card>

                  <Card className="card-interactive">
                    <CardHeader>
                      <div>
                        <CardTitle>What to fix</CardTitle>
                        <CardSubtitle>In the order a recruiter would notice</CardSubtitle>
                      </div>
                      <Target className="size-4 text-amber" aria-hidden />
                    </CardHeader>
                    <CardBody>
                      {analysis?.gaps?.length ? (
                        <ol className="space-y-2.5">
                          {analysis.gaps.map((gap: string, index: number) => (
                            <li
                              key={gap}
                              className="flex items-start gap-3 rounded-[10px] bg-amber-50/70 px-3.5 py-3 transition-transform duration-150 hover:scale-[1.005]"
                            >
                              <span className="tnum mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber text-2xs font-bold text-white">
                                {index + 1}
                              </span>
                              <span className="min-w-0 flex-1 text-base text-ink-1">{gap}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="flex items-start gap-2 text-base text-success">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                          Nothing structural is missing. Get a trainer to review the wording next.
                        </p>
                      )}
                      <p className="mt-4 flex items-start gap-2 text-xs text-ink-3">
                        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        This analysis reads structure and wording only. It never invents
                        achievements, and it does not judge your experience.
                      </p>
                    </CardBody>
                  </Card>

                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">Analysed {formatDate(analysis?.analysedAt, true)}</Badge>
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </AsyncSection>
  );
}
