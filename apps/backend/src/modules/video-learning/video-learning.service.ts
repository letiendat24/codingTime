import { createHash } from 'node:crypto';
import type { Client as MinioClient } from 'minio';
import type { Request, Response } from 'express';
import {
  CheckpointProgressStatus,
  LearningActivityType,
  PracticeProblemStatus,
  VideoCheckpointType,
  VideoPracticeBehavior,
  VideoPracticeVerificationMode,
  VideoWorkspaceType,
  JudgeSubmissionStatus,
  Prisma,
  type CodeSnapshot,
  type PrismaClient,
  type VideoCheckpoint,
  type VideoProgress,
} from '@prisma/client';
import {
  resolveEffectivePracticeConfig,
  resolveLessonWorkspaceConfig,
  supportsRun,
  supportsJudge,
  validatePracticeConfigConsistency,
} from '@codesync/shared';
import type { Env } from '../../config';
import type { AppLogger } from '../../shared/logger';
import type { LearningService } from '../learning/learning.service';
import { processedPrefix } from '../videos/video.constants';
import { sanitizeHlsPath, streamHlsObject } from '../videos/video-stream.helper';
import {
  AI_VIDEO_CHECKPOINT_EVALUATOR_VERSION,
  GeminiVideoCheckpointEvaluator,
  type AiCheckpointEvaluationInput,
  type AiCheckpointEvaluationResult,
  type AiCheckpointFile,
  type AiVideoCheckpointEvaluator,
} from './ai-video-checkpoint-evaluator';
import {
  checkpointCompletionUnsupported,
  codeAlongConfigInvalid,
  checkpointNotFound,
  checkpointTimestampInvalid,
  codeSnapshotFilesInvalid,
  codeSnapshotNotFound,
  codeSnapshotTimestampInvalid,
  practiceStepInvalid,
  practiceStepNotFound,
  practiceStepRequired,
  videoLearningNotAccessible,
  videoProgressInvalidPosition,
} from './video-learning.errors';
import { VideoLearningRepository } from './video-learning.repository';
import type {
  CheckpointInput,
  CheckpointUpdateInput,
  CodeSnapshotInput,
  CodeSnapshotUpdateInput,
  CodeAlongConfigInput,
  PracticeStepCompleteInput,
  PracticeStepConfigInput,
  VideoProgressInput,
} from './video-learning.schemas';
import type {
  CheckpointCompletionResponse,
  CodeSnapshotMetadata,
  CodeSnapshotResponse,
  CodeAlongConfigResponse,
  InstructorCheckpointResponse,
  InstructorCheckpointPracticeResponse,
  InteractiveVideoPlaybackResponse,
  LinkedPracticeProblemSummary,
  PracticeStepCompletionResponse,
  PracticeVerificationStatus,
  PracticeStepResponse,
  StudentCodeAlongResponse,
  StudentCheckpoint,
  VideoProgressResponse,
  VideoProgressState,
} from './video-learning.types';

const SUPPORTED_SNAPSHOT_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'html',
  'css',
  'json',
  'python',
  'java',
  'csharp',
  'go',
  'rust',
  'sql',
  'markdown',
]);

const DEFAULT_CODE_ALONG_LANGUAGE = 'javascript';
const DEFAULT_CODE_ALONG_ENTRY_FILE = 'index.js';
const DEFAULT_AI_VERIFICATION_MAX_INPUT_BYTES = 60_000;
const DEFAULT_AI_VERIFICATION_COOLDOWN_MS = 2_000;
const AI_SEMANTIC_STALE_MESSAGE = 'Your workspace changed while this check was running. Please check again.';
const DEFAULT_CODE_ALONG_CAPABILITIES = {
  allowEditFiles: true,
  allowCreateFiles: false,
  allowCreateFolders: false,
  allowRenameFiles: false,
  allowDeleteFiles: false,
  allowRun: true,
  allowCheck: true,
  allowJudge: true,
} as const;

function clampPosition(positionSeconds: number, durationSeconds: number) {
  if (positionSeconds < 0) {
    throw videoProgressInvalidPosition();
  }

  return Math.min(Math.floor(positionSeconds), durationSeconds);
}

function watchedPercent(positionSeconds: number, durationSeconds: number) {
  if (durationSeconds <= 0) {
    return 0;
  }

  return Math.min(100, Math.floor((positionSeconds / durationSeconds) * 100));
}

function progressState(progress: VideoProgress | null | undefined): VideoProgressState {
  return {
    lastPositionSeconds: progress?.lastPositionSeconds ?? 0,
    furthestPositionSeconds: progress?.furthestPositionSeconds ?? 0,
    watchedPercent: progress?.watchedPercent ?? 0,
    completed: Boolean(progress?.completedAt),
  };
}

function formatTimestampLabel(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const remainder = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

type LinkedPracticeProblemRelation = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly inputFormat: string;
  readonly outputFormat: string;
  readonly constraints: string;
  readonly examplesJson: Prisma.JsonValue | null;
  readonly difficulty: LinkedPracticeProblemSummary['difficulty'];
  readonly status: PracticeProblemStatus;
  readonly language: string;
  readonly entryFile: string;
  readonly executionContract: string;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly passScore: Prisma.Decimal | number;
  readonly scoringMode: LinkedPracticeProblemSummary['scoringMode'];
  readonly testCases?: readonly {
    readonly id: string;
    readonly name: string;
    readonly input: string;
    readonly expectedOutput: string;
    readonly weight: Prisma.Decimal | number;
    readonly position: number;
    readonly visibility: LinkedPracticeProblemSummary['publicTests'][number]['visibility'];
  }[];
} | null;

function mapLinkedPracticeProblem(problem: LinkedPracticeProblemRelation): LinkedPracticeProblemSummary | null {
  if (!problem) {
    return null;
  }

  return {
    id: problem.id,
    title: problem.title,
    slug: problem.slug,
    description: problem.description,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    examples: problem.examplesJson ?? [],
    difficulty: problem.difficulty,
    status: problem.status,
    language: problem.language,
    entryFile: problem.entryFile,
    executionContract: problem.executionContract,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    passScore: Number(problem.passScore),
    scoringMode: problem.scoringMode,
    publicTests: (problem.testCases ?? []).map((test) => ({
      id: test.id,
      name: test.name,
      input: test.input,
      expectedOutput: test.expectedOutput,
      weight: Number(test.weight),
      position: test.position,
      visibility: test.visibility,
    })),
  };
}

function mapCheckpoint(checkpoint: VideoCheckpoint & {
  progress?: readonly { status: CheckpointProgressStatus }[];
  practiceProblem?: LinkedPracticeProblemRelation;
}): StudentCheckpoint {
  return {
    id: checkpoint.id,
    timestampSeconds: checkpoint.timestampSeconds,
    type: checkpoint.type,
    title: checkpoint.title,
    description: checkpoint.description,
    required: checkpoint.required,
    pauseVideo: checkpoint.pauseVideo,
    completed: checkpoint.progress?.[0]?.status === CheckpointProgressStatus.COMPLETED,
    practiceEnabled: checkpoint.practiceEnabled,
    practiceConfigMode: checkpoint.practiceConfigMode === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : 'AUTO',
    practiceVerificationMode: checkpoint.practiceVerificationMode,
    practiceBehavior: checkpoint.practiceBehavior,
    practiceSnapshotId: checkpoint.practiceSnapshotId,
    practiceProblemId: checkpoint.practiceProblemId,
    practiceTargetFilePath: checkpoint.practiceTargetFilePath,
    practiceTargetStartLine: checkpoint.practiceTargetStartLine,
    practiceTargetEndLine: checkpoint.practiceTargetEndLine,
    practiceProblem: mapLinkedPracticeProblem(checkpoint.practiceProblem ?? null),
  };
}

type InstructorCheckpointWithRelations = VideoCheckpoint & {
  readonly codingConfig?: { readonly testCases?: readonly unknown[] } | null;
  readonly practiceProblem?: LinkedPracticeProblemRelation;
  readonly videoAsset?: { readonly codeSnapshots?: readonly CodeSnapshot[] } | null;
  readonly lesson?: {
    readonly codeAlongConfig?: {
      readonly language?: string;
      readonly entryFile?: string | null;
      readonly workspaceType?: VideoWorkspaceType | null;
      readonly allowEditFiles?: boolean | null;
      readonly allowCreateFiles?: boolean | null;
      readonly allowCreateFolders?: boolean | null;
      readonly allowRenameFiles?: boolean | null;
      readonly allowDeleteFiles?: boolean | null;
      readonly allowRun?: boolean | null;
      readonly allowCheck?: boolean | null;
      readonly allowJudge?: boolean | null;
      readonly defaultPracticeBehavior?: VideoPracticeBehavior | null;
      readonly defaultVerificationStrategy?: string | null;
    } | null;
  } | null;
};

type PracticeMilestoneCandidate = VideoCheckpoint & {
  readonly practiceProblem?: LinkedPracticeProblemRelation;
  readonly videoAsset?: {
    readonly codeSnapshots?: readonly Pick<CodeSnapshot, 'id' | 'lessonId' | 'videoAssetId'>[];
  } | null;
};

interface AiEvaluationContext {
  readonly checkpoint: VideoCheckpoint;
  readonly workspace: {
    readonly id: string;
    readonly language: string;
    readonly entryFile: string;
    readonly files: readonly AiCheckpointFile[];
  };
  readonly language: string;
  readonly workspaceType: string;
  readonly entryFile: string;
  readonly currentSnapshot: CodeSnapshot;
  readonly previousSnapshot: CodeSnapshot | null;
  readonly evaluationInput: AiCheckpointEvaluationInput;
  readonly inputFingerprint: string;
  readonly instructorFingerprint: string;
}

function hasMatchingPracticeSnapshot(
  checkpoint: Pick<VideoCheckpoint, 'lessonId' | 'videoAssetId' | 'practiceSnapshotId'>,
  snapshots: readonly Pick<CodeSnapshot, 'id' | 'lessonId' | 'videoAssetId'>[],
) {
  if (!checkpoint.practiceSnapshotId || !checkpoint.videoAssetId) {
    return false;
  }

  return snapshots.some((snapshot) =>
    snapshot.id === checkpoint.practiceSnapshotId &&
    snapshot.lessonId === checkpoint.lessonId &&
    snapshot.videoAssetId === checkpoint.videoAssetId,
  );
}

function requiresPracticeSnapshotLink(
  checkpoint: Pick<VideoCheckpoint, 'title' | 'practiceSnapshotId' | 'practiceProblemId' | 'practiceConfigMode' | 'practiceVerificationMode'>,
  snapshots: readonly Pick<CodeSnapshot, 'id' | 'lessonId' | 'videoAssetId'>[],
) {
  if (checkpoint.practiceProblemId) {
    return false;
  }

  if (checkpoint.practiceSnapshotId) {
    return true;
  }

  if (
    checkpoint.practiceVerificationMode === VideoPracticeVerificationMode.FILE_COMPARE ||
    checkpoint.practiceVerificationMode === VideoPracticeVerificationMode.CODE_COMPARE
  ) {
    return true;
  }

  const looksLikeGeneratedMilestone = /^Milestone at \d{2}:\d{2}$/.test(checkpoint.title);
  return snapshots.length > 0 && checkpoint.practiceConfigMode !== 'MANUAL_OVERRIDE' && looksLikeGeneratedMilestone;
}

function isActivePracticeMilestone(checkpoint: PracticeMilestoneCandidate) {
  if (!checkpoint.practiceEnabled) {
    return false;
  }

  const snapshots = checkpoint.videoAsset?.codeSnapshots ?? [];
  return !requiresPracticeSnapshotLink(checkpoint, snapshots) || hasMatchingPracticeSnapshot(checkpoint, snapshots);
}

function isVisibleStudentCheckpoint(
  checkpoint: VideoCheckpoint,
  snapshots: readonly Pick<CodeSnapshot, 'id' | 'lessonId' | 'videoAssetId'>[],
) {
  if (!checkpoint.practiceEnabled) {
    return true;
  }

  return !requiresPracticeSnapshotLink(checkpoint, snapshots) || hasMatchingPracticeSnapshot(checkpoint, snapshots);
}

function effectiveRuntimeVerificationMode(checkpoint: Pick<VideoCheckpoint, 'practiceConfigMode' | 'practiceVerificationMode'>): VideoPracticeVerificationMode {
  if (
    checkpoint.practiceConfigMode !== 'MANUAL_OVERRIDE' &&
    (
      checkpoint.practiceVerificationMode === VideoPracticeVerificationMode.FILE_COMPARE ||
      checkpoint.practiceVerificationMode === VideoPracticeVerificationMode.CODE_COMPARE
    )
  ) {
    return VideoPracticeVerificationMode.AI_SEMANTIC;
  }

  return checkpoint.practiceVerificationMode === VideoPracticeVerificationMode.CODE_COMPARE
    ? VideoPracticeVerificationMode.FILE_COMPARE
    : checkpoint.practiceVerificationMode;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function bytesOf(value: unknown): number {
  return Buffer.byteLength(stableJson(value), 'utf8');
}

function resolveCheckpointPracticeStrategy(checkpoint: InstructorCheckpointWithRelations): InstructorCheckpointPracticeResponse {
  const snapshots = checkpoint.videoAsset?.codeSnapshots ?? [];
  const allSnapshots = snapshots.map((snapshot) => ({
    id: snapshot.id,
    timestampSeconds: snapshot.timestampSeconds,
    files: filesFromJson(snapshot),
  }));
  const language = checkpoint.lesson?.codeAlongConfig?.language ?? snapshots[0]?.language ?? DEFAULT_CODE_ALONG_LANGUAGE;
  const entryFile = checkpoint.lesson?.codeAlongConfig?.entryFile ?? DEFAULT_CODE_ALONG_ENTRY_FILE;
  const hasValidTests = Boolean(checkpoint.codingConfig?.testCases && checkpoint.codingConfig.testCases.length > 0);
  const judgeSupported = hasValidTests;
  const configMode = checkpoint.practiceConfigMode === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : 'AUTO';

  const effective = resolveEffectivePracticeConfig({
    lessonDefaults: {
      defaultPracticeBehavior: checkpoint.lesson?.codeAlongConfig?.defaultPracticeBehavior ?? VideoPracticeBehavior.REQUIRED,
      defaultVerificationStrategy: checkpoint.lesson?.codeAlongConfig?.defaultVerificationStrategy ?? 'AUTO',
      language,
      entryFile,
    },
    checkpointOverride: configMode === 'MANUAL_OVERRIDE'
      ? {
          behavior: checkpoint.practiceBehavior,
          verificationMode: checkpoint.practiceVerificationMode,
          targetFilePath: checkpoint.practiceTargetFilePath,
          targetStartLine: checkpoint.practiceTargetStartLine,
          targetEndLine: checkpoint.practiceTargetEndLine,
          practiceSnapshotId: checkpoint.practiceSnapshotId,
          verificationRules: parseVerificationRules(checkpoint.practiceVerificationRulesJson),
        }
      : {
          targetFilePath: checkpoint.practiceTargetFilePath,
          targetStartLine: checkpoint.practiceTargetStartLine,
          targetEndLine: checkpoint.practiceTargetEndLine,
          practiceSnapshotId: checkpoint.practiceSnapshotId,
          verificationRules: parseVerificationRules(checkpoint.practiceVerificationRulesJson),
        },
    checkpointContext: {
      timestampSeconds: checkpoint.timestampSeconds,
      studentTask: checkpoint.description ?? '',
      hasValidTests,
      judgeSupported,
      structuralSupported: true,
      activeFilePath: checkpoint.practiceTargetFilePath ?? undefined,
    },
    allSnapshots,
  });

  return {
    configMode,
    practiceEnabled: checkpoint.practiceEnabled && effective.practiceEnabled,
    behavior: effective.behavior,
    verificationMode: effective.verificationMode,
    workspaceType: (checkpoint.lesson?.codeAlongConfig?.workspaceType ?? VideoWorkspaceType.SINGLE_FILE) as VideoWorkspaceType,
    capabilities: {
      allowEditFiles: checkpoint.lesson?.codeAlongConfig?.allowEditFiles ?? true,
      allowCreateFiles: checkpoint.lesson?.codeAlongConfig?.allowCreateFiles ?? false,
      allowCreateFolders: checkpoint.lesson?.codeAlongConfig?.allowCreateFolders ?? false,
      allowRenameFiles: checkpoint.lesson?.codeAlongConfig?.allowRenameFiles ?? false,
      allowDeleteFiles: checkpoint.lesson?.codeAlongConfig?.allowDeleteFiles ?? false,
      allowRun: checkpoint.lesson?.codeAlongConfig?.allowRun ?? true,
      allowCheck: checkpoint.lesson?.codeAlongConfig?.allowCheck ?? true,
      allowJudge: checkpoint.lesson?.codeAlongConfig?.allowJudge ?? true,
    },
    targetFiles: effective.targetFiles,
    generatedRules: parseVerificationRules(checkpoint.practiceVerificationRulesJson).rules.length > 0
      ? parseVerificationRules(checkpoint.practiceVerificationRulesJson).rules
      : effective.generatedRules,
    summary: effective.summary,
    reason: effective.reason,
  };
}

function mapInstructorCheckpoint(
  checkpoint: InstructorCheckpointWithRelations,
  practiceOverride?: InstructorCheckpointPracticeResponse,
): InstructorCheckpointResponse {
  let practice: InstructorCheckpointPracticeResponse | undefined = practiceOverride;
  if (!practice && checkpoint.videoAsset && checkpoint.lesson) {
    practice = resolveCheckpointPracticeStrategy(checkpoint);
  }

  return {
    id: checkpoint.id,
    videoAssetId: checkpoint.videoAssetId,
    lessonId: checkpoint.lessonId,
    timestampSeconds: checkpoint.timestampSeconds,
    type: checkpoint.type,
    title: checkpoint.title,
    description: checkpoint.description,
    required: checkpoint.required,
    pauseVideo: checkpoint.pauseVideo,
    position: checkpoint.position,
    practiceEnabled: checkpoint.practiceEnabled,
    practiceConfigMode: checkpoint.practiceConfigMode === 'MANUAL_OVERRIDE' ? 'MANUAL_OVERRIDE' : 'AUTO',
    practiceVerificationMode: checkpoint.practiceVerificationMode,
    practiceBehavior: checkpoint.practiceBehavior,
    practiceSnapshotId: checkpoint.practiceSnapshotId,
    practiceProblemId: checkpoint.practiceProblemId,
    practiceTargetFilePath: checkpoint.practiceTargetFilePath,
    practiceTargetStartLine: checkpoint.practiceTargetStartLine,
    practiceTargetEndLine: checkpoint.practiceTargetEndLine,
    ...(practice ? { practice } : {}),
    practiceProblem: mapLinkedPracticeProblem(checkpoint.practiceProblem ?? null),
  };
}

function mapPracticeStep(checkpoint: VideoCheckpoint & {
  progress?: readonly { status: CheckpointProgressStatus }[];
  practiceProblem?: LinkedPracticeProblemRelation;
}): PracticeStepResponse {
  const status = checkpoint.progress?.[0]?.status ?? CheckpointProgressStatus.NOT_STARTED;

  return {
    id: checkpoint.id,
    lessonId: checkpoint.lessonId,
    videoAssetId: checkpoint.videoAssetId,
    timestampSeconds: checkpoint.timestampSeconds,
    timestampMs: checkpoint.timestampSeconds * 1000,
    title: checkpoint.title,
    instruction: checkpoint.description,
    required: checkpoint.required,
    behavior: checkpoint.practiceBehavior,
    verificationMode: checkpoint.practiceVerificationMode,
    snapshotId: checkpoint.practiceSnapshotId,
    practiceProblemId: checkpoint.practiceProblemId,
    targetFilePath: checkpoint.practiceTargetFilePath,
    targetStartLine: checkpoint.practiceTargetStartLine,
    targetEndLine: checkpoint.practiceTargetEndLine,
    verificationRules: checkpoint.practiceVerificationRulesJson ?? null,
    status,
    completed: status === CheckpointProgressStatus.COMPLETED,
    practiceProblem: mapLinkedPracticeProblem(checkpoint.practiceProblem ?? null),
  };
}

function mapCodeAlongConfig(config: {
  readonly enabled: boolean;
  readonly language: string;
  readonly entryFile: string | null;
  readonly workspaceType?: VideoWorkspaceType | null;
  readonly allowEditFiles?: boolean | null;
  readonly allowCreateFiles?: boolean | null;
  readonly allowCreateFolders?: boolean | null;
  readonly allowRenameFiles?: boolean | null;
  readonly allowDeleteFiles?: boolean | null;
  readonly allowRun?: boolean | null;
  readonly allowCheck?: boolean | null;
  readonly allowJudge?: boolean | null;
  readonly defaultPracticeBehavior?: VideoPracticeBehavior | null;
  readonly defaultVerificationStrategy?: string | null;
}, fallbackEnabled = false): CodeAlongConfigResponse {
  return {
    enabled: config.enabled || fallbackEnabled,
    language: config.language,
    entryFile: config.entryFile,
    workspaceType: config.workspaceType ?? VideoWorkspaceType.SINGLE_FILE,
    capabilities: {
      allowEditFiles: config.allowEditFiles ?? DEFAULT_CODE_ALONG_CAPABILITIES.allowEditFiles,
      allowCreateFiles: config.allowCreateFiles ?? DEFAULT_CODE_ALONG_CAPABILITIES.allowCreateFiles,
      allowCreateFolders: config.allowCreateFolders ?? DEFAULT_CODE_ALONG_CAPABILITIES.allowCreateFolders,
      allowRenameFiles: config.allowRenameFiles ?? DEFAULT_CODE_ALONG_CAPABILITIES.allowRenameFiles,
      allowDeleteFiles: config.allowDeleteFiles ?? DEFAULT_CODE_ALONG_CAPABILITIES.allowDeleteFiles,
      allowRun: config.allowRun ?? DEFAULT_CODE_ALONG_CAPABILITIES.allowRun,
      allowCheck: config.allowCheck ?? DEFAULT_CODE_ALONG_CAPABILITIES.allowCheck,
      allowJudge: config.allowJudge ?? DEFAULT_CODE_ALONG_CAPABILITIES.allowJudge,
    },
    defaultPracticeBehavior: config.defaultPracticeBehavior ?? VideoPracticeBehavior.REQUIRED,
    defaultVerificationStrategy: config.defaultVerificationStrategy ?? 'AUTO',
  };
}

function normalizeCompareCode(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function sliceLineRange(content: string, startLine: number | null, endLine: number | null) {
  if (!startLine && !endLine) {
    return content;
  }

  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const start = Math.max(0, (startLine ?? 1) - 1);
  const end = Math.max(start + 1, endLine ?? lines.length);
  return lines.slice(start, end).join('\n');
}

type CodeFile = { readonly path: string; readonly content: string };
type PracticeVerificationRule = {
  readonly type: string;
  readonly path?: string | undefined;
  readonly value?: string | undefined;
  readonly field?: string | undefined;
};
type VerificationResult = {
  readonly status: PracticeVerificationStatus;
  readonly details: readonly string[];
};

function passed(details: readonly string[] = ['Verification passed']): VerificationResult {
  return { status: 'PASSED', details };
}

function failed(details: readonly string[]): VerificationResult {
  return { status: 'FAILED', details };
}

function unavailable(details: readonly string[]): VerificationResult {
  return { status: 'UNAVAILABLE', details };
}

function parseVerificationRules(value: unknown) {
  const source = value && typeof value === 'object' ? value as {
    readonly requiredPaths?: unknown;
    readonly rules?: unknown;
  } : {};
  const requiredPaths = Array.isArray(source.requiredPaths)
    ? source.requiredPaths.filter((path): path is string => typeof path === 'string' && path.length > 0)
    : [];
  const rules = Array.isArray(source.rules)
    ? source.rules
        .filter((rule): rule is { readonly type: string; readonly path?: string; readonly value?: string; readonly field?: string } =>
          Boolean(rule)
          && typeof rule === 'object'
          && typeof (rule as { readonly type?: unknown }).type === 'string')
        .map((rule) => ({
          type: rule.type,
          path: typeof rule.path === 'string' ? rule.path : undefined,
          value: typeof rule.value === 'string' ? rule.value : undefined,
          field: typeof rule.field === 'string' ? rule.field : undefined,
        }))
    : [];

  return { requiredPaths, rules };
}

function fileByPath(files: readonly CodeFile[], path: string | null | undefined) {
  return path ? files.find((file) => file.path === path) : undefined;
}

function safeRegex(pattern: string): RegExp | null {
  if (pattern.length > 160) {
    return null;
  }

  try {
    return new RegExp(pattern, 'm');
  } catch {
    return null;
  }
}

function symbolRegex(kind: string, symbol: string) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (kind === 'EXPORT_EXISTS') return new RegExp(`export\\s+(?:default\\s+)?(?:const|let|var|function|class|interface|type)\\s+${escaped}\\b|export\\s*\\{[^}]*\\b${escaped}\\b`, 'm');
  if (kind === 'IMPORT_EXISTS') return new RegExp(`import\\s+(?:[^;]*\\b${escaped}\\b[^;]*\\s+from\\s+)?['"][^'"]+['"]|import\\s*\\([^)]*${escaped}[^)]*\\)`, 'm');
  if (kind === 'FUNCTION_EXISTS') return new RegExp(`function\\s+${escaped}\\b|(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`, 'm');
  if (kind === 'CLASS_EXISTS') return new RegExp(`class\\s+${escaped}\\b`, 'm');
  if (kind === 'COMPONENT_EXISTS') return new RegExp(`function\\s+${escaped}\\b|(?:const|let|var)\\s+${escaped}\\s*=|class\\s+${escaped}\\b`, 'm');
  return new RegExp(`\\b${escaped}\\b`, 'm');
}

function evaluateStructuralRules(files: readonly CodeFile[], fallbackPath: string | null, rulesValue: unknown): VerificationResult {
  const { requiredPaths, rules } = parseVerificationRules(rulesValue);
  const failures: string[] = [];

  for (const requiredPath of requiredPaths) {
    if (!fileByPath(files, requiredPath)) {
      failures.push(`Missing required file: ${requiredPath}`);
    }
  }

  const effectiveRules: readonly PracticeVerificationRule[] = rules.length > 0
    ? rules
    : fallbackPath
      ? [{ type: 'FILE_EXISTS', path: fallbackPath }]
      : [];

  for (const rule of effectiveRules) {
    const targetPath = rule.path ?? fallbackPath ?? null;
    const target = fileByPath(files, targetPath);

    if (rule.type === 'FILE_EXISTS') {
      if (!targetPath || !target) failures.push(`Missing required file: ${targetPath ?? 'target file'}`);
      continue;
    }

    if (!target) {
      failures.push(`Missing file for ${rule.type}: ${targetPath ?? 'target file'}`);
      continue;
    }

    if (rule.type === 'TEXT_CONTAINS') {
      if (!rule.value || !target.content.includes(rule.value)) failures.push(`Expected text not found in ${target.path}`);
      continue;
    }

    if (rule.type === 'REGEX_MATCH') {
      const regex = rule.value ? safeRegex(rule.value) : null;
      if (!regex || !regex.test(target.content)) failures.push(`Expected pattern not found in ${target.path}`);
      continue;
    }

    if (rule.type === 'JSON_FIELD') {
      try {
        const json = JSON.parse(target.content) as Record<string, unknown>;
        if (!rule.field || !(rule.field in json)) failures.push(`Missing JSON field ${rule.field ?? ''} in ${target.path}`.trim());
      } catch {
        failures.push(`Invalid JSON in ${target.path}`);
      }
      continue;
    }

    if (['EXPORT_EXISTS', 'IMPORT_EXISTS', 'FUNCTION_EXISTS', 'CLASS_EXISTS', 'COMPONENT_EXISTS', 'SYMBOL_EXISTS'].includes(rule.type)) {
      const regex = rule.value ? symbolRegex(rule.type, rule.value) : null;
      if (!regex || !regex.test(target.content)) failures.push(`${rule.value ?? 'Symbol'} not found in ${target.path}`);
      continue;
    }
  }

  return failures.length > 0 ? failed(failures) : passed(['Workspace requirements satisfied']);
}

function mapSnapshotMetadata(snapshot: Pick<CodeSnapshot, 'id' | 'timestampSeconds' | 'title' | 'language'>): CodeSnapshotMetadata {
  return {
    id: snapshot.id,
    timestampSeconds: snapshot.timestampSeconds,
    title: snapshot.title,
    language: snapshot.language,
  };
}

function filesFromJson(snapshot: CodeSnapshot): CodeSnapshotResponse['files'] {
  const value = snapshot.filesJson as { readonly files?: readonly { readonly path?: unknown; readonly content?: unknown }[] };

  return (value.files ?? []).map((file) => ({
    path: typeof file.path === 'string' ? file.path : '',
    content: typeof file.content === 'string' ? file.content : '',
  }));
}

function changedSnapshotPaths(previousFiles: readonly AiCheckpointFile[], currentFiles: readonly AiCheckpointFile[]): readonly string[] {
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file.content]));
  const currentByPath = new Map(currentFiles.map((file) => [file.path, file.content]));
  const paths = new Set([...previousByPath.keys(), ...currentByPath.keys()]);
  return [...paths].filter((path) => previousByPath.get(path) !== currentByPath.get(path)).sort();
}

function selectAiRelevantFiles(input: {
  readonly previousFiles: readonly AiCheckpointFile[];
  readonly currentFiles: readonly AiCheckpointFile[];
  readonly studentFiles: readonly AiCheckpointFile[];
  readonly targetFilePath: string | null;
  readonly entryFile: string;
}): {
  readonly previousFiles: readonly AiCheckpointFile[];
  readonly currentFiles: readonly AiCheckpointFile[];
  readonly studentFiles: readonly AiCheckpointFile[];
  readonly paths: readonly string[];
} {
  const currentPaths = new Set(input.currentFiles.map((file) => file.path));
  const studentPaths = new Set(input.studentFiles.map((file) => file.path));
  const paths = new Set<string>();

  for (const path of changedSnapshotPaths(input.previousFiles, input.currentFiles)) {
    paths.add(path);
  }

  if (input.targetFilePath) {
    paths.add(input.targetFilePath);
  }
  paths.add(input.entryFile);

  if (paths.size === 0) {
    for (const file of input.currentFiles.slice(0, 3)) {
      paths.add(file.path);
    }
  }

  for (const path of [...paths]) {
    if (!studentPaths.has(path) && currentPaths.has(path)) {
      paths.add(path);
    }
  }

  const orderedPaths = [...paths].filter((path) => currentPaths.has(path) || studentPaths.has(path)).sort();
  return {
    previousFiles: input.previousFiles.filter((file) => orderedPaths.includes(file.path)),
    currentFiles: input.currentFiles.filter((file) => orderedPaths.includes(file.path)),
    studentFiles: input.studentFiles.filter((file) => orderedPaths.includes(file.path)),
    paths: orderedPaths,
  };
}

function requirementsFromJson(value: Prisma.JsonValue | null): AiCheckpointEvaluationResult['requirements'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const candidate = item as { readonly label?: unknown; readonly status?: unknown; readonly feedback?: unknown };
      if (
        typeof candidate.label === 'string' &&
        (candidate.status === 'PASS' || candidate.status === 'NEEDS_FIX' || candidate.status === 'UNKNOWN') &&
        typeof candidate.feedback === 'string'
      ) {
        return { label: candidate.label, status: candidate.status, feedback: candidate.feedback };
      }
      return null;
    })
    .filter((item): item is AiCheckpointEvaluationResult['requirements'][number] => item !== null);
}

function aiStatusToVerificationStatus(status: AiCheckpointEvaluationResult['status']): PracticeVerificationStatus {
  if (status === 'PASS') {
    return 'PASSED';
  }

  return status === 'NEEDS_FIX' ? 'FAILED' : 'UNAVAILABLE';
}

function validateTimestamp(timestampSeconds: number, durationSeconds: number) {
  if (timestampSeconds < 0 || timestampSeconds > durationSeconds) {
    throw checkpointTimestampInvalid();
  }
}

function validateSnapshotTimestamp(timestampSeconds: number, durationSeconds: number) {
  if (timestampSeconds < 0 || timestampSeconds > durationSeconds) {
    throw codeSnapshotTimestampInvalid();
  }
}

function validateFiles(input: CodeSnapshotInput | CodeSnapshotUpdateInput, env: Env) {
  if (!input.files) {
    return;
  }

  if (input.files.length > env.CODE_SNAPSHOT_MAX_FILES) {
    throw codeSnapshotFilesInvalid(`A snapshot can contain at most ${env.CODE_SNAPSHOT_MAX_FILES} files`);
  }

  const paths = new Set<string>();
  let totalBytes = 0;

  for (const file of input.files) {
    if (file.path.includes('..') || file.path.startsWith('/') || file.path.includes('\\')) {
      throw codeSnapshotFilesInvalid('Snapshot file paths must be relative text paths');
    }

    if (paths.has(file.path)) {
      throw codeSnapshotFilesInvalid('Snapshot file paths must be unique');
    }

    paths.add(file.path);
    totalBytes += Buffer.byteLength(file.content, 'utf8');
  }

  if (totalBytes > env.CODE_SNAPSHOT_MAX_TOTAL_BYTES) {
    throw codeSnapshotFilesInvalid(`Snapshot content exceeds ${env.CODE_SNAPSHOT_MAX_TOTAL_BYTES} bytes`);
  }
}

function validateLanguage(language: string) {
  if (!SUPPORTED_SNAPSHOT_LANGUAGES.has(language.toLowerCase())) {
    throw codeSnapshotFilesInvalid('Unsupported code snapshot language');
  }
}

function validateEntryFile(path: string) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '')) {
    throw codeAlongConfigInvalid('Entry file must be a normalized relative path');
  }

  return path;
}

export class VideoLearningService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: VideoLearningRepository,
    private readonly storage: MinioClient,
    private readonly env: Env,
    private readonly logger: AppLogger,
    private readonly learningService: LearningService,
    private readonly aiEvaluator: AiVideoCheckpointEvaluator = new GeminiVideoCheckpointEvaluator(env, logger),
  ) {}

  private readonly aiInFlight = new Map<string, Promise<PracticeStepCompletionResponse>>();
  private readonly aiLastAttemptAt = new Map<string, number>();

  async getPlayback(studentId: string, lessonId: string): Promise<InteractiveVideoPlaybackResponse> {
    const video = await this.repository.findReadyVideoByLessonForStudent(studentId, lessonId);

    if (!video?.masterPlaylistObjectKey || !video.durationSeconds) {
      throw videoLearningNotAccessible();
    }

    return {
      videoAssetId: video.id,
      playbackUrl: `/api/v1/learning/lessons/${lessonId}/hls/master.m3u8`,
      durationSeconds: video.durationSeconds,
      progress: progressState(video.progress[0]),
      checkpoints: video.checkpoints
        .filter((checkpoint) => isVisibleStudentCheckpoint(checkpoint, video.codeSnapshots))
        .map(mapCheckpoint),
      codeSnapshots: video.codeSnapshots.map(mapSnapshotMetadata),
    };
  }

  async streamHls(
    studentId: string,
    lessonId: string,
    rawFilePath: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const video = await this.repository.findReadyVideoByLessonForStudent(studentId, lessonId);

    if (!video?.masterPlaylistObjectKey) {
      throw videoLearningNotAccessible();
    }

    const filePath = sanitizeHlsPath(rawFilePath);
    const objectKey = `${processedPrefix(video.id)}/${filePath}`;

    await streamHlsObject(this.storage, this.env.MINIO_BUCKET, objectKey, filePath, request, response);
  }

  async getCodeAlong(studentId: string, lessonId: string): Promise<StudentCodeAlongResponse> {
    const lesson = await this.repository.findCodeAlongLessonForStudent(studentId, lessonId);

    if (!lesson?.videoAsset) {
      throw videoLearningNotAccessible();
    }

    const config = lesson.codeAlongConfig;
    const hasInstructorSnapshots = lesson.videoAsset.codeSnapshots.length > 0;
    const mapped = mapCodeAlongConfig(
      {
        enabled: config?.enabled ?? false,
        language: config?.language ?? DEFAULT_CODE_ALONG_LANGUAGE,
        entryFile: config?.entryFile ?? DEFAULT_CODE_ALONG_ENTRY_FILE,
        workspaceType: config?.workspaceType ?? null,
        allowEditFiles: config?.allowEditFiles ?? null,
        allowCreateFiles: config?.allowCreateFiles ?? null,
        allowCreateFolders: config?.allowCreateFolders ?? null,
        allowRenameFiles: config?.allowRenameFiles ?? null,
        allowDeleteFiles: config?.allowDeleteFiles ?? null,
        allowRun: config?.allowRun ?? null,
        allowCheck: config?.allowCheck ?? null,
        allowJudge: config?.allowJudge ?? null,
        defaultPracticeBehavior: config?.defaultPracticeBehavior ?? null,
        defaultVerificationStrategy: config?.defaultVerificationStrategy ?? null,
      },
      hasInstructorSnapshots,
    );

    return {
      ...mapped,
      workspaceId: lesson.workspaces[0]?.id ?? null,
      snapshots: lesson.videoAsset.codeSnapshots.map(mapSnapshotMetadata),
    };
  }

  async upsertCodeAlongConfig(instructorId: string, lessonId: string, input: CodeAlongConfigInput): Promise<CodeAlongConfigResponse> {
    const lesson = await this.repository.findVideoLessonForInstructor(instructorId, lessonId);

    if (!lesson) {
      throw videoLearningNotAccessible();
    }

    validateLanguage(input.language);
    const entryFile = input.entryFile ? validateEntryFile(input.entryFile) : null;

    if (input.allowRun && !supportsRun(input.language, input.workspaceType)) {
      throw codeAlongConfigInvalid('Run capability is not supported for this language or workspace type');
    }

    if (input.allowJudge && !supportsJudge(input.language, true, true)) {
      throw codeAlongConfigInvalid('Judge capability requires a supported language runtime');
    }

    const config = await this.repository.upsertCodeAlongConfig(lesson.id, {
      lessonId: lesson.id,
      enabled: input.enabled,
      language: input.language.toLowerCase(),
      entryFile,
      workspaceType: input.workspaceType,
      allowEditFiles: input.allowEditFiles,
      allowCreateFiles: input.allowCreateFiles,
      allowCreateFolders: input.allowCreateFolders,
      allowRenameFiles: input.allowRenameFiles,
      allowDeleteFiles: input.allowDeleteFiles,
      allowRun: input.allowRun,
      allowCheck: input.allowCheck,
      allowJudge: input.allowJudge,
      defaultPracticeBehavior: input.defaultPracticeBehavior,
      defaultVerificationStrategy: input.defaultVerificationStrategy,
    });

    return mapCodeAlongConfig(config);
  }

  async updateProgress(studentId: string, videoAssetId: string, input: VideoProgressInput): Promise<VideoProgressResponse> {
    const now = new Date();
    let shouldCompleteLesson = false;
    let lessonId = '';

    const progress = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoLearningRepository(transaction);
      const video = await repository.findReadyVideoForStudent(studentId, videoAssetId);

      if (!video?.durationSeconds) {
        throw videoLearningNotAccessible();
      }

      const enrollment = video.lesson.module.course.enrollments[0];

      if (!enrollment) {
        throw videoLearningNotAccessible();
      }

      lessonId = video.lessonId;
      const previousProgress = await repository.findVideoProgress(studentId, video.id);
      const positionSeconds = clampPosition(input.positionSeconds, video.durationSeconds);
      const furthest = Math.max(previousProgress?.furthestPositionSeconds ?? 0, positionSeconds);
      const percent = watchedPercent(furthest, video.durationSeconds);
      const crossesCompletion = percent >= this.env.VIDEO_COMPLETION_THRESHOLD_PERCENT;
      const completedAt = crossesCompletion && !previousProgress?.completedAt ? now : undefined;
      const updated = await repository.upsertVideoProgress({
        studentId,
        videoAssetId: video.id,
        lessonId: video.lessonId,
        positionSeconds,
        watchedPercent: percent,
        ...(completedAt !== undefined ? { completedAt } : {}),
        now,
      });

      if (!previousProgress) {
        await this.createActivityOnce(repository, {
          userId: studentId,
          type: LearningActivityType.VIDEO_STARTED,
          courseId: video.lesson.module.course.id,
          lessonId: video.lessonId,
          enrollmentId: enrollment.id,
          createdAt: now,
        });
        this.logger.info({ studentId, videoAssetId: video.id }, 'video progress initialized');
      }

      if (completedAt) {
        await this.createActivityOnce(repository, {
          userId: studentId,
          type: LearningActivityType.VIDEO_COMPLETED,
          courseId: video.lesson.module.course.id,
          lessonId: video.lessonId,
          enrollmentId: enrollment.id,
          createdAt: now,
        });
        this.logger.info({ studentId, videoAssetId: video.id }, 'video completed');
      }

      shouldCompleteLesson = Boolean(updated?.completedAt) && await this.hasSatisfiedRequiredCheckpoints(repository, studentId, video.id);

      if (!updated) {
        throw videoLearningNotAccessible();
      }

      return updated;
    });

    if (shouldCompleteLesson) {
      await this.learningService.completeLesson(studentId, lessonId);
      this.logger.info({ studentId, videoAssetId, lessonId }, 'lesson completed from video workflow');
    }

    return {
      ...progressState(progress),
      lessonCompleted: shouldCompleteLesson,
    };
  }

  async createCheckpoint(instructorId: string, videoAssetId: string, input: CheckpointInput) {
    const video = await this.repository.findVideoForInstructor(instructorId, videoAssetId);

    if (!video?.durationSeconds) {
      throw videoLearningNotAccessible();
    }

    validateTimestamp(input.timestampSeconds, video.durationSeconds);

    const checkpoint = await this.repository.createCheckpoint({
      videoAssetId: video.id,
      lessonId: video.lessonId,
      timestampSeconds: input.timestampSeconds,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      required: input.required,
      pauseVideo: input.pauseVideo,
      position: input.timestampSeconds,
    });

    return mapInstructorCheckpoint(checkpoint);
  }

  async listCheckpoints(instructorId: string, videoAssetId: string) {
    return (await this.repository.listCheckpointsForInstructor(instructorId, videoAssetId)).map((c) => mapInstructorCheckpoint(c));
  }

  async listLinkablePracticeProblems(instructorId: string) {
    return (await this.repository.listLinkablePracticeProblemsForInstructor(instructorId))
      .map(mapLinkedPracticeProblem)
      .filter((problem): problem is LinkedPracticeProblemSummary => problem !== null);
  }

  async updateCheckpoint(instructorId: string, checkpointId: string, input: CheckpointUpdateInput) {
    const checkpoint = await this.repository.findCheckpointForInstructor(instructorId, checkpointId);

    if (!checkpoint) {
      throw checkpointNotFound();
    }

    if (input.timestampSeconds !== undefined && checkpoint.videoAssetId) {
      const video = await this.repository.findVideoForInstructor(instructorId, checkpoint.videoAssetId);

      if (!video?.durationSeconds) {
        throw videoLearningNotAccessible();
      }

      validateTimestamp(input.timestampSeconds, video.durationSeconds);
    }

    const updated = await this.repository.updateCheckpoint(checkpoint.id, {
      ...(input.timestampSeconds !== undefined ? { timestampSeconds: input.timestampSeconds, position: input.timestampSeconds } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.pauseVideo !== undefined ? { pauseVideo: input.pauseVideo } : {}),
    });

    return mapInstructorCheckpoint(updated);
  }

  async updatePracticeStepConfig(instructorId: string, checkpointId: string, input: PracticeStepConfigInput) {
    const checkpoint = await this.repository.findCheckpointForInstructor(instructorId, checkpointId);

    if (!checkpoint) {
      throw checkpointNotFound();
    }

    const lessonConfig = checkpoint.lesson?.codeAlongConfig;
    const rawSnapshots = checkpoint.videoAsset?.codeSnapshots ?? [];
    const allSnapshots = rawSnapshots.map((s) => ({
      id: s.id,
      timestampSeconds: s.timestampSeconds,
      files: filesFromJson(s),
    }));

    const isManualOverride = input.configMode === 'MANUAL_OVERRIDE'
      || input.overrideVerification !== undefined
      || input.overrideBehavior !== undefined
      || input.practiceProblemId !== undefined
      || (input.practiceVerificationMode !== undefined && input.configMode !== 'AUTO');

    const effectiveVerificationMode = input.overrideVerification ?? input.practiceVerificationMode;
    const effectiveBehavior = input.overrideBehavior ?? input.practiceBehavior;
    const practiceProblem = input.practiceProblemId
      ? await this.repository.findLinkablePracticeProblemForInstructor(instructorId, input.practiceProblemId)
      : null;

    if (input.practiceProblemId && !practiceProblem) {
      throw practiceStepInvalid('Practice problem must be published and owned by this instructor');
    }
    if (practiceProblem && (!practiceProblem.validatedAt || !practiceProblem.validationFingerprint || practiceProblem.status !== PracticeProblemStatus.PUBLISHED)) {
      throw practiceStepInvalid('Practice problem must be validated and published before linking');
    }
    if (practiceProblem && practiceProblem.testCases.length === 0) {
      throw practiceStepInvalid('Practice problem must have at least one public sample test before linking');
    }

    const isPracticeProblemStep = Boolean(practiceProblem);
    const requestedVerificationMode = isPracticeProblemStep ? VideoPracticeVerificationMode.TESTS : effectiveVerificationMode;

    const checkpointOverride = isManualOverride
      ? {
          behavior: effectiveBehavior,
          verificationMode: requestedVerificationMode,
          targetFilePath: isPracticeProblemStep ? null : input.practiceTargetFilePath,
          targetStartLine: isPracticeProblemStep ? null : input.practiceTargetStartLine,
          targetEndLine: isPracticeProblemStep ? null : input.practiceTargetEndLine,
          practiceSnapshotId: isPracticeProblemStep ? null : input.practiceSnapshotId,
          verificationRules: isPracticeProblemStep ? undefined : input.practiceVerificationRules as Record<string, unknown> | undefined,
        }
      : (input.practiceSnapshotId || input.practiceTargetFilePath ? {
          targetFilePath: input.practiceTargetFilePath,
        } : null);

    const hasValidTests = Boolean(checkpoint.codingConfig?.testCases && checkpoint.codingConfig.testCases.length > 0);
    const judgeSupported = hasValidTests || isPracticeProblemStep;

    if (isManualOverride && input.practiceSnapshotId && !allSnapshots.some((snapshot) => snapshot.id === input.practiceSnapshotId)) {
      throw practiceStepInvalid('Reference snapshot must belong to this video lesson');
    }

    const effective = resolveEffectivePracticeConfig({
      lessonDefaults: {
        defaultPracticeBehavior: lessonConfig?.defaultPracticeBehavior ?? VideoPracticeBehavior.REQUIRED,
        defaultVerificationStrategy: lessonConfig?.defaultVerificationStrategy ?? 'AUTO',
        language: lessonConfig?.language ?? DEFAULT_CODE_ALONG_LANGUAGE,
        entryFile: lessonConfig?.entryFile ?? DEFAULT_CODE_ALONG_ENTRY_FILE,
      },
      checkpointOverride,
      checkpointContext: {
        timestampSeconds: checkpoint.timestampSeconds,
        studentTask: checkpoint.description?.trim() ?? '',
        hasValidTests: hasValidTests || isPracticeProblemStep,
        judgeSupported,
        structuralSupported: true,
        activeFilePath: isPracticeProblemStep ? undefined : input.practiceTargetFilePath ?? undefined,
      },
      allSnapshots,
    });

    if (
      input.practiceTargetStartLine !== undefined &&
      input.practiceTargetEndLine !== undefined &&
      input.practiceTargetStartLine !== null &&
      input.practiceTargetEndLine !== null &&
      input.practiceTargetEndLine < input.practiceTargetStartLine
    ) {
      throw practiceStepInvalid('Target end line must be greater than or equal to start line');
    }

    if (input.practiceEnabled === false) {
      const updated = await this.repository.updateCheckpoint(checkpoint.id, {
        practiceEnabled: false,
        practiceConfigMode: 'AUTO',
        practiceVerificationMode: VideoPracticeVerificationMode.NONE,
        practiceBehavior: VideoPracticeBehavior.GUIDED,
        practiceSnapshotId: null,
        practiceProblem: { disconnect: true },
        practiceTargetFilePath: null,
        practiceTargetStartLine: null,
        practiceTargetEndLine: null,
        practiceVerificationRulesJson: Prisma.DbNull,
      });

      if (checkpoint.lessonId) {
        await this.syncWholeLessonWorkspaceConfig(checkpoint.lessonId);
      }

      const refreshedLesson = checkpoint.lessonId
        ? await this.repository.findLessonWithWorkspaceDetails(checkpoint.lessonId)
        : null;
      const currentConfig = refreshedLesson?.codeAlongConfig;

      return mapInstructorCheckpoint(updated, {
        configMode: 'AUTO',
        practiceEnabled: false,
        behavior: VideoPracticeBehavior.GUIDED,
        verificationMode: VideoPracticeVerificationMode.NONE,
        workspaceType: currentConfig?.workspaceType ?? VideoWorkspaceType.SINGLE_FILE,
        capabilities: {
          allowEditFiles: true,
          allowCreateFiles: currentConfig?.allowCreateFiles ?? false,
          allowCreateFolders: currentConfig?.allowCreateFolders ?? false,
          allowRenameFiles: currentConfig?.allowRenameFiles ?? false,
          allowDeleteFiles: currentConfig?.allowDeleteFiles ?? false,
          allowRun: currentConfig?.allowRun ?? true,
          allowCheck: currentConfig?.allowCheck ?? true,
          allowJudge: currentConfig?.allowJudge ?? true,
        },
        targetFiles: [],
        generatedRules: [],
        summary: 'Practice is disabled for this checkpoint.',
        reason: 'Instructor explicitly disabled practice for this checkpoint.',
      });
    }

    // Save-time consistency validation
    if (effective.practiceEnabled && effective.verificationMode !== VideoPracticeVerificationMode.NONE) {
      const consistency = validatePracticeConfigConsistency({
        practiceEnabled: effective.practiceEnabled,
        verificationMode: effective.verificationMode,
        practiceSnapshotId: effective.practiceSnapshotId,
        hasSnapshot: allSnapshots.length > 0,
        hasValidTests: hasValidTests || isPracticeProblemStep,
        targetFilePath: effective.targetFilePath,
      });

      if (!consistency.valid) {
        throw practiceStepInvalid(consistency.error ?? 'Invalid practice configuration');
      }

      if (effective.verificationMode === VideoPracticeVerificationMode.FILE_COMPARE || effective.verificationMode === VideoPracticeVerificationMode.CODE_COMPARE) {
        if (!effective.practiceSnapshotId) {
          throw practiceStepInvalid('File compare practice steps require a valid instructor snapshot reference');
        }
        const snapshot = allSnapshots.find((s) => s.id === effective.practiceSnapshotId);
        if (!snapshot) {
          throw practiceStepInvalid('File compare practice steps require a valid instructor snapshot reference');
        }
        const targetPath = effective.targetFilePath ?? snapshot.files[0]?.path;
        if (!targetPath || !snapshot.files.some((f) => f.path === targetPath)) {
          throw practiceStepInvalid('File compare target file must exist in the selected instructor snapshot');
        }
      }

      if (effective.verificationMode === VideoPracticeVerificationMode.TESTS) {
        if (!hasValidTests && !isPracticeProblemStep) {
          throw practiceStepInvalid('Test verification mode requires valid test cases in the lesson');
        }
        const language = practiceProblem?.language ?? lessonConfig?.language ?? DEFAULT_CODE_ALONG_LANGUAGE;
        if (!supportsJudge(language, true, true)) {
          throw practiceStepInvalid('Test verification is not supported for this language');
        }
      }
    }

    const updated = await this.repository.updateCheckpoint(checkpoint.id, {
      practiceEnabled: input.practiceEnabled ?? effective.practiceEnabled,
      practiceConfigMode: isManualOverride ? 'MANUAL_OVERRIDE' : 'AUTO',
      practiceVerificationMode: isPracticeProblemStep ? VideoPracticeVerificationMode.TESTS : effective.verificationMode,
      practiceBehavior: effective.behavior,
      practiceSnapshotId: isPracticeProblemStep ? null : effective.practiceSnapshotId,
      ...(practiceProblem
        ? { practiceProblem: { connect: { id: practiceProblem.id } } }
        : input.practiceProblemId === null
          ? { practiceProblem: { disconnect: true } }
          : {}),
      practiceTargetFilePath: isPracticeProblemStep ? null : effective.targetFilePath,
      practiceTargetStartLine: isPracticeProblemStep ? null : input.practiceTargetStartLine ?? null,
      practiceTargetEndLine: isPracticeProblemStep ? null : input.practiceTargetEndLine ?? null,
      practiceVerificationRulesJson: !isPracticeProblemStep && effective.generatedRules.length > 0
        ? ({ requiredPaths: effective.targetFiles as string[], rules: effective.generatedRules as object[] } as Prisma.InputJsonValue)
        : Prisma.DbNull,
    });

    if (checkpoint.lessonId) {
      const hasCustomLessonConfig = input.workspaceType || input.allowRun !== undefined || input.allowJudge !== undefined || input.allowCreateFiles !== undefined;
      await this.syncWholeLessonWorkspaceConfig(
        checkpoint.lessonId,
        hasCustomLessonConfig
          ? {
              workspaceType: input.workspaceType ?? undefined,
              allowRun: input.allowRun ?? undefined,
              allowJudge: input.allowJudge ?? undefined,
              allowCreateFiles: input.allowCreateFiles ?? undefined,
              allowCreateFolders: input.allowCreateFolders ?? undefined,
              allowRenameFiles: input.allowRenameFiles ?? undefined,
              allowDeleteFiles: input.allowDeleteFiles ?? undefined,
            }
          : undefined,
      );
    }

    const refreshedLesson = checkpoint.lessonId
      ? await this.repository.findLessonWithWorkspaceDetails(checkpoint.lessonId)
      : null;
    const currentConfig = refreshedLesson?.codeAlongConfig;

    const practiceResponse: InstructorCheckpointPracticeResponse = {
      configMode: isManualOverride ? 'MANUAL_OVERRIDE' : 'AUTO',
      practiceEnabled: updated.practiceEnabled,
      behavior: updated.practiceBehavior,
      verificationMode: updated.practiceVerificationMode,
      workspaceType: currentConfig?.workspaceType ?? VideoWorkspaceType.SINGLE_FILE,
      capabilities: {
        allowEditFiles: true,
        allowCreateFiles: currentConfig?.allowCreateFiles ?? false,
        allowCreateFolders: currentConfig?.allowCreateFolders ?? false,
        allowRenameFiles: currentConfig?.allowRenameFiles ?? false,
        allowDeleteFiles: currentConfig?.allowDeleteFiles ?? false,
        allowRun: currentConfig?.allowRun ?? true,
        allowCheck: currentConfig?.allowCheck ?? true,
        allowJudge: currentConfig?.allowJudge ?? true,
      },
      targetFiles: isPracticeProblemStep ? [] : effective.targetFiles,
      generatedRules: isPracticeProblemStep ? [] : effective.generatedRules,
      summary: isPracticeProblemStep ? `Practice problem linked: ${practiceProblem!.title}` : effective.summary,
      reason: isPracticeProblemStep ? 'This milestone uses the published Practice/Judge infrastructure.' : effective.reason,
    };

    return mapInstructorCheckpoint(updated, practiceResponse);
  }

  async deleteCheckpoint(instructorId: string, checkpointId: string) {
    const checkpoint = await this.repository.findCheckpointForInstructor(instructorId, checkpointId);

    if (!checkpoint) {
      throw checkpointNotFound();
    }

    await this.repository.deleteCheckpoint(checkpoint.id);

    if (checkpoint.lessonId) {
      await this.syncWholeLessonWorkspaceConfig(checkpoint.lessonId);
    }
  }

  async completeCheckpoint(studentId: string, checkpointId: string): Promise<CheckpointCompletionResponse> {
    const now = new Date();
    let shouldCompleteLesson = false;
    let lessonId = '';

    const checkpointProgress = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoLearningRepository(transaction);
      const checkpoint = await repository.findCheckpointForStudent(studentId, checkpointId);

      if (!checkpoint) {
        throw checkpointNotFound();
      }

      if (checkpoint.type !== VideoCheckpointType.INFO) {
        throw checkpointCompletionUnsupported();
      }

      lessonId = checkpoint.lessonId;
      const existing = await repository.findCheckpointProgress(studentId, checkpoint.id);

      await repository.upsertCheckpointCompleted({
        studentId,
        checkpointId: checkpoint.id,
        completedAt: existing?.completedAt ?? now,
      });

      if (existing?.status !== CheckpointProgressStatus.COMPLETED) {
        await repository.createActivity({
          userId: studentId,
          type: LearningActivityType.CHECKPOINT_COMPLETED,
          lessonId: checkpoint.lessonId,
          metadata: { checkpointId: checkpoint.id },
          createdAt: now,
        });
        this.logger.info({ studentId, checkpointId: checkpoint.id }, 'checkpoint completed');
      }

      if (checkpoint.videoAssetId) {
        const progress = await repository.findVideoProgress(studentId, checkpoint.videoAssetId);
        shouldCompleteLesson = Boolean(progress?.completedAt) &&
          await this.hasSatisfiedRequiredCheckpoints(repository, studentId, checkpoint.videoAssetId);
      }

      const updated = await repository.findCheckpointProgress(studentId, checkpoint.id);

      if (!updated) {
        throw checkpointNotFound();
      }

      return updated;
    });

    if (shouldCompleteLesson) {
      await this.learningService.completeLesson(studentId, lessonId);
      this.logger.info({ studentId, checkpointId, lessonId }, 'lesson completed from video workflow');
    }

    return {
      id: checkpointId,
      status: checkpointProgress.status,
      completedAt: checkpointProgress.completedAt?.toISOString() ?? null,
      lessonCompleted: shouldCompleteLesson,
    };
  }

  async listPracticeSteps(studentId: string, lessonId: string) {
    const steps = await this.repository.listPracticeStepsForStudent(studentId, lessonId);
    return { practiceSteps: steps.filter(isActivePracticeMilestone).map(mapPracticeStep) };
  }

  private aiVerificationResponse(input: {
    readonly checkpointId: string;
    readonly progressStatus: CheckpointProgressStatus;
    readonly completedAt: Date | null;
    readonly result: AiCheckpointEvaluationResult;
    readonly attemptId: string | null;
    readonly lessonCompleted: boolean;
    readonly cached?: boolean | undefined;
    readonly stale?: boolean | undefined;
  }): PracticeStepCompletionResponse {
    const status = aiStatusToVerificationStatus(input.result.status);
    return {
      id: input.checkpointId,
      status: input.progressStatus,
      completedAt: input.completedAt?.toISOString() ?? null,
      passed: status === 'PASSED',
      message: status === 'PASSED'
        ? 'Practice step completed'
        : status === 'FAILED'
          ? 'Not complete yet'
          : 'Unable to verify this step right now',
      lessonCompleted: input.lessonCompleted,
      verification: {
        status,
        verificationMode: VideoPracticeVerificationMode.AI_SEMANTIC,
        details: [input.result.explanation],
        summary: input.result.explanation,
        guidance: input.result.guidance,
        requirements: input.result.requirements,
        providerErrorCode: input.result.providerErrorCode ?? null,
        attemptId: input.attemptId,
        cached: input.cached ?? false,
        stale: input.stale ?? false,
      },
    };
  }

  private async buildAiEvaluationContext(studentId: string, checkpointId: string, workspaceId: string): Promise<AiEvaluationContext | null> {
    const checkpoint = await this.repository.findPracticeStepForStudent(studentId, checkpointId);

    if (!checkpoint || !isActivePracticeMilestone(checkpoint)) {
      throw practiceStepNotFound();
    }

    if (!checkpoint.practiceSnapshotId || !checkpoint.videoAssetId) {
      return null;
    }

    const [lesson, workspace] = await Promise.all([
      this.repository.findCodeAlongContextForStudent(studentId, checkpoint.lessonId),
      this.repository.findLessonWorkspaceForStudent(studentId, checkpoint.lessonId, workspaceId),
    ]);

    if (!lesson?.videoAsset || !workspace) {
      return null;
    }

    const snapshots = lesson.videoAsset.codeSnapshots.filter((snapshot) =>
      snapshot.lessonId === checkpoint.lessonId &&
      snapshot.videoAssetId === checkpoint.videoAssetId,
    );
    const currentIndex = snapshots.findIndex((snapshot) => snapshot.id === checkpoint.practiceSnapshotId);

    if (currentIndex < 0) {
      return null;
    }

    const currentSnapshot = snapshots[currentIndex]!;
    const previousSnapshot = currentIndex > 0 ? snapshots[currentIndex - 1]! : null;
    const previousFiles = previousSnapshot ? filesFromJson(previousSnapshot) : [];
    const currentFiles = filesFromJson(currentSnapshot);
    const studentFiles = workspace.files.map((file) => ({ path: file.path, content: file.content }));
    const language = lesson.codeAlongConfig?.language ?? currentSnapshot.language ?? workspace.language;
    const entryFile = lesson.codeAlongConfig?.entryFile ?? workspace.entryFile ?? DEFAULT_CODE_ALONG_ENTRY_FILE;
    const workspaceType = lesson.codeAlongConfig?.workspaceType ?? VideoWorkspaceType.SINGLE_FILE;
    const selected = selectAiRelevantFiles({
      previousFiles,
      currentFiles,
      studentFiles,
      targetFilePath: checkpoint.practiceTargetFilePath,
      entryFile,
    });

    const evaluationInput: AiCheckpointEvaluationInput = {
      language,
      workspaceType,
      entryFile,
      checkpoint: {
        id: checkpoint.id,
        title: checkpoint.title,
        description: checkpoint.description,
        timestampSeconds: checkpoint.timestampSeconds,
      },
      previousInstructorSnapshot: previousSnapshot
        ? {
            id: previousSnapshot.id,
            title: previousSnapshot.title,
            timestampSeconds: previousSnapshot.timestampSeconds,
            files: selected.previousFiles,
          }
        : null,
      currentInstructorSnapshot: {
        id: currentSnapshot.id,
        title: currentSnapshot.title,
        timestampSeconds: currentSnapshot.timestampSeconds,
        files: selected.currentFiles,
      },
      studentWorkspace: {
        id: workspace.id,
        files: selected.studentFiles,
      },
    };

    const instructorFingerprint = sha256({
      evaluatorVersion: AI_VIDEO_CHECKPOINT_EVALUATOR_VERSION,
      checkpointId: checkpoint.id,
      currentSnapshotId: currentSnapshot.id,
      currentSnapshotUpdatedAt: currentSnapshot.updatedAt.toISOString(),
      previousSnapshotId: previousSnapshot?.id ?? null,
      previousSnapshotUpdatedAt: previousSnapshot?.updatedAt.toISOString() ?? null,
      selectedPaths: selected.paths,
      verificationMode: VideoPracticeVerificationMode.AI_SEMANTIC,
    });

    return {
      checkpoint,
      workspace: {
        id: workspace.id,
        language: workspace.language,
        entryFile: workspace.entryFile,
        files: studentFiles,
      },
      language,
      workspaceType,
      entryFile,
      currentSnapshot,
      previousSnapshot,
      evaluationInput,
      instructorFingerprint,
      inputFingerprint: sha256({
        instructorFingerprint,
        studentWorkspaceUpdatedAt: workspace.updatedAt.toISOString(),
        studentFiles: selected.studentFiles,
        promptVersion: AI_VIDEO_CHECKPOINT_EVALUATOR_VERSION,
      }),
    };
  }

  private async completeAiPracticeStep(studentId: string, checkpointId: string, input: PracticeStepCompleteInput): Promise<PracticeStepCompletionResponse> {
    if (!input.workspaceId) {
      return this.aiVerificationResponse({
        checkpointId,
        progressStatus: CheckpointProgressStatus.NOT_STARTED,
        completedAt: null,
        result: {
          status: 'CANNOT_VERIFY',
          explanation: 'Your workspace could not be loaded. Please try again.',
          guidance: 'Open the lesson workspace and retry Check.',
          requirements: [],
          model: this.aiEvaluator.model,
          providerErrorCode: 'WORKSPACE_REQUIRED',
        },
        attemptId: null,
        lessonCompleted: false,
      });
    }

    const context = await this.buildAiEvaluationContext(studentId, checkpointId, input.workspaceId);

    if (!context) {
      return this.aiVerificationResponse({
        checkpointId,
        progressStatus: CheckpointProgressStatus.NOT_STARTED,
        completedAt: null,
        result: {
          status: 'CANNOT_VERIFY',
          explanation: 'The instructor code or your workspace could not be loaded for this milestone.',
          guidance: 'Refresh the lesson and retry Check.',
          requirements: [],
          model: this.aiEvaluator.model,
          providerErrorCode: 'AI_INPUT_CONTEXT_UNAVAILABLE',
        },
        attemptId: null,
        lessonCompleted: false,
      });
    }

    if (bytesOf(context.evaluationInput) > (this.env.AI_VERIFICATION_MAX_INPUT_BYTES ?? DEFAULT_AI_VERIFICATION_MAX_INPUT_BYTES)) {
      const attempt = await this.repository.createAiVerificationAttempt({
        studentId,
        lessonId: context.checkpoint.lessonId,
        checkpointId: context.checkpoint.id,
        workspaceId: context.workspace.id,
        currentSnapshotId: context.currentSnapshot.id,
        previousSnapshotId: context.previousSnapshot?.id ?? null,
        evaluatorType: this.aiEvaluator.evaluatorType,
        evaluatorModel: this.aiEvaluator.model,
        evaluatorVersion: this.aiEvaluator.evaluatorVersion,
        inputFingerprint: context.inputFingerprint,
        instructorFingerprint: context.instructorFingerprint,
        status: 'CANNOT_VERIFY',
        feedback: 'This workspace is too large for safe AI verification.',
        guidance: 'Ask the instructor to narrow this milestone or reduce unrelated files.',
        requirementsJson: [],
        providerErrorCode: 'AI_INPUT_TOO_LARGE',
        completedAt: new Date(),
      });

      return this.aiVerificationResponse({
        checkpointId,
        progressStatus: CheckpointProgressStatus.NOT_STARTED,
        completedAt: null,
        result: {
          status: 'CANNOT_VERIFY',
          explanation: attempt.feedback,
          guidance: attempt.guidance,
          requirements: [],
          model: this.aiEvaluator.model,
          providerErrorCode: 'AI_INPUT_TOO_LARGE',
        },
        attemptId: attempt.id,
        lessonCompleted: false,
      });
    }

    const cached = await this.repository.findReusableAiVerificationAttempt({
      studentId,
      checkpointId: context.checkpoint.id,
      workspaceId: context.workspace.id,
      inputFingerprint: context.inputFingerprint,
      evaluatorVersion: this.aiEvaluator.evaluatorVersion,
    });

    if (cached) {
      return this.applyAiVerificationResult(studentId, context, {
        status: cached.status === 'PASS' ? 'PASS' : cached.status === 'NEEDS_FIX' ? 'NEEDS_FIX' : 'CANNOT_VERIFY',
        explanation: cached.feedback,
        guidance: cached.guidance,
        requirements: requirementsFromJson(cached.requirementsJson),
        model: cached.evaluatorModel,
      }, cached.id, true);
    }

    const inFlightKey = `${studentId}:${context.checkpoint.id}:${context.workspace.id}:${context.inputFingerprint}`;
    const existing = this.aiInFlight.get(inFlightKey);

    if (existing) {
      return existing;
    }

    const cooldownKey = `${studentId}:${context.checkpoint.id}:${context.workspace.id}`;
    const nowMs = Date.now();
    const lastAttemptAt = this.aiLastAttemptAt.get(cooldownKey) ?? 0;
    const cooldownMs = this.env.AI_VERIFICATION_COOLDOWN_MS ?? DEFAULT_AI_VERIFICATION_COOLDOWN_MS;
    if (cooldownMs > 0 && nowMs - lastAttemptAt < cooldownMs) {
      return this.aiVerificationResponse({
        checkpointId,
        progressStatus: CheckpointProgressStatus.NOT_STARTED,
        completedAt: null,
        result: {
          status: 'CANNOT_VERIFY',
          explanation: 'Please wait a moment before checking this milestone again.',
          guidance: 'Retry Check in a few seconds.',
          requirements: [],
          model: this.aiEvaluator.model,
          providerErrorCode: 'AI_RATE_LIMITED',
        },
        attemptId: null,
        lessonCompleted: false,
      });
    }
    this.aiLastAttemptAt.set(cooldownKey, nowMs);

    const pending = (async () => {
      const evaluated = await this.aiEvaluator.evaluate(context.evaluationInput);
      const freshContext = await this.buildAiEvaluationContext(studentId, checkpointId, context.workspace.id);
      const stale = !freshContext || freshContext.inputFingerprint !== context.inputFingerprint;
      const result = stale
        ? {
            status: 'CANNOT_VERIFY' as const,
            explanation: AI_SEMANTIC_STALE_MESSAGE,
            guidance: 'Retry Check using the latest code in your workspace.',
            requirements: [],
            model: evaluated.model,
            providerErrorCode: 'AI_RESULT_STALE',
          }
        : evaluated;

      const attempt = await this.repository.createAiVerificationAttempt({
        studentId,
        lessonId: context.checkpoint.lessonId,
        checkpointId: context.checkpoint.id,
        workspaceId: context.workspace.id,
        currentSnapshotId: context.currentSnapshot.id,
        previousSnapshotId: context.previousSnapshot?.id ?? null,
        evaluatorType: this.aiEvaluator.evaluatorType,
        evaluatorModel: result.model,
        evaluatorVersion: this.aiEvaluator.evaluatorVersion,
        inputFingerprint: context.inputFingerprint,
        instructorFingerprint: context.instructorFingerprint,
        status: result.status,
        feedback: result.explanation,
        guidance: result.guidance,
        requirementsJson: result.requirements as unknown as Prisma.InputJsonValue,
        providerErrorCode: result.providerErrorCode ?? null,
        completedAt: new Date(),
      });

      if (result.providerErrorCode) {
        this.logger.warn({
          attemptId: attempt.id,
          checkpointId: context.checkpoint.id,
          workspaceId: context.workspace.id,
          provider: this.aiEvaluator.evaluatorType,
          model: result.model,
          status: result.status,
          providerErrorCode: result.providerErrorCode,
        }, 'ai verification attempt completed with provider issue');
      }

      return this.applyAiVerificationResult(studentId, context, result, attempt.id, false, stale);
    })().finally(() => {
      this.aiInFlight.delete(inFlightKey);
    });

    this.aiInFlight.set(inFlightKey, pending);
    return pending;
  }

  private async applyAiVerificationResult(
    studentId: string,
    context: AiEvaluationContext,
    result: AiCheckpointEvaluationResult,
    attemptId: string,
    cached: boolean,
    stale = false,
  ): Promise<PracticeStepCompletionResponse> {
    let shouldCompleteLesson = false;
    let progressStatus: CheckpointProgressStatus = CheckpointProgressStatus.NOT_STARTED;
    let completedAt: Date | null = null;

    if (result.status === 'PASS' && !stale) {
      const now = new Date();
      const fresh = await this.buildAiEvaluationContext(studentId, context.checkpoint.id, context.workspace.id);

      if (!fresh || fresh.inputFingerprint !== context.inputFingerprint) {
        return this.aiVerificationResponse({
          checkpointId: context.checkpoint.id,
          progressStatus,
          completedAt,
          result: {
            status: 'CANNOT_VERIFY',
            explanation: AI_SEMANTIC_STALE_MESSAGE,
            guidance: 'Retry Check using the latest code in your workspace.',
            requirements: [],
            model: result.model,
            providerErrorCode: 'AI_RESULT_STALE',
          },
          attemptId,
          lessonCompleted: false,
          cached,
          stale: true,
        });
      }

      const updated = await this.prisma.$transaction(async (transaction) => {
        const repository = new VideoLearningRepository(transaction);
        const existing = await repository.findCheckpointProgress(studentId, context.checkpoint.id);
        await repository.upsertCheckpointCompleted({
          studentId,
          checkpointId: context.checkpoint.id,
          completedAt: existing?.completedAt ?? now,
        });

        if (context.checkpoint.videoAssetId) {
          const progress = await repository.findVideoProgress(studentId, context.checkpoint.videoAssetId);
          shouldCompleteLesson = Boolean(progress?.completedAt) &&
            await this.hasSatisfiedRequiredCheckpoints(repository, studentId, context.checkpoint.videoAssetId);
        }

        return repository.findCheckpointProgress(studentId, context.checkpoint.id);
      });

      progressStatus = updated?.status ?? CheckpointProgressStatus.NOT_STARTED;
      completedAt = updated?.completedAt ?? null;

      if (shouldCompleteLesson) {
        await this.learningService.completeLesson(studentId, context.checkpoint.lessonId);
      }
    } else {
      const existing = await this.repository.findCheckpointProgress(studentId, context.checkpoint.id);
      progressStatus = existing?.status ?? CheckpointProgressStatus.NOT_STARTED;
      completedAt = existing?.completedAt ?? null;
    }

    return this.aiVerificationResponse({
      checkpointId: context.checkpoint.id,
      progressStatus,
      completedAt,
      result,
      attemptId,
      lessonCompleted: result.status === 'PASS' ? shouldCompleteLesson : false,
      cached,
      stale,
    });
  }

  async completePracticeStep(studentId: string, checkpointId: string, input: PracticeStepCompleteInput): Promise<PracticeStepCompletionResponse> {
    const probe = await this.repository.findPracticeStepForStudent(studentId, checkpointId);

    if (!probe || !isActivePracticeMilestone(probe)) {
      throw practiceStepNotFound();
    }

    if (effectiveRuntimeVerificationMode(probe) === VideoPracticeVerificationMode.AI_SEMANTIC) {
      return this.completeAiPracticeStep(studentId, checkpointId, input);
    }

    const now = new Date();
    let shouldCompleteLesson = false;
    let lessonId = '';

    const result = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoLearningRepository(transaction);
      const checkpoint = await repository.findPracticeStepForStudent(studentId, checkpointId);

      if (!checkpoint) {
        throw practiceStepNotFound();
      }

      if (!isActivePracticeMilestone(checkpoint)) {
        throw practiceStepNotFound();
      }

      lessonId = checkpoint.lessonId;
      const mode = effectiveRuntimeVerificationMode(checkpoint);
      let verification: VerificationResult;

      if (mode === VideoPracticeVerificationMode.NONE) {
        verification = passed(['Student confirmed completion']);
      } else if (mode === VideoPracticeVerificationMode.FILE_COMPARE) {
        if (!input.workspaceId) {
          verification = unavailable(['Your workspace could not be loaded. Please try again.']);
        } else if (!checkpoint.practiceSnapshotId) {
          verification = unavailable(['The instructor code for this milestone could not be found.']);
        } else {
          const [workspace, snapshot] = await Promise.all([
            repository.findLessonWorkspaceForStudent(studentId, checkpoint.lessonId, input.workspaceId),
            repository.findSnapshotForStudent(studentId, checkpoint.practiceSnapshotId),
          ]);

          if (!workspace) {
            verification = unavailable(['Your workspace could not be loaded. Please try again.']);
          } else if (!snapshot) {
            verification = unavailable(['The instructor code for this milestone could not be found.']);
          } else {
            const snapshotFiles = filesFromJson(snapshot);
            const targetPath = checkpoint.practiceTargetFilePath ?? snapshotFiles[0]?.path;

            if (!targetPath) {
              verification = unavailable(['The reference file for this milestone could not be determined.']);
            } else {
              const studentFile = workspace.files.find((file) => file.path === targetPath);
              const instructorFile = snapshotFiles.find((file) => file.path === targetPath);

              if (!instructorFile) {
                verification = unavailable([`The reference file ${targetPath} is missing from this milestone.`]);
              } else if (!studentFile) {
                verification = unavailable([`Your workspace is missing ${targetPath}.`]);
              } else {
                const studentCode = normalizeCompareCode(sliceLineRange(studentFile.content, checkpoint.practiceTargetStartLine, checkpoint.practiceTargetEndLine));
                const instructorCode = normalizeCompareCode(sliceLineRange(instructorFile.content, checkpoint.practiceTargetStartLine, checkpoint.practiceTargetEndLine));
                verification = studentCode === instructorCode
                  ? passed([`${targetPath} matches the reference`])
                  : failed([`${targetPath} does not match the reference yet`]);
              }
            }
          }
        }
      } else if (mode === VideoPracticeVerificationMode.STRUCTURAL || mode === VideoPracticeVerificationMode.WORKSPACE_STRUCTURE) {
        if (!input.workspaceId) {
          verification = unavailable(['Workspace is required for this check']);
        } else {
          const workspace = await repository.findLessonWorkspaceForStudent(studentId, checkpoint.lessonId, input.workspaceId);
          verification = workspace
            ? evaluateStructuralRules(workspace.files, checkpoint.practiceTargetFilePath, checkpoint.practiceVerificationRulesJson)
            : unavailable(['Workspace is unavailable']);
        }
      } else if (mode === VideoPracticeVerificationMode.TESTS) {
        if (!input.workspaceId || !input.submissionId) {
          verification = unavailable(['Submit to Judge before checking this step']);
        } else {
          const submission = checkpoint.practiceProblemId
            ? await repository.findJudgeSubmissionForPracticeProblemStep({
                studentId,
                checkpointId: checkpoint.id,
                workspaceId: input.workspaceId,
                submissionId: input.submissionId,
                practiceProblemId: checkpoint.practiceProblemId,
              })
            : await repository.findJudgeSubmissionForPracticeStep(studentId, checkpoint.id, input.workspaceId, input.submissionId);
          if (!submission) {
            verification = unavailable(['Judge submission is unavailable for this practice step']);
          } else if (submission.status === JudgeSubmissionStatus.QUEUED || submission.status === JudgeSubmissionStatus.RUNNING) {
            verification = unavailable(['Judge submission is still running']);
          } else if (submission.status === JudgeSubmissionStatus.ACCEPTED && submission.passed === true) {
            verification = passed(['Judge submission passed']);
          } else {
            verification = failed([`Judge submission did not pass (${submission.status})`]);
          }
        }
      } else {
        verification = unavailable(['Unsupported practice verification mode']);
      }

      const existing = await repository.findCheckpointProgress(studentId, checkpoint.id);
      if (verification.status !== 'PASSED') {
        return {
          checkpoint,
          mode,
          progress: existing,
          verification,
        };
      }

      await repository.upsertCheckpointCompleted({
        studentId,
        checkpointId: checkpoint.id,
        completedAt: existing?.completedAt ?? now,
      });

      if (checkpoint.videoAssetId) {
        const progress = await repository.findVideoProgress(studentId, checkpoint.videoAssetId);
        shouldCompleteLesson = Boolean(progress?.completedAt) &&
          await this.hasSatisfiedRequiredCheckpoints(repository, studentId, checkpoint.videoAssetId);
      }

      const updated = await repository.findCheckpointProgress(studentId, checkpoint.id);

      if (!updated) {
        throw practiceStepNotFound();
      }

      return {
        checkpoint,
        mode,
        progress: updated,
        verification,
      };
    });

    if (shouldCompleteLesson) {
      await this.learningService.completeLesson(studentId, lessonId);
    }

    const progressStatus = result.progress?.status ?? CheckpointProgressStatus.NOT_STARTED;
    const completedAt = result.progress?.completedAt ?? null;

    return {
      id: checkpointId,
      status: progressStatus,
      completedAt: completedAt?.toISOString() ?? null,
      passed: result.verification.status === 'PASSED',
      message: result.verification.status === 'PASSED'
        ? 'Practice step completed'
        : result.verification.status === 'FAILED'
          ? 'Not complete yet'
          : 'Unable to verify this step right now',
      lessonCompleted: result.verification.status === 'PASSED' ? shouldCompleteLesson : false,
      verification: {
        status: result.verification.status,
        verificationMode: result.checkpoint.practiceVerificationMode,
        details: result.verification.details,
      },
    };
  }

  async skipPracticeStep(studentId: string, checkpointId: string) {
    const now = new Date();
    const checkpoint = await this.repository.findPracticeStepForStudent(studentId, checkpointId);

    if (!checkpoint) {
      throw practiceStepNotFound();
    }

    if (!isActivePracticeMilestone(checkpoint)) {
      throw practiceStepNotFound();
    }

    if (checkpoint.practiceBehavior === VideoPracticeBehavior.REQUIRED || checkpoint.required) {
      throw practiceStepRequired();
    }

    await this.repository.upsertCheckpointSkipped({ studentId, checkpointId: checkpoint.id, skippedAt: now });
    const progress = await this.repository.findCheckpointProgress(studentId, checkpoint.id);

    return {
      id: checkpointId,
      status: progress?.status ?? CheckpointProgressStatus.SKIPPED,
      completedAt: null,
      passed: false,
      message: 'Practice step skipped',
      lessonCompleted: false,
    };
  }

  async createSnapshot(instructorId: string, videoAssetId: string, input: CodeSnapshotInput) {
    const video = await this.repository.findVideoForInstructor(instructorId, videoAssetId);

    if (!video?.durationSeconds) {
      throw videoLearningNotAccessible();
    }

    validateSnapshotTimestamp(input.timestampSeconds, video.durationSeconds);
    validateFiles(input, this.env);
    validateLanguage(input.language);

    const snapshot = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoLearningRepository(transaction);
      const created = await repository.createSnapshot({
        videoAssetId: video.id,
        lessonId: video.lessonId,
        timestampSeconds: input.timestampSeconds,
        title: input.title ?? null,
        language: input.language.toLowerCase(),
        filesJson: { files: input.files } as Prisma.InputJsonValue,
        createdByUserId: instructorId,
      });

      await this.ensureMilestoneCheckpoint(created, repository);
      return created;
    });

    if (video.lessonId) {
      await this.syncWholeLessonWorkspaceConfig(video.lessonId);
    }

    return this.mapSnapshot(snapshot);
  }

  async listSnapshots(instructorId: string, videoAssetId: string) {
    return (await this.repository.listSnapshotsForInstructor(instructorId, videoAssetId)).map(this.mapSnapshot);
  }

  async updateSnapshot(instructorId: string, snapshotId: string, input: CodeSnapshotUpdateInput) {
    const snapshot = await this.repository.findSnapshotForInstructor(instructorId, snapshotId);

    if (!snapshot) {
      throw codeSnapshotNotFound();
    }

    if (input.timestampSeconds !== undefined) {
      const video = await this.repository.findVideoForInstructor(instructorId, snapshot.videoAssetId);

      if (!video?.durationSeconds) {
        throw videoLearningNotAccessible();
      }

      validateSnapshotTimestamp(input.timestampSeconds, video.durationSeconds);
    }

    validateFiles(input, this.env);

    if (input.language !== undefined) {
      validateLanguage(input.language);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoLearningRepository(transaction);
      const updatedSnapshot = await repository.updateSnapshot(snapshot.id, {
        ...(input.timestampSeconds !== undefined ? { timestampSeconds: input.timestampSeconds } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.language !== undefined ? { language: input.language.toLowerCase() } : {}),
        ...(input.files !== undefined ? { filesJson: { files: input.files } as Prisma.InputJsonValue } : {}),
      });

      await this.ensureMilestoneCheckpoint(updatedSnapshot, repository);
      return updatedSnapshot;
    });

    if (snapshot.lessonId) {
      await this.syncWholeLessonWorkspaceConfig(snapshot.lessonId);
    }

    return this.mapSnapshot(updated);
  }

  async deleteSnapshot(instructorId: string, snapshotId: string) {
    const snapshot = await this.repository.findSnapshotForInstructor(instructorId, snapshotId);

    if (!snapshot) {
      throw codeSnapshotNotFound();
    }

    await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoLearningRepository(transaction);
      await repository.deleteOrDeactivateCheckpointForSnapshot(snapshot.id);
      await repository.deleteSnapshot(snapshot.id);
    });

    if (snapshot.lessonId) {
      await this.syncWholeLessonWorkspaceConfig(snapshot.lessonId);
    }
  }

  async getSnapshotForStudent(studentId: string, snapshotId: string) {
    const snapshot = await this.repository.findSnapshotForStudent(studentId, snapshotId);

    if (!snapshot) {
      throw codeSnapshotNotFound();
    }

    return this.mapSnapshot(snapshot);
  }

  private async ensureMilestoneCheckpoint(snapshot: CodeSnapshot, repository: VideoLearningRepository = this.repository) {
    const lesson = await repository.findLessonWithWorkspaceDetails(snapshot.lessonId);
    const files = filesFromJson(snapshot);
    const targetFilePath = files[0]?.path ?? lesson?.codeAlongConfig?.entryFile ?? DEFAULT_CODE_ALONG_ENTRY_FILE;
    const effective = resolveEffectivePracticeConfig({
      lessonDefaults: {
        defaultPracticeBehavior: lesson?.codeAlongConfig?.defaultPracticeBehavior ?? VideoPracticeBehavior.REQUIRED,
        defaultVerificationStrategy: lesson?.codeAlongConfig?.defaultVerificationStrategy ?? 'AUTO',
        language: lesson?.codeAlongConfig?.language ?? snapshot.language ?? DEFAULT_CODE_ALONG_LANGUAGE,
        entryFile: lesson?.codeAlongConfig?.entryFile ?? DEFAULT_CODE_ALONG_ENTRY_FILE,
      },
      checkpointOverride: {
        targetFilePath,
      },
      checkpointContext: {
        timestampSeconds: snapshot.timestampSeconds,
        studentTask: '',
        structuralSupported: true,
        activeFilePath: targetFilePath,
      },
      milestoneSnapshot: {
        id: snapshot.id,
        timestampSeconds: snapshot.timestampSeconds,
        files,
      },
      allSnapshots: [{
        id: snapshot.id,
        timestampSeconds: snapshot.timestampSeconds,
        files,
      }],
    });

    const existing = await repository.findCheckpointForSnapshot(snapshot.id);

    const data = {
      timestampSeconds: snapshot.timestampSeconds,
      title: snapshot.title ?? `Milestone at ${formatTimestampLabel(snapshot.timestampSeconds)}`,
      required: effective.behavior === VideoPracticeBehavior.REQUIRED,
      pauseVideo: false,
      practiceEnabled: true,
      practiceConfigMode: 'AUTO',
      practiceVerificationMode: effective.verificationMode,
      practiceBehavior: effective.behavior,
      practiceSnapshotId: effective.practiceSnapshotId,
      practiceTargetFilePath: effective.targetFilePath,
      practiceTargetStartLine: effective.targetStartLine,
      practiceTargetEndLine: effective.targetEndLine,
      practiceVerificationRulesJson: effective.generatedRules.length > 0
        ? ({ requiredPaths: effective.targetFiles as string[], rules: effective.generatedRules as object[] } as Prisma.InputJsonValue)
        : Prisma.DbNull,
      position: snapshot.timestampSeconds,
    } satisfies Prisma.VideoCheckpointUpdateInput;

    if (existing) {
      await repository.updateCheckpoint(existing.id, data);
      return;
    }

    await repository.createCheckpoint({
      lessonId: snapshot.lessonId,
      videoAssetId: snapshot.videoAssetId,
      timestampSeconds: snapshot.timestampSeconds,
      type: VideoCheckpointType.INFO,
      title: snapshot.title ?? `Milestone at ${formatTimestampLabel(snapshot.timestampSeconds)}`,
      description: null,
      required: effective.behavior === VideoPracticeBehavior.REQUIRED,
      pauseVideo: false,
      practiceEnabled: true,
      practiceConfigMode: 'AUTO',
      practiceVerificationMode: effective.verificationMode,
      practiceBehavior: effective.behavior,
      practiceSnapshotId: effective.practiceSnapshotId,
      practiceTargetFilePath: effective.targetFilePath,
      practiceTargetStartLine: effective.targetStartLine,
      practiceTargetEndLine: effective.targetEndLine,
      practiceVerificationRulesJson: effective.generatedRules.length > 0
        ? ({ requiredPaths: effective.targetFiles as string[], rules: effective.generatedRules as object[] } as Prisma.InputJsonValue)
        : Prisma.DbNull,
      position: snapshot.timestampSeconds,
    });
  }

  private async syncWholeLessonWorkspaceConfig(
    lessonId: string,
    manualOverride?: {
      readonly workspaceType?: VideoWorkspaceType | undefined;
      readonly allowRun?: boolean | undefined;
      readonly allowJudge?: boolean | undefined;
      readonly allowCreateFiles?: boolean | undefined;
      readonly allowCreateFolders?: boolean | undefined;
      readonly allowRenameFiles?: boolean | undefined;
      readonly allowDeleteFiles?: boolean | undefined;
    } | undefined,
  ) {
    const lesson = await this.repository.findLessonWithWorkspaceDetails(lessonId);
    if (!lesson) {
      return;
    }

    const snapshots = (lesson.videoAsset?.codeSnapshots ?? []).map((snapshot) => ({
      files: filesFromJson(snapshot),
    }));

    const snapshotRefs = lesson.videoAsset?.codeSnapshots ?? [];
    const practiceSteps = (lesson.videoAsset?.checkpoints ?? [])
      .filter((checkpoint) => !checkpoint.practiceEnabled || hasMatchingPracticeSnapshot(checkpoint, snapshotRefs))
      .map((checkpoint) => ({
        practiceEnabled: checkpoint.practiceEnabled,
        verificationMode: checkpoint.practiceVerificationMode,
        targetFiles: checkpoint.practiceTargetFilePath ? [checkpoint.practiceTargetFilePath] : [],
      }));

    const language = lesson.codeAlongConfig?.language
      ?? lesson.videoAsset?.codeSnapshots?.[0]?.language
      ?? DEFAULT_CODE_ALONG_LANGUAGE;
    const entryFile = lesson.codeAlongConfig?.entryFile ?? DEFAULT_CODE_ALONG_ENTRY_FILE;

    const resolution = resolveLessonWorkspaceConfig({
      language,
      entryFile,
      practiceSteps,
      snapshots,
      ...(manualOverride ? {
        manualOverride: {
          workspaceType: manualOverride.workspaceType,
          capabilities: {
            allowRun: manualOverride.allowRun,
            allowJudge: manualOverride.allowJudge,
            allowCreateFiles: manualOverride.allowCreateFiles,
            allowCreateFolders: manualOverride.allowCreateFolders,
            allowRenameFiles: manualOverride.allowRenameFiles,
            allowDeleteFiles: manualOverride.allowDeleteFiles,
          },
        },
      } : {}),
    });

    await this.repository.upsertCodeAlongConfig(lessonId, {
      lessonId,
      enabled: true,
      language,
      entryFile,
      workspaceType: resolution.workspaceType as VideoWorkspaceType,
      allowEditFiles: true,
      allowCreateFiles: resolution.capabilities.allowCreateFiles,
      allowCreateFolders: resolution.capabilities.allowCreateFolders,
      allowRenameFiles: resolution.capabilities.allowRenameFiles,
      allowDeleteFiles: resolution.capabilities.allowDeleteFiles,
      allowRun: resolution.capabilities.allowRun,
      allowCheck: resolution.capabilities.allowCheck,
      allowJudge: resolution.capabilities.allowJudge,
    });
  }

  private mapSnapshot(snapshot: CodeSnapshot): CodeSnapshotResponse {
    return {
      videoAssetId: snapshot.videoAssetId,
      lessonId: snapshot.lessonId,
      ...mapSnapshotMetadata(snapshot),
      files: filesFromJson(snapshot),
    };
  }

  private async hasSatisfiedRequiredCheckpoints(
    repository: VideoLearningRepository,
    studentId: string,
    videoAssetId: string,
  ) {
    const checkpoints = await repository.listRequiredCheckpointsForCompletion(studentId, videoAssetId);
    const required = checkpoints.filter((checkpoint) =>
      !checkpoint.practiceEnabled || isActivePracticeMilestone(checkpoint),
    ).length;
    const completed = checkpoints.filter((checkpoint) =>
      (!checkpoint.practiceEnabled || isActivePracticeMilestone(checkpoint)) &&
      checkpoint.progress[0]?.status === CheckpointProgressStatus.COMPLETED,
    ).length;

    return completed >= required;
  }

  private async createActivityOnce(repository: VideoLearningRepository, input: {
    readonly userId: string;
    readonly type: LearningActivityType;
    readonly courseId?: string;
    readonly lessonId?: string;
    readonly enrollmentId?: string;
    readonly metadata?: Prisma.InputJsonValue;
    readonly createdAt: Date;
  }) {
    const existing = await repository.findActivity(input);

    if (existing) {
      return;
    }

    await repository.createActivity(input);
  }
}
