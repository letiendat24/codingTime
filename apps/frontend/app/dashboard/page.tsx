'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle, Code, PlayCircle, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, EmptyState, ErrorState, PageSkeleton } from '../../design-system';
import { useAuthGuard } from '../../features/auth/hooks/use-auth-guard';
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
  const { isLoading: authLoading } = useAuthGuard();

  const dashboard = useQuery({
    queryKey: queryKeys.learning.dashboard,
    queryFn: () => requestJson<DashboardResponse>('/learning/dashboard'),
  });

  if (authLoading || dashboard.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-6">
        <PageSkeleton />
      </main>
    );
  }

  if (dashboard.isError) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Could not load dashboard information."
          onRetry={() => void dashboard.refetch()}
        />
      </main>
    );
  }

  const resume = dashboard.data?.resumeLearning;

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t('learning.dashboardTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('learning.dashboardDescription')}
        </p>
      </div>

      {/* Continue Learning Banner */}
      {resume?.course && resume.lesson ? (
        <Card className="border-primary/40 bg-gradient-to-r from-primary/10 via-card to-card shadow-sm">
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t('learning.continueLearning')}</span>
              </div>
              <h2 className="text-lg font-bold text-foreground">{resume.course.title}</h2>
              <p className="text-xs text-muted-foreground">
                Next lesson: <span className="font-medium text-foreground">{resume.lesson.title}</span>
              </p>
            </div>
            <Link href={`/courses/${resume.course.slug}/learn`}>
              <Button size="lg" className="w-full sm:w-auto shadow-sm">
                <PlayCircle className="h-4 w-4 mr-2" />
                <span>{t('courses.startLearning')}</span>
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('learning.activeCourses')}</p>
              <p className="text-2xl font-bold text-foreground">{dashboard.data?.activeCourses ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('learning.completedCourses')}</p>
              <p className="text-2xl font-bold text-foreground">{dashboard.data?.completedCourses ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('learning.completedLessons')}</p>
              <p className="text-2xl font-bold text-foreground">{dashboard.data?.completedLessons ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t('learning.recentActivity')}</h2>
        {dashboard.data?.recentActivity && dashboard.data.recentActivity.length > 0 ? (
          <div className="space-y-3">
            {dashboard.data.recentActivity.map((activity) => (
              <Card key={activity.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Code className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {activity.type.replaceAll('_', ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.lesson?.title ?? activity.course?.title ?? 'Learning event'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(activity.createdAt, locale)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t('learning.noLearning')}
            description="Start exploring courses or practicing problems to see activity here."
            action={
              <Link href="/courses">
                <Button size="sm">{t('courses.exploreCourses')}</Button>
              </Link>
            }
          />
        )}
      </section>
    </main>
  );
}
