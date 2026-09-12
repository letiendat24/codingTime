'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Bell, BookOpen, Code2, FolderGit2, GraduationCap, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
import { Switch } from '../../../design-system/components/switch';
import { PageHeader } from '../../../design-system/components/page-header';
import { LoadingState } from '../../../design-system/components/loading-state';
import { ErrorState } from '../../../design-system/components/error-state';
import { type NotificationPreferences, requestJson } from '../../../lib/api';
import { queryKeys } from '../../../lib/query/keys';
import { useI18n } from '../../../providers/i18n-provider';

const preferenceConfig: readonly {
  readonly key: keyof NotificationPreferences;
  readonly label: string;
  readonly description: string;
  readonly icon: React.ReactNode;
}[] = [
  {
    key: 'learningEnabled',
    label: 'Learning & Video Progress',
    description: 'Updates when instructor snapshots are synced or lesson milestones are reached',
    icon: <BookOpen className="h-5 w-5 text-primary" />,
  },
  {
    key: 'practiceEnabled',
    label: 'Practice Challenges',
    description: 'Automated judge test suite feedback and code run results',
    icon: <Code2 className="h-5 w-5 text-primary" />,
  },
  {
    key: 'projectEnabled',
    label: 'GitHub Project Grading',
    description: 'CI/CD repository grading reports and instructor rubric reviews',
    icon: <FolderGit2 className="h-5 w-5 text-primary" />,
  },
  {
    key: 'courseEnabled',
    label: 'Course Announcements',
    description: 'New module releases, instructor notes, and course updates',
    icon: <GraduationCap className="h-5 w-5 text-primary" />,
  },
  {
    key: 'systemEnabled',
    label: 'System & Security',
    description: 'Session alerts, account security notices, and platform maintenance',
    icon: <ShieldAlert className="h-5 w-5 text-primary" />,
  },
];

export default function NotificationSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const preferences = useQuery({
    queryKey: queryKeys.notifications.preferences,
    queryFn: () => requestJson<{ preferences: NotificationPreferences }>('/notifications/preferences'),
  });

  const updatePreference = useMutation({
    mutationFn: (body: Partial<NotificationPreferences>) =>
      requestJson<{ preferences: NotificationPreferences }>('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences });
    },
  });

  const current = preferences.data?.preferences;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/notifications"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Link>
        <PageHeader
          title={t('notifications.settingsTitle')}
          description={t('notifications.settingsDescription')}
          breadcrumbs={[
            { label: 'Notifications', href: '/notifications' },
            { label: 'Preferences' },
          ]}
        />
      </div>

      {preferences.isLoading ? (
        <div className="py-12">
          <LoadingState message="Loading preferences..." />
        </div>
      ) : null}

      {preferences.isError ? (
        <ErrorState
          title={t('common.error')}
          message="Unable to load notification preferences."
          action={<button onClick={() => void preferences.refetch()}>Try Again</button>}
        />
      ) : null}

      {current ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Delivery Channels & Categories</CardTitle>
            </div>
            <CardDescription>
              Control which notification events appear in your bell drawer and notification center.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {preferenceConfig.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 p-5">
                <div className="flex items-start gap-3.5">
                  <div className="mt-0.5 rounded-lg border bg-muted/30 p-2">
                    {item.icon}
                  </div>
                  <div>
                    <span className="block font-medium text-foreground text-sm">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </div>
                </div>
                <Switch
                  checked={Boolean(current[item.key])}
                  disabled={updatePreference.isPending}
                  onCheckedChange={(checked) => updatePreference.mutate({ [item.key]: checked })}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
