import type { Client as MinioClient } from 'minio';
import type { Request, Response } from 'express';
import {
  CheckpointProgressStatus,
  LearningActivityType,
  VideoCheckpointType,
  VideoPracticeBehavior,
  VideoPracticeVerificationMode,
  type CodeSnapshot,
  type Prisma,
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
    title: checkpoint.title,
    instruction: checkpoint.description,
    required: checkpoint.required,
    behavior: checkpoint.practiceBehavior,
    verificationMode: checkpoint.practiceVerificationMode,
    snapshotId: checkpoint.practiceSnapshotId,
    targetFilePath: checkpoint.practiceTargetFilePath,
    targetStartLine: checkpoint.practiceTargetStartLine,
    targetEndLine: checkpoint.practiceTargetEndLine,
    status,
    completed: status === CheckpointProgressStatus.COMPLETED,
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

    return {
      enabled: Boolean(config?.enabled || hasInstructorSnapshots),
      language: config?.language ?? DEFAULT_CODE_ALONG_LANGUAGE,
      entryFile: config?.entryFile ?? DEFAULT_CODE_ALONG_ENTRY_FILE,
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
    });

    return {
      enabled: config.enabled,
      language: config.language,
      entryFile: config.entryFile,
    };
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

    if (input.practiceSnapshotId) {
      const snapshot = await this.repository.findSnapshotForInstructor(instructorId, input.practiceSnapshotId);

      if (!snapshot || snapshot.lessonId !== checkpoint.lessonId || snapshot.videoAssetId !== checkpoint.videoAssetId) {
        throw practiceStepInvalid('Practice snapshot must belong to the same video lesson');
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

    const checkpointProgress = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoLearningRepository(transaction);
      const checkpoint = await repository.findPracticeStepForStudent(studentId, checkpointId);

      if (!checkpoint) {
        throw practiceStepNotFound();
      }

      lessonId = checkpoint.lessonId;

      if (checkpoint.practiceVerificationMode === VideoPracticeVerificationMode.CODE_COMPARE) {
        if (!input.workspaceId || !checkpoint.practiceSnapshotId) {
          throw practiceStepInvalid('Code compare requires a lesson workspace and instructor snapshot');
        }

        const [workspace, snapshot] = await Promise.all([
          repository.findLessonWorkspaceForStudent(studentId, checkpoint.lessonId, input.workspaceId),
          repository.findSnapshotForStudent(studentId, checkpoint.practiceSnapshotId),
        ]);

        if (!workspace || !snapshot) {
          throw practiceStepInvalid('Code compare requires accessible student workspace and instructor snapshot');
        }

        const snapshotFiles = filesFromJson(snapshot);
        const targetPath = checkpoint.practiceTargetFilePath ?? snapshotFiles[0]?.path;
        const studentFile = workspace.files.find((file) => file.path === targetPath);
        const instructorFile = snapshotFiles.find((file) => file.path === targetPath);

        if (!targetPath || !studentFile || !instructorFile) {
          throw practiceStepInvalid('Target file is missing from student or instructor code');
        }

        const studentCode = normalizeCompareCode(sliceLineRange(studentFile.content, checkpoint.practiceTargetStartLine, checkpoint.practiceTargetEndLine));
        const instructorCode = normalizeCompareCode(sliceLineRange(instructorFile.content, checkpoint.practiceTargetStartLine, checkpoint.practiceTargetEndLine));

        if (studentCode !== instructorCode) {
          throw practiceStepInvalid('Code does not match the instructor reference for this practice step');
        }
      }

      if (checkpoint.practiceVerificationMode === VideoPracticeVerificationMode.TESTS) {
        throw practiceStepInvalid('Use the existing workspace judge submission action to verify TESTS practice steps');
      }

      const existing = await repository.findCheckpointProgress(studentId, checkpoint.id);
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

      return updated;
    });

    if (shouldCompleteLesson) {
      await this.learningService.completeLesson(studentId, lessonId);
    }

    return {
      id: checkpointId,
      status: checkpointProgress.status,
      completedAt: checkpointProgress.completedAt?.toISOString() ?? null,
      passed: true,
      message: 'Practice step completed',
      lessonCompleted: shouldCompleteLesson,
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
