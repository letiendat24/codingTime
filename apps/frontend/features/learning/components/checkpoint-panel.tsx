'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Code, Github } from 'lucide-react';
import { Badge, Button, Card, CardContent, Input } from '../../../design-system';
import type { ProjectSubmissionDetail, VideoCheckpoint } from '../../../lib/api';
import { requestJson } from '../../../lib/api';
import { formatTime } from '../../../lib/video-learning';
import { useI18n } from '../../../providers/i18n-provider';

export interface CheckpointPanelProps {
  readonly checkpoint: VideoCheckpoint;
  readonly lessonId: string;
  readonly onOpenWorkspace: (checkpointId: string) => void;
  readonly onCompleteInfo: (checkpointId: string) => void;
  readonly onClose: () => void;
}

export function CheckpointPanel({
  checkpoint,
  lessonId,
  onOpenWorkspace,
  onCompleteInfo,
  onClose,
}: CheckpointPanelProps) {
  const { t } = useI18n();

  return (
    <Card className="border-primary/20 bg-card/95 backdrop-blur-sm shadow-lg">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{checkpoint.type}</Badge>
            <span className="text-xs font-mono text-muted-foreground">{formatTime(checkpoint.timestampSeconds)}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
        </div>

        <h3 className="font-semibold text-foreground text-sm">{checkpoint.title}</h3>
        {checkpoint.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{checkpoint.description}</p>
        )}

        <div className="pt-2 flex justify-end gap-2">
          {checkpoint.type === 'INFO' && (
            <Button
              size="sm"
              onClick={() => onCompleteInfo(checkpoint.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t('learning.completeCheckpoint')}
            </Button>
          )}

          {checkpoint.type === 'CODING' && (
            <Button
              size="sm"
              onClick={() => onOpenWorkspace(checkpoint.id)}
            >
              <Code className="h-4 w-4" />
              {t('learning.openWorkspace')}
            </Button>
          )}

          {checkpoint.type === 'PROJECT' && (
            <ProjectSubmissionView checkpoint={checkpoint} _lessonId={lessonId} onClose={onClose} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectSubmissionView({
  checkpoint,
  _lessonId,
  onClose,
}: {
  readonly checkpoint: VideoCheckpoint;
  readonly _lessonId: string;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
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
            repositoryUrl: repositoryUrl.trim(),
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
      const response = await requestJson<{ readonly submission: ProjectSubmissionDetail }>(
        `/project-submissions/${activeSubmissionId}`,
      );
      return response.submission;
    },
  });

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Input
            placeholder="https://github.com/username/repository"
            value={repositoryUrl}
            onChange={(event) => setRepositoryUrl(event.target.value)}
          />
        </div>
        <Input
          placeholder="Branch (default: main)"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
        />
        <div className="sm:col-span-2">
          <Input
            placeholder="Deployment URL (e.g. https://my-app.vercel.app)"
            value={deploymentUrl}
            onChange={(event) => setDeploymentUrl(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          isLoading={submitProject.isPending}
          disabled={!repositoryUrl.trim() || submitProject.isPending}
          onClick={() => submitProject.mutate()}
        >
          <Github className="h-4 w-4 mr-1.5" />
          <span>{t('learning.submitProject')}</span>
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>

      {submission.data ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">
              Status: <Badge tone={submission.data.passed ? 'success' : 'warning'}>{submission.data.status}</Badge>
            </span>
            {submission.data.score !== null ? (
              <span className="font-bold text-foreground">Score: {submission.data.score}/100</span>
            ) : null}
          </div>
          <p className="text-muted-foreground font-mono">Commit: {submission.data.commitSha.slice(0, 10)}</p>
          {submission.data.grade?.summary ? (
            <p className="text-muted-foreground pt-1 border-t border-border">{submission.data.grade.summary}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
