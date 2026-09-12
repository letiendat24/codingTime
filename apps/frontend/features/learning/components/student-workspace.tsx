'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Columns, Download, FileCode, History, Play, Send, Terminal } from 'lucide-react';
import { Badge, Button, Dialog, StatusBadge } from '../../../design-system';
import type {
  CodeSnapshotDetail,
  ExecutionDetail,
  JudgeSubmissionDetail,
  Workspace,
  WorkspaceFile,
  WorkspaceRevision,
} from '../../../lib/api';
import { requestJson } from '../../../lib/api';
import { queryKeys } from '../../../lib/query/keys';
import { useI18n } from '../../../providers/i18n-provider';
import { useTheme } from '../../../providers/theme-provider';
import { DiffModal } from './diff-modal';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export interface StudentWorkspaceProps {
  readonly workspaceId: string;
  readonly snapshotId?: string | undefined;
  readonly referenceSnapshot?: CodeSnapshotDetail | undefined;
  readonly mobileMode?: ('video' | 'code' | 'instructor' | 'output') | undefined;
}

export function StudentWorkspace({
  workspaceId,
  snapshotId,
  referenceSnapshot,
  mobileMode: _mobileMode,
}: StudentWorkspaceProps) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<readonly WorkspaceFile[]>([]);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [resultTab, setResultTab] = useState<'output' | 'judge'>('output');

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.revisions(workspaceId) });
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
      setShowImportConfirm(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.revisions(workspaceId) });
    },
  });

  const revisions = useQuery({
    queryKey: queryKeys.workspace.revisions(workspaceId),
    enabled: showRevisions,
    queryFn: () =>
      requestJson<{ readonly items: readonly WorkspaceRevision[] }>(`/workspaces/${workspaceId}/revisions`),
  });

  const restoreRevision = useMutation({
    mutationFn: (revisionId: string) =>
      requestJson<{ readonly workspace: Workspace }>(
        `/workspaces/${workspaceId}/revisions/${revisionId}/restore`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      setDraftFiles(data.workspace.files);
      setSelectedPath(data.workspace.entryFile);
      setShowRevisions(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.detail(workspaceId) });
    },
  });

  const runWorkspace = useMutation({
    mutationFn: async () => {
      await saveWorkspace.mutateAsync(draftFiles);
      setResultTab('output');
      return requestJson<{ readonly id: string; readonly status: string }>(
        `/workspaces/${workspaceId}/executions`,
        { method: 'POST' },
      );
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
      setResultTab('judge');
      return requestJson<{ readonly id: string; readonly status: string }>(
        `/workspaces/${workspaceId}/submissions`,
        { method: 'POST' },
      );
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
      const response = await requestJson<{ readonly submission: JudgeSubmissionDetail }>(
        `/submissions/${submissionId}`,
      );
      return response.submission;
    },
  });

  const activeFile = draftFiles.find((file) => file.path === selectedPath) ?? draftFiles[0];

  function updateActiveFileContent(content: string) {
    if (!activeFile) return;
    setDraftFiles((files) =>
      files.map((file) => (file.path === activeFile.path ? { ...file, content } : file)),
    );
  }

  const testResults = submission.data?.result?.testResults ?? [];

  return (
    <div className="space-y-4">
      {/* Workspace Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
            {t('learning.myCode')}
          </h2>
          <Badge tone="neutral" className="font-mono text-[11px]">
            {workspace.data?.language ?? 'javascript'}
          </Badge>
          {saveWorkspace.isPending ? (
            <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>
          ) : (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Saved</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshotId ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowImportConfirm(true)}
              className="text-xs"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-primary" />
              <span>{t('learning.loadSnapshot')}</span>
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowDiff(true)}
            className="text-xs"
          >
            <Columns className="h-3.5 w-3.5 mr-1" />
            <span>{t('learning.compare')}</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowRevisions(true)}
            className="text-xs"
          >
            <History className="h-3.5 w-3.5 mr-1" />
            <span>{t('learning.revisions')}</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            isLoading={runWorkspace.isPending || execution.data?.status === 'RUNNING'}
            onClick={() => runWorkspace.mutate()}
            className="text-xs"
          >
            <Play className="h-3.5 w-3.5 mr-1 text-emerald-500" />
            <span>{t('common.run')}</span>
          </Button>

          <Button
            size="sm"
            isLoading={submitWorkspace.isPending || submission.data?.status === 'RUNNING'}
            onClick={() => submitWorkspace.mutate()}
            className="text-xs shadow-xs"
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            <span>{t('learning.submitJudge')}</span>
          </Button>
        </div>
      </div>

      {/* Editor & Output Panel Grid */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        {/* Editor container */}
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          {/* File tabs */}
          <div className="flex overflow-x-auto border-b border-border bg-muted/60 px-2 pt-1 scrollbar-none">
            {draftFiles.map((file) => {
              const isActive = file.path === (selectedPath ?? draftFiles[0]?.path);
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-mono transition-colors ${
                    isActive
                      ? 'border-t border-l border-r border-border bg-card text-foreground font-semibold -mb-px'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <FileCode className="h-3 w-3 text-muted-foreground" />
                  <span>{file.path}</span>
                </button>
              );
            })}
          </div>

          {/* Monaco Editor */}
          <MonacoEditor
            height="400px"
            language={workspace.data?.language === 'javascript' ? 'javascript' : 'plaintext'}
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
            value={activeFile?.content ?? ''}
            onChange={(value) => updateActiveFileContent(value ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              tabSize: 2,
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
              padding: { top: 8, bottom: 8 },
            }}
          />
        </div>

        {/* Console / Output & Judge Result Panel */}
        <div className="flex flex-col rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <div className="flex border-b border-border bg-muted/50 px-2">
            <button
              type="button"
              onClick={() => setResultTab('output')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                resultTab === 'output'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>{t('learning.runOutput')}</span>
              {execution.data ? (
                <Badge tone={execution.data.status === 'SUCCEEDED' ? 'success' : 'neutral'} className="text-[9px] px-1 py-0">
                  {execution.data.status}
                </Badge>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setResultTab('judge')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                resultTab === 'judge'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>{t('learning.judgeResult')}</span>
              {submission.data ? (
                <Badge tone={submission.data.passed ? 'success' : 'warning'} className="text-[9px] px-1 py-0">
                  {submission.data.passed ? 'Passed' : submission.data.status}
                </Badge>
              ) : null}
            </button>
          </div>

          <div className="flex-1 p-3 overflow-auto max-h-[380px] font-mono text-xs">
            {resultTab === 'output' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-sans">
                  <span>Status: <StatusBadge value={execution.data?.status ?? 'IDLE'} /></span>
                  {execution.data?.result ? (
                    <span>{execution.data.result.durationMs}ms</span>
                  ) : null}
                </div>

                {execution.data?.result ? (
                  <div className="space-y-2 pt-1">
                    {execution.data.result.stdout ? (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-muted-foreground font-sans">stdout:</span>
                        <pre className="mt-1 rounded bg-muted/60 p-2.5 text-foreground overflow-auto whitespace-pre-wrap">
                          {execution.data.result.stdout}
                        </pre>
                      </div>
                    ) : null}

                    {execution.data.result.stderr ? (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-destructive font-sans">stderr:</span>
                        <pre className="mt-1 rounded bg-destructive/10 p-2.5 text-destructive overflow-auto whitespace-pre-wrap">
                          {execution.data.result.stderr}
                        </pre>
                      </div>
                    ) : null}

                    {!execution.data.result.stdout && !execution.data.result.stderr ? (
                      <p className="text-muted-foreground py-4 text-center font-sans text-xs">
                        Execution completed with no output.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground py-8 text-center font-sans text-xs">
                    Click &quot;Run&quot; to execute your code in the sandbox.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 font-sans">
                {submission.data ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40">
                      <div>
                        <span className="text-xs text-muted-foreground">Result:</span>
                        <h4 className="text-base font-bold text-foreground">
                          {submission.data.status.replace('_', ' ')}
                        </h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">Score:</span>
                        <p className="text-xl font-black text-primary">
                          {submission.data.score !== null ? `${submission.data.score}/100` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {testResults.length > 0 ? (
                      <div className="space-y-1.5">
                        <span className="text-xs font-semibold text-foreground">Test Case Details:</span>
                        {testResults.map((test, index) => (
                          <div
                            key={test.id ?? index}
                            className="flex items-center justify-between p-2 rounded border border-border bg-card text-xs"
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
                  <p className="text-muted-foreground py-8 text-center text-xs">
                    Click &quot;Submit to Judge&quot; to run automated test evaluation.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compare Modal */}
      {showDiff ? (
        <DiffModal
          open={showDiff}
          onClose={() => setShowDiff(false)}
          studentFiles={draftFiles}
          instructorSnapshot={referenceSnapshot}
          language={workspace.data?.language}
        />
      ) : null}

      {/* Import Snapshot Confirmation Dialog */}
      <Dialog
        open={showImportConfirm}
        onClose={() => setShowImportConfirm(false)}
        title={t('learning.loadSnapshot')}
        description={t('learning.importWarning')}
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-muted-foreground">
            This will replace your current workspace files with the instructor snapshot at the current video timestamp.
            A backup revision of your current work will automatically be created and can be restored anytime from
            the Revisions menu.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowImportConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              isLoading={importSnapshot.isPending}
              onClick={() => importSnapshot.mutate()}
            >
              Replace Workspace
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Revisions History Dialog */}
      <Dialog
        open={showRevisions}
        onClose={() => setShowRevisions(false)}
        title={t('learning.workspaceBackups')}
        description="Select a previous backup revision to restore your workspace."
      >
        <div className="space-y-3 pt-2 max-h-80 overflow-auto">
          {revisions.data?.items && revisions.data.items.length > 0 ? (
            revisions.data.items.map((rev) => (
              <div
                key={rev.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {rev.source.replace('_', ' ')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(rev.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={restoreRevision.isPending}
                  onClick={() => restoreRevision.mutate(rev.id)}
                >
                  {t('learning.restoreRevision')}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">No backup revisions found.</p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
