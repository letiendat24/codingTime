'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { VideoPlayer } from '../../../../components/video-player';
import { Badge, Button, Card, CardContent, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '../../../../design-system';
import {
  type CodeSnapshotDetail,
  type CodeAlongMetadata,
  type CourseDetail,
  type CourseLearningSummary,
  type ExecutionDetail,
  type JudgeSubmissionDetail,
  type ProjectSubmissionDetail,
  type VideoCheckpoint,
  type VideoPlayback,
  type Workspace,
  type WorkspaceFile,
  type WorkspaceRevision,
  requestJson,
} from '../../../../lib/api';
import { compareCodeFiles, selectNextSnapshot, selectSnapshotAtOrBefore } from '../../../../lib/video-learning';
import { queryKeys } from '../../../../lib/query/keys';
import { useI18n } from '../../../../providers/i18n-provider';
import { useTheme } from '../../../../providers/theme-provider';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
const MonacoDiffEditor = dynamic(() => import('@monaco-editor/react').then((module) => module.DiffEditor), { ssr: false });

interface CourseDetailResponse {
  readonly course: CourseDetail;
}

export default function CourseLearnPage() {
  const params = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [selectedVideoLessonId, setSelectedVideoLessonId] = useState<string | null>(null);
  const course = useQuery({
    queryKey: queryKeys.courses.detail(params.slug),
    queryFn: () => requestJson<CourseDetailResponse>(`/courses/${params.slug}`),
  });
  const progress = useQuery({
    queryKey: queryKeys.courses.progress(course.data?.course.id),
    enabled: Boolean(course.data?.course.id),
    queryFn: () => requestJson<CourseLearningSummary>(`/learning/courses/${course.data?.course.id}/progress`),
  });
  const accessLesson = useMutation({
    mutationFn: (lessonId: string) => requestJson(`/learning/lessons/${lessonId}/access`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses.progress(course.data?.course.id) }),
  });
  const completeLesson = useMutation({
    mutationFn: (lessonId: string) => requestJson(`/learning/lessons/${lessonId}/complete`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses.progress(course.data?.course.id) }),
  });
  const selectedLesson = useMemo(() => course.data?.course.modules
    .flatMap((module) => module.lessons)
    .find((lesson) => lesson.id === selectedVideoLessonId), [course.data?.course.modules, selectedVideoLessonId]);

  if (course.isLoading || progress.isLoading) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><PageSkeleton /></main>;
  }

  if (course.isError || progress.isError) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <ErrorState title={t('common.error')} description="Enroll first, then retry this page." onRetry={() => {
          void course.refetch();
          void progress.refetch();
        }} />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <Link className="text-sm text-muted-foreground hover:text-foreground" href="/my-courses">
        {t('learning.backToCourses')}
      </Link>
      <PageHeader
        title={course.data?.course.title ?? t('learning.courseLearning')}
        description={selectedLesson ? `${t('learning.courseLearning')} · ${selectedLesson.title}` : t('courses.publishedCatalog')}
      />

      {progress.data ? (
        <Card className="mb-6">
          <CardContent>
          <div className="flex items-center justify-between gap-4">
            <p className="font-medium">{progress.data.progress.progressPercent}% complete</p>
            <p className="text-sm text-muted-foreground">
              {t('courses.lessons', { completed: progress.data.progress.completedLessons, total: progress.data.progress.totalLessons })}
            </p>
          </div>
          <div className="mt-3 h-2 rounded bg-muted">
            <div className="h-2 rounded bg-primary" style={{ width: `${progress.data.progress.progressPercent}%` }} />
          </div>
          </CardContent>
        </Card>
      ) : null}

      {selectedVideoLessonId ? (
        <section className="mb-8">
          <LessonVideo lessonId={selectedVideoLessonId} />
        </section>
      ) : null}

      <div className="space-y-6">
        {course.data?.course.modules.map((module) => (
          <Card key={module.id}>
            <CardContent>
            <h2 className="font-semibold">{module.title}</h2>
            <div className="mt-4 space-y-3">
              {module.lessons.map((lesson) => {
                const lessonProgress = progress.data?.lessons.find((item) => item.id === lesson.id);
                const status = lessonProgress?.status ?? 'NOT_STARTED';

                return (
                  <div key={lesson.id} className="flex flex-col gap-3 rounded-md bg-muted p-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="flex-1">
                      <p className="font-medium">{lesson.title}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <StatusBadge value={status} />
                        <Badge>{lesson.lessonType}</Badge>
                      </div>
                    </div>
                    <Button
                      variant={selectedVideoLessonId === lesson.id ? 'primary' : 'secondary'}
                      type="button"
                      onClick={() => {
                        accessLesson.mutate(lesson.id);

                        if (lesson.lessonType === 'VIDEO') {
                          setSelectedVideoLessonId(lesson.id);
                        }
                      }}
                    >
                      {t('learning.openLesson')}
                    </Button>
                    {lesson.lessonType !== 'VIDEO' ? (
                      <Button
                        type="button"
                        onClick={() => completeLesson.mutate(lesson.id)}
                      >
                        {t('learning.markComplete')}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

function LessonVideo({ lessonId }: { readonly lessonId: string }) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [activeCheckpoint, setActiveCheckpoint] = useState<VideoCheckpoint | null>(null);
  const [mobileMode, setMobileMode] = useState<'video' | 'code' | 'instructor' | 'output'>('video');
  const [currentSecond, setCurrentSecond] = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [requestedSeekSecond, setRequestedSeekSecond] = useState<number | null>(null);
  const video = useQuery({
    queryKey: queryKeys.learning.video(lessonId),
    queryFn: () => requestJson<VideoPlayback>(`/learning/lessons/${lessonId}/video`),
  });
  const codeAlong = useQuery({
    queryKey: queryKeys.learning.codeAlong(lessonId),
    queryFn: () => requestJson<CodeAlongMetadata>(`/learning/lessons/${lessonId}/code-along`),
  });
  const progressMutation = useMutation({
    mutationFn: (positionSeconds: number) =>
      requestJson(`/learning/videos/${video.data?.videoAssetId}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ positionSeconds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.learning.video(lessonId) });
      void queryClient.invalidateQueries({ queryKey: ['learning', 'course-progress'] });
    },
  });
  const checkpointMutation = useMutation({
    mutationFn: (checkpointId: string) =>
      requestJson(`/learning/checkpoints/${checkpointId}/complete`, {
        method: 'POST',
      }),
    onSuccess: () => {
      setActiveCheckpoint(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.learning.video(lessonId) });
      void queryClient.invalidateQueries({ queryKey: ['learning', 'course-progress'] });
    },
  });
  const openWorkspace = useMutation({
    mutationFn: (checkpointId: string) =>
      requestJson<{ readonly workspace: Workspace }>(`/learning/checkpoints/${checkpointId}/workspace`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      setWorkspaceId(data.workspace.id);
      setMobileMode('code');
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(data.workspace.id) });
    },
  });
  const openLessonWorkspace = useMutation({
    mutationFn: () =>
      requestJson<{ readonly workspace: Workspace }>(`/learning/lessons/${lessonId}/workspace`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      setWorkspaceId(data.workspace.id);
      setMobileMode('code');
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(data.workspace.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.learning.codeAlong(lessonId) });
    },
  });
  const selectedSnapshot = useMemo(() => {
    const snapshots = codeAlong.data?.snapshots ?? video.data?.codeSnapshots;

    if (!snapshots) {
      return undefined;
    }

    return selectSnapshotAtOrBefore(currentSecond, snapshots);
  }, [codeAlong.data?.snapshots, currentSecond, video.data?.codeSnapshots]);
  const nextSnapshot = useMemo(() => {
    const snapshots = codeAlong.data?.snapshots ?? video.data?.codeSnapshots;

    if (!snapshots) {
      return undefined;
    }

    return selectNextSnapshot(currentSecond, snapshots);
  }, [codeAlong.data?.snapshots, currentSecond, video.data?.codeSnapshots]);
  const snapshot = useQuery({
    queryKey: queryKeys.learning.snapshot(selectedSnapshot?.id),
    enabled: Boolean(selectedSnapshot?.id),
    queryFn: async () => {
      const response = await requestJson<{ readonly codeSnapshot: CodeSnapshotDetail }>(
        `/learning/code-snapshots/${selectedSnapshot?.id}`,
      );

      return response.codeSnapshot;
    },
  });
  const handleProgress = useCallback((positionSeconds: number) => {
    if (!video.data?.videoAssetId || positionSeconds < 0) {
      return;
    }

    progressMutation.mutate(positionSeconds);
  }, [progressMutation, video.data?.videoAssetId]);
  const handleTimeChange = useCallback((positionSeconds: number) => {
    setCurrentSecond((previous) => {
      const next = Math.floor(positionSeconds);
      return previous === next ? previous : next;
    });
  }, []);

  useEffect(() => {
    if (!codeAlong.data?.enabled) {
      return;
    }

    if (workspaceId || openLessonWorkspace.isPending) {
      return;
    }

    if (codeAlong.data.workspaceId) {
      setWorkspaceId(codeAlong.data.workspaceId);
      return;
    }

    openLessonWorkspace.mutate();
  }, [codeAlong.data, openLessonWorkspace, workspaceId]);

  if (video.isLoading) {
    return <PageSkeleton />;
  }

  if (video.isError) {
    return <ErrorState title={t('common.error')} description={video.error.message} onRetry={() => void video.refetch()} />;
  }

  return video.data ? (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">CodeSync Studio</h2>
            <p className="text-sm text-muted-foreground">
              {selectedSnapshot ? `${t('learning.currentInstructorState')}: ${formatTime(selectedSnapshot.timestampSeconds)} — ${selectedSnapshot.title ?? selectedSnapshot.language}` : t('learning.noSnapshots')}
            </p>
          </div>
          {nextSnapshot ? <Badge tone="info">{t('learning.nextSnapshot')}: {formatTime(nextSnapshot.timestampSeconds)}</Badge> : null}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 lg:hidden">
          {([
            ['video', t('learning.video')],
            ['code', t('learning.myCode')],
            ['instructor', t('learning.instructorCode')],
            ['output', t('learning.output')],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              className={`rounded-md border px-2 py-2 text-xs ${mobileMode === mode ? 'bg-card font-medium' : 'bg-background text-muted-foreground'}`}
              type="button"
              onClick={() => setMobileMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    <div className="grid w-full gap-4 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
      <div className={`${mobileMode === 'video' ? 'block' : 'hidden'} space-y-3 lg:block`}>
        <VideoPlayer
          playbackUrl={video.data.playbackUrl}
          initialPositionSeconds={video.data.progress.lastPositionSeconds}
          checkpoints={video.data.checkpoints}
          onCheckpointCrossed={setActiveCheckpoint}
          onProgress={handleProgress}
          onTimeChange={handleTimeChange}
          seekToSeconds={requestedSeekSecond}
        />
        {codeAlong.data?.enabled ? (
          <SnapshotTimeline
            currentSecond={currentSecond}
            snapshots={codeAlong.data.snapshots}
            {...(selectedSnapshot?.id ? { activeSnapshotId: selectedSnapshot.id } : {})}
            onSelect={(snapshot) => {
              setRequestedSeekSecond(snapshot.timestampSeconds);
              setCurrentSecond(snapshot.timestampSeconds);
            }}
          />
        ) : null}
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{t('learning.watched', { value: video.data.progress.watchedPercent })}</span>
          <span>{formatTime(currentSecond)} / {formatTime(video.data.durationSeconds)}</span>
        </div>
        {activeCheckpoint ? (
          <div className="rounded-md border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{activeCheckpoint.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeCheckpoint.description ?? `${activeCheckpoint.type} checkpoint at ${formatTime(activeCheckpoint.timestampSeconds)}`}
                </p>
              </div>
              {activeCheckpoint.required ? <Badge tone="warning">Required</Badge> : null}
            </div>
            <div className="mt-3 flex gap-2">
              {activeCheckpoint.type === 'INFO' ? (
                <button
                  className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                  type="button"
                  onClick={() => checkpointMutation.mutate(activeCheckpoint.id)}
                >
                  {t('common.open')}
                </button>
              ) : activeCheckpoint.type === 'CODING' ? (
                <button
                  className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                  type="button"
                  onClick={() => openWorkspace.mutate(activeCheckpoint.id)}
                >
                  {t('practice.openWorkspace')}
                </button>
              ) : activeCheckpoint.type === 'PROJECT' ? (
                <ProjectSubmissionForm checkpoint={activeCheckpoint} lessonId={lessonId} onClose={() => setActiveCheckpoint(null)} />
              ) : (
                <p className="text-sm text-muted-foreground">This checkpoint type will be handled by a future assessment flow.</p>
              )}
              {!activeCheckpoint.required ? (
                <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => setActiveCheckpoint(null)}>
                  {t('common.close')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <aside className={`${mobileMode === 'instructor' ? 'block' : 'hidden'} space-y-4 rounded-md border bg-card p-4 lg:block`}>
        <section>
          <h2 className="text-sm font-semibold">{t('learning.checkpoints')}</h2>
          <div className="mt-3 space-y-2">
            {video.data.checkpoints.length > 0 ? video.data.checkpoints.map((checkpoint) => (
              <button
                key={checkpoint.id}
                className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm"
                type="button"
                onClick={() => setActiveCheckpoint(checkpoint)}
              >
                <span>{checkpoint.title}</span>
                <span className="text-xs text-muted-foreground">{checkpoint.completed ? 'Done' : formatTime(checkpoint.timestampSeconds)}</span>
              </button>
            )) : <p className="text-sm text-muted-foreground">{t('learning.noCheckpoints')}</p>}
          </div>
        </section>
        <section>
          <h2 className="text-sm font-semibold">{t('learning.instructorCode')}</h2>
          {codeAlong.data?.enabled ? (
            <div className="mt-3 rounded-md border p-3 text-sm">
              <p>{t('learning.video')}: {formatTime(currentSecond)}</p>
              <p className="text-muted-foreground">
                {t('learning.currentInstructorState')}: {selectedSnapshot ? `${formatTime(selectedSnapshot.timestampSeconds)} - ${selectedSnapshot.title ?? selectedSnapshot.language}` : t('learning.noSnapshots')}
              </p>
              {nextSnapshot ? <p className="text-muted-foreground">{t('learning.nextSnapshot')}: {formatTime(nextSnapshot.timestampSeconds)} - {nextSnapshot.title ?? nextSnapshot.language}</p> : null}
              {selectedSnapshot ? (
                <button
                  className="mt-2 rounded-md border px-3 py-2 text-sm"
                  type="button"
                  onClick={() => setRequestedSeekSecond(selectedSnapshot.timestampSeconds)}
                >
                  {t('learning.video')}
                </button>
              ) : null}
            </div>
          ) : null}
          {snapshot.data ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">{snapshot.data.title ?? `${snapshot.data.language} snapshot`}</p>
              {snapshot.data.files.map((file) => (
                <div key={file.path} className="overflow-hidden rounded-md border">
                  <div className="bg-muted px-3 py-2 text-xs text-muted-foreground">{file.path}</div>
                  <pre className="max-h-72 overflow-auto p-3 text-xs"><code>{file.content}</code></pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {video.data.codeSnapshots.length > 0 ? 'Play the lesson to reach the next snapshot.' : t('learning.noSnapshots')}
            </p>
          )}
        </section>
      </aside>
      {workspaceId ? (
        <div className={`${mobileMode === 'code' || mobileMode === 'output' ? 'block' : 'hidden'} lg:col-span-2 lg:block`}>
          <CodeWorkspace
            workspaceId={workspaceId}
            mobileMode={mobileMode}
            {...(selectedSnapshot?.id ? { snapshotId: selectedSnapshot.id } : {})}
            {...(snapshot.data ? { referenceSnapshot: snapshot.data } : {})}
          />
        </div>
      ) : null}
    </div>
    </Card>
  ) : null;
}

function ProjectSubmissionForm({
  checkpoint,
  lessonId,
  onClose,
}: {
  readonly checkpoint: VideoCheckpoint;
  readonly lessonId: string;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [deploymentUrl, setDeploymentUrl] = useState('');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const submitProject = useMutation({
    mutationFn: () =>
      requestJson<{ readonly id: string; readonly status: string; readonly commitSha: string }>(
        `/learning/checkpoints/${checkpoint.id}/project-submissions`,
        {
          method: 'POST',
          body: JSON.stringify({
            repositoryUrl,
            ...(branch.trim() ? { branch: branch.trim() } : {}),
            ...(deploymentUrl.trim() ? { deploymentUrl: deploymentUrl.trim() } : {}),
          }),
        },
      ),
    onSuccess: (data) => {
      setSubmissionId(data.id);
      void queryClient.invalidateQueries({ queryKey: ['project-submissions', checkpoint.id] });
    },
  });
  const latestSubmissions = useQuery({
    queryKey: ['project-submissions', checkpoint.id],
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
      }>(`/learning/checkpoints/${checkpoint.id}/project-submissions`),
  });
  const activeSubmissionId = submissionId ?? latestSubmissions.data?.items[0]?.id ?? null;
  const submission = useQuery({
    queryKey: ['project-submission', activeSubmissionId],
    enabled: Boolean(activeSubmissionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'CLONING' || status === 'GRADING' ? 2000 : false;
    },
    queryFn: async () => {
      const response = await requestJson<{ readonly submission: ProjectSubmissionDetail }>(`/project-submissions/${activeSubmissionId}`);
      return response.submission;
    },
  });

  useEffect(() => {
    if (!submission.data?.passed) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ['lesson-video', lessonId] });
    void queryClient.invalidateQueries({ queryKey: ['course-progress'] });
  }, [lessonId, queryClient, submission.data?.passed]);

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-2">
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="https://github.com/owner/repository"
          value={repositoryUrl}
          onChange={(event) => setRepositoryUrl(event.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Branch, default main"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
          />
          <input
            className="rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Deployment URL, if required"
            value={deploymentUrl}
            onChange={(event) => setDeploymentUrl(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          type="button"
          disabled={!repositoryUrl || submitProject.isPending}
          onClick={() => submitProject.mutate()}
        >
          Submit project
        </button>
        <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {submission.data ? (
        <div className="rounded-md border p-3 text-sm">
          <p>Status: {submission.data.status.replaceAll('_', ' ')}</p>
          <p className="text-muted-foreground">Commit: {submission.data.commitSha.slice(0, 12)}</p>
          {submission.data.score !== null ? <p>Score: {submission.data.score}</p> : null}
          {submission.data.grade?.summary ? <p className="text-muted-foreground">{submission.data.grade.summary}</p> : null}
        </div>
      ) : null}
      {submitProject.isError ? <p className="text-sm text-red-600">{submitProject.error.message}</p> : null}
      {submission.isError ? <p className="text-sm text-red-600">{submission.error.message}</p> : null}
    </div>
  );
}

function SnapshotTimeline({
  currentSecond,
  activeSnapshotId,
  snapshots,
  onSelect,
}: {
  readonly currentSecond: number;
  readonly activeSnapshotId?: string;
  readonly snapshots: readonly { readonly id: string; readonly timestampSeconds: number; readonly title: string | null; readonly language: string }[];
  readonly onSelect: (snapshot: { readonly id: string; readonly timestampSeconds: number }) => void;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Instructor Code Timeline</span>
        <span className="text-muted-foreground">{formatTime(currentSecond)}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {snapshots.length > 0 ? snapshots.map((snapshot) => (
          <button
            key={snapshot.id}
            className={`min-w-36 rounded-md border px-3 py-2 text-left text-xs ${snapshot.id === activeSnapshotId ? 'border-primary bg-primary/10' : 'bg-muted'}`}
            type="button"
            onClick={() => onSelect(snapshot)}
          >
            <span className="block font-medium">{formatTime(snapshot.timestampSeconds)}</span>
            <span className="block truncate text-muted-foreground">{snapshot.title ?? snapshot.language}</span>
          </button>
        )) : <p className="text-sm text-muted-foreground">No instructor snapshots.</p>}
      </div>
    </div>
  );
}

function CodeWorkspace({
  workspaceId,
  mobileMode,
  snapshotId,
  referenceSnapshot,
}: {
  readonly workspaceId: string;
  readonly mobileMode?: 'video' | 'code' | 'instructor' | 'output';
  readonly snapshotId?: string;
  readonly referenceSnapshot?: CodeSnapshotDetail;
}) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<readonly WorkspaceFile[]>([]);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const workspace = useQuery({
    queryKey: queryKeys.workspace.detail(workspaceId),
    queryFn: async () => {
      const response = await requestJson<{ readonly workspace: Workspace }>(`/workspaces/${workspaceId}`);
      setDraftFiles(response.workspace.files);
      setSelectedPath((current) => current ?? response.workspace.entryFile);
      return response.workspace;
    },
  });
  const saveWorkspace = useMutation({
    mutationFn: (files: readonly WorkspaceFile[]) =>
      requestJson<{ readonly workspace: Workspace }>(`/workspaces/${workspaceId}/files`, {
        method: 'PUT',
        body: JSON.stringify({ files }),
      }),
    onSuccess: (data) => {
      setDraftFiles(data.workspace.files);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(workspaceId) });
    },
  });
  const importSnapshot = useMutation({
    mutationFn: () =>
      requestJson<{ readonly workspace: Workspace }>(`/workspaces/${workspaceId}/import-snapshot`, {
        method: 'POST',
        body: JSON.stringify({ snapshotId }),
      }),
    onSuccess: (data) => {
      setDraftFiles(data.workspace.files);
      setSelectedPath(data.workspace.entryFile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(workspaceId) });
    },
  });
  const revisions = useQuery({
    queryKey: queryKeys.workspace.revisions(workspaceId),
    queryFn: () => requestJson<{ readonly items: readonly WorkspaceRevision[] }>(`/workspaces/${workspaceId}/revisions`),
  });
  const restoreRevision = useMutation({
    mutationFn: (revisionId: string) =>
      requestJson<{ readonly workspace: Workspace }>(`/workspaces/${workspaceId}/revisions/${revisionId}/restore`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      setDraftFiles(data.workspace.files);
      setSelectedPath(data.workspace.entryFile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.revisions(workspaceId) });
    },
  });
  const runWorkspace = useMutation({
    mutationFn: async () => {
      await saveWorkspace.mutateAsync(draftFiles);
      return requestJson<{ readonly id: string; readonly status: string }>(`/workspaces/${workspaceId}/executions`, {
        method: 'POST',
      });
    },
    onSuccess: (data) => {
      setExecutionId(data.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.executions(workspaceId) });
    },
  });
  const execution = useQuery({
    queryKey: queryKeys.execution.detail(executionId),
    enabled: Boolean(executionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'RUNNING' ? 1000 : false;
    },
    queryFn: async () => {
      const response = await requestJson<{ readonly execution: ExecutionDetail }>(`/executions/${executionId}`);
      return response.execution;
    },
  });
  const submitWorkspace = useMutation({
    mutationFn: async () => {
      await saveWorkspace.mutateAsync(draftFiles);
      return requestJson<{ readonly id: string; readonly status: string }>(`/workspaces/${workspaceId}/submissions`, {
        method: 'POST',
      });
    },
    onSuccess: (data) => {
      setSubmissionId(data.id);
      void queryClient.invalidateQueries({ queryKey: ['workspace-submissions', workspaceId] });
    },
  });
  const submission = useQuery({
    queryKey: queryKeys.judge.submission(submissionId),
    enabled: Boolean(submissionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'RUNNING' ? 1000 : false;
    },
    queryFn: async () => {
      const response = await requestJson<{ readonly submission: JudgeSubmissionDetail }>(`/submissions/${submissionId}`);
      return response.submission;
    },
  });
  const activeFile = draftFiles.find((file) => file.path === selectedPath) ?? draftFiles[0];
  const comparison = useMemo(() => compareCodeFiles(draftFiles, referenceSnapshot?.files ?? []), [draftFiles, referenceSnapshot?.files]);
  const selectedDiff = comparison.files.find((file) => file.path === selectedDiffPath) ?? comparison.files[0];

  function updateActiveFile(content: string) {
    if (!activeFile) {
      return;
    }

    setDraftFiles((files) => files.map((file) => file.path === activeFile.path ? { ...file, content } : file));
  }

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('learning.myCode')}</h2>
          <p className="text-sm text-muted-foreground">{workspace.data?.language ?? 'javascript'} · {workspace.data?.entryFile ?? 'index.js'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {snapshotId ? (
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                if (window.confirm(`${t('learning.loadSnapshot')}\n\n${t('learning.importWarning')}`)) {
                  importSnapshot.mutate();
                }
              }}
            >
              {t('learning.loadSnapshot')}
            </Button>
          ) : null}
          <Button variant="secondary" type="button" onClick={() => saveWorkspace.mutate(draftFiles)}>{t('common.save')}</Button>
          <Button type="button" onClick={() => runWorkspace.mutate()}>{t('common.run')}</Button>
          <Button variant="secondary" type="button" onClick={() => setShowCompare((value) => !value)}>{t('learning.compare')}</Button>
          <Button type="button" onClick={() => submitWorkspace.mutate()}>{t('learning.submitJudge')}</Button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className={`${mobileMode === 'output' ? 'hidden' : 'block'} overflow-hidden rounded-md border lg:block`}>
          <div className="flex overflow-auto border-b bg-muted">
            {draftFiles.map((file) => (
              <button
                key={file.path}
                className={`px-3 py-2 text-sm ${file.path === activeFile?.path ? 'bg-background font-medium' : 'text-muted-foreground'}`}
                type="button"
                onClick={() => setSelectedPath(file.path)}
              >
                {file.path}
              </button>
            ))}
          </div>
          <MonacoEditor
            height="360px"
            language={workspace.data?.language === 'javascript' ? 'javascript' : 'plaintext'}
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
            value={activeFile?.content ?? ''}
            onChange={(value) => updateActiveFile(value ?? '')}
            options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 2 }}
          />
        </div>
        <div className={`${mobileMode === 'code' ? 'hidden' : 'block'} rounded-md border lg:block`}>
          <div className="border-b bg-muted px-3 py-2 text-sm font-medium">{t('learning.runOutput')}</div>
          <div className="space-y-3 p-3 text-sm">
            <p>{t('common.status')}: <StatusBadge value={execution.data?.status ?? runWorkspace.data?.status ?? 'IDLE'} /></p>
            {execution.data?.result ? (
              <>
                <pre className="max-h-36 overflow-auto rounded bg-muted p-2 text-xs">{execution.data.result.stdout || 'No stdout'}</pre>
                <pre className="max-h-36 overflow-auto rounded bg-muted p-2 text-xs">{execution.data.result.stderr || 'No stderr'}</pre>
                <p>Exit code: {execution.data.result.exitCode ?? 'n/a'}</p>
                <p>Execution time: {execution.data.result.durationMs} ms</p>
              </>
            ) : (
              <p className="text-muted-foreground">Run code to see stdout and stderr.</p>
            )}
          </div>
        </div>
        <div className={`${mobileMode === 'code' ? 'hidden' : 'block'} rounded-md border lg:block`}>
          <div className="border-b bg-muted px-3 py-2 text-sm font-medium">{t('learning.judgeResult')}</div>
          <div className="space-y-3 p-3 text-sm">
            <p>{t('common.status')}: <StatusBadge value={submission.data?.status ?? submitWorkspace.data?.status ?? 'IDLE'} /></p>
            {submission.data?.result ? (
              <>
                <p>Score: {submission.data.result.totalScore}/{submission.data.result.maxScore}</p>
                <p>Passed: {submission.data.result.passedTests}/{submission.data.result.totalTests}</p>
                <StatusBadge value={submission.data.result.passed ? 'PASSED' : 'FAILED'} />
                <div className="space-y-2">
                  {submission.data.result.testResults.map((result) => (
                    <div key={result.id} className="rounded border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>{result.name}</span>
                        <span>{result.scoreEarned}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{result.status.replaceAll('_', ' ')}</p>
                      {result.actualOutput !== null ? <pre className="mt-2 max-h-24 overflow-auto rounded bg-muted p-2 text-xs">{result.actualOutput || 'No output'}</pre> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Submit code to run the automated judge.</p>
            )}
          </div>
        </div>
        {showCompare ? (
          <div className="lg:col-span-2 rounded-md border">
            <div className="border-b bg-muted px-3 py-2 text-sm font-medium">{t('learning.compare')} · Instructor / Student</div>
            <div className="grid gap-4 p-3 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="space-y-2 text-sm">
                <p>{comparison.summary.total} files · {comparison.summary.unchanged} same · {comparison.summary.modified} modified · {comparison.summary.studentOnly} student only · {comparison.summary.instructorOnly} instructor only</p>
                {comparison.files.map((file) => (
                  <button
                    key={file.path}
                    className={`block w-full rounded-md border px-3 py-2 text-left text-xs ${file.path === selectedDiff?.path ? 'border-primary' : ''}`}
                    type="button"
                    onClick={() => setSelectedDiffPath(file.path)}
                  >
                    <span className="block truncate">{file.path}</span>
                    <span className="text-muted-foreground">{file.status.replaceAll('_', ' ')}</span>
                  </button>
                ))}
              </div>
              {selectedDiff ? (
                <MonacoDiffEditor
                  height="360px"
                  language={workspace.data?.language === 'typescript' ? 'typescript' : 'javascript'}
                  original={selectedDiff.instructorContent}
                  modified={selectedDiff.studentContent}
                  theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                  options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No instructor snapshot selected.</p>
              )}
            </div>
          </div>
        ) : null}
        {revisions.data?.items.length ? (
          <div className="lg:col-span-2 rounded-md border p-3 text-sm">
            <p className="font-medium">{t('learning.workspaceBackups')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {revisions.data.items.slice(0, 5).map((revision) => (
                <button
                  key={revision.id}
                  className="rounded-md border px-3 py-2 text-xs"
                  type="button"
                  onClick={() => {
                    if (window.confirm('Restore this workspace backup? Current files will be backed up first.')) {
                      restoreRevision.mutate(revision.id);
                    }
                  }}
                >
                  Restore {new Date(revision.createdAt).toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
