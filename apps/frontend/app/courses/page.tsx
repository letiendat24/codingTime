'use client';

import { Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen, LayoutGrid, List, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState, Input, PageSkeleton, Select } from '../../design-system';
import { CourseCard } from '../../features/courses/components/course-card';
import { useCurrentUser } from '../../hooks/use-current-user';
import { type CourseSummary, type EnrollmentSummary, requestJson } from '../../lib/api';
import { queryKeys } from '../../lib/query/keys';
import { useI18n } from '../../providers/i18n-provider';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
};

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
  const [sortBy, setSortBy] = useState<'default' | 'title' | 'difficulty'>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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

    const items = courses.data.items.filter((course) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm.trim() ||
        course.title.toLowerCase().includes(searchLower) ||
        (course.shortDescription ? course.shortDescription.toLowerCase().includes(searchLower) : false) ||
        course.tags.some((tag) => tag.name.toLowerCase().includes(searchLower));

      const matchesDifficulty = difficultyFilter === 'ALL' || course.difficulty === difficultyFilter;

      return matchesSearch && matchesDifficulty;
    });

    if (sortBy === 'title') {
      return [...items].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortBy === 'difficulty') {
      return [...items].sort((a, b) => a.difficulty.localeCompare(b.difficulty));
    }

    return items;
  }, [courses.data?.items, searchTerm, difficultyFilter, sortBy]);

  if (courses.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-[1600px] mx-auto space-y-6">
        <PageSkeleton />
      </main>
    );
  }

  if (courses.isError) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-[1600px] mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Could not load course catalog. Please check your connection."
          onRetry={() => void courses.refetch()}
        />
      </main>
    );
  }

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1600px] mx-auto space-y-8"
    >
      {/* Top Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-5">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground">
            {t('courses.catalogTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t('courses.catalogDescription')}
          </p>
        </div>
      </div>

      {/* Continue Learning Row if Enrolled */}
      {activeEnrolled.length > 0 && !searchTerm && difficultyFilter === 'ALL' ? (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t('courses.continueLearning')}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeEnrolled.slice(0, 3).map((enrollment) => (
              <Link
                key={enrollment.enrollmentId}
                href={`/courses/${enrollment.course.slug}/learn`}
                className="group flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md text-[11px]">
                      In Progress
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      {enrollment.completedLessons}/{enrollment.totalLessons} lessons
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                    {enrollment.course.title}
                  </h3>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span className="text-[11px]">Completion</span>
                    <span className="font-semibold text-foreground text-[11px]">{enrollment.progressPercent}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${enrollment.progressPercent}%` }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>
      ) : null}

      {/* Main Catalog Header with Filters & Controls */}
      <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Title & Count Badge */}
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              {t('courses.exploreCourses')}
            </h2>
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {filteredCourses.length}
            </span>
          </div>

          {/* Controls: Search, Difficulty, Sort, View */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[180px] sm:min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-xs rounded-lg bg-card"
                placeholder={t('courses.searchPlaceholder')}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <Select
              className="h-8 text-xs w-auto min-w-[120px] rounded-lg bg-card"
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
            >
              <option value="ALL">{t('courses.allDifficulties')}</option>
              <option value="BEGINNER">Junior</option>
              <option value="INTERMEDIATE">Medium</option>
              <option value="ADVANCED">Advance</option>
            </Select>

            <Select
              className="h-8 text-xs w-auto min-w-[110px] rounded-lg bg-card"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as 'default' | 'title' | 'difficulty')}
            >
              <option value="default">Sort by</option>
              <option value="title">Title</option>
              <option value="difficulty">Difficulty</option>
            </Select>

            <div className="hidden sm:flex items-center rounded-lg border border-border/70 bg-card p-0.5 text-muted-foreground">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-muted text-foreground' : 'hover:text-foreground'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-muted text-foreground' : 'hover:text-foreground'
                }`}
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Course Grid / List */}
        {filteredCourses.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            key={`${difficultyFilter}-${sortBy}-${viewMode}`}
            className={
              viewMode === 'grid'
                ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid gap-3 sm:grid-cols-1 lg:grid-cols-2'
            }
          >
            {filteredCourses.map((course) => {
              const enrollment = enrollmentsMap.get(course.id);
              return (
                <motion.div key={course.id} variants={itemVariants}>
                  <CourseCard
                    course={course}
                    isEnrolled={Boolean(enrollment)}
                    progressPercent={enrollment?.progressPercent}
                    completedLessons={enrollment?.completedLessons}
                    totalLessons={enrollment?.totalLessons}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <EmptyState
            title={t('courses.noCourses')}
            description="Try adjusting your search query or filter."
            icon={<BookOpen className="h-8 w-8 text-muted-foreground" />}
          />
        )}
      </section>
    </motion.main>
  );
}

