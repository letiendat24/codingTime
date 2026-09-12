'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, GraduationCap, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, EmptyState, ErrorState, PageSkeleton, StatusBadge } from '../../design-system';
import { useAuthGuard } from '../../features/auth/hooks/use-auth-guard';
import { type EnrollmentSummary, requestJson } from '../../lib/api';
import { formatDate } from '../../lib/i18n/format';
import { useI18n } from '../../providers/i18n-provider';

interface MyCoursesResponse {
  readonly items: readonly EnrollmentSummary[];
}

export default function MyCoursesPage() {
  const { locale, t } = useI18n();
  const { isLoading: authLoading } = useAuthGuard();

  const courses = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => requestJson<MyCoursesResponse>('/users/me/courses'),
  });

  if (authLoading || courses.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-6">
        <PageSkeleton />
      </main>
    );
  }

  if (courses.isError) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Could not load your enrolled courses."
          onRetry={() => void courses.refetch()}
        />
      </main>
    );
  }

  const inProgress = courses.data?.items.filter((item) => item.status !== 'COMPLETED') ?? [];
  const completed = courses.data?.items.filter((item) => item.status === 'COMPLETED') ?? [];

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t('courses.myCoursesTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your progress and continue learning your enrolled courses.
        </p>
      </div>

      {courses.data?.items.length === 0 ? (
        <EmptyState
          title={t('courses.noActiveCourses')}
          description="Browse our course catalog and start learning today."
          action={
            <Link href="/courses">
              <Button>
                <BookOpen className="h-4 w-4 mr-2" />
                <span>{t('courses.exploreCourses')}</span>
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {inProgress.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span>{t('courses.inProgress')}</span>
                <Badge tone="info">{inProgress.length}</Badge>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {inProgress.map((item) => (
                  <EnrolledCourseCard key={item.enrollmentId} item={item} locale={locale} />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span>{t('courses.completed')}</span>
                <Badge tone="success">{completed.length}</Badge>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {completed.map((item) => (
                  <EnrolledCourseCard key={item.enrollmentId} item={item} locale={locale} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function EnrolledCourseCard({
  item,
  locale,
}: {
  readonly item: EnrollmentSummary;
  readonly locale: 'vi' | 'en';
}) {
  const { t } = useI18n();
  const isCompleted = item.status === 'COMPLETED';

  return (
    <Card className="flex flex-col justify-between hover:border-primary/40 transition-all shadow-xs">
      <CardContent className="p-5 flex flex-col justify-between h-full">
        <div>
          <div className="flex items-start justify-between gap-2">
            <Badge tone="info" className="text-[10px]">
              Course
            </Badge>
            <StatusBadge value={item.status} />
          </div>

          <Link href={`/courses/${item.course.slug}/learn`}>
            <h3 className="mt-2 text-base font-semibold text-foreground hover:text-primary transition-colors line-clamp-1">
              {item.course.title}
            </h3>
          </Link>

          <p className="mt-1 text-xs text-muted-foreground">
            Enrolled {formatDate(item.enrolledAt, locale)}
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>
              {t('courses.lessons', { completed: item.completedLessons, total: item.totalLessons })}
            </span>
            <span className="font-semibold text-foreground">{item.progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
            <div
              className={`h-full ${isCompleted ? 'bg-emerald-500' : 'bg-primary'} transition-all`}
              style={{ width: `${item.progressPercent}%` }}
            />
          </div>

          <Link href={`/courses/${item.course.slug}/learn`}>
            <Button size="sm" variant={isCompleted ? 'secondary' : 'primary'} className="w-full">
              {isCompleted ? (
                <>
                  <GraduationCap className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t('courses.review')}</span>
                </>
              ) : (
                <>
                  <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t('courses.continueLearning')}</span>
                </>
              )}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
