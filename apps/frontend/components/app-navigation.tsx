'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type CurrentUser, requestJson } from '../lib/api';
import { navigationForRoles } from '../lib/navigation';
import { NotificationBell } from './notification-bell';

export function AppNavigation() {
  const me = useQuery({
    queryKey: ['current-user-navigation'],
    queryFn: () => requestJson<{ user: CurrentUser }>('/users/me'),
    retry: false,
  });
  const items = navigationForRoles(me.data?.user.roles ?? []);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3 text-sm">
        <Link className="font-semibold text-foreground" href="/">
          CodeSync
        </Link>
        {items.map((item) => (
          <Link key={item.href} className="text-muted-foreground hover:text-foreground" href={item.href}>
            {item.label}
          </Link>
        ))}
        <NotificationBell />
      </div>
    </nav>
  );
}
