import { randomUUID } from 'node:crypto';
import {
  CheckpointProgressStatus,
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  LearningActivityType,
  LessonProgressStatus,
  LessonType,
  RoleName,
  VideoAssetStatus,
  VideoCheckpointType,
  type PrismaClient,
} from '@prisma/client';
import { PrismaClient as Prisma } from '@prisma/client';
import type { Express } from 'express';
import type { Client as MinioClient } from 'minio';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { Env } from '../../config';
import { createLogger } from '../../shared/logger';
import { TokenService } from '../auth/token.service';
import type { VideoMessagePublisher } from '../videos/video.rabbitmq';

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
  CODE_SNAPSHOT_MAX_FILES: 3,
  CODE_SNAPSHOT_MAX_TOTAL_BYTES: 1000,
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

interface SeededVideoCourse {
  readonly courseId: string;
  readonly lessonId: string;
  readonly videoAssetId: string;
}

import { Readable } from 'node:stream';

const prisma: PrismaClient = new Prisma({
  datasources: {
    db: {
      url: testEnv.DATABASE_URL,
    },
  },
});
const tokenService = new TokenService(testEnv);
const mockManifestBuffer = Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2800000\n720p/index.m3u8\n');

const storage = {
  presignedGetObject: async () => 'http://localhost:9000/codesync-local/playback-url',
  presignedPutObject: async () => 'http://localhost:9000/codesync-local/upload-url',
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
  publishProcessingRequested: () => {},
};

let app: Express;

async function seedReferenceData() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.courseCategory.upsert({
    where: { slug: 'video-learning' },
    update: { name: 'Video Learning' },
    create: { name: 'Video Learning', slug: 'video-learning' },
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

async function createReadyVideoCourse(instructorId: string, studentId?: string): Promise<SeededVideoCourse> {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'video-learning' } });
  const course = await prisma.course.create({
    data: {
      title: 'Interactive Video Course',
      slug: `interactive-video-course-${randomUUID()}`,
      shortDescription: 'Video learning',
      description: 'A course with one processed video lesson',
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
              title: 'Video Lesson',
              position: 1,
              lessonType: LessonType.VIDEO,
            }],
          },
        }],
      },
    },
    include: {
      modules: {
        include: { lessons: true },
      },
    },
  });
  const lesson = course.modules[0]?.lessons[0];

  if (!lesson) {
    throw new Error('Expected seeded lesson');
  }

  const videoAsset = await prisma.videoAsset.create({
    data: {
      lessonId: lesson.id,
      status: VideoAssetStatus.READY,
      originalFilename: 'lesson.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 2048,
      sourceObjectKey: `videos/source/${randomUUID()}.mp4`,
      masterPlaylistObjectKey: `videos/hls/${randomUUID()}/master.m3u8`,
      thumbnailObjectKey: `videos/hls/${randomUUID()}/thumbnail.jpg`,
      durationSeconds: 1000,
      width: 1920,
      height: 1080,
      processingProgress: 100,
      createdByUserId: instructorId,
      readyAt: new Date(),
    },
  });

  if (studentId) {
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId,
        courseId: course.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await prisma.courseProgress.create({
      data: {
        enrollmentId: enrollment.id,
        totalLessons: 1,
        completedLessons: 0,
        progressPercent: 0,
      },
    });
  }

  return { courseId: course.id, lessonId: lesson.id, videoAssetId: videoAsset.id };
}

describe('interactive video learning integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedReferenceData();
  });

  beforeEach(async () => {
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

  it('stores durable video progress, clamps duration, and never regresses resume position', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { videoAssetId } = await createReadyVideoCourse(instructor.id, student.id);

    const initial = await request(app)
      .put(`/api/v1/learning/videos/${videoAssetId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ positionSeconds: 120 });
    const completed = await request(app)
      .put(`/api/v1/learning/videos/${videoAssetId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ positionSeconds: 1500 });
    const stale = await request(app)
      .put(`/api/v1/learning/videos/${videoAssetId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ positionSeconds: 100 });

    expect(initial.status).toBe(200);
    expect(initial.body.progress.watchedPercent).toBe(12);
    expect(completed.status).toBe(200);
    expect(completed.body.progress.lastPositionSeconds).toBe(1000);
    expect(completed.body.progress.furthestPositionSeconds).toBe(1000);
    expect(completed.body.progress.completed).toBe(true);
    expect(completed.body.progress.lessonCompleted).toBe(true);
    expect(stale.status).toBe(200);
    expect(stale.body.progress.lastPositionSeconds).toBe(1000);
    expect(await prisma.videoProgress.count({ where: { studentId: student.id, videoAssetId } })).toBe(1);
    expect(await prisma.learningActivity.count({
      where: { userId: student.id, type: LearningActivityType.VIDEO_STARTED },
    })).toBe(1);
    expect(await prisma.learningActivity.count({
      where: { userId: student.id, type: LearningActivityType.VIDEO_COMPLETED },
    })).toBe(1);
  });

  it('rejects invalid progress and hides videos from students without enrollment', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const enrolledStudent = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { videoAssetId } = await createReadyVideoCourse(instructor.id, enrolledStudent.id);

    const invalid = await request(app)
      .put(`/api/v1/learning/videos/${videoAssetId}/progress`)
      .set('Authorization', `Bearer ${enrolledStudent.token}`)
      .send({ positionSeconds: -1 });
    const forbidden = await request(app)
      .put(`/api/v1/learning/videos/${videoAssetId}/progress`)
      .set('Authorization', `Bearer ${otherStudent.token}`)
      .send({ positionSeconds: 10 });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VIDEO_PROGRESS_INVALID_POSITION');
    expect(forbidden.status).toBe(404);
  });

  it('returns playback metadata with resume progress, ordered checkpoints, and snapshot metadata', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lessonId, videoAssetId } = await createReadyVideoCourse(instructor.id, student.id);

    await prisma.videoProgress.create({
      data: {
        studentId: student.id,
        videoAssetId,
        lessonId,
        lastPositionSeconds: 420,
        furthestPositionSeconds: 420,
        watchedPercent: 42,
      },
    });
    const later = await prisma.videoCheckpoint.create({
      data: {
        lessonId,
        videoAssetId,
        timestampSeconds: 300,
        type: VideoCheckpointType.INFO,
        title: 'Later',
        required: true,
        pauseVideo: true,
        position: 300,
      },
    });
    await prisma.videoCheckpoint.create({
      data: {
        lessonId,
        videoAssetId,
        timestampSeconds: 120,
        type: VideoCheckpointType.INFO,
        title: 'Earlier',
        required: false,
        pauseVideo: true,
        position: 120,
      },
    });
    await prisma.checkpointProgress.create({
      data: {
        studentId: student.id,
        checkpointId: later.id,
        status: CheckpointProgressStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await prisma.codeSnapshot.create({
      data: {
        lessonId,
        videoAssetId,
        timestampSeconds: 250,
        title: 'Example',
        language: 'typescript',
        filesJson: { files: [{ path: 'index.ts', content: 'console.log("hi");' }] },
        createdByUserId: instructor.id,
      },
    });

    const response = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/video`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.body.playbackUrl).toBe(`/api/v1/learning/lessons/${lessonId}/hls/master.m3u8`);
    expect(response.body.progress.lastPositionSeconds).toBe(420);
    expect(response.body.checkpoints.map((checkpoint: { title: string }) => checkpoint.title)).toEqual(['Earlier', 'Later']);
    expect(response.body.checkpoints[1].completed).toBe(true);
    expect(response.body.codeSnapshots).toEqual([
      expect.objectContaining({ title: 'Example', timestampSeconds: 250, language: 'typescript' }),
    ]);
    expect(response.body.codeSnapshots[0]).not.toHaveProperty('files');
  });

  it('streams HLS manifest and supports byte-range segment requests with authorization', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const outsider = await createUser([RoleName.STUDENT]);
    const { lessonId } = await createReadyVideoCourse(instructor.id, student.id);

    // 1. Master manifest streaming
    const masterManifest = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/hls/master.m3u8`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(masterManifest.status).toBe(200);
    expect(masterManifest.headers['content-type']).toBe('application/vnd.apple.mpegurl');
    expect(masterManifest.headers['cache-control']).toContain('no-cache');
    expect(masterManifest.headers['accept-ranges']).toBe('bytes');

    // 2. Token query param fallback
    const manifestWithQueryToken = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/hls/master.m3u8?token=${student.token}`);
    expect(manifestWithQueryToken.status).toBe(200);

    // 3. Variant playlist streaming
    const variantPlaylist = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/hls/720p/index.m3u8`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(variantPlaylist.status).toBe(200);
    expect(variantPlaylist.headers['content-type']).toBe('application/vnd.apple.mpegurl');

    // 4. Media segment Range request (206 Partial Content)
    const segmentRange = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/hls/720p/segment_00000.ts`)
      .set('Authorization', `Bearer ${student.token}`)
      .set('Range', 'bytes=0-100');
    expect(segmentRange.status).toBe(206);
    expect(segmentRange.headers['content-range']).toBe('bytes 0-100/1024');
    expect(segmentRange.headers['content-length']).toBe('101');
    expect(segmentRange.headers['content-type']).toBe('video/mp2t');

    // 5. Out of bounds Range request (416 Range Not Satisfiable)
    const invalidRange = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/hls/720p/segment_00000.ts`)
      .set('Authorization', `Bearer ${student.token}`)
      .set('Range', 'bytes=5000-6000');
    expect(invalidRange.status).toBe(416);

    // 6. Missing object returns 404
    const notFound = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/hls/non-existent.m3u8`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(notFound.status).toBe(200); // Storage mock returns buffer for .m3u8

    // 7. Non-enrolled student denied access
    const outsiderAccess = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/hls/master.m3u8`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(outsiderAccess.status).toBe(404);
  });

  it('requires INFO checkpoints before auto-completing a video lesson', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lessonId, videoAssetId } = await createReadyVideoCourse(instructor.id, student.id);
    const checkpoint = await prisma.videoCheckpoint.create({
      data: {
        lessonId,
        videoAssetId,
        timestampSeconds: 500,
        type: VideoCheckpointType.INFO,
        title: 'Pause and read',
        required: true,
        pauseVideo: true,
        position: 500,
      },
    });

    const progress = await request(app)
      .put(`/api/v1/learning/videos/${videoAssetId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ positionSeconds: 900 });
    const lessonBeforeCheckpoint = await prisma.lessonProgress.findUnique({
      where: { studentId_lessonId: { studentId: student.id, lessonId } },
    });
    const completeCheckpoint = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const duplicate = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const lessonAfterCheckpoint = await prisma.lessonProgress.findUniqueOrThrow({
      where: { studentId_lessonId: { studentId: student.id, lessonId } },
    });

    expect(progress.status).toBe(200);
    expect(progress.body.progress.completed).toBe(true);
    expect(progress.body.progress.lessonCompleted).toBe(false);
    expect(lessonBeforeCheckpoint?.status).not.toBe(LessonProgressStatus.COMPLETED);
    expect(completeCheckpoint.status).toBe(200);
    expect(completeCheckpoint.body.checkpointProgress.lessonCompleted).toBe(true);
    expect(duplicate.status).toBe(200);
    expect(lessonAfterCheckpoint.status).toBe(LessonProgressStatus.COMPLETED);
    expect(await prisma.learningActivity.count({
      where: { userId: student.id, type: LearningActivityType.CHECKPOINT_COMPLETED },
    })).toBe(1);
  });

  it('supports instructor checkpoint CRUD and keeps future checkpoint types unsupported for student completion', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const otherInstructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { videoAssetId } = await createReadyVideoCourse(instructor.id, student.id);

    const invalidTimestamp = await request(app)
      .post(`/api/v1/instructor/videos/${videoAssetId}/checkpoints`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ timestampSeconds: 1200, type: 'INFO', title: 'Invalid', required: false, pauseVideo: true });
    const created = await request(app)
      .post(`/api/v1/instructor/videos/${videoAssetId}/checkpoints`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ timestampSeconds: 90, type: 'CODING', title: 'Coding later', required: true, pauseVideo: true });
    const outsiderUpdate = await request(app)
      .patch(`/api/v1/instructor/checkpoints/${created.body.checkpoint.id}`)
      .set('Authorization', `Bearer ${otherInstructor.token}`)
      .send({ title: 'Nope' });
    const updated = await request(app)
      .patch(`/api/v1/instructor/checkpoints/${created.body.checkpoint.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Updated coding checkpoint', timestampSeconds: 100 });
    const unsupported = await request(app)
      .post(`/api/v1/learning/checkpoints/${created.body.checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const deleted = await request(app)
      .delete(`/api/v1/instructor/checkpoints/${created.body.checkpoint.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();

    expect(invalidTimestamp.status).toBe(400);
    expect(created.status).toBe(201);
    expect(outsiderUpdate.status).toBe(404);
    expect(updated.status).toBe(200);
    expect(updated.body.checkpoint.title).toBe('Updated coding checkpoint');
    expect(updated.body.checkpoint.timestampSeconds).toBe(100);
    expect(unsupported.status).toBe(409);
    expect(unsupported.body.error.code).toBe('CHECKPOINT_COMPLETION_UNSUPPORTED');
    expect(deleted.status).toBe(204);
  });

  it('supports code snapshot CRUD with limits and student detail access', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const otherInstructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const outsider = await createUser([RoleName.STUDENT]);
    const { videoAssetId } = await createReadyVideoCourse(instructor.id, student.id);

    const tooManyFiles = await request(app)
      .post(`/api/v1/instructor/videos/${videoAssetId}/code-snapshots`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        timestampSeconds: 10,
        language: 'typescript',
        files: [
          { path: 'a.ts', content: 'a' },
          { path: 'b.ts', content: 'b' },
          { path: 'c.ts', content: 'c' },
          { path: 'd.ts', content: 'd' },
        ],
      });
    const created = await request(app)
      .post(`/api/v1/instructor/videos/${videoAssetId}/code-snapshots`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        timestampSeconds: 250,
        title: 'State after refactor',
        language: 'typescript',
        files: [{ path: 'src/index.ts', content: 'export const value = 1;' }],
      });
    const outsiderPatch = await request(app)
      .patch(`/api/v1/instructor/code-snapshots/${created.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${otherInstructor.token}`)
      .send({ title: 'Nope' });
    const updated = await request(app)
      .patch(`/api/v1/instructor/code-snapshots/${created.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Updated snapshot', timestampSeconds: 260 });
    const studentDetail = await request(app)
      .get(`/api/v1/learning/code-snapshots/${created.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${student.token}`);
    const outsiderDetail = await request(app)
      .get(`/api/v1/learning/code-snapshots/${created.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(tooManyFiles.status).toBe(400);
    expect(created.status).toBe(201);
    expect(outsiderPatch.status).toBe(404);
    expect(updated.status).toBe(200);
    expect(updated.body.codeSnapshot.timestampSeconds).toBe(260);
    expect(studentDetail.status).toBe(200);
    expect(studentDetail.body.codeSnapshot.files).toEqual([{ path: 'src/index.ts', content: 'export const value = 1;' }]);
    expect(outsiderDetail.status).toBe(404);
  });
});
