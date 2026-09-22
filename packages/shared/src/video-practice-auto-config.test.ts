import { describe, expect, it } from 'vitest';
import {
  findAutoReferenceSnapshot,
  isProjectWorkspace,
  requiredSnapshotFiles,
  resolveEffectivePracticeConfig,
  resolveLessonWorkspaceConfig,
  resolveVideoPracticeAutoConfig,
  supportsJudge,
  supportsRun,
  validatePracticeConfigConsistency,
} from './video-practice-auto-config';

describe('resolveVideoPracticeAutoConfig (Shared Domain Resolver)', () => {
  it('resolves empty task to an actionable milestone practice checkpoint', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: '   ',
      files: [{ path: 'index.ts', content: 'export function solve() {}' }],
      language: 'typescript',
      entryFile: 'index.ts',
    });

    expect(strategy.practiceEnabled).toBe(true);
    expect(strategy.behavior).toBe('REQUIRED');
    expect(strategy.verificationMode).toBe('AI_SEMANTIC');
    expect(strategy.capabilities.allowCheck).toBe(true);
    expect(strategy.capabilities.allowJudge).toBe(false);
    expect(strategy.summary).toContain('AI semantic');
  });

  it('resolves non-empty task to required practice by default', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: 'Implement solve function',
      files: [{ path: 'index.ts', content: 'export function solve() {}' }],
      language: 'typescript',
      entryFile: 'index.ts',
    });

    expect(strategy.practiceEnabled).toBe(true);
    expect(strategy.behavior).toBe('REQUIRED');
  });

  it('resolves allowSkip to GUIDED behavior', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: 'Implement solve function',
      files: [{ path: 'index.ts', content: 'export function solve() {}' }],
      language: 'typescript',
      entryFile: 'index.ts',
      allowSkip: true,
    });

    expect(strategy.practiceEnabled).toBe(true);
    expect(strategy.behavior).toBe('GUIDED');
  });

  it('prioritizes TESTS when valid tests and supported judge runtime are available', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: 'Implement algorithm and pass test suite',
      files: [
        { path: 'src/solution.ts', content: 'export function run() {}' },
        { path: 'src/helper.ts', content: 'export function helper() {}' },
      ],
      language: 'typescript',
      entryFile: 'src/solution.ts',
      hasValidTests: true,
      judgeSupported: true,
    });

    expect(strategy.verificationMode).toBe('TESTS');
    expect(strategy.capabilities.allowJudge).toBe(true);
    expect(strategy.capabilities.allowRun).toBe(true);
    expect(strategy.summary).toContain('Configured tests');
  });

  it('resolves multi-file project workspace to AI_SEMANTIC when tests are absent', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: 'Set up project files and structure',
      files: [
        { path: 'src/index.ts', content: 'console.log("main");' },
        { path: 'src/utils.ts', content: 'console.log("utils");' },
      ],
      language: 'typescript',
      entryFile: 'src/index.ts',
      hasValidTests: false,
    });

    expect(strategy.workspaceType).toBe('MULTI_FILE');
    expect(strategy.verificationMode).toBe('AI_SEMANTIC');
    expect(strategy.capabilities.allowCreateFiles).toBe(true);
    expect(strategy.capabilities.allowCreateFolders).toBe(true);
    expect(strategy.capabilities.allowRenameFiles).toBe(true);
    expect(strategy.capabilities.allowDeleteFiles).toBe(true);
    expect(strategy.generatedRules).toHaveLength(0);
  });

  it('resolves single-file with structural symbols to AI_SEMANTIC by default', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: 'Implement Calculator class and add method',
      files: [
        {
          path: 'calculator.ts',
          content: 'export class Calculator {}\nexport function calculate() {}',
        },
      ],
      language: 'typescript',
      entryFile: 'calculator.ts',
      hasValidTests: false,
    });

    expect(strategy.workspaceType).toBe('SINGLE_FILE');
    expect(strategy.verificationMode).toBe('AI_SEMANTIC');
    expect(strategy.generatedRules).toHaveLength(0);
  });

  it('falls back to AI_SEMANTIC for single file without structural symbols', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: 'Update configuration values',
      files: [{ path: 'config.json', content: '{"port": 3000}' }],
      language: 'json',
      entryFile: 'config.json',
      hasValidTests: false,
      structuralSupported: false,
    });

    expect(strategy.verificationMode).toBe('AI_SEMANTIC');
    expect(strategy.summary).toContain('AI semantic');
  });

  it('resolves to NONE when no target files are available', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: 'Read and reflect on concepts',
      files: [],
      language: 'typescript',
      entryFile: 'index.ts',
      hasValidTests: false,
    });

    expect(strategy.verificationMode).toBe('NONE');
    expect(strategy.summary).toContain('Students will confirm completion manually');
  });

  it('does not determine mode by file count alone', () => {
    // Single file with valid tests becomes TESTS, not STRUCTURAL or FILE_COMPARE
    const singleFileWithTests = resolveVideoPracticeAutoConfig({
      studentTask: 'Solve two sum',
      files: [{ path: 'solution.ts', content: 'export function twoSum() {}' }],
      language: 'typescript',
      entryFile: 'solution.ts',
      hasValidTests: true,
      judgeSupported: true,
    });
    expect(singleFileWithTests.verificationMode).toBe('TESTS');

    // Single file with nested path is MULTI_FILE (project workspace)
    const singleNestedFile = resolveVideoPracticeAutoConfig({
      studentTask: 'Set up app entrypoint',
      files: [{ path: 'src/components/App.tsx', content: 'export const App = () => null;' }],
      language: 'typescript',
      entryFile: 'index.ts',
      hasValidTests: false,
    });
    expect(singleNestedFile.workspaceType).toBe('MULTI_FILE');
    expect(singleNestedFile.verificationMode).toBe('AI_SEMANTIC');
  });

  it('correctly derives run capability based on language support and workspace type', () => {
    expect(supportsRun('typescript', 'SINGLE_FILE')).toBe(true);
    expect(supportsRun('javascript', 'SINGLE_FILE')).toBe(true);
    expect(supportsRun('python', 'SINGLE_FILE')).toBe(false);
    expect(supportsRun('typescript', 'MULTI_FILE')).toBe(false);
  });

  it('correctly derives judge capability based on valid tests and judge support', () => {
    expect(supportsJudge('typescript', true, true)).toBe(true);
    expect(supportsJudge('typescript', false, true)).toBe(false);
    expect(supportsJudge('typescript', true, false)).toBe(false);
    expect(supportsJudge('python', true, true)).toBe(false);
  });

  it('preserves MANUAL_OVERRIDE configuration without silent automatic overwrite', () => {
    const strategy = resolveVideoPracticeAutoConfig({
      studentTask: 'Custom task with manual override',
      files: [{ path: 'index.ts', content: 'export function test() {}' }],
      language: 'typescript',
      entryFile: 'index.ts',
      manualOverride: {
        behavior: 'GUIDED',
        verificationMode: 'FILE_COMPARE',
        workspaceType: 'SINGLE_FILE',
        capabilities: {
          allowRun: true,
          allowCheck: true,
          allowJudge: false,
          allowCreateFiles: true,
          allowCreateFolders: false,
          allowRenameFiles: false,
          allowDeleteFiles: false,
        },
      },
    });

    expect(strategy.source).toBe('MANUAL_OVERRIDE');
    expect(strategy.behavior).toBe('GUIDED');
    expect(strategy.verificationMode).toBe('FILE_COMPARE');
    expect(strategy.capabilities.allowCreateFiles).toBe(true);
    expect(strategy.summary).toContain('Manual override');
    expect(strategy.reason).toContain('Instructor selected manual override');
  });

  it('filters vendor/generated files from required snapshot files', () => {
    const files = [
      { path: 'src/index.ts', content: '' },
      { path: 'node_modules/pkg/index.js', content: '' },
      { path: 'dist/bundle.js', content: '' },
      { path: '.next/server.js', content: '' },
      { path: 'coverage/lcov.info', content: '' },
    ];

    expect(requiredSnapshotFiles(files)).toEqual(['src/index.ts']);
    expect(isProjectWorkspace(files, 'src/index.ts')).toBe(false);
  });
});

describe('resolveLessonWorkspaceConfig (Whole-Lesson Workspace Resolver)', () => {
  it('resolves single-file step alone to SINGLE_FILE lesson workspace', () => {
    const resolution = resolveLessonWorkspaceConfig({
      language: 'javascript',
      entryFile: 'index.js',
      practiceSteps: [{ practiceEnabled: true, verificationMode: 'STRUCTURAL', targetFiles: ['index.js'] }],
      snapshots: [{ files: [{ path: 'index.js', content: 'export function add() {}' }] }],
    });

    expect(resolution.workspaceType).toBe('SINGLE_FILE');
    expect(resolution.capabilities.allowCreateFiles).toBe(false);
    expect(resolution.capabilities.allowRun).toBe(true);
  });

  it('resolves multi-file step alone to MULTI_FILE lesson workspace', () => {
    const resolution = resolveLessonWorkspaceConfig({
      language: 'javascript',
      entryFile: 'index.js',
      practiceSteps: [{ practiceEnabled: true, verificationMode: 'WORKSPACE_STRUCTURE', targetFiles: ['index.js', 'utils.js'] }],
      snapshots: [{ files: [{ path: 'index.js', content: '' }, { path: 'utils.js', content: '' }] }],
    });

    expect(resolution.workspaceType).toBe('MULTI_FILE');
    expect(resolution.capabilities.allowCreateFiles).toBe(true);
    expect(resolution.capabilities.allowCreateFolders).toBe(true);
    expect(resolution.capabilities.allowRenameFiles).toBe(true);
    expect(resolution.capabilities.allowDeleteFiles).toBe(true);
  });

  it('aggregates single-file + multi-file steps to MULTI_FILE without downgrading', () => {
    const resolution = resolveLessonWorkspaceConfig({
      language: 'typescript',
      entryFile: 'src/index.ts',
      practiceSteps: [
        { practiceEnabled: true, verificationMode: 'STRUCTURAL', targetFiles: ['src/index.ts'] },
        { practiceEnabled: true, verificationMode: 'WORKSPACE_STRUCTURE', targetFiles: ['src/index.ts', 'src/types.ts'] },
      ],
      snapshots: [
        { files: [{ path: 'src/index.ts', content: '' }] },
        { files: [{ path: 'src/index.ts', content: '' }, { path: 'src/types.ts', content: '' }] },
      ],
    });

    expect(resolution.workspaceType).toBe('MULTI_FILE');
    expect(resolution.capabilities.allowCreateFiles).toBe(true);
  });

  it('downgrades to SINGLE_FILE when all remaining steps and snapshots are single-file', () => {
    const resolution = resolveLessonWorkspaceConfig({
      language: 'typescript',
      entryFile: 'src/index.ts',
      practiceSteps: [
        { practiceEnabled: true, verificationMode: 'STRUCTURAL', targetFiles: ['src/index.ts'] },
      ],
      snapshots: [
        { files: [{ path: 'src/index.ts', content: '' }] },
      ],
    });

    expect(resolution.workspaceType).toBe('SINGLE_FILE');
    expect(resolution.capabilities.allowCreateFiles).toBe(false);
  });

  it('preserves manual lesson override without silent overwriting', () => {
    const resolution = resolveLessonWorkspaceConfig({
      language: 'javascript',
      entryFile: 'index.js',
      manualOverride: {
        workspaceType: 'MULTI_FILE',
        capabilities: {
          allowCreateFiles: true,
          allowDeleteFiles: false,
        },
      },
      practiceSteps: [{ practiceEnabled: true, verificationMode: 'NONE', targetFiles: ['index.js'] }],
      snapshots: [{ files: [{ path: 'index.js', content: '' }] }],
    });

    expect(resolution.workspaceType).toBe('MULTI_FILE');
    expect(resolution.capabilities.allowCreateFiles).toBe(true);
    expect(resolution.capabilities.allowDeleteFiles).toBe(false);
  });
});

describe('findAutoReferenceSnapshot (Auto Reference Snapshot Selection)', () => {
  const s1 = { id: 's1', timestampSeconds: 30, files: [{ path: 'index.ts', content: 'const a = 1;' }] };
  const s2 = { id: 's2', timestampSeconds: 60, files: [{ path: 'index.ts', content: 'const b = 2;' }] };
  const s3 = { id: 's3', timestampSeconds: 90, files: [{ path: 'index.ts', content: 'const c = 3;' }] };

  it('selects explicit override snapshot if specified', () => {
    const selected = findAutoReferenceSnapshot({ practiceSnapshotId: 's3', timestampSeconds: 30 }, [s1, s2, s3]);
    expect(selected?.id).toBe('s3');
  });

  it('selects exact timestamp match when no override is given', () => {
    const selected = findAutoReferenceSnapshot({ timestampSeconds: 60 }, [s1, s2, s3]);
    expect(selected?.id).toBe('s2');
  });

  it('returns null when timestamp has no matching snapshot and no override is given', () => {
    const selected = findAutoReferenceSnapshot({ timestampSeconds: 75 }, [s1, s2, s3]);
    expect(selected).toBeNull();
  });

  it('returns null when exact timestamp reference is ambiguous', () => {
    const duplicate = { id: 's4', timestampSeconds: 60, files: [{ path: 'index.ts', content: 'const d = 4;' }] };
    const selected = findAutoReferenceSnapshot({ timestampSeconds: 60 }, [s1, s2, duplicate, s3]);
    expect(selected).toBeNull();
  });

  it('returns null if snapshot list is empty', () => {
    const selected = findAutoReferenceSnapshot({ timestampSeconds: 45 }, []);
    expect(selected).toBeNull();
  });
});

describe('resolveEffectivePracticeConfig (Effective Practice Resolution & Inheritance)', () => {
  const milestoneSnapshot = {
    id: 'snap-1',
    timestampSeconds: 45,
    files: [{ path: 'src/index.ts', content: 'export function calculateTotal() { return 100; }' }],
  };

  it('milestone with no override inherits lesson verification and behavior', () => {
    const effective = resolveEffectivePracticeConfig({
      lessonDefaults: {
        defaultPracticeBehavior: 'REQUIRED',
        defaultVerificationStrategy: 'STRUCTURAL',
        language: 'typescript',
        entryFile: 'src/index.ts',
      },
      checkpointContext: {
        timestampSeconds: 45,
        studentTask: 'Implement calculateTotal',
      },
      milestoneSnapshot,
      allSnapshots: [milestoneSnapshot],
    });

    expect(effective.practiceEnabled).toBe(true);
    expect(effective.behavior).toBe('REQUIRED');
    expect(effective.verificationMode).toBe('STRUCTURAL');
    expect(effective.practiceSnapshotId).toBe('snap-1');
  });

  it('milestone behavior inherits lesson default GUIDED', () => {
    const effective = resolveEffectivePracticeConfig({
      lessonDefaults: {
        defaultPracticeBehavior: 'GUIDED',
        defaultVerificationStrategy: 'AUTO',
        language: 'typescript',
      },
      checkpointContext: {
        timestampSeconds: 45,
        studentTask: 'Follow instructor code',
      },
      milestoneSnapshot,
    });

    expect(effective.behavior).toBe('GUIDED');
  });

  it('override verification only changes that milestone', () => {
    const effective = resolveEffectivePracticeConfig({
      lessonDefaults: {
        defaultVerificationStrategy: 'FILE_COMPARE',
      },
      checkpointOverride: {
        verificationMode: 'NONE',
      },
      checkpointContext: {
        timestampSeconds: 45,
        studentTask: 'Review code',
      },
      milestoneSnapshot,
    });

    expect(effective.verificationMode).toBe('NONE');
    expect(effective.practiceSnapshotId).toBeNull();
    expect(effective.targetFilePath).toBeNull();
  });

  it('override behavior only changes that milestone', () => {
    const effective = resolveEffectivePracticeConfig({
      lessonDefaults: {
        defaultPracticeBehavior: 'REQUIRED',
      },
      checkpointOverride: {
        behavior: 'GUIDED',
      },
      checkpointContext: {
        timestampSeconds: 45,
        studentTask: 'Optional practice step',
      },
      milestoneSnapshot,
    });

    expect(effective.behavior).toBe('GUIDED');
  });

  it('milestone snapshot automatically becomes reference for practice step', () => {
    const effective = resolveEffectivePracticeConfig({
      lessonDefaults: {
        defaultVerificationStrategy: 'AUTO',
        language: 'typescript',
      },
      checkpointContext: {
        timestampSeconds: 45,
        studentTask: 'Write model',
      },
      milestoneSnapshot,
      allSnapshots: [milestoneSnapshot],
    });

    expect(effective.practiceSnapshotId).toBe('snap-1');
    expect(effective.verificationMode).toBe('AI_SEMANTIC');
  });

  it('empty task still resolves to an active milestone practice checkpoint', () => {
    const effective = resolveEffectivePracticeConfig({
      checkpointContext: {
        timestampSeconds: 45,
        studentTask: '',
      },
    });

    expect(effective.practiceEnabled).toBe(true);
    expect(effective.verificationMode).toBe('NONE');
  });
});

describe('validatePracticeConfigConsistency (Save-Time Consistency Validation)', () => {
  it('allows NONE without snapshot or target files', () => {
    const res = validatePracticeConfigConsistency({
      practiceEnabled: true,
      verificationMode: 'NONE',
    });
    expect(res.valid).toBe(true);
  });

  it('fails FILE_COMPARE if no snapshot is available', () => {
    const res = validatePracticeConfigConsistency({
      practiceEnabled: true,
      verificationMode: 'FILE_COMPARE',
      practiceSnapshotId: null,
      hasSnapshot: false,
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('reference code snapshot');
  });

  it('fails TESTS if hasValidTests is false', () => {
    const res = validatePracticeConfigConsistency({
      practiceEnabled: true,
      verificationMode: 'TESTS',
      hasValidTests: false,
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('test cases');
  });
});
