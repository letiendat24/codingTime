'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, PlayCircle, Sparkles, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, ErrorState, PageSkeleton, StatusBadge } from '../../../design-system';
import { CurriculumView } from '../../../features/courses/components/curriculum-view';
import { type CourseDetail, type EnrollmentSummary, requestJson } from '../../../lib/api';
import { queryKeys } from '../../../lib/query/keys';
import { useCurrentUser } from '../../../hooks/use-current-user';
import { useI18n } from '../../../providers/i18n-provider';
import { useToast } from '../../../providers/toast-provider';

interface CourseDetailResponse {
  readonly course: CourseDetail;
}

interface MyCoursesResponse {
  readonly items: readonly EnrollmentSummary[];
}

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const me = useCurrentUser();

  const course = useQuery({
    queryKey: queryKeys.courses.detail(params.slug),
    queryFn: () => requestJson<CourseDetailResponse>(`/courses/${params.slug}`),
  });

  const myCourses = useQuery({
    queryKey: ['my-courses'],
    enabled: Boolean(me.data?.user),
    queryFn: () => requestJson<MyCoursesResponse>('/users/me/courses'),
    retry: false,
  });

  const courseData = course.data?.course;
  const enrollment = myCourses.data?.items.find((item) => item.course.id === courseData?.id);
  const isEnrolled = Boolean(enrollment);

  const enrollMutation = useMutation({
    mutationFn: () =>
      requestJson(`/courses/${courseData?.id}/enroll`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Enrolled successfully!', `You are now enrolled in ${courseData?.title ?? 'the course'}.`);
      void queryClient.invalidateQueries({ queryKey: ['my-courses'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(params.slug) });
    },
    onError: (error) => {
      toast.error('Enrollment failed', error instanceof Error ? error.message : undefined);
    },
  });

  if (course.isLoading) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <PageSkeleton />
      </main>
    );
  }

  if (course.isError || !courseData) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <ErrorState
          title={t('common.error')}
          description="Course not found or could not be loaded."
          onRetry={() => void course.refetch()}
        />
      </main>
    );
  }

  const totalLessons = courseData.modules.reduce((acc, mod) => acc + mod.lessons.length, 0);

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-8">
      {/* Back link */}
      <div>
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('courses.catalogTitle')}</span>
        </Link>
      </div>

      {/* Hero Section */}
      <div className="rounded-xl border border-border/70 bg-card p-6 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
            {courseData.category.name}
          </span>
          <StatusBadge value={courseData.difficulty} />
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {courseData.title}
          </h1>
          {courseData.description ? (
            <p className="mt-2.5 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-3xl">
              {courseData.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1.5">
            <UserIcon className="h-3.5 w-3.5 text-foreground" />
            <span className="font-medium text-foreground">{courseData.instructor.displayName}</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{courseData.modules.length} modules · {totalLessons} lessons</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border/60">
          <div className="flex flex-wrap gap-1.5">
            {courseData.tags.map((tag) => (
              <span key={tag.id} className="rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground font-medium">
                #{tag.name}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isEnrolled ? (
              <Link href={`/courses/${courseData.slug}/learn`} className="w-full sm:w-auto">
                <Button size="md" className="w-full sm:w-auto">
                  <PlayCircle className="h-4 w-4 mr-1.5" />
                  <span>{t('courses.continueLearning')}</span>
                </Button>
              </Link>
            ) : (
              <Button
                size="md"
                className="w-full sm:w-auto"
                isLoading={enrollMutation.isPending}
                onClick={() => enrollMutation.mutate()}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                <span>{t('courses.enroll')}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Curriculum Syllabus */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          {t('courses.curriculum')}
        </h2>
        <CurriculumView course={courseData} isEnrolled={isEnrolled} />
      </section>
    </main>
  );
}
