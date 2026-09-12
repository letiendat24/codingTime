'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code,
  FileCode,
  Github,
  HelpCircle,
  Terminal,
  Video as VideoIcon,
  AlertCircle,
  Columns,
} from 'lucide-react';
import { VideoPlayer } from '../../../components/video-player';
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, Input, PageSkeleton } from '../../../design-system';
import { ArticleMarkdownPreview } from '../../instructor/components/article-editor';
import {
  type CodeAlongMetadata,
  type CodeSnapshotDetail,
  type CourseDetail,
  type CourseLearningSummary,
  type ProjectSubmissionDetail,
  type VideoCheckpoint,
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
import { StudentWorkspace } from './student-workspace';

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
  nextLesson,
  onSelectLesson,
  onCompleteLesson,
  isCompletingLesson,
}: ArticleLessonViewProps) {
  const wordCount = lesson.description?.split(/\s+/).length || 0;
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Card className="p-6 sm:p-8 space-y-6 border border-border shadow-xs">
        <div className="border-b border-border pb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone="info">Article</Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {readTimeMinutes} min read
              </span>
            </div>
            {isCompleted ? (
              <Badge tone="success" className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Completed
              </Badge>
            ) : null}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{lesson.title}</h1>
        </div>

        <div className="py-2">
          {lesson.description ? (
            <ArticleMarkdownPreview content={lesson.description} />
          ) : (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <BookOpen className="mx-auto h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">This article does not have any content published yet.</p>
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-border flex flex-wrap items-center justify-between gap-4">
          <Button
            onClick={() => onCompleteLesson(lesson.id)}
            disabled={isCompletingLesson}
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isCompleted ? 'Completed' : 'Mark as Completed'}
          </Button>

          {nextLesson && (
            <Button
              variant="secondary"
              onClick={() => onSelectLesson(nextLesson.id)}
              className="flex items-center gap-1.5"
            >
              <span>Next: {nextLesson.title}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
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
  const [mobileMode, setMobileMode] = useState<'video' | 'code' | 'instructor' | 'output'>('video');
  const [currentSecond, setCurrentSecond] = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [requestedSeekSecond, setRequestedSeekSecond] = useState<number | null>(null);
  const hasAttemptedWorkspaceRef = useRef(false);

  const video = useQuery({
    queryKey: queryKeys.learning.video(lesson.id),
    queryFn: () => requestJson<VideoPlayback>(`/learning/lessons/${lesson.id}/video`),
  });

  const codeAlong = useQuery({
    queryKey: queryKeys.learning.codeAlong(lesson.id),
    queryFn: () => requestJson<CodeAlongMetadata>(`/learning/lessons/${lesson.id}/code-along`),
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
    setWorkspaceError(null);
  }, [lesson.id]);

  // Auto-load workspace if code-along is enabled
  useEffect(() => {
    if (!codeAlong.data?.enabled) return;
    if (workspaceId || hasAttemptedWorkspaceRef.current || openLessonWorkspace.isPending) return;

    if (codeAlong.data.workspaceId) {
      setWorkspaceId(codeAlong.data.workspaceId);
      return;
    }

    hasAttemptedWorkspaceRef.current = true;
    openLessonWorkspace.mutate(lesson.id);
  }, [codeAlong.data?.enabled, codeAlong.data?.workspaceId, lesson.id, openLessonWorkspace, workspaceId]);

  const snapshots = useMemo(
    () => codeAlong.data?.snapshots ?? video.data?.codeSnapshots ?? [],
    [codeAlong.data?.snapshots, video.data?.codeSnapshots],
  );

  const selectedSnapshot = useMemo(() => {
    if (snapshots.length === 0) return undefined;
    return selectSnapshotAtOrBefore(currentSecond, snapshots);
  }, [currentSecond, snapshots]);

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
    [progressMutation, video.data?.videoAssetId],
  );

  const handleTimeChange = useCallback((positionSeconds: number) => {
    setCurrentSecond((previous) => {
      const next = Math.floor(positionSeconds);
      return previous === next ? previous : next;
    });
  }, []);

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

  const isCodeAlongEnabled = Boolean(codeAlong.data?.enabled);

  return (
    <div className="space-y-4">
      {/* Mobile Mode Selector */}
      <div className="grid grid-cols-4 gap-1.5 lg:hidden rounded-lg bg-muted p-1 text-xs">
        {([
          ['video', t('learning.video'), <VideoIcon key="v" className="h-3.5 w-3.5 mr-1 inline" />],
          ['code', t('learning.myCode'), <Code key="c" className="h-3.5 w-3.5 mr-1 inline" />],
          ['instructor', t('learning.instructorCode'), <Columns key="i" className="h-3.5 w-3.5 mr-1 inline" />],
          ['output', t('learning.output'), <Terminal key="o" className="h-3.5 w-3.5 mr-1 inline" />],
        ] as const).map(([mode, label, icon]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setMobileMode(mode)}
            className={`flex items-center justify-center rounded-md py-1.5 text-xs font-medium transition-colors ${
              mobileMode === mode ? 'bg-card text-foreground font-bold shadow-xs' : 'text-muted-foreground'
            }`}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Main Studio View */}
      <div className={isCodeAlongEnabled ? 'grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(480px,1.25fr)]' : 'max-w-4xl mx-auto'}>
        {/* Left Column: Video Player, Checkpoints, and Instructor Timeline */}
        <div className={`${mobileMode === 'video' || mobileMode === 'instructor' ? 'block' : 'hidden'} lg:block space-y-4`}>
          <div className={`${mobileMode === 'video' ? 'block' : 'hidden'} lg:block overflow-hidden rounded-xl border border-border bg-black shadow-md`}>
            <VideoPlayer
              playbackUrl={video.data.playbackUrl}
              initialPositionSeconds={video.data.progress.lastPositionSeconds}
              checkpoints={video.data.checkpoints}
              onCheckpointCrossed={setActiveCheckpoint}
              onProgress={handleProgress}
              onTimeChange={handleTimeChange}
              seekToSeconds={requestedSeekSecond}
            />
            <div className="flex items-center justify-between bg-card p-3 text-xs text-muted-foreground border-t border-border">
              <span>{t('learning.watched', { value: video.data.progress.watchedPercent })}</span>
              <span className="font-mono">{formatTime(currentSecond)} / {formatTime(video.data.durationSeconds)}</span>
            </div>
          </div>

          {/* Active Checkpoint Notice */}
          {activeCheckpoint ? (
            <CheckpointPanel
              checkpoint={activeCheckpoint}
              lessonId={lesson.id}
              onOpenWorkspace={(chkId) => openWorkspaceMutation.mutate(chkId)}
              onCompleteInfo={(chkId) => checkpointMutation.mutate(chkId)}
              onClose={() => setActiveCheckpoint(null)}
            />
          ) : null}

          {/* Instructor Code Timeline (if milestones exist) */}
          {snapshots.length > 0 ? (
            <div className={`${mobileMode === 'instructor' || mobileMode === 'video' ? 'block' : 'hidden'} lg:block`}>
              <InstructorTimeline
                currentSecond={currentSecond}
                snapshots={snapshots}
                activeSnapshotId={selectedSnapshot?.id}
                onSelectSnapshot={(snap) => {
                  setRequestedSeekSecond(snap.timestampSeconds);
                  setCurrentSecond(snap.timestampSeconds);
                }}
              />
            </div>
          ) : null}

          {/* Instructor Code Snapshot Details */}
          {snapshotDetail.data ? (
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
                  <div className="bg-muted/70 px-3 py-1.5 font-mono text-[11px] text-muted-foreground border-b border-border">
                    {file.path}
                  </div>
                  <pre className="max-h-48 overflow-auto p-3 text-xs font-mono bg-card text-foreground">
                    <code>{file.content}</code>
                  </pre>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Right Column: Student Workspace (if Code-Along enabled) */}
        {isCodeAlongEnabled ? (
          <div className={`${mobileMode === 'code' || mobileMode === 'output' ? 'block' : 'hidden'} lg:block space-y-4`}>
            {workspaceId ? (
              <StudentWorkspace
                workspaceId={workspaceId}
                snapshotId={selectedSnapshot?.id}
                referenceSnapshot={snapshotDetail.data}
                mobileMode={mobileMode}
              />
            ) : workspaceError ? (
              <Card className="p-8 text-center space-y-3 border-dashed">
                <Code className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <h3 className="text-sm font-semibold text-foreground">Code-Along Workspace</h3>
                <p className="text-xs text-muted-foreground">{workspaceError}</p>
              </Card>
            ) : (
              <Card className="p-8 text-center space-y-3">
                <Code className="mx-auto h-8 w-8 text-muted-foreground animate-pulse" />
                <h3 className="text-base font-semibold text-foreground">Preparing Workspace...</h3>
                <p className="text-xs text-muted-foreground">Loading interactive development sandbox.</p>
              </Card>
            )}
          </div>
        ) : null}
      </div>
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
  nextLesson,
  onSelectLesson,
  onCompleteLesson,
  isCompletingLesson,
}: CodingLessonViewProps) {
  const queryClient = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const hasAttemptedWorkspaceRef = useRef(false);

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
      const msg = err instanceof Error ? err.message : 'Unable to initialize coding workspace';
      setWorkspaceError(msg);
    },
  });

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(500px,1.4fr)]">
      {/* Left Column: Coding Problem / Task Statement */}
      <div className="space-y-5">
        <Card className="p-6 border border-border shadow-xs space-y-5">
          <div className="border-b border-border pb-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="info" className="text-xs">Coding Task</Badge>
              {isCompleted ? (
                <Badge tone="success" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                </Badge>
              ) : null}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{lesson.title}</h1>
          </div>

          <div className="space-y-4 text-sm text-foreground">
            {lesson.description ? (
              <ArticleMarkdownPreview content={lesson.description} />
            ) : (
              <p className="text-muted-foreground text-xs">
                Solve the task in the workspace on the right. Run your code to test and submit when ready.
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <Button
              size="sm"
              onClick={() => onCompleteLesson(lesson.id)}
              disabled={isCompletingLesson}
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isCompleted ? 'Completed' : 'Mark as Completed'}
            </Button>

            {nextLesson && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onSelectLesson(nextLesson.id)}
                className="flex items-center gap-1.5"
              >
                <span>Next: {nextLesson.title}</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Right Column: Interactive Monaco Student Workspace */}
      <div className="space-y-4">
        {workspaceId ? (
          <StudentWorkspace workspaceId={workspaceId} />
        ) : workspaceError ? (
          <Card className="p-8 text-center space-y-3 border-dashed">
            <Code className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <h3 className="text-sm font-semibold text-foreground">Workspace Unavailable</h3>
            <p className="text-xs text-muted-foreground">{workspaceError}</p>
          </Card>
        ) : (
          <Card className="p-12 text-center space-y-3">
            <Code className="mx-auto h-8 w-8 text-muted-foreground animate-pulse" />
            <h3 className="text-base font-semibold text-foreground">Opening Coding Workspace...</h3>
            <p className="text-xs text-muted-foreground">Preparing isolated execution sandbox.</p>
          </Card>
        )}
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
  nextLesson,
  onSelectLesson,
  onCompleteLesson,
  isCompletingLesson,
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

        <div className="pt-6 border-t border-border flex flex-wrap items-center justify-between gap-4">
          <Button
            size="sm"
            onClick={() => onCompleteLesson(lesson.id)}
            disabled={isCompletingLesson}
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isCompleted ? 'Completed' : 'Mark as Completed'}
          </Button>

          {nextLesson && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onSelectLesson(nextLesson.id)}
              className="flex items-center gap-1.5"
            >
              <span>Next: {nextLesson.title}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
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
  onCompleteLesson,
  isCompletingLesson,
}: QuizLessonViewProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Card className="p-8 text-center space-y-5 border border-border shadow-xs">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <HelpCircle className="h-7 w-7" />
          </div>
        </div>

        <div className="space-y-2">
          <Badge tone="warning">Quiz Assessment</Badge>
          <h1 className="text-2xl font-bold text-foreground">{lesson.title}</h1>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Interactive quiz questionnaires are planned in the upcoming assessment engine. You can review the lesson objectives below and mark this step as completed.
          </p>
        </div>

        {lesson.description ? (
          <div className="text-left rounded-lg bg-muted/40 p-4 border text-xs">
            <ArticleMarkdownPreview content={lesson.description} />
          </div>
        ) : null}

        <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <Button
            size="sm"
            onClick={() => onCompleteLesson(lesson.id)}
            disabled={isCompletingLesson}
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isCompleted ? 'Completed' : 'Mark as Completed'}
          </Button>

          {nextLesson && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onSelectLesson(nextLesson.id)}
              className="flex items-center gap-1.5"
            >
              <span>Next: {nextLesson.title}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
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
