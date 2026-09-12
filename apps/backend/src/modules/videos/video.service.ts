import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Client as MinioClient } from 'minio';
import {
  LessonType,
  VideoAssetStatus,
  type PrismaClient,
} from '@prisma/client';
import type { AsyncMessage, VideoProcessingRequestedPayload } from '@codesync/shared';
import type { Env } from '../../config';
import type { AppLogger } from '../../shared/logger';
import { processedPrefix, sourceObjectKey } from './video.constants';
import { sanitizeHlsPath, streamHlsObject } from './video-stream.helper';
import {
  videoAccessDenied,
  videoLessonNotFound,
  videoLessonTypeInvalid,
  videoObjectMetadataMismatch,
  videoObjectMissing,
  videoPlaybackNotReady,
  videoRetryNotAllowed,
  videoUploadTooLarge,
} from './video.errors';
import type { UploadIntentInput } from './video.schemas';
import type { VideoPlaybackResponse, VideoStatusResponse, VideoUploadIntentResponse } from './video.types';
import type { VideoMessagePublisher } from './video.rabbitmq';
import { VideoRepository, type VideoAssetWithDetails } from './video.repository';

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function sanitizeObjectStatContentType(value: string | undefined, fallback: string) {
  return value && value.trim().length > 0 ? value : fallback;
}

function isTerminalOrActiveStatus(status: VideoAssetStatus) {
  return status === VideoAssetStatus.QUEUED ||
    status === VideoAssetStatus.PROCESSING ||
    status === VideoAssetStatus.READY;
}

function mapVideo(video: VideoAssetWithDetails, playbackUrl?: string | null): VideoStatusResponse {
  const latestJob = video.jobs[0];

  return {
    id: video.id,
    lessonId: video.lessonId,
    status: video.status,
    progress: video.processingProgress,
    originalFilename: video.originalFilename,
    mimeType: video.mimeType,
    sizeBytes: video.sizeBytes.toString(),
    durationSeconds: video.durationSeconds,
    width: video.width,
    height: video.height,
    masterPlaylistObjectKey: video.masterPlaylistObjectKey,
    thumbnailObjectKey: video.thumbnailObjectKey,
    readyAt: toIso(video.readyAt),
    failedAt: toIso(video.failedAt),
    renditions: video.renditions.map((rendition) => ({
      quality: rendition.quality,
      width: rendition.width,
      height: rendition.height,
      bitrate: rendition.bitrate,
      playlistObjectKey: rendition.playlistObjectKey,
    })),
    latestJob: latestJob
      ? {
          jobId: latestJob.jobId,
          status: latestJob.status,
          attemptCount: latestJob.attemptCount,
          lastErrorCode: latestJob.lastErrorCode,
          lastErrorMessage: latestJob.lastErrorMessage,
        }
      : null,
    ...(playbackUrl !== undefined ? { playbackUrl } : {}),
  };
}

export class VideoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly videos: VideoRepository,
    private readonly storage: MinioClient,
    private readonly publisher: VideoMessagePublisher,
    private readonly env: Env,
    private readonly logger: AppLogger,
  ) {}

  async createUploadIntent(
    instructorId: string,
    lessonId: string,
    input: UploadIntentInput,
    correlationId: string,
  ): Promise<VideoUploadIntentResponse> {
    if (input.sizeBytes > this.env.VIDEO_MAX_UPLOAD_BYTES) {
      throw videoUploadTooLarge();
    }

    const lesson = await this.videos.findLessonWithCourse(lessonId);

    if (!lesson) {
      throw videoLessonNotFound();
    }

    if (lesson.module.course.ownerInstructorId !== instructorId) {
      throw videoAccessDenied();
    }

    if (lesson.lessonType !== LessonType.VIDEO) {
      throw videoLessonTypeInvalid();
    }

    const existingVideo = await this.videos.findVideoByLesson(lessonId);
    const videoAssetId = existingVideo?.id ?? randomUUID();
    const objectKey = sourceObjectKey(videoAssetId, randomUUID(), input.contentType);
    const video = await this.videos.createOrResetUploadIntent({
      videoAssetId,
      lessonId,
      instructorId,
      originalFilename: input.filename,
      mimeType: input.contentType,
      sizeBytes: BigInt(input.sizeBytes),
      sourceObjectKey: objectKey,
    });
    const uploadUrl = await this.storage.presignedPutObject(
      this.env.MINIO_BUCKET,
      video.sourceObjectKey,
      this.env.VIDEO_UPLOAD_URL_TTL_SECONDS,
    );
    const expiresAt = new Date(Date.now() + this.env.VIDEO_UPLOAD_URL_TTL_SECONDS * 1000).toISOString();

    this.logger.info({ videoAssetId: video.id, correlationId }, 'video upload intent created');

    return {
      videoAssetId: video.id,
      uploadUrl,
      objectKey: video.sourceObjectKey,
      expiresAt,
    };
  }

  async completeUpload(instructorId: string, videoAssetId: string, correlationId: string): Promise<VideoStatusResponse> {
    const queued = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoRepository(transaction);
      const video = await repository.findVideoForInstructor(videoAssetId, instructorId);

      if (!video) {
        throw videoAccessDenied();
      }

      const activeJob = await repository.findLatestActiveJob(video.id);

      if (activeJob) {
        return { video, jobId: activeJob.jobId, shouldPublish: false };
      }

      if (isTerminalOrActiveStatus(video.status)) {
        return { video, jobId: video.jobs[0]?.jobId ?? randomUUID(), shouldPublish: false };
      }

      const object = await this.statSourceObject(video);
      const contentType = sanitizeObjectStatContentType(object.metaData?.['content-type'], video.mimeType);

      const objectSize = BigInt(object.size);

      if (objectSize !== video.sizeBytes) {
        throw videoObjectMetadataMismatch();
      }

      const storedObject = await repository.createStoredObject({
        bucket: this.env.MINIO_BUCKET,
        objectKey: video.sourceObjectKey,
        contentType,
        sizeBytes: objectSize,
        etag: object.etag,
      });
      const jobId = randomUUID();

      await repository.markUploadedAndQueue({
        videoAssetId: video.id,
        storedObjectId: storedObject.id,
        jobId,
      });

      return { video, jobId, shouldPublish: true };
    });

    if (queued.shouldPublish) {
      this.publishRequested({
        videoAssetId,
        sourceObjectKey: queued.video.sourceObjectKey,
        jobId: queued.jobId,
        requestedByUserId: instructorId,
        correlationId,
      });
      this.logger.info({ videoAssetId, jobId: queued.jobId, correlationId }, 'video processing queued');
    }

    return this.getInstructorVideo(instructorId, videoAssetId);
  }

  async getInstructorVideo(instructorId: string, videoAssetId: string): Promise<VideoStatusResponse> {
    const video = await this.videos.findVideoForInstructor(videoAssetId, instructorId);

    if (!video) {
      throw videoAccessDenied();
    }

    let playbackUrl: string | null = null;
    if (video.status === VideoAssetStatus.READY && video.masterPlaylistObjectKey) {
      playbackUrl = `/api/v1/instructor/videos/${video.id}/hls/master.m3u8`;
    }

    return mapVideo(video, playbackUrl);
  }

  async getInstructorLessonVideo(instructorId: string, lessonId: string): Promise<VideoStatusResponse | null> {
    const video = await this.videos.findVideoByLesson(lessonId);

    if (!video) {
      return null;
    }

    if (video.lesson.module.course.ownerInstructorId !== instructorId) {
      throw videoAccessDenied();
    }

    let playbackUrl: string | null = null;
    if (video.status === VideoAssetStatus.READY && video.masterPlaylistObjectKey) {
      playbackUrl = `/api/v1/instructor/videos/${video.id}/hls/master.m3u8`;
    }

    return mapVideo(video, playbackUrl);
  }

  async streamInstructorHls(
    instructorId: string,
    videoAssetId: string,
    rawFilePath: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const video = await this.videos.findVideoForInstructor(videoAssetId, instructorId);

    if (!video || video.status !== VideoAssetStatus.READY || !video.masterPlaylistObjectKey) {
      throw videoAccessDenied();
    }

    const filePath = sanitizeHlsPath(rawFilePath);
    const objectKey = `${processedPrefix(video.id)}/${filePath}`;

    await streamHlsObject(this.storage, this.env.MINIO_BUCKET, objectKey, filePath, request, response);
  }

  async retry(instructorId: string, videoAssetId: string, correlationId: string): Promise<VideoStatusResponse> {
    const queued = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoRepository(transaction);
      const video = await repository.findVideoForInstructor(videoAssetId, instructorId);

      if (!video) {
        throw videoAccessDenied();
      }

      if (video.status !== VideoAssetStatus.FAILED) {
        throw videoRetryNotAllowed();
      }

      const activeJob = await repository.findLatestActiveJob(video.id);

      if (activeJob) {
        return { video, jobId: activeJob.jobId, shouldPublish: false };
      }

      const jobId = randomUUID();
      await repository.createRetryJob({ videoAssetId: video.id, jobId });

      return { video, jobId, shouldPublish: true };
    });

    if (queued.shouldPublish) {
      this.publishRequested({
        videoAssetId,
        sourceObjectKey: queued.video.sourceObjectKey,
        jobId: queued.jobId,
        requestedByUserId: instructorId,
        correlationId,
      });
    }

    return this.getInstructorVideo(instructorId, videoAssetId);
  }

  async retryAsAdmin(adminUserId: string, videoAssetId: string, correlationId: string): Promise<VideoStatusResponse> {
    const queued = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoRepository(transaction);
      const video = await repository.findVideoById(videoAssetId);

      if (!video) {
        throw videoAccessDenied();
      }

      if (video.status !== VideoAssetStatus.FAILED) {
        throw videoRetryNotAllowed();
      }

      const activeJob = await repository.findLatestActiveJob(video.id);

      if (activeJob) {
        return { video, jobId: activeJob.jobId, shouldPublish: false };
      }

      const jobId = randomUUID();
      await repository.createRetryJob({ videoAssetId: video.id, jobId });

      return { video, jobId, shouldPublish: true };
    });

    if (queued.shouldPublish) {
      this.publishRequested({
        videoAssetId,
        sourceObjectKey: queued.video.sourceObjectKey,
        jobId: queued.jobId,
        requestedByUserId: adminUserId,
        correlationId,
      });
    }

    const video = await this.videos.findVideoById(videoAssetId);
    if (!video) {
      throw videoAccessDenied();
    }

    return mapVideo(video);
  }

  async getPlayback(studentId: string, lessonId: string): Promise<VideoPlaybackResponse> {
    const video = await this.videos.findReadyVideoForEnrolledStudent(studentId, lessonId);

    if (!video) {
      throw videoPlaybackNotReady();
    }

    if (!video.masterPlaylistObjectKey) {
      throw videoPlaybackNotReady();
    }

    return {
      videoAssetId: video.id,
      status: 'READY',
      playbackUrl: `/api/v1/learning/lessons/${lessonId}/hls/master.m3u8`,
      durationSeconds: video.durationSeconds,
    };
  }

  private async statSourceObject(video: VideoAssetWithDetails) {
    try {
      return await this.storage.statObject(this.env.MINIO_BUCKET, video.sourceObjectKey);
    } catch {
      throw videoObjectMissing();
    }
  }

  private publishRequested(input: {
    readonly videoAssetId: string;
    readonly sourceObjectKey: string;
    readonly jobId: string;
    readonly requestedByUserId: string;
    readonly correlationId: string;
  }) {
    const message: AsyncMessage<VideoProcessingRequestedPayload> = {
      jobId: input.jobId,
      idempotencyKey: input.jobId,
      correlationId: input.correlationId,
      requestedByUserId: input.requestedByUserId,
      createdAt: new Date().toISOString(),
      payload: {
        videoAssetId: input.videoAssetId,
        sourceObjectKey: input.sourceObjectKey,
      },
    };

    this.publisher.publishProcessingRequested(message);
  }
}
