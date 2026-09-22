export type CodeAlongConfigSource = 'AUTO' | 'MANUAL_OVERRIDE';
export type CodeAlongWorkspaceType = 'SINGLE_FILE' | 'MULTI_FILE';
export type VideoPracticeBehavior = 'GUIDED' | 'REQUIRED';
export type VideoPracticeVerificationMode = 'NONE' | 'AI_SEMANTIC' | 'CODE_COMPARE' | 'FILE_COMPARE' | 'STRUCTURAL' | 'WORKSPACE_STRUCTURE' | 'TESTS';

export interface InstructorWorkspaceFile {
  readonly path: string;
  readonly content: string;
}

export interface PracticeCapabilities {
  readonly allowRun: boolean;
  readonly allowCheck: boolean;
  readonly allowJudge: boolean;
  readonly allowCreateFiles: boolean;
  readonly allowCreateFolders: boolean;
  readonly allowRenameFiles: boolean;
  readonly allowDeleteFiles: boolean;
}

export interface GeneratedPracticeRule {
  readonly type: string;
  readonly path?: string | undefined;
  readonly value?: string | undefined;
  readonly field?: string | undefined;
}

export interface ManualPracticeOverride {
  readonly behavior?: VideoPracticeBehavior | undefined;
  readonly verificationMode?: VideoPracticeVerificationMode | undefined;
  readonly workspaceType?: CodeAlongWorkspaceType | undefined;
  readonly capabilities?: Partial<PracticeCapabilities> | undefined;
}

export interface PracticeAutoContext {
  readonly studentTask: string;
  readonly files: readonly InstructorWorkspaceFile[];
  readonly language: string;
  readonly entryFile: string;
  readonly activeFilePath?: string | undefined;
  readonly hasValidTests?: boolean | undefined;
  readonly judgeSupported?: boolean | undefined;
  readonly structuralSupported?: boolean | undefined;
  readonly manualOverride?: ManualPracticeOverride | null | undefined;
  readonly allowSkip?: boolean | undefined;
}

export interface PracticeAutoStrategy {
  readonly source: CodeAlongConfigSource;
  readonly practiceEnabled: boolean;
  readonly behavior: VideoPracticeBehavior;
  readonly verificationMode: VideoPracticeVerificationMode;
  readonly workspaceType: CodeAlongWorkspaceType;
  readonly capabilities: PracticeCapabilities;
  readonly targetFiles: readonly string[];
  readonly generatedRules: readonly GeneratedPracticeRule[];
  readonly summary: string;
  readonly reason: string;
}

const GENERATED_PATH_PARTS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  'cache',
  'tmp',
  'temp',
]);

const SUPPORTED_RUN_LANGUAGES = new Set(['javascript', 'typescript']);
const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

export function isGeneratedOrVendorPath(path: string): boolean {
  return path.split('/').some((part) => GENERATED_PATH_PARTS.has(part));
}

export function requiredSnapshotFiles(files: readonly InstructorWorkspaceFile[]): readonly string[] {
  return files
    .map((file) => file.path.trim())
    .filter((path) => path.length > 0 && !isGeneratedOrVendorPath(path));
}

export function supportsRun(language: string, workspaceType: CodeAlongWorkspaceType): boolean {
  return workspaceType === 'SINGLE_FILE' && SUPPORTED_RUN_LANGUAGES.has(language.toLowerCase());
}

export function supportsJudge(language: string, hasValidTests: boolean, judgeSupported: boolean): boolean {
  return hasValidTests && judgeSupported && SUPPORTED_RUN_LANGUAGES.has(language.toLowerCase());
}

export function isProjectWorkspace(files: readonly InstructorWorkspaceFile[], entryFile: string): boolean {
  const paths = requiredSnapshotFiles(files);
  return paths.length > 1 || (paths.some((path) => path.includes('/')) && !paths.every((path) => path === entryFile));
}

function symbolRulesForFile(file: InstructorWorkspaceFile): readonly GeneratedPracticeRule[] {
  if (!SOURCE_FILE_RE.test(file.path)) {
    return [];
  }

  const rules: GeneratedPracticeRule[] = [{ type: 'FILE_EXISTS', path: file.path }];
  const exportMatches = [...file.content.matchAll(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/g)];

  for (const match of exportMatches.slice(0, 4)) {
    if (match[1]) {
      rules.push({ type: 'EXPORT_EXISTS', path: file.path, value: match[1] });
    }
  }

  const functionMatches = [...file.content.matchAll(/function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)];

  for (const match of functionMatches.slice(0, 4)) {
    const value = match[1] ?? match[2];
    if (value && !rules.some((rule) => rule.type === 'EXPORT_EXISTS' && rule.value === value)) {
      rules.push({ type: 'FUNCTION_EXISTS', path: file.path, value });
    }
  }

  return rules;
}

export function deriveStructuralRules(files: readonly InstructorWorkspaceFile[], targetFilePath?: string): readonly GeneratedPracticeRule[] {
  const target = (targetFilePath ? files.find((file) => file.path === targetFilePath) : undefined)
    ?? files.find((file) => SOURCE_FILE_RE.test(file.path));
  return target ? symbolRulesForFile(target) : [];
}

export function resolveVideoPracticeAutoConfig(context: PracticeAutoContext): PracticeAutoStrategy {
  const targetFiles = requiredSnapshotFiles(context.files);
  const activeFilePath = context.activeFilePath ?? context.entryFile;
  const workspaceType: CodeAlongWorkspaceType = isProjectWorkspace(context.files, context.entryFile) ? 'MULTI_FILE' : 'SINGLE_FILE';
  const defaultBehavior: VideoPracticeBehavior = context.allowSkip ? 'GUIDED' : 'REQUIRED';

  const projectCapabilities: PracticeCapabilities = {
    allowRun: supportsRun(context.language, workspaceType),
    allowCheck: true,
    allowJudge: false,
    allowCreateFiles: workspaceType === 'MULTI_FILE',
    allowCreateFolders: workspaceType === 'MULTI_FILE',
    allowRenameFiles: workspaceType === 'MULTI_FILE',
    allowDeleteFiles: workspaceType === 'MULTI_FILE',
  };

  if (context.manualOverride) {
    const override = context.manualOverride;
    const manualWorkspaceType = override.workspaceType ?? workspaceType;
    const manualCapabilities: PracticeCapabilities = {
      allowRun: override.capabilities?.allowRun ?? supportsRun(context.language, manualWorkspaceType),
      allowCheck: override.capabilities?.allowCheck ?? true,
      allowJudge: override.capabilities?.allowJudge ?? false,
      allowCreateFiles: override.capabilities?.allowCreateFiles ?? (manualWorkspaceType === 'MULTI_FILE'),
      allowCreateFolders: override.capabilities?.allowCreateFolders ?? (manualWorkspaceType === 'MULTI_FILE'),
      allowRenameFiles: override.capabilities?.allowRenameFiles ?? (manualWorkspaceType === 'MULTI_FILE'),
      allowDeleteFiles: override.capabilities?.allowDeleteFiles ?? (manualWorkspaceType === 'MULTI_FILE'),
    };

    return {
      source: 'MANUAL_OVERRIDE',
      practiceEnabled: true,
      behavior: override.behavior ?? defaultBehavior,
      verificationMode: override.verificationMode ?? 'NONE',
      workspaceType: manualWorkspaceType,
      capabilities: manualCapabilities,
      targetFiles,
      generatedRules: deriveStructuralRules(context.files, activeFilePath),
      summary: 'Manual override is active. Instructor settings will be preserved.',
      reason: 'Instructor selected manual override.',
    };
  }

  const judgeAvailable = supportsJudge(context.language, Boolean(context.hasValidTests), Boolean(context.judgeSupported));
  if (judgeAvailable) {
    return {
      source: 'AUTO',
      practiceEnabled: true,
      behavior: defaultBehavior,
      verificationMode: 'TESTS',
      workspaceType,
      capabilities: { ...projectCapabilities, allowRun: true, allowJudge: true },
      targetFiles,
      generatedRules: [],
      summary: 'Configured tests will validate the student solution.',
      reason: 'Valid tests and supported judge runtime are available.',
    };
  }

  if (targetFiles.length > 0) {
    return {
      source: 'AUTO',
      practiceEnabled: true,
      behavior: defaultBehavior,
      verificationMode: 'AI_SEMANTIC',
      workspaceType,
      capabilities: projectCapabilities,
      targetFiles,
      generatedRules: [],
      summary: 'AI semantic feedback will check whether the student implemented this milestone.',
      reason: 'A reference milestone snapshot is available and no explicit tests override it.',
    };
  }

  return {
    source: 'AUTO',
    practiceEnabled: true,
    behavior: defaultBehavior,
    verificationMode: 'NONE',
    workspaceType,
    capabilities: { ...projectCapabilities, allowCheck: true, allowJudge: false },
    targetFiles,
    generatedRules: [],
    summary: 'No automatic validator is available. Students will confirm completion manually.',
    reason: 'No tests, structural rules, or usable reference files are available.',
  };
}

export interface LessonWorkspaceStepRequirement {
  readonly practiceEnabled?: boolean | undefined;
  readonly verificationMode?: VideoPracticeVerificationMode | undefined;
  readonly targetFiles?: readonly string[] | undefined;
}

export interface LessonWorkspaceSnapshotRequirement {
  readonly files: readonly InstructorWorkspaceFile[];
}

export interface PracticeCapabilitiesOverride {
  readonly allowRun?: boolean | undefined;
  readonly allowCheck?: boolean | undefined;
  readonly allowJudge?: boolean | undefined;
  readonly allowCreateFiles?: boolean | undefined;
  readonly allowCreateFolders?: boolean | undefined;
  readonly allowRenameFiles?: boolean | undefined;
  readonly allowDeleteFiles?: boolean | undefined;
}

export interface LessonWorkspaceContext {
  readonly language: string;
  readonly entryFile?: string | null | undefined;
  readonly manualOverride?: {
    readonly workspaceType?: CodeAlongWorkspaceType | undefined;
    readonly capabilities?: PracticeCapabilitiesOverride | undefined;
  } | null | undefined;
  readonly practiceSteps?: readonly LessonWorkspaceStepRequirement[] | undefined;
  readonly snapshots?: readonly LessonWorkspaceSnapshotRequirement[] | undefined;
}

export interface LessonWorkspaceResolution {
  readonly workspaceType: CodeAlongWorkspaceType;
  readonly capabilities: PracticeCapabilities;
}

export function resolveLessonWorkspaceConfig(context: LessonWorkspaceContext): LessonWorkspaceResolution {
  const language = context.language;
  const entryFile = context.entryFile ?? 'index.js';

  let isMulti = false;
  if (context.snapshots) {
    for (const snapshot of context.snapshots) {
      if (isProjectWorkspace(snapshot.files, entryFile)) {
        isMulti = true;
        break;
      }
    }
  }

  if (!isMulti && context.practiceSteps) {
    for (const step of context.practiceSteps) {
      if (step.practiceEnabled) {
        if (step.verificationMode === 'WORKSPACE_STRUCTURE') {
          isMulti = true;
          break;
        }
        if (step.targetFiles && step.targetFiles.length > 1) {
          isMulti = true;
          break;
        }
      }
    }
  }

  const workspaceType: CodeAlongWorkspaceType = isMulti ? 'MULTI_FILE' : 'SINGLE_FILE';
  const allowRun = supportsRun(language, workspaceType);
  const allowCheck = true;
  const allowJudge = supportsJudge(language, true, true);

  const autoCapabilities: PracticeCapabilities = {
    allowRun,
    allowCheck,
    allowJudge,
    allowCreateFiles: isMulti,
    allowCreateFolders: isMulti,
    allowRenameFiles: isMulti,
    allowDeleteFiles: isMulti,
  };

  if (context.manualOverride) {
    const override = context.manualOverride;
    const manualWorkspaceType = override.workspaceType ?? workspaceType;
    return {
      workspaceType: manualWorkspaceType,
      capabilities: {
        allowRun: override.capabilities?.allowRun ?? supportsRun(language, manualWorkspaceType),
        allowCheck: override.capabilities?.allowCheck ?? true,
        allowJudge: override.capabilities?.allowJudge ?? allowJudge,
        allowCreateFiles: override.capabilities?.allowCreateFiles ?? (manualWorkspaceType === 'MULTI_FILE'),
        allowCreateFolders: override.capabilities?.allowCreateFolders ?? (manualWorkspaceType === 'MULTI_FILE'),
        allowRenameFiles: override.capabilities?.allowRenameFiles ?? (manualWorkspaceType === 'MULTI_FILE'),
        allowDeleteFiles: override.capabilities?.allowDeleteFiles ?? (manualWorkspaceType === 'MULTI_FILE'),
      },
    };
  }

  return {
    workspaceType,
    capabilities: autoCapabilities,
  };
}

export type VideoPracticeVerificationStrategy =
  | 'AUTO'
  | 'NONE'
  | 'AI_SEMANTIC'
  | 'CODE_COMPARE'
  | 'FILE_COMPARE'
  | 'STRUCTURAL'
  | 'WORKSPACE_STRUCTURE'
  | 'TESTS';

export interface SnapshotReferenceCandidate {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly files: readonly InstructorWorkspaceFile[];
}

export function findAutoReferenceSnapshot(
  checkpoint: {
    readonly timestampSeconds?: number | undefined;
    readonly practiceSnapshotId?: string | null | undefined;
  },
  snapshots: readonly SnapshotReferenceCandidate[],
): SnapshotReferenceCandidate | null {
  if (snapshots.length === 0) {
    return null;
  }

  // 1. Explicit override snapshot
  if (checkpoint.practiceSnapshotId) {
    const explicit = snapshots.find((s) => s.id === checkpoint.practiceSnapshotId);
    if (explicit) {
      return explicit;
    }
  }

  const targetTime = checkpoint.timestampSeconds;
  if (targetTime === undefined || targetTime === null) {
    return null;
  }

  // 2. Exact timestamp match (snapshot belonging to milestone). Ambiguous
  // same-timestamp snapshots require an explicit reference.
  const exactMatches = snapshots.filter((s) => s.timestampSeconds === targetTime);
  if (exactMatches.length === 1) {
    return exactMatches[0] ?? null;
  }

  // 3. Otherwise no reference
  return null;
}

export interface LessonPracticeDefaults {
  readonly defaultPracticeBehavior?: VideoPracticeBehavior | undefined;
  readonly defaultVerificationStrategy?: VideoPracticeVerificationStrategy | string | undefined;
  readonly language?: string | undefined;
  readonly entryFile?: string | null | undefined;
}

export interface CheckpointPracticeOverride {
  readonly behavior?: VideoPracticeBehavior | undefined;
  readonly verificationMode?: VideoPracticeVerificationMode | undefined;
  readonly targetFilePath?: string | null | undefined;
  readonly targetStartLine?: number | null | undefined;
  readonly targetEndLine?: number | null | undefined;
  readonly practiceSnapshotId?: string | null | undefined;
  readonly verificationRules?: {
    readonly requiredPaths?: readonly string[] | undefined;
    readonly rules?: readonly GeneratedPracticeRule[] | undefined;
  } | null | undefined;
}

export interface CheckpointPracticeContext {
  readonly timestampSeconds?: number | undefined;
  readonly studentTask?: string | null | undefined;
  readonly hasValidTests?: boolean | undefined;
  readonly judgeSupported?: boolean | undefined;
  readonly structuralSupported?: boolean | undefined;
  readonly activeFilePath?: string | undefined;
}

export interface EffectivePracticeResolution {
  readonly practiceEnabled: boolean;
  readonly behavior: VideoPracticeBehavior;
  readonly verificationMode: VideoPracticeVerificationMode;
  readonly practiceSnapshotId: string | null;
  readonly targetFiles: readonly string[];
  readonly targetFilePath: string | null;
  readonly targetStartLine: number | null;
  readonly targetEndLine: number | null;
  readonly generatedRules: readonly GeneratedPracticeRule[];
  readonly summary: string;
  readonly reason: string;
}

export function resolveEffectivePracticeConfig(params: {
  readonly lessonDefaults?: LessonPracticeDefaults | undefined;
  readonly checkpointOverride?: CheckpointPracticeOverride | null | undefined;
  readonly checkpointContext: CheckpointPracticeContext;
  readonly milestoneSnapshot?: SnapshotReferenceCandidate | null | undefined;
  readonly allSnapshots?: readonly SnapshotReferenceCandidate[] | undefined;
}): EffectivePracticeResolution {
  const language = params.lessonDefaults?.language ?? 'typescript';
  const entryFile = params.lessonDefaults?.entryFile ?? 'src/index.ts';

  const allSnapshots = params.allSnapshots ?? (params.milestoneSnapshot ? [params.milestoneSnapshot] : []);
  const referenceSnapshot = findAutoReferenceSnapshot(
    {
      timestampSeconds: params.checkpointContext.timestampSeconds,
      practiceSnapshotId: params.checkpointOverride?.practiceSnapshotId,
    },
    allSnapshots,
  ) ?? params.milestoneSnapshot ?? null;

  const snapshotFiles = referenceSnapshot ? referenceSnapshot.files : [];
  const targetFiles = requiredSnapshotFiles(snapshotFiles);
  const activeFilePath = params.checkpointOverride?.targetFilePath
    ?? params.checkpointContext.activeFilePath
    ?? targetFiles[0]
    ?? entryFile;

  const effectiveBehavior: VideoPracticeBehavior =
    params.checkpointOverride?.behavior
    ?? params.lessonDefaults?.defaultPracticeBehavior
    ?? 'REQUIRED';

  let effectiveMode: VideoPracticeVerificationMode = 'NONE';
  let summary = '';
  let reason = '';
  let generatedRules: readonly GeneratedPracticeRule[] = [];

  const rawOverrideMode = params.checkpointOverride?.verificationMode;
  const rawDefaultStrategy = params.lessonDefaults?.defaultVerificationStrategy ?? 'AUTO';

  if (rawOverrideMode) {
    effectiveMode = rawOverrideMode;
    reason = 'Explicit milestone override was configured.';
    if (effectiveMode === 'NONE') {
      summary = 'Manual completion. Students will confirm completion manually.';
    } else if (effectiveMode === 'AI_SEMANTIC') {
      summary = 'AI semantic feedback will check whether the student implemented this milestone.';
    } else if (effectiveMode === 'FILE_COMPARE' || effectiveMode === 'CODE_COMPARE') {
      summary = 'Student file will be matched against milestone snapshot.';
      generatedRules = [{ type: 'FILE_EXISTS', path: activeFilePath }];
    } else if (effectiveMode === 'STRUCTURAL') {
      generatedRules = params.checkpointOverride?.verificationRules?.rules
        ?? deriveStructuralRules(snapshotFiles, activeFilePath);
      summary = `Code structure in ${activeFilePath} will be checked automatically.`;
    } else if (effectiveMode === 'WORKSPACE_STRUCTURE') {
      generatedRules = params.checkpointOverride?.verificationRules?.rules
        ?? targetFiles.map((path) => ({ type: 'FILE_EXISTS', path }));
      summary = 'Project workspace structure will be checked automatically.';
    } else if (effectiveMode === 'TESTS') {
      summary = 'Configured tests will validate the student solution.';
    }
  } else if (rawDefaultStrategy !== 'AUTO') {
    if (rawDefaultStrategy === 'NONE') {
      effectiveMode = 'NONE';
      summary = 'Manual completion inherited from video defaults.';
      reason = 'Lesson default verification is set to Manual completion.';
    } else if (rawDefaultStrategy === 'AI_SEMANTIC') {
      effectiveMode = 'AI_SEMANTIC';
      summary = 'AI semantic feedback inherited from video defaults.';
      reason = 'Lesson default verification is set to AI Semantic.';
    } else if (rawDefaultStrategy === 'FILE_COMPARE' || rawDefaultStrategy === 'CODE_COMPARE') {
      effectiveMode = 'FILE_COMPARE';
      summary = 'File compare inherited from video defaults.';
      reason = 'Lesson default verification is set to File Compare.';
      generatedRules = [{ type: 'FILE_EXISTS', path: activeFilePath }];
    } else if (rawDefaultStrategy === 'STRUCTURAL') {
      effectiveMode = 'STRUCTURAL';
      generatedRules = deriveStructuralRules(snapshotFiles, activeFilePath);
      summary = `Code structure in ${activeFilePath} will be checked (inherited from video defaults).`;
      reason = 'Lesson default verification is set to Structural.';
    } else if (rawDefaultStrategy === 'WORKSPACE_STRUCTURE') {
      effectiveMode = 'WORKSPACE_STRUCTURE';
      generatedRules = targetFiles.map((path) => ({ type: 'FILE_EXISTS', path }));
      summary = 'Project structure will be checked (inherited from video defaults).';
      reason = 'Lesson default verification is set to Workspace Structure.';
    } else if (rawDefaultStrategy === 'TESTS') {
      effectiveMode = 'TESTS';
      summary = 'Tests validation (inherited from video defaults).';
      reason = 'Lesson default verification is set to Tests.';
    }
  } else {
    // AUTO derivation
    const autoStrategy = resolveVideoPracticeAutoConfig({
      studentTask: params.checkpointContext.studentTask?.trim() ?? '',
      files: snapshotFiles,
      language,
      entryFile,
      activeFilePath,
      hasValidTests: params.checkpointContext.hasValidTests,
      judgeSupported: params.checkpointContext.judgeSupported ?? true,
      structuralSupported: params.checkpointContext.structuralSupported,
    });
    effectiveMode = autoStrategy.verificationMode;
    summary = autoStrategy.summary;
    reason = autoStrategy.reason;
    generatedRules = autoStrategy.generatedRules;
  }

  return {
    practiceEnabled: true,
    behavior: effectiveBehavior,
    verificationMode: effectiveMode,
    practiceSnapshotId: effectiveMode === 'NONE' ? null : (referenceSnapshot?.id ?? null),
    targetFiles,
    targetFilePath: effectiveMode === 'NONE' ? null : activeFilePath,
    targetStartLine: params.checkpointOverride?.targetStartLine ?? null,
    targetEndLine: params.checkpointOverride?.targetEndLine ?? null,
    generatedRules,
    summary,
    reason,
  };
}

export function validatePracticeConfigConsistency(input: {
  readonly practiceEnabled: boolean;
  readonly verificationMode: VideoPracticeVerificationMode;
  readonly practiceSnapshotId?: string | null | undefined;
  readonly hasSnapshot?: boolean | undefined;
  readonly hasValidTests?: boolean | undefined;
  readonly targetFilePath?: string | null | undefined;
}): { readonly valid: boolean; readonly error?: string | undefined; readonly warning?: string | undefined } {
  if (!input.practiceEnabled || input.verificationMode === 'NONE') {
    return { valid: true };
  }

  if (input.verificationMode === 'AI_SEMANTIC' || input.verificationMode === 'FILE_COMPARE' || input.verificationMode === 'CODE_COMPARE') {
    if (!input.practiceSnapshotId) {
      return { valid: false, error: 'Practice verification requires a reference code snapshot' };
    }
  }

  if (input.verificationMode === 'TESTS') {
    if (input.hasValidTests === false) {
      return { valid: false, error: 'Tests verification mode requires configured test cases' };
    }
  }

  if (input.verificationMode === 'WORKSPACE_STRUCTURE') {
    if (!input.practiceSnapshotId && !input.hasSnapshot) {
      return { valid: false, error: 'Workspace Structure verification requires a reference code snapshot' };
    }
  }

  return { valid: true };
}
