'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Plus,
  Clock,
  Trash2,
  Edit2,
  Save,
  Play,
  Copy,
  FilePlus,
  X,
  Code2,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '../../../design-system/components/button';
import { Input } from '../../../design-system/components/input';
import { Select } from '../../../design-system/components/select';
import { Switch } from '../../../design-system/components/switch';
import { type CodeSnapshotDetail, requestJson } from '../../../lib/api';
import { formatTime, parseTimeString, findPreviousSnapshot } from '../../../lib/video-learning';
import { useTheme } from '../../../providers/theme-provider';
import { useToast } from '../../../providers/toast-provider';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export interface CodeAlongStudioProps {
  readonly lessonId: string;
  readonly videoAssetId: string;
  readonly currentVideoTimeSeconds?: number | undefined;
  readonly onSeekToSeconds?: ((seconds: number) => void) | undefined;
}

interface WorkspaceFileState {
  path: string;
  content: string;
}

function detectMonacoLanguage(filePath: string, defaultLanguage: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'javascript';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'h':
    case 'hpp':
      return 'cpp';
    case 'java':
      return 'java';
    case 'json':
      return 'json';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'sql':
      return 'sql';
    case 'md':
      return 'markdown';
    default:
      return defaultLanguage === 'typescript' ? 'typescript' : defaultLanguage;
  }
}

export function CodeAlongStudio({
  lessonId,
  videoAssetId,
  currentVideoTimeSeconds = 0,
  onSeekToSeconds,
}: CodeAlongStudioProps) {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const toast = useToast();

  const [enabled, setEnabled] = useState(true);
  const [language, setLanguage] = useState('typescript');
  const [entryFile, setEntryFile] = useState('src/index.ts');

  // Multi-File Snapshot Authoring State
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [snapshotTimeString, setSnapshotTimeString] = useState('00:00');
  const [snapshotTitle, setSnapshotTitle] = useState('');
  const [files, setFiles] = useState<WorkspaceFileState[]>([{ path: 'src/index.ts', content: '// Instructor code\n' }]);
  const [activeFilePath, setActiveFilePath] = useState('src/index.ts');
  const [newFilePathInput, setNewFilePathInput] = useState('');
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [practiceEnabled, setPracticeEnabled] = useState(false);
  const [practiceInstruction, setPracticeInstruction] = useState('');
  const [practiceVerificationMode, setPracticeVerificationMode] = useState<'NONE' | 'CODE_COMPARE' | 'TESTS'>('NONE');
  const [practiceBehavior, setPracticeBehavior] = useState<'GUIDED' | 'REQUIRED'>('GUIDED');

  // Query existing snapshots
  const snapshotsQuery = useQuery({
    queryKey: ['instructor-code-snapshots', videoAssetId],
    queryFn: () =>
      requestJson<{ readonly codeSnapshots: readonly CodeSnapshotDetail[] }>(
        `/instructor/videos/${videoAssetId}/code-snapshots`,
      ),
  });

  const snapshots = [...(snapshotsQuery.data?.codeSnapshots ?? [])].sort(
    (a, b) => a.timestampSeconds - b.timestampSeconds,
  );

  const saveConfig = useMutation({
    mutationFn: (nextEnabled: boolean) =>
      requestJson(`/instructor/lessons/${lessonId}/code-along`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: nextEnabled, language, entryFile }),
      }),
    onSuccess: () => {
      toast.success('Code-along configuration saved');
    },
    onError: (error) => {
      toast.error('Failed to update code-along configuration', error instanceof Error ? error.message : undefined);
    },
  });

  const saveSnapshotMutation = useMutation({
    mutationFn: async () => {
      const timestampSeconds = parseTimeString(snapshotTimeString);
      const payload = {
        timestampSeconds,
        title: snapshotTitle.trim() || null,
        language,
        files: files.map((f) => ({ path: f.path.trim(), content: f.content })),
      };

      const saved = editingSnapshotId
        ? await requestJson<{ readonly codeSnapshot: CodeSnapshotDetail }>(
          `/instructor/code-snapshots/${editingSnapshotId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
        )
        : await requestJson<{ readonly codeSnapshot: CodeSnapshotDetail }>(
          `/instructor/videos/${videoAssetId}/code-snapshots`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );

      if (practiceEnabled && !editingSnapshotId) {
        const checkpoint = await requestJson<{ readonly checkpoint: { readonly id: string } }>(
          `/instructor/videos/${videoAssetId}/checkpoints`,
          {
            method: 'POST',
            body: JSON.stringify({
              timestampSeconds,
              type: 'INFO',
              title: snapshotTitle.trim() || `Practice at ${formatTime(timestampSeconds)}`,
              description: practiceInstruction.trim() || null,
              required: practiceBehavior === 'REQUIRED',
              pauseVideo: false,
            }),
          },
        );
        await requestJson(`/instructor/checkpoints/${checkpoint.checkpoint.id}/practice-step`, {
          method: 'PUT',
          body: JSON.stringify({
            practiceEnabled: true,
            practiceVerificationMode,
            practiceBehavior,
            practiceSnapshotId: saved.codeSnapshot.id,
            practiceTargetFilePath: activeFilePath,
          }),
        });
      }

      return saved;
    },
    onSuccess: () => {
      setIsCreatingSnapshot(false);
      setEditingSnapshotId(null);
      toast.success(editingSnapshotId ? 'Milestone updated' : 'Milestone snapshot captured');
      void queryClient.invalidateQueries({ queryKey: ['instructor-code-snapshots', videoAssetId] });
    },
    onError: (error) => {
      toast.error('Failed to save code snapshot', error instanceof Error ? error.message : undefined);
    },
  });

  const deleteSnapshot = useMutation({
    mutationFn: (snapshotId: string) =>
      requestJson(`/instructor/code-snapshots/${snapshotId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Snapshot deleted');
      void queryClient.invalidateQueries({ queryKey: ['instructor-code-snapshots', videoAssetId] });
    },
    onError: (error) => {
      toast.error('Failed to delete snapshot', error instanceof Error ? error.message : undefined);
    },
  });

  const startCreatingSnapshot = () => {
    const formattedCurrentTime = formatTime(currentVideoTimeSeconds);
    const prevSnapshot = findPreviousSnapshot(currentVideoTimeSeconds, snapshots);

    setEditingSnapshotId(null);
    setSnapshotTimeString(formattedCurrentTime);
    setSnapshotTitle(`Milestone at ${formattedCurrentTime}`);
    setPracticeEnabled(false);
    setPracticeInstruction('');
    setPracticeVerificationMode('NONE');
    setPracticeBehavior('GUIDED');

    if (prevSnapshot && prevSnapshot.files.length > 0) {
      // Smart clone from previous milestone
      const clonedFiles = prevSnapshot.files.map((f) => ({ path: f.path, content: f.content }));
      setFiles(clonedFiles);
      setActiveFilePath(clonedFiles[0]?.path ?? entryFile ?? 'src/index.ts');
    } else {
      // Starter file
      const defaultPath = entryFile || 'src/index.ts';
      setFiles([{ path: defaultPath, content: `// Project milestone at ${formattedCurrentTime}\n` }]);
      setActiveFilePath(defaultPath);
    }

    setIsCreatingSnapshot(true);
  };

  const startEditingSnapshot = (snap: CodeSnapshotDetail) => {
    setEditingSnapshotId(snap.id);
    setSnapshotTimeString(formatTime(snap.timestampSeconds));
    setSnapshotTitle(snap.title ?? '');
    setPracticeEnabled(false);
    setPracticeInstruction('');
    setPracticeVerificationMode('NONE');
    setPracticeBehavior('GUIDED');

    const snapFiles = snap.files.length > 0
      ? snap.files.map((f) => ({ path: f.path, content: f.content }))
      : [{ path: entryFile || 'src/index.ts', content: '' }];

    setFiles(snapFiles);
    setActiveFilePath(snapFiles[0]?.path ?? entryFile ?? 'src/index.ts');
    setIsCreatingSnapshot(true);
  };

  const handleActiveFileContentChange = (val: string | undefined) => {
    const newContent = val ?? '';
    setFiles((prev) =>
      prev.map((f) => (f.path === activeFilePath ? { ...f, content: newContent } : f)),
    );
  };

  const handleAddNewFile = () => {
    const trimmed = newFilePathInput.trim();
    if (!trimmed) return;

    if (files.some((f) => f.path.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('File already exists in this snapshot');
      return;
    }

    const newFile: WorkspaceFileState = { path: trimmed, content: '' };
    setFiles((prev) => [...prev, newFile]);
    setActiveFilePath(trimmed);
    setNewFilePathInput('');
    setIsAddingFile(false);
  };

  const handleRemoveFile = (pathToRemove: string) => {
    if (files.length <= 1) {
      toast.error('Snapshot must have at least one file');
      return;
    }

    const updated = files.filter((f) => f.path !== pathToRemove);
    setFiles(updated);
    if (activeFilePath === pathToRemove) {
      setActiveFilePath(updated[0]?.path ?? '');
    }
  };

  const handleCopyFromPrevious = () => {
    const prev = findPreviousSnapshot(parseTimeString(snapshotTimeString), snapshots);
    if (prev && prev.files.length > 0) {
      const cloned = prev.files.map((f) => ({ path: f.path, content: f.content }));
      setFiles(cloned);
      setActiveFilePath(cloned[0]?.path ?? '');
      toast.success('Cloned files from previous milestone');
    }
  };

  const handleResetToClean = () => {
    const defaultPath = entryFile || 'src/index.ts';
    setFiles([{ path: defaultPath, content: '// Clean workspace\n' }]);
    setActiveFilePath(defaultPath);
    toast.info('Workspace reset to empty starter file');
  };

  const activeFile = files.find((f) => f.path === activeFilePath) ?? files[0];
  const previousSnapshot = findPreviousSnapshot(parseTimeString(snapshotTimeString), snapshots);

  return (
    <div className="space-y-6 pt-4 border-t border-border/60">
      {/* Code Along Header & Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Camera className="h-4 w-4 text-foreground" />
            <span>Code-Along Milestone Studio</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Capture instructor code milestones across video timestamps for interactive student sync.
          </p>
        </div>

        <label className="flex items-center gap-2.5 text-xs font-semibold text-foreground cursor-pointer bg-muted/50 px-3 py-1.5 rounded-lg border border-border/70">
          <span>Enable Code-Along</span>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              saveConfig.mutate(checked);
            }}
          />
        </label>
      </div>

      {/* Language & Entry File Configuration */}
      <div className="grid gap-4 sm:grid-cols-2 p-4 rounded-xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Language
          </label>
          <Select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              saveConfig.mutate(enabled);
            }}
            options={[
              { label: 'TypeScript / JavaScript', value: 'typescript' },
              { label: 'Python 3', value: 'python' },
              { label: 'Go', value: 'go' },
              { label: 'Rust', value: 'rust' },
              { label: 'C++', value: 'cpp' },
              { label: 'Java', value: 'java' },
            ]}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Entry File
          </label>
          <Input
            value={entryFile}
            onChange={(e) => {
              setEntryFile(e.target.value);
              saveConfig.mutate(enabled);
            }}
            placeholder="e.g. src/index.ts or main.py"
            className="font-mono text-xs"
          />
        </div>
      </div>

      {/* Timeline Milestones Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Instructor Timeline
            </h4>
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {snapshots.length} milestones
            </span>
          </div>

          {!isCreatingSnapshot && (
            <Button
              size="sm"
              variant="secondary"
              onClick={startCreatingSnapshot}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              Add Milestone ({formatTime(currentVideoTimeSeconds)})
            </Button>
          )}
        </div>

        {/* Snapshot Editor (when active) */}
        {isCreatingSnapshot && (
          <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-foreground" />
                <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {editingSnapshotId ? 'Edit Milestone Snapshot' : 'Capture Milestone Snapshot'}
                </h5>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsCreatingSnapshot(false);
                  setEditingSnapshotId(null);
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            </div>

            {/* Metadata Controls */}
            <div className="grid gap-3 sm:grid-cols-12 items-end">
              <div className="sm:col-span-4">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Timestamp (mm:ss)
                </label>
                <div className="flex gap-1.5">
                  <Input
                    value={snapshotTimeString}
                    onChange={(e) => setSnapshotTimeString(e.target.value)}
                    placeholder="00:00"
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => setSnapshotTimeString(formatTime(currentVideoTimeSeconds))}
                    className="shrink-0 text-xs px-2.5"
                  >
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    Use Video
                  </Button>
                </div>
              </div>

              <div className="sm:col-span-8">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Milestone Title
                </label>
                <Input
                  value={snapshotTitle}
                  onChange={(e) => setSnapshotTitle(e.target.value)}
                  placeholder="e.g. User Model and Schema"
                  className="text-xs"
                />
              </div>
            </div>

            {/* Editor & File Management */}
            <div className="space-y-3 pt-2">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Switch checked={practiceEnabled} onCheckedChange={setPracticeEnabled} />
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  <span>Enable Practice Step</span>
                </label>
                {practiceEnabled ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Instruction</label>
                      <Input
                        value={practiceInstruction}
                        onChange={(event) => setPracticeInstruction(event.target.value)}
                        placeholder="Implement the validation block"
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Verification</label>
                      <Select
                        value={practiceVerificationMode}
                        onChange={(event) => setPracticeVerificationMode(event.target.value as typeof practiceVerificationMode)}
                        options={[
                          { label: 'None', value: 'NONE' },
                          { label: 'Compare Code', value: 'CODE_COMPARE' },
                          { label: 'Run Tests', value: 'TESTS' },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Behavior</label>
                      <Select
                        value={practiceBehavior}
                        onChange={(event) => setPracticeBehavior(event.target.value as typeof practiceBehavior)}
                        options={[
                          { label: 'Guided', value: 'GUIDED' },
                          { label: 'Required', value: 'REQUIRED' },
                        ]}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* File pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {files.map((f) => (
                    <div
                      key={f.path}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-mono transition-colors ${
                        activeFilePath === f.path
                          ? 'bg-foreground text-background font-semibold'
                          : 'bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer'
                      }`}
                      onClick={() => setActiveFilePath(f.path)}
                    >
                      <span>{f.path}</span>
                      {files.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(f.path);
                          }}
                          className="hover:opacity-70 ml-1"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}

                  {isAddingFile ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={newFilePathInput}
                        onChange={(e) => setNewFilePathInput(e.target.value)}
                        placeholder="src/utils.ts"
                        className="h-7 text-xs font-mono w-32"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddNewFile();
                          if (e.key === 'Escape') setIsAddingFile(false);
                        }}
                      />
                      <Button size="sm" variant="secondary" onClick={handleAddNewFile} className="h-7 px-2 text-xs">
                        Add
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsAddingFile(true)}
                      className="h-7 px-2 text-xs text-muted-foreground"
                    >
                      <FilePlus className="h-3 w-3 mr-1" />
                      Add File
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!editingSnapshotId && previousSnapshot && (
                    <Button size="sm" variant="ghost" onClick={handleCopyFromPrevious} className="text-xs">
                      <Copy className="h-3 w-3 mr-1" />
                      Inherit Previous
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={handleResetToClean} className="text-xs">
                    Reset
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                <MonacoEditor
                  height="340px"
                  language={detectMonacoLanguage(activeFile?.path ?? '', language)}
                  theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                  value={activeFile?.content ?? ''}
                  onChange={handleActiveFileContentChange}
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

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIsCreatingSnapshot(false);
                    setEditingSnapshotId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  isLoading={saveSnapshotMutation.isPending}
                  onClick={() => saveSnapshotMutation.mutate()}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  <span>{editingSnapshotId ? 'Update Milestone' : 'Save Milestone'}</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Lightweight Vertical Timeline */}
        <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/70">
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:border-border hover:shadow-2xs"
            >
              {/* Timeline Bullet */}
              <div className="absolute -left-6 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-background border-2 border-foreground/40" />

              <div className="flex items-start sm:items-center gap-3">
                <span className="font-mono text-xs font-semibold text-foreground bg-muted px-2 py-0.5 rounded-md shrink-0">
                  {formatTime(snap.timestampSeconds)}
                </span>

                <div>
                  <h5 className="text-xs sm:text-sm font-semibold text-foreground">
                    {snap.title || `${snap.language} Snapshot`}
                  </h5>
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                    {snap.files.length} {snap.files.length === 1 ? 'file' : 'files'} · {snap.files.map((f) => f.path).join(', ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {onSeekToSeconds ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onSeekToSeconds(snap.timestampSeconds)}
                    className="h-7 text-xs px-2.5"
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Jump
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startEditingSnapshot(snap)}
                  className="h-7 text-xs px-2.5"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2.5 text-destructive hover:bg-destructive/10"
                  isLoading={deleteSnapshot.isPending && deleteSnapshot.variables === snap.id}
                  onClick={() => deleteSnapshot.mutate(snap.id)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          ))}

          {snapshots.length === 0 && !isCreatingSnapshot && (
            <div className="py-8 text-center text-muted-foreground space-y-1">
              <p className="text-xs font-medium">No timeline milestones captured yet.</p>
              <p className="text-[11px] text-muted-foreground/80">Click &quot;Add Milestone&quot; above to link code snapshots to video timestamps.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
