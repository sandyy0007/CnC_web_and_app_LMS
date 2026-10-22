'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  Plus,
  Radio,
  Users,
  Video,
  Eye,
  FileSpreadsheet,
  Shield,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { liveClassApi, LiveClass, AttendanceReport } from '@/lib/api/live-classroom';
import { api } from '@/lib/api';
import { formatDate, formatTime, num } from '@/lib/format';

export default function TrainerClassesPage() {
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [assignedCourses, setAssignedCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [recordingModalOpen, setRecordingModalOpen] = useState(false);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<AttendanceReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State for Schedule
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseMode, setCourseMode] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [provider, setProvider] = useState<'WINNERS_CREEK' | 'GOOGLE_MEET' | 'ZOOM'>('GOOGLE_MEET');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingPassword, setMeetingPassword] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [threshold, setThreshold] = useState(75);

  // Material Form
  const [matCourseId, setMatCourseId] = useState('');
  const [matTitle, setMatTitle] = useState('');
  const [matType, setMatType] = useState('DOCUMENT');
  const [matFileUrl, setMatFileUrl] = useState('');
  const [matDesc, setMatDesc] = useState('');

  // Recording Form
  const [recCourseId, setRecCourseId] = useState('');
  const [recTitle, setRecTitle] = useState('');
  const [recUrl, setRecUrl] = useState('');
  const [recDurationMins, setRecDurationMins] = useState(45);

  const loadData = async () => {
    try {
      setLoading(true);
      const [classesData, batchesData, coursesRes] = await Promise.all([
        liveClassApi.getMyLiveClasses(),
        api.get<{ success: boolean; data: any }>('/trainer/batches').then((r) => r.data?.items || r.data || []).catch(() => []),
        api.get<{ success: boolean; data: any }>('/trainer/courses').then((r) => r.data || []).catch(() => []),
      ]);
      setLiveClasses(classesData);
      setBatches(batchesData);
      setAssignedCourses(coursesRes);
      if (coursesRes && coursesRes.length > 0 && !selectedCourseId) {
        setSelectedCourseId(coursesRes[0].id);
        setMatCourseId(coursesRes[0].id);
        setRecCourseId(coursesRes[0].id);
      }
    } catch (err) {
      console.error('Failed to load trainer classes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleScheduleClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startsAt || !endsAt) {
      toast.error('Please fill all required fields');
      return;
    }
    const finalMeetingUrl = provider === 'WINNERS_CREEK' ? 'https://meet.winnerscreek.lms/room/' + Math.random().toString(36).substring(7) : meetingUrl;
    if (!finalMeetingUrl) {
      toast.error('Please provide a meeting URL');
      return;
    }

    try {
      setSubmitting(true);
      const batchObj = batches.find((b) => b.id === selectedBatchId);

      // 1. Live class entry
      const newClass = await liveClassApi.createClass({
        title,
        description,
        courseMode,
        batchId: selectedBatchId || undefined,
        batchName: batchObj?.name,
        courseId: selectedCourseId || undefined,
        provider,
        meetingUrl: finalMeetingUrl,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        attendanceThreshold: threshold,
      });

      // 2. Also register training_session on the course so students see meeting links
      if (selectedCourseId) {
        const startDt = new Date(startsAt);
        const endDt = new Date(endsAt);
        await api.post(`/trainer/courses/${selectedCourseId}/sessions`, {
          topic: title,
          date: startDt.toISOString().split('T')[0],
          startTime: startDt.toTimeString().split(' ')[0],
          endTime: endDt.toTimeString().split(' ')[0],
          meetingLink: finalMeetingUrl,
          meetingPassword: meetingPassword || undefined,
          batchId: selectedBatchId || undefined,
        }).catch(() => {});
      }

      setLiveClasses((prev) => [newClass, ...prev]);
      setScheduleModalOpen(false);
      setTitle('');
      setDescription('');
      setMeetingUrl('');
      setMeetingPassword('');
      toast.success('Live class session scheduled and meeting link published to authorized students!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule class');
    } finally {
      setSubmitting(false);
    }
  };

  // Upload Material Handler
  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matCourseId || !matTitle || !matFileUrl) {
      toast.error('Course, title, and file URL are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/trainer/courses/${matCourseId}/materials`, {
        title: matTitle,
        fileUrl: matFileUrl,
        materialType: matType,
        description: matDesc,
      });
      toast.success('Course material published successfully!');
      setMaterialModalOpen(false);
      setMatTitle('');
      setMatFileUrl('');
      setMatDesc('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload material.');
    } finally {
      setSubmitting(false);
    }
  };

  // Upload Recording Handler
  const handleUploadRecording = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recCourseId || !recTitle || !recUrl) {
      toast.error('Course, title, and recording URL are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/trainer/courses/${recCourseId}/recordings`, {
        title: recTitle,
        recordingUrl: recUrl,
        durationSeconds: recDurationMins * 60,
      });
      toast.success('Session recording published successfully!');
      setRecordingModalOpen(false);
      setRecTitle('');
      setRecUrl('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to publish recording.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAttendance = async (classId: string) => {
    try {
      setLoadingReport(true);
      setAttendanceModalOpen(true);
      const report = await liveClassApi.getAttendance(classId);
      setActiveReport(report);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load attendance report');
      setAttendanceModalOpen(false);
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <VisualPageBackground
      image="/images/backgrounds/trainer.webp"
      withGrid
      withOrbs
    >
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300 backdrop-blur-md">
              <Sparkles className="size-3.5 text-indigo-500 dark:text-indigo-400" />
              Trainer Instruction &amp; Live Cohorts
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-1 sm:text-3xl">
              Virtual Classrooms, Materials &amp; Recordings
            </h1>
            <p className="mt-1 text-xs text-ink-2 max-w-xl">
              Schedule interactive sessions, broadcast meeting links to authorized trial &amp; paid students, and publish learning resources.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMaterialModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-card/80 px-4 py-2.5 text-xs font-semibold text-ink-1 backdrop-blur-md transition-all hover:bg-surface-hover dark:border-white/10 dark:bg-slate-900/80"
            >
              <FolderOpen className="size-3.5 text-indigo-500" />
              Add Notes / Materials
            </button>
            <button
              onClick={() => setRecordingModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-card/80 px-4 py-2.5 text-xs font-semibold text-ink-1 backdrop-blur-md transition-all hover:bg-surface-hover dark:border-white/10 dark:bg-slate-900/80"
            >
              <Video className="size-3.5 text-indigo-500" />
              Add Recording
            </button>
            <button
              onClick={() => setScheduleModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:opacity-95"
            >
              <Plus className="size-3.5" />
              Schedule Live Class
            </button>
          </div>
        </div>

        {/* Assigned Courses Section */}
        {assignedCourses.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-ink-1 flex items-center gap-2">
              <CalendarCheck className="size-4 text-indigo-500" />
              Your Assigned Teaching Courses ({assignedCourses.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignedCourses.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl border border-line bg-card/90 shadow-card backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-sm text-ink-1 line-clamp-1">{c.title}</span>
                      <span className="text-[11px] text-ink-3 font-mono">{c.code} · ₹{num(c.fee)}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      {c.status || 'PUBLISHED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-surface-muted dark:bg-slate-950/40 text-center text-xs">
                    <div>
                      <p className="text-[10px] text-ink-3">Total</p>
                      <p className="font-bold text-ink-1">{c.totalStudents ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-500 font-medium">Paid</p>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">{c.paidStudents ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-amber-500 font-medium">3D Trials</p>
                      <p className="font-bold text-amber-600 dark:text-amber-400">{c.activeTrials ?? 0}</p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-line text-xs">
                    <span className="text-ink-3 text-[11px]">{c.batchCount ?? 1} Batches</span>
                    <button
                      onClick={() => {
                        setSelectedCourseId(c.id);
                        setScheduleModalOpen(true);
                      }}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold text-[11px]"
                    >
                      + Schedule Class →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Classes Grid */}
        <div>
          <h2 className="mb-4 text-base font-bold text-ink-1">Your Scheduled &amp; Conducted Sessions</h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="size-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              <p className="mt-4 text-xs font-medium text-ink-3">Loading your sessions...</p>
            </div>
          ) : liveClasses.length === 0 ? (
            <div className="rounded-3xl border border-line bg-card p-12 text-center shadow-card backdrop-blur-md dark:border-white/10 dark:bg-slate-900/50">
              <Video className="mx-auto size-12 text-ink-3" />
              <h3 className="mt-3 text-base font-semibold text-ink-1">No Live Sessions Scheduled</h3>
              <p className="mt-1 text-xs text-ink-3">
                Click &quot;Schedule Live Class&quot; above to broadcast a meeting link to your assigned students.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {liveClasses.map((c) => {
                const isLive = c.status === 'LIVE' || c.isLiveNow;
                const isCompleted = c.status === 'COMPLETED';
                const hostUrl =
                  c.provider === 'WINNERS_CREEK' ? `/live-classes/${c.id}/room` : c.meetingUrl || '#';

                return (
                  <GlassCard
                    key={c.id}
                    hover
                    className={`flex flex-col justify-between ${
                      isLive ? 'border-red-500/50 bg-gradient-to-b from-red-950/20 to-slate-900/80 shadow-lg' : ''
                    }`}
                  >
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-bold text-red-500 dark:text-red-400">
                            <Radio className="size-3 animate-pulse" />
                            LIVE NOW
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-2.5 py-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
                            <CheckCircle2 className="size-3" />
                            Concluded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-300">
                            <Clock className="size-3" />
                            Scheduled
                          </span>
                        )}

                        <span className="rounded-lg border border-line bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-2 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                          {c.provider === 'WINNERS_CREEK' ? 'Native Room' : c.provider}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-ink-1">{c.title}</h3>
                        {c.description && (
                          <p className="mt-1 text-xs text-ink-2 line-clamp-2">{c.description}</p>
                        )}
                      </div>

                      <div className="space-y-1.5 rounded-xl border border-line bg-surface-muted p-3 text-xs text-ink-2 dark:border-white/5 dark:bg-slate-950/40 dark:text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-ink-3">Batch / Cohort</span>
                          <span className="font-semibold text-ink-1">
                            {c.batchName || (c.courseMode === 'ONLINE' ? 'Online Cohort' : 'General')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-ink-3">Date</span>
                          <span className="text-ink-1">{formatDate(c.startsAt)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-ink-3">Time</span>
                          <span className="text-ink-1">
                            {formatTime(c.startsAt)} – {formatTime(c.endsAt)}
                          </span>
                        </div>
                        {c.meetingUrl && (
                          <div className="flex items-center justify-between font-mono text-[10px] pt-1">
                            <span className="text-ink-3">Link:</span>
                            <span className="text-indigo-500 truncate max-w-[180px]">{c.meetingUrl}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 space-y-2 pt-4 border-t border-line">
                      {!isCompleted && (
                        <InteractiveArrowButton
                          href={hostUrl}
                          target={c.provider === 'WINNERS_CREEK' ? '_self' : '_blank'}
                          variant={isLive ? 'gradient' : 'glass'}
                          className={`w-full justify-between ${
                            isLive ? 'from-red-600 to-indigo-600 shadow-red-500/20' : ''
                          }`}
                        >
                          {isLive ? 'Enter Live Room (Host)' : 'Launch Host Room'}
                        </InteractiveArrowButton>
                      )}

                      <button
                        onClick={() => handleOpenAttendance(c.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-muted py-2 text-xs font-semibold text-ink-2 transition hover:bg-surface-hover hover:text-ink-1 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <Eye className="size-3.5 text-indigo-500" />
                        View Attendance Analytics
                      </button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>

        {/* Schedule Modal */}
        {scheduleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8 sm:pt-14 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border border-line bg-card p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <h2 className="text-lg font-bold text-ink-1">Schedule Live Class</h2>
                  <p className="text-xs text-ink-3">Broadcast meeting link to authorized students</p>
                </div>
                <button
                  onClick={() => setScheduleModalOpen(false)}
                  className="rounded-lg p-1 text-ink-3 hover:text-ink-1"
                >
                  <X className="size-5" />
                </button>
              </div>

              <form onSubmit={handleScheduleClass} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2">Class Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Masterclass: Advanced Full-Stack Architecture"
                    className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3.5 py-2.5 text-xs text-ink-1 placeholder:text-ink-3 focus:border-brand-primary focus:outline-none"
                  />
                </div>

                {/* Course Selection */}
                <div>
                  <label className="block text-xs font-semibold text-ink-2">Select Assigned Course *</label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    required
                  >
                    <option value="">Select Course</option>
                    {assignedCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-2">Description</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Key concepts, syllabus topics, and prerequisites..."
                    className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3.5 py-2.5 text-xs text-ink-1 placeholder:text-ink-3 focus:border-brand-primary focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-2">Starts At *</label>
                    <input
                      type="datetime-local"
                      required
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-2">Ends At *</label>
                    <input
                      type="datetime-local"
                      required
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-2">Virtual Provider</label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as any)}
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    >
                      <option value="GOOGLE_MEET">Google Meet</option>
                      <option value="ZOOM">Zoom</option>
                      <option value="WINNERS_CREEK">Winners Creek Native Classroom</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-2">Meeting Passcode (Optional)</label>
                    <input
                      type="text"
                      value={meetingPassword}
                      onChange={(e) => setMeetingPassword(e.target.value)}
                      placeholder="e.g. 123456"
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 font-mono focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                </div>

                {provider !== 'WINNERS_CREEK' && (
                  <div>
                    <label className="block text-xs font-semibold text-ink-2">Meeting URL *</label>
                    <input
                      type="url"
                      required
                      value={meetingUrl}
                      onChange={(e) => setMeetingUrl(e.target.value)}
                      placeholder="https://meet.google.com/abc-defg-hij"
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3.5 py-2.5 text-xs text-ink-1 placeholder:text-ink-3 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setScheduleModalOpen(false)}
                    className="rounded-xl px-4 py-2 text-xs font-medium text-ink-3 hover:text-ink-1 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:opacity-95"
                  >
                    {submitting ? 'Publishing...' : 'Publish Session'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Upload Material Modal */}
        {materialModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8 sm:pt-14 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <h2 className="text-lg font-bold text-ink-1">Publish Class Material</h2>
                  <p className="text-xs text-ink-3">Upload notes, slides, exercises or documents</p>
                </div>
                <button onClick={() => setMaterialModalOpen(false)} className="rounded-lg p-1 text-ink-3 hover:text-ink-1">
                  <X className="size-5" />
                </button>
              </div>

              <form onSubmit={handleUploadMaterial} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2">Course *</label>
                  <select
                    value={matCourseId}
                    onChange={(e) => setMatCourseId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    required
                  >
                    <option value="">Select Course</option>
                    {assignedCourses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-2">Material Title *</label>
                  <input
                    type="text"
                    required
                    value={matTitle}
                    onChange={(e) => setMatTitle(e.target.value)}
                    placeholder="e.g. Session 1 Lecture Notes &amp; Cheatsheet"
                    className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-2">Resource Type</label>
                    <select
                      value={matType}
                      onChange={(e) => setMatType(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    >
                      <option value="DOCUMENT">Document / PDF</option>
                      <option value="NOTES">Handwritten Notes</option>
                      <option value="SLIDES">Slide Deck</option>
                      <option value="EXERCISE">Code Exercise / Lab</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-2">File / Cloud URL *</label>
                    <input
                      type="url"
                      required
                      value={matFileUrl}
                      onChange={(e) => setMatFileUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-2">Description</label>
                  <textarea
                    rows={2}
                    value={matDesc}
                    onChange={(e) => setMatDesc(e.target.value)}
                    placeholder="Instructions for students..."
                    className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                  <button type="button" onClick={() => setMaterialModalOpen(false)} className="rounded-xl px-4 py-2 text-xs font-medium text-ink-3">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg">
                    {submitting ? 'Publishing...' : 'Publish Material'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Upload Recording Modal */}
        {recordingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8 sm:pt-14 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <h2 className="text-lg font-bold text-ink-1">Publish Session Recording</h2>
                  <p className="text-xs text-ink-3">Share recorded video for enrolled/trial participants</p>
                </div>
                <button onClick={() => setRecordingModalOpen(false)} className="rounded-lg p-1 text-ink-3 hover:text-ink-1">
                  <X className="size-5" />
                </button>
              </div>

              <form onSubmit={handleUploadRecording} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2">Course *</label>
                  <select
                    value={recCourseId}
                    onChange={(e) => setRecCourseId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    required
                  >
                    <option value="">Select Course</option>
                    {assignedCourses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-2">Recording Title *</label>
                  <input
                    type="text"
                    required
                    value={recTitle}
                    onChange={(e) => setRecTitle(e.target.value)}
                    placeholder="e.g. Session 1 Replay: System Design Foundations"
                    className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-2">Video URL *</label>
                    <input
                      type="url"
                      required
                      value={recUrl}
                      onChange={(e) => setRecUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-2">Duration (Minutes)</label>
                    <input
                      type="number"
                      min={1}
                      value={recDurationMins}
                      onChange={(e) => setRecDurationMins(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-xl border border-input-border bg-input px-3 py-2 text-xs text-ink-1 focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                  <button type="button" onClick={() => setRecordingModalOpen(false)} className="rounded-xl px-4 py-2 text-xs font-medium text-ink-3">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg">
                    {submitting ? 'Publishing...' : 'Publish Recording'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Attendance Report Modal */}
        {attendanceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8 sm:pt-14 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line bg-card p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <h2 className="text-lg font-bold text-ink-1">Live Attendance Analytics</h2>
                  <p className="text-xs text-ink-3">{activeReport?.title || 'Session Telemetry'}</p>
                </div>
                <button
                  onClick={() => setAttendanceModalOpen(false)}
                  className="rounded-lg p-1 text-ink-3 hover:text-ink-1"
                >
                  <X className="size-5" />
                </button>
              </div>

              {loadingReport ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="size-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                  <p className="mt-3 text-xs text-ink-3">Loading attendance data...</p>
                </div>
              ) : !activeReport || activeReport.participants.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink-3">
                  No attendance telemetry recorded for this session yet.
                </div>
              ) : (
                <div className="space-y-4 pt-4">
                  {(() => {
                    const totalParts = activeReport.participants.length;
                    const attendedParts = activeReport.participants.filter((p) => p.attendanceStatus === 'PRESENT').length;
                    const cohortRate = totalParts > 0 ? Math.round((attendedParts / totalParts) * 100) : 0;
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-2xl border border-line bg-surface-muted p-3 text-center dark:border-white/5 dark:bg-white/5">
                            <p className="text-xs text-ink-3">Total Joined</p>
                            <p className="text-lg font-bold text-ink-1">{totalParts}</p>
                          </div>
                          <div className="rounded-2xl border border-line bg-surface-muted p-3 text-center dark:border-white/5 dark:bg-white/5">
                            <p className="text-xs text-ink-3">Threshold Met</p>
                            <p className="text-lg font-bold text-green-500">{attendedParts}</p>
                          </div>
                          <div className="rounded-2xl border border-line bg-surface-muted p-3 text-center dark:border-white/5 dark:bg-white/5">
                            <p className="text-xs text-ink-3">Cohort Rate</p>
                            <p className="text-lg font-bold text-indigo">
                              {cohortRate}%
                            </p>
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-line dark:border-white/10">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-surface-muted border-b border-line text-ink-3 uppercase font-semibold text-[10px] dark:bg-white/5">
                              <tr>
                                <th className="p-3">Participant</th>
                                <th className="p-3">Join Time</th>
                                <th className="p-3">Duration</th>
                                <th className="p-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line dark:divide-white/5">
                              {activeReport.participants.map((p) => (
                                <tr key={p.userId}>
                                  <td className="p-3 font-medium text-ink-1">{p.userName}</td>
                                  <td className="p-3 text-ink-3">{p.joinedAt ? formatTime(p.joinedAt) : '—'}</td>
                                  <td className="p-3 text-ink-1">{p.totalMinutes ?? 0} mins</td>
                                  <td className="p-3">
                                    {p.attendanceStatus === 'PRESENT' ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-500">
                                        <CheckCircle2 className="size-3" /> Qualified
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-amber-500 font-medium">
                                        {p.attendanceStatus} ({p.attendancePercentage}%)
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </VisualPageBackground>
  );
}
