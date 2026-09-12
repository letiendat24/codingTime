'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle, Edit, Layers, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, EmptyState, ErrorState, PageSkeleton, StatusBadge } from '../../../design-system';
import { useAuthGuard } from '../../../features/auth/hooks/use-auth-guard';
import { type CourseDetail, requestJson } from '../../../lib/api';
import { useI18n } from '../../../providers/i18n-provider';

interface InstructorCoursesResponse {
  readonly items: readonly CourseDetail[];
}

export default function InstructorCoursesPage() {
  const { t } = useI18n();
  const { isLoading: authLoading } = useAuthGuard({ requiredRole: 'INSTRUCTOR' });

  const courses = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => requestJson<InstructorCoursesResponse>('/instructor/courses'),
  });

  const items = courses.data?.items ?? [];

  const stats = useMemo(() => {
    const published = items.filter((c) => c.status === 'PUBLISHED').length;
    const drafts = items.filter((c) => c.status === 'DRAFT').length;
    return { total: items.length, published, drafts };
  }, [items]);

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
          description="Could not load instructor courses."
          onRetry={() => void courses.refetch()}
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
            {t('instructor.courses')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your teaching materials, curriculum structure, video processing, and code snapshots.
          </p>
        </div>

        <Link href="/instructor/courses/new">
          <Button className="shadow-xs">
            <Plus className="h-4 w-4 mr-1.5" />
            <span>{t('instructor.createCourse')}</span>
          </Button>
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('instructor.totalCourses')}</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('instructor.publishedCourses')}</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.published}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('instructor.draftCourses')}</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.drafts}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Course List */}
      {items.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">All Courses ({items.length})</h2>
          <div className="space-y-3">
            {items.map((course) => {
              const totalLessons = course.modules.reduce((acc, mod) => acc + mod.lessons.length, 0);

              return (
                <Card key={course.id} className="hover:border-primary/40 transition-all shadow-xs">
                  <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={course.status} />
                        <StatusBadge value={course.difficulty} />
                        <span className="text-xs text-muted-foreground">
                          {course.category?.name ?? 'Course'}
                        </span>
                      </div>
                      <Link href={`/instructor/courses/${course.id}`}>
                        <h3 className="text-base font-bold text-foreground hover:text-primary transition-colors">
                          {course.title}
                        </h3>
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {course.modules.length} modules · {totalLessons} lessons
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/courses/${course.slug}`}>
                        <Button size="sm" variant="secondary">
                          <span>{t('common.view')}</span>
                        </Button>
                      </Link>
                      <Link href={`/instructor/courses/${course.id}`}>
                        <Button size="sm">
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          <span>{t('common.edit')}</span>
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No courses created yet"
          description="Create your first course to start teaching on CodeSync."
          action={
            <Link href="/instructor/courses/new">
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                <span>{t('instructor.createCourse')}</span>
              </Button>
            </Link>
          }
        />
      )}
    </main>
  );
}
