import os

files = {}

# 1. layout.tsx
files['apps/web/src/app/layout.tsx'] = """import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';

import { GlobalBackgroundProvider } from '@/components/ui/GlobalBackgroundLayer';
import { StoreProvider } from '@/store/provider';
import '@/styles/globals.css';

/**
 * Typography is declared in `globals.css` rather than fetched from a font CDN at build time.
 */

export const metadata: Metadata = {
  title: {
    default: 'Winners Creek — Learning & Education Platform',
    template: '%s · Winners Creek',
  },
  description:
    'Winners Creek is a modern learning platform connecting students, trainers, colleges and digital learning experiences.',
  robots: { index: true, follow: true },
  applicationName: 'Winners Creek',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0f19',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="relative min-h-screen antialiased selection:bg-indigo-500/30 selection:text-white">
        <StoreProvider>
          <GlobalBackgroundProvider>
            <div className="relative z-10 flex min-h-screen flex-col">
              {children}
            </div>
            <Toaster
              position="top-right"
              toastOptions={{ style: { fontSize: '13px', borderRadius: '10px' } }}
            />
          </GlobalBackgroundProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
"""

# 2. (auth)/layout.tsx
files['apps/web/src/app/(auth)/layout.tsx'] = """import { CheckCircle2, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { GradientOrb } from '@/components/ui/motion-elements';

/**
 * Unified auth layout: floating frosted-glass surfaces over the continuous tech-orbit background.
 * One consistent layout for login, signup, verification and reset flow.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 transition-transform active:scale-95"
            aria-label="Winners Creek home"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
              <GraduationCap className="size-5" aria-hidden />
            </span>
            <span className="text-base font-bold tracking-tight text-white">Winners Creek</span>
          </Link>
        </div>

        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px] rounded-2xl border border-white/15 bg-slate-900/65 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl animate-enter">
            {children}
          </div>
        </main>

        <p className="text-xs text-slate-400">
          By continuing you agree that your institution administers this account.
        </p>
      </div>

      <aside className="relative hidden border-l border-white/10 text-white lg:flex lg:flex-col lg:justify-center px-12 py-16">
        <GradientOrb color="indigo" size={450} className="-left-20 top-10 opacity-40" />
        <GradientOrb color="amber" size={320} className="-bottom-16 right-0 opacity-20" />
        <div className="relative z-10 max-w-[420px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber">
            Practise · Assess · Improve
          </p>
          <h2 className="mt-4 font-serif heading-section font-semibold leading-tight text-white">
            Learn, Practise and Build the Skills Required for Your Career.
          </h2>
          <ul className="mt-8 space-y-3.5 text-sm sm:text-base text-slate-200">
            {[
              'Mock interviews and GDs with evidence-backed AI feedback',
              '95+ trainer-rated parameters across seven pillars',
              'A readiness score that shows what to fix next',
              'Your data stays inside your college and department',
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
"""

# 3. portal-shell.tsx
files['apps/web/src/components/layout/portal-shell.tsx'] = """'use client';

import { HelpCircle, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/store';
import { toggleSidebar } from '@/store/uiSlice';

import { NotificationMenu, ProfileMenu } from './menus';
import { Sidebar } from './sidebar';

/**
 * One shell for every role-specific workspace: responsive sidebar, top bar with global search,
 * notifications, help and the profile menu (§5).
 */
export function PortalShell({
  children,
  searchPlaceholder = 'Search anything…',
  headerSlot,
}: {
  children: React.ReactNode;
  searchPlaceholder?: string;
  /** Extra header content — the HOD portal puts its `College › Department` pill here. */
  headerSlot?: React.ReactNode;
}) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);

  if (!user) return null;

  return (
    <TooltipProvider>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="flex min-h-screen">
        <Sidebar user={user} open={sidebarOpen} onClose={() => dispatch(toggleSidebar(false))} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-slate-950/45 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-3.5 shadow-xs">
            <button
              type="button"
              onClick={() => dispatch(toggleSidebar(true))}
              aria-label="Open navigation"
              className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 active:scale-95 lg:hidden"
            >
              <Menu className="size-4" aria-hidden />
            </button>

            <form
              role="search"
              className="relative hidden min-w-0 flex-1 sm:block sm:max-w-[420px]"
              onSubmit={(event) => event.preventDefault()}
            >
              <label htmlFor="global-search" className="sr-only">
                {searchPlaceholder}
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-indigo-400"
                aria-hidden
              />
              <Input
                id="global-search"
                type="search"
                placeholder={searchPlaceholder}
                className="bg-slate-900/60 border-white/15 text-white placeholder:text-slate-400 pl-9 transition-all duration-150 focus:bg-slate-900/80 focus:border-indigo-400"
              />
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:gap-3.5">
              {headerSlot}
              <NotificationMenu />
              <Link
                href="/contact"
                aria-label="Help"
                className="hidden size-[34px] items-center justify-center rounded-[9px] border border-white/15 bg-white/10 text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-95 sm:flex"
              >
                <HelpCircle className="size-4" aria-hidden />
              </Link>
              <ProfileMenu user={user} />
            </div>
          </header>

          <main id="main" className={cn('flex-1 px-4 pb-12 pt-5 sm:px-6 sm:pt-6 animate-enter')}>
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
"""

# 4. sidebar.tsx
files['apps/web/src/components/layout/sidebar.tsx'] = """'use client';

import { Lock, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { Avatar } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { NAVIGATION, PORTAL_BRAND, PORTAL_SUBTITLE } from '@/lib/nav';
import { ROLE_LABEL, type Role } from '@/lib/roleRoutes';
import type { SessionUser } from '@/store/authSlice';

export function Sidebar({
  user,
  open,
  onClose,
}: {
  user: SessionUser;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const role = user.role as Role;
  const groups = NAVIGATION[role] ?? [];
  const brand = PORTAL_BRAND[role] ?? 'Winners Creek';
  const initials = brand
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <>
      {/* Mobile drawer backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          'fixed inset-0 z-30 bg-slate-950/60 lg:hidden backdrop-blur-sm',
          open ? 'block' : 'hidden',
        )}
      />
      <aside
        aria-label="Portal navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[246px] shrink-0 flex-col px-3.5 py-5',
          'transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
          'bg-slate-950/70 text-white backdrop-blur-2xl border-r border-white/10 shadow-2xl',
        )}
      >
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-sm font-bold bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
            aria-hidden
          >
            {initials || 'WC'}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-bold leading-tight text-white">
              {brand}
            </span>
            <span className="block truncate text-2xs uppercase tracking-[0.06em] text-slate-400">
              {PORTAL_SUBTITLE[role]}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto rounded p-1 text-slate-400 hover:text-white lg:hidden"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <nav className="scroll-thin -mx-1 flex-1 overflow-y-auto px-1">
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? groupIndex}>
              {group.label && (
                <p className="px-2.5 pb-1.5 pt-4 text-2xs uppercase tracking-[0.08em] font-semibold text-slate-400/90">
                  {group.label}
                </p>
              )}
              <ul>
                {group.items.map((item) => {
                  const active =
                    !item.locked &&
                    (pathname === item.href || pathname.startsWith(`${item.href}/`));

                  if (item.locked) {
                    return (
                      <li key={item.label}>
                        <span
                          title={item.lockReason}
                          aria-disabled="true"
                          className="mb-0.5 flex cursor-not-allowed items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-base text-slate-500"
                        >
                          <item.icon className="size-4 shrink-0 opacity-60" aria-hidden />
                          <span className="truncate">{item.label}</span>
                          <Lock className="ml-auto size-3 shrink-0" aria-hidden />
                          <span className="sr-only">— {item.lockReason}</span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group relative mb-1 flex items-center gap-[11px] rounded-xl px-3 py-2.5',
                          'text-sm font-medium transition-all duration-200 active:scale-[0.98]',
                          active
                            ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white font-semibold shadow-md shadow-indigo-500/30'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        {/* Hover bubble accent */}
                        <span
                          className={cn(
                            'pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-200 opacity-0 group-hover:opacity-100',
                            !active && 'bg-indigo-500/15',
                          )}
                          aria-hidden
                        />
                        <item.icon
                          className="relative z-10 size-4 shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:translate-x-0.5 text-slate-400 group-hover:text-white"
                          aria-hidden
                        />
                        <span className="relative z-10 truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="flex items-center gap-2.5 px-1.5 py-2">
            <Avatar name={user.name} color={user.avatarColor} size={30} />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">
                {user.name}
              </span>
              <span className="block truncate text-2xs text-slate-400">
                {ROLE_LABEL[role]}
              </span>
            </div>
          </div>
          {role === 'HOD' && (
            <p className="px-1.5 pb-1 pt-1.5 text-2xs leading-relaxed text-slate-400/80">
              Data isolation active
              <br />
              College + Department scoped server-side on every request.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
"""

# 5. site-chrome.tsx
files['apps/web/src/components/public/site-chrome.tsx'] = """'use client';

import { GraduationCap, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/store';

const LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Programs', href: '/courses' },
  { label: 'Trainers', href: '/trainers' },
  { label: 'Announcements', href: '/announcements' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export function SiteBrand({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Winners Creek home">
      <span className="flex size-8 items-center justify-center rounded-[9px] bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
        <GraduationCap className="size-[18px]" aria-hidden />
      </span>
      <span className="leading-tight">
        <span
          className={cn(
            'block text-[15px] font-semibold tracking-tight',
            tone === 'light' ? 'text-white' : 'text-white',
          )}
        >
          Winners Creek
        </span>
        <span
          className={cn(
            'block text-2xs',
            tone === 'light' ? 'text-white/60' : 'text-slate-400',
          )}
        >
          Employability &amp; Soft Skills
        </span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const { status, user } = useAppSelector((state) => state.auth);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/45 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-5 py-3">
        <SiteBrand tone="light" />
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1.5 lg:flex">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-[8px] px-3 py-1.5 text-sm font-medium transition-all duration-150 active:scale-95',
                  active
                    ? 'bg-indigo-600 font-semibold text-white shadow-sm shadow-indigo-600/30'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {status === 'authenticated' && user ? (
            <Button asChild variant="primary" size="sm">
              <Link href={user.home || '/'}>Go to my portal</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-white hover:bg-white/10">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="primary" size="sm" className="shadow-md shadow-indigo-600/30">
                <Link href="/signup">Create account</Link>
              </Button>
            </>
          )}
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex size-[34px] items-center justify-center rounded-[9px] border border-white/15 text-white transition-transform hover:bg-white/10 active:scale-95 lg:hidden"
          >
            {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          aria-label="Main"
          className="border-t border-white/10 bg-slate-950/95 px-5 py-3 space-y-1 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-200 lg:hidden"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-[8px] px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="block rounded-[8px] px-3 py-2.5 text-sm font-semibold text-indigo-400 sm:hidden"
          >
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-slate-950/65 backdrop-blur-xl text-white/80">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-11 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <SiteBrand tone="light" />
          <p className="mt-3.5 max-w-[240px] text-sm leading-relaxed text-slate-300">
            Learn, Practise and Build the Skills Required for Your Career.
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Platform</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li><Link href="/courses" className="hover:text-white transition-colors">Programs</Link></li>
            <li><Link href="/trainers" className="hover:text-white transition-colors">Trainers</Link></li>
            <li><Link href="/announcements" className="hover:text-white transition-colors">Announcements</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Access</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li><Link href="/login" className="hover:text-white transition-colors">Sign in</Link></li>
            <li><Link href="/signup" className="hover:text-white transition-colors">Create account</Link></li>
            <li><Link href="/forgot-password" className="hover:text-white transition-colors">Reset password</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Institution</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li><Link href="/about" className="hover:text-white transition-colors">About Winners Creek</Link></li>
            <li><Link href="/contact" className="hover:text-white transition-colors">Contact &amp; support</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-4">
        <p className="mx-auto max-w-[1180px] text-xs text-slate-400">
          Winners Creek runs alongside your academic LMS — it does not replace it. Academic marks and
          attendance stay in your college&apos;s system of record.
        </p>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
"""

# 6. courses/page.tsx
files['apps/web/src/app/(public)/courses/page.tsx'] = """'use client';

import * as React from 'react';

import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/shared/state';
import { SearchInput } from '@/components/shared/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CourseCard } from '@/components/ui/CourseCard';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

export default function CoursesPage() {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');

  const { data, error, initialLoading, refetch } = useApi<{ items: any[]; categories: string[] }>(
    '/home/courses',
    { search, category, limit: 50 },
    { select: (raw) => ({ items: raw.data, categories: raw.meta?.categories ?? [] }) },
  );

  return (
    <div className="animate-enter pb-16">
      {/* ------------------------------------------------------------------ hero */}
      <section className="relative text-white py-12 sm:py-16">
        <div className="relative mx-auto max-w-[1180px] px-5">
          <Badge tone="indigo" className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium px-3 py-1">
            Structured Curriculum
          </Badge>
          <h1 className="mt-4 font-serif heading-hero text-white max-w-[700px]">
            Explore Employability Programs
          </h1>
          <p className="mt-4 max-w-[620px] text-base sm:text-lg leading-relaxed text-white/80">
            Every program is an outcome-driven path: structured modules, real-world practice, and
            objective evaluations that calculate your true readiness score.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ content */}
      <div className="mx-auto max-w-[1180px] px-5 pt-10">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-line-soft">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search programs…"
            className="w-full sm:w-[320px]"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            {['all', ...(data?.categories ?? [])].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95',
                  category === item
                    ? 'border-indigo bg-indigo text-white shadow-xs'
                    : 'border-line bg-card text-ink-2 hover:bg-slate-50 hover:border-line-soft',
                )}
              >
                {item === 'all' ? 'All Programs' : item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          {initialLoading ? (
            <LoadingSkeleton variant="cards" />
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !data?.items?.length ? (
            <div className="pt-6">
              <EmptyState
                title="No programs match that search"
                body="Try a different keyword, or clear the category filter."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setCategory('all');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((course) => (
                <CourseCard
                  key={course.id}
                  id={course.id}
                  slug={course.slug}
                  title={course.title}
                  description={course.description}
                  category={course.category}
                  courseMode={course.courseMode}
                  difficulty={course.difficulty}
                  durationHours={course.durationHours}
                  stage={course.stage}
                  icon={course.icon}
                  image="/images/backgrounds/courses.webp"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
"""

# 7. trainers/page.tsx
files['apps/web/src/app/(public)/trainers/page.tsx'] = """'use client';

import * as React from 'react';
import { SearchInput } from '@/components/shared/filter-bar';
import { AsyncSection, EmptyState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

export default function PublicTrainersPage() {
  const query = useApi<any[]>('/home/trainers', { limit: 50 });
  const [search, setSearch] = React.useState('');
  const [selectedDept, setSelectedDept] = React.useState('all');

  return (
    <div className="animate-enter pb-16">
      {/* ------------------------------------------------------------------ hero */}
      <section className="relative text-white py-12 sm:py-16">
        <div className="relative mx-auto max-w-[1180px] px-5">
          <Badge tone="indigo" className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium px-3 py-1">
            Institution Faculty
          </Badge>
          <h1 className="mt-4 font-serif heading-hero text-white max-w-[700px]">
            Expert Trainers Who Mentor & Assess You
          </h1>
          <p className="mt-4 max-w-[640px] text-base sm:text-lg leading-relaxed text-white/80">
            Your own faculty members rate every parameter on evidence, never an anonymous
            algorithm. Direct mentorship across core domains.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ trainers grid */}
      <div className="mx-auto max-w-[1180px] px-5 pt-10">
        <AsyncSection query={query} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
          {(allTrainers) => {
            const departments = Array.from(
              new Set(allTrainers.map((t) => t.department).filter(Boolean)),
            ) as string[];

            const filtered = allTrainers.filter((trainer) => {
              const matchesDept =
                selectedDept === 'all' || trainer.department === selectedDept;
              const term = search.toLowerCase().trim();
              const matchesSearch =
                !term ||
                trainer.name?.toLowerCase().includes(term) ||
                trainer.department?.toLowerCase().includes(term) ||
                trainer.designation?.toLowerCase().includes(term) ||
                trainer.expertise?.some((e: string) => e.toLowerCase().includes(term));
              return matchesDept && matchesSearch;
            });

            return (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-line-soft">
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search faculty by name or skill…"
                    className="w-full sm:w-[320px]"
                  />
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by department">
                    <button
                      type="button"
                      onClick={() => setSelectedDept('all')}
                      className={cn(
                        'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150',
                        selectedDept === 'all'
                          ? 'border-indigo bg-indigo text-white shadow-xs'
                          : 'border-line bg-card text-ink-2 hover:bg-slate-50',
                      )}
                    >
                      All Departments ({allTrainers.length})
                    </button>
                    {departments.map((dept) => (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setSelectedDept(dept)}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150',
                          selectedDept === dept
                            ? 'border-indigo bg-indigo text-white shadow-xs'
                            : 'border-line bg-card text-ink-2 hover:bg-slate-50',
                        )}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <div className="pt-10">
                    <EmptyState
                      title="No trainers match that filter"
                      body="Try searching with different terms or select 'All Departments'."
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSearch('');
                            setSelectedDept('all');
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {filtered.map((trainer) => (
                      <Card
                        key={trainer.id}
                        className="card-interactive group flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-card-hover"
                      >
                        <CardBody className="p-5 flex flex-col h-full">
                          <div className="flex items-center gap-3">
                            <Avatar name={trainer.name} color={trainer.avatarColor} size={48} />
                            <div className="min-w-0 flex-1">
                              <h2 className="text-base font-semibold text-ink-1 group-hover:text-indigo-600 transition-colors truncate">
                                {trainer.name}
                              </h2>
                              <p className="text-xs font-medium text-ink-3 truncate">{trainer.department}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs font-medium text-indigo-600 uppercase tracking-wide">
                            {trainer.designation}
                          </p>
                          {trainer.bio && (
                            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-2">
                              {trainer.bio}
                            </p>
                          )}
                          {trainer.expertise?.length > 0 && (
                            <div className="mt-auto pt-4 flex flex-wrap gap-1.5">
                              {trainer.expertise.map((item: string) => (
                                <Badge key={item} tone="indigo">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </AsyncSection>
      </div>
    </div>
  );
}
"""

# 8. (public)/page.tsx
files['apps/web/src/app/(public)/page.tsx'] = """'use client';

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  PlayCircle,
  Quote,
  ShieldCheck,
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
              <p className="mt-4 text-xs leading-relaxed text-white/50">
                Placement cell, recruiter and parent access is provisioned by your institution.
              </p>
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
            What Winners Creek gives a student
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
              Where students improved
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
                Free access for enrolled students & faculty
              </p>
            </div>
          </div>
        </div>
      </SectionReveal>

      <HomeAssistant />
    </>
  );
}
"""

import stat

root_dir = os.path.dirname(os.path.abspath(__file__))
for rel_path, content in files.items():
    full_path = os.path.join(root_dir, rel_path.replace('/', os.sep))
    if os.path.exists(full_path):
        os.chmod(full_path, stat.S_IWRITE)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    os.chmod(full_path, stat.S_IREAD)
    print(f"Cleaned & locked (Read-Only): {rel_path}")

# Now fix globals.css cleanly
css_path = os.path.join(root_dir, 'apps', 'web', 'src', 'styles', 'globals.css')
if os.path.exists(css_path):
    os.chmod(css_path, stat.S_IWRITE)

with open(css_path, 'r', encoding='utf-8') as f:
    css_content = f.read()

split_marker = '/* ------------------------------------------------------------------ Universal Surface Rules'
arrow_marker = '/* ------------------------------------------------------------------ Arrow Bubble Micro-Interaction */'

idx1 = css_content.find(split_marker)
idx2 = css_content.find(arrow_marker)

if idx1 != -1 and idx2 != -1:
    clean_replacement = '''/* ------------------------------------------------------------------ Universal Surface Rules for Global Continuous Background */
.bg-card,
.global-dark-bg .bg-card {
  background-color: rgba(15, 23, 42, 0.72) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #f8fafc !important;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.35), 0 8px 10px -6px rgba(0, 0, 0, 0.25);
}

.text-ink-1,
.heading-1,
.heading-2,
h1,
h2,
h3,
h4,
h5,
h6 {
  color: #ffffff !important;
}

.text-ink-2,
p.subtitle {
  color: #cbd5e1 !important;
}

.text-ink-3 {
  color: #94a3b8 !important;
}

.border-line,
.border-line-soft {
  border-color: rgba(255, 255, 255, 0.10) !important;
}

.bg-app {
  background-color: rgba(15, 23, 42, 0.55) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Glass Form Inputs & Selects */
input[type="text"],
input[type="email"],
input[type="password"],
input[type="search"],
input[type="number"],
select,
textarea {
  background-color: rgba(15, 23, 42, 0.65) !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
  color: #ffffff !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

input::placeholder,
textarea::placeholder {
  color: rgba(203, 213, 225, 0.55) !important;
}

/* Glass Tables with High Contrast Data Rows */
table thead tr {
  background-color: rgba(15, 23, 42, 0.82) !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
  color: #cbd5e1 !important;
}

table tbody tr {
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #f1f5f9 !important;
  background-color: rgba(15, 23, 42, 0.4) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.08) !important;
}

/* Glass Accordions, Popovers and Modals */
[role="dialog"] {
  background-color: rgba(15, 23, 42, 0.92) !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6) !important;
}

/* Light variant readability overrides when explicitly requested */
.global-light-bg .bg-card {
  background-color: rgba(255, 255, 255, 0.85) !important;
  border-color: rgba(226, 232, 240, 0.8) !important;
  color: #0f172a !important;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
}

'''
    new_css = css_content[:idx1] + clean_replacement + css_content[idx2:]
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(new_css)
    os.chmod(css_path, stat.S_IREAD)
    print("Cleaned & locked (Read-Only): apps/web/src/styles/globals.css")
else:
    print("WARNING: Markers not found in globals.css", idx1, idx2)

print("ALL FILES CLEANED AND READ-ONLY LOCKED.")

