'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, PlayCircle, Sparkles, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Card, CardContent, ErrorState, PageSkeleton, StatusBadge } from '../../../design-system';
import { CurriculumView } from '../../../features/courses/components/curriculum-view';
import { useCurrentUser } from '../../../hooks/use-current-user';
import { type CourseDetail, type EnrollmentSummary, requestJson } from '../../../lib/api';
import { queryKeys } from '../../../lib/query/keys';
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
  const router = useRouter();
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
    <main className="px-4 py-8 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-8">
      {/* Back button */}
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
      <Card className="overflow-hidden border-border shadow-md">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 sm:p-8 text-white">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge tone="info" className="bg-white/10 text-white border-white/20">
              {courseData.category.name}
            </Badge>
            <StatusBadge value={courseData.difficulty} />
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white">
            {courseData.title}
          </h1>

          <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-3xl leading-relaxed">
            {courseData.description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <UserIcon className="h-4 w-4 text-primary" />
              <span>{courseData.instructor.displayName}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-primary" />
              <span>{courseData.modules.length} modules, {totalLessons} lessons</span>
            </div>
          </div>
        </div>

        <CardContent className="p-6 bg-card flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            {courseData.tags.map((tag) => (
              <span key={tag.id} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground font-medium">
                #{tag.name}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isEnrolled ? (
              <Link href={`/courses/${courseData.slug}/learn`} className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto shadow-md">
                  <PlayCircle className="h-4 w-4 mr-2" />
                  <span>{t('courses.continueLearning')}</span>
                </Button>
              </Link>
            ) : (
              <Button
                size="lg"
                className="w-full sm:w-auto shadow-md"
                isLoading={enrollMutation.isPending}
                disabled={enrollMutation.isPending}
                onClick={() => {
                  if (!me.data?.user) {
                    router.push(`/login?redirect=/courses/${courseData.slug}`);
                    return;
                  }
                  enrollMutation.mutate();
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                <span>{enrollMutation.isPending ? t('courses.enrolling') : t('courses.enroll')}</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Curriculum Breakdown */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('courses.curriculum')}</h2>
            <p className="text-xs text-muted-foreground">
              {courseData.modules.length} {t('courses.modules').toLowerCase()} · {totalLessons} {t('courses.lessonsCount').toLowerCase()}
            </p>
          </div>
        </div>

        <CurriculumView course={courseData} isEnrolled={isEnrolled} />
      </section>
    </main>
  );
}
