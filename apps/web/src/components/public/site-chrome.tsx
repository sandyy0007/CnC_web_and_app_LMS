'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/store';

const LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Programs', href: '/courses' },
  { label: 'eBooks', href: '/ebooks' },
  { label: 'Trainers', href: '/trainers' },
  { label: 'Announcements', href: '/announcements' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export function SiteBrand({
  tone = 'dark',
  variant = 'header',
}: {
  tone?: 'dark' | 'light';
  variant?: 'header' | 'footer';
}) {
  return (
    <Link
      href="/"
      className="inline-flex items-center transition-opacity hover:opacity-90 active:scale-95"
      aria-label="Winners Creek home"
    >
      <WinnersCreekLogo variant={variant} priority={variant === 'header'} />
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const { status, user } = useAppSelector((state) => state.auth);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/85 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/45">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-5 py-3">
        <SiteBrand variant="header" />
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
                    : 'text-ink-2 hover:bg-surface-hover hover:text-ink-1 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {status === 'authenticated' && user ? (
            <Button asChild variant="primary" size="sm">
              <Link href={user.home || '/'}>Go to my portal</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-ink-1 hover:bg-surface-hover dark:text-white dark:hover:bg-white/10">
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
            className="flex size-[34px] items-center justify-center rounded-[9px] border border-line text-ink-1 transition-transform hover:bg-surface-hover active:scale-95 dark:border-white/15 dark:text-white dark:hover:bg-white/10 lg:hidden"
          >
            {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          aria-label="Main"
          className="border-t border-line bg-card/95 px-5 py-3 space-y-1 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-200 dark:border-white/10 dark:bg-slate-950/95 lg:hidden"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-[8px] px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover hover:text-ink-1 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="block rounded-[8px] px-3 py-2.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 sm:hidden"
          >
            Sign in
          </Link>
          <div className="pt-2 mt-2 border-t border-line dark:border-white/10 flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold text-ink-2 dark:text-slate-300">Switch Theme</span>
            <ThemeToggle variant="pill" />
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-card text-ink-2 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/65 dark:text-white/80">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-11 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <SiteBrand variant="footer" />
          <p className="mt-3.5 max-w-[240px] text-sm leading-relaxed text-ink-2 dark:text-slate-300">
            Learn, Practise and Build the Skills Required for Your Career.
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3 dark:text-slate-400">Platform</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-2 dark:text-slate-300">
            <li><Link href="/courses" className="hover:text-ink-1 dark:hover:text-white transition-colors">Programs</Link></li>
            <li><Link href="/trainers" className="hover:text-ink-1 dark:hover:text-white transition-colors">Trainers</Link></li>
            <li><Link href="/announcements" className="hover:text-ink-1 dark:hover:text-white transition-colors">Announcements</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3 dark:text-slate-400">Access</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-2 dark:text-slate-300">
            <li><Link href="/login" className="hover:text-ink-1 dark:hover:text-white transition-colors">Sign in</Link></li>
            <li><Link href="/signup" className="hover:text-ink-1 dark:hover:text-white transition-colors">Create account</Link></li>
            <li><Link href="/forgot-password" className="hover:text-ink-1 dark:hover:text-white transition-colors">Reset password</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3 dark:text-slate-400">Institution</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-2 dark:text-slate-300">
            <li><Link href="/about" className="hover:text-ink-1 dark:hover:text-white transition-colors">About Winners Creek</Link></li>
            <li><Link href="/contact" className="hover:text-ink-1 dark:hover:text-white transition-colors">Contact &amp; support</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line px-5 py-4 dark:border-white/10">
        <p className="mx-auto max-w-[1180px] text-xs text-ink-3 dark:text-slate-400">
         Winners Creek provides a unified digital environment for structured learning, 
         skill development, intelligent assessment, performance insights, and professional growth.
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
