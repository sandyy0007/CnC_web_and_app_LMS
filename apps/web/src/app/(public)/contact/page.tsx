'use client';

import { Building2, LifeBuoy, Mail, ShieldQuestion } from 'lucide-react';
import Link from 'next/link';

import { Card, CardBody } from '@/components/ui/card';
import { InfoNotice } from '@/components/shared/misc';

const ROUTES = [
  {
    icon: LifeBuoy,
    title: 'I can’t sign in',
    body: 'Check that your email is verified. After five failed attempts an account locks briefly — wait, then try again, or reset your password.',
    action: { label: 'Reset my password', href: '/forgot-password' },
  },
  {
    icon: Building2,
    title: 'I don’t have an account yet',
    body: 'Most accounts are created by the institution. If your college has opened public registration you can sign up with your college email.',
    action: { label: 'Create an account', href: '/signup' },
  },
  {
    icon: ShieldQuestion,
    title: 'My batch, department or scores look wrong',
    body: 'Enrollment and ratings are managed by your trainers and your Head of Department. They can correct a record and the change is kept in the audit trail.',
    action: null,
  },
  {
    icon: Mail,
    title: 'Something else',
    body: 'Your institution’s Winners Creek administrator is the fastest route for account, batch and certificate questions.',
    action: null,
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[880px] px-5 py-12 animate-enter">
      <h1 className="font-serif heading-section font-semibold tracking-tight text-ink-1">
        Contact &amp; help
      </h1>
      <p className="mt-3 text-base sm:text-lg leading-relaxed text-ink-2">
        Winners Creek is operated by your institution. Support runs through your college’s programme
        office, which can act on accounts, batches and certificates directly.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {ROUTES.map((route) => (
          <Card key={route.title} className="card-interactive group transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover">
            <CardBody className="p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo group-hover:bg-indigo group-hover:text-white transition-all duration-200">
                <route.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 heading-card text-ink-1 group-hover:text-indigo-600 transition-colors">{route.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{route.body}</p>
              {route.action && (
                <Link
                  href={route.action.href}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo hover:underline transition-transform group-hover:translate-x-0.5"
                >
                  {route.action.label}
                </Link>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <InfoNotice className="mt-6" tone="info">
        <span className="font-normal">
          <strong className="font-semibold">Where your data lives — </strong>
          recordings, resumes and reports are stored privately and are only reachable through
          short-lived signed links issued to you or your trainer. Nothing in this platform is a
          public file.
        </span>
      </InfoNotice>
    </div>
  );
}
