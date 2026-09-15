'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileCode, History, Play, RotateCcw, Send, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Button, Card, CardContent, ErrorState, PageSkeleton, StatusBadge } from '../../../design-system';
import { useAuthGuard } from '../../../features/auth/hooks/use-auth-guard';
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
  const { isLoading: authLoading } = useAuthGuard();

  const [activePath, setActivePath] = useState('index.js');
  const [mobileTab, setMobileTab] = useState<'problem' | 'code' | 'result' | 'submissions'>('problem');
  const [files, setFiles] = useState<readonly { readonly path: string; readonly content: string }[]>([]);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [activeConsoleTab, setActiveConsoleTab] = useState<'output' | 'judge'>('output');

  const detail = useQuery({
    queryKey: queryKeys.practice.detail(params.slug),
    queryFn: () => requestJson<ProblemResponse>(`/practice/problems/${params.slug}`),
  });
  const problem = detail.data?.problem;

  const openWorkspace = useMutation({
    mutationFn: () =>
      requestJson<WorkspaceResponse>(`/practice/problems/${problem!.id}/workspace`, { method: 'POST' }),
    onSuccess: (data) => {
      setFiles(data.workspace.files);
      setActivePath(data.workspace.entryFile);
      queryClient.setQueryData(['practice-workspace', data.workspace.id], data.workspace);
    },
  });

  useEffect(() => {
    if (problem && !openWorkspace.data && !openWorkspace.isPending) {
      openWorkspace.mutate();
    }
  }, [problem]);

  const workspace = openWorkspace.data?.workspace;
  const activeFile = files.find((file) => file.path === activePath) ?? files[0];

  const history = useQuery({
    queryKey: queryKeys.practice.submissions(problem?.id),
    queryFn: () =>
      requestJson<
        PaginatedResponse<{
          readonly id: string;
          readonly status: string;
          readonly score: number | null;
          readonly submittedAt: string;
        }>
      >(`/practice/problems/${problem!.id}/submissions?page=1&limit=10`),
    enabled: Boolean(problem),
  });

  const execution = useQuery({
    queryKey: queryKeys.execution.detail(executionId),
    queryFn: () => requestJson<ExecutionDetail>(`/executions/${executionId}`),
    enabled: Boolean(executionId),
    refetchInterval: (query) =>
      query.state.data?.status === 'QUEUED' || query.state.data?.status === 'RUNNING' ? 1000 : false,
  });

  const submission = useQuery({
    queryKey: queryKeys.judge.submission(submissionId),
    queryFn: () => requestJson<{ readonly submission: JudgeSubmissionDetail }>(`/submissions/${submissionId}`),
    enabled: Boolean(submissionId),
    refetchInterval: (query) =>
      query.state.data?.submission.status === 'QUEUED' || query.state.data?.submission.status === 'RUNNING'
        ? 1000
        : false,
  });

  const save = useMutation({
    mutationFn: () =>
      requestJson<Workspace>(`/workspaces/${workspace!.id}/files`, {
        method: 'PUT',
        body: JSON.stringify({ files }),
      }),
  });

  const run = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      setActiveConsoleTab('output');
      return requestJson<{ readonly id: string; readonly status: string }>(
        `/workspaces/${workspace!.id}/executions`,
        { method: 'POST' },
      );
    },
    onSuccess: (data) => {
      setExecutionId(data.id);
      setMobileTab('result');
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      setActiveConsoleTab('judge');
      return requestJson<{ readonly id: string; readonly status: string }>(
        `/practice/problems/${problem!.id}/submissions`,
        { method: 'POST' },
      );
    },
    onSuccess: (data) => {
      setSubmissionId(data.id);
      setMobileTab('result');
      void history.refetch();
    },
  });

  const reset = useMutation({
    mutationFn: () =>
      requestJson<WorkspaceResponse>(`/practice/problems/${problem!.id}/workspace/reset`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      setFiles(data.workspace.files);
      setActivePath(data.workspace.entryFile);
    },
  });

  const editorLanguage = useMemo(
    () => (problem?.language === 'typescript' ? 'typescript' : 'javascript'),
    [problem?.language],
  );

  if (authLoading || detail.isLoading) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <PageSkeleton />
      </main>
    );
  }

  if (detail.isError || !problem) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <ErrorState
          title={t('common.error')}
          description="Problem not found or sign in required."
          onRetry={() => void detail.refetch()}
        />
      </main>
    );
  }

  return (
    <div className="min-h-full flex flex-col bg-background">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/95 px-4 py-3 backdrop-blur-md sm:px-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/practice"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{t('practice.title')}</span>
            </Link>

            <span className="text-muted-foreground hidden sm:inline">•</span>

            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground line-clamp-1">{problem.title}</h1>
              <StatusBadge value={problem.difficulty} />
              <StatusBadge value={problem.progress.status} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              isLoading={run.isPending || execution.data?.status === 'RUNNING'}
              onClick={() => run.mutate()}
            >
              <Play className="h-3.5 w-3.5 mr-1 text-emerald-500" />
              <span>{t('common.run')}</span>
            </Button>

            <Button
              size="sm"
              isLoading={submit.isPending || submission.data?.submission.status === 'RUNNING'}
              onClick={() => submit.mutate()}
              className="shadow-xs"
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              <span>{t('common.submit')}</span>
            </Button>

            <Button
              size="sm"
              variant="secondary"
              isLoading={reset.isPending}
              onClick={() => {
                if (window.confirm('Reset workspace to starter code?')) {
                  reset.mutate();
                }
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <div className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Mobile View Mode Tabs */}
        <div className="grid grid-cols-4 gap-1.5 lg:hidden rounded-lg bg-muted p-1 text-xs">
          {([
            ['problem', t('practice.problem')],
            ['code', t('practice.code')],
            ['result', t('practice.result')],
            ['submissions', t('practice.submissions')],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                mobileTab === tab ? 'bg-card text-foreground font-bold shadow-xs' : 'text-muted-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Split Desktop Layout: Left = Problem Description & Tests; Right = Workspace & Output */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Left Column: Problem Description & Submission History */}
          <div className={`${mobileTab === 'problem' || mobileTab === 'submissions' ? 'block' : 'hidden'} lg:block space-y-6`}>
            <Card className="shadow-xs">
              <CardContent className="p-5 sm:p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{problem.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {problem.tags.map((tag) => (
                      <span key={tag.id} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono">
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
                  {problem.description}
                </div>

                {/* Public Tests */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <h3 className="text-sm font-semibold text-foreground">{t('practice.publicTests')}</h3>
                  <div className="space-y-3">
                    {problem.publicTests.map((test, index) => (
                      <div key={test.id} className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2 text-xs font-mono">
                        <div className="flex items-center justify-between text-muted-foreground font-sans text-[11px] font-semibold">
                          <span>{test.name || `Sample Case #${index + 1}`}</span>
                          <span>Weight: {test.weight}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Input:</span>
                          <pre className="mt-1 rounded bg-card p-2 text-foreground overflow-auto">
                            {test.input || '(empty)'}
                          </pre>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Expected Output:</span>
                          <pre className="mt-1 rounded bg-card p-2 text-foreground overflow-auto">
                            {test.expectedOutput}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submission History Accordion */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <History className="h-4 w-4 text-primary" />
                    <span>{t('practice.submissionHistory')}</span>
                  </div>
                  {history.data?.items && history.data.items.length > 0 ? (
                    <div className="space-y-2">
                      {history.data.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <StatusBadge value={item.status} />
                            <span className="text-muted-foreground">
                              {new Date(item.submittedAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-foreground">
                            Score: {item.score !== null ? `${item.score}/100` : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No submissions recorded for this problem yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Code Editor & Execution / Judge Panel */}
          <div className={`${mobileTab === 'code' || mobileTab === 'result' ? 'block' : 'hidden'} lg:block space-y-4`}>
            {/* Monaco Editor Card */}
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
              {/* File Tabs */}
              <div className="flex overflow-x-auto border-b border-border bg-muted/60 px-2 pt-1">
                {files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setActivePath(file.path)}
                    className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-mono transition-colors ${
                      file.path === activePath
                        ? 'border-t border-l border-r border-border bg-card text-foreground font-semibold -mb-px'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <FileCode className="h-3 w-3 text-muted-foreground" />
                    <span>{file.path}</span>
                  </button>
                ))}
              </div>

              <MonacoEditor
                height="380px"
                language={editorLanguage}
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                value={activeFile?.content ?? ''}
                onChange={(value) =>
                  setFiles(
                    files.map((file) => (file.path === activeFile?.path ? { ...file, content: value ?? '' } : file)),
                  )
                }
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  tabSize: 2,
                  padding: { top: 8, bottom: 8 },
                }}
              />
            </div>

            {/* Results Console */}
            <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
              <div className="flex border-b border-border bg-muted/50 px-2">
                <button
                  type="button"
                  onClick={() => setActiveConsoleTab('output')}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    activeConsoleTab === 'output'
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>{t('practice.runOutput')}</span>
                  {execution.data ? (
                    <Badge tone={execution.data.status === 'SUCCEEDED' ? 'success' : 'neutral'} className="text-[9px] px-1 py-0">
                      {execution.data.status}
                    </Badge>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveConsoleTab('judge')}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    activeConsoleTab === 'judge'
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{t('practice.judgeResult')}</span>
                  {submission.data ? (
                    <Badge tone={submission.data.submission.passed ? 'success' : 'warning'} className="text-[9px] px-1 py-0">
                      {submission.data.submission.status}
                    </Badge>
                  ) : null}
                </button>
              </div>

              <div className="p-3.5 max-h-[300px] overflow-auto font-mono text-xs">
                {activeConsoleTab === 'output' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-sans">
                      <span>Status: <StatusBadge value={execution.data?.status ?? 'IDLE'} /></span>
                      {execution.data?.result ? <span>{execution.data.result.durationMs}ms</span> : null}
                    </div>

                    {execution.data?.result ? (
                      <div className="space-y-2 pt-1">
                        {execution.data.result.stdout ? (
                          <pre className="rounded bg-muted/60 p-2.5 text-foreground overflow-auto whitespace-pre-wrap">
                            {execution.data.result.stdout}
                          </pre>
                        ) : null}

                        {execution.data.result.stderr ? (
                          <pre className="rounded bg-destructive/10 p-2.5 text-destructive overflow-auto whitespace-pre-wrap">
                            {execution.data.result.stderr}
                          </pre>
                        ) : null}

                        {!execution.data.result.stdout && !execution.data.result.stderr ? (
                          <p className="text-muted-foreground py-4 text-center font-sans text-xs">
                            Execution finished with no output.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-muted-foreground py-6 text-center font-sans text-xs">
                        Click &quot;Run&quot; to test your solution with sample test cases.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 font-sans">
                    {submission.data?.submission ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40">
                          <div>
                            <span className="text-xs text-muted-foreground">Status:</span>
                            <h4 className="text-base font-bold text-foreground">
                              {submission.data.submission.status.replace('_', ' ')}
                            </h4>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground">Score:</span>
                            <p className="text-xl font-black text-primary">
                              {submission.data.submission.score !== null ? `${submission.data.submission.score}/100` : 'N/A'}
                            </p>
                          </div>
                        </div>

                        {submission.data.submission.result?.testResults && submission.data.submission.result.testResults.length > 0 ? (
                          <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-foreground">Test Case Evaluation:</span>
                            {submission.data.submission.result.testResults.map((test, index) => (
                              <div
                                key={test.id ?? index}
                                className="flex items-center justify-between p-2 rounded border border-border bg-card text-xs font-mono"
                              >
                                <span>{test.name || `Test #${index + 1}`}</span>
                                <Badge tone={test.status === 'PASSED' ? 'success' : 'danger'}>
                                  {test.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-muted-foreground py-6 text-center text-xs">
                        Click &quot;Submit&quot; to grade your solution against all public and hidden test cases.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
