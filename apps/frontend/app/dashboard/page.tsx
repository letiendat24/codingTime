'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, EmptyState, ErrorState, PageHeader, PageSkeleton } from '../../design-system';
import { type LearningActivity, type ResumeLearning, requestJson } from '../../lib/api';
import { formatDate } from '../../lib/i18n/format';
import { queryKeys } from '../../lib/query/keys';
import { useI18n } from '../../providers/i18n-provider';

interface DashboardResponse {
  readonly activeCourses: number;
  readonly completedCourses: number;
  readonly completedLessons: number;
  readonly resumeLearning: ResumeLearning;
  readonly recentActivity: readonly LearningActivity[];
}

export default function DashboardPage() {
  const { locale, t } = useI18n();
  const dashboard = useQuery({
    queryKey: queryKeys.learning.dashboard,
    queryFn: () => requestJson<DashboardResponse>('/learning/dashboard'),
  });
  const resume = dashboard.data?.resumeLearning;

  if (dashboard.isLoading) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><PageSkeleton /></main>;
  }

  if (dashboard.isError) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><ErrorState title={t('common.error')} description="Login first, then retry this page." onRetry={() => void dashboard.refetch()} /></main>;
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t('learning.dashboardTitle')} description={t('learning.dashboardDescription')} />

      <Card>
        <CardContent>
        <h2 className="font-semibold">{t('learning.continueLearning')}</h2>
        {resume?.course && resume.lesson ? (
          <Link className="mt-3 block text-primary" href={`/courses/${resume.course.slug}/learn`}>
            {resume.course.title} · {resume.lesson.title} · {resume.progress?.coursePercent ?? 0}%
          </Link>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('learning.noLearning')}</p>
        )}
        </CardContent>
      </Card>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card><CardContent>
          <p className="text-sm text-muted-foreground">{t('learning.activeCourses')}</p>
          <p className="mt-2 text-2xl font-semibold">{dashboard.data?.activeCourses ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-sm text-muted-foreground">{t('learning.completedCourses')}</p>
          <p className="mt-2 text-2xl font-semibold">{dashboard.data?.completedCourses ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-sm text-muted-foreground">{t('learning.completedLessons')}</p>
          <p className="mt-2 text-2xl font-semibold">{dashboard.data?.completedLessons ?? 0}</p>
        </CardContent></Card>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">{t('learning.recentActivity')}</h2>
        <div className="mt-3 space-y-3">
          {(dashboard.data?.recentActivity ?? []).map((activity) => (
            <Card key={activity.id}>
              <CardContent>
              <p className="text-sm font-medium">{activity.type.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activity.lesson?.title ?? activity.course?.title ?? 'Learning activity'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(activity.createdAt, locale)}</p>
              </CardContent>
            </Card>
          ))}
          {dashboard.data?.recentActivity.length === 0 ? <EmptyState title={t('learning.noLearning')} /> : null}
        </div>
      </section>
    </main>
  );
}
