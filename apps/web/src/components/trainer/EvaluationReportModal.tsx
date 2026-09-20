'use client';

import {
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  GraduationCap,
  Sparkles,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EvaluationReport } from '@/lib/domain';
import { formatDate, num } from '@/lib/format';

interface EvaluationReportModalProps {
  report: EvaluationReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EvaluationReportModal({
  report,
  open,
  onOpenChange,
}: EvaluationReportModalProps) {
  if (!report) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-white/10 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white">
                  Comprehensive EEDI Evaluation Report
                </DialogTitle>
                <p className="text-xs text-slate-400">
                  {report.studentName} ({report.rollNumber || 'Participant'}) ·{' '}
                  {report.departmentName || 'Department'}
                </p>
              </div>
            </div>
            <Badge tone="success" dot>
              {report.status}
            </Badge>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5 py-4">
          {/* Top Score Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-950/40 backdrop-blur-md text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                EEDI Score
              </span>
              <div className="mt-1 text-3xl font-extrabold text-white">
                {report.eediScore != null ? num(report.eediScore, 1) : 'N/A'}
                {report.eediScore != null && (
                  <span className="text-xs font-medium text-indigo-300">/100</span>
                )}
              </div>
              <span className="text-[10px] text-slate-400">Readiness index</span>
            </div>

            <div className="p-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/40 backdrop-blur-md text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                Employment Score
              </span>
              <div className="mt-1 text-3xl font-extrabold text-white">
                {report.employmentScore != null ? num(report.employmentScore, 1) : 'N/A'}
                {report.employmentScore != null && (
                  <span className="text-xs font-medium text-cyan-300">/100</span>
                )}
              </div>
              <span className="text-[10px] text-slate-400">Employability potential</span>
            </div>

            <div className="p-4 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Attendance
              </span>
              <div className="mt-1 text-3xl font-extrabold text-white">
                {report.performanceAnalysis?.attendanceLabel || 'N/A'}
              </div>
              <span className="text-[10px] text-slate-400">Verified session presence</span>
            </div>
          </div>

          {/* Category-wise Pillar Scores */}
          <div className="p-4 rounded-2xl border border-white/10 bg-slate-900/40 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <BarChart3 className="size-3.5 text-indigo-400" />
              Category-Wise Pillar Scores
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.entries(report.pillarScores || {}).map(([pillar, score]) => (
                <div
                  key={pillar}
                  className="p-2.5 rounded-xl border border-white/6 bg-slate-950/60 flex items-center justify-between"
                >
                  <span className="text-xs font-medium text-slate-300 capitalize">
                    {pillar.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400"
                        style={{ width: `${Math.min(100, score)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-white min-w-[36px] text-right">
                      {num(score, 1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Qualitative Trainer Feedback */}
          <div className="p-4 rounded-2xl border border-white/10 bg-slate-900/40 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-400" />
              Trainer Feedback & Evaluation
            </h4>

            <div className="rounded-xl border border-white/8 bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-200">
              <p className="font-semibold text-white mb-1">Overall Assessment:</p>
              <p>{report.overallAssessment || 'No written assessment.'}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 space-y-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" /> Strengths
                </span>
                <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                  {(report.strengths || []).map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-950/20 space-y-1">
                <span className="font-semibold text-amber-400 flex items-center gap-1">
                  <Award className="size-3.5" /> Weaknesses
                </span>
                <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                  {(report.weaknesses || []).map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-950/20 space-y-1">
                <span className="font-semibold text-indigo-400 flex items-center gap-1">
                  <TrendingUp className="size-3.5" /> Improvements
                </span>
                <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                  {(report.improvementAreas || []).map((i, idx) => (
                    <li key={idx}>{i}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Telemetry & Metadata Footer */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] text-slate-400 border-t border-white/10">
            <div>
              <span className="block text-slate-500 font-medium">Evaluated By:</span>
              <span className="text-white font-medium">{report.evaluatorName}</span>
            </div>
            <div>
              <span className="block text-slate-500 font-medium">Institution:</span>
              <span className="text-white font-medium">{report.institutionName || 'Institutional'}</span>
            </div>
            <div>
              <span className="block text-slate-500 font-medium">Training Model:</span>
              <span className="text-white font-medium capitalize">
                {(report.trainingType || 'COLLEGE').toLowerCase()} training
              </span>
            </div>
            <div>
              <span className="block text-slate-500 font-medium">Evaluation Date:</span>
              <span className="text-white font-medium">
                {report.evaluatedAt ? formatDate(report.evaluatedAt) : 'Recent'}
              </span>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="border-t border-white/10 pt-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

