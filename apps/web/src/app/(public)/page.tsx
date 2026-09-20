'use client';

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  PlayCircle,
  Quote,
  ShieldCheck,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { WinnersCreekIntro } from '@/components/intro/WinnersCreekIntro';
import { HomeAssistant } from '@/components/public/assistant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { Avatar } from '@/components/ui/misc';
import {
  GradientOrb,
  SectionReveal,
  GlassCard,
  StatCounter,
} from '@/components/ui/motion-elements';
import { ProgressBar } from '@/components/shared/progress-bits';
import { useApi } from '@/hooks/useApi';
import { formatDate } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { useAppSelector } from '@/store';

interface Overview {
  productName: string;
  tagline: string;
  philosophy: string[];
  description: string;
  pillars: { code: string; title: string; body: string; icon: string }[];
  roleAccess: { role: string; label: string; href: string }[];
}

interface Stats {
  learners: number;
  trainers: number;
  institutions: number;
  courses: number;
  practiceSessionsScored: number;
  certificatesIssued: number;
  averageReadinessScore: number;
  source: string;
}

export default function HomePage() {
  const overview = useApi<Overview>('/home/overview');
  const stats = useApi<Stats>('/home/stats');
  const courses = useApi<any[]>('/home/courses', { limit: 6 });
  const ebooks = useApi<any[]>('/home/ebooks', { limit: 4 });
  const trainers = useApi<any[]>('/home/trainers');
  const announcements = useApi<any[]>('/home/announcements', { limit: 4 });
  const faqs = useApi<any[]>('/home/faqs');
  const testimonials = useApi<any>('/home/testimonials', undefined, {
    select: (raw) => ({ items: raw.data, notice: raw.meta?.notice }),
  });

  const user = useAppSelector((state) => state.auth.user);
  const isStudent = user?.role === 'STUDENT';
  const continueLearning = useApi<any>('/home/continue-learning', undefined, {
    enabled: isStudent,
  });

  const data = overview.data;

  return (
    <>
      <WinnersCreekIntro />
      {/* ------------------------------------------------------------------ hero */}
      <section className="relative text-white">
        <div className="relative mx-auto grid max-w-[1180px] gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[1.15fr_.85fr] lg:py-24 items-center">
          <div>
            <Badge tone="amber" className="bg-amber-50/95 font-medium px-3 py-1 shadow-sm">
              Runs alongside your academic LMS
            </Badge>
            <h1 className="mt-5 max-w-[660px] font-serif heading-hero text-white">
              {data?.tagline ?? 'Learn, Practise and Build the Skills Required for Your Career.'}
            </h1>
            <p className="mt-5 max-w-[560px] text-base sm:text-lg leading-relaxed text-white/80 font-normal">
              {data?.description ??
                'A college-focused soft-skills, personality development and employability platform.'}
            </p>

            <ol className="mt-8 flex flex-wrap items-center gap-x-2.5 gap-y-3">
              {(data?.philosophy ?? ['Practise', 'Assess', 'Improve', 'Become Employable']).map(
                (step, index, all) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="flex items-center gap-2.5 rounded-full border border-white/20 bg-white/[0.08] px-4 py-1.5 text-sm font-semibold backdrop-blur-md shadow-sm transition-all hover:bg-white/[0.14] hover:border-white/35">
                      <span className="flex size-5 items-center justify-center rounded-full bg-amber text-xs font-bold text-navy-950">
                        {index + 1}
                      </span>
                      {step}
                    </span>
                    {index < all.length - 1 && (
                      <ArrowRight className="size-4 text-white/40" aria-hidden />
                    )}
                  </li>
                ),
              )}
            </ol>

            <div className="mt-9 flex flex-wrap items-center gap-3.5">
              <InteractiveArrowButton
                href={user ? user.home : '/signup'}
                variant="gradient"
                size="lg"
                className="shadow-lg shadow-indigo-600/30"
              >
                {user ? 'Go to my portal' : 'Get started'}
              </InteractiveArrowButton>
              <InteractiveArrowButton
                href="/courses"
                variant="glass"
                size="lg"
                className="border border-white/25 bg-white/[0.08] hover:bg-white/15"
              >
                Browse programs
              </InteractiveArrowButton>
            </div>

            <p className="mt-7 flex items-center gap-2 text-xs font-medium text-white/60">
              <ShieldCheck className="size-4 text-amber" aria-hidden />
              Institution-scoped: you only ever see your own college and department.
            </p>
          </div>

          {/* Role entry points — modern glass card */}
          <div className="relative self-start">
            <GlassCard glow className="p-6 border-white/20 bg-slate-900/60 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <p className="text-xs font-bold uppercase tracking-wider text-amber">
                  Sign in to your portal
                </p>
                <span className="inline-flex size-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="mt-4 grid gap-2.5">
                {(data?.roleAccess ?? []).map((entry) => (
                  <Link
                    key={entry.role}
                    href={user ? entry.href : `/login?role=${entry.role}`}
                    className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3.5 text-sm font-medium text-white transition-all duration-200 hover:border-indigo-400/50 hover:bg-white/[0.14] hover:shadow-lg active:scale-[0.98]"
                  >
                    <span className="font-semibold">{entry.label}</span>
                    <ArrowRight className="size-4 text-white/50 transition-transform duration-200 group-hover:translate-x-1.5 group-hover:text-amber" aria-hidden />
                  </Link>
                ))}
                {overview.initialLoading &&
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-xl bg-white/[0.07]" />
                  ))}
              </div>
              
            </GlassCard>
          </div>
        </div>

        {/* ------------------------------------------------------------ live stats */}
        <div className="relative border-y border-white/15 bg-slate-950/40 backdrop-blur-md">
          <dl className="mx-auto grid max-w-[1180px] grid-cols-2 gap-4 px-5 py-8 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Learners', value: stats.data ? stats.data.learners : null, suffix: '' },
              { label: 'Trainers', value: stats.data ? stats.data.trainers : null, suffix: '' },
              { label: 'Institutions', value: stats.data ? stats.data.institutions : null, suffix: '' },
              { label: 'Programs', value: stats.data ? stats.data.courses : null, suffix: '' },
              { label: 'Certificates', value: stats.data ? stats.data.certificatesIssued : null, suffix: '' },
              {
                label: 'Avg. readiness',
                value: stats.data ? stats.data.averageReadinessScore : null,
                suffix: '%',
                decimals: 1,
              },
            ].map((item) => (
              <StatCounter
                key={item.label}
                label={item.label}
                value={item.value}
                suffix={item.suffix}
                decimals={item.decimals ?? 0}
                className="px-2"
              />
            ))}
          </dl>
          <div className="mx-auto max-w-[1180px] px-5 pb-5">
            <p className="inline-flex items-center gap-1.5 text-2xs font-medium text-white/45">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Counted live from the platform database — not marketing figures.
            </p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- continue learning (student) */}
      {isStudent && continueLearning.data && (
        <SectionReveal className="mx-auto max-w-[1180px] px-5 pt-10">
          <Card className="border-indigo-100 bg-indigo-50/60 shadow-sm transition-all hover:shadow-card">
            <CardBody className="flex flex-wrap items-center gap-4 p-5">
              <span className="flex size-11 items-center justify-center rounded-full bg-indigo text-white shadow-md shadow-indigo-500/20">
                <PlayCircle className="size-6" aria-hidden />
              </span>
              <div className="min-w-[200px] flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Continue where you left off
                </p>
                <p className="mt-1 text-base sm:text-lg font-semibold text-ink-1">{continueLearning.data.courseTitle}</p>
                {typeof continueLearning.data.progressPercent === 'number' && (
                  <ProgressBar
                    value={continueLearning.data.progressPercent}
                    className="mt-2.5 max-w-[340px]"
                  />
                )}
              </div>
              <Button asChild variant="primary" size="md" className="font-medium shadow-sm">
                <Link href={continueLearning.data.href ?? '/student/learning'}>Resume</Link>
              </Button>
            </CardBody>
          </Card>
        </SectionReveal>
      )}

      {/* ------------------------------------------------------------------ pillars */}
      <SectionReveal className="mx-auto max-w-[1180px] px-5 pt-16" delay={80}>
        <div className="max-w-[680px]">
          <h2 id="pillars-heading" className="font-serif heading-section text-ink-1">
            What Winners Creek gives a participant
          </h2>
          <p className="mt-3 text-base sm:text-lg leading-relaxed text-ink-2">
            Seven employability pillars, measured the same way by every trainer in your institution.
          </p>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.pillars ?? []).map((pillar) => {
            const Icon = iconFor(pillar.icon);
            return (
              <Card key={pillar.code} className="card-interactive group transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover">
                <CardBody className="p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo group-hover:bg-indigo group-hover:text-white transition-all duration-200">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 heading-card text-ink-1 group-hover:text-indigo-600 transition-colors">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{pillar.body}</p>
                </CardBody>
              </Card>
            );
          })}
          {overview.initialLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="h-[156px] animate-pulse bg-white/60" />
            ))}
        </div>
      </SectionReveal>

      {/* ------------------------------------------------------------------ programs */}
      <SectionReveal className="mx-auto max-w-[1180px] px-5 pt-16" delay={100}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[640px]">
            <h2 id="programs-heading" className="font-serif heading-section text-ink-1">
              Featured programs
            </h2>
            <p className="mt-3 text-base sm:text-lg leading-relaxed text-ink-2">
              Structured paths from foundation to interview-ready.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm" className="font-medium">
            <Link href="/courses">
              All programs
              <ArrowRight className="size-3.5 ml-1" aria-hidden />
            </Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(courses.data ?? []).map((course) => {
            const Icon = iconFor(course.icon);
            return (
              <Link key={course.id} href={`/courses/${course.slug}`} className="group">
                <Card className="h-full card-interactive transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover">
                  <CardBody className="flex h-full flex-col p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo group-hover:bg-indigo group-hover:text-white transition-all duration-200">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <Badge tone="neutral">{course.difficulty}</Badge>
                    </div>
                    <h3 className="mt-4 heading-card text-ink-1 group-hover:text-indigo-600 transition-colors">
                      {course.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-2">
                      {course.description}
                    </p>
                    <div className="mt-auto flex items-center gap-3 pt-5 text-xs font-medium text-ink-3">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5" aria-hidden />
                        {course.durationHours}h
                      </span>
                      <span>•</span>
                      <span>{course.stage}</span>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
          {courses.initialLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="h-[200px] animate-pulse bg-white/60" />
            ))}
        </div>
      </SectionReveal>

      {/* ------------------------------------------------------------------ eBooks Showcase */}
      {((ebooks.data && ebooks.data.length > 0) || ebooks.initialLoading) && (
        <SectionReveal className="mx-auto max-w-[1180px] px-5 pt-16" delay={100}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[680px]">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo">
                  <BookOpen className="size-4" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Digital Library
                </span>
              </div>
              <h2 id="ebooks-heading" className="mt-2 font-serif heading-section text-ink-1">
                Explore Winners Creek eBooks
              </h2>
              <p className="mt-2 text-base sm:text-lg leading-relaxed text-ink-2">
                Discover curated handbooks, placement playbooks, and technical references published by our community.
              </p>
            </div>
            <Button asChild variant="secondary" size="sm" className="font-medium">
              <Link href="/ebooks">
                View All eBooks
                <ArrowRight className="size-3.5 ml-1" aria-hidden />
              </Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(ebooks.data ?? []).map((book: any) => (
              <Link key={book.id} href={`/ebooks/${book.id}`} className="group">
                <Card className="h-full card-interactive flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover">
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-slate-900 flex items-center justify-center">
                    {book.coverUrl ? (
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center text-white">
                        <BookOpen className="size-10 text-indigo-400 mb-2" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                          {book.category}
                        </span>
                        <p className="mt-2 text-sm font-bold line-clamp-3">{book.title}</p>
                      </div>
                    )}
                    <div className="absolute top-2.5 right-2.5 flex flex-col gap-1 items-end">
                      {book.isPinned && (
                        <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow-xs">
                          Pinned
                        </span>
                      )}
                      {book.isFeatured && (
                        <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow-xs">
                          Featured
                        </span>
                      )}
                    </div>
                  </div>
                  <CardBody className="flex flex-1 flex-col p-4">
                    <span className="text-2xs font-bold uppercase tracking-wider text-indigo-600">
                      {book.category}
                    </span>
                    <h3 className="mt-1 text-sm font-bold text-ink-1 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {book.title}
                    </h3>
                    <p className="mt-1 text-xs text-ink-3 truncate">by {book.author}</p>
                    <p className="mt-2 text-xs text-ink-2 line-clamp-2 leading-relaxed">
                      {book.shortDescription}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-4 border-t border-line-soft text-2xs text-ink-3">
                      <span>{book.pageCount} Pages</span>
                      <div className="flex items-center gap-1 text-amber-500 font-semibold">
                        <Star className="size-3 fill-amber-500 text-amber-500" />
                        <span>{book.averageRating || '5.0'}</span>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
            {ebooks.initialLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="h-[320px] animate-pulse bg-white/60" />
              ))}
          </div>
        </SectionReveal>
      )}

      {/* ------------------------------------------------------------------ trainers */}
      <SectionReveal className="mx-auto max-w-[1180px] px-5 pt-16" delay={120}>
        <div className="max-w-[680px]">
          <h2 id="trainers-heading" className="font-serif heading-section text-ink-1">
            Trainers who assess you
          </h2>
          <p className="mt-3 text-base sm:text-lg leading-relaxed text-ink-2">
            Your own faculty — every score is attributable to a named trainer, never an anonymous
            algorithm.
          </p>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(trainers.data ?? []).slice(0, 8).map((trainer) => (
            <Card key={trainer.id} className="card-interactive group transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover">
              <CardBody className="p-5">
                <Avatar name={trainer.name} color={trainer.avatarColor} size={44} />
                <h3 className="mt-3.5 text-base font-semibold text-ink-1 group-hover:text-indigo-600 transition-colors">{trainer.name}</h3>
                <p className="text-sm font-medium text-ink-2">{trainer.designation}</p>
                <p className="mt-0.5 text-xs text-ink-3">{trainer.department}</p>
                {trainer.expertise?.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {trainer.expertise.slice(0, 3).map((item: string) => (
                      <Badge key={item} tone="indigo">{item}</Badge>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </SectionReveal>

      {/* --------------------------------------------------------------- announcements */}
      <SectionReveal className="mx-auto max-w-[1180px] px-5 pt-16" delay={120}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="news-heading" className="font-serif heading-section text-ink-1">
              Announcements
            </h2>
            <p className="mt-2 text-base text-ink-2">Official notices and department schedules.</p>
          </div>
          <Button asChild variant="secondary" size="sm" className="font-medium">
            <Link href="/announcements">All announcements</Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {(announcements.data ?? []).map((item) => (
            <Card key={item.id} className="card-interactive transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover">
              <CardBody className="p-6">
                <div className="flex items-center gap-2.5">
                  <Badge tone="info">{item.kind}</Badge>
                  <span className="flex items-center gap-1 text-xs text-ink-3">
                    <CalendarDays className="size-3.5" aria-hidden />
                    {formatDate(item.publishedAt)}
                  </span>
                </div>
                <h3 className="mt-3.5 heading-card text-ink-1">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </SectionReveal>

      {/* --------------------------------------------------------------- testimonials */}
      {testimonials.data?.items?.length > 0 && (
        <SectionReveal className="mx-auto max-w-[1180px] px-5 pt-16" delay={120}>
          <div className="max-w-[680px]">
            <h2 id="stories-heading" className="font-serif heading-section text-ink-1">
              Where participants improved
            </h2>
            {testimonials.data.notice && (
              <p className="mt-2 text-sm text-ink-3">{testimonials.data.notice}</p>
            )}
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {testimonials.data.items.map((story: any) => (
              <Card key={story.id} className="card-interactive transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover">
                <CardBody className="flex h-full flex-col p-6">
                  <Quote className="size-6 text-indigo/30" aria-hidden />
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-1 italic">&ldquo;{story.quote}&rdquo;</p>
                  <div className="mt-5 border-t border-line-soft pt-4">
                    <p className="text-sm font-semibold text-ink-1">{story.name}</p>
                    <p className="text-xs text-ink-3">{story.role}</p>
                    <p className="tnum mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Readiness {story.readinessBefore} &rarr; <span className="font-bold">{story.readinessAfter}</span>
                    </p>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </SectionReveal>
      )}

      {/* ------------------------------------------------------------------ faq */}
      <SectionReveal className="mx-auto max-w-[860px] px-5 pt-16" delay={120}>
        <h2 id="faq-heading" className="font-serif heading-section text-ink-1 text-center">
          Frequently asked
        </h2>
        <div className="mt-8 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-card shadow-card">
          {(faqs.data ?? []).map((faq) => (
            <details key={faq.id} className="group transition-colors">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-6 py-4.5 text-base font-semibold marker:content-[''] hover:bg-slate-50/50">
                {faq.question}
                <ChevronDown
                  className="size-4 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-ink-2">{faq.answer}</p>
            </details>
          ))}
        </div>
      </SectionReveal>

      {/* ------------------------------------------------------------------ cta */}
      <SectionReveal className="mx-auto my-16 max-w-[1180px] px-5" delay={120}>
        <div className="relative overflow-hidden rounded-2xl shadow-2xl border border-white/15 bg-slate-900/60 backdrop-blur-xl p-8 sm:p-12">
          <GradientOrb color="indigo" size={420} className="-right-20 -bottom-20 opacity-30" />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-8">
            <div className="max-w-[620px]">
              <Badge tone="amber" className="bg-amber-50/95 font-medium px-3 py-1 shadow-sm">
                Launch Your Career
              </Badge>
              <h2 className="mt-4 font-serif heading-section font-semibold tracking-tight text-white">
                Ready to become employable?
              </h2>
              <ul className="mt-5 space-y-2.5 text-sm sm:text-base text-white/80">
                {[
                  'Practise interviews and GDs with evidence-backed feedback',
                  'Get rated by your own trainers on 95+ parameters',
                  'Track a Communication Readiness score that actually moves',
                ].map((line) => (
                  <li key={line} className="flex items-center gap-2.5">
                    <CheckCircle2 className="size-4 shrink-0 text-amber" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col sm:items-end">
              <InteractiveArrowButton
                href={user ? user.home : '/signup'}
                variant="gradient"
                size="lg"
                className="shadow-xl shadow-indigo-600/40 px-8"
              >
                {user ? 'Open my portal' : 'Create your account'}
              </InteractiveArrowButton>
              <p className="mt-3 text-xs text-white/50 text-center sm:text-right">
                Free access for enrolled participants & faculty
              </p>
            </div>
          </div>
        </div>
      </SectionReveal>

      <HomeAssistant />
    </>
  );
}
