'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Video, Terminal, Scale, FolderGit2, RefreshCw } from 'lucide-react';
import {
  type AdminExecutionSummary,
  type AdminJudgeSubmissionSummary,
  type AdminProjectSubmissionSummary,
  type AdminVideoSummary,
  type PaginatedResponse,
  requestJson,
} from '../../../lib/api';
import { AdminError, StatusBadge, formatDate } from '../admin-components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
import { Button } from '../../../design-system/components/button';
import { LoadingState } from '../../../design-system/components/loading-state';

export default function AdminOperationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'videos' | 'executions' | 'judge' | 'projects'>('videos');

  const videos = useQuery({
    queryKey: ['admin-videos'],
    queryFn: () => requestJson<PaginatedResponse<AdminVideoSummary>>('/admin/videos?page=1&limit=30'),
    retry: false,
  });
  const executions = useQuery({
    queryKey: ['admin-executions'],
    queryFn: () => requestJson<PaginatedResponse<AdminExecutionSummary>>('/admin/code-executions?page=1&limit=30'),
    retry: false,
  });
  const judge = useQuery({
    queryKey: ['admin-judge'],
    queryFn: () => requestJson<PaginatedResponse<AdminJudgeSubmissionSummary>>('/admin/judge-submissions?page=1&limit=30'),
    retry: false,
  });
  const projects = useQuery({
    queryKey: ['admin-projects'],
    queryFn: () => requestJson<PaginatedResponse<AdminProjectSubmissionSummary>>('/admin/project-submissions?page=1&limit=30'),
    retry: false,
  });

  const retryVideo = useMutation({
    mutationFn: (videoAssetId: string) => requestJson(`/admin/videos/${videoAssetId}/retry`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-videos'] }),
  });

  if (videos.isError || executions.isError || judge.isError || projects.isError) {
    return <AdminError message="Failed to load operational worker queue telemetry." />;
  }

  return (
    <div className="space-y-6">
      {/* Tab selection */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'videos' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('videos')}
          leftIcon={<Video className="h-4 w-4" />}
        >
          Video Transcoding ({videos.data?.items.length ?? 0})
        </Button>
        <Button
          variant={activeTab === 'executions' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('executions')}
          leftIcon={<Terminal className="h-4 w-4" />}
        >
          Code Sandbox ({executions.data?.items.length ?? 0})
        </Button>
        <Button
          variant={activeTab === 'judge' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('judge')}
          leftIcon={<Scale className="h-4 w-4" />}
        >
          Judge Submissions ({judge.data?.items.length ?? 0})
        </Button>
        <Button
          variant={activeTab === 'projects' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('projects')}
          leftIcon={<FolderGit2 className="h-4 w-4" />}
        >
          Project Grading ({projects.data?.items.length ?? 0})
        </Button>
      </div>

      {/* Tab 1: Video Transcoding */}
      {activeTab === 'videos' && (
        <Card>
          <CardHeader>
            <CardTitle>Video Processing Queue</CardTitle>
            <CardDescription>FFmpeg transcoding pipeline, HLS variant generation, and asset status.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {videos.isLoading ? (
              <div className="py-12"><LoadingState message="Loading video queue..." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3.5">Course & Lesson</th>
                      <th className="px-6 py-3.5">Instructor</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Job Error</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(videos.data?.items ?? []).map((video) => (
                      <tr key={video.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-6 py-4">
                          <p className="font-medium text-foreground">{video.lesson.title}</p>
                          <p className="text-xs text-muted-foreground">{video.course.title}</p>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">{video.instructor.email}</td>
                        <td className="px-6 py-4"><StatusBadge value={video.status} /></td>
                        <td className="px-6 py-4 font-mono text-xs text-destructive">
                          {video.latestJob?.errorCode ?? '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {video.status === 'FAILED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryVideo.mutate(video.id)}
                              isLoading={retryVideo.isPending && retryVideo.variables === video.id}
                              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                            >
                              Retry Job
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {(videos.data?.items ?? []).length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">No video processing tasks found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Code Executions */}
      {activeTab === 'executions' && (
        <Card>
          <CardHeader>
            <CardTitle>Code Execution Worker Logs</CardTitle>
            <CardDescription>Ephemeral Docker sandbox runs with runtime duration and status.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {executions.isLoading ? (
              <div className="py-12"><LoadingState message="Loading executions..." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3.5">User</th>
                      <th className="px-6 py-3.5">Language</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Duration</th>
                      <th className="px-6 py-3.5 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(executions.data?.items ?? []).map((execution) => (
                      <tr key={execution.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-6 py-4 font-medium text-foreground">{execution.user.email}</td>
                        <td className="px-6 py-4 font-mono text-xs">{execution.language}</td>
                        <td className="px-6 py-4"><StatusBadge value={execution.status} /></td>
                        <td className="px-6 py-4 text-xs font-mono">{execution.durationMs != null ? `${execution.durationMs}ms` : '—'}</td>
                        <td className="px-6 py-4 text-right text-xs text-muted-foreground">{formatDate(execution.createdAt)}</td>
                      </tr>
                    ))}
                    {(executions.data?.items ?? []).length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">No code execution tasks recorded.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Judge Submissions */}
      {activeTab === 'judge' && (
        <Card>
          <CardHeader>
            <CardTitle>Automated Judge Submissions</CardTitle>
            <CardDescription>Test runner grading for coding checkpoints and practice challenges.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {judge.isLoading ? (
              <div className="py-12"><LoadingState message="Loading judge queue..." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3.5">Student</th>
                      <th className="px-6 py-3.5">Context / Target</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Score</th>
                      <th className="px-6 py-3.5 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(judge.data?.items ?? []).map((submission) => (
                      <tr key={submission.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-6 py-4 font-medium text-foreground">{submission.user.email}</td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {submission.checkpoint?.title ?? submission.practiceProblem?.title ?? submission.course?.title ?? 'Practice'}
                        </td>
                        <td className="px-6 py-4"><StatusBadge value={submission.status} /></td>
                        <td className="px-6 py-4 font-bold text-foreground">{submission.score != null ? `${submission.score}%` : '—'}</td>
                        <td className="px-6 py-4 text-right text-xs text-muted-foreground">{formatDate(submission.createdAt)}</td>
                      </tr>
                    ))}
                    {(judge.data?.items ?? []).length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">No judge submissions found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Project Submissions */}
      {activeTab === 'projects' && (
        <Card>
          <CardHeader>
            <CardTitle>GitHub Project Submissions</CardTitle>
            <CardDescription>Automated CI grading runs on student cloned repositories.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {projects.isLoading ? (
              <div className="py-12"><LoadingState message="Loading project queue..." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3.5">Student</th>
                      <th className="px-6 py-3.5">Repository</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Score</th>
                      <th className="px-6 py-3.5 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(projects.data?.items ?? []).map((submission) => (
                      <tr key={submission.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-6 py-4 font-medium text-foreground">{submission.user.email}</td>
                        <td className="px-6 py-4 font-mono text-xs text-foreground">
                          {submission.repository.owner}/{submission.repository.name}
                        </td>
                        <td className="px-6 py-4"><StatusBadge value={submission.status} /></td>
                        <td className="px-6 py-4 font-bold text-foreground">{submission.score != null ? `${submission.score}%` : '—'}</td>
                        <td className="px-6 py-4 text-right text-xs text-muted-foreground">{formatDate(submission.submittedAt)}</td>
                      </tr>
                    ))}
                    {(projects.data?.items ?? []).length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">No project grading submissions found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
