import { randomUUID } from 'node:crypto';
import { CourseDifficulty, CourseStatus, LessonType, PrismaClient, RoleName, TranscriptStatus, VideoAssetStatus } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { Env } from '../../config';
import { createLogger } from '../../shared/logger';
import { TokenService } from '../auth/token.service';

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

const prisma = new PrismaClient({ datasources: { db: { url: testEnv.DATABASE_URL } } });
const tokenService = new TokenService(testEnv);
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
  await prisma.videoTranscriptSegment.deleteMany();
  await prisma.videoTranscript.deleteMany();
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
      roles: { create: roles.map((name) => ({ role: { connect: { name } } })) },
    },
  });

  return { id: user.id, token: tokenService.issueAccessToken(user.id, randomUUID(), roles) };
}

async function createReadyVideo(instructorId: string, status: CourseStatus = CourseStatus.PUBLISHED) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'video' } });
  const course = await prisma.course.create({
    data: {
      title: `Transcript Course ${randomUUID()}`,
      slug: `transcript-course-${randomUUID()}`,
      shortDescription: 'Short description',
      description: 'Long description',
      difficulty: CourseDifficulty.BEGINNER,
      categoryId: category.id,
      ownerInstructorId: instructorId,
      status,
      publishedAt: status === CourseStatus.PUBLISHED ? new Date() : null,
      modules: {
        create: {
          title: 'Module 1',
          position: 1,
          lessons: {
            create: {
              title: 'Video Lesson',
              position: 1,
              lessonType: LessonType.VIDEO,
            },
          },
        },
      },
    },
    include: { modules: { include: { lessons: true } } },
  });
  const lesson = course.modules[0]?.lessons[0];
  if (!lesson) {
    throw new Error('missing lesson');
  }
  const video = await prisma.videoAsset.create({
    data: {
      lessonId: lesson.id,
      status: VideoAssetStatus.READY,
      originalFilename: 'lesson.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1000n,
      durationSeconds: 120,
      sourceObjectKey: `videos/source/${randomUUID()}.mp4`,
      masterPlaylistObjectKey: `videos/processed/${randomUUID()}/master.m3u8`,
      createdByUserId: instructorId,
      readyAt: new Date(),
    },
  });

  return { course, lesson, video };
}

async function enroll(student: TestUser, courseId: string) {
  await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).expect(201);
}

describe('video transcript domain', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedReferenceData();
  });

  beforeEach(async () => {
    await clearData();
    await seedReferenceData();
    app = createApp({ env: testEnv, logger: createLogger('test'), prisma });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('creates manual transcripts, normalizes ordering, supports multiple languages, and enforces ownership', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const otherInstructor = await createUser([RoleName.INSTRUCTOR]);
    const { video } = await createReadyVideo(instructor.id);

    const manual = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'vi',
        title: 'Tieng Viet',
        status: 'READY',
        segments: [
          { startTimeMs: 4200, endTimeMs: 7000, text: 'Dong sau' },
          { startTimeMs: 1000, endTimeMs: 4000, text: 'Dong dau' },
        ],
      });

    expect(manual.status).toBe(201);
    expect(manual.body.transcript.source).toBe('MANUAL');
    expect(manual.body.transcript.segments.map((segment: { text: string }) => segment.text)).toEqual(['Dong dau', 'Dong sau']);

    const english = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'en',
        title: 'English',
        status: 'READY',
        segments: [{ startTimeMs: 1000, endTimeMs: 4000, text: 'Welcome' }],
      });

    expect(english.status).toBe(201);

    const list = await request(app)
      .get(`/api/v1/instructor/videos/${video.id}/transcripts`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(list.body.transcripts.map((transcript: { language: string }) => transcript.language).sort()).toEqual(['en', 'vi']);

    const denied = await request(app)
      .get(`/api/v1/instructor/videos/${video.id}/transcripts`)
      .set('Authorization', `Bearer ${otherInstructor.token}`);
    expect(denied.status).toBe(404);
  });

  it('imports SRT and WebVTT, parses milliseconds, and rejects invalid content', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const { video } = await createReadyVideo(instructor.id);

    const srt = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts/import`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'en',
        filename: 'lesson.srt',
        content: '1\n00:00:01,000 --> 00:00:04,200\nWelcome.\n\n2\n00:00:04,250 --> 00:00:07,000\nBuild the API.',
      });

    expect(srt.status).toBe(201);
    expect(srt.body.transcript.source).toBe('FILE_UPLOAD');
    expect(srt.body.transcript.segments[0].startTimeMs).toBe(1000);
    expect(srt.body.transcript.segments[0].endTimeMs).toBe(4200);

    const vtt = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts/import`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'vi',
        filename: 'lesson.vtt',
        content: 'WEBVTT\n\n00:00:02.500 --> 00:00:05.750\nXin chao.\n\n00:00:06.000 --> 00:00:08.000\nHoc tiep.',
      });

    expect(vtt.status).toBe(201);
    expect(vtt.body.transcript.segments[0].startTimeMs).toBe(2500);
    expect(vtt.body.transcript.segments[0].endTimeMs).toBe(5750);

    const invalidTime = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'fr',
        status: 'READY',
        segments: [{ startTimeMs: 5000, endTimeMs: 4000, text: 'Bad' }],
      });
    expect(invalidTime.status).toBe(422);

    const empty = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts/import`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ language: 'de', filename: 'empty.srt', content: '1\nnot a timestamp\n\n' });
    expect(empty.status).toBe(422);
  });

  it('returns only READY transcripts to enrolled students and hides draft transcripts', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { course, lesson, video } = await createReadyVideo(instructor.id);
    await enroll(student, course.id);

    const ready = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'en',
        status: 'READY',
        segments: [{ startTimeMs: 1000, endTimeMs: 4000, text: 'Ready transcript' }],
      });
    const draft = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'vi',
        status: 'DRAFT',
        segments: [{ startTimeMs: 1000, endTimeMs: 4000, text: 'Draft transcript' }],
      });

    const tracks = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/transcripts`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(tracks.status).toBe(200);
    expect(tracks.body.transcripts.map((transcript: { id: string }) => transcript.id)).toEqual([ready.body.transcript.id]);
    expect(JSON.stringify(tracks.body)).not.toContain('sourceObjectKey');

    const content = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/transcripts/${ready.body.transcript.id}`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(content.status).toBe(200);
    expect(content.body.transcript.segments[0].text).toBe('Ready transcript');
    expect(JSON.stringify(content.body)).not.toContain('source');

    const hidden = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/transcripts/${draft.body.transcript.id}`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(hidden.status).toBe(404);

    const notEnrolled = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/transcripts`)
      .set('Authorization', `Bearer ${otherStudent.token}`);
    expect(notEnrolled.status).toBe(404);
  });

  it('updates and deletes transcripts with segment cleanup', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const { video } = await createReadyVideo(instructor.id);

    const created = await request(app)
      .post(`/api/v1/instructor/videos/${video.id}/transcripts`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'en',
        status: 'DRAFT',
        segments: [{ startTimeMs: 1000, endTimeMs: 4000, text: 'Original' }],
      });

    const updated = await request(app)
      .patch(`/api/v1/instructor/videos/${video.id}/transcripts/${created.body.transcript.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        status: TranscriptStatus.READY,
        segments: [{ startTimeMs: 2000, endTimeMs: 5000, text: 'Updated' }],
      });

    expect(updated.status).toBe(200);
    expect(updated.body.transcript.status).toBe('READY');
    expect(updated.body.transcript.segments).toHaveLength(1);
    expect(updated.body.transcript.segments[0].text).toBe('Updated');

    await request(app)
      .delete(`/api/v1/instructor/videos/${video.id}/transcripts/${created.body.transcript.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(204);

    expect(await prisma.videoTranscriptSegment.count({ where: { transcriptId: created.body.transcript.id } })).toBe(0);
  });
});
