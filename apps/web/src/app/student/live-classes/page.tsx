'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/navigation';
import {
  CalendarDays,
  Clock,
  ExternalLink,
  Radio,
  Video,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  BookOpen,
  Filter,
} from 'lucide-react';

import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { liveClassApi, LiveClass, LiveRecording } from '@/lib/api/live-classroom';
import { formatDate, formatTime } from '@/lib/format';

export default function StudentLiveClassesPage() {
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [recordings, setRecordings] = useState<LiveRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming' | 'past' | 'recordings'>('all');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [classesData, recordingsData] = await Promise.all([
          liveClassApi.getMyLiveClasses(),
          liveClassApi.getMyRecordings().catch(() => []),
        ]);
        setClasses(classesData);
        setRecordings(recordingsData);
      } catch (err) {
        console.error('Failed to load student live classes:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const liveNow = classes.filter((c) => c.status === 'LIVE' || c.isLiveNow);
  const upcoming = classes.filter((c) => c.status === 'SCHEDULED');
  const past = classes.filter((c) => c.status === 'COMPLETED');

  const filteredClasses = () => {
    if (filter === 'live') return liveNow;
    if (filter === 'upcoming') return upcoming;
    if (filter === 'past') return past;
    return classes;
  };

  const getJoinUrl = (c: LiveClass) => {
    if (c.provider === 'WINNERS_CREEK') {
      return `/live-classes/${c.id}/room`;
    }
    return c.meetingUrl || '#';
  };

  return (
    <VisualPageBackground
      image="/images/backgrounds/attendance.webp"
      overlay="dark"
      withGrid
      withOrbs
    >
      <div className="space-y-8 pb-12">
        {/* 1. Page Header & Live Telemetry Banner */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-300 backdrop-blur-md">
              <Sparkles className="size-3.5 text-indigo-400" />
              Winners Creek Live Cohorts
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Virtual Classrooms & Live Mentorship
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Interactive sessions with expert mentors, real-time presence tracking, and verified attendance.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 backdrop-blur-md">
              <div className="flex size-8 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <Video className="size-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400">Total Sessions</p>
                <p className="text-sm font-bold text-white">{classes.length}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 backdrop-blur-md">
              <div className="flex size-8 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
                <Radio className="size-4 animate-pulse" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400">Live Now</p>
                <p className="text-sm font-bold text-red-400">{liveNow.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Highlight: Prominent LIVE NOW Banner */}
        {liveNow.length > 0 && (
          <div className="relative overflow-hidden rounded-3xl border border-red-500/40 bg-gradient-to-r from-red-950/70 via-slate-900/90 to-indigo-950/70 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400">
                  <span className="size-2 animate-ping rounded-full bg-red-500" />
                  SESSION IN PROGRESS
                </div>
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  {liveNow[0].title}
                </h2>
                <p className="text-xs text-slate-300">
                  Conducted by <span className="font-semibold text-indigo-300">{liveNow[0].trainerName}</span> ·{' '}
                  {liveNow[0].batchName || 'Your Enrolled Cohort'}
                </p>
              </div>

              <InteractiveArrowButton
                href={getJoinUrl(liveNow[0])}
                variant="gradient"
                size="lg"
                target={liveNow[0].provider === 'WINNERS_CREEK' ? '_self' : '_blank'}
                className="from-red-600 to-indigo-600 shadow-red-500/30"
              >
                Join Live Room Now
              </InteractiveArrowButton>
            </div>
          </div>
        )}

        {/* 3. Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
          {[
            { id: 'all', label: `All Sessions (${classes.length})` },
            { id: 'live', label: `Live Now (${liveNow.length})` },
            { id: 'upcoming', label: `Upcoming (${upcoming.length})` },
            { id: 'past', label: `Completed (${past.length})` },
            { id: 'recordings', label: `Recordings (${recordings.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                filter === tab.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'border border-white/10 bg-slate-900/40 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 4. Content Area */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            <p className="mt-4 text-xs font-medium text-slate-400">Loading your eligible live classes...</p>
          </div>
        ) : filter === 'recordings' ? (
          /* Recordings Tab */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recordings.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-white/10 bg-slate-900/50 p-12 text-center backdrop-blur-md">
                <PlayCircle className="mx-auto size-12 text-slate-500" />
                <h3 className="mt-3 text-base font-semibold text-white">No Recordings Available Yet</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Recorded sessions from your completed live classes will appear here automatically.
                </p>
              </div>
            ) : (
              recordings.map((rec) => (
                <GlassCard key={rec.id} hover className="flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-300">
                        <PlayCircle className="size-3.5" />
                        Recorded Class
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {Math.round(rec.durationSeconds / 60)} mins
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white line-clamp-1">{rec.title}</h3>
                    {rec.notes && <p className="text-xs text-slate-300 line-clamp-2">{rec.notes}</p>}
                  </div>
                  <div className="mt-5 pt-4 border-t border-white/10">
                    <InteractiveArrowButton
                      href={rec.videoUrl}
                      target="_blank"
                      variant="glass"
                      size="sm"
                      className="w-full justify-between"
                    >
                      Watch Recording
                    </InteractiveArrowButton>
                  </div>
                </GlassCard>
              ))
            )}
          </div>
        ) : (
          /* Class Cards Grid */
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredClasses().length === 0 ? (
              <div className="col-span-full rounded-2xl border border-white/10 bg-slate-900/50 p-12 text-center backdrop-blur-md">
                <Video className="mx-auto size-12 text-slate-500" />
                <h3 className="mt-3 text-base font-semibold text-white">No Live Classes Found</h3>
                <p className="mt-1 text-xs text-slate-400">
                  There are no sessions matching your current filter. Check back shortly for new schedules!
                </p>
              </div>
            ) : (
              filteredClasses().map((c) => {
                const isLive = c.status === 'LIVE' || c.isLiveNow;
                const isCompleted = c.status === 'COMPLETED';
                const providerLabel =
                  c.provider === 'WINNERS_CREEK'
                    ? 'Native Classroom'
                    : c.provider === 'GOOGLE_MEET'
                    ? 'Google Meet'
                    : c.provider === 'ZOOM'
                    ? 'Zoom'
                    : 'External Platform';

                return (
                  <GlassCard
                    key={c.id}
                    hover
                    className={`flex flex-col justify-between transition-all ${
                      isLive ? 'border-red-500/50 bg-gradient-to-b from-red-950/20 to-slate-900/80 shadow-lg shadow-red-500/10' : ''
                    }`}
                  >
                    <div className="space-y-3.5">
                      {/* Badge bar */}
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
                          {providerLabel}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="text-base font-bold text-white">{c.title}</h3>
                        {c.description && (
                          <p className="mt-1 text-xs text-slate-300 line-clamp-2">{c.description}</p>
                        )}
                      </div>

                      {/* Details Meta */}
                      <div className="space-y-1.5 rounded-xl border border-white/5 bg-slate-950/40 p-3 text-xs text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Trainer</span>
                          <span className="font-semibold text-white">{c.trainerName || 'Assigned Mentor'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Cohort / Batch</span>
                          <span className="font-semibold text-white">
                            {c.batchName || (c.courseMode === 'ONLINE' ? 'Online Cohort' : 'Campus')}
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
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-5 pt-4 border-t border-white/10">
                      {isCompleted ? (
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Attendance Finalized</span>
                          <span className="font-semibold text-slate-300">Threshold: {c.attendanceThreshold}%</span>
                        </div>
                      ) : (
                        <InteractiveArrowButton
                          href={getJoinUrl(c)}
                          variant={isLive ? 'gradient' : 'glass'}
                          target={c.provider === 'WINNERS_CREEK' ? '_self' : '_blank'}
                          className={`w-full justify-between ${
                            isLive ? 'from-red-600 to-indigo-600 shadow-red-500/20' : ''
                          }`}
                        >
                          {isLive ? 'Enter Live Room Now' : 'Join Virtual Classroom'}
                        </InteractiveArrowButton>
                      )}
                    </div>
                  </GlassCard>
                );
              })
            )}
          </div>
        )}
      </div>
    </VisualPageBackground>
  );
}
