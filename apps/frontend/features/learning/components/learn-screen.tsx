'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Layers,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Card, ErrorState, PageSkeleton, StatusBadge } from '../../../design-system';
import { useAuthGuard } from '../../auth/hooks/use-auth-guard';
import {
  type CourseDetail,
  type CourseLearningSummary,
  requestJson,
} from '../../../lib/api';
import { queryKeys } from '../../../lib/query/keys';
import { useI18n } from '../../../providers/i18n-provider';
import { useToast } from '../../../providers/toast-provider';
import { LessonRenderer, type LessonSummaryItem } from './lesson-renderer';
import { LessonAccessController } from './lesson-access-controller';

interface CourseDetailResponse {
  readonly course: CourseDetail;
}

export function LearnScreen() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const { isLoading: authLoading } = useAuthGuard();
  const lessonAccessControllerRef = useRef(new LessonAccessController());

  const hasNormalizedUrlRef = useRef(false);

  const lessonIdFromUrl = searchParams.get('lesson');

  const course = useQuery({
    queryKey: queryKeys.courses.detail(params.slug),
    queryFn: () => requestJson<CourseDetailResponse>(`/courses/${params.slug}`),
  });

  const courseData = course.data?.course;

  const progress = useQuery({
    queryKey: queryKeys.courses.progress(courseData?.id),
    enabled: Boolean(courseData?.id),
    queryFn: () => requestJson<CourseLearningSummary>(`/learning/courses/${courseData?.id}/progress`),
  });

  const allLessons: LessonSummaryItem[] = useMemo(() => {
    if (!courseData?.modules) return [];
    return courseData.modules.flatMap((module) =>
      module.lessons.map((l) => ({
        ...l,
        moduleId: module.id,
        moduleTitle: module.title,
      })),
    );
  }, [courseData?.modules]);

  // Deterministic URL-first Lesson Resolution
  useEffect(() => {
    if (!courseData || allLessons.length === 0) return;

    if (!lessonIdFromUrl && !hasNormalizedUrlRef.current) {
      hasNormalizedUrlRef.current = true;
      // Find first incomplete lesson or first lesson
      const incompleteLesson = allLessons.find((l) => {
        const p = progress.data?.lessons.find((item) => item.id === l.id);
        return p?.status !== 'COMPLETED';
      });
      const target = incompleteLesson ?? allLessons[0];
      if (target) {
        router.replace(`/courses/${params.slug}/learn?lesson=${target.id}`);
      }
    }
  }, [allLessons, courseData, lessonIdFromUrl, params.slug, progress.data, router]);

  const activeLesson = useMemo(() => {
    if (!lessonIdFromUrl) return undefined;
    return allLessons.find((l) => l.id === lessonIdFromUrl);
  }, [allLessons, lessonIdFromUrl]);

  const accessLesson = useMutation({
    mutationFn: (lessonId: string) =>
      requestJson(`/learning/lessons/${lessonId}/access`, { method: 'POST' }),
    meta: { suppressGlobalToast: true },
  });

  const completeLesson = useMutation({
    mutationFn: (lessonId: string) =>
      requestJson(`/learning/lessons/${lessonId}/complete`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Lesson marked as completed!');
      void queryClient.invalidateQueries({ queryKey: queryKeys.courses.progress(courseData?.id) });
    },
    onError: (error) => {
      toast.error('Failed to complete lesson', error instanceof Error ? error.message : undefined);
    },
  });

  // Track access when active lesson changes
  useEffect(() => {
    const activeLessonId = activeLesson?.id;

    if (!activeLessonId) {
      return;
    }

    const controller = lessonAccessControllerRef.current;

    if (!controller.shouldStartAccess(activeLessonId)) {
      return;
    }

    controller.markStarted(activeLessonId);
    accessLesson.mutate(activeLessonId, {
      onSettled: () => controller.markSettled(activeLessonId),
    });
  }, [activeLesson?.id, accessLesson]);

  const handleSelectLesson = (targetLessonId: string) => {
    router.push(`/courses/${params.slug}/learn?lesson=${targetLessonId}`);
  };

  if (authLoading || course.isLoading || progress.isLoading) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <PageSkeleton />
      </main>
    );
  }

  if (course.isError || !courseData) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <ErrorState
          title={t('common.error')}
          description="Enroll in the course first, then retry."
          onRetry={() => {
            void course.refetch();
            void progress.refetch();
          }}
        />
      </main>
    );
  }

  const currentLessonIndex = activeLesson ? allLessons.findIndex((l) => l.id === activeLesson.id) : -1;
  const prevLesson = currentLessonIndex > 0 ? allLessons[currentLessonIndex - 1] ?? null : null;
  const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < allLessons.length - 1 ? allLessons[currentLessonIndex + 1] ?? null : null;

  return (
    <main className="min-h-screen flex flex-col bg-background">
      {/* Top Learning Navigation Bar */}
      <header className="sticky top-14 z-30 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/courses/${courseData.slug}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{courseData.title}</span>
            </Link>

            <span className="text-muted-foreground hidden sm:inline">•</span>

            <div className="flex items-center gap-2">
              <Badge tone="info">{activeLesson?.lessonType ?? 'LESSON'}</Badge>
              <h1 className="text-sm font-bold text-foreground line-clamp-1">{activeLesson?.title ?? 'Select a Lesson'}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {progress.data ? (
              <div className="hidden sm:flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Progress:</span>
                <span className="font-semibold text-foreground">{progress.data.progress.progressPercent}%</span>
                <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${progress.data.progress.progressPercent}%` }} />
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                disabled={!prevLesson}
                onClick={() => {
                  if (prevLesson) handleSelectLesson(prevLesson.id);
                }}
                title={prevLesson ? `Previous: ${prevLesson.title}` : 'No previous lesson'}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!nextLesson}
                onClick={() => {
                  if (nextLesson) handleSelectLesson(nextLesson.id);
                }}
                title={nextLesson ? `Next: ${nextLesson.title}` : 'No next lesson'}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Learning Canvas */}
      <div className="flex-1 p-4 sm:p-6 space-y-6">
        {activeLesson ? (
          <LessonRenderer
            lesson={activeLesson}
            course={courseData}
            progress={progress.data}
            nextLesson={nextLesson}
            onSelectLesson={handleSelectLesson}
            onCompleteLesson={(id) => completeLesson.mutate(id)}
            isCompletingLesson={completeLesson.isPending}
          />
        ) : lessonIdFromUrl ? (
          /* Invalid Lesson ID handling */
          <Card className="p-8 text-center space-y-4 max-w-lg mx-auto border-destructive/30">
            <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
            <h2 className="text-base font-bold text-foreground">Lesson Not Found</h2>
            <p className="text-xs text-muted-foreground">
              The requested lesson was not found in &quot;{courseData.title}&quot;.
            </p>
            {allLessons[0] && (
              <Button size="sm" onClick={() => handleSelectLesson(allLessons[0]!.id)}>
                Open First Lesson
              </Button>
            )}
          </Card>
        ) : (
          <div className="py-12">
            <PageSkeleton />
          </div>
        )}

        {/* Modules & Lessons Curriculum Drawer / Accordion */}
        <section className="pt-6 border-t border-border space-y-4">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span>{t('courses.curriculum')}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courseData.modules.map((module) => (
              <Card key={module.id} className="p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{module.title}</h3>
                <div className="space-y-1.5">
                  {module.lessons.map((lesson) => {
                    const isSelected = lesson.id === activeLesson?.id;
                    const lessonProgress = progress.data?.lessons.find((item) => item.id === lesson.id);
                    const status = lessonProgress?.status ?? 'NOT_STARTED';

                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => handleSelectLesson(lesson.id)}
                        className={`w-full flex items-center justify-between p-2 rounded text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-primary/10 border border-primary text-primary font-bold'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <span className="truncate mr-2">
                          {lesson.position}. {lesson.title}
                        </span>
                        <StatusBadge value={status} />
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
