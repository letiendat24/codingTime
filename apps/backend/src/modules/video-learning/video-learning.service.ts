import type { Client as MinioClient } from 'minio';
import type { Request, Response } from 'express';
import {
  CheckpointProgressStatus,
  LearningActivityType,
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
import type { Env } from '../../config';
import type { AppLogger } from '../../shared/logger';
import type { LearningService } from '../learning/learning.service';
import { processedPrefix } from '../videos/video.constants';
import { sanitizeHlsPath, streamHlsObject } from '../videos/video-stream.helper';
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
  InteractiveVideoPlaybackResponse,
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

function mapCheckpoint(checkpoint: VideoCheckpoint & { progress?: readonly { status: CheckpointProgressStatus }[] }): StudentCheckpoint {
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
    practiceVerificationMode: checkpoint.practiceVerificationMode,
    practiceBehavior: checkpoint.practiceBehavior,
    practiceSnapshotId: checkpoint.practiceSnapshotId,
    practiceTargetFilePath: checkpoint.practiceTargetFilePath,
    practiceTargetStartLine: checkpoint.practiceTargetStartLine,
    practiceTargetEndLine: checkpoint.practiceTargetEndLine,
  };
}

function mapInstructorCheckpoint(checkpoint: VideoCheckpoint): InstructorCheckpointResponse {
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
    practiceVerificationMode: checkpoint.practiceVerificationMode,
    practiceBehavior: checkpoint.practiceBehavior,
    practiceSnapshotId: checkpoint.practiceSnapshotId,
    practiceTargetFilePath: checkpoint.practiceTargetFilePath,
    practiceTargetStartLine: checkpoint.practiceTargetStartLine,
    practiceTargetEndLine: checkpoint.practiceTargetEndLine,
  };
}

function mapPracticeStep(checkpoint: VideoCheckpoint & { progress?: readonly { status: CheckpointProgressStatus }[] }): PracticeStepResponse {
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
    targetFilePath: checkpoint.practiceTargetFilePath,
    targetStartLine: checkpoint.practiceTargetStartLine,
    targetEndLine: checkpoint.practiceTargetEndLine,
    verificationRules: checkpoint.practiceVerificationRulesJson ?? null,
    status,
    completed: status === CheckpointProgressStatus.COMPLETED,
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
  ) {}

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
      checkpoints: video.checkpoints.map(mapCheckpoint),
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
    return (await this.repository.listCheckpointsForInstructor(instructorId, videoAssetId)).map(mapInstructorCheckpoint);
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

    const compareMode = input.practiceVerificationMode === VideoPracticeVerificationMode.CODE_COMPARE
      || input.practiceVerificationMode === VideoPracticeVerificationMode.FILE_COMPARE;

    if (input.practiceEnabled && compareMode && !input.practiceSnapshotId) {
      throw practiceStepInvalid('File compare practice steps require an instructor snapshot reference');
    }

    if (input.practiceSnapshotId) {
      const snapshot = await this.repository.findSnapshotForInstructor(instructorId, input.practiceSnapshotId);

      if (!snapshot || snapshot.lessonId !== checkpoint.lessonId || snapshot.videoAssetId !== checkpoint.videoAssetId) {
        throw practiceStepInvalid('Practice snapshot must belong to the same video lesson');
      }

      if (input.practiceEnabled && compareMode) {
        const snapshotFiles = filesFromJson(snapshot);
        const targetPath = input.practiceTargetFilePath ?? snapshotFiles[0]?.path;

        if (!targetPath || !snapshotFiles.some((file) => file.path === targetPath)) {
          throw practiceStepInvalid('File compare target file must exist in the selected instructor snapshot');
        }
      }
    }

    if (
      input.practiceTargetStartLine &&
      input.practiceTargetEndLine &&
      input.practiceTargetEndLine < input.practiceTargetStartLine
    ) {
      throw practiceStepInvalid('Target end line must be greater than or equal to start line');
    }

    const updated = await this.repository.updateCheckpoint(checkpoint.id, {
      practiceEnabled: input.practiceEnabled,
      practiceVerificationMode: input.practiceVerificationMode,
      practiceBehavior: input.practiceBehavior,
      practiceSnapshotId: input.practiceSnapshotId ?? null,
      practiceTargetFilePath: input.practiceTargetFilePath ?? null,
      practiceTargetStartLine: input.practiceTargetStartLine ?? null,
      practiceTargetEndLine: input.practiceTargetEndLine ?? null,
      practiceVerificationRulesJson: input.practiceVerificationRules === undefined ? Prisma.DbNull : input.practiceVerificationRules as Prisma.InputJsonValue,
    });

    return mapInstructorCheckpoint(updated);
  }

  async deleteCheckpoint(instructorId: string, checkpointId: string) {
    const checkpoint = await this.repository.findCheckpointForInstructor(instructorId, checkpointId);

    if (!checkpoint) {
      throw checkpointNotFound();
    }

    await this.repository.deleteCheckpoint(checkpoint.id);
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
    return { practiceSteps: steps.map(mapPracticeStep) };
  }

  async completePracticeStep(studentId: string, checkpointId: string, input: PracticeStepCompleteInput): Promise<PracticeStepCompletionResponse> {
    const now = new Date();
    let shouldCompleteLesson = false;
    let lessonId = '';

    const result = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoLearningRepository(transaction);
      const checkpoint = await repository.findPracticeStepForStudent(studentId, checkpointId);

      if (!checkpoint) {
        throw practiceStepNotFound();
      }

      lessonId = checkpoint.lessonId;
      const mode = checkpoint.practiceVerificationMode === VideoPracticeVerificationMode.CODE_COMPARE
        ? VideoPracticeVerificationMode.FILE_COMPARE
        : checkpoint.practiceVerificationMode;
      let verification: VerificationResult;

      if (mode === VideoPracticeVerificationMode.NONE) {
        verification = passed(['Student confirmed completion']);
      } else if (mode === VideoPracticeVerificationMode.FILE_COMPARE) {
        if (!input.workspaceId || !checkpoint.practiceSnapshotId) {
          verification = unavailable(['Workspace or instructor reference is missing']);
        } else {
          const [workspace, snapshot] = await Promise.all([
            repository.findLessonWorkspaceForStudent(studentId, checkpoint.lessonId, input.workspaceId),
            repository.findSnapshotForStudent(studentId, checkpoint.practiceSnapshotId),
          ]);

          if (!workspace || !snapshot) {
            verification = unavailable(['Workspace or instructor reference is unavailable']);
          } else {
            const snapshotFiles = filesFromJson(snapshot);
            const targetPath = checkpoint.practiceTargetFilePath ?? snapshotFiles[0]?.path;
            const studentFile = workspace.files.find((file) => file.path === targetPath);
            const instructorFile = snapshotFiles.find((file) => file.path === targetPath);

            if (!targetPath || !studentFile || !instructorFile) {
              verification = unavailable(['Target file is missing from workspace or reference snapshot']);
            } else {
              const studentCode = normalizeCompareCode(sliceLineRange(studentFile.content, checkpoint.practiceTargetStartLine, checkpoint.practiceTargetEndLine));
              const instructorCode = normalizeCompareCode(sliceLineRange(instructorFile.content, checkpoint.practiceTargetStartLine, checkpoint.practiceTargetEndLine));
              verification = studentCode === instructorCode
                ? passed([`${targetPath} matches the reference`])
                : failed([`${targetPath} does not match the reference yet`]);
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
        if (!input.workspaceId) {
          verification = unavailable(['Submit to Judge before checking this step']);
        } else {
          const submission = await repository.findLatestCompletedJudgeSubmissionForWorkspace(studentId, input.workspaceId);
          if (!submission) {
            verification = unavailable(['No completed judge submission found for this workspace']);
          } else if (submission.status === JudgeSubmissionStatus.ACCEPTED && submission.passed === true) {
            verification = passed(['Latest judge submission passed']);
          } else {
            verification = failed([`Latest judge submission did not pass (${submission.status})`]);
          }
        }
      } else {
        verification = unavailable(['Unsupported practice verification mode']);
      }

      const existing = await repository.findCheckpointProgress(studentId, checkpoint.id);
      if (verification.status !== 'PASSED') {
        return {
          checkpoint,
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

    const snapshot = await this.repository.createSnapshot({
      videoAssetId: video.id,
      lessonId: video.lessonId,
      timestampSeconds: input.timestampSeconds,
      title: input.title ?? null,
      language: input.language.toLowerCase(),
      filesJson: { files: input.files } as Prisma.InputJsonValue,
      createdByUserId: instructorId,
    });

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

    const updated = await this.repository.updateSnapshot(snapshot.id, {
      ...(input.timestampSeconds !== undefined ? { timestampSeconds: input.timestampSeconds } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.language !== undefined ? { language: input.language.toLowerCase() } : {}),
      ...(input.files !== undefined ? { filesJson: { files: input.files } as Prisma.InputJsonValue } : {}),
    });

    return this.mapSnapshot(updated);
  }

  async deleteSnapshot(instructorId: string, snapshotId: string) {
    const snapshot = await this.repository.findSnapshotForInstructor(instructorId, snapshotId);

    if (!snapshot) {
      throw codeSnapshotNotFound();
    }

    await this.repository.deleteSnapshot(snapshot.id);
  }

  async getSnapshotForStudent(studentId: string, snapshotId: string) {
    const snapshot = await this.repository.findSnapshotForStudent(studentId, snapshotId);

    if (!snapshot) {
      throw codeSnapshotNotFound();
    }

    return this.mapSnapshot(snapshot);
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
    const [required, completed] = await Promise.all([
      repository.countRequiredCheckpoints(videoAssetId),
      repository.countCompletedRequiredCheckpoints(studentId, videoAssetId),
    ]);

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
