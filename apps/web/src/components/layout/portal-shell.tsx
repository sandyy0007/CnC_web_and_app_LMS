'use client';

import { HelpCircle, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/misc';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/store';
import { toggleSidebar } from '@/store/uiSlice';

import { ThemeToggle } from '@/components/ui/ThemeToggle';
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
      <div className="flex h-screen max-h-screen w-full overflow-hidden">
        <Sidebar user={user} open={sidebarOpen} onClose={() => dispatch(toggleSidebar(false))} />

        <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
          <header className="shrink-0 z-20 flex items-center gap-3 border-b border-line/80 dark:border-white/10 bg-header/90 px-4 py-3 backdrop-blur-2xl sm:px-6 sm:py-3.5 shadow-xs">
            <button
              type="button"
              onClick={() => dispatch(toggleSidebar(true))}
              aria-label="Open navigation"
              className="flex size-[36px] shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-1 transition-all hover:bg-surface-hover hover:shadow-xs active:scale-95 lg:hidden"
            >
              <Menu className="size-4" aria-hidden />
            </button>

            {/* Mobile branding */}
            <div className="flex items-center lg:hidden">
              <Link href={user.home || '/'} className="flex items-center" aria-label="Winners Creek home">
                <WinnersCreekLogo variant="compact" />
              </Link>
            </div>

            <form
              role="search"
              className="relative hidden min-w-0 flex-1 sm:block sm:max-w-[420px]"
              onSubmit={(event) => event.preventDefault()}
            >
              <label htmlFor="global-search" className="sr-only">
                {searchPlaceholder}
              </label>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3 transition-colors peer-focus:text-indigo-500"
                aria-hidden
              />
              <Input
                id="global-search"
                type="search"
                placeholder={searchPlaceholder}
                className="rounded-xl bg-surface/70 border-line text-ink-1 placeholder:text-ink-3 pl-10 transition-all duration-200 focus:bg-surface focus:border-indigo-500 focus:shadow-xs"
              />
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:gap-3.5">
              {headerSlot}
              <ThemeToggle />
              <NotificationMenu />
              <Link
                href="/contact"
                aria-label="Help"
                className="hidden size-[36px] items-center justify-center rounded-xl border border-line bg-surface text-ink-2 transition-all hover:bg-surface-hover hover:text-ink-1 hover:shadow-xs active:scale-95 sm:flex"
              >
                <HelpCircle className="size-4" aria-hidden />
              </Link>
              <ProfileMenu user={user} />
            </div>
          </header>

          <main id="main" className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-12 pt-5 sm:px-6 sm:pt-6 scroll-thin animate-enter')}>
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
