'use client';

import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  Clock,
  ExternalLink,
  Plus,
  Radio,
  Shield,
  Users,
  Video,
  CheckCircle2,
  Lock,
} from 'lucide-react';

import { VisualPageBackground } from '@/components/ui/VisualPageBackground';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { liveClassApi, LiveClass } from '@/lib/api/live-classroom';
import { api } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';

export default function SuperAdminMeetingsPage() {
  const [meetings, setMeetings] = useState<LiveClass[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New meeting form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<'WINNERS_CREEK' | 'GOOGLE_MEET' | 'ZOOM'>('WINNERS_CREEK');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [selectedTrainerIds, setSelectedTrainerIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [allClasses, usersRes] = await Promise.all([
          liveClassApi.getMyLiveClasses(),
          api.get<{ success: boolean; data: any[] }>('/super-admin/users?role=TRAINER').catch(() => ({ data: [] })),
        ]);
        const trainerMeetings = allClasses.filter((c) => c.meetingType === 'TRAINER_MEETING');
        setMeetings(trainerMeetings);
        setTrainers(usersRes.data || []);
      } catch (err) {
        console.error('Failed to load trainer meetings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startsAt || !endsAt) {
      alert('Please fill all required fields');
      return;
    }
    try {
      setSubmitting(true);
      const newMeeting = await liveClassApi.createClass({
        title,
        description,
        meetingType: 'TRAINER_MEETING',
        provider,
        meetingUrl: provider !== 'WINNERS_CREEK' ? meetingUrl : undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        allowedTrainerIds: selectedTrainerIds as any,
      });
      setMeetings((prev) => [newMeeting, ...prev]);
      setModalOpen(false);
      setTitle('');
      setDescription('');
      setSelectedTrainerIds([]);
    } catch (err: any) {
      alert(err?.message || 'Failed to create meeting');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTrainer = (id: string) => {
    setSelectedTrainerIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  return (
    <VisualPageBackground
      image="/images/backgrounds/super-admin.webp"
      overlay="dark"
      withGrid
      withOrbs
    >
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3.5 py-1.5 text-xs font-semibold text-purple-300 backdrop-blur-md">
              <Lock className="size-3.5 text-purple-400" />
              Super Admin Executive Suite
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Trainer Meetings & Administrative Sync
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Private administrative sessions with certified trainers. Strictly isolated from student and departmental visibility.
            </p>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"
          >
            <Plus className="size-4" />
            Schedule Trainer Meeting
          </button>
        </div>

        {/* Meeting Cards */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            <p className="mt-4 text-xs font-medium text-slate-300">Loading trainer meetings...</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-12 text-center backdrop-blur-md">
            <Video className="mx-auto size-12 text-slate-400" />
            <h3 className="mt-3 text-base font-semibold text-white">No Private Trainer Meetings</h3>
            <p className="mt-1 text-xs text-slate-300">
              Schedule your first administrative meeting with platform trainers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {meetings.map((m) => {
              const isLive = m.status === 'LIVE' || m.isLiveNow;
              const joinUrl =
                m.provider === 'WINNERS_CREEK' ? `/live-classes/${m.id}/room` : m.meetingUrl || '#';

              return (
                <GlassCard
                  key={m.id}
                  hover
                  className={`flex flex-col justify-between ${
                    isLive ? 'border-red-500/50 bg-gradient-to-b from-red-950/20 to-slate-900/80 shadow-lg' : ''
                  }`}
                >
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/20 px-2.5 py-1 text-[11px] font-semibold text-purple-300">
                        <Shield className="size-3" />
                        Executive Sync
                      </span>
                      {isLive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                          <Radio className="size-3 animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-white">{m.title}</h3>
                    {m.description && (
                      <p className="text-xs text-slate-300 line-clamp-2">{m.description}</p>
                    )}

                    <div className="space-y-1.5 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">Platform</span>
                        <span className="font-semibold text-white">{m.provider}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">Date</span>
                        <span className="text-slate-100">{formatDate(m.startsAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">Time</span>
                        <span className="text-slate-100">
                          {formatTime(m.startsAt)} – {formatTime(m.endsAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/10">
                    <InteractiveArrowButton
                      href={joinUrl}
                      target={m.provider === 'WINNERS_CREEK' ? '_self' : '_blank'}
                      variant={isLive ? 'gradient' : 'glass'}
                      className="w-full justify-between"
                    >
                      {isLive ? 'Join Live Meeting' : 'Open Virtual Room'}
                    </InteractiveArrowButton>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}

        {/* Schedule Meeting Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-slate-900/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl text-white">
              <h2 className="text-xl font-bold text-white">Schedule Private Trainer Meeting</h2>
              <p className="mt-1 text-sm text-slate-300">
                This meeting is strictly confidential and visible only to invited trainers and Super Admins.
              </p>

              <form onSubmit={handleCreateMeeting} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white">Meeting Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Q3 Pedagogy & Curriculum Sync"
                    className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white">Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Agenda, objectives, and discussion points..."
                    className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-white">Starts At *</label>
                    <input
                      type="datetime-local"
                      required
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white">Ends At *</label>
                    <input
                      type="datetime-local"
                      required
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white">Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as any)}
                    className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="WINNERS_CREEK">Winners Creek Native Classroom</option>
                    <option value="GOOGLE_MEET">Google Meet</option>
                    <option value="ZOOM">Zoom</option>
                  </select>
                </div>

                {provider !== 'WINNERS_CREEK' && (
                  <div>
                    <label className="block text-xs font-semibold text-white">Meeting URL *</label>
                    <input
                      type="url"
                      required
                      value={meetingUrl}
                      onChange={(e) => setMeetingUrl(e.target.value)}
                      placeholder="https://meet.google.com/xyz-abc or Zoom link"
                      className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-white mb-1.5">
                    Invited Trainers ({selectedTrainerIds.length} selected)
                  </label>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-xl border border-white/15 bg-slate-950/80 p-2.5">
                    {trainers.length === 0 ? (
                      <p className="text-xs text-slate-300">All registered trainers will be eligible.</p>
                    ) : (
                      trainers.map((t) => {
                        const selected = selectedTrainerIds.includes(t.id);
                        return (
                          <div
                            key={t.id}
                            onClick={() => toggleTrainer(t.id)}
                            className={`flex cursor-pointer items-center justify-between rounded-lg p-2 text-xs transition ${
                              selected ? 'bg-indigo-600/40 text-white font-medium' : 'hover:bg-white/10 text-slate-200'
                            }`}
                          >
                            <span>{t.name || t.email}</span>
                            {selected && <CheckCircle2 className="size-3.5 text-indigo-400" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
                  >
                    {submitting ? 'Scheduling...' : 'Schedule Meeting'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </VisualPageBackground>
  );
}
