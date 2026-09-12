'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AdminExecutionSummary,
  type AdminJudgeSubmissionSummary,
  type AdminProjectSubmissionSummary,
  type AdminVideoSummary,
  type PaginatedResponse,
  requestJson,
} from '../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../admin-components';

export default function AdminOperationsPage() {
  const queryClient = useQueryClient();
  const videos = useQuery({
    queryKey: ['admin-videos'],
    queryFn: () => requestJson<PaginatedResponse<AdminVideoSummary>>('/admin/videos?page=1&limit=20'),
    retry: false,
  });
  const executions = useQuery({
    queryKey: ['admin-executions'],
    queryFn: () => requestJson<PaginatedResponse<AdminExecutionSummary>>('/admin/code-executions?page=1&limit=20'),
    retry: false,
  });
  const judge = useQuery({
    queryKey: ['admin-judge'],
    queryFn: () => requestJson<PaginatedResponse<AdminJudgeSubmissionSummary>>('/admin/judge-submissions?page=1&limit=20'),
    retry: false,
  });
  const projects = useQuery({
    queryKey: ['admin-projects'],
    queryFn: () => requestJson<PaginatedResponse<AdminProjectSubmissionSummary>>('/admin/project-submissions?page=1&limit=20'),
    retry: false,
  });
  const retryVideo = useMutation({
    mutationFn: (videoAssetId: string) => requestJson(`/admin/videos/${videoAssetId}/retry`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-videos'] }),
  });

  if (videos.isError || executions.isError || judge.isError || projects.isError) return <AdminError />;

  return (
    <section className="space-y-8">
      <h2 className="text-xl font-semibold">Operations</h2>
      <div className="rounded-md border p-4">
        <h3 className="font-semibold">Video</h3>
        <div className="mt-3 space-y-2 text-sm">
          {(videos.data?.items ?? []).map((video) => (
            <div key={video.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <span>{video.course.title} · {video.lesson.title} · {video.instructor.email}</span>
              <span><StatusBadge value={video.status} /> {video.latestJob?.errorCode ?? ''}</span>
              {video.status === 'FAILED' ? (
                <button className="rounded-md border px-2 py-1" onClick={() => retryVideo.mutate(video.id)}>Retry</button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border p-4">
        <h3 className="font-semibold">Code Execution</h3>
        <div className="mt-3 space-y-2 text-sm">
          {(executions.data?.items ?? []).map((execution) => (
            <p key={execution.id} className="rounded-md border p-3">
              {execution.user.email} · {execution.language} · <StatusBadge value={execution.status} /> · {execution.durationMs ?? '-'}ms · {formatDate(execution.createdAt)}
            </p>
          ))}
        </div>
      </div>
      <div className="rounded-md border p-4">
        <h3 className="font-semibold">Judge</h3>
        <div className="mt-3 space-y-2 text-sm">
          {(judge.data?.items ?? []).map((submission) => (
            <p key={submission.id} className="rounded-md border p-3">
              {submission.user.email} · {submission.course?.title ?? 'Practice'} · {submission.checkpoint?.title ?? submission.practiceProblem?.title ?? '-'} · <StatusBadge value={submission.status} /> · score {submission.score ?? '-'}
            </p>
          ))}
        </div>
      </div>
      <div className="rounded-md border p-4">
        <h3 className="font-semibold">Project Grading</h3>
        <div className="mt-3 space-y-2 text-sm">
          {(projects.data?.items ?? []).map((submission) => (
            <p key={submission.id} className="rounded-md border p-3">
              {submission.user.email} · {submission.repository.owner}/{submission.repository.name} · <StatusBadge value={submission.status} /> · score {submission.score ?? '-'}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
