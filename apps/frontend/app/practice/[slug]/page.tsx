'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '../../../design-system';
import {
  type ExecutionDetail,
  type JudgeSubmissionDetail,
  type PaginatedResponse,
  type PracticeProblemDetail,
  type Workspace,
  requestJson,
} from '../../../lib/api';
import { queryKeys } from '../../../lib/query/keys';
import { useI18n } from '../../../providers/i18n-provider';
import { useTheme } from '../../../providers/theme-provider';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface ProblemResponse {
  readonly problem: PracticeProblemDetail;
}

interface WorkspaceResponse {
  readonly workspace: Workspace;
}

export default function PracticeProblemPage() {
  const params = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const [activePath, setActivePath] = useState('index.js');
  const [mobileTab, setMobileTab] = useState<'problem' | 'code' | 'result' | 'submissions'>('problem');
  const [files, setFiles] = useState<readonly { readonly path: string; readonly content: string }[]>([]);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: queryKeys.practice.detail(params.slug),
    queryFn: () => requestJson<ProblemResponse>(`/practice/problems/${params.slug}`),
  });
  const problem = detail.data?.problem;

  const openWorkspace = useMutation({
    mutationFn: () => requestJson<WorkspaceResponse>(`/practice/problems/${problem!.id}/workspace`, { method: 'POST' }),
    onSuccess: (data) => {
      setFiles(data.workspace.files);
      setActivePath(data.workspace.entryFile);
      queryClient.setQueryData(['practice-workspace', data.workspace.id], data.workspace);
    },
  });

  const workspace = openWorkspace.data?.workspace;
  const activeFile = files.find((file) => file.path === activePath) ?? files[0];
  const history = useQuery({
    queryKey: queryKeys.practice.submissions(problem?.id),
    queryFn: () => requestJson<PaginatedResponse<{ readonly id: string; readonly status: string; readonly score: number | null; readonly submittedAt: string }>>(`/practice/problems/${problem!.id}/submissions?page=1&limit=10`),
    enabled: Boolean(problem),
  });
  const execution = useQuery({
    queryKey: queryKeys.execution.detail(executionId),
    queryFn: () => requestJson<ExecutionDetail>(`/executions/${executionId}`),
    enabled: Boolean(executionId),
    refetchInterval: (query) => (query.state.data?.status === 'QUEUED' || query.state.data?.status === 'RUNNING' ? 1000 : false),
  });
  const submission = useQuery({
    queryKey: queryKeys.judge.submission(submissionId),
    queryFn: () => requestJson<{ readonly submission: JudgeSubmissionDetail }>(`/submissions/${submissionId}`),
    enabled: Boolean(submissionId),
    refetchInterval: (query) => (query.state.data?.submission.status === 'QUEUED' || query.state.data?.submission.status === 'RUNNING' ? 1000 : false),
  });

  const save = useMutation({
    mutationFn: () => requestJson<Workspace>(`/workspaces/${workspace!.id}/files`, { method: 'PUT', body: JSON.stringify({ files }) }),
  });
  const run = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return requestJson<{ readonly id: string; readonly status: string }>(`/workspaces/${workspace!.id}/executions`, { method: 'POST' });
    },
    onSuccess: (data) => {
      setExecutionId(data.id);
      setMobileTab('result');
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return requestJson<{ readonly id: string; readonly status: string }>(`/practice/problems/${problem!.id}/submissions`, { method: 'POST' });
    },
    onSuccess: (data) => {
      setSubmissionId(data.id);
      setMobileTab('result');
      void history.refetch();
    },
  });
  const reset = useMutation({
    mutationFn: () => requestJson<WorkspaceResponse>(`/practice/problems/${problem!.id}/workspace/reset`, { method: 'POST' }),
    onSuccess: (data) => {
      setFiles(data.workspace.files);
      setActivePath(data.workspace.entryFile);
    },
  });

  const editorLanguage = useMemo(() => (problem?.language === 'typescript' ? 'typescript' : 'javascript'), [problem?.language]);

  if (detail.isLoading) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><PageSkeleton /></main>;
  }

  if (detail.isError) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <ErrorState title={t('common.error')} description="Problem not found or student login required." onRetry={() => void detail.refetch()} />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={problem?.title ?? t('practice.problem')}
        description={problem ? `${problem.language} · pass ${problem.passScore}%` : t('practice.description')}
        actions={problem ? (
          <Button onClick={() => {
            openWorkspace.mutate();
            setMobileTab('code');
          }} type="button">
            {t('practice.openWorkspace')}
          </Button>
        ) : null}
      />

      {problem ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <StatusBadge value={problem.progress.status} />
          <StatusBadge value={problem.difficulty} />
          {problem.tags.map((tag) => <Badge key={tag.id}>{tag.name}</Badge>)}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-4 gap-2 lg:hidden">
        {([
          ['problem', t('practice.problem')],
          ['code', t('practice.code')],
          ['result', t('practice.result')],
          ['submissions', t('practice.submissions')],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            className={`rounded-md border px-2 py-2 text-xs ${mobileTab === tab ? 'bg-card font-medium' : 'text-muted-foreground'}`}
            type="button"
            onClick={() => setMobileTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
      {problem ? (
        <Card className={`${mobileTab === 'problem' ? 'block' : 'hidden'} xl:block`}>
          <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-6">{problem.description}</p>
          <h2 className="mt-6 font-semibold">{t('practice.publicTests')}</h2>
          <div className="mt-3 grid gap-3">
            {problem.publicTests.map((test) => (
              <div key={test.id} className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">{test.name}</p>
                <pre className="mt-2 whitespace-pre-wrap">Input: {test.input || '(empty)'}</pre>
                <pre className="whitespace-pre-wrap">Expected: {test.expectedOutput}</pre>
              </div>
            ))}
          </div>
          </CardContent>
        </Card>
      ) : null}

      {workspace ? (
        <section className={`${mobileTab === 'code' ? 'block' : 'hidden'} grid gap-4 lg:grid-cols-[220px_1fr] xl:block`}>
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="rounded-md border bg-card p-3">
            <p className="mb-2 text-sm font-medium">Files</p>
            {files.map((file) => (
              <button key={file.path} className={`block w-full rounded-md px-2 py-1 text-left text-sm ${file.path === activePath ? 'bg-muted' : ''}`} onClick={() => setActivePath(file.path)} type="button">
                {file.path}
              </button>
            ))}
            <div className="mt-4 grid gap-2">
              <Button variant="secondary" onClick={() => save.mutate()} type="button">{t('common.save')}</Button>
              <Button variant="secondary" onClick={() => run.mutate()} type="button">{t('common.run')}</Button>
              <Button onClick={() => submit.mutate()} type="button">{t('common.submit')}</Button>
              <Button variant="secondary" onClick={() => reset.mutate()} type="button">{t('common.reset')}</Button>
            </div>
          </aside>
          <div className="rounded-md border">
            <MonacoEditor
              height="480px"
              language={editorLanguage}
              path={activeFile?.path ?? 'index.js'}
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              value={activeFile?.content ?? ''}
              onChange={(value) => setFiles(files.map((file) => (file.path === activeFile?.path ? { ...file, content: value ?? '' } : file)))}
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>
          </div>
        </section>
      ) : (
        <EmptyState title={t('practice.openWorkspace')} description={t('practice.description')} action={<Button onClick={() => openWorkspace.mutate()} type="button">{t('practice.openWorkspace')}</Button>} />
      )}
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className={mobileTab === 'result' ? 'block' : 'hidden lg:block'}>
          <CardContent>
          <h2 className="font-semibold">{t('practice.runOutput')}</h2>
          <pre className="mt-3 min-h-32 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{execution.data?.result?.stdout ?? execution.data?.status ?? 'No run yet.'}</pre>
          {execution.data?.result?.stderr ? <pre className="mt-2 whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{execution.data.result.stderr}</pre> : null}
          </CardContent>
        </Card>
        <Card className={mobileTab === 'submissions' || mobileTab === 'result' ? 'block' : 'hidden lg:block'}>
          <CardContent>
          <h2 className="font-semibold">{t('practice.submissionHistory')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{submission.data?.submission.status ? <StatusBadge value={submission.data.submission.status} /> : 'No active submission.'}</p>
          {submission.data?.submission.result ? <p className="mt-2 text-sm">Score: {submission.data.submission.result.totalScore}</p> : null}
          <div className="mt-3 space-y-2">
            {history.data?.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-muted p-2 text-sm">
                <StatusBadge value={item.status} />
                <span>{item.score ?? '-'}</span>
              </div>
            ))}
          </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
