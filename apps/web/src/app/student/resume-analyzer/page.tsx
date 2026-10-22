'use client';

import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Info,
  Lightbulb,
  Sparkles,
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
import { cn } from '@/lib/cn';
import { bytes, formatDate, titleCase } from '@/lib/format';

const SECTIONS = ['contact', 'education', 'experience', 'projects', 'skills', 'achievements'];

const DEFAULT_ROLES = [
  { key: 'senior-python-backend', title: 'Senior Backend Python Engineer' },
  { key: 'data-science-ai', title: 'Data Scientist & AI Specialist' },
  { key: 'devops-cloud', title: 'Cloud & DevOps Architect' },
  { key: 'frontend-react', title: 'Frontend React Engineer' },
  { key: 'fullstack-web', title: 'Full-Stack Web Developer' },
  { key: 'cyber-security', title: 'Cybersecurity Analyst' },
];

export default function ResumeAnalyzerPage() {
  const query = useApi<any>('/student/resume/analysis', undefined, {
    select: (raw) => ({ latest: raw.data, history: raw.meta?.history ?? [] }),
  });

  const rolesQuery = useApi<any>('/ai/roles');
  const availableRoles = React.useMemo(() => {
    const rawRoles = rolesQuery.data?.data?.roles ?? rolesQuery.data?.roles;
    if (Array.isArray(rawRoles)) {
      return rawRoles.map((r: any) => ({
        key: r.key || r.id,
        title: r.title,
        skills: r.requiredSkills ?? [],
      }));
    }
    if (rawRoles && typeof rawRoles === 'object') {
      return Object.entries(rawRoles).map(([k, v]: [string, any]) => ({
        key: k,
        title: v.title || k,
        skills: v.requiredSkills ?? [],
      }));
    }
    return DEFAULT_ROLES.map((r) => ({
      key: r.key,
      title: r.title,
      skills: [],
    }));
  }, [rolesQuery.data]);

  const [selectedRole, setSelectedRole] = React.useState<string>('senior-python-backend');
  const [useCustomJd, setUseCustomJd] = React.useState(false);
  const [customJdText, setCustomJdText] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('roleKey', selectedRole);
      if (useCustomJd && customJdText.trim()) {
        form.append('customJd', customJdText.trim());
      }
      const response = await api.upload('/student/resume', form);
      toast.success(response.message ?? 'Resume analysed against target role');
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
        const latest = data?.latest;
        const analysis = latest?.analysis;
        const atsScore = analysis?.overallScore ?? analysis?.score ?? 0;
        const targetTitle = analysis?.targetRoleTitle || availableRoles.find((r: any) => r.key === selectedRole)?.title || 'Target Role';
        const matchedSkills: string[] = Array.isArray(analysis?.matchedSkills) ? analysis.matchedSkills : [];
        const missingSkills: string[] = Array.isArray(analysis?.missingSkills) ? analysis.missingSkills : [];
        const actionableCritique: string[] = Array.isArray(analysis?.actionableCritique)
          ? analysis.actionableCritique
          : Array.isArray(analysis?.gaps)
          ? analysis.gaps
          : [];
        const historyList: any[] = Array.isArray(data?.history) ? data.history : [];

        return (
          <div className="mx-auto max-w-[1000px] space-y-6">
            <PageHeader
              title="ATS Resume Analyzer"
              description="Role-grounded applicant tracking system (ATS) evaluation: match skills against real industry job descriptions, verify section density, and diagnose missing keywords."
              actions={
                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
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
                    {latest ? 'Upload new version' : 'Upload resume'}
                  </Button>
                </div>
              }
            />

            {/* Target Role Selector Bar */}
            <Card className="card-interactive bg-surface dark:bg-slate-900 border-line dark:border-slate-800">
              <CardBody className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-ink-3 dark:text-slate-400 flex items-center gap-1.5">
                      <Briefcase className="size-3.5 text-indigo" />
                      Target Career Role & Job Description
                    </label>
                    <p className="text-xs text-ink-2 dark:text-slate-300">
                      Select your target role to benchmark your resume keywords and section scores against recruiter criteria.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="px-3 py-2 text-xs font-semibold rounded-xl border border-line dark:border-slate-700 bg-app dark:bg-slate-950 text-ink-1 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo"
                    >
                      {availableRoles.map((r: any) => (
                        <option key={r.key} value={r.key}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setUseCustomJd(!useCustomJd)}
                      className="text-xs whitespace-nowrap"
                    >
                      {useCustomJd ? 'Standard Role' : 'Custom JD'}
                    </Button>
                  </div>
                </div>

                {useCustomJd && (
                  <div className="mt-4 pt-4 border-t border-line dark:border-slate-800 space-y-2">
                    <label className="text-xs font-semibold text-ink-2 dark:text-slate-300">
                      Paste Custom Job Description (Text)
                    </label>
                    <textarea
                      rows={3}
                      value={customJdText}
                      onChange={(e) => setCustomJdText(e.target.value)}
                      placeholder="Paste specific job requirements, required technologies, and qualification criteria here…"
                      className="w-full p-3 text-xs rounded-xl border border-line dark:border-slate-700 bg-app dark:bg-slate-950 text-ink-1 dark:text-white placeholder:text-ink-3 focus:outline-hidden focus:ring-2 focus:ring-indigo"
                    />
                  </div>
                )}
              </CardBody>
            </Card>

            {!latest ? (
              <Card className="card-interactive">
                <CardBody className="py-12 text-center">
                  <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo/10 text-indigo dark:bg-indigo/20">
                    <FileText className="size-6" aria-hidden />
                  </span>
                  <p className="mt-4 text-md font-semibold text-ink-1 dark:text-white">No resume uploaded yet</p>
                  <p className="mx-auto mt-1.5 max-w-[440px] text-sm text-ink-2 dark:text-slate-400">
                    Upload your latest resume (PDF, Word, or TXT). It will be evaluated deterministically against the selected target role for keyword match, section structure, and action-verb strength.
                  </p>
                  <Button
                    variant="primary"
                    className="mt-5"
                    loading={uploading}
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="size-3.5 mr-1.5" aria-hidden />
                    Choose a file to analyze
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
                {/* Left Column: ATS Score & Metadata */}
                <div className="space-y-5">
                  <Card className="card-interactive bg-white dark:bg-slate-900 border-line dark:border-slate-800">
                    <CardBody className="text-center p-5">
                      <RadialScore value={atsScore} label="ATS Match Score" size={130} thickness={12} />
                      <div className="mt-3">
                        <Badge tone={atsScore >= 75 ? 'success' : atsScore >= 50 ? 'amber' : 'danger'}>
                          {atsScore >= 75 ? 'High Compatibility' : atsScore >= 50 ? 'Moderate Alignment' : 'Needs Optimization'}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-ink-1 dark:text-slate-200">
                        {targetTitle}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-3 dark:text-slate-400">
                        {analysis?.basis || 'Deterministic ATS match algorithm v2.4.0'}
                      </p>
                    </CardBody>
                  </Card>

                  <Card className="card-interactive bg-white dark:bg-slate-900 border-line dark:border-slate-800">
                    <CardHeader>
                      <div>
                        <CardTitle>Analyzed File</CardTitle>
                        <CardSubtitle>{formatDate(latest.createdAt, true)}</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody className="p-4 pt-0">
                      <p className="truncate text-sm font-semibold text-ink-1 dark:text-white">{latest.filename}</p>
                      <p className="mt-0.5 text-xs text-ink-3 dark:text-slate-400">
                        {bytes(latest.bytes)} · {latest.extractedCharacters} chars read
                      </p>
                      {latest.downloadUrl && (
                        <Button asChild variant="secondary" size="sm" className="mt-3.5 w-full">
                          <a href={latest.downloadUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="size-3.5 mr-1" aria-hidden />
                            Download resume
                          </a>
                        </Button>
                      )}
                    </CardBody>
                  </Card>

                  {historyList.length > 0 && (
                    <Card className="card-interactive bg-white dark:bg-slate-900 border-line dark:border-slate-800">
                      <CardHeader>
                        <div>
                          <CardTitle>Version History</CardTitle>
                          <CardSubtitle>Track your score evolution</CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody className="p-4 pt-0">
                        <ul className="space-y-1.5">
                          {historyList.map((row: any) => (
                            <li key={row.id} className="flex items-baseline justify-between gap-3 rounded-lg p-1.5 -mx-1.5 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                              <span className="min-w-0 truncate text-xs text-ink-2 dark:text-slate-300">
                                {formatDate(row.createdAt)}
                              </span>
                              <span className="tnum shrink-0 text-xs font-bold text-ink-1 dark:text-white">
                                {row.analysis?.overallScore ?? row.analysis?.score ?? '—'}/100
                              </span>
                            </li>
                          ))}
                        </ul>
                      </CardBody>
                    </Card>
                  )}
                </div>

                {/* Right Column: ATS Match Breakdowns, Skills & Critique */}
                <div className="space-y-5">
                  {/* Matched vs Missing Skills Cards */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Matched Skills */}
                    <Card className="card-interactive bg-white dark:bg-slate-900 border-line dark:border-slate-800">
                      <CardHeader>
                        <div>
                          <CardTitle className="text-success flex items-center gap-1.5">
                            <CheckCircle2 className="size-4" />
                            Matched Skills ({matchedSkills.length})
                          </CardTitle>
                          <CardSubtitle>Verified technical keywords in your resume</CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody className="p-4 pt-0">
                        {matchedSkills.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {matchedSkills.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              >
                                ✓ {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-ink-3 dark:text-slate-400">
                            No primary technical keywords matched for this target role.
                          </p>
                        )}
                      </CardBody>
                    </Card>

                    {/* Missing Skills */}
                    <Card className="card-interactive bg-white dark:bg-slate-900 border-line dark:border-slate-800">
                      <CardHeader>
                        <div>
                          <CardTitle className="text-amber flex items-center gap-1.5">
                            <AlertCircle className="size-4" />
                            Missing Role Keywords ({missingSkills.length})
                          </CardTitle>
                          <CardSubtitle>Critical skills requested by recruiters</CardSubtitle>
                        </div>
                      </CardHeader>
                      <CardBody className="p-4 pt-0">
                        {missingSkills.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {missingSkills.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                              >
                                + {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-success flex items-center gap-1 font-medium">
                            <CheckCircle2 className="size-3.5" />
                            All essential role keywords detected!
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  </div>

                  {/* Actionable AI Critique */}
                  <Card className="card-interactive bg-white dark:bg-slate-900 border-line dark:border-slate-800">
                    <CardHeader>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Lightbulb className="size-4 text-amber" />
                          Actionable Improvement Recommendations
                        </CardTitle>
                        <CardSubtitle>Ranked improvements to increase recruiter callback odds</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody className="p-4 pt-0">
                      {actionableCritique.length > 0 ? (
                        <ol className="space-y-2.5">
                          {actionableCritique.map((critique, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-3 rounded-xl bg-surface dark:bg-slate-850 p-3 border border-line dark:border-slate-800"
                            >
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo/10 text-indigo dark:bg-indigo/20 text-2xs font-bold mt-0.5">
                                {idx + 1}
                              </span>
                              <span className="text-xs text-ink-1 dark:text-slate-200 leading-relaxed">
                                {critique}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-xs text-success flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="size-4" />
                          Your resume meets high ATS readability standards with no critical missing sections.
                        </p>
                      )}
                    </CardBody>
                  </Card>

                  {/* Section Checklist */}
                  <Card className="card-interactive bg-white dark:bg-slate-900 border-line dark:border-slate-800">
                    <CardHeader>
                      <div>
                        <CardTitle>Structural Sections</CardTitle>
                        <CardSubtitle>What standard ATS parsers look for first</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody className="p-4 pt-0">
                      <ul className="grid gap-2 sm:grid-cols-3">
                        {SECTIONS.map((section) => {
                          const found = Array.isArray(analysis?.sectionsFound) && analysis.sectionsFound.includes(section);
                          return (
                            <li
                              key={section}
                              className="flex items-center gap-2 rounded-xl bg-surface dark:bg-slate-850 px-3 py-2 border border-line dark:border-slate-800"
                            >
                              {found ? (
                                <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
                              ) : (
                                <XCircle className="size-3.5 shrink-0 text-danger" aria-hidden />
                              )}
                              <span className="text-xs font-semibold text-ink-1 dark:text-slate-200">
                                {titleCase(section)}
                              </span>
                              <span className="ml-auto text-[10px] text-ink-3 dark:text-slate-400">
                                {found ? 'Found' : 'Missing'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </CardBody>
                  </Card>

                  {/* Bullet Strength */}
                  <Card className="card-interactive bg-white dark:bg-slate-900 border-line dark:border-slate-800">
                    <CardHeader>
                      <div>
                        <CardTitle>Bullet Point Impact</CardTitle>
                        <CardSubtitle>Action verbs and quantitative metrics</CardSubtitle>
                      </div>
                    </CardHeader>
                    <CardBody className="p-4 pt-0">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-surface dark:bg-slate-850 p-3 border border-line dark:border-slate-800">
                          <span className="text-[11px] text-ink-3 dark:text-slate-400">Strong Action Verbs</span>
                          <p className="text-base font-bold text-ink-1 dark:text-white mt-0.5">
                            {analysis?.actionVerbCount ?? 0}
                          </p>
                        </div>
                        <div className="rounded-xl bg-surface dark:bg-slate-850 p-3 border border-line dark:border-slate-800">
                          <span className="text-[11px] text-ink-3 dark:text-slate-400">Quantified Achievements</span>
                          <p className="text-base font-bold text-ink-1 dark:text-white mt-0.5">
                            {analysis?.quantifiedClaims ?? 0}
                          </p>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </AsyncSection>
  );
}
