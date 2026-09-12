'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { IconButton } from '../design-system';
import { type NotificationItem, type PaginatedResponse, requestJson } from '../lib/api';
import { formatRelativeTime } from '../lib/i18n/format';
import { formatUnreadCount, isInternalActionUrl, notificationListPath } from '../lib/notifications';
import { queryKeys } from '../lib/query/keys';
import { useI18n } from '../providers/i18n-provider';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const unread = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: () => requestJson<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 45_000,
    retry: false,
  });
  const recent = useQuery({
    queryKey: queryKeys.notifications.recent,
    queryFn: () => requestJson<PaginatedResponse<NotificationItem>>(notificationListPath({ limit: 6 })),
    refetchInterval: 60_000,
    retry: false,
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) => requestJson(`/notifications/${notificationId}/read`, { method: 'PATCH' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });
  const badge = formatUnreadCount(unread.data?.count ?? 0);

  return (
    <div className="relative">
      <IconButton label={t('common.notifications')} onClick={() => setOpen((value) => !value)}>
        <Bell className="h-4 w-4" />
        {badge ? (
          <span className="absolute -right-2 -top-2 rounded-full bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">
            {badge}
          </span>
        ) : null}
      </IconButton>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-md border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{t('notifications.title')}</p>
            <Link className="text-xs text-muted-foreground hover:text-foreground" href="/notifications/settings">
              {t('common.settings')}
            </Link>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {(recent.data?.items ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('notifications.empty')}</p>
            ) : (
              recent.data?.items.map((item) => {
                const href = isInternalActionUrl(item.actionUrl) ? item.actionUrl : '/notifications';

                return (
                  <Link
                    key={item.id}
                    className={`block rounded-md border p-2 text-sm hover:bg-muted ${item.readAt ? 'opacity-75' : ''}`}
                    href={href ?? '/notifications'}
                    onClick={() => {
                      markRead.mutate(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className="block font-medium">{item.title}</span>
                    <span className="line-clamp-2 text-muted-foreground">{item.message}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatRelativeTime(item.createdAt, locale)}</span>
                  </Link>
                );
              })
            )}
          </div>
          <Link
            className="mt-3 block rounded-md border px-3 py-2 text-center text-sm hover:bg-muted"
            href="/notifications"
            onClick={() => setOpen(false)}
          >
            {t('notifications.viewAll')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
