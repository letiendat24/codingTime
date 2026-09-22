import { describe, expect, it } from 'vitest';
import type { VideoPracticeStep, WorkspaceFile } from '../../../lib/api';
import {
  clampVideoSplitRatio,
  codeAlongSplitColumns,
  codeAlongPermanentSurfaces,
  DEFAULT_VIDEO_SPLIT_RATIO,
  findBlockingPracticeSeekStep,
  findPracticeStepCrossed,
  instructorSnapshotDoesNotOverwriteStudentCode,
  DEFAULT_WORKSPACE_CAPABILITIES,
  defaultVideoLearningMode,
  findEarliestIncompletePracticeStepAtOrBefore,
  isFolderNonEmpty,
  isCodeAlongRuntimeEnabled,
  isSafeVirtualWorkspacePath,
  normalizeCodeForPracticeCompare,
  normalizePracticeStepCompletionResponse,
  normalizeVirtualWorkspacePath,
  parseStoredVideoLayoutMode,
  parseStoredVideoLearningMode,
  parseStoredVideoSplitRatio,
  pathConflictsWithExistingFile,
  practiceCheckpointState,
  practiceReferenceSnapshotId,
  practiceTriggerSecondaryPanel,
  selectActiveInstructorSnapshot,
  shouldOpenLessonWorkspace,
  shouldPauseForPracticeStep,
  watchedPracticeSeekTarget,
  VIDEO_CODE_ALONG_GRID_CLASS_NAME,
  VIDEO_CODE_ALONG_VIDEO_PANE_CLASS_NAME,
} from './video-practice-view-model';

const steps: readonly VideoPracticeStep[] = [
  {
    id: 'step-20',
    lessonId: 'lesson-1',
    videoAssetId: 'video-1',
    timestampSeconds: 20,
    timestampMs: 20_000,
    title: 'Setup',
    instruction: 'Create state',
    required: false,
    behavior: 'GUIDED',
    verificationMode: 'NONE',
    snapshotId: 'snapshot-20',
    targetFilePath: null,
    targetStartLine: null,
    targetEndLine: null,
    verificationRules: null,
    status: 'NOT_STARTED',
    completed: false,
  },
  {
    id: 'step-40',
    lessonId: 'lesson-1',
    videoAssetId: 'video-1',
    timestampSeconds: 40,
    timestampMs: 40_000,
    title: 'Loop',
    instruction: 'Implement loop',
    required: true,
    behavior: 'REQUIRED',
    verificationMode: 'CODE_COMPARE',
    snapshotId: 'snapshot-40',
    targetFilePath: 'src/index.ts',
    targetStartLine: null,
    targetEndLine: null,
    verificationRules: null,
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
    const step = findPracticeStepCrossed(35_000, 42_000, steps, triggered);
    expect(shouldPauseForPracticeStep('PRACTICE', step)).toBe(true);

    triggered.add(step!.id);
    expect(findPracticeStepCrossed(35_000, 42_000, steps, triggered)).toBeNull();
  });

  it('follow mode never pauses for practice step crossings', () => {
    const step = findPracticeStepCrossed(35_000, 42_000, steps, new Set());
    expect(shouldPauseForPracticeStep('FOLLOW', step)).toBe(false);
  });

  it('defaults to practice only when practice steps exist and restores user preference', () => {
    expect(defaultVideoLearningMode(true)).toBe('PRACTICE');
    expect(defaultVideoLearningMode(false)).toBe('FOLLOW');
    expect(parseStoredVideoLearningMode('FOLLOW', true)).toBe('FOLLOW');
    expect(parseStoredVideoLearningMode('PRACTICE', false)).toBe('PRACTICE');
    expect(parseStoredVideoLearningMode('bad', true)).toBe('PRACTICE');
  });

  it('student code is not overwritten when instructor snapshot changes', () => {
    const files: readonly WorkspaceFile[] = [{ path: 'src/index.ts', content: 'const student = true;\n' }];
    expect(instructorSnapshotDoesNotOverwriteStudentCode(files, 'snapshot-40')).toBe(files);
  });

  it('compare normalization keeps structural text comparison lightweight', () => {
    expect(normalizeCodeForPracticeCompare('const x = 1;  \r\n')).toBe('const x = 1;');
  });

  it('seeking across multiple steps selects the earliest crossed step deterministically', () => {
    expect(findPracticeStepCrossed(10_000, 45_000, steps, new Set())?.id).toBe('step-20');
  });

  it('uses millisecond intervals so 42.7s to 43.4s triggers a 43s step', () => {
    const stepAt43: VideoPracticeStep = {
      ...steps[1]!,
      id: 'step-43',
      timestampSeconds: 43,
      timestampMs: 43_000,
    };

    expect(findPracticeStepCrossed(42_700, 43_400, [stepAt43], new Set())?.id).toBe('step-43');
  });

  it('blocks large forward seeks at the first required incomplete practice step', () => {
    expect(findPracticeStepCrossed(30_000, 60_000, steps, new Set())?.id).toBe('step-40');
  });

  it('practice required step blocks forward seek and clamps to the first incomplete required step', () => {
    expect(findBlockingPracticeSeekStep('PRACTICE', 20_000, 80_000, steps)?.id).toBe('step-40');
  });

  it('allows backward practice seek', () => {
    expect(findBlockingPracticeSeekStep('PRACTICE', 60_000, 20_000, steps)).toBeNull();
  });

  it('completed required step no longer blocks practice seek', () => {
    const completed: VideoPracticeStep = { ...steps[1]!, status: 'COMPLETED', completed: true };
    expect(findBlockingPracticeSeekStep('PRACTICE', 20_000, 80_000, [completed])).toBeNull();
  });

  it('follow mode allows unrestricted seek', () => {
    expect(findBlockingPracticeSeekStep('FOLLOW', 20_000, 80_000, steps)).toBeNull();
  });

  it('practice mode clamps forward seek to the watched boundary', () => {
    expect(watchedPracticeSeekTarget({ mode: 'PRACTICE', requestedSeconds: 80, furthestWatchedSeconds: 45 })).toBe(45);
    expect(watchedPracticeSeekTarget({ mode: 'PRACTICE', requestedSeconds: 30, furthestWatchedSeconds: 45 })).toBe(30);
    expect(watchedPracticeSeekTarget({ mode: 'FOLLOW', requestedSeconds: 80, furthestWatchedSeconds: 45 })).toBe(80);
  });

  it('finds the earliest incomplete practice step when switching from follow to practice', () => {
    expect(findEarliestIncompletePracticeStepAtOrBefore(80_000, steps)?.id).toBe('step-20');
    expect(findEarliestIncompletePracticeStepAtOrBefore(10_000, steps)).toBeNull();
    expect(findEarliestIncompletePracticeStepAtOrBefore(80_000, steps.map((step) => ({ ...step, completed: true, status: 'COMPLETED' })))?.id).toBeUndefined();
  });

  it('multiple required practice steps block seek at the earliest one', () => {
    const later: VideoPracticeStep = {
      ...steps[1]!,
      id: 'step-55',
      timestampSeconds: 55,
      timestampMs: 55_000,
    };

    expect(findBlockingPracticeSeekStep('PRACTICE', 20_000, 80_000, [later, steps[1]!])?.id).toBe('step-40');
  });

  it('does not retrigger completed or skipped practice steps', () => {
    const completed: VideoPracticeStep = { ...steps[1]!, status: 'COMPLETED', completed: true };
    const skipped: VideoPracticeStep = { ...steps[0]!, status: 'SKIPPED' };

    expect(findPracticeStepCrossed(10_000, 60_000, [completed, skipped], new Set())).toBeNull();
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
    expect(parseStoredVideoLayoutMode('CUSTOM')).toBe('CUSTOM');
    expect(parseStoredVideoLayoutMode('bad')).toBe('SPLIT');
  });

  it('focus modes keep both panes mounted while changing only layout columns', () => {
    expect(codeAlongSplitColumns('SPLIT', 58)).toContain('45fr');
    expect(codeAlongSplitColumns('CUSTOM', 58)).toContain('58fr');
    expect(codeAlongSplitColumns('FOCUS_VIDEO', 45)).toContain('72fr');
    expect(codeAlongSplitColumns('FOCUS_VIDEO', 45)).toContain('28fr');
    expect(codeAlongSplitColumns('FOCUS_CODE', 45)).toContain('32fr');
    expect(codeAlongSplitColumns('FOCUS_CODE', 45)).toContain('68fr');
  });

  it('practice trigger does not open compare or instructor secondary panels automatically', () => {
    expect(practiceTriggerSecondaryPanel()).toBeNull();
  });

  it('uses the configured practice snapshot instead of the generic playback snapshot', () => {
    const activeStep: VideoPracticeStep = {
      ...steps[1]!,
      snapshotId: 'snapshot-practice-43',
      timestampSeconds: 43,
      timestampMs: 43_000,
    };

    expect(practiceReferenceSnapshotId(activeStep, 'snapshot-playback-25')).toBe('snapshot-practice-43');
    expect(practiceReferenceSnapshotId(null, 'snapshot-playback-25')).toBe('snapshot-playback-25');
  });

  it('keeps video top-aligned and prevents the video pane from stretching black filler to editor height', () => {
    expect(VIDEO_CODE_ALONG_GRID_CLASS_NAME).toContain('xl:items-start');
    expect(VIDEO_CODE_ALONG_VIDEO_PANE_CLASS_NAME).toContain('self-start');
    expect(VIDEO_CODE_ALONG_VIDEO_PANE_CLASS_NAME).toContain('bg-card');
    expect(VIDEO_CODE_ALONG_VIDEO_PANE_CLASS_NAME).not.toContain('h-full');
    expect(VIDEO_CODE_ALONG_VIDEO_PANE_CLASS_NAME).not.toContain('bg-black');
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

  it('keeps workspace capabilities explicit for the student toolbar', () => {
    expect(DEFAULT_WORKSPACE_CAPABILITIES.allowRun).toBe(true);
    expect(DEFAULT_WORKSPACE_CAPABILITIES.allowJudge).toBe(true);
    expect(DEFAULT_WORKSPACE_CAPABILITIES.allowCreateFiles).toBe(false);
  });

  it('validates virtual workspace paths for file explorer mutations', () => {
    const files: readonly WorkspaceFile[] = [{ path: 'src/App.tsx', content: '' }];

    expect(normalizeVirtualWorkspacePath('/src//components/UserCard.tsx')).toBe('src/components/UserCard.tsx');
    expect(isSafeVirtualWorkspacePath('src/components/UserCard.tsx')).toBe(true);
    expect(isSafeVirtualWorkspacePath('../secret')).toBe(false);
    expect(isSafeVirtualWorkspacePath('/absolute')).toBe(false);
    expect(isSafeVirtualWorkspacePath('src\\App.tsx')).toBe(false);
    expect(pathConflictsWithExistingFile('src/App.tsx', files)).toBe(true);
    expect(isFolderNonEmpty('src', files)).toBe(true);
  });

  it('normalizes direct and enveloped practice completion responses', () => {
    const direct = {
      id: 'step-40',
      status: 'COMPLETED',
      completedAt: '2026-01-01T00:00:00.000Z',
      passed: true,
      message: 'Practice step completed',
      lessonCompleted: false,
      verification: {
        status: 'PASSED',
        verificationMode: 'FILE_COMPARE',
        details: ['ok'],
      },
    } as const;

    expect(normalizePracticeStepCompletionResponse(direct).verification.status).toBe('PASSED');
    expect(normalizePracticeStepCompletionResponse({ practiceProgress: direct }).id).toBe('step-40');
  });

  it('turns malformed practice completion responses into a safe unavailable state', () => {
    const result = normalizePracticeStepCompletionResponse({ practiceProgress: { id: 'step-40' } });
    expect(result.passed).toBe(false);
    expect(result.verification.status).toBe('UNAVAILABLE');
  });
});
