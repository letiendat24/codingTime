'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '../../design-system';
import { type EnrollmentSummary, requestJson } from '../../lib/api';
import { formatDate } from '../../lib/i18n/format';
import { useI18n } from '../../providers/i18n-provider';

interface MyCoursesResponse {
  readonly items: readonly EnrollmentSummary[];
}

export default function MyCoursesPage() {
  const { locale, t } = useI18n();
  const courses = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => requestJson<MyCoursesResponse>('/users/me/courses'),
  });

  if (courses.isLoading) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><PageSkeleton /></main>;
  }

  if (courses.isError) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><ErrorState title={t('common.error')} description="Login first, then retry this page." onRetry={() => void courses.refetch()} /></main>;
  }

  const inProgress = courses.data?.items.filter((item) => item.status !== 'COMPLETED') ?? [];
  const completed = courses.data?.items.filter((item) => item.status === 'COMPLETED') ?? [];

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t('courses.myCoursesTitle')} description={t('learning.dashboardDescription')} />
      <CourseSection title={t('courses.inProgress')} items={inProgress} locale={locale} />
      <CourseSection title={t('courses.completed')} items={completed} locale={locale} />
      {courses.data?.items.length === 0 ? <EmptyState title={t('courses.noCourses')} /> : null}
    </main>
  );
}

function CourseSection({ title, items, locale }: Readonly<{ title: string; items: readonly EnrollmentSummary[]; locale: 'vi' | 'en' }>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <Link key={item.enrollmentId} href={`/courses/${item.course.slug}/learn`}>
            <Card className="h-full transition-colors hover:bg-muted/60">
              <CardContent>
            <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{item.course.title}</h2>
              <StatusBadge value={item.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.course.status} · {formatDate(item.enrolledAt, locale)}
            </p>
            <div className="mt-4 h-2 rounded bg-muted">
              <div className="h-2 rounded bg-primary" style={{ width: `${item.progressPercent}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.completedLessons}/{item.totalLessons} lessons · {item.progressPercent}%
            </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
