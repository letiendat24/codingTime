'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  Code,
  FileCode,
  Github,
  HelpCircle,
  Video as VideoIcon,
  AlertCircle,
  Captions,
  Columns,
  ClipboardCheck,
  Eye,
  SkipForward,
} from 'lucide-react';
import { VideoPlayer } from '../../../components/video-player';
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, Dialog, Input, PageSkeleton } from '../../../design-system';
import { ArticleMarkdownPreview } from '../../instructor/components/article-editor';
import {
  type CodeAlongMetadata,
  type CodeSnapshotDetail,
  type CourseDetail,
  type CourseLearningSummary,
  type QuizAttemptDetail,
  type StudentQuiz,
  type StudentTranscript,
  type StudentTranscriptTrack,
  type ProjectSubmissionDetail,
  type VideoCheckpoint,
  type VideoPracticeStep,
  type VideoPlayback,
  type Workspace,
  requestJson,
} from '../../../lib/api';
import { formatTime, selectSnapshotAtOrBefore } from '../../../lib/video-learning';
import { queryKeys } from '../../../lib/query/keys';
import { useI18n } from '../../../providers/i18n-provider';
import { useToast } from '../../../providers/toast-provider';
import { CheckpointPanel } from './checkpoint-panel';
import { InstructorTimeline } from './instructor-timeline';
import {
  answersFromAttempt,
  buildQuizSubmitAnswers,
  countUnansweredQuestions,
  findResumeAttemptId,
  isAlreadySubmittedQuizError,
  isEditableQuizAttempt,
  selectQuizOption,
  type QuizAnswers,
} from './quiz-view-model';
import { StudentWorkspace } from './student-workspace';
import { TranscriptPanel } from './transcript-panel';
import { preferredTranscriptTrackId, subtitleTextForTime } from './transcript-view-model';
import {
  findPracticeStepCrossed,
  codeAlongSplitColumns,
  DEFAULT_VIDEO_SPLIT_RATIO,
  isCodeAlongRuntimeEnabled,
  parseStoredVideoLayoutMode,
  parseStoredVideoSplitRatio,
  shouldOpenLessonWorkspace,
  shouldPauseForPracticeStep,
  VIDEO_CODE_LAYOUT_STORAGE_KEY,
  VIDEO_CODE_SPLIT_STORAGE_KEY,
  type VideoCodeAlongLayoutMode,
  type VideoLearningMode,
} from './video-practice-view-model';

export interface LessonSummaryItem {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly lessonType: string;
  readonly moduleId?: string;
  readonly moduleTitle?: string;
}

export interface LessonRendererProps {
  readonly lesson: LessonSummaryItem;
  readonly course: CourseDetail;
  readonly progress?: CourseLearningSummary | undefined;
  readonly nextLesson: LessonSummaryItem | null;
  readonly onSelectLesson: (lessonId: string) => void;
  readonly onCompleteLesson: (lessonId: string) => void;
  readonly isCompletingLesson: boolean;
}

export function LessonRenderer({
  lesson,
  course,
  progress,
  nextLesson,
  onSelectLesson,
  onCompleteLesson,
  isCompletingLesson,
}: LessonRendererProps) {
  const lessonProgress = progress?.lessons.find((l) => l.id === lesson.id);
  const isCompleted = lessonProgress?.status === 'COMPLETED';

  // Discriminated Exhaustive Switch
  switch (lesson.lessonType) {
    case 'ARTICLE':
      return (
        <ArticleLessonView
          lesson={lesson}
          isCompleted={isCompleted}
          nextLesson={nextLesson}
          onSelectLesson={onSelectLesson}
          onCompleteLesson={onCompleteLesson}
          isCompletingLesson={isCompletingLesson}
        />
      );

    case 'VIDEO':
      return (
        <VideoLessonView
          key={`video-${lesson.id}`}
          lesson={lesson}
          courseId={course.id}
          isCompleted={isCompleted}
          onCompleteLesson={onCompleteLesson}
        />
      );

    case 'CODING':
      return (
        <CodingLessonView
          key={`coding-${lesson.id}`}
          lesson={lesson}
          isCompleted={isCompleted}
          nextLesson={nextLesson}
          onSelectLesson={onSelectLesson}
          onCompleteLesson={onCompleteLesson}
          isCompletingLesson={isCompletingLesson}
        />
      );

    case 'PROJECT':
      return (
        <ProjectLessonView
          key={`project-${lesson.id}`}
          lesson={lesson}
          isCompleted={isCompleted}
          nextLesson={nextLesson}
          onSelectLesson={onSelectLesson}
          onCompleteLesson={onCompleteLesson}
          isCompletingLesson={isCompletingLesson}
        />
      );

    case 'QUIZ':
      return (
        <QuizLessonView
          lesson={lesson}
          isCompleted={isCompleted}
          nextLesson={nextLesson}
          onSelectLesson={onSelectLesson}
          onCompleteLesson={onCompleteLesson}
          isCompletingLesson={isCompletingLesson}
        />
      );

    default:
      return <UnsupportedLessonView lesson={lesson} />;
  }
}

// ==========================================
// 1. ARTICLE LESSON VIEW
// ==========================================
interface ArticleLessonViewProps {
  readonly lesson: LessonSummaryItem;
  readonly isCompleted: boolean;
  readonly nextLesson: LessonSummaryItem | null;
  readonly onSelectLesson: (lessonId: string) => void;
  readonly onCompleteLesson: (lessonId: string) => void;
  readonly isCompletingLesson: boolean;
}

function ArticleLessonView({
  lesson,
  isCompleted,
  nextLesson: _nextLesson,
  onSelectLesson: _onSelectLesson,
  onCompleteLesson: _onCompleteLesson,
  isCompletingLesson: _isCompletingLesson,
}: ArticleLessonViewProps) {
  const wordCount = lesson.description?.split(/\s+/).length || 0;
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="rounded-xl border border-border/70 bg-card p-6 sm:p-8 space-y-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="border-b border-border/60 pb-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                Article
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {readTimeMinutes} min read
              </span>
            </div>
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                <CheckCircle2 className="h-3.5 w-3.5" /> Completed
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{lesson.title}</h1>
        </div>

        <div className="py-2 text-foreground/90 leading-relaxed">
          {lesson.description ? (
            <ArticleMarkdownPreview content={lesson.description} />
          ) : (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <BookOpen className="mx-auto h-8 w-8 opacity-40" />
              <p className="text-xs font-medium">This article does not have any content published yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. VIDEO LESSON VIEW
// ==========================================
interface VideoLessonViewProps {
  readonly lesson: LessonSummaryItem;
  readonly courseId: string;
  readonly isCompleted: boolean;
  readonly onCompleteLesson: (lessonId: string) => void;
}

function VideoLessonView({
  lesson,
  courseId,
  isCompleted: _isCompleted,
  onCompleteLesson: _onCompleteLesson,
}: VideoLessonViewProps) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();

  const [activeCheckpoint, setActiveCheckpoint] = useState<VideoCheckpoint | null>(null);
  const [learningMode, setLearningMode] = useState<VideoLearningMode>('FOLLOW');
  const [mobileMode, setMobileMode] = useState<'video' | 'instructor' | 'code' | 'transcript' | 'output'>('video');
  const [secondaryPanel, setSecondaryPanel] = useState<'transcript' | 'timeline' | 'instructor' | null>(null);
  const [currentSecond, setCurrentSecond] = useState(0);
  const previousPracticeSecondRef = useRef(0);
  const triggeredPracticeIdsRef = useRef(new Set<string>());
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [requestedSeekSecond, setRequestedSeekSecond] = useState<number | null>(null);
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [activePracticeStep, setActivePracticeStep] = useState<VideoPracticeStep | null>(null);
  const [practicePauseSignal, setPracticePauseSignal] = useState(0);
  const [practiceResumeSignal, setPracticeResumeSignal] = useState(0);
  const [completedPracticeStepId, setCompletedPracticeStepId] = useState<string | null>(null);
  const [skippedPracticeStepId, setSkippedPracticeStepId] = useState<string | null>(null);
  const [practiceCheckError, setPracticeCheckError] = useState<string | null>(null);
  const [compareSignal, setCompareSignal] = useState(0);
  const [layoutMode, setLayoutMode] = useState<VideoCodeAlongLayoutMode>('SPLIT');
  const [splitRatio, setSplitRatio] = useState(DEFAULT_VIDEO_SPLIT_RATIO);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const hasAttemptedWorkspaceRef = useRef(false);

  const video = useQuery({
    queryKey: queryKeys.learning.video(lesson.id),
    queryFn: () => requestJson<VideoPlayback>(`/learning/lessons/${lesson.id}/video`),
  });

  const codeAlong = useQuery({
    queryKey: queryKeys.learning.codeAlong(lesson.id),
    queryFn: () => requestJson<CodeAlongMetadata>(`/learning/lessons/${lesson.id}/code-along`),
  });

  const snapshots = useMemo(
    () => codeAlong.data?.snapshots ?? video.data?.codeSnapshots ?? [],
    [codeAlong.data?.snapshots, video.data?.codeSnapshots],
  );

  const isCodeAlongRuntime = isCodeAlongRuntimeEnabled({
    configEnabled: codeAlong.data?.enabled,
    instructorSnapshotCount: snapshots.length,
  });

  const practiceSteps = useQuery({
    queryKey: queryKeys.learning.practiceSteps(lesson.id),
    enabled: isCodeAlongRuntime,
    queryFn: () => requestJson<{ readonly practiceSteps: readonly VideoPracticeStep[] }>(`/learning/lessons/${lesson.id}/practice-steps`),
  });

  const transcriptTracks = useQuery({
    queryKey: queryKeys.learning.transcriptTracks(lesson.id),
    queryFn: () => requestJson<{ readonly transcripts: readonly StudentTranscriptTrack[] }>(`/learning/lessons/${lesson.id}/transcripts`),
    staleTime: 60_000,
  });

  const transcript = useQuery({
    queryKey: queryKeys.learning.transcript(lesson.id, selectedTranscriptId),
    enabled: Boolean(selectedTranscriptId),
    queryFn: () =>
      requestJson<{ readonly transcript: StudentTranscript }>(
        `/learning/lessons/${lesson.id}/transcripts/${selectedTranscriptId}`,
      ),
    staleTime: 60_000,
  });

  const progressMutation = useMutation({
    mutationFn: (positionSeconds: number) =>
      requestJson(`/learning/videos/${video.data?.videoAssetId}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ positionSeconds }),
      }),
    meta: { suppressGlobalToast: true },
  });

  const checkpointMutation = useMutation({
    mutationFn: (checkpointId: string) =>
      requestJson(`/learning/checkpoints/${checkpointId}/complete`, {
        method: 'POST',
      }),
    onSuccess: () => {
      setActiveCheckpoint(null);
      toast.success('Checkpoint completed!');
      void queryClient.invalidateQueries({ queryKey: queryKeys.learning.video(lesson.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.courses.progress(courseId) });
    },
    onError: (error) => {
      toast.error('Checkpoint update failed', error instanceof Error ? error.message : undefined);
    },
  });

  const completePracticeStep = useMutation({
    mutationFn: (step: VideoPracticeStep) =>
      requestJson(`/learning/practice-steps/${step.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ workspaceId }),
      }),
    onMutate: () => {
      setPracticeCheckError(null);
    },
    onSuccess: (_data, step) => {
      toast.success('Practice step completed');
      setCompletedPracticeStepId(step.id);
      setSkippedPracticeStepId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.learning.practiceSteps(lesson.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.learning.video(lesson.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.courses.progress(courseId) });
    },
    onError: (error) => {
      setPracticeCheckError(error instanceof Error ? error.message : 'Not completed yet');
    },
  });

  const skipPracticeStep = useMutation({
    mutationFn: (step: VideoPracticeStep) =>
      requestJson(`/learning/practice-steps/${step.id}/skip`, {
        method: 'POST',
      }),
    onSuccess: (_data, step) => {
      toast.info('Practice step skipped');
      setSkippedPracticeStepId(step.id);
      setCompletedPracticeStepId(step.id);
      setPracticeCheckError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.learning.practiceSteps(lesson.id) });
    },
    onError: (error) => {
      toast.error('Unable to skip step', error instanceof Error ? error.message : undefined);
    },
  });

  const openWorkspaceMutation = useMutation({
    mutationFn: (checkpointId: string) =>
      requestJson<{ readonly workspace: Workspace }>(`/learning/checkpoints/${checkpointId}/workspace`, {
        method: 'POST',
      }),
    meta: { suppressGlobalToast: true },
    onSuccess: (data) => {
      setWorkspaceId(data.workspace.id);
      setMobileMode('code');
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(data.workspace.id) });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to initialize checkpoint workspace';
      toast.error('Workspace unavailable', msg);
    },
  });

  const openLessonWorkspace = useMutation({
    mutationFn: (targetLessonId: string) =>
      requestJson<{ readonly workspace: Workspace }>(`/learning/lessons/${targetLessonId}/workspace`, {
        method: 'POST',
      }),
    meta: { suppressGlobalToast: true },
    onSuccess: (data) => {
      setWorkspaceId(data.workspace.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(data.workspace.id) });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Code-along workspace is not configured for this lesson';
      setWorkspaceError(msg);
    },
  });

  useEffect(() => {
    hasAttemptedWorkspaceRef.current = false;
    triggeredPracticeIdsRef.current = new Set();
    previousPracticeSecondRef.current = 0;
    setWorkspaceId(null);
    setWorkspaceError(null);
    setActivePracticeStep(null);
    setCompletedPracticeStepId(null);
    setSkippedPracticeStepId(null);
    setPracticeCheckError(null);
    setSecondaryPanel(null);
  }, [lesson.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setLayoutMode(parseStoredVideoLayoutMode(window.localStorage.getItem(VIDEO_CODE_LAYOUT_STORAGE_KEY)));
    setSplitRatio(parseStoredVideoSplitRatio(window.localStorage.getItem(VIDEO_CODE_SPLIT_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(VIDEO_CODE_LAYOUT_STORAGE_KEY, layoutMode);
    window.localStorage.setItem(VIDEO_CODE_SPLIT_STORAGE_KEY, String(splitRatio));
  }, [layoutMode, splitRatio]);

  useEffect(() => {
    if (!isResizingSplit) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = splitContainerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return;
      }

      const nextRatio = ((event.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(parseStoredVideoSplitRatio(String(nextRatio)));
      setLayoutMode('SPLIT');
    }

    function handlePointerUp() {
      setIsResizingSplit(false);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isResizingSplit]);

  // Auto-load workspace for video code-along lessons. Instructor snapshots are enough
  // to make the runtime interactive; student code is opened independently.
  useEffect(() => {
    if (!shouldOpenLessonWorkspace({
      isCodeAlongRuntime,
      workspaceId,
      hasAttemptedWorkspace: hasAttemptedWorkspaceRef.current,
      isOpeningWorkspace: openLessonWorkspace.isPending,
    })) {
      return;
    }

    if (codeAlong.data?.workspaceId) {
      setWorkspaceId(codeAlong.data.workspaceId);
      return;
    }

    hasAttemptedWorkspaceRef.current = true;
    openLessonWorkspace.mutate(lesson.id);
  }, [codeAlong.data?.workspaceId, isCodeAlongRuntime, lesson.id, openLessonWorkspace.isPending, openLessonWorkspace.mutate, workspaceId]);

  const selectedSnapshot = useMemo(() => {
    if (snapshots.length === 0) return undefined;
    return selectSnapshotAtOrBefore(currentSecond, snapshots);
  }, [currentSecond, snapshots]);
  const subtitleText = subtitlesEnabled ? subtitleTextForTime(transcript.data?.transcript, currentSecond) : null;

  useEffect(() => {
    const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(`codesync.subtitle.${lesson.id}`);
    if (!saved) {
      return;
    }

    try {
      const preference = JSON.parse(saved) as { enabled?: boolean; language?: string };
      setSubtitlesEnabled(Boolean(preference.enabled));
      const preferredId = preferredTranscriptTrackId(transcriptTracks.data?.transcripts ?? [], preference.language ?? null);
      if (preferredId) {
        setSelectedTranscriptId(preferredId);
      }
    } catch {
      setSubtitlesEnabled(false);
    }
  }, [lesson.id, transcriptTracks.data?.transcripts]);

  useEffect(() => {
    if (selectedTranscriptId || !transcriptTracks.data?.transcripts.length) {
      return;
    }
    setSelectedTranscriptId(preferredTranscriptTrackId(transcriptTracks.data.transcripts, null));
  }, [selectedTranscriptId, transcriptTracks.data?.transcripts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const selectedLanguage = transcriptTracks.data?.transcripts.find((track) => track.id === selectedTranscriptId)?.language ?? null;
    window.localStorage.setItem(
      `codesync.subtitle.${lesson.id}`,
      JSON.stringify({ enabled: subtitlesEnabled, language: selectedLanguage }),
    );
  }, [lesson.id, selectedTranscriptId, subtitlesEnabled, transcriptTracks.data?.transcripts]);

  const snapshotDetail = useQuery({
    queryKey: queryKeys.learning.snapshot(selectedSnapshot?.id),
    enabled: Boolean(selectedSnapshot?.id),
    queryFn: async () => {
      const response = await requestJson<{ readonly codeSnapshot: CodeSnapshotDetail }>(
        `/learning/code-snapshots/${selectedSnapshot?.id}`,
      );
      return response.codeSnapshot;
    },
  });

  const handleProgress = useCallback(
    (positionSeconds: number) => {
      if (!video.data?.videoAssetId || positionSeconds < 0) return;
      progressMutation.mutate(positionSeconds);
    },
    [progressMutation.mutate, video.data?.videoAssetId],
  );

  const handleTimeChange = useCallback((positionSeconds: number) => {
    const nextSecond = Math.floor(positionSeconds);
    setCurrentSecond((previous) => {
      return previous === nextSecond ? previous : nextSecond;
    });

    const step = findPracticeStepCrossed(
      previousPracticeSecondRef.current,
      nextSecond,
      practiceSteps.data?.practiceSteps ?? [],
      triggeredPracticeIdsRef.current,
    );
    previousPracticeSecondRef.current = nextSecond;

    if (shouldPauseForPracticeStep(learningMode, step)) {
      triggeredPracticeIdsRef.current.add(step!.id);
      setActivePracticeStep(step);
      setCompletedPracticeStepId(null);
      setSkippedPracticeStepId(null);
      setPracticeCheckError(null);
      setSecondaryPanel(null);
      setPracticePauseSignal((value) => value + 1);
      setMobileMode('code');
    }
  }, [learningMode, practiceSteps.data?.practiceSteps]);

  if (video.isLoading) {
    return (
      <div className="py-12">
        <PageSkeleton />
      </div>
    );
  }

  if (video.isError || !video.data) {
    return (
      <Card className="p-8 text-center space-y-4 max-w-xl mx-auto border-border">
        <VideoIcon className="mx-auto h-12 w-12 text-muted-foreground/40" />
        <h3 className="text-lg font-bold text-foreground">Video Stream Unavailable</h3>
        <p className="text-xs text-muted-foreground">
          The video for this lesson is currently processing or has not been published yet.
        </p>
      </Card>
    );
  }

  const activePracticeIndex = activePracticeStep
    ? (practiceSteps.data?.practiceSteps.findIndex((step) => step.id === activePracticeStep.id) ?? -1)
    : -1;
  const activePracticeStepCompleted = Boolean(activePracticeStep && completedPracticeStepId === activePracticeStep.id);
  const splitColumns = codeAlongSplitColumns(layoutMode, splitRatio);

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-2">
        <div className="inline-grid grid-cols-2 rounded-md bg-muted p-1 text-xs">
          {(['FOLLOW', 'PRACTICE'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setLearningMode(mode)}
              className={`rounded px-3 py-1.5 font-semibold transition-colors ${learningMode === mode ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}
            >
              {mode === 'FOLLOW' ? 'Follow' : 'Practice'}
            </button>
          ))}
        </div>
        {activePracticeStep ? (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Practice paused at {formatTime(activePracticeStep.timestampSeconds)}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {isCodeAlongRuntime ? (
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 text-xs font-semibold text-foreground shadow-2xs hover:bg-muted">
                <Columns className="h-3.5 w-3.5" />
                <span>{layoutMode === 'SPLIT' ? 'Split' : layoutMode === 'FOCUS_VIDEO' ? 'Focus Video' : 'Focus Code'}</span>
              </summary>
              <div className="absolute right-0 z-30 mt-2 min-w-40 rounded-lg border border-border bg-card p-1.5 text-xs shadow-lg">
                {([
                  ['SPLIT', 'Split'],
                  ['FOCUS_VIDEO', 'Focus Video'],
                  ['FOCUS_CODE', 'Focus Code'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLayoutMode(mode)}
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left font-medium text-foreground hover:bg-muted"
                  >
                    <span>{label}</span>
                    {layoutMode === mode ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : null}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          <details className="relative">
            <summary className="inline-flex h-8 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-border/70 bg-card text-xs font-semibold text-foreground shadow-2xs hover:bg-muted">
              ...
            </summary>
            <div className="absolute right-0 z-30 mt-2 min-w-48 rounded-lg border border-border bg-card p-1.5 text-xs shadow-lg">
              {([
                ['transcript', t('learning.transcript'), <Captions key="transcript" className="h-3.5 w-3.5" />],
                ['timeline', t('learning.codeTimeline'), <Columns key="timeline" className="h-3.5 w-3.5" />],
                ['instructor', t('learning.instructorCode'), <Eye key="instructor" className="h-3.5 w-3.5" />],
              ] as const).map(([panel, label, icon]) => (
                <button
                  key={panel}
                  type="button"
                  onClick={() => setSecondaryPanel(panel)}
                  className="inline-flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-medium text-foreground hover:bg-muted"
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMobileMode('code');
                  setCompareSignal((value) => value + 1);
                }}
                disabled={!workspaceId || !snapshotDetail.data}
                className="inline-flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Columns className="h-3.5 w-3.5" />
                <span>{t('learning.compare')}</span>
              </button>
            </div>
          </details>
        </div>
      </div>

      {secondaryPanel ? (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close secondary panel"
            onClick={() => setSecondaryPanel(null)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2 text-xs">
              <span className="font-semibold text-foreground">
                {secondaryPanel === 'transcript'
                  ? t('learning.transcript')
                  : secondaryPanel === 'timeline'
                    ? t('learning.codeTimeline')
                    : t('learning.instructorCode')}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setSecondaryPanel(null)}>
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {secondaryPanel === 'transcript' ? (
                <TranscriptPanel
                  transcript={transcript.data?.transcript ?? null}
                  tracks={transcriptTracks.data?.transcripts ?? []}
                  currentSecond={currentSecond}
                  selectedTrackId={selectedTranscriptId}
                  onSelectTrack={(trackId) => {
                    setSelectedTranscriptId(trackId);
                    setSubtitlesEnabled(true);
                  }}
                  onSeek={(seconds) => {
                    setRequestedSeekSecond(seconds);
                    setCurrentSecond(seconds);
                    previousPracticeSecondRef.current = seconds;
                    setTimeout(() => setRequestedSeekSecond(null), 100);
                  }}
                />
              ) : null}

              {secondaryPanel === 'timeline' ? (
                <InstructorTimeline
                  currentSecond={currentSecond}
                  snapshots={snapshots}
                  activeSnapshotId={selectedSnapshot?.id}
                  onSelectSnapshot={(snap) => {
                    setRequestedSeekSecond(snap.timestampSeconds);
                    setCurrentSecond(snap.timestampSeconds);
                    previousPracticeSecondRef.current = snap.timestampSeconds;
                    setTimeout(() => setRequestedSeekSecond(null), 100);
                  }}
                />
              ) : null}

              {secondaryPanel === 'instructor' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{t('learning.instructorCode')}</span>
                    {snapshotDetail.data ? (
                      <Badge tone="info" className="text-[10px]">
                        {formatTime(snapshotDetail.data.timestampSeconds)}
                      </Badge>
                    ) : null}
                  </div>
                  {snapshotDetail.data ? (
                    snapshotDetail.data.files.map((file) => (
                      <div key={file.path} className="overflow-hidden rounded-md border border-border">
                        <div className="border-b border-border bg-muted/70 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {file.path}
                        </div>
                        <pre className="max-h-72 overflow-auto bg-card p-3 font-mono text-xs text-foreground">
                          <code>{file.content}</code>
                        </pre>
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center text-xs text-muted-foreground">No instructor snapshot at this timestamp.</p>
                  )}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      <div
        ref={splitContainerRef}
        className="flex min-h-0 flex-col gap-3 xl:grid xl:h-[calc(100vh-220px)] xl:min-h-[620px] xl:gap-0"
        style={isCodeAlongRuntime ? { gridTemplateColumns: splitColumns } : undefined}
      >
        <section className="min-w-0 overflow-hidden border border-border bg-black xl:flex xl:h-full xl:flex-col xl:rounded-l-xl">
          <div className="relative">
            <VideoPlayer
              playbackUrl={video.data.playbackUrl}
              initialPositionSeconds={video.data.progress.lastPositionSeconds}
              checkpoints={video.data.checkpoints}
              onCheckpointCrossed={setActiveCheckpoint}
              onProgress={handleProgress}
              onTimeChange={handleTimeChange}
              seekToSeconds={requestedSeekSecond}
              subtitleText={subtitleText}
              pauseSignal={practicePauseSignal}
              resumeSignal={practiceResumeSignal}
              playbackBlocked={Boolean(activePracticeStep && !activePracticeStepCompleted)}
            />
            {activePracticeStep ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
                <div className="w-full max-w-sm rounded-xl border border-white/15 bg-black/70 p-4 text-white shadow-xl">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                    Practice Step {activePracticeIndex + 1} of {practiceSteps.data?.practiceSteps.length ?? 0}
                  </p>
                  <h3 className="mt-2 text-base font-bold leading-6">{activePracticeStep.title}</h3>
                  <p className="mt-2 text-sm leading-5 text-white/80">
                    {activePracticeStep.instruction ?? 'Complete this practice task in My Code.'}
                  </p>
                  <div className="mt-3 inline-flex rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80">
                    {activePracticeStepCompleted
                      ? skippedPracticeStepId === activePracticeStep.id
                        ? 'Skipped'
                        : 'Step completed'
                      : activePracticeStep.behavior}
                  </div>
                  {practiceCheckError && !activePracticeStepCompleted ? (
                    <p className="mt-3 rounded-md bg-red-500/15 px-2 py-1.5 text-xs text-red-100">
                      Not completed yet. {practiceCheckError}
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setMobileMode('code')}
                    >
                      Open My Code
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSecondaryPanel('instructor')}
                    >
                      Show Instructor Code
                    </Button>
                    {activePracticeStepCompleted ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setActivePracticeStep(null);
                          setCompletedPracticeStepId(null);
                          setSkippedPracticeStepId(null);
                          setPracticeCheckError(null);
                          setPracticeResumeSignal((value) => value + 1);
                        }}
                      >
                        Continue Video
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        isLoading={completePracticeStep.isPending}
                        onClick={() => completePracticeStep.mutate(activePracticeStep)}
                      >
                        {activePracticeStep.verificationMode === 'TESTS' ? 'Submit' : 'Check'}
                      </Button>
                    )}
                    {activePracticeStep.behavior === 'GUIDED' && !activePracticeStep.required && !activePracticeStepCompleted ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={skipPracticeStep.isPending}
                        onClick={() => skipPracticeStep.mutate(activePracticeStep)}
                      >
                        Skip
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between border-t border-border bg-card p-3 text-xs text-muted-foreground">
            <span>{t('learning.watched', { value: video.data.progress.watchedPercent })}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`font-semibold ${subtitlesEnabled ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setSubtitlesEnabled((value) => !value)}
                aria-label={t('learning.subtitles')}
              >
                CC
              </button>
              <span className="font-mono">{formatTime(currentSecond)} / {formatTime(video.data.durationSeconds)}</span>
            </div>
          </div>
          {activeCheckpoint ? (
            <div className="border-t border-border bg-card p-3">
              <CheckpointPanel
                checkpoint={activeCheckpoint}
                lessonId={lesson.id}
                onOpenWorkspace={(chkId) => openWorkspaceMutation.mutate(chkId)}
                onCompleteInfo={(chkId) => checkpointMutation.mutate(chkId)}
                onClose={() => setActiveCheckpoint(null)}
              />
            </div>
          ) : null}
        </section>

        {isCodeAlongRuntime ? (
          <button
            type="button"
            aria-label="Resize video and code panes"
            onPointerDown={(event) => {
              event.preventDefault();
              setIsResizingSplit(true);
              setLayoutMode('SPLIT');
            }}
            className={`hidden cursor-col-resize touch-none bg-border/70 transition-colors hover:bg-primary/50 xl:block ${isResizingSplit ? 'bg-primary/60' : ''}`}
          />
        ) : null}

        {isCodeAlongRuntime ? (
          <section className="min-w-0 overflow-y-auto border border-border bg-background p-3 xl:h-full xl:rounded-r-xl">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">{t('learning.myCode')}</span>
              {workspaceId ? <span className="text-muted-foreground">Editable workspace</span> : null}
            </div>
            {activePracticeStep ? (
              <div className={`mb-2 rounded-lg border px-3 py-2 ${activePracticeStepCompleted ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-[11px] font-semibold ${activePracticeStepCompleted ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      Practice Step {activePracticeIndex + 1} / {practiceSteps.data?.practiceSteps.length ?? 0} · {activePracticeStepCompleted ? 'Ready' : activePracticeStep.behavior}
                    </p>
                    {practiceCheckError && !activePracticeStepCompleted ? (
                      <p className="mt-0.5 truncate text-xs font-medium text-red-600 dark:text-red-300">
                        Not completed yet. {practiceCheckError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSecondaryPanel('instructor')}
                      leftIcon={<Eye className="h-3.5 w-3.5" />}
                    >
                      Show Code
                    </Button>
                    {activePracticeStepCompleted ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setActivePracticeStep(null);
                          setCompletedPracticeStepId(null);
                          setSkippedPracticeStepId(null);
                          setPracticeCheckError(null);
                          setPracticeResumeSignal((value) => value + 1);
                        }}
                      >
                        Continue Video
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        isLoading={completePracticeStep.isPending}
                        onClick={() => completePracticeStep.mutate(activePracticeStep)}
                        leftIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
                      >
                        {activePracticeStep.verificationMode === 'TESTS' ? 'Submit' : 'Check'}
                      </Button>
                    )}
                    {activePracticeStep.behavior === 'GUIDED' && !activePracticeStep.required && !activePracticeStepCompleted ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={skipPracticeStep.isPending}
                        onClick={() => skipPracticeStep.mutate(activePracticeStep)}
                        leftIcon={<SkipForward className="h-3.5 w-3.5" />}
                      >
                        Skip
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {workspaceId ? (
              <StudentWorkspace
                workspaceId={workspaceId}
                snapshotId={selectedSnapshot?.id}
                referenceSnapshot={snapshotDetail.data}
                mobileMode={mobileMode === 'transcript' ? 'video' : mobileMode}
                editorHeight="min(52vh, 520px)"
                compareSignal={compareSignal}
              />
            ) : workspaceError ? (
              <Card className="space-y-3 border-dashed p-8 text-center">
                <Code className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <h3 className="text-sm font-semibold text-foreground">Unable to open your coding workspace.</h3>
                <p className="text-xs text-muted-foreground">{workspaceError}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    hasAttemptedWorkspaceRef.current = false;
                    setWorkspaceError(null);
                    openLessonWorkspace.mutate(lesson.id);
                  }}
                >
                  Retry
                </Button>
              </Card>
            ) : (
              <Card className="space-y-3 p-8 text-center">
                <Code className="mx-auto h-8 w-8 animate-pulse text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">Preparing Workspace...</h3>
                <p className="text-xs text-muted-foreground">Loading interactive development sandbox.</p>
              </Card>
            )}
          </section>
        ) : null}
      </div>

      {!isCodeAlongRuntime && snapshotDetail.data ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">
              {snapshotDetail.data.title ?? `${snapshotDetail.data.language} snapshot`}
            </span>
            <Badge tone="info" className="text-[10px]">
              at {formatTime(snapshotDetail.data.timestampSeconds)}
            </Badge>
          </div>
          {snapshotDetail.data.files.map((file) => (
            <div key={file.path} className="overflow-hidden rounded-md border border-border">
              <div className="border-b border-border bg-muted/70 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {file.path}
              </div>
              <pre className="max-h-48 overflow-auto bg-card p-3 font-mono text-xs text-foreground">
                <code>{file.content}</code>
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ==========================================
// 3. CODING LESSON VIEW
// ==========================================
interface CodingLessonViewProps {
  readonly lesson: LessonSummaryItem;
  readonly isCompleted: boolean;
  readonly nextLesson: LessonSummaryItem | null;
  readonly onSelectLesson: (lessonId: string) => void;
  readonly onCompleteLesson: (lessonId: string) => void;
  readonly isCompletingLesson: boolean;
}

function CodingLessonView({
  lesson,
  isCompleted,
  nextLesson: _nextLesson,
  onSelectLesson: _onSelectLesson,
  onCompleteLesson,
  isCompletingLesson: _isCompletingLesson,
}: CodingLessonViewProps) {
  const queryClient = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'problem' | 'code' | 'result'>('problem');
  const hasAttemptedWorkspaceRef = useRef(false);

  const openLessonWorkspace = useMutation({
    mutationFn: (targetLessonId: string) =>
      requestJson<{ readonly workspace: Workspace }>(`/learning/lessons/${targetLessonId}/workspace`, {
        method: 'POST',
      }),
    meta: { suppressGlobalToast: true },
    onSuccess: (data) => {
      setWorkspaceId(data.workspace.id);
      setWorkspaceError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(data.workspace.id) });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to initialize coding workspace';
      setWorkspaceError(msg);
    },
  });

  const handleRetry = useCallback(() => {
    hasAttemptedWorkspaceRef.current = false;
    setWorkspaceError(null);
    openLessonWorkspace.mutate(lesson.id);
  }, [lesson.id, openLessonWorkspace]);

  useEffect(() => {
    hasAttemptedWorkspaceRef.current = false;
    setWorkspaceError(null);
    setWorkspaceId(null);
  }, [lesson.id]);

  useEffect(() => {
    if (!workspaceId && !hasAttemptedWorkspaceRef.current && !openLessonWorkspace.isPending) {
      hasAttemptedWorkspaceRef.current = true;
      openLessonWorkspace.mutate(lesson.id);
    }
  }, [lesson.id, openLessonWorkspace, workspaceId]);

  return (
    <div className="w-full max-w-[1700px] mx-auto space-y-4">
      {/* Mobile Tab Navigation */}
      <div className="flex sm:hidden border-b border-border bg-muted/30 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setMobileTab('problem')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            mobileTab === 'problem' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Problem
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('code')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            mobileTab === 'code' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Workspace
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(380px,1fr)_minmax(640px,1.6fr)]">
        {/* Left Column: Coding Problem / Task Statement */}
        <div className={`space-y-5 ${mobileTab === 'problem' ? 'block' : 'hidden lg:block'}`}>
          <div className="rounded-xl border border-border/70 bg-card p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-5">
            <div className="border-b border-border/60 pb-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                  Coding Task
                </span>
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                  </span>
                ) : null}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{lesson.title}</h1>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-foreground/90 leading-relaxed">
              {lesson.description ? (
                <ArticleMarkdownPreview content={lesson.description} />
              ) : (
                <p className="text-muted-foreground text-xs">
                  Solve the task in the workspace on the right. Run your code to test and submit when ready.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Monaco Student Workspace */}
        <div className={`space-y-4 ${mobileTab !== 'problem' ? 'block' : 'hidden lg:block'}`}>
          {workspaceId ? (
            <StudentWorkspace
              workspaceId={workspaceId}
              editorHeight="480px"
              onPass={() => {
                if (!isCompleted) {
                  onCompleteLesson(lesson.id);
                }
              }}
            />
          ) : workspaceError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Unable to open coding workspace</h3>
                <p className="text-xs text-muted-foreground">{workspaceError}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={handleRetry} isLoading={openLessonWorkspace.isPending}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-card p-12 text-center space-y-3">
              <Code className="mx-auto h-8 w-8 text-muted-foreground animate-pulse" />
              <h3 className="text-sm font-semibold text-foreground">Opening Coding Workspace...</h3>
              <p className="text-xs text-muted-foreground">Preparing isolated execution sandbox.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. PROJECT LESSON VIEW
// ==========================================
interface ProjectLessonViewProps {
  readonly lesson: LessonSummaryItem;
  readonly isCompleted: boolean;
  readonly nextLesson: LessonSummaryItem | null;
  readonly onSelectLesson: (lessonId: string) => void;
  readonly onCompleteLesson: (lessonId: string) => void;
  readonly isCompletingLesson: boolean;
}

function ProjectLessonView({
  lesson,
  isCompleted,
  nextLesson: _nextLesson,
  onSelectLesson: _onSelectLesson,
  onCompleteLesson: _onCompleteLesson,
  isCompletingLesson: _isCompletingLesson,
}: ProjectLessonViewProps) {
  const queryClient = useQueryClient();
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [deploymentUrl, setDeploymentUrl] = useState('');
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Check if checkpoints exist for this project lesson
  const videoData = useQuery({
    queryKey: queryKeys.learning.video(lesson.id),
    queryFn: () => requestJson<VideoPlayback>(`/learning/lessons/${lesson.id}/video`).catch(() => null),
  });

  const projectCheckpoint = videoData.data?.checkpoints?.find((c) => c.type === 'PROJECT');
  const checkpointId = projectCheckpoint?.id;

  const submitProject = useMutation({
    mutationFn: () => {
      if (!checkpointId) throw new Error('No project checkpoint configured for this lesson');
      return requestJson<{ readonly id: string; readonly status: string; readonly commitSha: string }>(
        `/learning/checkpoints/${checkpointId}/project-submissions`,
        {
          method: 'POST',
          body: JSON.stringify({
            repositoryUrl: repositoryUrl.trim(),
            ...(branch.trim() ? { branch: branch.trim() } : {}),
            ...(deploymentUrl.trim() ? { deploymentUrl: deploymentUrl.trim() } : {}),
          }),
        },
      );
    },
    onSuccess: (data) => {
      setSubmissionId(data.id);
      if (checkpointId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.project.submissions(checkpointId) });
      }
    },
  });

  const latestSubmissions = useQuery({
    queryKey: checkpointId ? queryKeys.project.submissions(checkpointId) : ['project-none'],
    enabled: Boolean(checkpointId),
    queryFn: () =>
      requestJson<{
        readonly items: readonly {
          readonly id: string;
          readonly commitSha: string;
          readonly status: ProjectSubmissionDetail['status'];
          readonly score: number | null;
          readonly passed: boolean | null;
          readonly submittedAt: string;
        }[];
      }>(`/learning/checkpoints/${checkpointId}/project-submissions`),
  });

  const activeSubmissionId = submissionId ?? latestSubmissions.data?.items[0]?.id ?? null;

  const submission = useQuery({
    queryKey: queryKeys.project.submission(activeSubmissionId),
    enabled: Boolean(activeSubmissionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'CLONING' || status === 'GRADING' ? 2000 : false;
    },
    queryFn: async () => {
      const response = await requestJson<{ readonly submission: ProjectSubmissionDetail }>(
        `/project-submissions/${activeSubmissionId}`,
      );
      return response.submission;
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(460px,1fr)]">
      {/* Left Column: Project Requirements */}
      <Card className="p-6 sm:p-8 space-y-6 border border-border shadow-xs">
        <div className="border-b border-border pb-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="info">Capstone Project</Badge>
            {isCompleted ? (
              <Badge tone="success" className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Completed
              </Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{lesson.title}</h1>
        </div>

        <div className="space-y-4">
          {lesson.description ? (
            <ArticleMarkdownPreview content={lesson.description} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Build your project repository on GitHub and submit the public URL on the right for automated rubric evaluation.
            </p>
          )}
        </div>
      </Card>

      {/* Right Column: GitHub Repository Submission */}
      <Card className="p-6 border border-border space-y-5">
        <CardHeader className="p-0 pb-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <Github className="h-5 w-5 text-foreground" />
            <span>Submit Project Repository</span>
          </CardTitle>
          <CardDescription>
            Provide your public GitHub repository. Our grading worker will clone and execute test rubrics.
          </CardDescription>
        </CardHeader>

        {checkpointId ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">
                GitHub Repository URL <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="https://github.com/username/project-repo"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">Branch (Optional)</label>
                <Input
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">Deployment URL (Optional)</label>
                <Input
                  placeholder="https://..."
                  value={deploymentUrl}
                  onChange={(e) => setDeploymentUrl(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <Button
              onClick={() => submitProject.mutate()}
              isLoading={submitProject.isPending}
              disabled={!repositoryUrl.trim() || submitProject.isPending}
              className="w-full"
            >
              Submit for Automated Grading
            </Button>

            {/* Submission Status & Rubric Feedback */}
            {submission.data ? (
              <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Submission Status</span>
                  <Badge tone={submission.data.status === 'PASSED' ? 'success' : submission.data.status === 'FAILED' ? 'danger' : 'warning'}>
                    {submission.data.status}
                  </Badge>
                </div>

                <div className="text-xs font-mono text-muted-foreground space-y-1">
                  <div>Commit: <strong className="text-foreground">{submission.data.commitSha.slice(0, 7)}</strong></div>
                  {submission.data.score !== null ? (
                    <div>Score: <strong className="text-foreground">{submission.data.score} / 100</strong></div>
                  ) : null}
                </div>

                {submission.data.grade?.results && submission.data.grade.results.length > 0 ? (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <span className="text-xs font-semibold text-foreground">Rubric Results</span>
                    {submission.data.grade.results.map((result) => (
                      <div key={result.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                        <span>{result.title}</span>
                        <span className="font-mono">{result.scoreEarned} / {result.maxScore}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-6 text-center text-muted-foreground space-y-2 border border-dashed rounded-lg">
            <FileCode className="mx-auto h-8 w-8 opacity-40" />
            <p className="text-xs font-medium">Project checkpoint grading will become active once configured by the instructor.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ==========================================
// 5. QUIZ LESSON VIEW (Roadmap Notice)
// ==========================================
interface QuizLessonViewProps {
  readonly lesson: LessonSummaryItem;
  readonly isCompleted: boolean;
  readonly nextLesson: LessonSummaryItem | null;
  readonly onSelectLesson: (lessonId: string) => void;
  readonly onCompleteLesson: (lessonId: string) => void;
  readonly isCompletingLesson: boolean;
}

function QuizLessonView({
  lesson,
  isCompleted,
  nextLesson,
  onSelectLesson,
}: QuizLessonViewProps) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [showUnansweredConfirm, setShowUnansweredConfirm] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [attemptMessage, setAttemptMessage] = useState<string | null>(null);
  const submittingAttemptIdRef = useRef<string | null>(null);
  const submittedAttemptIdsRef = useRef(new Set<string>());

  const quiz = useQuery({
    queryKey: queryKeys.learning.quiz(lesson.id),
    queryFn: () => requestJson<{ readonly quiz: StudentQuiz }>(`/learning/lessons/${lesson.id}/quiz`),
  });

  const attempt = useQuery({
    queryKey: queryKeys.learning.quizAttempt(attemptId),
    enabled: Boolean(attemptId),
    queryFn: () => requestJson<{ readonly attempt: QuizAttemptDetail }>(`/learning/quiz-attempts/${attemptId}`),
  });

  const startAttempt = useMutation({
    mutationFn: (quizId: string) =>
      requestJson<{ readonly attempt: QuizAttemptDetail }>(`/learning/quizzes/${quizId}/attempts`, { method: 'POST' }),
    onSuccess: (data) => {
      if (data.attempt.status !== 'IN_PROGRESS') {
        setAttemptId(data.attempt.id);
        setAnswers(answersFromAttempt(data.attempt));
        setReviewMode(false);
        setAttemptMessage(t('learning.quizAttemptAlreadySubmitted'));
        return;
      }

      setAttemptId(data.attempt.id);
      setAnswers(answersFromAttempt(data.attempt));
      setQuestionIndex(0);
      setReviewMode(false);
      setAttemptMessage(null);
    },
    onError: (error) => {
      toast.error(t('common.error'), error instanceof Error ? error.message : undefined);
    },
  });

  const submitAttempt = useMutation({
    mutationFn: (input: {
      readonly attemptId: string;
      readonly answers: ReturnType<typeof buildQuizSubmitAnswers>;
    }) =>
      requestJson<{ readonly attempt: QuizAttemptDetail }>(`/learning/quiz-attempts/${input.attemptId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: input.answers }),
      }),
    onSuccess: async (data) => {
      submittedAttemptIdsRef.current.add(data.attempt.id);
      setAttemptId(data.attempt.id);
      setAnswers(answersFromAttempt(data.attempt));
      setShowUnansweredConfirm(false);
      setReviewMode(false);
      setAttemptMessage(null);
      queryClient.setQueryData(queryKeys.learning.quizAttempt(data.attempt.id), data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.quiz(lesson.id) }),
        queryClient.invalidateQueries({ queryKey: ['learning', 'course-progress'] }),
      ]);
    },
    onError: (error, variables) => {
      if (isAlreadySubmittedQuizError(error)) {
        setAttemptMessage(t('learning.quizAttemptAlreadySubmitted'));
        setShowUnansweredConfirm(false);
        void queryClient
          .fetchQuery({
            queryKey: queryKeys.learning.quizAttempt(variables.attemptId),
            queryFn: () =>
              requestJson<{ readonly attempt: QuizAttemptDetail }>(`/learning/quiz-attempts/${variables.attemptId}`),
          })
          .then((data) => {
            setAttemptId(data.attempt.id);
            setAnswers(answersFromAttempt(data.attempt));
            if (data.attempt.status === 'SUBMITTED') {
              submittedAttemptIdsRef.current.add(data.attempt.id);
              setReviewMode(false);
            }
            void queryClient.invalidateQueries({ queryKey: queryKeys.learning.quiz(lesson.id) });
          })
          .catch((refreshError: unknown) => {
            toast.error(t('common.error'), refreshError instanceof Error ? refreshError.message : undefined);
          });
        return;
      }

      toast.error(t('common.error'), error instanceof Error ? error.message : undefined);
    },
    onSettled: (_data, _error, variables) => {
      if (submittingAttemptIdRef.current === variables.attemptId) {
        submittingAttemptIdRef.current = null;
      }
    },
  });

  const currentQuiz = quiz.data?.quiz;
  const currentAttempt = attempt.data?.attempt;
  const questions = currentQuiz?.questions ?? [];
  const currentQuestion = questions[questionIndex];
  const isSubmitted = currentAttempt?.status === 'SUBMITTED';
  const canEditAttempt = currentAttempt
    ? isEditableQuizAttempt(currentAttempt) && !submittedAttemptIdsRef.current.has(currentAttempt.id)
    : false;
  const unansweredCount = countUnansweredQuestions(questions, answers);

  useEffect(() => {
    setQuestionIndex(0);
    setAnswers({});
    setAttemptId(null);
    setReviewMode(false);
    setAttemptMessage(null);
    submittingAttemptIdRef.current = null;
    submittedAttemptIdsRef.current.clear();
  }, [lesson.id]);

  useEffect(() => {
    const resumeAttemptId = findResumeAttemptId(currentQuiz?.attempts, attemptId);
    if (resumeAttemptId && resumeAttemptId !== attemptId) {
      setAttemptId(resumeAttemptId);
    }
  }, [attemptId, currentQuiz?.attempts]);

  function toggleOption(questionId: string, optionId: string, type: string) {
    if (!canEditAttempt) {
      return;
    }

    setAnswers((current) => selectQuizOption(current, questionId, optionId, type === 'MULTIPLE_CHOICE' ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE'));
  }

  function submitCurrentAttempt() {
    if (!currentAttempt || !canEditAttempt || submittingAttemptIdRef.current || submitAttempt.isPending) {
      return;
    }

    const payload = buildQuizSubmitAnswers(questions, answers);
    submittingAttemptIdRef.current = currentAttempt.id;
    submitAttempt.mutate({ attemptId: currentAttempt.id, answers: payload });
  }

  function handleSubmit() {
    if (!currentAttempt || !canEditAttempt || submitAttempt.isPending || submittingAttemptIdRef.current) {
      return;
    }

    if (unansweredCount > 0) {
      setShowUnansweredConfirm(true);
      return;
    }

    submitCurrentAttempt();
  }

  if (quiz.isLoading) {
    return <PageSkeleton />;
  }

  if (quiz.isError || !currentQuiz) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border p-8 text-center">
        <HelpCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">{lesson.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {quiz.error instanceof Error ? quiz.error.message : t('learning.quizUnavailable')}
        </p>
      </div>
    );
  }

  if (!currentAttempt && currentQuiz.attempts[0]?.status === 'SUBMITTED' && !startAttempt.isPending) {
    const latest = currentQuiz.attempts[0];
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="rounded-2xl bg-card p-8 shadow-xs ring-1 ring-border/60">
          <Badge tone={latest.passed ? 'success' : 'warning'}>{latest.passed ? t('learning.passed') : t('learning.failed')}</Badge>
          <h1 className="mt-3 text-2xl font-bold text-foreground">{currentQuiz.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {latest.percentage ?? 0}% · {t('learning.passingScore')}: {currentQuiz.passScore}%
          </p>
          {attemptMessage ? (
            <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400">{attemptMessage}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => startAttempt.mutate(currentQuiz.id)} isLoading={startAttempt.isPending}>
              {latest.passed ? t('learning.tryAgain') : t('learning.tryAgain')}
            </Button>
            {nextLesson && latest.passed ? (
              <Button variant="secondary" onClick={() => onSelectLesson(nextLesson.id)}>
                {t('common.next')}: {nextLesson.title}
              </Button>
            ) : null}
          </div>
        </div>
        {currentQuiz.attempts.length > 0 ? (
          <QuizAttemptHistory attempts={currentQuiz.attempts} />
        ) : null}
      </div>
    );
  }

  if (!currentAttempt) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="rounded-2xl bg-card p-8 shadow-xs ring-1 ring-border/60">
          <Badge tone="info">{t('learning.quiz')}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">{currentQuiz.title}</h1>
          {currentQuiz.instructions ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{currentQuiz.instructions}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{currentQuiz.questionCount} {t('learning.question').toLowerCase()}</span>
            <span>{t('learning.passingScore')}: {currentQuiz.passScore}%</span>
          </div>
          <Button className="mt-6" onClick={() => startAttempt.mutate(currentQuiz.id)} isLoading={startAttempt.isPending}>
            {t('learning.startQuiz')}
          </Button>
        </div>
        {currentQuiz.attempts.length > 0 ? <QuizAttemptHistory attempts={currentQuiz.attempts} /> : null}
      </div>
    );
  }

  if (isSubmitted) {
    const correctCount = currentAttempt.answers.filter((answer) => answer.isCorrect).length;

    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="rounded-2xl bg-card p-8 shadow-xs ring-1 ring-border/60">
          <Badge tone={currentAttempt.passed ? 'success' : 'warning'}>
            {currentAttempt.passed ? t('learning.passed') : t('learning.failed')}
          </Badge>
          <h1 className="mt-3 text-3xl font-bold text-foreground">{currentAttempt.percentage ?? 0}%</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {correctCount} / {questions.length} {t('learning.question').toLowerCase()} · {t('learning.passingScore')}: {currentQuiz.passScore}%
          </p>
          {!currentAttempt.passed ? (
            <p className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">{t('learning.notPassedYet')}</p>
          ) : isCompleted ? (
            <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">{t('learning.lessonCompleted')}</p>
          ) : null}
          {attemptMessage ? (
            <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400">{attemptMessage}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setReviewMode((value) => !value)}>
              {t('learning.reviewAnswers')}
            </Button>
            <Button onClick={() => startAttempt.mutate(currentQuiz.id)} isLoading={startAttempt.isPending}>
              {t('learning.tryAgain')}
            </Button>
            {nextLesson && currentAttempt.passed ? (
              <Button variant="secondary" onClick={() => onSelectLesson(nextLesson.id)}>
                {t('common.next')}: {nextLesson.title}
              </Button>
            ) : null}
          </div>
        </div>

        {reviewMode ? (
          <QuizReview questions={questions} attempt={currentAttempt} />
        ) : null}
        <QuizAttemptHistory attempts={currentQuiz.attempts} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="rounded-2xl bg-card p-6 shadow-xs ring-1 ring-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge tone="info">{currentQuestion?.type === 'MULTIPLE_CHOICE' ? t('learning.multipleChoice') : t('learning.singleChoice')}</Badge>
            <h1 className="mt-3 text-2xl font-bold text-foreground">{currentQuiz.title}</h1>
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {t('learning.question')} {questionIndex + 1} / {questions.length}
          </span>
        </div>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((questionIndex + 1) / Math.max(questions.length, 1)) * 100}%` }}
          />
        </div>

        {currentQuestion ? (
          <div className="mt-8 space-y-5">
            <div>
              <h2 className="text-xl font-semibold leading-8 text-foreground">{currentQuestion.prompt}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{currentQuestion.points} pts</p>
            </div>

            <div className="space-y-3">
              {currentQuestion.options.map((option) => {
                const selected = (answers[currentQuestion.id] ?? []).includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!canEditAttempt}
                    onClick={() => toggleOption(currentQuestion.id, option.id, currentQuestion.type)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/70 bg-muted/30 text-foreground hover:bg-muted/60'
                    } ${canEditAttempt ? '' : 'cursor-not-allowed opacity-70'}`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                      currentQuestion.type === 'SINGLE_CHOICE' ? 'rounded-full' : 'rounded-md'
                    } ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50'}`}>
                      {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span>{option.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            disabled={questionIndex === 0}
            onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))}
          >
            {t('common.previous')}
          </Button>
          <div className="flex gap-2">
            {questionIndex < questions.length - 1 ? (
              <Button onClick={() => setQuestionIndex((value) => Math.min(questions.length - 1, value + 1))}>
                {t('common.next')}
              </Button>
            ) : (
              <Button onClick={handleSubmit} isLoading={submitAttempt.isPending} disabled={!canEditAttempt}>
                {t('learning.submitQuiz')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={showUnansweredConfirm}
        onClose={() => setShowUnansweredConfirm(false)}
        title={t('learning.unansweredQuestions')}
        description={t('learning.unansweredPrompt', { count: unansweredCount })}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowUnansweredConfirm(false)}>
            {t('learning.continueQuiz')}
          </Button>
          <Button
            onClick={() => {
              setShowUnansweredConfirm(false);
              submitCurrentAttempt();
            }}
            isLoading={submitAttempt.isPending}
            disabled={!canEditAttempt}
          >
            {t('learning.submitAnyway')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function QuizAttemptHistory({ attempts }: { readonly attempts: readonly StudentQuiz['attempts'][number][] }) {
  const { t } = useI18n();

  if (attempts.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-card p-5 shadow-xs ring-1 ring-border/60">
      <h3 className="text-sm font-semibold text-foreground">{t('learning.attempts')}</h3>
      <div className="mt-3 divide-y divide-border/60">
        {attempts.map((attempt) => (
          <div key={attempt.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-muted-foreground">{t('learning.attempts')} {attempt.attemptNumber}</span>
            <span className="font-medium text-foreground">{attempt.percentage ?? '-'}%</span>
            <Badge tone={attempt.passed ? 'success' : attempt.status === 'SUBMITTED' ? 'warning' : 'neutral'}>
              {attempt.status === 'SUBMITTED' ? (attempt.passed ? t('learning.passed') : t('learning.failed')) : t('learning.inProgress')}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuizReview({
  questions,
  attempt,
}: {
  readonly questions: readonly StudentQuiz['questions'][number][];
  readonly attempt: QuizAttemptDetail;
}) {
  const { t } = useI18n();
  const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));

  return (
    <div className="space-y-4">
      {questions.map((question) => {
        const answer = answerByQuestion.get(question.id);
        const selected = new Set(answer?.selectedOptionIds ?? []);
        const correct = new Set(answer?.correctOptionIds ?? []);

        return (
          <div key={question.id} className="rounded-2xl bg-card p-5 shadow-xs ring-1 ring-border/60">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{question.prompt}</h3>
              <Badge tone={answer?.isCorrect ? 'success' : 'danger'}>
                {answer?.isCorrect ? t('learning.passed') : t('learning.failed')}
              </Badge>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {question.options.map((option) => (
                <div
                  key={option.id}
                  className={`rounded-lg px-3 py-2 ${
                    correct.has(option.id)
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : selected.has(option.id)
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {option.text}
                </div>
              ))}
            </div>
            {answer?.explanation ? (
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{t('learning.explanation')}: </span>
                {answer.explanation}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// 6. UNSUPPORTED LESSON FALLBACK
// ==========================================
function UnsupportedLessonView({ lesson }: { readonly lesson: LessonSummaryItem }) {
  return (
    <Card className="p-8 text-center space-y-3 max-w-lg mx-auto border-destructive/20">
      <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
      <h3 className="text-base font-bold text-foreground">Unsupported Lesson Type</h3>
      <p className="text-xs text-muted-foreground">
        Lesson &quot;{lesson.title}&quot; has unrecognized type: <code>{lesson.lessonType}</code>.
      </p>
    </Card>
  );
}
