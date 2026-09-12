'use client';

import { Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, EmptyState, ErrorState, Input, PageSkeleton, Select, StatusBadge } from '../../design-system';
import { CourseCard } from '../../features/courses/components/course-card';
import { useCurrentUser } from '../../hooks/use-current-user';
import { type CourseSummary, type EnrollmentSummary, requestJson } from '../../lib/api';
import { queryKeys } from '../../lib/query/keys';
import { useI18n } from '../../providers/i18n-provider';

interface CourseListResponse {
  readonly items: readonly CourseSummary[];
}

interface MyCoursesResponse {
  readonly items: readonly EnrollmentSummary[];
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<main className="px-4 py-8 sm:px-6 lg:px-8"><PageSkeleton /></main>}>
      <CoursesPageContent />
    </Suspense>
  );
}

function CoursesPageContent() {
  const { t } = useI18n();
  const me = useCurrentUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('ALL');

  const courses = useQuery({
    queryKey: queryKeys.courses.all(),
    queryFn: () => requestJson<CourseListResponse>('/courses'),
  });

  const myCourses = useQuery({
    queryKey: ['my-courses'],
    enabled: Boolean(me.data?.user),
    queryFn: () => requestJson<MyCoursesResponse>('/users/me/courses'),
    retry: false,
  });

  const enrollmentsMap = useMemo(() => {
    const map = new Map<string, EnrollmentSummary>();
    if (myCourses.data?.items) {
      for (const item of myCourses.data.items) {
        map.set(item.course.id, item);
      }
    }
    return map;
  }, [myCourses.data?.items]);

  const activeEnrolled = useMemo(() => {
    return myCourses.data?.items.filter((item) => item.status !== 'COMPLETED') ?? [];
  }, [myCourses.data?.items]);

  const filteredCourses = useMemo(() => {
    if (!courses.data?.items) return [];

    return courses.data.items.filter((course) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm.trim() ||
        course.title.toLowerCase().includes(searchLower) ||
        (course.shortDescription ? course.shortDescription.toLowerCase().includes(searchLower) : false) ||
        course.tags.some((tag) => tag.name.toLowerCase().includes(searchLower));

      const matchesDifficulty = difficultyFilter === 'ALL' || course.difficulty === difficultyFilter;

      return matchesSearch && matchesDifficulty;
    });
  }, [courses.data?.items, searchTerm, difficultyFilter]);

  if (courses.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
        <PageSkeleton />
      </main>
    );
  }

  if (courses.isError) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Could not load course catalog. Please check your connection."
          onRetry={() => void courses.refetch()}
        />
      </main>
    );
  }

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
      {/* Top Hero & Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {t('courses.catalogTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('courses.catalogDescription')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 text-xs"
              placeholder={t('courses.searchPlaceholder')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Select
            className="w-full sm:w-40 text-xs"
            value={difficultyFilter}
            onChange={(event) => setDifficultyFilter(event.target.value)}
          >
            <option value="ALL">{t('courses.allDifficulties')}</option>
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </Select>
        </div>
      </div>

      {/* Continue Learning Banner if Enrolled */}
      {activeEnrolled.length > 0 && !searchTerm && difficultyFilter === 'ALL' ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>{t('courses.continueLearning')}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeEnrolled.slice(0, 3).map((enrollment) => (
              <Card key={enrollment.enrollmentId} className="border-primary/30 bg-primary/5 hover:border-primary transition-all">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-primary">In Progress</span>
                      <StatusBadge value={enrollment.status} />
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-foreground line-clamp-1">
                      {enrollment.course.title}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{enrollment.completedLessons}/{enrollment.totalLessons} lessons</span>
                      <span className="font-semibold text-foreground">{enrollment.progressPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-3">
                      <div className="h-full bg-primary" style={{ width: `${enrollment.progressPercent}%` }} />
                    </div>
                    <Link href={`/courses/${enrollment.course.slug}/learn`}>
                      <Button size="sm" className="w-full">
                        {t('courses.continueLearning')}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Course Catalog Grid */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          {t('courses.exploreCourses')} ({filteredCourses.length})
        </h2>

        {filteredCourses.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCourses.map((course) => {
              const enrollment = enrollmentsMap.get(course.id);
              return (
                <CourseCard
                  key={course.id}
                  course={course}
                  isEnrolled={Boolean(enrollment)}
                  progressPercent={enrollment?.progressPercent}
                  completedLessons={enrollment?.completedLessons}
                  totalLessons={enrollment?.totalLessons}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={t('courses.noCourses')}
            description="Try adjusting your search query or filter."
            icon={<BookOpen className="h-8 w-8 text-muted-foreground" />}
          />
        )}
      </section>
    </main>
  );
}
