import { randomUUID } from 'node:crypto';
import {
  ExecutionStatus,
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
import { type AsyncMessage, type CodeExecutionRequestedPayload, type CodeJudgeCompletedPayload, type CodeJudgeRequestedPayload } from '@codesync/shared';
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
let publishedExecutionMessages: AsyncMessage<CodeExecutionRequestedPayload>[] = [];

async function seedRoles() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
}

async function clearData() {
  await prisma.testCaseResult.deleteMany();
  await prisma.judgeResult.deleteMany();
  await prisma.judgeSubmission.deleteMany();
  await prisma.executionResult.deleteMany();
  await prisma.executionRequest.deleteMany();
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

async function createTwoSumDraftProblem(instructor: TestUser, slug = `two-sum-${randomUUID()}`) {
  return request(app)
    .post('/api/v1/instructor/practice/problems')
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({
      title: 'Two Sum',
      slug,
      description: 'Return indexes of the two numbers that add to target.',
      inputFormat: 'solution(input) receives { nums: number[], target: number }.',
      outputFormat: 'Return an array of two indexes.',
      constraints: 'Exactly one solution exists.',
      difficulty: PracticeDifficulty.EASY,
      starterFiles: [{ path: 'index.js', content: 'function solution(input) {\n  return [];\n}\n\nmodule.exports = { solution };\n' }],
      referenceFiles: [{
        path: 'index.js',
        content: 'function solution(input) {\n  const seen = new Map();\n  for (let index = 0; index < input.nums.length; index += 1) {\n    const need = input.target - input.nums[index];\n    if (seen.has(need)) return [seen.get(need), index];\n    seen.set(input.nums[index], index);\n  }\n  return [];\n}\n\nmodule.exports = { solution };\n',
      }],
      executionContract: 'FUNCTION',
      tags: ['arrays'],
    });
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
    publishedExecutionMessages = [];
    app = createApp({
      env: testEnv,
      logger,
      prisma,
      storage,
      judgePublisher: { publishJudgeRequested: (message) => publishedMessages.push(message) },
      codeExecutionPublisher: { publishExecutionRequested: (message) => publishedExecutionMessages.push(message) },
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
        description: 'Return the sum of two numbers.',
        inputFormat: 'solution(input) receives { "a": number, "b": number }.',
        outputFormat: 'Return the numeric sum.',
        constraints: '-100000 <= a, b <= 100000',
        difficulty: PracticeDifficulty.EASY,
        starterFiles: [{
          path: 'index.js',
          content: 'function solution(input) {\n  return input.a + input.b;\n}\n\nmodule.exports = { solution };\n',
        }],
        referenceFiles: [{
          path: 'index.js',
          content: 'function solution(input) {\n  return input.a + input.b;\n}\n\nmodule.exports = { solution };\n',
        }],
        executionContract: 'FUNCTION',
        tags: ['arrays', 'warmup'],
      });
    const publishBeforeTests = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const publicTest = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Sample', visibility: TestCaseVisibility.PUBLIC, input: '{"a":2,"b":3}', expectedOutput: '5', weight: 50 });
    const hiddenTest = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Hidden', visibility: TestCaseVisibility.HIDDEN, input: '{"a":10,"b":20}', expectedOutput: '30', weight: 50 });
    const publishBeforeValidation = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const validated = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/validate`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
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
      .send({ files: [{ path: 'index.js', content: 'function solution(input) {\n  return input.a + input.b;\n}\n\nmodule.exports = { solution };\n' }] });
    const submitted = await request(app)
      .post(`/api/v1/practice/problems/${created.body.problem.id}/submissions`)
      .set('Authorization', `Bearer ${student.token}`)
      .set('x-correlation-id', 'practice-correlation')
      .send();

    expect(created.status).toBe(201);
    expect(publishBeforeTests.status).toBe(422);
    expect(publicTest.status).toBe(201);
    expect(hiddenTest.status).toBe(201);
    expect(publishBeforeValidation.status).toBe(422);
    expect(validated.status).toBe(200);
    expect(validated.body.valid).toBe(true);
    expect(published.body.problem.status).toBe(PracticeProblemStatus.PUBLISHED);
    expect(catalog.body.items).toHaveLength(1);
    expect(detail.body.problem.publicTests).toHaveLength(1);
    expect(JSON.stringify(detail.body)).not.toContain('"a":10');
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
          { testCaseId: publicTest.body.testCase.id, name: 'Sample', visibility: 'PUBLIC', status: 'PASSED', scoreEarned: 50, actualOutput: '5', stderr: '', durationMs: 20, memoryBytes: null },
          { testCaseId: hiddenTest.body.testCase.id, name: 'Hidden', visibility: 'HIDDEN', status: 'PASSED', scoreEarned: 50, actualOutput: '30', stderr: 'secret', durationMs: 20, memoryBytes: null },
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

  it('imports tests and blocks publishing stale practice validation', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);

    const created = await request(app)
      .post('/api/v1/instructor/practice/problems')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'Echo text',
        slug: 'echo-text',
        description: 'Return the input value.',
        inputFormat: 'solution(input) receives a JSON value.',
        outputFormat: 'Return the same JSON value.',
        constraints: 'Input is at most 1000 bytes.',
        difficulty: PracticeDifficulty.EASY,
        starterFiles: [{ path: 'index.js', content: 'function solution(input) {\n  return input;\n}\n\nmodule.exports = { solution };\n' }],
        referenceFiles: [{ path: 'index.js', content: 'function solution(input) {\n  return input;\n}\n\nmodule.exports = { solution };\n' }],
        executionContract: 'FUNCTION',
        tags: ['warmup'],
      });

    const imported = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-cases/import`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        version: 1,
        mode: 'REPLACE',
        testCases: [
          { name: 'Public echo', visibility: TestCaseVisibility.PUBLIC, input: '"hello"', expectedOutput: '"hello"', weight: 50 },
          { name: 'Hidden echo', visibility: TestCaseVisibility.HIDDEN, input: '"secret"', expectedOutput: '"secret"', weight: 50 },
        ],
      });
    const validated = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/validate`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const editAfterValidation = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Another public', visibility: TestCaseVisibility.PUBLIC, input: '"bye"', expectedOutput: '"bye"', weight: 10 });
    const stalePublish = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const revalidated = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/validate`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const published = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();

    expect(imported.status).toBe(201);
    expect(imported.body.imported).toBe(2);
    expect(imported.body.publicCount).toBe(1);
    expect(imported.body.hiddenCount).toBe(1);
    expect(validated.body.valid).toBe(true);
    expect(editAfterValidation.status).toBe(201);
    expect(stalePublish.status).toBe(422);
    expect(JSON.stringify(stalePublish.body)).toContain('Problem content changed after the last successful validation');
    expect(revalidated.body.valid).toBe(true);
    expect(published.body.problem.status).toBe(PracticeProblemStatus.PUBLISHED);
  });

  it('generates practice expected outputs from reference execution before committing tests', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);

    const created = await request(app)
      .post('/api/v1/instructor/practice/problems')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'Double value',
        slug: 'double-value',
        description: 'Return input.value * 2.',
        inputFormat: 'solution(input) receives { "value": number }.',
        outputFormat: 'Return a number.',
        constraints: 'value is an integer.',
        difficulty: PracticeDifficulty.EASY,
        starterFiles: [{ path: 'index.js', content: 'function solution(input) {\n  return input.value * 2;\n}\n\nmodule.exports = { solution };\n' }],
        referenceFiles: [{ path: 'index.js', content: 'function solution(input) {\n  return input.value * 2;\n}\n\nmodule.exports = { solution };\n' }],
        executionContract: 'FUNCTION',
        tags: ['math'],
      });

    const preview = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-generation/import-preview`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .set('x-correlation-id', 'practice-generation')
      .send({
        version: 1,
        visibility: TestCaseVisibility.HIDDEN,
        tests: [
          { name: 'Positive', input: { value: 2 }, weight: 20 },
          { name: 'Negative', input: { value: -3 }, weight: 20 },
        ],
      });

    const commitBeforeExecution = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-generation/commit`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        executionId: preview.body.executionId,
        mode: 'APPEND',
        visibility: TestCaseVisibility.HIDDEN,
        source: 'IMPORT',
      });

    await prisma.executionResult.create({
      data: {
        executionRequestId: preview.body.executionId,
        exitCode: 0,
        stdout: JSON.stringify({
          tests: [
            { name: 'Positive', input: { value: 2 }, weight: 20, expectedOutput: '4' },
            { name: 'Negative', input: { value: -3 }, weight: 20, expectedOutput: '-6' },
          ],
        }),
        stderr: '',
        durationMs: 25,
      },
    });
    await prisma.executionRequest.update({
      where: { id: preview.body.executionId },
      data: { status: ExecutionStatus.SUCCEEDED, startedAt: new Date(), completedAt: new Date() },
    });

    const executionDetail = await request(app)
      .get(`/api/v1/instructor/practice/executions/${preview.body.executionId}`)
      .set('Authorization', `Bearer ${instructor.token}`);
    const committed = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-generation/commit`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        executionId: preview.body.executionId,
        mode: 'APPEND',
        visibility: TestCaseVisibility.HIDDEN,
        source: 'IMPORT',
      });
    const publicTest = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-cases`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ name: 'Public sample', visibility: TestCaseVisibility.PUBLIC, input: '{"value":1}', expectedOutput: '2', weight: 10 });
    const validated = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/validate`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    await request(app)
      .patch(`/api/v1/instructor/practice/problems/${created.body.problem.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        referenceFiles: [{ path: 'index.js', content: 'function solution(input) {\n  return input.value * 3;\n}\n\nmodule.exports = { solution };\n' }],
      });
    const staleValidation = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/validate`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();

    expect(preview.status).toBe(202);
    expect(preview.body.status).toBe(ExecutionStatus.QUEUED);
    expect(preview.body.referenceFingerprint).toEqual(expect.any(String));
    expect(commitBeforeExecution.status).toBe(400);
    expect(publishedExecutionMessages).toHaveLength(1);
    expect(publishedExecutionMessages[0]!.correlationId).toBe('practice-generation');
    expect(publishedExecutionMessages[0]!.payload.executionId).toBe(preview.body.executionId);
    expect(publishedExecutionMessages[0]!.payload.executionMode).toBe('PRACTICE_ORACLE_BATCH');
    expect(publishedExecutionMessages[0]!.payload.stdin).toContain('"value":2');
    expect(executionDetail.body.execution.status).toBe(ExecutionStatus.SUCCEEDED);
    expect(committed.status).toBe(201);
    expect(committed.body.committed).toBe(2);
    expect(committed.body.testCases.filter((test: { readonly expectedOutputSource?: string }) => test.expectedOutputSource === 'REFERENCE_SOLUTION')).toHaveLength(2);
    expect(publicTest.status).toBe(201);
    expect(validated.body.valid).toBe(true);
    expect(staleValidation.body.valid).toBe(false);
    expect(staleValidation.body.issues).toContain('Expected outputs are stale. Regenerate expected outputs from the current reference solution.');
  });

  it('queues public example expected-output preview without persisting tests', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);

    const created = await request(app)
      .post('/api/v1/instructor/practice/problems')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'Two Sum',
        slug: 'two-sum-public-preview',
        description: 'Return indexes of the two numbers that add to target.',
        inputFormat: 'solution(input) receives { nums: number[], target: number }.',
        outputFormat: 'Return an array of two indexes.',
        constraints: 'Exactly one solution exists.',
        difficulty: PracticeDifficulty.EASY,
        starterFiles: [{ path: 'index.js', content: 'function solution(input) {\n  return [];\n}\n\nmodule.exports = { solution };\n' }],
        referenceFiles: [{
          path: 'index.js',
          content: 'function solution(input) {\n  const seen = new Map();\n  for (let index = 0; index < input.nums.length; index += 1) {\n    const need = input.target - input.nums[index];\n    if (seen.has(need)) return [seen.get(need), index];\n    seen.set(input.nums[index], index);\n  }\n  return [];\n}\n\nmodule.exports = { solution };\n',
        }],
        executionContract: 'FUNCTION',
        tags: ['arrays'],
      });
    await prisma.workspace.create({
      data: {
        userId: instructor.id,
        practiceProblemId: created.body.problem.id,
        language: 'javascript',
        entryFile: 'index.js',
        lastOpenedAt: new Date(),
        files: {
          create: [{ path: 'index.js', content: 'module.exports = { solution: () => [] };' }],
        },
      },
    });

    const preview = await request(app)
      .post(`/api/v1/instructor/practice/problems/${created.body.problem.id}/test-generation/import-preview`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .set('x-correlation-id', 'afa50d19-78b8-46ff-bb8c-8ba9ad623c46')
      .send({
        version: 1,
        visibility: TestCaseVisibility.PUBLIC,
        tests: [
          {
            name: 'Example 2',
            input: {
              nums: [3, 2, 4],
              target: 6,
            },
            weight: 10,
          },
        ],
      });

    expect(preview.status).toBe(202);
    expect(preview.body).toMatchObject({
      executionId: expect.any(String),
      status: ExecutionStatus.QUEUED,
      visibility: TestCaseVisibility.PUBLIC,
      source: 'IMPORT',
      referenceFingerprint: expect.any(String),
      generationVersion: 'practice-test-generation-v1',
    });
    expect(publishedExecutionMessages).toHaveLength(1);
    expect(publishedExecutionMessages[0]!.correlationId).toBe('afa50d19-78b8-46ff-bb8c-8ba9ad623c46');
    expect(publishedExecutionMessages[0]!.payload).toMatchObject({
      executionId: preview.body.executionId,
      language: 'javascript',
      entryFile: 'index.js',
      executionMode: 'PRACTICE_ORACLE_BATCH',
    });
    expect(JSON.parse(publishedExecutionMessages[0]!.payload.stdin ?? '')).toEqual({
      tests: [
        {
          name: 'Example 2',
          input: {
            nums: [3, 2, 4],
            target: 6,
          },
          weight: 10,
        },
      ],
    });
    const previewExecution = await prisma.executionRequest.findUniqueOrThrow({
      where: { id: preview.body.executionId },
      include: { workspace: true },
    });
    expect(previewExecution.workspace.practiceProblemId).toBeNull();
    await expect(prisma.practiceProblemTestCase.count({ where: { practiceProblemId: created.body.problem.id } })).resolves.toBe(0);
  });

  it('deletes generated hidden tests by source, invalidates validation, and preserves student hidden-test isolation', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const created = await createTwoSumDraftProblem(instructor, 'two-sum-hidden-delete');
    const problemId = created.body.problem.id as string;

    await prisma.practiceProblemTestCase.createMany({
      data: [
        {
          practiceProblemId: problemId,
          name: 'Example 1',
          visibility: TestCaseVisibility.PUBLIC,
          input: '{"nums":[2,7,11,15],"target":9}',
          expectedOutput: '[0,1]',
          source: 'EXAMPLE',
          expectedOutputSource: 'REFERENCE_SOLUTION',
          referenceFingerprint: created.body.problem.currentReferenceFingerprint,
          generationVersion: 'practice-test-generation-v1',
          weight: 10,
          position: 1,
        },
        {
          practiceProblemId: problemId,
          name: 'Example 2',
          visibility: TestCaseVisibility.PUBLIC,
          input: '{"nums":[3,2,4],"target":6}',
          expectedOutput: '[1,2]',
          source: 'EXAMPLE',
          expectedOutputSource: 'REFERENCE_SOLUTION',
          referenceFingerprint: created.body.problem.currentReferenceFingerprint,
          generationVersion: 'practice-test-generation-v1',
          weight: 10,
          position: 2,
        },
        ...Array.from({ length: 8 }, (_, index) => ({
          practiceProblemId: problemId,
          name: `Import Hidden ${index + 1}`,
          visibility: TestCaseVisibility.HIDDEN,
          input: JSON.stringify({ nums: [index, index + 10, index + 20], target: index + 10 }),
          expectedOutput: '[0,1]',
          source: 'IMPORT',
          expectedOutputSource: 'REFERENCE_SOLUTION',
          referenceFingerprint: created.body.problem.currentReferenceFingerprint,
          generationVersion: 'practice-test-generation-v1',
          weight: 10,
          position: index + 3,
        })),
        ...Array.from({ length: 8 }, (_, index) => ({
          practiceProblemId: problemId,
          name: `Generator Hidden ${index + 1}`,
          visibility: TestCaseVisibility.HIDDEN,
          input: JSON.stringify({ nums: [index + 100, index + 200, index + 300], target: index + 300 }),
          expectedOutput: '[0,1]',
          source: 'GENERATOR',
          expectedOutputSource: 'REFERENCE_SOLUTION',
          referenceFingerprint: created.body.problem.currentReferenceFingerprint,
          generationVersion: 'practice-test-generation-v1',
          weight: 10,
          position: index + 11,
        })),
      ],
    });

    const before = await request(app)
      .get(`/api/v1/instructor/practice/problems/${problemId}`)
      .set('Authorization', `Bearer ${instructor.token}`);
    const validated = await request(app)
      .post(`/api/v1/instructor/practice/problems/${problemId}/validate`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const deletedGenerator = await request(app)
      .delete(`/api/v1/instructor/practice/problems/${problemId}/test-cases/hidden/source/GENERATOR`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const stalePublish = await request(app)
      .post(`/api/v1/instructor/practice/problems/${problemId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const revalidated = await request(app)
      .post(`/api/v1/instructor/practice/problems/${problemId}/validate`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const published = await request(app)
      .post(`/api/v1/instructor/practice/problems/${problemId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send();
    const studentDetail = await request(app)
      .get('/api/v1/practice/problems/two-sum-hidden-delete')
      .set('Authorization', `Bearer ${student.token}`);

    expect(before.body.problem.testCases.filter((test: { readonly visibility: string }) => test.visibility === 'PUBLIC')).toHaveLength(2);
    expect(before.body.problem.testCases.filter((test: { readonly visibility: string }) => test.visibility === 'HIDDEN')).toHaveLength(16);
    expect(before.body.problem.testCases).toHaveLength(18);
    expect(validated.body.valid).toBe(true);
    expect(deletedGenerator.status).toBe(200);
    expect(deletedGenerator.body.deleted).toBe(8);
    expect(deletedGenerator.body.publicCount).toBe(2);
    expect(deletedGenerator.body.hiddenCount).toBe(8);
    expect(deletedGenerator.body.testCases).toHaveLength(10);
    expect(deletedGenerator.body.testCases.some((test: { readonly source?: string }) => test.source === 'GENERATOR')).toBe(false);
    expect(deletedGenerator.body.testCases.filter((test: { readonly source?: string }) => test.source === 'IMPORT')).toHaveLength(8);
    expect((await prisma.practiceProblem.findUniqueOrThrow({ where: { id: problemId } })).validatedAt).toBeNull();
    expect(stalePublish.status).toBe(422);
    expect(JSON.stringify(stalePublish.body)).toContain('Problem content changed after the last successful validation');
    expect(revalidated.body.valid).toBe(true);
    expect(published.body.problem.status).toBe(PracticeProblemStatus.PUBLISHED);
    expect(studentDetail.body.problem.publicTests).toHaveLength(2);
    expect(JSON.stringify(studentDetail.body)).not.toContain('Import Hidden');
    expect(JSON.stringify(studentDetail.body)).not.toContain('"nums":[0,10,20]');
  });

  it('protects hidden test deletion by role and ownership while allowing admins', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const otherInstructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const admin = await createUser([RoleName.ADMIN]);
    const created = await createTwoSumDraftProblem(instructor, 'two-sum-hidden-delete-auth');
    const problemId = created.body.problem.id as string;
    const hidden = await prisma.practiceProblemTestCase.create({
      data: {
        practiceProblemId: problemId,
        name: 'Generated hidden',
        visibility: TestCaseVisibility.HIDDEN,
        input: '{"nums":[1,5,9],"target":6}',
        expectedOutput: '[0,1]',
        source: 'GENERATOR',
        expectedOutputSource: 'REFERENCE_SOLUTION',
        referenceFingerprint: created.body.problem.currentReferenceFingerprint,
        generationVersion: 'practice-test-generation-v1',
        weight: 10,
        position: 1,
      },
    });

    const studentDelete = await request(app)
      .delete(`/api/v1/instructor/practice/test-cases/${hidden.id}`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const otherInstructorDelete = await request(app)
      .delete(`/api/v1/instructor/practice/problems/${problemId}/test-cases/hidden`)
      .set('Authorization', `Bearer ${otherInstructor.token}`)
      .send();
    const adminDelete = await request(app)
      .delete(`/api/v1/instructor/practice/test-cases/${hidden.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send();

    expect(studentDelete.status).toBe(403);
    expect(otherInstructorDelete.status).toBe(404);
    expect(adminDelete.status).toBe(204);
    await expect(prisma.practiceProblemTestCase.findUnique({ where: { id: hidden.id } })).resolves.toBeNull();
  });
});
