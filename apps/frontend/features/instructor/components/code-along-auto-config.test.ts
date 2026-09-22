import { describe, expect, it } from 'vitest';
import {
  resolvePracticeStrategy,
  supportsJudge,
  supportsRun,
  type PracticeCapabilities,
} from './code-along-auto-config';

const baseFiles = [{ path: 'src/index.ts', content: 'export function validateUser() { return true; }\n' }];

describe('code-along auto configuration resolver', () => {
  it('keeps empty student task as an actionable milestone checkpoint', () => {
    const strategy = resolvePracticeStrategy({
      studentTask: '',
      files: baseFiles,
      language: 'typescript',
      entryFile: 'src/index.ts',
      activeFilePath: 'src/index.ts',
    });

    expect(strategy.practiceEnabled).toBe(true);
    expect(strategy.verificationMode).toBe('AI_SEMANTIC');
  });

  it('automatically enables required practice when student task exists', () => {
    const strategy = resolvePracticeStrategy({
      studentTask: 'Create the validator',
      files: baseFiles,
      language: 'typescript',
      entryFile: 'src/index.ts',
      activeFilePath: 'src/index.ts',
    });

    expect(strategy.practiceEnabled).toBe(true);
    expect(strategy.behavior).toBe('REQUIRED');
  });

  it('allows skip through manual override guided behavior', () => {
    const capabilities: PracticeCapabilities = {
      allowRun: true,
      allowCheck: true,
      allowJudge: false,
      allowCreateFiles: false,
      allowCreateFolders: false,
      allowRenameFiles: false,
      allowDeleteFiles: false,
    };
    const strategy = resolvePracticeStrategy({
      studentTask: 'Try this optionally',
      files: baseFiles,
      language: 'typescript',
      entryFile: 'src/index.ts',
      activeFilePath: 'src/index.ts',
      manualOverride: {
        behavior: 'GUIDED',
        verificationMode: 'FILE_COMPARE',
        workspaceType: 'SINGLE_FILE',
        capabilities,
      },
    });

    expect(strategy.source).toBe('MANUAL_OVERRIDE');
    expect(strategy.behavior).toBe('GUIDED');
  });

  it('uses tests when valid tests and supported judge runtime exist', () => {
    const strategy = resolvePracticeStrategy({
      studentTask: 'Implement add',
      files: [{ path: 'src/index.js', content: 'export function add(a, b) { return a + b; }\n' }],
      language: 'javascript',
      entryFile: 'src/index.js',
      activeFilePath: 'src/index.js',
      hasValidTests: true,
      judgeSupported: true,
    });

    expect(strategy.verificationMode).toBe('TESTS');
    expect(strategy.capabilities.allowRun).toBe(true);
    expect(strategy.capabilities.allowJudge).toBe(true);
  });

  it('uses AI semantic checks for supported single-file source', () => {
    const strategy = resolvePracticeStrategy({
      studentTask: 'Create the validator',
      files: baseFiles,
      language: 'typescript',
      entryFile: 'src/index.ts',
      activeFilePath: 'src/index.ts',
    });

    expect(strategy.verificationMode).toBe('AI_SEMANTIC');
    expect(strategy.capabilities.allowCheck).toBe(true);
  });

  it('falls back to AI semantic when structural generation is unavailable', () => {
    const strategy = resolvePracticeStrategy({
      studentTask: 'Match this content',
      files: [{ path: 'README.md', content: '# Notes\n' }],
      language: 'markdown',
      entryFile: 'README.md',
      activeFilePath: 'README.md',
      structuralSupported: false,
    });

    expect(strategy.verificationMode).toBe('AI_SEMANTIC');
  });

  it('uses workspace structure for multi-file project snapshots', () => {
    const strategy = resolvePracticeStrategy({
      studentTask: 'Create UserCard',
      files: [
        { path: 'src/App.tsx', content: 'export function App() { return null; }\n' },
        { path: 'src/components/UserCard.tsx', content: 'export function UserCard() { return null; }\n' },
        { path: 'node_modules/ignored/index.js', content: '' },
      ],
      language: 'typescript',
      entryFile: 'src/App.tsx',
      activeFilePath: 'src/components/UserCard.tsx',
    });

    expect(strategy.workspaceType).toBe('MULTI_FILE');
    expect(strategy.verificationMode).toBe('AI_SEMANTIC');
    expect(strategy.targetFiles).toEqual(['src/App.tsx', 'src/components/UserCard.tsx']);
    expect(strategy.capabilities.allowCreateFiles).toBe(true);
    expect(strategy.capabilities.allowDeleteFiles).toBe(true);
  });

  it('uses manual completion when no validator is available', () => {
    const strategy = resolvePracticeStrategy({
      studentTask: 'Do a local setup step',
      files: [],
      language: 'text',
      entryFile: 'README.md',
      activeFilePath: 'README.md',
    });

    expect(strategy.verificationMode).toBe('NONE');
    expect(strategy.summary).toContain('confirm completion');
  });

  it('does not infer tests from file count alone', () => {
    const strategy = resolvePracticeStrategy({
      studentTask: 'Implement the function',
      files: [{ path: 'src/index.js', content: 'export function add() {}\n' }],
      language: 'javascript',
      entryFile: 'src/index.js',
      activeFilePath: 'src/index.js',
      hasValidTests: false,
      judgeSupported: true,
    });

    expect(strategy.verificationMode).not.toBe('TESTS');
  });

  it('infers run and judge independently', () => {
    expect(supportsRun('typescript', 'SINGLE_FILE')).toBe(true);
    expect(supportsRun('typescript', 'MULTI_FILE')).toBe(false);
    expect(supportsJudge('typescript', true, true)).toBe(true);
    expect(supportsJudge('typescript', false, true)).toBe(false);
  });

  it('reset to auto recomputes from current context after manual override is removed', () => {
    const manual = resolvePracticeStrategy({
      studentTask: 'Create the validator',
      files: baseFiles,
      language: 'typescript',
      entryFile: 'src/index.ts',
      activeFilePath: 'src/index.ts',
      manualOverride: {
        behavior: 'GUIDED',
        verificationMode: 'NONE',
        workspaceType: 'SINGLE_FILE',
        capabilities: {
          allowRun: false,
          allowCheck: true,
          allowJudge: false,
          allowCreateFiles: false,
          allowCreateFolders: false,
          allowRenameFiles: false,
          allowDeleteFiles: false,
        },
      },
    });
    const auto = resolvePracticeStrategy({
      studentTask: 'Create the validator',
      files: baseFiles,
      language: 'typescript',
      entryFile: 'src/index.ts',
      activeFilePath: 'src/index.ts',
    });

    expect(manual.source).toBe('MANUAL_OVERRIDE');
    expect(auto.source).toBe('AUTO');
    expect(auto.verificationMode).toBe('AI_SEMANTIC');
  });
});
