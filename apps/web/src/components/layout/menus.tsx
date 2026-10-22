'use client';

import { Bell, CheckCheck, HelpCircle, LogOut, Monitor, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';
import { NOTIFICATION_ICONS } from '@/lib/nav';
import { ROLE_LABEL, type Role } from '@/lib/roleRoutes';
import { useAppDispatch } from '@/store';
import { signOut, signOutEverywhere, type SessionUser } from '@/store/authSlice';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function NotificationMenu() {
  const [open, setOpen] = React.useState(false);
  const notifications = useApi<{ items: any[]; meta: { unread: number } }>(
    open ? '/notifications' : '/notifications/unread-count',
    open ? { pageSize: 8 } : undefined,
    { select: (raw) => raw },
  );

  const unread = open
    ? (notifications.data?.meta?.unread ?? 0)
    : ((notifications.data as any)?.data?.unread ?? 0);
  const items = notifications.data?.items ?? [];

  const markAllRead = async () => {
    await api.post('/notifications/read-all');
    notifications.refetch();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative flex size-[34px] items-center justify-center rounded-[9px] border border-line bg-surface text-ink-2 hover:bg-surface-hover hover:text-ink-1 transition-all active:scale-95 shadow-xs"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[17px] items-center justify-center rounded-full bg-danger px-1 text-2xs font-bold text-white shadow-sm">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-3 text-ink-1">
          <p className="text-sm font-bold text-ink-1">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Mark all read
            </button>
          )}
        </div>
        <div className="scroll-thin max-h-80 overflow-y-auto">
          {notifications.initialLoading && (
            <p className="px-3.5 py-8 text-center text-sm text-slate-400">Loading…</p>
          )}
          {!notifications.initialLoading && !items.length && (
            <p className="px-3.5 py-8 text-center text-sm text-slate-400">
              You&rsquo;re all caught up.
            </p>
          )}
          <ul>
            {items.map((item) => {
              const Icon = NOTIFICATION_ICONS[item.kind] ?? NOTIFICATION_ICONS.default;
              const body = (
                <span className="flex gap-2.5">
                  <span
                    className={cn(
                      'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px]',
                      item.read ? 'bg-white/10 text-slate-400' : 'bg-indigo-500/20 text-indigo-300',
                    )}
                    aria-hidden
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-300">{item.body}</span>
                    <span className="mt-1 block text-2xs text-slate-400">
                      {relativeTime(item.createdAt)}
                    </span>
                  </span>
                  {!item.read && (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-indigo-400" aria-label="Unread" />
                  )}
                </span>
              );
              return (
                <li key={item.id} className="border-b border-white/10 last:border-b-0">
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={async () => {
                        await api.post(`/notifications/${item.id}/read`);
                        setOpen(false);
                      }}
                      className="block px-3.5 py-3 hover:bg-white/10 transition-colors"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="px-3.5 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProfileMenu({ user }: { user: SessionUser }) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const leave = async (everywhere: boolean) => {
    await dispatch(everywhere ? signOutEverywhere() : signOut());
    router.push('/login');
  };

  const settingsHref = user.role === 'STUDENT' ? '/student/settings' : `/${user.role.toLowerCase()}/profile`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full border border-line bg-surface/80 p-[3px] pr-2.5 text-ink-1 hover:bg-surface-hover transition-all active:scale-95 shadow-xs"
      >
        <Avatar name={user.name} color={user.avatarColor} size={26} />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-semibold leading-tight text-ink-1">{user.name}</span>
          <span className="block truncate text-2xs text-ink-3">
            {ROLE_LABEL[user.role as Role]}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block font-semibold text-ink-1 text-sm">{user.name}</span>
          <span className="block text-xs text-ink-3">{user.email}</span>
          {user.departmentName && (
            <span className="mt-1 block text-2xs text-ink-3">
              {user.collegeName} › {user.departmentName}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-1 py-0.5">
          <ThemeToggle variant="menu-item" />
        </div>
        <DropdownMenuSeparator />
        {user.role === 'STUDENT' && (
          <DropdownMenuItem asChild>
            <Link href="/student/profile">
              <User aria-hidden />
              My profile &amp; plan
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={settingsHref}>
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/contact">
            <HelpCircle aria-hidden />
            Help &amp; support
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => leave(true)}>
          <Monitor aria-hidden />
          Sign out of all devices
        </DropdownMenuItem>
        <DropdownMenuItem tone="danger" onSelect={() => leave(false)}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
