'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutateFunction } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  AlertCircle,
  BookOpen,
  Code,
  FileCode,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Card, Dialog, ErrorState, PageSkeleton, StatusBadge } from '../../../design-system';
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

function getLessonTypeIcon(type: string) {
  switch (type) {
    case 'VIDEO':
      return <Video className="h-3.5 w-3.5 text-blue-500" />;
    case 'CODING':
      return <Code className="h-3.5 w-3.5 text-emerald-500" />;
    case 'PROJECT':
      return <FileCode className="h-3.5 w-3.5 text-amber-500" />;
    case 'ARTICLE':
    default:
      return <BookOpen className="h-3.5 w-3.5 text-purple-500" />;
  }
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
  const accessLessonMutateRef = useRef<UseMutateFunction<unknown, Error, string, unknown> | null>(null);
  const [isContentOpen, setIsContentOpen] = useState(false);

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

  useEffect(() => {
    accessLessonMutateRef.current = accessLesson.mutate;
  }, [accessLesson.mutate]);

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

    const mutateAccessLesson = accessLessonMutateRef.current;
    if (!mutateAccessLesson) {
      return;
    }

    const controller = lessonAccessControllerRef.current;

    if (!controller.shouldStartAccess(activeLessonId)) {
      return;
    }

    controller.markStarted(activeLessonId);
    mutateAccessLesson(activeLessonId, {
      onSettled: () => controller.markSettled(activeLessonId),
    });
  }, [activeLesson?.id]);

  const handleSelectLesson = (targetLessonId: string) => {
    setIsContentOpen(false);
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
  const isLessonCompleted = activeLesson
    ? progress.data?.lessons.find((l) => l.id === activeLesson.id)?.status === 'COMPLETED'
    : false;

  return (
    <div className="min-h-full flex flex-col bg-background">
      {/* Top Learning Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/95 px-4 py-3 backdrop-blur-md sm:px-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/courses/${courseData.slug}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">{courseData.title}</span>
            </Link>

            <span className="text-muted-foreground hidden sm:inline">•</span>

            <div className="flex items-center gap-2">
              <Badge tone="info">{activeLesson?.lessonType ?? 'LESSON'}</Badge>
              <h1 className="text-sm font-bold text-foreground line-clamp-1">{activeLesson?.title ?? 'Select a Lesson'}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {progress.data ? (
              <div className="hidden md:flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Progress:</span>
                <span className="font-semibold text-foreground">{progress.data.progress.progressPercent}%</span>
                <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${progress.data.progress.progressPercent}%` }} />
                </div>
              </div>
            ) : null}

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsContentOpen(true)}
              className="text-xs flex items-center gap-1.5"
            >
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Course Content</span>
              <span className="sm:hidden">Content</span>
            </Button>
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

        {/* Compact Single Unified Bottom Navigation Footer */}
        <div className="pt-5 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
          <Button
            size="sm"
            variant="secondary"
            disabled={!prevLesson}
            onClick={() => {
              if (prevLesson) handleSelectLesson(prevLesson.id);
            }}
            className="flex items-center gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="max-w-[160px] sm:max-w-[220px] truncate">
              {prevLesson ? `Prev: ${prevLesson.title}` : 'Previous'}
            </span>
          </Button>

          <div className="flex items-center gap-2">
            {activeLesson ? (
              <Button
                size="sm"
                variant={isLessonCompleted ? 'secondary' : 'primary'}
                onClick={() => completeLesson.mutate(activeLesson.id)}
                disabled={completeLesson.isPending}
                className="flex items-center gap-1.5"
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${isLessonCompleted ? 'text-emerald-500' : ''}`} />
                <span>{isLessonCompleted ? 'Completed' : 'Mark as Completed'}</span>
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsContentOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground hidden md:flex items-center gap-1.5"
            >
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Lessons ({allLessons.length})</span>
            </Button>
          </div>

          <Button
            size="sm"
            variant={nextLesson ? 'primary' : 'secondary'}
            disabled={!nextLesson}
            onClick={() => {
              if (nextLesson) handleSelectLesson(nextLesson.id);
            }}
            className="flex items-center gap-1.5"
          >
            <span className="max-w-[160px] sm:max-w-[220px] truncate">
              {nextLesson ? `Next: ${nextLesson.title}` : 'End of Course'}
            </span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Course Content Modal / Drawer */}
      <Dialog
        open={isContentOpen}
        onClose={() => setIsContentOpen(false)}
        size="lg"
        title={
          <div className="flex items-center justify-between gap-2 pr-4">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <span>Course Content</span>
            </div>
            {progress.data ? (
              <span className="text-xs font-normal text-muted-foreground">
                {progress.data.progress.progressPercent}% Completed
              </span>
            ) : null}
          </div>
        }
        description={`Curriculum for ${courseData.title}`}
      >
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {courseData.modules.map((module, mIdx) => (
            <div key={module.id} className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
                <span>Module {mIdx + 1}: {module.title}</span>
                <span>{module.lessons.length} lessons</span>
              </div>
              <div className="space-y-1">
                {module.lessons.map((lesson) => {
                  const isSelected = lesson.id === activeLesson?.id;
                  const lessonProgress = progress.data?.lessons.find((item) => item.id === lesson.id);
                  const status = lessonProgress?.status ?? 'NOT_STARTED';

                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => handleSelectLesson(lesson.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border border-primary/40 text-primary font-bold'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 mr-2">
                        {getLessonTypeIcon(lesson.lessonType)}
                        <span className="truncate">
                          {lesson.position}. {lesson.title}
                        </span>
                      </div>
                      <StatusBadge value={status} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
