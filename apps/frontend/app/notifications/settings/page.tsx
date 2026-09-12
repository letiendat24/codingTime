'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, ErrorState, PageHeader, PageSkeleton } from '../../../design-system';
import { type NotificationPreferences, requestJson } from '../../../lib/api';
import { queryKeys } from '../../../lib/query/keys';
import { useI18n } from '../../../providers/i18n-provider';

const preferenceFields: readonly { readonly key: keyof NotificationPreferences; readonly label: string }[] = [
  { key: 'learningEnabled', label: 'Learning' },
  { key: 'practiceEnabled', label: 'Practice' },
  { key: 'projectEnabled', label: 'Project' },
  { key: 'courseEnabled', label: 'Course' },
  { key: 'systemEnabled', label: 'System' },
];

export default function NotificationSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const preferences = useQuery({
    queryKey: queryKeys.notifications.preferences,
    queryFn: () => requestJson<{ preferences: NotificationPreferences }>('/notifications/preferences'),
  });
  const updatePreference = useMutation({
    mutationFn: (body: Partial<NotificationPreferences>) => requestJson<{ preferences: NotificationPreferences }>('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences });
    },
  });
  const current = preferences.data?.preferences;

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t('notifications.settingsTitle')}
        description={t('notifications.settingsDescription')}
        actions={(
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted" href="/notifications">
            {t('common.back')}
          </Link>
        )}
      />
      {preferences.isLoading ? <PageSkeleton /> : null}
      {preferences.isError ? <ErrorState title={t('common.error')} description="Unable to load notification preferences." onRetry={() => void preferences.refetch()} /> : null}
      {current ? (
        <Card>
          <CardContent className="divide-y p-0">
            {preferenceFields.map((field) => (
              <label key={field.key} className="flex items-center justify-between gap-4 p-4">
                <span>
                  <span className="block font-medium">{field.label}</span>
                  <span className="text-sm text-muted-foreground">{field.label} notifications</span>
                </span>
                <input
                  checked={Boolean(current[field.key])}
                  className="h-5 w-5 accent-primary"
                  disabled={updatePreference.isPending}
                  type="checkbox"
                  onChange={(event) => updatePreference.mutate({ [field.key]: event.target.checked })}
                />
              </label>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
