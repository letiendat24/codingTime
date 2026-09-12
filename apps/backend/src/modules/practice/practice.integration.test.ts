import { randomUUID } from 'node:crypto';
import {
  JudgeSubmissionStatus,
  LearningActivityType,
  PracticeDifficulty,
  PracticeProblemStatus,
  PracticeProgressStatus,
  RoleName,
  TestCaseVisibility,
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
import { JudgeRepository } from '../judge/judge.repository';
import { JudgeService } from '../judge/judge.service';
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

async function seedRoles() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
}

async function clearData() {
  await prisma.testCaseResult.deleteMany();
  await prisma.judgeResult.deleteMany();
  await prisma.judgeSubmission.deleteMany();
  await prisma.practiceProgress.deleteMany();
  await prisma.practiceProblemTestCase.deleteMany();
  await prisma.workspaceFile.deleteMany();
  await prisma.workspaceRevision.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.practiceProblemTag.deleteMany();
  await prisma.practiceProblem.deleteMany();
  await prisma.practiceTag.deleteMany();
  await prisma.learningActivity.deleteMany();
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

describe('practice center integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedRoles();
  });

  beforeEach(async () => {
    await clearData();
    await seedRoles();
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

  it('publishes instructor practice problems and judges student submissions through the shared judge flow', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);

    const created = await request(app)
      .post('/api/v1/instructor/practice/problems')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'Add two numbers',
        slug: 'add-two-numbers',
        description: 'Read two numbers and print their sum.',
        difficulty: PracticeDifficulty.EASY,
        starterFiles: [{ path: 'index.js', content: 'const fs = require("fs");\n' }],
        tags: ['arrays', 'warmup'],
      });
    const publishBeforeTests = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const publicTest = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Sample', visibility: TestCaseVisibility.PUBLIC, input: '2 3', expectedOutput: '5', weight: 50 });
    const hiddenTest = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Hidden', visibility: TestCaseVisibility.HIDDEN, input: '10 20', expectedOutput: '30', weight: 50 });
    const published = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const catalog = await request(app).get('/api/v1/practice/problems').set('Authorization', `Bearer ${student.token}`);
    const detail = await request(app).get('/api/v1/practice/problems/add-two-numbers').set('Authorization', `Bearer ${student.token}`);
    const opened = await request(app)
      .post(`/api/v1/practice/problems/${created.body.problem.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'index.js', content: 'console.log("5");\n' }] });
    const submitted = await request(app)
      .post(`/api/v1/practice/problems/${created.body.problem.id}/submissions`)
      .set('Authorization', `Bearer ${student.token}`)
      .set('x-correlation-id', 'practice-correlation')
      .send();

    expect(created.status).toBe(201);
    expect(publishBeforeTests.status).toBe(422);
    expect(publicTest.status).toBe(201);
    expect(hiddenTest.status).toBe(201);
    expect(published.body.problem.status).toBe(PracticeProblemStatus.PUBLISHED);
    expect(catalog.body.items).toHaveLength(1);
    expect(detail.body.problem.publicTests).toHaveLength(1);
    expect(JSON.stringify(detail.body)).not.toContain('10 20');
    expect(opened.body.workspace.practiceProblemId).toBe(created.body.problem.id);
    expect(submitted.status).toBe(202);
    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]!.payload.checkpointId).toBeNull();
    expect(publishedMessages[0]!.payload.practiceProblemId).toBe(created.body.problem.id);

    const service = createJudgeService();
    const message: AsyncMessage<CodeJudgeCompletedPayload> = {
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId: 'practice-result',
      requestedByUserId: student.id,
      createdAt: new Date().toISOString(),
      payload: {
        submissionId: submitted.body.id,
        totalScore: 100,
        maxScore: 100,
        passed: true,
        totalTests: 2,
        passedTests: 2,
        durationMs: 40,
        peakMemoryBytes: null,
        testResults: [
          { testCaseId: publicTest.body.testCase.id, name: 'Sample', visibility: 'PUBLIC', status: 'PASSED', scoreEarned: 50, actualOutput: '5\n', stderr: '', durationMs: 20, memoryBytes: null },
          { testCaseId: hiddenTest.body.testCase.id, name: 'Hidden', visibility: 'HIDDEN', status: 'PASSED', scoreEarned: 50, actualOutput: '30\n', stderr: 'secret', durationMs: 20, memoryBytes: null },
        ],
      },
    };

    await service.applyCompleted(message);
    await service.applyCompleted(message);

    const progress = await prisma.practiceProgress.findUniqueOrThrow({
      where: { studentId_practiceProblemId: { studentId: student.id, practiceProblemId: created.body.problem.id } },
    });
    const submissionDetail = await request(app).get(`/api/v1/submissions/${submitted.body.id}`).set('Authorization', `Bearer ${student.token}`);
    const history = await request(app)
      .get(`/api/v1/practice/problems/${created.body.problem.id}/submissions`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(progress.status).toBe(PracticeProgressStatus.SOLVED);
    expect(progress.attemptCount).toBe(1);
    expect(await prisma.checkpointProgress.count()).toBe(0);
    expect(await prisma.learningActivity.count({ where: { userId: student.id, type: LearningActivityType.PRACTICE_ATTEMPTED } })).toBe(1);
    expect(await prisma.learningActivity.count({ where: { userId: student.id, type: LearningActivityType.PRACTICE_SOLVED } })).toBe(1);
    expect(submissionDetail.body.submission.status).toBe(JudgeSubmissionStatus.ACCEPTED);
    expect(submissionDetail.body.submission.practiceProblemId).toBe(created.body.problem.id);
    expect(JSON.stringify(submissionDetail.body)).not.toContain('secret');
    expect(history.body.items[0].id).toBe(submitted.body.id);
  });
});
