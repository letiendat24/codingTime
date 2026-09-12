'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { CheckCheck, Settings } from 'lucide-react';
import { Card, CardContent } from '../../design-system/components/card';
import { Button } from '../../design-system/components/button';
import { Select } from '../../design-system/components/select';
import { StatusBadge } from '../../design-system/components/status-badge';
import { EmptyState } from '../../design-system/components/empty-state';
import { ErrorState } from '../../design-system/components/error-state';
import { PageHeader } from '../../design-system/components/page-header';
import { LoadingState } from '../../design-system/components/loading-state';
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
    mutationFn: () =>
      requestJson('/notifications/read-all', {
        method: 'POST',
        body: JSON.stringify(category ? { category } : {}),
      }),
    onSuccess: invalidate,
  });

  const pagination = notifications.data?.pagination;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title={t('notifications.title')}
        description={t('notifications.description')}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Notifications' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/notifications/settings">
              <Button variant="outline" size="sm" leftIcon={<Settings className="h-4 w-4" />}>
                {t('notifications.settings')}
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              isLoading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              leftIcon={<CheckCheck className="h-4 w-4" />}
            >
              {t('notifications.markAllRead')}
            </Button>
          </div>
        }
      />

      {/* Filter toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-36">
              <Select
                value={unread}
                onChange={(event) => {
                  setUnread(event.target.value as 'all' | 'true' | 'false');
                  setPage(1);
                }}
                options={[
                  { label: t('notifications.all'), value: 'all' },
                  { label: t('notifications.unread'), value: 'true' },
                  { label: t('notifications.read'), value: 'false' },
                ]}
              />
            </div>
            <div className="w-48">
              <Select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as NotificationCategory | '');
                  setPage(1);
                }}
                options={[
                  { label: t('notifications.allCategories'), value: '' },
                  ...notificationCategories.map((c) => ({ label: c, value: c })),
                ]}
              />
            </div>
            <div className="w-48">
              <Select
                value={type}
                onChange={(event) => {
                  setType(event.target.value as NotificationType | '');
                  setPage(1);
                }}
                options={[
                  { label: t('notifications.allTypes'), value: '' },
                  ...notificationTypes.map((typ) => ({ label: typ, value: typ })),
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {notifications.isLoading ? (
        <div className="py-12">
          <LoadingState message="Loading notifications..." />
        </div>
      ) : null}

      {notifications.isError ? (
        <ErrorState
          title={t('common.error')}
          message="Unable to load notifications."
          action={<Button onClick={() => void notifications.refetch()}>Retry</Button>}
        />
      ) : null}

      <div className="space-y-3">
        {(notifications.data?.items ?? []).map((item) => {
          const href = isInternalActionUrl(item.actionUrl) ? item.actionUrl : null;
          const isUnread = !item.readAt;

          return (
            <div
              key={item.id}
              className={`relative flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4 transition-all ${
                isUnread
                  ? 'border-primary/30 bg-primary/5 shadow-2xs'
                  : 'border-border bg-card hover:bg-muted/20'
              }`}
            >
              <div className="flex items-start gap-3.5">
                {isUnread && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="neutral">{item.category}</StatusBadge>
                    <span className="font-mono text-xs text-muted-foreground">{item.type}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.message}</p>
                  <p className="text-[11px] text-muted-foreground/70">{formatDate(item.createdAt, locale)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-center sm:self-auto">
                {href ? (
                  <Link href={href}>
                    <Button size="sm" variant="outline">
                      {t('notifications.open')}
                    </Button>
                  </Link>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  isLoading={markRead.isPending || markUnread.isPending}
                  onClick={() => (item.readAt ? markUnread.mutate(item.id) : markRead.mutate(item.id))}
                >
                  {item.readAt ? t('notifications.markUnread') : t('notifications.markRead')}
                </Button>
              </div>
            </div>
          );
        })}

        {notifications.data?.items.length === 0 ? (
          <EmptyState
            title={t('notifications.empty')}
            message="You have no notifications matching the selected filter."
          />
        ) : null}
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t pt-4 text-sm">
          <span className="text-xs text-muted-foreground">
            {t('common.page')} {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1}
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              {t('common.previous')}
            </Button>
            <Button
              disabled={page >= pagination.totalPages}
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => value + 1)}
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
