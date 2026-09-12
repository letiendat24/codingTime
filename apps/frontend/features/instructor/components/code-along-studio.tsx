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
  Layers,
  FileCode,
  Play,
  Copy,
  FolderOpen,
  FilePlus,
  X,
  Sparkles,
  Code2,
} from 'lucide-react';
import { Button } from '../../../design-system/components/button';
import { Input } from '../../../design-system/components/input';
import { Select } from '../../../design-system/components/select';
import { Switch } from '../../../design-system/components/switch';
import { Badge } from '../../../design-system/components/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
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

      if (editingSnapshotId) {
        return requestJson<{ readonly codeSnapshot: CodeSnapshotDetail }>(
          `/instructor/code-snapshots/${editingSnapshotId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
        );
      }

      return requestJson<{ readonly codeSnapshot: CodeSnapshotDetail }>(
        `/instructor/videos/${videoAssetId}/code-snapshots`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
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
    <Card className="border-primary/20 bg-card shadow-sm">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Code-Along Experience</CardTitle>
              <CardDescription>
                Capture instructor project states across video timestamps. Students can follow along, inspect milestone diffs, or sync code.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
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
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Language & Entry File Configuration */}
        <div className="grid gap-4 sm:grid-cols-2 rounded-lg border bg-muted/30 p-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Primary Language
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
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Default Entry File
            </label>
            <Input
              value={entryFile}
              onChange={(e) => {
                setEntryFile(e.target.value);
                saveConfig.mutate(enabled);
              }}
              placeholder="e.g. src/index.ts or main.py"
              className="font-mono text-sm"
            />
          </div>
        </div>

        {/* Studio Action & Snapshot Timeline Header */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-bold text-foreground">Timeline Milestones</h4>
              <Badge variant="outline" className="text-xs">
                {snapshots.length} Milestones
              </Badge>
            </div>

            {!isCreatingSnapshot && (
              <Button
                size="sm"
                onClick={startCreatingSnapshot}
                leftIcon={<Camera className="h-4 w-4" />}
                className="shadow-xs"
              >
                Capture Milestone at Current Time ({formatTime(currentVideoTimeSeconds)})
              </Button>
            )}
          </div>

          {/* Integrated Multi-File Snapshot Authoring Workspace */}
          {isCreatingSnapshot && (
            <Card className="border-primary/40 bg-card shadow-md animate-in fade-in-0 duration-200">
              <CardHeader className="border-b bg-muted/20 py-3 px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Code2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-foreground">
                        {editingSnapshotId ? 'Edit Milestone Snapshot' : 'Capture Milestone Snapshot'}
                      </h5>
                      <p className="text-[11px] text-muted-foreground">
                        Save project files and instructor code for this video timestamp.
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsCreatingSnapshot(false);
                      setEditingSnapshotId(null);
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* Milestone Metadata Controls */}
                <div className="grid gap-3 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-4">
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                      Video Timestamp (mm:ss or hh:mm:ss)
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
                        title="Use Current Video Player Time"
                        className="shrink-0 text-xs px-2.5"
                      >
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        Use Video Time
                      </Button>
                    </div>
                  </div>

                  <div className="sm:col-span-8">
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                      Milestone Title
                    </label>
                    <Input
                      value={snapshotTitle}
                      onChange={(e) => setSnapshotTitle(e.target.value)}
                      placeholder="e.g. Set up database connection and schemas"
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Smart Previous Milestone Inheritance Indicator */}
                {!editingSnapshotId && previousSnapshot ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span>
                        Inherited {files.length} file(s) from previous milestone ({formatTime(previousSnapshot.timestampSeconds)} - {previousSnapshot.title || 'Milestone'}).
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" type="button" onClick={handleResetToClean} className="h-7 text-xs px-2.5">
                        Start Clean
                      </Button>
                      <Button size="sm" variant="secondary" type="button" onClick={handleCopyFromPrevious} className="h-7 text-xs px-2.5">
                        <Copy className="h-3 w-3 mr-1" />
                        Re-clone
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Multi-File Tab Bar & File Manager */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {files.map((file) => (
                        <div
                          key={file.path}
                          onClick={() => setActiveFilePath(file.path)}
                          className={`group flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono font-medium cursor-pointer border transition-colors ${
                            activeFilePath === file.path
                              ? 'border-primary/50 bg-primary/10 text-primary'
                              : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                          }`}
                        >
                          <FileCode className="h-3.5 w-3.5" />
                          <span>{file.path}</span>
                          {files.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFile(file.path);
                              }}
                              className="opacity-60 hover:opacity-100 hover:text-destructive transition-opacity ml-1"
                              title="Delete file"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}

                      {!isAddingFile ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => setIsAddingFile(true)}
                          className="h-7 text-xs px-2 border border-dashed border-border text-muted-foreground hover:text-foreground"
                        >
                          <FilePlus className="h-3 w-3 mr-1" />
                          Add File
                        </Button>
                      ) : null}
                    </div>

                    <span className="text-[11px] font-mono text-muted-foreground">
                      Editing: <strong className="text-foreground">{activeFile?.path}</strong>
                    </span>
                  </div>

                  {/* Inline Add File Input */}
                  {isAddingFile && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border border-border animate-in fade-in-0 duration-150">
                      <FolderOpen className="h-4 w-4 text-muted-foreground ml-1" />
                      <Input
                        value={newFilePathInput}
                        onChange={(e) => setNewFilePathInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddNewFile();
                          }
                          if (e.key === 'Escape') {
                            setIsAddingFile(false);
                            setNewFilePathInput('');
                          }
                        }}
                        placeholder="e.g. src/routes/auth.ts or package.json"
                        className="h-7 text-xs font-mono"
                        autoFocus
                      />
                      <Button size="sm" onClick={handleAddNewFile} type="button" className="h-7 text-xs px-2.5">
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsAddingFile(false);
                          setNewFilePathInput('');
                        }}
                        type="button"
                        className="h-7 text-xs px-2.5"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}

                  {/* Monaco Code Editor */}
                  <div className="h-72 overflow-hidden rounded-lg border border-border">
                    <MonacoEditor
                      height="100%"
                      language={detectMonacoLanguage(activeFile?.path ?? '', language)}
                      value={activeFile?.content ?? ''}
                      theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                      onChange={handleActiveFileContentChange}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="text-xs text-muted-foreground">
                    Total files in milestone: <strong className="text-foreground">{files.length}</strong>
                  </div>

                  <div className="flex gap-2">
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
                      leftIcon={<Save className="h-4 w-4" />}
                    >
                      {editingSnapshotId ? 'Update Milestone' : 'Save Milestone'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Chronological List of Milestones */}
          <div className="space-y-2.5">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3.5 hover:border-primary/40 transition-colors shadow-2xs"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <Badge tone="info" className="font-mono text-xs py-1 px-2.5 shrink-0">
                    <Clock className="h-3 w-3 mr-1 inline" />
                    {formatTime(snap.timestampSeconds)}
                  </Badge>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {snap.title || `${snap.language} Snapshot`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground">
                      <span className="text-foreground/80 font-medium">
                        {snap.files.length} {snap.files.length === 1 ? 'file' : 'files'}:
                      </span>
                      {snap.files.slice(0, 3).map((f) => (
                        <span key={f.path} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                          {f.path}
                        </span>
                      ))}
                      {snap.files.length > 3 ? (
                        <span className="text-[11px]">+{snap.files.length - 3} more</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {onSeekToSeconds ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onSeekToSeconds(snap.timestampSeconds)}
                      leftIcon={<Play className="h-3 w-3 text-primary" />}
                      title="Seek video player to this timestamp"
                      className="h-7 text-xs px-2.5"
                    >
                      Jump to Video
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEditingSnapshot(snap)}
                    leftIcon={<Edit2 className="h-3 w-3" />}
                    className="h-7 text-xs px-2.5"
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2.5 text-destructive hover:bg-destructive/10"
                    isLoading={deleteSnapshot.isPending && deleteSnapshot.variables === snap.id}
                    onClick={() => deleteSnapshot.mutate(snap.id)}
                    leftIcon={<Trash2 className="h-3 w-3" />}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}

            {snapshots.length === 0 && !isCreatingSnapshot && (
              <div className="py-10 text-center rounded-lg border border-dashed border-border text-muted-foreground space-y-2">
                <FileCode className="mx-auto h-9 w-9 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">No Milestones Captured Yet</p>
                <p className="text-xs max-w-md mx-auto text-muted-foreground">
                  Play the video above and click &quot;Capture Milestone at Current Time&quot; to save the project state at key teaching moments.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={startCreatingSnapshot}
                  leftIcon={<Plus className="h-4 w-4" />}
                  className="mt-2"
                >
                  Create First Milestone
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
