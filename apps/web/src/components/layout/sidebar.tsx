'use client';

import { Lock, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { Avatar } from '@/components/ui/misc';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';
import { cn } from '@/lib/cn';
import { NAVIGATION, PORTAL_SUBTITLE } from '@/lib/nav';
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
          'transition-transform lg:static lg:translate-x-0 lg:h-full lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full',
          'bg-slate-950/70 text-white backdrop-blur-2xl border-r border-white/10 shadow-2xl',
        )}
      >
        <div className="flex flex-col gap-2 px-2 pb-4">
          <div className="flex items-center justify-between">
            <Link href={user.home || '/'} className="flex items-center" aria-label="Winners Creek home">
              <WinnersCreekLogo variant="sidebar" priority />
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="rounded p-1 text-slate-400 hover:text-white lg:hidden"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center">
            <span className="inline-flex items-center rounded-md bg-white/[0.08] px-2 py-0.5 text-[11px] font-medium tracking-wide text-indigo-200 border border-white/10">
              {PORTAL_SUBTITLE[role] || 'Portal'}
            </span>
          </div>
        </div>

        {/* Scrollable nav groups */}
        <div className="flex-1 overflow-y-auto pr-1">
          {groups.map((group, groupIdx) => (
            <div key={group.label ?? groupIdx} className={groupIdx > 0 ? 'mt-5' : ''}>
              {group.label && (
                <div className="px-2 pb-1.5 text-2xs font-bold uppercase tracking-[0.08em] text-slate-300">
                  {group.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    item.href === user.home
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={`${group.label || 'nav'}-${item.label}-${item.href}`}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'group flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-base font-medium transition-colors',
                          active
                            ? 'bg-white/15 text-white font-semibold shadow-xs border border-white/10'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white',
                          item.locked && 'opacity-60 cursor-not-allowed',
                        )}
                      >
                        <Icon
                          className={cn(
                            'size-4 shrink-0 transition-colors',
                            active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200',
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{item.label}</span>
                        {item.locked && (
                          <Lock className="ml-auto size-3 text-slate-400" aria-hidden />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* User bar at bottom */}
        <div className="border-t border-white/10 pt-3">
          <div className="flex items-center gap-2.5 rounded-[9px] p-2 hover:bg-white/5 transition-colors">
            <Avatar name={user.name} size={32} />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">
                {user.name}
              </span>
              <span className="block truncate text-2xs text-slate-300">
                {ROLE_LABEL[role] ?? role}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
