'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  ChevronDown,
  ChevronUp,
  Settings,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../../design-system/components/button';
import { Input } from '../../../design-system/components/input';
import { Select } from '../../../design-system/components/select';
import { Switch } from '../../../design-system/components/switch';
import { type CodeSnapshotDetail, type LinkedPracticeProblemSummary, requestJson } from '../../../lib/api';
import { formatTime, parseTimeString, findPreviousSnapshot } from '../../../lib/video-learning';
import { useTheme } from '../../../providers/theme-provider';
import { useToast } from '../../../providers/toast-provider';
import {
  resolveEffectivePracticeConfig,
  type CodeAlongWorkspaceType,
  type VideoPracticeBehavior,
  type VideoPracticeVerificationMode,
} from './code-along-auto-config';

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

interface CodeAlongConfigResponse {
  readonly id: string;
  readonly lessonId: string;
  readonly enabled: boolean;
  readonly language: string;
  readonly entryFile: string | null;
  readonly workspaceType: CodeAlongWorkspaceType;
  readonly defaultPracticeBehavior: VideoPracticeBehavior;
  readonly defaultVerificationStrategy: string;
  readonly allowRun: boolean;
  readonly allowCheck: boolean;
  readonly allowJudge: boolean;
  readonly allowCreateFiles: boolean;
  readonly allowCreateFolders: boolean;
  readonly allowRenameFiles: boolean;
  readonly allowDeleteFiles: boolean;
}

interface CheckpointDetail {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly title: string;
  readonly description: string | null;
  readonly required: boolean;
  readonly practiceEnabled: boolean;
  readonly practiceConfigMode?: 'AUTO' | 'MANUAL_OVERRIDE';
  readonly practiceBehavior: VideoPracticeBehavior;
  readonly practiceVerificationMode: VideoPracticeVerificationMode;
  readonly practiceSnapshotId: string | null;
  readonly practiceProblemId: string | null;
  readonly practiceProblem?: LinkedPracticeProblemSummary | null;
  readonly practiceTargetFilePath: string | null;
}

type MilestoneKind = 'CODE_CHECKPOINT' | 'PRACTICE_PROBLEM';

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

  // 1. LESSON / VIDEO LEVEL STATE
  const [enabled, setEnabled] = useState(true);
  const [language, setLanguage] = useState('typescript');
  const [entryFile, setEntryFile] = useState('src/index.ts');
  const [workspaceType, setWorkspaceType] = useState<CodeAlongWorkspaceType>('SINGLE_FILE');
  const [defaultPracticeBehavior, setDefaultPracticeBehavior] = useState<VideoPracticeBehavior>('REQUIRED');
  const [defaultVerificationStrategy, setDefaultVerificationStrategy] = useState<string>('AUTO');
  const [allowRun, setAllowRun] = useState(true);
  const [allowJudge, setAllowJudge] = useState(true);
  const [allowCreateFiles, setAllowCreateFiles] = useState(false);
  const [allowCreateFolders, setAllowCreateFolders] = useState(false);
  const [allowRenameFiles, setAllowRenameFiles] = useState(false);
  const [allowDeleteFiles, setAllowDeleteFiles] = useState(false);
  const [showVideoSettings, setShowVideoSettings] = useState(false);

  // 2. MILESTONE AUTHORING STATE
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [snapshotTimeString, setSnapshotTimeString] = useState('00:00');
  const [snapshotTitle, setSnapshotTitle] = useState('');
  const [files, setFiles] = useState<WorkspaceFileState[]>([{ path: 'src/index.ts', content: '// Instructor code\n' }]);
  const [activeFilePath, setActiveFilePath] = useState('src/index.ts');
  const [newFilePathInput, setNewFilePathInput] = useState('');
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [studentTask, setStudentTask] = useState('');
  const [milestoneKind, setMilestoneKind] = useState<MilestoneKind>('CODE_CHECKPOINT');
  const [selectedPracticeProblemId, setSelectedPracticeProblemId] = useState('');

  // Milestone Override State
  const [showOverride, setShowOverride] = useState(false);
  const [isOverridden, setIsOverridden] = useState(false);
  const [overrideVerification, setOverrideVerification] = useState<VideoPracticeVerificationMode | 'INHERIT'>('INHERIT');
  const [overrideBehavior, setOverrideBehavior] = useState<VideoPracticeBehavior | 'INHERIT'>('INHERIT');
  const [overrideTargetFile, setOverrideTargetFile] = useState<string>('');
  const [overrideSnapshotId, setOverrideSnapshotId] = useState<string>('');

  // Query existing snapshots
  const snapshotsQuery = useQuery({
    queryKey: ['instructor-code-snapshots', videoAssetId],
    queryFn: () =>
      requestJson<{ readonly codeSnapshots: readonly CodeSnapshotDetail[] }>(
        `/instructor/videos/${videoAssetId}/code-snapshots`,
      ),
  });

  // Query existing checkpoints
  const checkpointsQuery = useQuery({
    queryKey: ['instructor-video-checkpoints', videoAssetId],
    queryFn: () =>
      requestJson<{ readonly checkpoints: readonly CheckpointDetail[] }>(
        `/instructor/videos/${videoAssetId}/checkpoints`,
      ),
  });

  const linkableProblemsQuery = useQuery({
    queryKey: ['instructor-linkable-practice-problems'],
    queryFn: () =>
      requestJson<{ readonly problems: readonly LinkedPracticeProblemSummary[] }>(
        '/instructor/practice-problems/linkable',
      ),
  });

  // Query lesson code-along config
  const lessonConfigQuery = useQuery({
    queryKey: ['instructor-video-lesson-code-along', lessonId],
    queryFn: () =>
      requestJson<{ readonly config: CodeAlongConfigResponse }>(
        `/instructor/lessons/${lessonId}/code-along`,
      ),
  });

  useEffect(() => {
    if (lessonConfigQuery.data?.config) {
      const cfg = lessonConfigQuery.data.config;
      setEnabled(cfg.enabled);
      setLanguage(cfg.language || 'typescript');
      setEntryFile(cfg.entryFile || 'src/index.ts');
      setWorkspaceType(cfg.workspaceType || 'SINGLE_FILE');
      setDefaultPracticeBehavior(cfg.defaultPracticeBehavior || 'REQUIRED');
      setDefaultVerificationStrategy(cfg.defaultVerificationStrategy || 'AUTO');
      setAllowRun(cfg.allowRun ?? true);
      setAllowJudge(cfg.allowJudge ?? true);
      setAllowCreateFiles(cfg.allowCreateFiles ?? false);
      setAllowCreateFolders(cfg.allowCreateFolders ?? false);
      setAllowRenameFiles(cfg.allowRenameFiles ?? false);
      setAllowDeleteFiles(cfg.allowDeleteFiles ?? false);
    }
  }, [lessonConfigQuery.data]);

  const snapshots = useMemo(() => {
    return [...(snapshotsQuery.data?.codeSnapshots ?? [])].sort(
      (a, b) => a.timestampSeconds - b.timestampSeconds,
    );
  }, [snapshotsQuery.data]);

  const checkpoints = useMemo(() => {
    return checkpointsQuery.data?.checkpoints ?? [];
  }, [checkpointsQuery.data]);

  const practiceOnlyCheckpoints = useMemo(() => {
    const snapshotTimestamps = new Set(snapshots.map((snapshot) => snapshot.timestampSeconds));
    return checkpoints
      .filter((checkpoint) => checkpoint.practiceProblem && !snapshotTimestamps.has(checkpoint.timestampSeconds))
      .sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  }, [checkpoints, snapshots]);

  const linkableProblems = useMemo(() => {
    return linkableProblemsQuery.data?.problems ?? [];
  }, [linkableProblemsQuery.data]);

  // Save Lesson-level configuration
  const saveLessonConfigMutation = useMutation({
    mutationFn: (nextEnabled: boolean = enabled) =>
      requestJson<{ readonly config: CodeAlongConfigResponse }>(`/instructor/lessons/${lessonId}/code-along`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: nextEnabled,
          language,
          entryFile,
          workspaceType,
          defaultPracticeBehavior,
          defaultVerificationStrategy,
          allowEditFiles: true,
          allowCreateFiles,
          allowCreateFolders,
          allowRenameFiles,
          allowDeleteFiles,
          allowRun,
          allowJudge,
        }),
      }),
    onSuccess: (data) => {
      setEnabled(data.config.enabled);
      setLanguage(data.config.language);
      setEntryFile(data.config.entryFile ?? '');
      setWorkspaceType(data.config.workspaceType);
      setDefaultPracticeBehavior(data.config.defaultPracticeBehavior);
      setDefaultVerificationStrategy(data.config.defaultVerificationStrategy);
      setAllowRun(data.config.allowRun);
      setAllowJudge(data.config.allowJudge);
      setAllowCreateFiles(data.config.allowCreateFiles);
      setAllowCreateFolders(data.config.allowCreateFolders);
      setAllowRenameFiles(data.config.allowRenameFiles);
      setAllowDeleteFiles(data.config.allowDeleteFiles);
      toast.success('Video Code-Along Settings saved');
      void queryClient.invalidateQueries({ queryKey: ['instructor-video-lesson-code-along', lessonId] });
    },
    onError: (error) => {
      toast.error('Failed to save code-along settings', error instanceof Error ? error.message : undefined);
    },
  });

  // Derived effective config preview for current milestone
  const currentTimestampSeconds = parseTimeString(snapshotTimeString);
  const effectivePracticePreview = useMemo(() => {
    const allSnapshotCandidates = snapshots.map((s) => ({
      id: s.id,
      timestampSeconds: s.timestampSeconds,
      files: s.files,
    }));

    return resolveEffectivePracticeConfig({
      lessonDefaults: {
        defaultPracticeBehavior,
        defaultVerificationStrategy,
        language,
        entryFile,
      },
      checkpointOverride: isOverridden
        ? {
            behavior: overrideBehavior === 'INHERIT' ? undefined : overrideBehavior,
            verificationMode: overrideVerification === 'INHERIT' ? undefined : overrideVerification,
            targetFilePath: overrideTargetFile.trim() || undefined,
            practiceSnapshotId: overrideSnapshotId || undefined,
          }
        : null,
      checkpointContext: {
        timestampSeconds: currentTimestampSeconds,
        studentTask,
        activeFilePath,
        hasValidTests: false,
        judgeSupported: allowJudge,
        structuralSupported: true,
      },
      milestoneSnapshot: {
        id: editingSnapshotId ?? 'new-snapshot',
        timestampSeconds: currentTimestampSeconds,
        files,
      },
      allSnapshots: allSnapshotCandidates,
    });
  }, [
    activeFilePath,
    allowJudge,
    currentTimestampSeconds,
    defaultPracticeBehavior,
    defaultVerificationStrategy,
    editingSnapshotId,
    entryFile,
    files,
    isOverridden,
    language,
    overrideBehavior,
    overrideSnapshotId,
    overrideTargetFile,
    overrideVerification,
    snapshots,
    studentTask,
  ]);

  // Save Milestone Snapshot & Optional Practice Checkpoint
  const saveSnapshotMutation = useMutation({
    mutationFn: async () => {
      const timestampSeconds = parseTimeString(snapshotTimeString);
      const selectedProblem = linkableProblems.find((problem) => problem.id === selectedPracticeProblemId);

      if (milestoneKind === 'PRACTICE_PROBLEM') {
        if (!selectedProblem) {
          throw new Error('Select a published practice problem for this milestone.');
        }

        const title = snapshotTitle.trim() || selectedProblem.title;
        const latestCheckpoints = await requestJson<{ readonly checkpoints: readonly CheckpointDetail[] }>(
          `/instructor/videos/${videoAssetId}/checkpoints`,
        );
        let matchingCheckpoint = latestCheckpoints.checkpoints.find((c) => c.timestampSeconds === timestampSeconds);
        const required = (overrideBehavior === 'INHERIT' ? defaultPracticeBehavior : overrideBehavior) === 'REQUIRED';

        if (!matchingCheckpoint) {
          const createdCp = await requestJson<{ readonly checkpoint: CheckpointDetail }>(
            `/instructor/videos/${videoAssetId}/checkpoints`,
            {
              method: 'POST',
              body: JSON.stringify({
                timestampSeconds,
                type: 'INFO',
                title,
                description: studentTask.trim() || selectedProblem.description,
                required,
                pauseVideo: true,
              }),
            },
          );
          matchingCheckpoint = createdCp.checkpoint;
        } else {
          await requestJson(`/instructor/checkpoints/${matchingCheckpoint.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              title,
              description: studentTask.trim() || selectedProblem.description,
              required,
              pauseVideo: true,
            }),
          });
        }

        await requestJson(`/instructor/checkpoints/${matchingCheckpoint.id}/practice-step`, {
          method: 'PUT',
          body: JSON.stringify({
            configMode: 'MANUAL_OVERRIDE',
            practiceEnabled: true,
            practiceBehavior: required ? 'REQUIRED' : 'GUIDED',
            practiceVerificationMode: 'TESTS',
            practiceProblemId: selectedProblem.id,
          }),
        });

        return { codeSnapshot: null };
      }

      const payload = {
        timestampSeconds,
        title: snapshotTitle.trim() || null,
        language,
        files: files.map((f) => ({ path: f.path.trim(), content: f.content })),
      };

      const savedSnapshot = editingSnapshotId
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

      const snapshotId = savedSnapshot.codeSnapshot.id;

      const latestCheckpoints = await requestJson<{ readonly checkpoints: readonly CheckpointDetail[] }>(
        `/instructor/videos/${videoAssetId}/checkpoints`,
      );
      // Every milestone has one corresponding code checkpoint at the same timestamp.
      let matchingCheckpoint = latestCheckpoints.checkpoints.find((c) => c.timestampSeconds === timestampSeconds);

      if (!matchingCheckpoint) {
        const createdCp = await requestJson<{ readonly checkpoint: CheckpointDetail }>(
          `/instructor/videos/${videoAssetId}/checkpoints`,
          {
            method: 'POST',
            body: JSON.stringify({
              timestampSeconds,
              type: 'INFO',
              title: snapshotTitle.trim() || `Milestone at ${formatTime(timestampSeconds)}`,
              description: null,
              required: effectivePracticePreview.behavior === 'REQUIRED',
              pauseVideo: false,
            }),
          },
        );
        matchingCheckpoint = createdCp.checkpoint;
      } else {
        await requestJson(`/instructor/checkpoints/${matchingCheckpoint.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: snapshotTitle.trim() || matchingCheckpoint.title,
            required: effectivePracticePreview.behavior === 'REQUIRED',
            pauseVideo: false,
          }),
        });
      }

      const practicePayload = isOverridden
        ? {
            configMode: 'MANUAL_OVERRIDE',
            practiceEnabled: true,
            practiceBehavior: overrideBehavior === 'INHERIT' ? defaultPracticeBehavior : overrideBehavior,
            practiceVerificationMode: overrideVerification === 'INHERIT' ? (defaultVerificationStrategy === 'AUTO' ? effectivePracticePreview.verificationMode : defaultVerificationStrategy) : overrideVerification,
            practiceSnapshotId: overrideSnapshotId || snapshotId,
            practiceTargetFilePath: overrideTargetFile.trim() || activeFilePath,
          }
        : {
            configMode: 'AUTO',
            practiceEnabled: true,
            practiceTargetFilePath: activeFilePath,
          };

      await requestJson(`/instructor/checkpoints/${matchingCheckpoint.id}/practice-step`, {
        method: 'PUT',
        body: JSON.stringify(practicePayload),
      });

      return savedSnapshot;
    },
    onSuccess: () => {
      setIsCreatingSnapshot(false);
      setEditingSnapshotId(null);
      setMilestoneKind('CODE_CHECKPOINT');
      setSelectedPracticeProblemId('');
      toast.success(editingSnapshotId ? 'Milestone updated' : 'Milestone snapshot captured');
      void queryClient.invalidateQueries({ queryKey: ['instructor-code-snapshots', videoAssetId] });
      void queryClient.invalidateQueries({ queryKey: ['instructor-video-checkpoints', videoAssetId] });
      void queryClient.invalidateQueries({ queryKey: ['instructor-video-lesson-code-along', lessonId] });
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
      void queryClient.invalidateQueries({ queryKey: ['instructor-video-checkpoints', videoAssetId] });
    },
    onError: (error) => {
      toast.error('Failed to delete snapshot', error instanceof Error ? error.message : undefined);
    },
  });

  const deleteCheckpoint = useMutation({
    mutationFn: (checkpointId: string) =>
      requestJson(`/instructor/checkpoints/${checkpointId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Practice milestone deleted');
      void queryClient.invalidateQueries({ queryKey: ['instructor-video-checkpoints', videoAssetId] });
    },
    onError: (error) => {
      toast.error('Failed to delete practice milestone', error instanceof Error ? error.message : undefined);
    },
  });

  const startCreatingSnapshot = () => {
    const formattedCurrentTime = formatTime(currentVideoTimeSeconds);
    const prevSnapshot = findPreviousSnapshot(currentVideoTimeSeconds, snapshots);

    setEditingSnapshotId(null);
    setSnapshotTimeString(formattedCurrentTime);
    setSnapshotTitle(`Milestone at ${formattedCurrentTime}`);
    setStudentTask('');
    setMilestoneKind('CODE_CHECKPOINT');
    setSelectedPracticeProblemId('');
    setShowOverride(false);
    setIsOverridden(false);
    setOverrideVerification('INHERIT');
    setOverrideBehavior('INHERIT');
    setOverrideTargetFile('');
    setOverrideSnapshotId('');

    if (prevSnapshot && prevSnapshot.files.length > 0) {
      const clonedFiles = prevSnapshot.files.map((f) => ({ path: f.path, content: f.content }));
      setFiles(clonedFiles);
      setActiveFilePath(clonedFiles[0]?.path ?? entryFile ?? 'src/index.ts');
    } else {
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

    const matchingCp = checkpoints.find((c) => c.timestampSeconds === snap.timestampSeconds);
    setStudentTask(matchingCp?.description ?? '');
    setMilestoneKind('CODE_CHECKPOINT');
    setSelectedPracticeProblemId('');

    if (matchingCp?.practiceConfigMode === 'MANUAL_OVERRIDE') {
      setIsOverridden(true);
      setShowOverride(true);
      setOverrideVerification(matchingCp.practiceVerificationMode ?? 'INHERIT');
      setOverrideBehavior(matchingCp.practiceBehavior ?? 'INHERIT');
      setOverrideTargetFile(matchingCp.practiceTargetFilePath ?? '');
      setOverrideSnapshotId(matchingCp.practiceSnapshotId ?? snap.id);
    } else {
      setIsOverridden(false);
      setShowOverride(false);
      setOverrideVerification('INHERIT');
      setOverrideBehavior('INHERIT');
      setOverrideTargetFile('');
      setOverrideSnapshotId('');
    }

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
      {/* 1. CONSOLIDATED VIDEO CODE-ALONG SETTINGS PANEL */}
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">Video Code-Along Settings</h3>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {workspaceType === 'MULTI_FILE' ? 'Project workspace' : 'Single-file workspace'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configured once for the entire video lesson. Milestones automatically inherit these settings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer bg-muted/40 px-3 py-1.5 rounded-lg border border-border/60">
              <span>Enable Code-Along</span>
              <Switch
                checked={enabled}
                onCheckedChange={(checked) => {
                  setEnabled(checked);
                  saveLessonConfigMutation.mutate(checked);
                }}
              />
            </label>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowVideoSettings((v) => !v)}
              className="text-xs gap-1.5"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>{showVideoSettings ? 'Hide Settings' : 'Customize'}</span>
              {showVideoSettings ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Summary Line when collapsed */}
        {!showVideoSettings && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Summary:</span>
            <span className="rounded bg-muted px-2 py-0.5">{workspaceType === 'MULTI_FILE' ? 'Project' : 'Single-file'}</span>
            <span>•</span>
            <span>Language: <strong className="text-foreground font-mono">{language}</strong></span>
            <span>•</span>
            <span>Run: <strong className="text-foreground">{allowRun ? 'Enabled' : 'Disabled'}</strong></span>
            <span>•</span>
            <span>Judge: <strong className="text-foreground">{allowJudge ? 'Enabled' : 'Disabled'}</strong></span>
            <span>•</span>
            <span>Practice default: <strong className="text-foreground">{defaultPracticeBehavior === 'REQUIRED' ? 'Required' : 'Guided'}</strong></span>
            <span>•</span>
            <span>Verification: <strong className="text-foreground">{defaultVerificationStrategy}</strong></span>
          </div>
        )}

        {/* Expanded Progressive Disclosure Form */}
        {showVideoSettings && (
          <div className="pt-3 border-t border-border/60 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Workspace Type</label>
                <Select
                  value={workspaceType}
                  onChange={(e) => setWorkspaceType(e.target.value as CodeAlongWorkspaceType)}
                  options={[
                    { label: 'Single-file workspace', value: 'SINGLE_FILE' },
                    { label: 'Project workspace', value: 'MULTI_FILE' },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Language</label>
                <Select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
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
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Entry File</label>
                <Input
                  value={entryFile}
                  onChange={(e) => setEntryFile(e.target.value)}
                  placeholder="src/index.ts"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <h4 className="text-xs font-semibold text-foreground">Practice Step Defaults</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Default Verification</label>
                    <Select
                      value={defaultVerificationStrategy}
                      onChange={(e) => setDefaultVerificationStrategy(e.target.value)}
                      options={[
                        { label: 'Auto (Recommended)', value: 'AUTO' },
                        { label: 'AI Semantic', value: 'AI_SEMANTIC' },
                        { label: 'Manual completion', value: 'NONE' },
                        { label: 'File Compare', value: 'FILE_COMPARE' },
                        { label: 'Structural', value: 'STRUCTURAL' },
                        { label: 'Workspace Structure', value: 'WORKSPACE_STRUCTURE' },
                        { label: 'Tests', value: 'TESTS' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Default Behavior</label>
                    <Select
                      value={defaultPracticeBehavior}
                      onChange={(e) => setDefaultPracticeBehavior(e.target.value as VideoPracticeBehavior)}
                      options={[
                        { label: 'Required checkpoint', value: 'REQUIRED' },
                        { label: 'Guided / Skippable', value: 'GUIDED' },
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <h4 className="text-xs font-semibold text-foreground">Student Capabilities</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center justify-between gap-1.5 rounded border border-border/60 bg-background px-2.5 py-1.5 font-medium">
                    <span>Run code</span>
                    <Switch checked={allowRun} onCheckedChange={setAllowRun} />
                  </label>
                  <label className="flex items-center justify-between gap-1.5 rounded border border-border/60 bg-background px-2.5 py-1.5 font-medium">
                    <span>Submit/Judge</span>
                    <Switch checked={allowJudge} onCheckedChange={setAllowJudge} />
                  </label>
                  <label className="flex items-center justify-between gap-1.5 rounded border border-border/60 bg-background px-2.5 py-1.5 font-medium">
                    <span>Create files</span>
                    <Switch checked={allowCreateFiles} onCheckedChange={setAllowCreateFiles} />
                  </label>
                  <label className="flex items-center justify-between gap-1.5 rounded border border-border/60 bg-background px-2.5 py-1.5 font-medium">
                    <span>Create folders</span>
                    <Switch checked={allowCreateFolders} onCheckedChange={setAllowCreateFolders} />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm"
                isLoading={saveLessonConfigMutation.isPending}
                onClick={() => saveLessonConfigMutation.mutate(enabled)}
                className="text-xs"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                <span>Save Video Settings</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 2. TIMELINE MILESTONES SECTION */}
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

        {/* Snapshot / Milestone Editor (when active) */}
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

            {/* Normal Authoring Fields: Timestamp & Title */}
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

            <div className="grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Milestone Type</label>
                <Select
                  value={milestoneKind}
                  onChange={(event) => setMilestoneKind(event.target.value as MilestoneKind)}
                  disabled={Boolean(editingSnapshotId)}
                  options={[
                    { label: 'Code Checkpoint', value: 'CODE_CHECKPOINT' },
                    { label: 'Practice Problem', value: 'PRACTICE_PROBLEM' },
                  ]}
                />
              </div>
              <div className="sm:col-span-8">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Student Description</label>
                <Input
                  value={studentTask}
                  onChange={(event) => setStudentTask(event.target.value)}
                  placeholder="What should students complete at this point?"
                  className="text-xs"
                />
              </div>
            </div>

            {milestoneKind === 'PRACTICE_PROBLEM' ? (
              <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-12">
                <div className="sm:col-span-8">
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Published Practice Problem</label>
                  <Select
                    value={selectedPracticeProblemId}
                    onChange={(event) => setSelectedPracticeProblemId(event.target.value)}
                    options={[
                      { label: linkableProblemsQuery.isLoading ? 'Loading published problems...' : 'Select a published problem', value: '' },
                      ...linkableProblems.map((problem) => ({
                        label: `${problem.title} · ${problem.difficulty} · ${problem.language}`,
                        value: problem.id,
                      })),
                    ]}
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Behavior</label>
                  <Select
                    value={overrideBehavior === 'INHERIT' ? defaultPracticeBehavior : overrideBehavior}
                    onChange={(event) => setOverrideBehavior(event.target.value as VideoPracticeBehavior)}
                    options={[
                      { label: 'Required checkpoint', value: 'REQUIRED' },
                      { label: 'Guided / Skippable', value: 'GUIDED' },
                    ]}
                  />
                </div>
                {selectedPracticeProblemId ? (
                  <p className="sm:col-span-12 text-[11px] leading-5 text-muted-foreground">
                    Students will run public samples and submit the current video workspace to the official Practice/Judge hidden tests.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Summary preview badge */}
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  {milestoneKind === 'PRACTICE_PROBLEM' ? 'Practice Problem' : 'Code Checkpoint'}
                </span>
                <span className="text-xs text-muted-foreground">
                  • {milestoneKind === 'PRACTICE_PROBLEM'
                    ? (linkableProblems.find((problem) => problem.id === selectedPracticeProblemId)?.title ?? 'Select a published problem')
                    : effectivePracticePreview.summary}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5">
                  {milestoneKind === 'PRACTICE_PROBLEM'
                    ? ((overrideBehavior === 'INHERIT' ? defaultPracticeBehavior : overrideBehavior) === 'REQUIRED' ? 'Required' : 'Guided')
                    : effectivePracticePreview.behavior === 'REQUIRED' ? 'Required' : 'Guided'}
                </span>
                <span className="rounded bg-muted px-2 py-0.5">
                  Verification: {milestoneKind === 'PRACTICE_PROBLEM' ? 'Practice Judge' : effectivePracticePreview.verificationMode}
                </span>
              </div>
            </div>

            {/* Progressive Disclosure: Override this step ▾ */}
            {milestoneKind === 'CODE_CHECKPOINT' ? (
            <div className="rounded-lg border border-border/60 bg-card">
              <button
                type="button"
                onClick={() => setShowOverride((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted/30"
              >
                <span>Override this step</span>
                <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                  <span>{isOverridden ? 'Custom override active' : 'Inherits video defaults'}</span>
                  {showOverride ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </button>

              {showOverride && (
                <div className="border-t border-border/60 p-3 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                    <Switch checked={isOverridden} onCheckedChange={setIsOverridden} />
                    <span>Apply custom exception for this milestone</span>
                  </label>

                  {isOverridden && (
                    <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/40">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Verification Override</label>
                        <Select
                          value={overrideVerification}
                          onChange={(e) => setOverrideVerification(e.target.value as VideoPracticeVerificationMode | 'INHERIT')}
                          options={[
                            { label: 'Inherit video defaults', value: 'INHERIT' },
                            { label: 'AI Semantic', value: 'AI_SEMANTIC' },
                            { label: 'Manual completion', value: 'NONE' },
                            { label: 'File Compare', value: 'FILE_COMPARE' },
                            { label: 'Structural', value: 'STRUCTURAL' },
                            { label: 'Workspace Structure', value: 'WORKSPACE_STRUCTURE' },
                            { label: 'Tests', value: 'TESTS' },
                          ]}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Behavior Override</label>
                        <Select
                          value={overrideBehavior}
                          onChange={(e) => setOverrideBehavior(e.target.value as VideoPracticeBehavior | 'INHERIT')}
                          options={[
                            { label: 'Inherit video defaults', value: 'INHERIT' },
                            { label: 'Required checkpoint', value: 'REQUIRED' },
                            { label: 'Guided / Skippable', value: 'GUIDED' },
                          ]}
                        />
                      </div>

                      {effectivePracticePreview.verificationMode !== 'NONE' && (
                        <>
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Target File</label>
                            <Input
                              value={overrideTargetFile}
                              onChange={(e) => setOverrideTargetFile(e.target.value)}
                              placeholder={activeFilePath}
                              className="font-mono text-xs"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Reference Snapshot</label>
                            <Select
                              value={overrideSnapshotId}
                              onChange={(e) => setOverrideSnapshotId(e.target.value)}
                              options={[
                                { label: 'This milestone snapshot (Default)', value: '' },
                                ...snapshots.map((s) => ({
                                  label: `${formatTime(s.timestampSeconds)} - ${s.title || 'Snapshot'}`,
                                  value: s.id,
                                })),
                              ]}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            ) : null}

            {/* Code Editor & File Tabs */}
            {milestoneKind === 'CODE_CHECKPOINT' ? (
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
            ) : (
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIsCreatingSnapshot(false);
                    setEditingSnapshotId(null);
                    setMilestoneKind('CODE_CHECKPOINT');
                    setSelectedPracticeProblemId('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  isLoading={saveSnapshotMutation.isPending}
                  onClick={() => saveSnapshotMutation.mutate()}
                  disabled={!selectedPracticeProblemId}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  <span>Save Practice Milestone</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 3. TIMELINE LIST */}
        <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/70">
          {snapshots.map((snap) => {
            const matchingCp = checkpoints.find((c) => c.timestampSeconds === snap.timestampSeconds);
            const hasPractice = Boolean(matchingCp?.practiceEnabled);

            return (
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
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {hasPractice ? (
                        <>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">Practice</span>
                          {' · '}
                          <span>{matchingCp?.required ? 'Required' : 'Guided'}</span>
                          {' · '}
                          <span>{matchingCp?.practiceConfigMode === 'MANUAL_OVERRIDE' && matchingCp.practiceVerificationMode ? `Override: ${matchingCp.practiceVerificationMode}` : 'Uses video defaults'}</span>
                        </>
                      ) : (
                        <span>Follow only</span>
                      )}
                      {' · '}
                      <span>{snap.files.length} {snap.files.length === 1 ? 'file' : 'files'}</span>
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground/80 mt-0.5">
                      {snap.files.map((f) => f.path).join(', ')}
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
            );
          })}

          {practiceOnlyCheckpoints.map((checkpoint) => (
            <div
              key={checkpoint.id}
              className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:border-border hover:shadow-2xs"
            >
              <div className="absolute -left-6 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary/60 bg-background" />

              <div className="flex items-start gap-3 sm:items-center">
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                  {formatTime(checkpoint.timestampSeconds)}
                </span>
                <div>
                  <h5 className="text-xs font-semibold text-foreground sm:text-sm">
                    {checkpoint.title}
                  </h5>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-primary">Practice Problem</span>
                    {' · '}
                    <span>{checkpoint.practiceProblem?.title}</span>
                    {' · '}
                    <span>{checkpoint.required ? 'Required' : 'Guided'}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    Uses published Practice/Judge tests; no video test cases stored here.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {onSeekToSeconds ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onSeekToSeconds(checkpoint.timestampSeconds)}
                    className="h-7 px-2.5 text-xs"
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Jump
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2.5 text-xs text-destructive hover:bg-destructive/10"
                  isLoading={deleteCheckpoint.isPending && deleteCheckpoint.variables === checkpoint.id}
                  onClick={() => deleteCheckpoint.mutate(checkpoint.id)}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>
          ))}

          {snapshots.length === 0 && practiceOnlyCheckpoints.length === 0 && !isCreatingSnapshot && (
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
