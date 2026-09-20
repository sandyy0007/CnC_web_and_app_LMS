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
          <header className="shrink-0 z-20 flex items-center gap-3 border-b border-white/10 bg-slate-950/45 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-3.5 shadow-xs">
            <button
              type="button"
              onClick={() => dispatch(toggleSidebar(true))}
              aria-label="Open navigation"
              className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 active:scale-95 lg:hidden"
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
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-300 transition-colors peer-focus:text-indigo-400"
                aria-hidden
              />
              <Input
                id="global-search"
                type="search"
                placeholder={searchPlaceholder}
                className="bg-slate-900/70 border-white/15 text-white placeholder:text-slate-300 pl-9 transition-all duration-150 focus:bg-slate-900/90 focus:border-indigo-400"
              />
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:gap-3.5">
              {headerSlot}
              <NotificationMenu />
              <Link
                href="/contact"
                aria-label="Help"
                className="hidden size-[34px] items-center justify-center rounded-[9px] border border-white/15 bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 sm:flex"
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
