'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, Clock, History } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, EmptyState, ErrorState, PageSkeleton } from '../../design-system';
import { useAuthGuard } from '../../features/auth/hooks/use-auth-guard';
import { type LearningActivity, requestJson } from '../../lib/api';
import { formatDate } from '../../lib/i18n/format';
import { useI18n } from '../../providers/i18n-provider';

interface LearningHistoryResponse {
  readonly items: readonly LearningActivity[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
  };
}

export default function LearningHistoryPage() {
  const { locale, t } = useI18n();
  const { isLoading: authLoading } = useAuthGuard();

  const history = useQuery({
    queryKey: ['learning-history'],
    queryFn: () => requestJson<LearningHistoryResponse>('/learning/history?page=1&limit=50'),
  });

  if (authLoading || history.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-6">
        <PageSkeleton />
      </main>
    );
  }

  if (history.isError) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Could not load learning history."
          onRetry={() => void history.refetch()}
        />
      </main>
    );
  }

  const items = history.data?.items ?? [];

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t('common.history')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A chronological timeline of your completed lessons, checkpoints, and practice runs.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t('learning.noLearning')}
          description="You haven't completed any lessons or checkpoints yet."
          icon={<History className="h-8 w-8 text-muted-foreground" />}
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
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {items.map((activity) => (
            <div key={activity.id} className="relative group">
              <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-card border-2 border-primary text-primary">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              </div>

              <Card className="hover:border-primary/30 transition-colors shadow-xs">
                <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {activity.type.replaceAll('_', ' ')}
                    </p>
                    <h3 className="text-sm sm:text-base font-semibold text-foreground">
                      {activity.lesson?.title ?? activity.course?.title ?? 'Learning Activity'}
                    </h3>
                    {activity.course ? (
                      <p className="text-xs text-muted-foreground">Course: {activity.course.title}</p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDate(activity.createdAt, locale)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
