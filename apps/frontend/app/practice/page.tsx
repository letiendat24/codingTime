'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge, Card, CardContent, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '../../design-system';
import { type PaginatedResponse, type PracticeProblemSummary, type PracticeStats, requestJson } from '../../lib/api';
import { queryKeys } from '../../lib/query/keys';
import { useI18n } from '../../providers/i18n-provider';

export default function PracticePage() {
  const { t } = useI18n();
  const problems = useQuery({
    queryKey: queryKeys.practice.list({ page: 1, limit: 50 }),
    queryFn: () => requestJson<PaginatedResponse<PracticeProblemSummary>>('/practice/problems?page=1&limit=50'),
  });
  const stats = useQuery({
    queryKey: queryKeys.practice.stats,
    queryFn: () => requestJson<PracticeStats>('/practice/me/stats'),
  });

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t('practice.title')} description={t('practice.description')} />

      <section className="mb-8 grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent>
          <p className="text-sm text-muted-foreground">{t('practice.published')}</p>
          <p className="text-2xl font-semibold">{stats.data?.totalProblems ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
          <p className="text-sm text-muted-foreground">{t('practice.attempted')}</p>
          <p className="text-2xl font-semibold">{stats.data?.attempted ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
          <p className="text-sm text-muted-foreground">{t('practice.solved')}</p>
          <p className="text-2xl font-semibold">{stats.data?.solved ?? 0}</p>
          </CardContent>
        </Card>
      </section>

      {problems.isLoading ? <PageSkeleton /> : null}
      {problems.isError ? <ErrorState title={t('common.error')} description="Login as student first." onRetry={() => void problems.refetch()} /> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {problems.data?.items.map((problem) => (
          <Link key={problem.id} href={`/practice/${problem.slug}`}>
            <Card className="h-full transition-colors hover:bg-muted/60">
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">{problem.title}</h2>
                  <StatusBadge value={problem.progress.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {problem.difficulty} · {problem.language} · {problem.publicTestCount} tests
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {problem.tags.map((tag) => <Badge key={tag.id}>{tag.name}</Badge>)}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {problems.data?.items.length === 0 ? <EmptyState title={t('practice.empty')} /> : null}
    </main>
  );
}
