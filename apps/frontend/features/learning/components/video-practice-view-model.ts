import type { PracticeStepCompletion, VideoPracticeStep, WorkspaceCapabilities, WorkspaceFile } from '../../../lib/api';
import type { CodeSnapshotMetadata } from '../../../lib/api';
import { selectSnapshotAtOrBefore } from '../../../lib/video-learning';

export type VideoLearningMode = 'FOLLOW' | 'PRACTICE';

export function selectActiveInstructorSnapshot(
  currentSecond: number,
  snapshots: readonly CodeSnapshotMetadata[],
) {
  return snapshots.length > 0 ? selectSnapshotAtOrBefore(currentSecond, snapshots) : undefined;
}

export function findPracticeStepCrossed(
  previousTimeMs: number,
  currentTimeMs: number,
  steps: readonly VideoPracticeStep[],
  triggeredStepIds: ReadonlySet<string>,
): VideoPracticeStep | null {
  const [from, to] = previousTimeMs <= currentTimeMs
    ? [previousTimeMs, currentTimeMs]
    : [currentTimeMs, previousTimeMs];

  const candidates = steps
    .filter((step) =>
      !step.completed
      && step.status !== 'COMPLETED'
      && step.status !== 'SKIPPED'
      && !triggeredStepIds.has(step.id))
    .filter((step) => {
      const timestampMs = step.timestampMs ?? step.timestampSeconds * 1000;
      return timestampMs > from && timestampMs <= to;
    })
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  return candidates[0] ?? null;
}

export function shouldPauseForPracticeStep(mode: VideoLearningMode, step: VideoPracticeStep | null): boolean {
  return mode === 'PRACTICE' && Boolean(step);
}

export function defaultVideoLearningMode(hasPracticeSteps: boolean): VideoLearningMode {
  return hasPracticeSteps ? 'PRACTICE' : 'FOLLOW';
}

export function parseStoredVideoLearningMode(value: string | null, hasPracticeSteps: boolean): VideoLearningMode {
  if (value === 'FOLLOW' || value === 'PRACTICE') {
    return value;
  }

  return defaultVideoLearningMode(hasPracticeSteps);
}

export function practiceReferenceSnapshotId(
  activePracticeStep: VideoPracticeStep | null,
  playbackSnapshotId: string | undefined,
): string | undefined {
  return activePracticeStep?.snapshotId ?? playbackSnapshotId;
}

export function findBlockingPracticeSeekStep(
  mode: VideoLearningMode,
  currentTimeMs: number,
  requestedTargetMs: number,
  steps: readonly VideoPracticeStep[],
): VideoPracticeStep | null {
  if (mode !== 'PRACTICE' || requestedTargetMs <= currentTimeMs) {
    return null;
  }

  const candidates = steps
    .filter((step) =>
      (step.required || step.behavior === 'REQUIRED')
      && !step.completed
      && step.status !== 'COMPLETED'
      && step.status !== 'SKIPPED')
    .filter((step) => {
      const timestampMs = step.timestampMs ?? step.timestampSeconds * 1000;
      return timestampMs > currentTimeMs && timestampMs <= requestedTargetMs;
    })
    .sort((a, b) => {
      const left = a.timestampMs ?? a.timestampSeconds * 1000;
      const right = b.timestampMs ?? b.timestampSeconds * 1000;
      return left - right;
    });

  return candidates[0] ?? null;
}

export function findEarliestIncompletePracticeStepAtOrBefore(
  currentTimeMs: number,
  steps: readonly VideoPracticeStep[],
): VideoPracticeStep | null {
  const candidates = steps
    .filter((step) =>
      !step.completed
      && step.status !== 'COMPLETED'
      && step.status !== 'SKIPPED')
    .filter((step) => {
      const timestampMs = step.timestampMs ?? step.timestampSeconds * 1000;
      return timestampMs <= currentTimeMs;
    })
    .sort((a, b) => {
      const left = a.timestampMs ?? a.timestampSeconds * 1000;
      const right = b.timestampMs ?? b.timestampSeconds * 1000;
      return left - right;
    });

  return candidates[0] ?? null;
}

export function watchedPracticeSeekTarget(input: {
  readonly mode: VideoLearningMode;
  readonly requestedSeconds: number;
  readonly furthestWatchedSeconds: number;
}): number {
  if (input.mode !== 'PRACTICE') {
    return input.requestedSeconds;
  }

  return Math.min(input.requestedSeconds, Math.max(0, input.furthestWatchedSeconds));
}

function isPracticeCompletion(value: unknown): value is PracticeStepCompletion {
  const maybe = value as Partial<PracticeStepCompletion> | null;
  const verification = maybe?.verification as Partial<PracticeStepCompletion['verification']> | undefined;
  return Boolean(
    maybe
    && typeof maybe.id === 'string'
    && typeof maybe.status === 'string'
    && typeof maybe.passed === 'boolean'
    && typeof maybe.message === 'string'
    && verification
    && typeof verification.status === 'string'
    && typeof verification.verificationMode === 'string'
    && Array.isArray(verification.details),
  );
}

export function normalizePracticeStepCompletionResponse(value: unknown): PracticeStepCompletion {
  const candidate = isPracticeCompletion(value)
    ? value
    : isPracticeCompletion((value as { readonly practiceProgress?: unknown } | null)?.practiceProgress)
      ? (value as { readonly practiceProgress: PracticeStepCompletion }).practiceProgress
      : null;

  if (candidate) {
    return candidate;
  }

  return {
    id: 'unknown',
    status: 'NOT_STARTED',
    completedAt: null,
    passed: false,
    message: 'Unable to verify this step right now',
    lessonCompleted: false,
    verification: {
      status: 'UNAVAILABLE',
      verificationMode: 'NONE',
      details: ['Practice verification response was unavailable. Please try again.'],
    },
  };
}

export function isCodeAlongRuntimeEnabled(input: {
  readonly configEnabled?: boolean | null | undefined;
  readonly instructorSnapshotCount: number;
}): boolean {
  return Boolean(input.configEnabled || input.instructorSnapshotCount > 0);
}

export function shouldOpenLessonWorkspace(input: {
  readonly isCodeAlongRuntime: boolean;
  readonly workspaceId: string | null;
  readonly hasAttemptedWorkspace: boolean;
  readonly isOpeningWorkspace: boolean;
}): boolean {
  return (
    input.isCodeAlongRuntime
    && !input.workspaceId
    && !input.hasAttemptedWorkspace
    && !input.isOpeningWorkspace
  );
}

export type VideoCodeAlongPermanentSurface = 'video' | 'my-code';

export function codeAlongPermanentSurfaces(_hasActivePracticeStep: boolean): readonly VideoCodeAlongPermanentSurface[] {
  return ['video', 'my-code'];
}

export type VideoCodeAlongLayoutMode = 'SPLIT' | 'FOCUS_VIDEO' | 'FOCUS_CODE' | 'CUSTOM';

export const VIDEO_CODE_SPLIT_STORAGE_KEY = 'codesync.video.splitRatio';
export const VIDEO_CODE_LAYOUT_STORAGE_KEY = 'codesync.video.layout';
export const DEFAULT_VIDEO_SPLIT_RATIO = 45;
export const MIN_VIDEO_SPLIT_RATIO = 30;
export const MAX_VIDEO_SPLIT_RATIO = 60;
export const VIDEO_CODE_ALONG_GRID_CLASS_NAME =
  'flex min-h-0 flex-col gap-3 xl:grid xl:h-[calc(100vh-220px)] xl:min-h-[620px] xl:items-start xl:gap-0';
export const VIDEO_CODE_ALONG_VIDEO_PANE_CLASS_NAME =
  'min-w-0 self-start overflow-hidden border border-border bg-card xl:rounded-l-xl';
export const VIDEO_CODE_ALONG_CODE_PANE_CLASS_NAME =
  'min-w-0 overflow-y-auto border border-border bg-background p-3 xl:h-full xl:rounded-r-xl';

export function clampVideoSplitRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VIDEO_SPLIT_RATIO;
  }

  return Math.min(MAX_VIDEO_SPLIT_RATIO, Math.max(MIN_VIDEO_SPLIT_RATIO, Math.round(value)));
}

export function parseStoredVideoSplitRatio(value: string | null): number {
  return clampVideoSplitRatio(Number(value));
}

export function parseStoredVideoLayoutMode(value: string | null): VideoCodeAlongLayoutMode {
  return value === 'FOCUS_VIDEO' || value === 'FOCUS_CODE' || value === 'SPLIT' || value === 'CUSTOM' ? value : 'SPLIT';
}

export function codeAlongSplitColumns(mode: VideoCodeAlongLayoutMode, videoRatio: number): string {
  if (mode === 'SPLIT') {
    return `minmax(360px, ${DEFAULT_VIDEO_SPLIT_RATIO}fr) 10px minmax(500px, ${100 - DEFAULT_VIDEO_SPLIT_RATIO}fr)`;
  }

  if (mode === 'FOCUS_VIDEO') {
    return 'minmax(360px, 72fr) 10px minmax(500px, 28fr)';
  }

  if (mode === 'FOCUS_CODE') {
    return 'minmax(360px, 32fr) 10px minmax(500px, 68fr)';
  }

  const clampedRatio = clampVideoSplitRatio(videoRatio);
  return `minmax(360px, ${clampedRatio}fr) 10px minmax(500px, ${100 - clampedRatio}fr)`;
}

export type PracticeCheckpointState = 'IDLE' | 'WAITING_FOR_STUDENT' | 'CHECKING' | 'FAILED' | 'COMPLETED' | 'SKIPPED';

export function practiceCheckpointState(input: {
  readonly hasActiveStep: boolean;
  readonly isChecking: boolean;
  readonly isCompleted: boolean;
  readonly isSkipped: boolean;
  readonly hasFailure: boolean;
}): PracticeCheckpointState {
  if (!input.hasActiveStep) {
    return 'IDLE';
  }

  if (input.isSkipped) {
    return 'SKIPPED';
  }

  if (input.isCompleted) {
    return 'COMPLETED';
  }

  if (input.isChecking) {
    return 'CHECKING';
  }

  if (input.hasFailure) {
    return 'FAILED';
  }

  return 'WAITING_FOR_STUDENT';
}

export function practiceTriggerSecondaryPanel(): null {
  return null;
}

export function normalizeCodeForPracticeCompare(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export const DEFAULT_WORKSPACE_CAPABILITIES: WorkspaceCapabilities = {
  allowEditFiles: true,
  allowCreateFiles: false,
  allowCreateFolders: false,
  allowRenameFiles: false,
  allowDeleteFiles: false,
  allowRun: true,
  allowCheck: true,
  allowJudge: true,
};

export function normalizeVirtualWorkspacePath(path: string): string {
  return path.trim().replace(/^\/+/, '').replace(/\/+/g, '/');
}

export function isSafeVirtualWorkspacePath(path: string): boolean {
  if (path.trim().startsWith('/')) {
    return false;
  }

  const normalized = normalizeVirtualWorkspacePath(path);
  return Boolean(normalized)
    && !normalized.startsWith('/')
    && !normalized.includes('\\')
    && normalized.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function pathConflictsWithExistingFile(path: string, files: readonly WorkspaceFile[]): boolean {
  const normalized = normalizeVirtualWorkspacePath(path);
  return files.some((file) => file.path === normalized);
}

export function isFolderNonEmpty(path: string, files: readonly WorkspaceFile[]): boolean {
  const normalized = normalizeVirtualWorkspacePath(path).replace(/\/$/, '');
  return files.some((file) => file.path.startsWith(`${normalized}/`));
}

export function instructorSnapshotDoesNotOverwriteStudentCode(
  studentFiles: readonly WorkspaceFile[],
  _activeSnapshotId: string | null,
) {
  return studentFiles;
}
