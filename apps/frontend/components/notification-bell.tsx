'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Settings } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '../design-system/components/icon-button';
import { Badge } from '../design-system/components/badge';
import { type NotificationItem, type PaginatedResponse, requestJson } from '../lib/api';
import { formatRelativeTime } from '../lib/i18n/format';
import { formatUnreadCount, isInternalActionUrl, notificationListPath } from '../lib/notifications';
import { queryKeys } from '../lib/query/keys';
import { useI18n } from '../providers/i18n-provider';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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
    mutationFn: (notificationId: string) =>
      requestJson(`/notifications/${notificationId}/read`, { method: 'PATCH' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const count = unread.data?.count ?? 0;
  const badge = formatUnreadCount(count);

  return (
    <div className="relative" ref={containerRef}>
      <IconButton
        label={t('common.notifications')}
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <Bell className="h-4.5 w-4.5 text-foreground/80" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-xs">
            <span className="absolute -inset-0.5 rounded-full bg-primary/40 animate-ping opacity-60 pointer-events-none" />
            <span className="relative z-10">{badge}</span>
          </span>
        ) : null}
      </IconButton>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-84 sm:w-96 rounded-xl border bg-card p-0 shadow-xl transition-all">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{t('notifications.title')}</span>
              {count > 0 && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0.2">
                  {count} new
                </Badge>
              )}
            </div>
            <Link
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              href="/notifications/settings"
              onClick={() => setOpen(false)}
            >
              <Settings className="h-3.5 w-3.5" />
              {t('common.settings')}
            </Link>
          </div>

          <div className="max-h-96 divide-y overflow-y-auto scrollbar-thin">
            {(recent.data?.items ?? []).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
                <p>{t('notifications.empty')}</p>
              </div>
            ) : (
              recent.data?.items.map((item) => {
                const href = isInternalActionUrl(item.actionUrl) ? item.actionUrl : '/notifications';
                const isUnread = !item.readAt;

                return (
                  <Link
                    key={item.id}
                    className={`block px-4 py-3 text-sm transition-colors hover:bg-muted/50 ${
                      isUnread ? 'bg-primary/5 font-medium' : 'text-muted-foreground'
                    }`}
                    href={href ?? '/notifications'}
                    onClick={() => {
                      if (isUnread) markRead.mutate(item.id);
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs ${isUnread ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                        {item.title}
                      </span>
                      {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {item.message}
                    </p>
                    <span className="mt-1 block text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(item.createdAt, locale)}
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          <div className="border-t p-2">
            <Link
              className="block w-full rounded-lg bg-muted/40 py-2 text-center text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              href="/notifications"
              onClick={() => setOpen(false)}
            >
              {t('notifications.viewAll')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
