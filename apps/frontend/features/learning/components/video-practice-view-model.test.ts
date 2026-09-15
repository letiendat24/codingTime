import { describe, expect, it } from 'vitest';
import type { VideoPracticeStep, WorkspaceFile } from '../../../lib/api';
import {
  clampVideoSplitRatio,
  codeAlongSplitColumns,
  codeAlongPermanentSurfaces,
  DEFAULT_VIDEO_SPLIT_RATIO,
  findPracticeStepCrossed,
  instructorSnapshotDoesNotOverwriteStudentCode,
  isCodeAlongRuntimeEnabled,
  normalizeCodeForPracticeCompare,
  parseStoredVideoLayoutMode,
  parseStoredVideoSplitRatio,
  practiceCheckpointState,
  practiceTriggerSecondaryPanel,
  selectActiveInstructorSnapshot,
  shouldOpenLessonWorkspace,
  shouldPauseForPracticeStep,
} from './video-practice-view-model';

const steps: readonly VideoPracticeStep[] = [
  {
    id: 'step-20',
    lessonId: 'lesson-1',
    videoAssetId: 'video-1',
    timestampSeconds: 20,
    title: 'Setup',
    instruction: 'Create state',
    required: false,
    behavior: 'GUIDED',
    verificationMode: 'NONE',
    snapshotId: 'snapshot-20',
    targetFilePath: null,
    targetStartLine: null,
    targetEndLine: null,
    status: 'NOT_STARTED',
    completed: false,
  },
  {
    id: 'step-40',
    lessonId: 'lesson-1',
    videoAssetId: 'video-1',
    timestampSeconds: 40,
    title: 'Loop',
    instruction: 'Implement loop',
    required: true,
    behavior: 'REQUIRED',
    verificationMode: 'CODE_COMPARE',
    snapshotId: 'snapshot-40',
    targetFilePath: 'src/index.ts',
    targetStartLine: null,
    targetEndLine: null,
    status: 'NOT_STARTED',
    completed: false,
  },
];

describe('video practice view model', () => {
  it('active instructor snapshot follows video time', () => {
    const snapshot = selectActiveInstructorSnapshot(42, [
      { id: 'snapshot-20', timestampSeconds: 20, title: 'Setup', language: 'typescript' },
      { id: 'snapshot-40', timestampSeconds: 40, title: 'Loop', language: 'typescript' },
    ]);

    expect(snapshot?.id).toBe('snapshot-40');
  });

  it('practice mode pauses once when crossing an incomplete step', () => {
    const triggered = new Set<string>();
    const step = findPracticeStepCrossed(35, 42, steps, triggered);
    expect(shouldPauseForPracticeStep('PRACTICE', step)).toBe(true);

    triggered.add(step!.id);
    expect(findPracticeStepCrossed(35, 42, steps, triggered)).toBeNull();
  });

  it('follow mode never pauses for practice step crossings', () => {
    const step = findPracticeStepCrossed(35, 42, steps, new Set());
    expect(shouldPauseForPracticeStep('FOLLOW', step)).toBe(false);
  });

  it('student code is not overwritten when instructor snapshot changes', () => {
    const files: readonly WorkspaceFile[] = [{ path: 'src/index.ts', content: 'const student = true;\n' }];
    expect(instructorSnapshotDoesNotOverwriteStudentCode(files, 'snapshot-40')).toBe(files);
  });

  it('compare normalization keeps structural text comparison lightweight', () => {
    expect(normalizeCodeForPracticeCompare('const x = 1;  \r\n')).toBe('const x = 1;');
  });

  it('seeking across multiple steps selects the earliest crossed step deterministically', () => {
    expect(findPracticeStepCrossed(10, 45, steps, new Set())?.id).toBe('step-20');
  });

  it('keeps the editable student workspace enabled for snapshot-backed video code-along lessons', () => {
    expect(isCodeAlongRuntimeEnabled({ configEnabled: false, instructorSnapshotCount: 2 })).toBe(true);
    expect(isCodeAlongRuntimeEnabled({ configEnabled: true, instructorSnapshotCount: 0 })).toBe(true);
    expect(isCodeAlongRuntimeEnabled({ configEnabled: false, instructorSnapshotCount: 0 })).toBe(false);
  });

  it('auto-opens the lesson workspace once for the code-along runtime', () => {
    expect(
      shouldOpenLessonWorkspace({
        isCodeAlongRuntime: true,
        workspaceId: null,
        hasAttemptedWorkspace: false,
        isOpeningWorkspace: false,
      }),
    ).toBe(true);

    expect(
      shouldOpenLessonWorkspace({
        isCodeAlongRuntime: true,
        workspaceId: 'workspace-1',
        hasAttemptedWorkspace: false,
        isOpeningWorkspace: false,
      }),
    ).toBe(false);
  });

  it('keeps video and my-code as the only permanent split surfaces', () => {
    expect(codeAlongPermanentSurfaces(false)).toEqual(['video', 'my-code']);
    expect(codeAlongPermanentSurfaces(true)).toEqual(['video', 'my-code']);
  });

  it('defaults to a split ratio that favors code slightly', () => {
    expect(DEFAULT_VIDEO_SPLIT_RATIO).toBe(45);
    expect(codeAlongSplitColumns('SPLIT', DEFAULT_VIDEO_SPLIT_RATIO)).toContain('45fr');
    expect(codeAlongSplitColumns('SPLIT', DEFAULT_VIDEO_SPLIT_RATIO)).toContain('55fr');
  });

  it('clamps divider resize to sensible video/code widths', () => {
    expect(clampVideoSplitRatio(10)).toBe(30);
    expect(clampVideoSplitRatio(45)).toBe(45);
    expect(clampVideoSplitRatio(90)).toBe(60);
  });

  it('restores persisted split state safely', () => {
    expect(parseStoredVideoSplitRatio('52')).toBe(52);
    expect(parseStoredVideoSplitRatio('999')).toBe(60);
    expect(parseStoredVideoSplitRatio('not-a-number')).toBe(DEFAULT_VIDEO_SPLIT_RATIO);
    expect(parseStoredVideoLayoutMode('FOCUS_VIDEO')).toBe('FOCUS_VIDEO');
    expect(parseStoredVideoLayoutMode('FOCUS_CODE')).toBe('FOCUS_CODE');
    expect(parseStoredVideoLayoutMode('bad')).toBe('SPLIT');
  });

  it('focus modes keep both panes mounted while changing only layout columns', () => {
    expect(codeAlongSplitColumns('FOCUS_VIDEO', 45)).toContain('72fr');
    expect(codeAlongSplitColumns('FOCUS_VIDEO', 45)).toContain('28fr');
    expect(codeAlongSplitColumns('FOCUS_CODE', 45)).toContain('32fr');
    expect(codeAlongSplitColumns('FOCUS_CODE', 45)).toContain('68fr');
  });

  it('practice trigger does not open compare or instructor secondary panels automatically', () => {
    expect(practiceTriggerSecondaryPanel()).toBeNull();
  });

  it('models explicit practice checkpoint states', () => {
    expect(practiceCheckpointState({
      hasActiveStep: true,
      isChecking: false,
      isCompleted: false,
      isSkipped: false,
      hasFailure: false,
    })).toBe('WAITING_FOR_STUDENT');
    expect(practiceCheckpointState({
      hasActiveStep: true,
      isChecking: true,
      isCompleted: false,
      isSkipped: false,
      hasFailure: false,
    })).toBe('CHECKING');
    expect(practiceCheckpointState({
      hasActiveStep: true,
      isChecking: false,
      isCompleted: false,
      isSkipped: false,
      hasFailure: true,
    })).toBe('FAILED');
    expect(practiceCheckpointState({
      hasActiveStep: true,
      isChecking: false,
      isCompleted: true,
      isSkipped: false,
      hasFailure: false,
    })).toBe('COMPLETED');
    expect(practiceCheckpointState({
      hasActiveStep: true,
      isChecking: false,
      isCompleted: true,
      isSkipped: true,
      hasFailure: false,
    })).toBe('SKIPPED');
  });
});
