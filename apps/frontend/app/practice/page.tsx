'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock, Code, Search, Terminal } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Input,
  PageSkeleton,
  Pagination,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../design-system';
import { useAuthGuard } from '../../features/auth/hooks/use-auth-guard';
import { type PaginatedResponse, type PracticeProblemSummary, type PracticeStats, requestJson } from '../../lib/api';
import { queryKeys } from '../../lib/query/keys';
import { useI18n } from '../../providers/i18n-provider';

export default function PracticePage() {
  const { t } = useI18n();
  const { isLoading: authLoading } = useAuthGuard();

  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const limit = 20;

  const problems = useQuery({
    queryKey: queryKeys.practice.list({ page, limit }),
    queryFn: () =>
      requestJson<PaginatedResponse<PracticeProblemSummary>>(`/practice/problems?page=${page}&limit=${limit}`),
  });

  const stats = useQuery({
    queryKey: queryKeys.practice.stats,
    queryFn: () => requestJson<PracticeStats>('/practice/me/stats'),
  });

  const filteredProblems = useMemo(() => {
    if (!problems.data?.items) return [];

    return problems.data.items.filter((item) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search.trim() ||
        item.title.toLowerCase().includes(searchLower) ||
        item.tags.some((tag) => tag.name.toLowerCase().includes(searchLower));

      const matchesDifficulty = difficulty === 'ALL' || item.difficulty === difficulty;

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'SOLVED' && item.progress.status === 'SOLVED') ||
        (statusFilter === 'ATTEMPTED' && item.progress.status === 'ATTEMPTED') ||
        (statusFilter === 'UNSOLVED' && item.progress.status === 'NOT_STARTED');

      return matchesSearch && matchesDifficulty && matchesStatus;
    });
  }, [problems.data?.items, search, difficulty, statusFilter]);

  if (authLoading || problems.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
        <PageSkeleton />
      </main>
    );
  }

  if (problems.isError) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Could not load practice problems. Please make sure you are signed in."
          onRetry={() => void problems.refetch()}
        />
      </main>
    );
  }

  const totalPages = problems.data?.pagination.totalPages ?? 1;

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t('practice.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('practice.description')}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Code className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('practice.published')}</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {stats.data?.totalProblems ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('practice.attempted')}</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {stats.data?.attempted ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('practice.solved')}</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {stats.data?.solved ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 text-xs"
            placeholder={t('practice.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select
          className="w-full sm:w-40 text-xs"
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value)}
        >
          <option value="ALL">{t('practice.allDifficulties')}</option>
          <option value="EASY">{t('practice.easy')}</option>
          <option value="MEDIUM">{t('practice.medium')}</option>
          <option value="HARD">{t('practice.hard')}</option>
        </Select>

        <Select
          className="w-full sm:w-40 text-xs"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="ALL">{t('practice.allStatus')}</option>
          <option value="SOLVED">{t('practice.solved')}</option>
          <option value="ATTEMPTED">{t('practice.attempted')}</option>
          <option value="UNSOLVED">{t('practice.unsolved')}</option>
        </Select>
      </div>

      {/* Problems Table */}
      {filteredProblems.length > 0 ? (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>{t('practice.problem')}</TableHead>
                <TableHead className="w-28">{t('practice.difficulty')}</TableHead>
                <TableHead className="w-24 text-center">{t('practice.bestScore')}</TableHead>
                <TableHead className="w-28 text-center">{t('common.status')}</TableHead>
                <TableHead className="w-24 text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProblems.map((problem) => {
                const isSolved = problem.progress.status === 'SOLVED';
                const isAttempted = problem.progress.status === 'ATTEMPTED';

                return (
                  <TableRow key={problem.id}>
                    <TableCell className="text-center text-xs font-mono text-muted-foreground">
                      {isSolved ? (
                        <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                      ) : isAttempted ? (
                        <div className="mx-auto h-3 w-3 rounded-full border-2 border-amber-500 bg-amber-500/20" />
                      ) : (
                        <Circle className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/practice/${problem.slug}`}
                        className="font-medium text-foreground hover:text-primary transition-colors text-sm"
                      >
                        {problem.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {problem.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={problem.difficulty} />
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold text-xs">
                      {problem.progress.bestScore !== null ? (
                        <span className={problem.progress.bestScore === 100 ? 'text-emerald-500' : 'text-amber-500'}>
                          {problem.progress.bestScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge value={problem.progress.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/practice/${problem.slug}`}>
                        <Button size="sm" variant={isSolved ? 'secondary' : 'primary'}>
                          {isSolved ? 'Review' : 'Solve'}
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={problems.data?.pagination.total}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <EmptyState
          title={t('practice.empty')}
          description="Try clearing or changing your filters."
          icon={<Terminal className="h-8 w-8 text-muted-foreground" />}
        />
      )}
    </main>
  );
}
