'use client';

import { useQuery } from '@tanstack/react-query';
import { Edit, FileCode, Plus } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  EmptyState,
  ErrorState,
  PageSkeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../design-system';
import { useAuthGuard } from '../../../features/auth/hooks/use-auth-guard';
import { type InstructorPracticeProblem, type PaginatedResponse, requestJson } from '../../../lib/api';
import { useI18n } from '../../../providers/i18n-provider';

export default function InstructorPracticePage() {
  const { t } = useI18n();
  const { isLoading: authLoading } = useAuthGuard({ requiredRole: 'INSTRUCTOR' });

  const problems = useQuery({
    queryKey: ['instructor-practice'],
    queryFn: () =>
      requestJson<PaginatedResponse<InstructorPracticeProblem>>('/instructor/practice/problems?page=1&limit=50'),
  });

  const items = problems.data?.items ?? [];

  if (authLoading || problems.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-6">
        <PageSkeleton />
      </main>
    );
  }

  if (problems.isError) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Could not load practice problems."
          onRetry={() => void problems.refetch()}
        />
      </main>
    );
  }

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {t('instructor.practice')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Author and manage independent coding challenges, starter code, and test cases.
          </p>
        </div>

        <Link href="/instructor/practice/new">
          <Button className="shadow-xs">
            <Plus className="h-4 w-4 mr-1.5" />
            <span>{t('instructor.createProblem')}</span>
          </Button>
        </Link>
      </div>

      {items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('practice.problem')}</TableHead>
              <TableHead className="w-28">{t('practice.difficulty')}</TableHead>
              <TableHead className="w-24 text-center">Tests</TableHead>
              <TableHead className="w-28 text-center">{t('common.status')}</TableHead>
              <TableHead className="w-24 text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((problem) => (
              <TableRow key={problem.id}>
                <TableCell>
                  <Link
                    href={`/instructor/practice/${problem.id}`}
                    className="font-semibold text-foreground hover:text-primary transition-colors text-sm"
                  >
                    {problem.title}
                  </Link>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    /{problem.slug} · {problem.language}
                  </p>
                </TableCell>
                <TableCell>
                  <StatusBadge value={problem.difficulty} />
                </TableCell>
                <TableCell className="text-center font-mono text-xs">
                  {problem.testCases.length} tests
                </TableCell>
                <TableCell className="text-center">
                  <StatusBadge value={problem.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/instructor/practice/${problem.id}`}>
                    <Button size="sm" variant="secondary">
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      <span>{t('common.edit')}</span>
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          title="No practice problems created"
          description="Create your first practice problem to challenge learners."
          icon={<FileCode className="h-8 w-8 text-muted-foreground" />}
          action={
            <Link href="/instructor/practice/new">
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                <span>{t('instructor.createProblem')}</span>
              </Button>
            </Link>
          }
        />
      )}
    </main>
  );
}
