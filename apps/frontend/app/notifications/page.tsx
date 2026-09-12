'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, CardContent, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '../../design-system';
import {
  type NotificationCategory,
  type NotificationItem,
  type NotificationType,
  type PaginatedResponse,
  requestJson,
} from '../../lib/api';
import { formatDate } from '../../lib/i18n/format';
import { isInternalActionUrl, notificationCategories, notificationListPath, notificationTypes } from '../../lib/notifications';
import { queryKeys } from '../../lib/query/keys';
import { useI18n } from '../../providers/i18n-provider';

export default function NotificationsPage() {
  const { locale, t } = useI18n();
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState<'all' | 'true' | 'false'>('all');
  const [category, setCategory] = useState<NotificationCategory | ''>('');
  const [type, setType] = useState<NotificationType | ''>('');
  const queryClient = useQueryClient();
  const queryInput: {
    page: number;
    limit: number;
    unread?: boolean;
    category?: NotificationCategory | '';
    type?: NotificationType | '';
  } = {
    page,
    limit: 20,
    category,
    type,
  };

  if (unread !== 'all') {
    queryInput.unread = unread === 'true';
  }

  const queryPath = notificationListPath(queryInput);
  const notifications = useQuery({
    queryKey: queryKeys.notifications.list({ queryPath }),
    queryFn: () => requestJson<PaginatedResponse<NotificationItem>>(queryPath),
    refetchInterval: 60_000,
  });
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const markRead = useMutation({
    mutationFn: (notificationId: string) => requestJson(`/notifications/${notificationId}/read`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });
  const markUnread = useMutation({
    mutationFn: (notificationId: string) => requestJson(`/notifications/${notificationId}/unread`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });
  const markAllRead = useMutation({
    mutationFn: () => requestJson('/notifications/read-all', {
      method: 'POST',
      body: JSON.stringify(category ? { category } : {}),
    }),
    onSuccess: invalidate,
  });
  const pagination = notifications.data?.pagination;

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('notifications.title')}
        description={t('notifications.description')}
        actions={(
          <>
            <Link className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted" href="/notifications/settings">
              {t('notifications.settings')}
            </Link>
            <Button isLoading={markAllRead.isPending} variant="secondary" onClick={() => markAllRead.mutate()}>
              {t('notifications.markAllRead')}
            </Button>
          </>
        )}
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-3">
          <select className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={unread} onChange={(event) => {
            setUnread(event.target.value as 'all' | 'true' | 'false');
            setPage(1);
          }}>
            <option value="all">{t('notifications.all')}</option>
            <option value="true">{t('notifications.unread')}</option>
            <option value="false">{t('notifications.read')}</option>
          </select>
          <select className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={category} onChange={(event) => {
            setCategory(event.target.value as NotificationCategory | '');
            setPage(1);
          }}>
            <option value="">{t('notifications.allCategories')}</option>
            {notificationCategories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={type} onChange={(event) => {
            setType(event.target.value as NotificationType | '');
            setPage(1);
          }}>
            <option value="">{t('notifications.allTypes')}</option>
            {notificationTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </CardContent>
      </Card>

      {notifications.isLoading ? <PageSkeleton /> : null}
      {notifications.isError ? <ErrorState title={t('common.error')} description="Unable to load notifications." onRetry={() => void notifications.refetch()} /> : null}

      <div className="space-y-3">
        {(notifications.data?.items ?? []).map((item) => {
          const href = isInternalActionUrl(item.actionUrl) ? item.actionUrl : null;

          return (
            <Card key={item.id} className={item.readAt ? undefined : 'bg-muted/40'}>
              <CardContent>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <StatusBadge value={item.category} />
                      <StatusBadge value={item.type} />
                      {!item.readAt ? <StatusBadge value={t('notifications.unread')} /> : null}
                    </div>
                    <h2 className="font-semibold">{item.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{formatDate(item.createdAt, locale)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {href ? (
                      <Link className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted" href={href}>
                        {t('notifications.open')}
                      </Link>
                    ) : null}
                    <Button
                      isLoading={markRead.isPending || markUnread.isPending}
                      size="sm"
                      variant="secondary"
                      onClick={() => item.readAt ? markUnread.mutate(item.id) : markRead.mutate(item.id)}
                    >
                      {item.readAt ? t('notifications.markUnread') : t('notifications.markRead')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {notifications.data?.items.length === 0 ? <EmptyState title={t('notifications.empty')} /> : null}
      </div>

      {pagination ? (
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('common.page')} {pagination.page} / {pagination.totalPages}</span>
          <div className="flex gap-2">
            <Button disabled={page <= 1} variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))}>
              {t('common.previous')}
            </Button>
            <Button disabled={page >= pagination.totalPages} variant="secondary" onClick={() => setPage((value) => value + 1)}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
