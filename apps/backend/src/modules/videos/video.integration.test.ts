import { randomUUID } from 'node:crypto';
import {
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  RoleName,
  VideoAssetStatus,
  type PrismaClient,
} from '@prisma/client';
import { PrismaClient as Prisma } from '@prisma/client';
import type { Express } from 'express';
import type { Client as MinioClient } from 'minio';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AsyncMessage, VideoProcessingRequestedPayload } from '@codesync/shared';
import { createApp } from '../../app';
import type { Env } from '../../config';
import { createLogger } from '../../shared/logger';
import { TokenService } from '../auth/token.service';
import type { VideoMessagePublisher } from './video.rabbitmq';
import { VideoRepository } from './video.repository';

const testEnv: Env = {
  NODE_ENV: 'test',
  API_PORT: 4000,
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://codesync:codesync_dev_password@localhost:5432/codesync_test',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://codesync:codesync_dev_password@localhost:5672',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: 9000,
  MINIO_ACCESS_KEY: 'codesync',
  MINIO_SECRET_KEY: 'codesync_dev_password',
  MINIO_BUCKET: 'codesync-local',
  MINIO_PUBLIC_ENDPOINT: 'http://localhost:9000',
  VIDEO_MAX_UPLOAD_BYTES: 1_073_741_824,
  VIDEO_UPLOAD_URL_TTL_SECONDS: 900,
  VIDEO_PLAYBACK_URL_TTL_SECONDS: 3600,
  VIDEO_WORKER_CONCURRENCY: 1,
  VIDEO_PROCESSING_MAX_ATTEMPTS: 3,
  VIDEO_PROGRESS_SAVE_INTERVAL_SECONDS: 10,
  VIDEO_COMPLETION_THRESHOLD_PERCENT: 90,
  CODE_SNAPSHOT_MAX_FILES: 10,
  CODE_SNAPSHOT_MAX_TOTAL_BYTES: 100_000,
  WORKSPACE_MAX_FILES: 10,
  WORKSPACE_MAX_FILE_BYTES: 100_000,
  WORKSPACE_MAX_TOTAL_BYTES: 200_000,
  WORKSPACE_MAX_REVISIONS: 10,
  CODE_EXECUTION_TIMEOUT_MS: 5_000,
  CODE_EXECUTION_MEMORY_MB: 128,
  CODE_EXECUTION_CPU_LIMIT: 0.5,
  CODE_EXECUTION_PIDS_LIMIT: 64,
  CODE_EXECUTION_MAX_OUTPUT_BYTES: 100_000,
  CODE_EXECUTION_WORKER_CONCURRENCY: 2,
  CODE_EXECUTION_MAX_ATTEMPTS: 3,
  CODE_EXECUTION_MAX_ACTIVE_PER_USER: 2,
  CODE_EXECUTION_RATE_LIMIT_WINDOW_MS: 60_000,
  CODE_EXECUTION_RATE_LIMIT_MAX: 20,
  JUDGE_MAX_TEST_CASES: 20,
  JUDGE_MAX_TEST_INPUT_BYTES: 10_000,
  JUDGE_MAX_EXPECTED_OUTPUT_BYTES: 10_000,
  JUDGE_MIN_TIME_LIMIT_MS: 500,
  JUDGE_MAX_TIME_LIMIT_MS: 10_000,
  JUDGE_MIN_MEMORY_MB: 32,
  JUDGE_MAX_MEMORY_MB: 512,
  JUDGE_MAX_OUTPUT_BYTES: 100_000,
  JUDGE_WORKER_CONCURRENCY: 2,
  JUDGE_MAX_ATTEMPTS: 3,
  JUDGE_MAX_ACTIVE_PER_USER: 2,
  JUDGE_RATE_LIMIT_WINDOW_MS: 60_000,
  JUDGE_RATE_LIMIT_MAX: 10,
  PROJECT_MAX_REPOSITORY_BYTES: 200_000_000,
  PROJECT_CLONE_TIMEOUT_MS: 30_000,
  PROJECT_GRADING_TIMEOUT_MS: 120_000,
  PROJECT_BUILD_TIMEOUT_MS: 30_000,
  PROJECT_TEST_TIMEOUT_MS: 30_000,
  PROJECT_MAX_OUTPUT_BYTES: 100_000,
  PROJECT_GRADING_WORKER_CONCURRENCY: 1,
  PROJECT_GRADING_MAX_ATTEMPTS: 3,
  PROJECT_MAX_ACTIVE_SUBMISSIONS_PER_USER: 2,
  PROJECT_SUBMISSION_RATE_LIMIT_WINDOW_MS: 60_000,
  PROJECT_SUBMISSION_RATE_LIMIT_MAX: 5,
  PROJECT_GRADING_CPU_LIMIT: 0.5,
  PROJECT_GRADING_MEMORY_MB: 512,
  PROJECT_GRADING_PIDS_LIMIT: 128,
  JWT_ACCESS_SECRET: 'test_access_secret_that_is_at_least_32_chars',
  JWT_ACCESS_TTL: '15m',
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_SECRET: 'test_refresh_secret_that_is_at_least_32_chars',
  JWT_REFRESH_TTL: '7d',
  JWT_REFRESH_TTL_SECONDS: 604800,
  COOKIE_SECURE: false,
};

interface TestUser {
  readonly id: string;
  readonly token: string;
}

const prisma: PrismaClient = new Prisma({
  datasources: {
    db: {
      url: testEnv.DATABASE_URL,
    },
  },
});
const tokenService = new TokenService(testEnv);
const publishedMessages: AsyncMessage<VideoProcessingRequestedPayload>[] = [];
import { Readable } from 'node:stream';

const mockManifestBuffer = Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2800000\n720p/index.m3u8\n');

const storage = {
  presignedPutObject: async () => 'http://localhost:9000/codesync-local/upload-url',
  presignedGetObject: async () => 'http://localhost:9000/codesync-local/playback-url',
  statObject: async (_bucket: string, key: string) => ({
    size: key.endsWith('.m3u8') ? mockManifestBuffer.length : 1024,
    etag: 'test-etag',
    metaData: { 'content-type': key.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4' },
  }),
  getObject: async (_bucket: string, key: string) =>
    Readable.from(key.endsWith('.m3u8') ? mockManifestBuffer : Buffer.alloc(1024, 0)),
  getPartialObject: async (_bucket: string, _key: string, _offset: number, length: number) =>
    Readable.from(Buffer.alloc(length, 0)),
} as unknown as MinioClient;
const publisher: VideoMessagePublisher = {
  publishProcessingRequested: (message) => {
    publishedMessages.push(message);
  },
};

let app: Express;

async function seedReferenceData() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.courseCategory.upsert({
    where: { slug: 'video' },
    update: { name: 'Video' },
    create: { name: 'Video', slug: 'video' },
  });
}

async function clearData() {
  await prisma.testCaseResult.deleteMany();
  await prisma.judgeResult.deleteMany();
  await prisma.judgeSubmission.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.executionResult.deleteMany();
  await prisma.executionRequest.deleteMany();
  await prisma.workspaceFile.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.codingCheckpointConfig.deleteMany();
  await prisma.checkpointProgress.deleteMany();
  await prisma.videoProgress.deleteMany();
  await prisma.codeSnapshot.deleteMany();
  await prisma.videoCheckpoint.deleteMany();
  await prisma.videoProcessingFailure.deleteMany();
  await prisma.videoRendition.deleteMany();
  await prisma.videoProcessingJob.deleteMany();
  await prisma.videoAsset.deleteMany();
  await prisma.storedObject.deleteMany();
  await prisma.learningActivity.deleteMany();
  await prisma.lessonProgress.deleteMany();
  await prisma.courseProgress.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.courseModule.deleteMany();
  await prisma.courseTagAssignment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser(roles: readonly RoleName[]): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      passwordHash: 'not-used',
      displayName: roles.join(' '),
      roles: {
        create: roles.map((name) => ({ role: { connect: { name } } })),
      },
    },
  });

  return {
    id: user.id,
    token: tokenService.issueAccessToken(user.id, randomUUID(), roles),
  };
}

async function createCourseWithLesson(instructorId: string, lessonType: LessonType) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'video' } });

  const course = await prisma.course.create({
    data: {
      title: 'Video Course',
      slug: `video-course-${randomUUID()}`,
      shortDescription: 'A video course',
      description: 'A course with a video lesson',
      status: CourseStatus.PUBLISHED,
      difficulty: CourseDifficulty.BEGINNER,
      ownerInstructorId: instructorId,
      categoryId: category.id,
      publishedAt: new Date(),
      modules: {
        create: [{
          title: 'Module 1',
          position: 1,
          lessons: {
            create: [{
              title: 'Lesson 1',
              position: 1,
              lessonType,
            }],
          },
        }],
      },
    },
    include: {
      modules: {
        include: {
          lessons: true,
        },
      },
    },
  });

  const lesson = course.modules[0]?.lessons[0];

  if (!lesson) {
    throw new Error('Expected seeded lesson');
  }

  return { course, lesson };
}

async function createUploadAndQueue(instructor: TestUser, lessonId: string) {
  const intent = await request(app)
    .post(`/api/v1/instructor/lessons/${lessonId}/video/upload-intent`)
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({ filename: 'intro.mp4', contentType: 'video/mp4', sizeBytes: 1024 });

  expect(intent.status).toBe(201);

  const complete = await request(app)
    .post(`/api/v1/instructor/videos/${intent.body.videoAssetId}/complete-upload`)
    .set('Authorization', `Bearer ${instructor.token}`);

  expect(complete.status).toBe(200);

  return {
    videoAssetId: intent.body.videoAssetId as string,
    jobId: publishedMessages.at(-1)?.jobId as string,
  };
}

describe('video upload and processing integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedReferenceData();
  });

  beforeEach(async () => {
    publishedMessages.length = 0;
    await clearData();
    await seedReferenceData();
    app = createApp({
      env: testEnv,
      logger: createLogger('test'),
      prisma,
      storage,
      videoPublisher: publisher,
    });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('creates a direct upload intent only for the owning instructor and video lessons', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const otherInstructor = await createUser([RoleName.INSTRUCTOR]);
    const { lesson } = await createCourseWithLesson(instructor.id, LessonType.VIDEO);

    const created = await request(app)
      .post(`/api/v1/instructor/lessons/${lesson.id}/video/upload-intent`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ filename: 'intro.mp4', contentType: 'video/mp4', sizeBytes: 1024 });
    const forbidden = await request(app)
      .post(`/api/v1/instructor/lessons/${lesson.id}/video/upload-intent`)
      .set('Authorization', `Bearer ${otherInstructor.token}`)
      .send({ filename: 'intro.mp4', contentType: 'video/mp4', sizeBytes: 1024 });

    expect(created.status).toBe(201);
    expect(created.body.uploadUrl).toContain('upload-url');
    expect(created.body.objectKey).toContain(created.body.videoAssetId);
    expect(forbidden.status).toBe(404);
  });

  it('rejects upload intent for non-video lessons, unsupported content type, and oversized files', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const { lesson } = await createCourseWithLesson(instructor.id, LessonType.ARTICLE);

    const nonVideo = await request(app)
      .post(`/api/v1/instructor/lessons/${lesson.id}/video/upload-intent`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ filename: 'intro.mp4', contentType: 'video/mp4', sizeBytes: 1024 });
    const unsupported = await request(app)
      .post(`/api/v1/instructor/lessons/${lesson.id}/video/upload-intent`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ filename: 'intro.txt', contentType: 'text/plain', sizeBytes: 1024 });
    const oversized = await request(app)
      .post(`/api/v1/instructor/lessons/${lesson.id}/video/upload-intent`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ filename: 'intro.mp4', contentType: 'video/mp4', sizeBytes: testEnv.VIDEO_MAX_UPLOAD_BYTES + 1 });

    expect(nonVideo.status).toBe(409);
    expect(unsupported.status).toBe(400);
    expect(oversized.status).toBe(413);
  });

  it('completes upload idempotently and publishes one processing request', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const { lesson } = await createCourseWithLesson(instructor.id, LessonType.VIDEO);
    const queued = await createUploadAndQueue(instructor, lesson.id);

    const duplicate = await request(app)
      .post(`/api/v1/instructor/videos/${queued.videoAssetId}/complete-upload`)
      .set('Authorization', `Bearer ${instructor.token}`);
    const jobCount = await prisma.videoProcessingJob.count({ where: { videoAssetId: queued.videoAssetId } });

    expect(duplicate.status).toBe(200);
    expect(jobCount).toBe(1);
    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]?.payload).toMatchObject({ videoAssetId: queued.videoAssetId });
  });

  it('applies worker result events and returns signed playback for enrolled students', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { course, lesson } = await createCourseWithLesson(instructor.id, LessonType.VIDEO);
    const { videoAssetId, jobId } = await createUploadAndQueue(instructor, lesson.id);
    const repository = new VideoRepository(prisma);

    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    await repository.markStarted({ videoAssetId, jobId });
    await repository.markProgress({ videoAssetId, jobId, progressPercent: 42 });
    await repository.markCompleted({
      videoAssetId,
      jobId,
      durationSeconds: 60,
      width: 1280,
      height: 720,
      masterPlaylistObjectKey: `videos/processed/${videoAssetId}/master.m3u8`,
      thumbnailObjectKey: `videos/processed/${videoAssetId}/thumbnail.jpg`,
      renditions: [{
        quality: '720P',
        width: 1280,
        height: 720,
        bitrate: 2_800_000,
        playlistObjectKey: `videos/processed/${videoAssetId}/720p/index.m3u8`,
      }],
    });
    await repository.markCompleted({
      videoAssetId,
      jobId,
      durationSeconds: 60,
      width: 1280,
      height: 720,
      masterPlaylistObjectKey: `videos/processed/${videoAssetId}/master.m3u8`,
      thumbnailObjectKey: `videos/processed/${videoAssetId}/thumbnail.jpg`,
      renditions: [{
        quality: '720P',
        width: 1280,
        height: 720,
        bitrate: 2_800_000,
        playlistObjectKey: `videos/processed/${videoAssetId}/720p/index.m3u8`,
      }],
    });

    const playback = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/video`)
      .set('Authorization', `Bearer ${student.token}`);
    const video = await prisma.videoAsset.findUniqueOrThrow({ where: { id: videoAssetId }, include: { renditions: true } });

    expect(video.status).toBe(VideoAssetStatus.READY);
    expect(video.renditions).toHaveLength(1);
    expect(playback.status).toBe(200);
    expect(playback.headers['cache-control']).toBe('no-store, private');
    expect(playback.body.playbackUrl).toBe(`/api/v1/learning/lessons/${lesson.id}/hls/master.m3u8`);

    const instructorHls = await request(app)
      .get(`/api/v1/instructor/videos/${videoAssetId}/hls/master.m3u8`)
      .set('Authorization', `Bearer ${instructor.token}`);
    expect(instructorHls.status).toBe(200);
    expect(instructorHls.headers['content-type']).toBe('application/vnd.apple.mpegurl');
  });

  it('allows retry only after processing failure', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const { lesson } = await createCourseWithLesson(instructor.id, LessonType.VIDEO);
    const { videoAssetId, jobId } = await createUploadAndQueue(instructor, lesson.id);
    const repository = new VideoRepository(prisma);

    await repository.markFailed({
      videoAssetId,
      jobId,
      errorCode: 'VIDEO_PROCESSING_FAILED',
      errorMessage: 'FFmpeg failed',
      retryable: true,
    });
    await repository.markFailed({
      videoAssetId,
      jobId,
      errorCode: 'VIDEO_PROCESSING_FAILED',
      errorMessage: 'FFmpeg failed',
      retryable: true,
    });

    const retry = await request(app)
      .post(`/api/v1/instructor/videos/${videoAssetId}/retry`)
      .set('Authorization', `Bearer ${instructor.token}`);
    const failures = await prisma.videoProcessingFailure.count({ where: { jobId } });

    expect(retry.status).toBe(202);
    expect(failures).toBe(1);
    expect(publishedMessages).toHaveLength(2);
  });
});
