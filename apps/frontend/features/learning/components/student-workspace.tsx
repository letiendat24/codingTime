'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Columns, Download, FileCode, History, MoreHorizontal, Play, Send, ShieldCheck, Terminal } from 'lucide-react';
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
import { useToast } from '../../../providers/toast-provider';
import { DiffModal } from './diff-modal';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export interface StudentWorkspaceProps {
  readonly workspaceId: string;
  readonly snapshotId?: string | undefined;
  readonly referenceSnapshot?: CodeSnapshotDetail | undefined;
  readonly mobileMode?: ('video' | 'code' | 'instructor' | 'output') | undefined;
  readonly onPass?: (() => void) | undefined;
  readonly editorHeight?: string | undefined;
  readonly compareSignal?: number | undefined;
}

export function StudentWorkspace({
  workspaceId,
  snapshotId,
  referenceSnapshot,
  mobileMode: _mobileMode,
  onPass,
  editorHeight = '420px',
  compareSignal,
}: StudentWorkspaceProps) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const toast = useToast();

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
    meta: { suppressGlobalToast: true },
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
    onError: (error) => {
      toast.error('Unable to import instructor code', error instanceof Error ? error.message : undefined);
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
    onError: (error) => {
      toast.error('Unable to restore revision', error instanceof Error ? error.message : undefined);
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
    onError: (error) => {
      toast.error('Unable to run code', error instanceof Error ? error.message : undefined);
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
    onError: (error) => {
      toast.error('Unable to submit code', error instanceof Error ? error.message : undefined);
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

  const hasNotifiedPassRef = useRef(false);
  useEffect(() => {
    if (submission.data?.passed && !hasNotifiedPassRef.current) {
      hasNotifiedPassRef.current = true;
      onPass?.();
    }
  }, [submission.data?.passed, onPass]);

  useEffect(() => {
    if (!compareSignal || !referenceSnapshot) {
      return;
    }

    setShowDiff(true);
  }, [compareSignal, referenceSnapshot]);

  const activeFile = draftFiles.find((file) => file.path === selectedPath) ?? draftFiles[0];

  function updateActiveFileContent(content: string) {
    if (!activeFile) return;
    setDraftFiles((files) =>
      files.map((file) => (file.path === activeFile.path ? { ...file, content } : file)),
    );
  }

  const testResults = submission.data?.result?.testResults ?? [];
  const publicTestResults = testResults.filter((test) => test.visibility === 'PUBLIC');
  const hiddenTestResults = testResults.filter((test) => test.visibility === 'HIDDEN');
  const hiddenTotal = hiddenTestResults.length;
  const hiddenPassed = hiddenTestResults.filter((t) => t.status === 'PASSED').length;

  return (
    <div className="flex flex-col space-y-3">
      {/* Integrated Workspace Container */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {/* Workspace Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/60 bg-muted/30 px-3 py-2">
          {/* File Tabs & Status */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1">
              {draftFiles.map((file) => {
                const isActive = file.path === (selectedPath ?? draftFiles[0]?.path);
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono transition-all ${
                      isActive
                        ? 'bg-card text-foreground font-semibold shadow-2xs border border-border/60'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{file.path}</span>
                  </button>
                );
              })}
            </div>

            <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

            <span className="hidden sm:inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
              {workspace.data?.language ?? 'javascript'}
            </span>

            {saveWorkspace.isPending ? (
              <span className="text-[11px] text-muted-foreground animate-pulse hidden sm:inline">Saving...</span>
            ) : (
              <span className="text-[11px] text-muted-foreground/80 hidden sm:flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Saved</span>
              </span>
            )}
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="secondary"
              isLoading={runWorkspace.isPending || execution.data?.status === 'RUNNING'}
              onClick={() => {
                setResultTab('output');
                runWorkspace.mutate();
              }}
              className="h-8 text-xs font-semibold"
            >
              <Play className="h-3.5 w-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
              <span>{t('common.run')}</span>
            </Button>

            <Button
              size="sm"
              isLoading={submitWorkspace.isPending || submission.data?.status === 'RUNNING'}
              onClick={() => {
                setResultTab('judge');
                submitWorkspace.mutate();
              }}
              className="h-8 text-xs font-semibold shadow-xs"
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              <span>{t('learning.submitJudge')}</span>
            </Button>

            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2.5 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:bg-muted/70">
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">More</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 flex min-w-48 flex-col gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => setShowDiff(true)}
                  className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Columns className="h-3.5 w-3.5" />
                  {t('learning.compare')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRevisions(true)}
                  className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                >
                  <History className="h-3.5 w-3.5" />
                  {t('learning.revisions')}
                </button>
                {snapshotId ? (
                  <button
                    type="button"
                    onClick={() => setShowImportConfirm(true)}
                    className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('learning.loadSnapshot')}
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        </div>

        {/* Monaco Editor Canvas */}
        <div className="relative">
          <MonacoEditor
            height={editorHeight}
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
              padding: { top: 10, bottom: 10 },
              automaticLayout: true,
            }}
          />
        </div>
      </div>

      {/* Output / Judge Station Panel */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {/* Tab Headers */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setResultTab('output')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                resultTab === 'output'
                  ? 'border-foreground text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>{t('learning.runOutput')}</span>
              {execution.data ? (
                <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-medium text-muted-foreground">
                  {execution.data.status}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setResultTab('judge')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                resultTab === 'judge'
                  ? 'border-foreground text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{t('learning.judgeResult')}</span>
              {submission.data ? (
                <span
                  className={`rounded px-1.5 py-0.2 text-[9px] font-medium ${
                    submission.data.passed ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                  }`}
                >
                  {submission.data.passed ? 'Passed' : submission.data.status}
                </span>
              ) : null}
            </button>
          </div>

          <div className="text-[11px] text-muted-foreground font-sans pr-1">
            {resultTab === 'output' && execution.data?.result ? (
              <span>{execution.data.result.durationMs}ms</span>
            ) : resultTab === 'judge' && submission.data?.score !== null && submission.data?.score !== undefined ? (
              <span className="font-semibold text-foreground">Score: {submission.data.score}/100</span>
            ) : null}
          </div>
        </div>

        {/* Panel Content Body */}
        <div className="p-3.5 max-h-[300px] overflow-y-auto font-mono text-xs">
          <AnimatePresence mode="wait">
            {resultTab === 'output' ? (
              <motion.div
                key="output-tab"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-sans">
                  <span>Status: <StatusBadge value={execution.data?.status ?? 'IDLE'} /></span>
                </div>

                {execution.data?.result ? (
                  <div className="space-y-2 pt-1">
                    {execution.data.result.stdout ? (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 font-sans font-medium">Standard Output:</p>
                        <pre className="rounded-lg bg-muted/60 p-2.5 text-foreground whitespace-pre-wrap leading-relaxed border border-border/50">
                          {execution.data.result.stdout}
                        </pre>
                      </div>
                    ) : null}

                    {execution.data.result.stderr ? (
                      <div>
                        <p className="text-[10px] text-destructive mb-1 font-sans font-medium">Standard Error:</p>
                        <pre className="rounded-lg bg-destructive/10 p-2.5 text-destructive whitespace-pre-wrap leading-relaxed border border-destructive/20">
                          {execution.data.result.stderr}
                        </pre>
                      </div>
                    ) : null}

                    {!execution.data.result.stdout && !execution.data.result.stderr ? (
                      <p className="text-muted-foreground text-xs py-2 font-sans">Process completed with no console output.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="py-6 text-center text-muted-foreground font-sans text-xs">
                    <Terminal className="mx-auto h-6 w-6 text-muted-foreground/40 mb-1.5" />
                    <p>Click &quot;Run&quot; to execute your code in the isolated sandbox.</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="judge-tab"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="space-y-3 font-sans"
              >
                {submission.data ? (
                  <div className="space-y-3">
                    {/* Summary Card */}
                    <div
                      className={`rounded-lg p-3 border flex items-center justify-between ${
                        submission.data.passed
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      <div>
                        <h4 className="font-semibold text-xs">
                          {submission.data.passed ? '✓ All Tests Passed!' : 'Submission Evaluation'}
                        </h4>
                        <p className="text-[11px] opacity-85 mt-0.5">
                          Score: {submission.data.score !== null ? `${submission.data.score}/100` : 'Evaluating...'}
                        </p>
                      </div>
                      <Badge tone={submission.data.passed ? 'success' : 'warning'}>
                        {submission.data.passed ? 'PASSED' : submission.data.status}
                      </Badge>
                    </div>

                    {/* Public Test Cases List */}
                    {publicTestResults.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Public Test Cases ({publicTestResults.filter((t) => t.status === 'PASSED').length}/{publicTestResults.length})
                        </p>
                        <div className="space-y-1.5">
                          {publicTestResults.map((test, index) => (
                            <motion.div
                              key={test.id ?? index}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2, delay: index * 0.04 }}
                              className="rounded-lg border border-border/70 bg-card p-2.5 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground text-xs">
                                  {test.name || `Test Case #${index + 1}`}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground font-mono">{test.durationMs}ms</span>
                                  <Badge tone={test.status === 'PASSED' ? 'success' : 'danger'}>
                                    {test.status}
                                  </Badge>
                                </div>
                              </div>
                              {test.actualOutput ? (
                                <div className="text-[11px] font-mono text-muted-foreground">
                                  <span className="text-muted-foreground/60">Output: </span>
                                  {test.actualOutput}
                                </div>
                              ) : null}
                              {test.stderr ? (
                                <div className="text-[11px] font-mono text-destructive">
                                  <span className="opacity-70">Error: </span>
                                  {test.stderr}
                                </div>
                              ) : null}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Hidden Test Cases Summary */}
                    {hiddenTotal > 0 ? (
                      <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5 text-xs flex items-center justify-between">
                        <span className="text-muted-foreground">Protected Hidden Tests:</span>
                        <span className="font-semibold text-foreground font-mono">
                          {hiddenPassed} of {hiddenTotal} Passed
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="py-6 text-center text-muted-foreground text-xs">
                    <ShieldCheck className="mx-auto h-6 w-6 text-muted-foreground/40 mb-1.5" />
                    <p>Click &quot;Submit&quot; to grade your solution against all public and hidden test cases.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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
