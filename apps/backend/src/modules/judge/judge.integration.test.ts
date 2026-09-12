import { randomUUID } from 'node:crypto';
import {
  CheckpointProgressStatus,
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  JudgeSubmissionStatus,
  LearningActivityType,
  LessonProgressStatus,
  LessonType,
  RoleName,
  ScoringMode,
  TestCaseVisibility,
  VideoAssetStatus,
  VideoCheckpointType,
  type PrismaClient,
} from '@prisma/client';
import { PrismaClient as Prisma } from '@prisma/client';
import type { Express } from 'express';
import type { Client as MinioClient } from 'minio';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type AsyncMessage, type CodeJudgeCompletedPayload, type CodeJudgeRequestedPayload } from '@codesync/shared';
import { createApp } from '../../app';
import type { Env } from '../../config';
import { createLogger } from '../../shared/logger';
import { TokenService } from '../auth/token.service';
import { JudgeRepository } from './judge.repository';
import { JudgeService } from './judge.service';
import { LearningRepository } from '../learning/learning.repository';
import { LearningService } from '../learning/learning.service';

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
  WORKSPACE_MAX_FILES: 3,
  WORKSPACE_MAX_FILE_BYTES: 1000,
  WORKSPACE_MAX_TOTAL_BYTES: 2000,
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

const prisma: PrismaClient = new Prisma({ datasources: { db: { url: testEnv.DATABASE_URL } } });
const tokenService = new TokenService(testEnv);
const storage = { presignedGetObject: async () => 'http://localhost:9000/playback-url' } as unknown as MinioClient;
const logger = createLogger('test');
let app: Express;
let publishedMessages: AsyncMessage<CodeJudgeRequestedPayload>[] = [];

async function seedReferenceData() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.courseCategory.upsert({
    where: { slug: 'judge' },
    update: { name: 'Judge' },
    create: { name: 'Judge', slug: 'judge' },
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
      roles: { create: roles.map((name) => ({ role: { connect: { name } } })) },
    },
  });

  return { id: user.id, token: tokenService.issueAccessToken(user.id, randomUUID(), roles) };
}

async function seedCodingCheckpoint(instructorId: string, studentId?: string) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'judge' } });
  const course = await prisma.course.create({
    data: {
      title: 'Judge Course',
      slug: `judge-course-${randomUUID()}`,
      shortDescription: 'Judge',
      description: 'Judge course',
      status: CourseStatus.PUBLISHED,
      difficulty: CourseDifficulty.BEGINNER,
      ownerInstructorId: instructorId,
      categoryId: category.id,
      publishedAt: new Date(),
      modules: { create: [{ title: 'Module', position: 1, lessons: { create: [{ title: 'Video', position: 1, lessonType: LessonType.VIDEO }] } }] },
    },
    include: { modules: { include: { lessons: true } } },
  });
  const lesson = course.modules[0]!.lessons[0]!;
  const video = await prisma.videoAsset.create({
    data: {
      lessonId: lesson.id,
      status: VideoAssetStatus.READY,
      originalFilename: 'judge.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1000,
      sourceObjectKey: 'source.mp4',
      masterPlaylistObjectKey: 'master.m3u8',
      durationSeconds: 100,
      createdByUserId: instructorId,
    },
  });
  const checkpoint = await prisma.videoCheckpoint.create({
    data: {
      lessonId: lesson.id,
      videoAssetId: video.id,
      timestampSeconds: 10,
      type: VideoCheckpointType.CODING,
      title: 'Add numbers',
      required: true,
      pauseVideo: true,
      position: 10,
    },
  });

  if (studentId) {
    await prisma.enrollment.create({ data: { studentId, courseId: course.id, status: EnrollmentStatus.ACTIVE } });
    await prisma.videoProgress.create({
      data: {
        studentId,
        videoAssetId: video.id,
        lessonId: lesson.id,
        lastPositionSeconds: 90,
        furthestPositionSeconds: 90,
        watchedPercent: 90,
        completedAt: new Date(),
      },
    });
  }

  return { course, lesson, video, checkpoint };
}

function createJudgeService() {
  return new JudgeService(
    prisma,
    new JudgeRepository(prisma),
    { publishJudgeRequested: (message) => publishedMessages.push(message) },
    testEnv,
    logger,
    new LearningService(prisma, new LearningRepository(prisma)),
  );
}

describe('automated judge integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedReferenceData();
  });

  beforeEach(async () => {
    await clearData();
    await seedReferenceData();
    publishedMessages = [];
    app = createApp({
      env: testEnv,
      logger,
      prisma,
      storage,
      judgePublisher: { publishJudgeRequested: (message) => publishedMessages.push(message) },
    });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('lets only the owner instructor configure coding tests and keeps public/hidden tests deterministic', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const otherInstructor = await createUser([RoleName.INSTRUCTOR]);
    const { checkpoint } = await seedCodingCheckpoint(instructor.id);

    const config = await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/coding`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        language: 'javascript',
        entryFile: 'index.js',
        starterFiles: [{ path: 'index.js', content: 'const fs = require("fs");\n' }],
        timeLimitMs: 1000,
        memoryLimitMb: 128,
        passScore: 70,
        scoringMode: ScoringMode.WEIGHTED,
      });
    const publicTest = await request(app)
      .post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Sample', visibility: TestCaseVisibility.PUBLIC, input: '2 3', expectedOutput: '5', weight: 40 });
    const hiddenTest = await request(app)
      .post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Hidden', visibility: TestCaseVisibility.HIDDEN, input: '-1 2', expectedOutput: '1', weight: 60 });
    const denied = await request(app)
      .post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`)
      .set('Authorization', `Bearer ${otherInstructor.token}`)
      .send({ name: 'Nope', visibility: TestCaseVisibility.PUBLIC, input: '', expectedOutput: '', weight: 1 });
    const invalidWeight = await request(app)
      .post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Bad', visibility: TestCaseVisibility.PUBLIC, input: '', expectedOutput: '', weight: 0 });
    const fetched = await request(app)
      .get(`/api/v1/instructor/checkpoints/${checkpoint.id}/coding`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(config.status).toBe(200);
    expect(publicTest.status).toBe(201);
    expect(hiddenTest.status).toBe(201);
    expect(denied.status).toBe(400);
    expect(invalidWeight.status).toBe(400);
    expect(fetched.body.config.publicTests).toHaveLength(1);
    expect(fetched.body.config.hiddenTestCount).toBe(1);
    expect(fetched.body.testCases.map((test: { id: string }) => test.id)).toEqual([
      publicTest.body.testCase.id,
      hiddenTest.body.testCase.id,
    ]);
  });

  it('queues an immutable submission snapshot and includes hidden tests only in the internal judge message', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedCodingCheckpoint(instructor.id, student.id);
    await request(app).put(`/api/v1/instructor/checkpoints/${checkpoint.id}/coding`).set('Authorization', `Bearer ${instructor.token}`).send({ language: 'javascript', entryFile: 'index.js' });
    await request(app).post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`).set('Authorization', `Bearer ${instructor.token}`).send({ name: 'Sample', visibility: 'PUBLIC', input: '2 3', expectedOutput: '5', weight: 50 });
    await request(app).post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`).set('Authorization', `Bearer ${instructor.token}`).send({ name: 'Hidden', visibility: 'HIDDEN', input: '10 5', expectedOutput: '15', weight: 50 });
    const opened = await request(app).post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`).set('Authorization', `Bearer ${student.token}`).send();

    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'index.js', content: 'console.log("first");\n' }] });
    const submitted = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/submissions`)
      .set('Authorization', `Bearer ${student.token}`)
      .set('x-correlation-id', 'judge-correlation')
      .send();
    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'index.js', content: 'console.log("second");\n' }] });

    expect(submitted.status).toBe(202);
    expect(submitted.body.status).toBe(JudgeSubmissionStatus.QUEUED);
    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]!.correlationId).toBe('judge-correlation');
    expect(publishedMessages[0]!.payload.files[0]!.content).toContain('first');
    expect(publishedMessages[0]!.payload.files[0]!.content).not.toContain('second');
    expect(publishedMessages[0]!.payload.testCases.some((test) => test.visibility === TestCaseVisibility.HIDDEN && test.expectedOutput === '15')).toBe(true);
  });

  it('persists completed judge results idempotently, sanitizes hidden results, and completes checkpoint and lesson', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint, lesson } = await seedCodingCheckpoint(instructor.id, student.id);
    await request(app).put(`/api/v1/instructor/checkpoints/${checkpoint.id}/coding`).set('Authorization', `Bearer ${instructor.token}`).send({ language: 'javascript', entryFile: 'index.js' });
    const publicTest = await request(app).post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`).set('Authorization', `Bearer ${instructor.token}`).send({ name: 'Sample', visibility: 'PUBLIC', input: '2 3', expectedOutput: '5', weight: 50 });
    const hiddenTest = await request(app).post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`).set('Authorization', `Bearer ${instructor.token}`).send({ name: 'Hidden Secret', visibility: 'HIDDEN', input: '10 5', expectedOutput: '15', weight: 50 });
    const opened = await request(app).post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`).set('Authorization', `Bearer ${student.token}`).send();
    const submitted = await request(app).post(`/api/v1/workspaces/${opened.body.workspace.id}/submissions`).set('Authorization', `Bearer ${student.token}`).send();
    const message: AsyncMessage<CodeJudgeCompletedPayload> = {
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId: 'judge-result-correlation',
      requestedByUserId: student.id,
      createdAt: new Date().toISOString(),
      payload: {
        submissionId: submitted.body.id,
        totalScore: 100,
        maxScore: 100,
        passed: true,
        totalTests: 2,
        passedTests: 2,
        durationMs: 50,
        peakMemoryBytes: null,
        testResults: [
          { testCaseId: publicTest.body.testCase.id, name: 'Sample', visibility: 'PUBLIC', status: 'PASSED', scoreEarned: 50, actualOutput: '5\n', stderr: '', durationMs: 20, memoryBytes: null },
          { testCaseId: hiddenTest.body.testCase.id, name: 'Hidden Secret', visibility: 'HIDDEN', status: 'PASSED', scoreEarned: 50, actualOutput: '15\n', stderr: 'secret', durationMs: 30, memoryBytes: null },
        ],
      },
    };
    const service = createJudgeService();

    await service.applyCompleted(message);
    await service.applyCompleted(message);

    const detail = await request(app).get(`/api/v1/submissions/${submitted.body.id}`).set('Authorization', `Bearer ${student.token}`);
    const history = await request(app).get(`/api/v1/workspaces/${opened.body.workspace.id}/submissions`).set('Authorization', `Bearer ${student.token}`);
    const progress = await prisma.checkpointProgress.findUniqueOrThrow({ where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } } });
    const lessonProgress = await prisma.lessonProgress.findUniqueOrThrow({ where: { studentId_lessonId: { studentId: student.id, lessonId: lesson.id } } });

    expect(detail.status).toBe(200);
    expect(detail.body.submission.status).toBe(JudgeSubmissionStatus.ACCEPTED);
    expect(detail.body.submission.result.testResults[1].name).toBe('Hidden test #1');
    expect(detail.body.submission.result.testResults[1].actualOutput).toBeNull();
    expect(JSON.stringify(detail.body)).not.toContain('Hidden Secret');
    expect(JSON.stringify(detail.body)).not.toContain('secret');
    expect(history.body.items[0].id).toBe(submitted.body.id);
    expect(await prisma.judgeResult.count({ where: { submissionId: submitted.body.id } })).toBe(1);
    expect(await prisma.testCaseResult.count()).toBe(2);
    expect(progress.status).toBe(CheckpointProgressStatus.COMPLETED);
    expect(lessonProgress.status).toBe(LessonProgressStatus.COMPLETED);
    expect(await prisma.learningActivity.count({ where: { userId: student.id, type: LearningActivityType.CODING_PASSED } })).toBe(1);
  });

  it('does not complete or revert checkpoints for rejected submissions', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedCodingCheckpoint(instructor.id, student.id);
    await request(app).put(`/api/v1/instructor/checkpoints/${checkpoint.id}/coding`).set('Authorization', `Bearer ${instructor.token}`).send({ language: 'javascript', entryFile: 'index.js' });
    const publicTest = await request(app).post(`/api/v1/instructor/checkpoints/${checkpoint.id}/test-cases`).set('Authorization', `Bearer ${instructor.token}`).send({ name: 'Sample', visibility: 'PUBLIC', input: '2 3', expectedOutput: '5', weight: 100 });
    const opened = await request(app).post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`).set('Authorization', `Bearer ${student.token}`).send();
    const submitted = await request(app).post(`/api/v1/workspaces/${opened.body.workspace.id}/submissions`).set('Authorization', `Bearer ${student.token}`).send();
    const service = createJudgeService();

    await service.applyCompleted({
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId: 'rejected',
      requestedByUserId: student.id,
      createdAt: new Date().toISOString(),
      payload: {
        submissionId: submitted.body.id,
        totalScore: 0,
        maxScore: 100,
        passed: false,
        totalTests: 1,
        passedTests: 0,
        durationMs: 20,
        peakMemoryBytes: null,
        testResults: [{ testCaseId: publicTest.body.testCase.id, name: 'Sample', visibility: 'PUBLIC', status: 'WRONG_ANSWER', scoreEarned: 0, actualOutput: '6\n', stderr: '', durationMs: 20, memoryBytes: null }],
      },
    });

    expect(await prisma.checkpointProgress.findUnique({ where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } } })).toBeNull();
  });
});
