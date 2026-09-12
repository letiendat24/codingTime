'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  type CodeSnapshotDetail,
  type CourseDetail,
  type ProjectCheckpointConfigResponse,
  type ProjectRubricCriterion,
  type VideoCheckpoint,
  type VideoStatus,
  type VideoUploadIntent,
  requestJson,
} from '../../../../lib/api';

interface CourseResponse {
  readonly course: CourseDetail;
}

export default function InstructorCourseDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [moduleTitle, setModuleTitle] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonType, setLessonType] = useState('ARTICLE');
  const course = useQuery({
    queryKey: ['instructor-course', params.id],
    queryFn: () => requestJson<CourseResponse>(`/instructor/courses/${params.id}`),
  });
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['instructor-course', params.id] });
  };
  const createModule = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/courses/${params.id}/modules`, {
        method: 'POST',
        body: JSON.stringify({ title: moduleTitle }),
      }),
    onSuccess: invalidate,
  });
  const firstModuleId = course.data?.course.modules[0]?.id;
  const createLesson = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/modules/${firstModuleId}/lessons`, {
        method: 'POST',
        body: JSON.stringify({ title: lessonTitle, lessonType }),
      }),
    onSuccess: invalidate,
  });
  const publish = useMutation({
    mutationFn: () => requestJson(`/instructor/courses/${params.id}/publish`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: () => requestJson(`/instructor/courses/${params.id}/archive`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  function onCreateModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createModule.mutate();
  }

  function onCreateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (firstModuleId) {
      createLesson.mutate();
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      {course.data ? (
        <>
          <header className="mb-8">
            <p className="text-sm text-muted-foreground">{course.data.course.status}</p>
            <h1 className="mt-2 text-3xl font-semibold">{course.data.course.title}</h1>
            <div className="mt-5 flex gap-3">
              <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => publish.mutate()} type="button">
                Publish
              </button>
              <button className="rounded-md border px-4 py-2" onClick={() => archive.mutate()} type="button">
                Archive
              </button>
            </div>
          </header>

          <form className="mb-6 flex gap-3" onSubmit={onCreateModule}>
            <input
              className="flex-1 rounded-md border bg-background px-3 py-2"
              placeholder="Module title"
              value={moduleTitle}
              onChange={(event) => setModuleTitle(event.target.value)}
            />
            <button className="rounded-md border px-4 py-2" type="submit">
              Add Module
            </button>
          </form>

          <form className="mb-8 flex gap-3" onSubmit={onCreateLesson}>
            <input
              className="flex-1 rounded-md border bg-background px-3 py-2"
              placeholder="Lesson title for first module"
              value={lessonTitle}
              onChange={(event) => setLessonTitle(event.target.value)}
            />
            <select
              className="rounded-md border bg-background px-3 py-2"
              value={lessonType}
              onChange={(event) => setLessonType(event.target.value)}
            >
              <option value="ARTICLE">Article</option>
              <option value="VIDEO">Video</option>
              <option value="QUIZ">Quiz</option>
              <option value="CODING">Coding</option>
              <option value="PROJECT">Project</option>
            </select>
            <button className="rounded-md border px-4 py-2" disabled={!firstModuleId} type="submit">
              Add Lesson
            </button>
          </form>

          <div className="space-y-4">
            {course.data.course.modules.map((module) => (
              <section key={module.id} className="rounded-md border p-4">
                <h2 className="font-semibold">
                  {module.position}. {module.title}
                </h2>
                <ul className="mt-3 space-y-2">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id} className="space-y-3 rounded-md bg-muted p-3 text-sm">
                      <div className="text-muted-foreground">
                        {lesson.position}. {lesson.title} ({lesson.lessonType})
                      </div>
                      {lesson.lessonType === 'VIDEO' ? <InstructorVideoUpload lessonId={lesson.id} /> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : null}

      {course.isLoading ? <p className="text-sm text-muted-foreground">Loading course...</p> : null}
      {course.isError ? <p className="text-sm text-red-600">Could not load instructor course.</p> : null}
      {publish.isError ? <p className="mt-4 text-sm text-red-600">{publish.error.message}</p> : null}
      {archive.isError ? <p className="mt-4 text-sm text-red-600">{archive.error.message}</p> : null}
    </main>
  );
}

function InstructorVideoUpload({ lessonId }: { readonly lessonId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const video = useQuery({
    queryKey: ['instructor-video', videoAssetId],
    enabled: Boolean(videoAssetId),
    queryFn: () => requestJson<{ readonly video: VideoStatus }>(`/instructor/videos/${videoAssetId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.video.status;
      return status === 'QUEUED' || status === 'PROCESSING' ? 3000 : false;
    },
  });
  const upload = useMutation({
    mutationFn: async (selectedFile: File) => {
      const intent = await requestJson<VideoUploadIntent>(`/instructor/lessons/${lessonId}/video/upload-intent`, {
        method: 'POST',
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          sizeBytes: selectedFile.size,
        }),
      });

      await fetch(intent.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type },
        body: selectedFile,
      }).then((response) => {
        if (!response.ok) {
          throw new Error('Direct upload failed');
        }
      });

      const completed = await requestJson<{ readonly video: VideoStatus }>(
        `/instructor/videos/${intent.videoAssetId}/complete-upload`,
        { method: 'POST' },
      );

      setVideoAssetId(intent.videoAssetId);
      setUploadMessage('Upload completed. Processing queued.');
      return completed.video;
    },
    onSuccess: () => {
      void video.refetch();
    },
  });
  const retry = useMutation({
    mutationFn: () =>
      requestJson<{ readonly video: VideoStatus }>(`/instructor/videos/${videoAssetId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      void video.refetch();
    },
  });
  const current = upload.data ?? video.data?.video;
  const checkpoints = useQuery({
    queryKey: ['instructor-video-checkpoints', current?.id],
    enabled: Boolean(current?.id),
    queryFn: () => requestJson<{ readonly checkpoints: readonly VideoCheckpoint[] }>(`/instructor/videos/${current?.id}/checkpoints`),
  });

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="flex-1 text-sm"
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button
          className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
          disabled={!file || upload.isPending}
          type="button"
          onClick={() => file ? upload.mutate(file) : undefined}
        >
          Upload Video
        </button>
        {current?.status === 'FAILED' ? (
          <button className="rounded-md border px-3 py-2" type="button" onClick={() => retry.mutate()}>
            Retry
          </button>
        ) : null}
      </div>
      {current ? (
        <div className="mt-3 text-sm text-muted-foreground">
          <p>Status: {current.status}</p>
          <div className="mt-2 h-2 rounded bg-muted">
            <div className="h-2 rounded bg-primary" style={{ width: `${current.progress}%` }} />
          </div>
          {current.latestJob?.lastErrorMessage ? <p className="mt-2 text-red-600">{current.latestJob.lastErrorMessage}</p> : null}
        </div>
      ) : null}
      {uploadMessage ? <p className="mt-2 text-sm text-muted-foreground">{uploadMessage}</p> : null}
      {upload.isError ? <p className="mt-2 text-sm text-red-600">{upload.error.message}</p> : null}
      {retry.isError ? <p className="mt-2 text-sm text-red-600">{retry.error.message}</p> : null}
      {current ? <InstructorCodeAlongPanel lessonId={lessonId} videoAssetId={current.id} /> : null}
      {checkpoints.data?.checkpoints.filter((checkpoint) => checkpoint.type === 'PROJECT').map((checkpoint) => (
        <InstructorProjectCheckpointPanel key={checkpoint.id} checkpoint={checkpoint} />
      ))}
    </div>
  );
}

function InstructorCodeAlongPanel({ lessonId, videoAssetId }: { readonly lessonId: string; readonly videoAssetId: string }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [language, setLanguage] = useState('typescript');
  const [entryFile, setEntryFile] = useState('src/index.ts');
  const [timestampSeconds, setTimestampSeconds] = useState('0');
  const [snapshotTitle, setSnapshotTitle] = useState('');
  const [snapshotPath, setSnapshotPath] = useState('src/index.ts');
  const [snapshotContent, setSnapshotContent] = useState('');
  const snapshots = useQuery({
    queryKey: ['instructor-code-snapshots', videoAssetId],
    queryFn: () => requestJson<{ readonly codeSnapshots: readonly CodeSnapshotDetail[] }>(`/instructor/videos/${videoAssetId}/code-snapshots`),
  });
  const saveConfig = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/lessons/${lessonId}/code-along`, {
        method: 'PUT',
        body: JSON.stringify({ enabled, language, entryFile }),
      }),
  });
  const createSnapshot = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/videos/${videoAssetId}/code-snapshots`, {
        method: 'POST',
        body: JSON.stringify({
          timestampSeconds: Number(timestampSeconds),
          title: snapshotTitle || null,
          language,
          files: [{ path: snapshotPath, content: snapshotContent }],
        }),
      }),
    onSuccess: () => {
      setSnapshotTitle('');
      setSnapshotContent('');
      void queryClient.invalidateQueries({ queryKey: ['instructor-code-snapshots', videoAssetId] });
    },
  });
  const deleteSnapshot = useMutation({
    mutationFn: (snapshotId: string) => requestJson(`/instructor/code-snapshots/${snapshotId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instructor-code-snapshots', videoAssetId] }),
  });

  return (
    <section className="mt-4 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Code-Along</h3>
          <p className="text-sm text-muted-foreground">Instructor code states follow the video timeline.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input checked={enabled} type="checkbox" onChange={(event) => setEnabled(event.target.checked)} />
          Enabled
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input className="rounded-md border bg-background px-3 py-2 text-sm" value={language} onChange={(event) => setLanguage(event.target.value)} />
        <input className="rounded-md border bg-background px-3 py-2 text-sm" value={entryFile} onChange={(event) => setEntryFile(event.target.value)} />
        <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => saveConfig.mutate()}>
          Save code-along
        </button>
      </div>
      <div className="mt-4 grid gap-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="rounded-md border bg-background px-3 py-2 text-sm" value={timestampSeconds} onChange={(event) => setTimestampSeconds(event.target.value)} />
          <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Snapshot title" value={snapshotTitle} onChange={(event) => setSnapshotTitle(event.target.value)} />
          <input className="rounded-md border bg-background px-3 py-2 text-sm" value={snapshotPath} onChange={(event) => setSnapshotPath(event.target.value)} />
        </div>
        <textarea
          className="min-h-32 rounded-md border bg-background px-3 py-2 font-mono text-sm"
          value={snapshotContent}
          onChange={(event) => setSnapshotContent(event.target.value)}
        />
        <button className="rounded-md border px-3 py-2 text-sm" type="button" disabled={!snapshotPath} onClick={() => createSnapshot.mutate()}>
          Add snapshot
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {snapshots.data?.codeSnapshots.map((snapshot) => (
          <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-2 text-sm">
            <span>{formatTime(snapshot.timestampSeconds)} · {snapshot.title ?? snapshot.language}</span>
            <button className="rounded-md border px-2 py-1 text-xs" type="button" onClick={() => deleteSnapshot.mutate(snapshot.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
      {saveConfig.isError ? <p className="mt-2 text-sm text-red-600">{saveConfig.error.message}</p> : null}
      {createSnapshot.isError ? <p className="mt-2 text-sm text-red-600">{createSnapshot.error.message}</p> : null}
      {deleteSnapshot.isError ? <p className="mt-2 text-sm text-red-600">{deleteSnapshot.error.message}</p> : null}
    </section>
  );
}

function InstructorProjectCheckpointPanel({ checkpoint }: { readonly checkpoint: VideoCheckpoint }) {
  const queryClient = useQueryClient();
  const [passScore, setPassScore] = useState('70');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [requireDeploymentUrl, setRequireDeploymentUrl] = useState(false);
  const [criterionTitle, setCriterionTitle] = useState('');
  const [criterionType, setCriterionType] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [autoCheckType, setAutoCheckType] = useState<ProjectRubricCriterion['autoCheckType']>('FILE_EXISTS');
  const [criterionPath, setCriterionPath] = useState('package.json');
  const [criterionWeight, setCriterionWeight] = useState('100');
  const config = useQuery({
    queryKey: ['project-config', checkpoint.id],
    queryFn: () => requestJson<ProjectCheckpointConfigResponse>(`/instructor/checkpoints/${checkpoint.id}/project`),
  });
  const submissions = useQuery({
    queryKey: ['instructor-project-submissions', checkpoint.id],
    queryFn: () =>
      requestJson<{
        readonly items: readonly {
          readonly id: string;
          readonly student: { readonly email: string; readonly displayName: string };
          readonly repositoryOwner: string;
          readonly repositoryName: string;
          readonly commitSha: string;
          readonly status: string;
          readonly score: number | null;
          readonly passed: boolean | null;
          readonly manualReviewPending: boolean;
          readonly submittedAt: string;
        }[];
      }>(`/instructor/checkpoints/${checkpoint.id}/project-submissions`),
  });
  const saveConfig = useMutation({
    mutationFn: () =>
      requestJson<ProjectCheckpointConfigResponse>(`/instructor/checkpoints/${checkpoint.id}/project`, {
        method: 'PUT',
        body: JSON.stringify({
          defaultBranch: defaultBranch.trim() || null,
          requireDeploymentUrl,
          passScore: Number(passScore),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-config', checkpoint.id] }),
  });
  const addCriterion = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/checkpoints/${checkpoint.id}/project/rubric`, {
        method: 'POST',
        body: JSON.stringify({
          title: criterionTitle,
          type: criterionType,
          ...(criterionType === 'AUTO' ? { autoCheckType, config: autoCheckType === 'FILE_EXISTS' || autoCheckType === 'JSON_FIELD' ? { path: criterionPath } : null } : {}),
          weight: Number(criterionWeight),
          required: true,
        }),
      }),
    onSuccess: () => {
      setCriterionTitle('');
      void queryClient.invalidateQueries({ queryKey: ['project-config', checkpoint.id] });
    },
  });
  const manualGrade = useMutation({
    mutationFn: (submissionId: string) => {
      const manualCriteria = config.data?.criteria.filter((criterion) => criterion.type === 'MANUAL') ?? [];

      return requestJson(`/instructor/project-submissions/${submissionId}/manual-grade`, {
        method: 'POST',
        body: JSON.stringify({
          criteria: manualCriteria.map((criterion) => ({
            criterionId: criterion.id,
            score: criterion.weight,
            feedback: 'Approved by instructor.',
          })),
        }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instructor-project-submissions', checkpoint.id] }),
  });

  return (
    <section className="mt-4 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{checkpoint.title}</h3>
          <p className="text-sm text-muted-foreground">Project checkpoint grading</p>
        </div>
        <span className="text-xs text-muted-foreground">{config.data?.criteria.length ?? 0} criteria</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input className="rounded-md border bg-background px-3 py-2 text-sm" value={defaultBranch} onChange={(event) => setDefaultBranch(event.target.value)} />
        <input className="rounded-md border bg-background px-3 py-2 text-sm" value={passScore} onChange={(event) => setPassScore(event.target.value)} />
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input checked={requireDeploymentUrl} type="checkbox" onChange={(event) => setRequireDeploymentUrl(event.target.checked)} />
          Deployment URL
        </label>
      </div>
      <button className="mt-2 rounded-md border px-3 py-2 text-sm" type="button" onClick={() => saveConfig.mutate()}>
        Save config
      </button>

      <div className="mt-4 grid gap-2">
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Criterion title"
          value={criterionTitle}
          onChange={(event) => setCriterionTitle(event.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-4">
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={criterionType} onChange={(event) => setCriterionType(event.target.value as 'AUTO' | 'MANUAL')}>
            <option value="AUTO">Auto</option>
            <option value="MANUAL">Manual</option>
          </select>
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={autoCheckType ?? ''} onChange={(event) => setAutoCheckType(event.target.value as ProjectRubricCriterion['autoCheckType'])}>
            <option value="FILE_EXISTS">File exists</option>
            <option value="BUILD_SUCCESS">Build success</option>
            <option value="TEST_SUCCESS">Test success</option>
          </select>
          <input className="rounded-md border bg-background px-3 py-2 text-sm" value={criterionPath} onChange={(event) => setCriterionPath(event.target.value)} />
          <input className="rounded-md border bg-background px-3 py-2 text-sm" value={criterionWeight} onChange={(event) => setCriterionWeight(event.target.value)} />
        </div>
        <button className="rounded-md border px-3 py-2 text-sm" type="button" disabled={!criterionTitle} onClick={() => addCriterion.mutate()}>
          Add criterion
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {config.data?.criteria.map((criterion) => (
          <div key={criterion.id} className="rounded-md bg-muted p-2 text-sm">
            {criterion.title} · {criterion.type} · {criterion.weight}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {submissions.data?.items.map((submission) => (
          <div key={submission.id} className="rounded-md border p-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{submission.student.displayName || submission.student.email}</span>
              <span>{submission.status.replaceAll('_', ' ')}</span>
            </div>
            <p className="text-muted-foreground">{submission.repositoryOwner}/{submission.repositoryName}@{submission.commitSha.slice(0, 12)}</p>
            {submission.manualReviewPending ? (
              <button className="mt-2 rounded-md border px-3 py-2 text-sm" type="button" onClick={() => manualGrade.mutate(submission.id)}>
                Approve manual review
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {saveConfig.isError ? <p className="mt-2 text-sm text-red-600">{saveConfig.error.message}</p> : null}
      {addCriterion.isError ? <p className="mt-2 text-sm text-red-600">{addCriterion.error.message}</p> : null}
      {manualGrade.isError ? <p className="mt-2 text-sm text-red-600">{manualGrade.error.message}</p> : null}
    </section>
  );
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
