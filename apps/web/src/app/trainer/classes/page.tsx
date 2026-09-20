'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  Radio,
  Users,
  Video,
  Eye,
  FileSpreadsheet,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';

import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { liveClassApi, LiveClass, AttendanceReport } from '@/lib/api/live-classroom';
import { api } from '@/lib/api';
import { formatDate, formatTime, num } from '@/lib/format';

export default function TrainerClassesPage() {
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<AttendanceReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseMode, setCourseMode] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [provider, setProvider] = useState<'WINNERS_CREEK' | 'GOOGLE_MEET' | 'ZOOM'>('WINNERS_CREEK');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [threshold, setThreshold] = useState(75);

  const loadClasses = async () => {
    try {
      setLoading(true);
      const [classesData, batchesData, coursesData] = await Promise.all([
        liveClassApi.getMyLiveClasses(),
        api.get<{ success: boolean; data: any }>('/trainer/batches').then((r) => r.data?.items || r.data || []).catch(() => []),
        api.get<{ success: boolean; data: any }>('/courses').then((r) => r.data || []).catch(() => []),
      ]);
      setLiveClasses(classesData);
      setBatches(batchesData);
      setCourses(coursesData);
    } catch (err) {
      console.error('Failed to load trainer classes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const handleScheduleClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startsAt || !endsAt) {
      alert('Please fill all required fields');
      return;
    }
    try {
      setSubmitting(true);
      const batchObj = batches.find((b) => b.id === selectedBatchId);
      const newClass = await liveClassApi.createClass({
        title,
        description,
        courseMode,
        batchId: selectedBatchId || undefined,
        batchName: batchObj?.name,
        courseId: selectedCourseId || undefined,
        provider,
        meetingUrl: provider !== 'WINNERS_CREEK' ? meetingUrl : undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        attendanceThreshold: threshold,
      });

      setLiveClasses((prev) => [newClass, ...prev]);
      setScheduleModalOpen(false);
      setTitle('');
      setDescription('');
    } catch (err: any) {
      alert(err?.message || 'Failed to schedule class');
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
      alert(err?.message || 'Failed to load attendance report');
      setAttendanceModalOpen(false);
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <VisualPageBackground
      image="/images/backgrounds/trainer.webp"
      overlay="dark"
      withGrid
      withOrbs
    >
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-300 backdrop-blur-md">
              <Sparkles className="size-3.5 text-indigo-400" />
              Trainer Instruction & Live Cohorts
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Virtual Classrooms & Live Sessions
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Host interactive virtual lectures, screen share with students, and track automated presence heartbeats.
            </p>
          </div>

          <button
            onClick={() => setScheduleModalOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 active:scale-98"
          >
            <Plus className="size-4" />
            {scheduleModalOpen ? 'Hide Scheduling Form' : 'Schedule Live Class'}
          </button>
        </div>

        {/* Schedule Live Class Form — Strict Natural Top-to-Bottom Flow */}
        {scheduleModalOpen && (
          <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl animate-enter">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">Schedule Live Virtual Class</h2>
                <p className="text-xs text-slate-300 mt-0.5">Fill in the session details to schedule a new live class for your cohort.</p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Close scheduling form"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleScheduleClass} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Class Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Masterclass: Advanced Full-Stack Architecture"
                  className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Key concepts, syllabus topics, and prerequisites..."
                  className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Course Delivery Mode</label>
                  <select
                    value={courseMode}
                    onChange={(e) => setCourseMode(e.target.value as any)}
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="ONLINE">Online Cohort</option>
                    <option value="OFFLINE">Campus College Batch</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">Assigned Batch</label>
                  <select
                    value={selectedBatchId}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="">Select Batch (Optional)</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Starts At *</label>
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Ends At *</label>
                  <input
                    type="datetime-local"
                    required
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Virtual Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as any)}
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="WINNERS_CREEK">Winners Creek Native Classroom</option>
                    <option value="GOOGLE_MEET">Google Meet</option>
                    <option value="ZOOM">Zoom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">Attendance Threshold (%)</label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              {provider !== 'WINNERS_CREEK' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Meeting URL *</label>
                  <input
                    type="url"
                    required
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-slate-950/80 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2 text-xs font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
                >
                  {submitting ? 'Scheduling...' : 'Schedule Live Class'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Live Classes Grid */}
        <div>
          <h2 className="mb-4 text-base font-bold text-white">Your Scheduled & Conducted Sessions</h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="size-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              <p className="mt-4 text-xs font-medium text-slate-400">Loading your sessions...</p>
            </div>
          ) : liveClasses.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-12 text-center backdrop-blur-md">
              <Video className="mx-auto size-12 text-slate-500" />
              <h3 className="mt-3 text-base font-semibold text-white">No Live Sessions Scheduled</h3>
              <p className="mt-1 text-xs text-slate-400">
                Click &quot;Schedule Live Class&quot; above to create a native virtual classroom session for your cohort.
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
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-bold text-red-400">
                            <Radio className="size-3 animate-pulse" />
                            LIVE NOW
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-2.5 py-1 text-[11px] font-semibold text-green-400">
                            <CheckCircle2 className="size-3" />
                            Concluded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-1 text-[11px] font-semibold text-blue-300">
                            <Clock className="size-3" />
                            Scheduled
                          </span>
                        )}

                        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                          {c.provider === 'WINNERS_CREEK' ? 'Native Room' : c.provider}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-white">{c.title}</h3>
                        {c.description && (
                          <p className="mt-1 text-xs text-slate-300 line-clamp-2">{c.description}</p>
                        )}
                      </div>

                      <div className="space-y-1.5 rounded-xl border border-white/5 bg-slate-950/40 p-3 text-xs text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Batch / Cohort</span>
                          <span className="font-semibold text-white">
                            {c.batchName || (c.courseMode === 'ONLINE' ? 'Online Cohort' : 'General')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Date</span>
                          <span className="text-slate-200">{formatDate(c.startsAt)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Time</span>
                          <span className="text-slate-200">
                            {formatTime(c.startsAt)} – {formatTime(c.endsAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Attendance Threshold</span>
                          <span className="text-indigo-400 font-semibold">{c.attendanceThreshold}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 space-y-2 pt-4 border-t border-white/10">
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
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        <Eye className="size-3.5 text-indigo-400" />
                        View Attendance Analytics
                      </button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>

        {/* Attendance Report Modal */}
        {attendanceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pt-8 sm:pt-14 backdrop-blur-md">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <h2 className="text-lg font-bold text-white">Live Attendance Analytics</h2>
                  <p className="text-xs text-slate-400">{activeReport?.title || 'Session Telemetry'}</p>
                </div>
                <button
                  onClick={() => setAttendanceModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="size-5" />
                </button>
              </div>

              {loadingReport ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="size-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                  <p className="mt-3 text-xs text-slate-400">Loading attendance data...</p>
                </div>
              ) : !activeReport || activeReport.participants.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No attendance records recorded for this session yet.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
                    <span>Threshold: {activeReport.threshold}%</span>
                    <span>Total Participants: {activeReport.participants.length}</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="border-b border-white/10 text-slate-400">
                        <tr>
                          <th className="pb-2">Participant</th>
                          <th className="pb-2">Role</th>
                          <th className="pb-2">Connected Time</th>
                          <th className="pb-2">Attendance %</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {activeReport.participants.map((p) => (
                          <tr key={p.userId} className="py-2">
                            <td className="py-2.5 font-medium text-white">{p.userName}</td>
                            <td className="py-2.5 text-slate-400">{p.role}</td>
                            <td className="py-2.5">{p.totalMinutes} mins</td>
                            <td className="py-2.5 font-semibold text-indigo-400">
                              {p.attendancePercentage}%
                            </td>
                            <td className="py-2.5">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  p.attendanceStatus === 'PRESENT'
                                    ? 'bg-green-500/20 text-green-400'
                                    : p.attendanceStatus === 'PARTIAL'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                {p.attendanceStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </VisualPageBackground>
  );
}
