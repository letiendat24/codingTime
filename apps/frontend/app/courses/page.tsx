'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '../../design-system';
import { type CourseSummary, requestJson } from '../../lib/api';
import { queryKeys } from '../../lib/query/keys';
import { useI18n } from '../../providers/i18n-provider';

interface CourseListResponse {
  readonly items: readonly CourseSummary[];
}

export default function CoursesPage() {
  const { t } = useI18n();
  const courses = useQuery({
    queryKey: queryKeys.courses.all(),
    queryFn: () => requestJson<CourseListResponse>('/courses'),
  });

  if (courses.isLoading) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><PageSkeleton /></main>;
  }

  if (courses.isError) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><ErrorState title={t('common.error')} description="Could not load courses." onRetry={() => void courses.refetch()} /></main>;
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t('courses.catalogTitle')} description={t('courses.publishedCatalog')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {courses.data?.items.map((course) => (
          <Link key={course.id} href={`/courses/${course.slug}`}>
            <Card className="h-full transition-colors hover:bg-muted/60">
              <CardContent>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{course.category.name}</p>
              <StatusBadge value={course.difficulty} />
            </div>
            <h2 className="mt-1 text-xl font-semibold">{course.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{course.shortDescription}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {course.tags.slice(0, 3).map((tag) => <span key={tag.id}>#{tag.name}</span>)}
            </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {courses.data?.items.length === 0 ? <EmptyState title={t('courses.noCourses')} /> : null}
    </main>
  );
}
