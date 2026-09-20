'use client';

import { ArrowRight, Layers, ShieldCheck, Target, Users } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';

const PRINCIPLES = [
  {
    icon: Target,
    title: 'Practise before it counts',
    body: 'Interviews, group discussions and presentations are rehearsed in the platform, so a participant’s first real attempt is not their first attempt.',
  },
  {
    icon: Layers,
    title: 'Assessment with evidence',
    body: 'Every AI score quotes the sentence it came from, and every trainer rating is attributable to a named trainer, a parameter and a moment in time.',
  },
  {
    icon: Users,
    title: 'One method across the institution',
    body: '95+ parameters across seven pillars mean a “7 out of 10” means the same thing in every department.',
  },
  {
    icon: ShieldCheck,
    title: 'Scoped by design',
    body: 'A trainer sees their batches. A SPOC sees one department. An admin sees one college. That boundary is enforced by the server on every single request, not by hiding menu items.',
  },
];

export default function AboutPage() {
  return (
    <GlobalPageBackground
      image="/images/backgrounds/colleges.webp"
      variant="dark"
      orbTone="indigo"
      className="min-h-screen py-12 px-4"
    >
      <div className="mx-auto max-w-[960px]">
        <h1 className="font-serif heading-section font-semibold tracking-tight text-white">
          Employability, treated like a subject
        </h1>
        <p className="mt-4 text-base sm:text-lg leading-relaxed text-slate-300">
          Winners Creek is a parallel platform for the part of a degree that rarely gets a syllabus:
          communication, confidence, teamwork, aptitude, interview craft and workplace behaviour. It
          sits alongside the academic LMS rather than replacing it — marks, curriculum attendance and
          examinations stay in the college’s system of record. What lives here is practice,
          assessment and measured improvement.
        </p>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-slate-400">
          How the platform thinks
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {PRINCIPLES.map((item) => (
            <Card key={item.title} className="card-interactive group transition-all duration-200 hover:-translate-y-1 hover:border-indigo-400/50">
              <CardBody className="p-6">
                <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-200">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 heading-card text-white group-hover:text-indigo-400 transition-colors">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Who uses it
        </h2>
        <dl className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md shadow-card">
          {[
            ['Students', 'Learn, practise, take assessments, watch a readiness score move and see exactly what to fix next.'],
            ['Trainers', 'Run classes, mark attendance, rate students on the parameter set, set assignments and see who is slipping.'],
            ['Heads of Department', 'One department, end to end: participants, attendance, trainers, assessments, certificates, enrollment, reports and an audit trail.'],
            ['Institution admins', 'Departments, batches, semesters, users, roles, bulk imports, placements, certificates and system usage for one college.'],
            ['Placement cell, recruiters, parents', 'Reserved, architecture-ready portals provisioned per institution.'],
          ].map(([who, what]) => (
            <div key={who} className="grid gap-1 px-5 py-4 transition-colors hover:bg-white/5 sm:grid-cols-[190px_1fr] sm:gap-4">
              <dt className="text-sm font-semibold text-white">{who}</dt>
              <dd className="text-sm leading-relaxed text-slate-300">{what}</dd>
            </div>
          ))}
        </dl>

        <Card className="mt-10 border border-white/15 bg-navy-950/80 backdrop-blur-md text-white shadow-card-hover transition-all duration-300">
          <CardBody className="flex flex-wrap items-center justify-between gap-5 p-7">
            <p className="min-w-[240px] flex-1 font-serif text-[20px] font-semibold">
              Practise → Assess → Improve → Become Employable
            </p>
            <InteractiveArrowButton
              href="/courses"
              variant="gradient"
              size="md"
            >
              See the programs
            </InteractiveArrowButton>
          </CardBody>
        </Card>
      </div>
    </GlobalPageBackground>
  );
}
