import type { VideoPracticeStep, WorkspaceFile } from '../../../lib/api';
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
  previousSecond: number,
  currentSecond: number,
  steps: readonly VideoPracticeStep[],
  triggeredStepIds: ReadonlySet<string>,
): VideoPracticeStep | null {
  const [from, to] = previousSecond <= currentSecond
    ? [previousSecond, currentSecond]
    : [currentSecond, previousSecond];

  const candidates = steps
    .filter((step) => !step.completed && step.status !== 'SKIPPED' && !triggeredStepIds.has(step.id))
    .filter((step) => step.timestampSeconds > from && step.timestampSeconds <= to)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  return candidates[0] ?? null;
}

export function shouldPauseForPracticeStep(mode: VideoLearningMode, step: VideoPracticeStep | null): boolean {
  return mode === 'PRACTICE' && Boolean(step);
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

export type VideoCodeAlongLayoutMode = 'SPLIT' | 'FOCUS_VIDEO' | 'FOCUS_CODE';

export const VIDEO_CODE_SPLIT_STORAGE_KEY = 'codesync.video.splitRatio';
export const VIDEO_CODE_LAYOUT_STORAGE_KEY = 'codesync.video.layout';
export const DEFAULT_VIDEO_SPLIT_RATIO = 45;
export const MIN_VIDEO_SPLIT_RATIO = 30;
export const MAX_VIDEO_SPLIT_RATIO = 60;

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
  return value === 'FOCUS_VIDEO' || value === 'FOCUS_CODE' || value === 'SPLIT' ? value : 'SPLIT';
}

export function codeAlongSplitColumns(mode: VideoCodeAlongLayoutMode, videoRatio: number): string {
  if (mode === 'FOCUS_VIDEO') {
    return 'minmax(360px, 72fr) 6px minmax(500px, 28fr)';
  }

  if (mode === 'FOCUS_CODE') {
    return 'minmax(360px, 32fr) 6px minmax(500px, 68fr)';
  }

  const clampedRatio = clampVideoSplitRatio(videoRatio);
  return `minmax(360px, ${clampedRatio}fr) 6px minmax(500px, ${100 - clampedRatio}fr)`;
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

export function instructorSnapshotDoesNotOverwriteStudentCode(
  studentFiles: readonly WorkspaceFile[],
  _activeSnapshotId: string | null,
) {
  return studentFiles;
}
