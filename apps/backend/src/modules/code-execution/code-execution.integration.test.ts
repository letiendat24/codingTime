import { randomUUID } from 'node:crypto';
import {
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  ExecutionStatus,
  LessonType,
  RoleName,
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
import { type AsyncMessage, type CodeExecutionRequestedPayload } from '@codesync/shared';
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
  WORKSPACE_MAX_FILES: 3,
  WORKSPACE_MAX_FILE_BYTES: 100,
  WORKSPACE_MAX_TOTAL_BYTES: 200,
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
  CODE_EXECUTION_RATE_LIMIT_MAX: 1,
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
  datasources: { db: { url: testEnv.DATABASE_URL } },
});
const tokenService = new TokenService(testEnv);
const storage = {
  presignedGetObject: async () => 'http://localhost:9000/codesync-local/playback-url',
} as unknown as MinioClient;
let publishedMessages: AsyncMessage<CodeExecutionRequestedPayload>[] = [];
let app: Express;

async function seedReferenceData() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.courseCategory.upsert({
    where: { slug: 'code-execution' },
    update: { name: 'Code Execution' },
    create: { name: 'Code Execution', slug: 'code-execution' },
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
  await prisma.practiceProgress.deleteMany();
  await prisma.practiceProblemTestCase.deleteMany();
  await prisma.practiceProblemTag.deleteMany();
  await prisma.practiceProblem.deleteMany();
  await prisma.practiceTag.deleteMany();
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

  return {
    id: user.id,
    token: tokenService.issueAccessToken(user.id, randomUUID(), roles),
  };
}

async function seedVideoCheckpoint(input: {
  readonly instructorId: string;
  readonly studentId?: string;
  readonly type: VideoCheckpointType;
}) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'code-execution' } });
  const course = await prisma.course.create({
    data: {
      title: 'Coding Video Course',
      slug: `coding-video-course-${randomUUID()}`,
      shortDescription: 'Code while watching',
      description: 'Course with coding checkpoint',
      status: CourseStatus.PUBLISHED,
      difficulty: CourseDifficulty.BEGINNER,
      ownerInstructorId: input.instructorId,
      categoryId: category.id,
      publishedAt: new Date(),
      modules: {
        create: [{
          title: 'Module',
          position: 1,
          lessons: {
            create: [{ title: 'Video', position: 1, lessonType: LessonType.VIDEO }],
          },
        }],
      },
    },
    include: { modules: { include: { lessons: true } } },
  });
  const lesson = course.modules[0]?.lessons[0];

  if (!lesson) {
    throw new Error('Expected lesson');
  }

  const video = await prisma.videoAsset.create({
    data: {
      lessonId: lesson.id,
      status: VideoAssetStatus.READY,
      originalFilename: 'code.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1000,
      sourceObjectKey: 'source.mp4',
      masterPlaylistObjectKey: 'master.m3u8',
      durationSeconds: 500,
      createdByUserId: input.instructorId,
    },
  });
  const checkpoint = await prisma.videoCheckpoint.create({
    data: {
      lessonId: lesson.id,
      videoAssetId: video.id,
      timestampSeconds: 100,
      type: input.type,
      title: 'Write code',
      required: true,
      pauseVideo: true,
      position: 100,
      ...(input.type === VideoCheckpointType.CODING
        ? {
            codingConfig: {
              create: {
                language: 'javascript',
                entryFile: 'index.js',
                starterFilesJson: { files: [{ path: 'index.js', content: 'console.log("starter");\n' }] },
              },
            },
          }
        : {}),
    },
  });

  if (input.studentId) {
    await prisma.enrollment.create({
      data: { studentId: input.studentId, courseId: course.id, status: EnrollmentStatus.ACTIVE },
    });
  }

  return { course, lesson, video, checkpoint };
}

describe('code execution integration', () => {
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
      logger: createLogger('test'),
      prisma,
      storage,
      codeExecutionPublisher: {
        publishExecutionRequested: (message) => {
          publishedMessages.push(message);
        },
      },
    });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('opens a CODING checkpoint workspace idempotently for an enrolled student', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });

    const created = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const repeated = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const notEnrolled = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${otherStudent.token}`)
      .send();

    expect(created.status).toBe(200);
    expect(created.body.workspace.language).toBe('javascript');
    expect(created.body.workspace.files[0].content).toContain('starter');
    expect(repeated.status).toBe(200);
    expect(repeated.body.workspace.id).toBe(created.body.workspace.id);
    expect(notEnrolled.status).toBe(400);
    expect(await prisma.workspace.count()).toBe(1);
  });

  it('denies non-CODING checkpoints and another user cannot access a workspace', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.INFO });

    const denied = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const coding = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });
    const opened = await request(app)
      .post(`/api/v1/learning/checkpoints/${coding.checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const outsider = await request(app)
      .get(`/api/v1/workspaces/${opened.body.workspace.id}`)
      .set('Authorization', `Bearer ${otherStudent.token}`);

    expect(denied.status).toBe(400);
    expect(outsider.status).toBe(404);
  });

  it('validates workspace paths and size limits', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });
    const opened = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    const invalidPath = await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: '../secret.js', content: '' }] });
    const tooLarge = await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'index.js', content: 'x'.repeat(101) }] });

    expect(invalidPath.status).toBe(400);
    expect(tooLarge.status).toBe(400);
  });

  it('imports an instructor code snapshot only by explicit request', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint, lesson, video } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });
    const snapshot = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video.id,
        timestampSeconds: 90,
        title: 'Snapshot',
        language: 'javascript',
        filesJson: { files: [{ path: 'index.js', content: 'console.log("snapshot");\n' }] },
        createdByUserId: instructor.id,
      },
    });
    const opened = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const imported = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/import-snapshot`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ snapshotId: snapshot.id });

    expect(imported.status).toBe(200);
    expect(imported.body.workspace.files[0].content).toContain('snapshot');
  });

  it('queues execution with a run-time source snapshot and enforces endpoint rate limiting', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });
    const opened = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'index.js', content: 'console.log("first");\n' }] });
    const queued = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .set('x-correlation-id', 'phase6-test-correlation')
      .send();
    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'index.js', content: 'console.log("second");\n' }] });
    const rateLimited = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    expect(queued.status).toBe(202);
    expect(queued.body.status).toBe(ExecutionStatus.QUEUED);
    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]?.correlationId).toBe('phase6-test-correlation');
    expect(publishedMessages[0]?.payload.files[0]?.content).toContain('first');
    expect(publishedMessages[0]?.payload.files[0]?.content).not.toContain('second');
    expect(rateLimited.status).toBe(429);
  });

  it('recovers stale executions before enforcing the active execution limit', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });
    const opened = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const staleQueuedAt = new Date(Date.now() - 60_000);
    const staleRunningAt = new Date(Date.now() - 60_000);

    await prisma.executionRequest.create({
      data: {
        workspaceId: opened.body.workspace.id,
        userId: student.id,
        language: 'javascript',
        entryFile: 'index.js',
        filesSnapshotJson: { files: [{ path: 'index.js', content: 'console.log("stale queued");' }] },
        status: ExecutionStatus.QUEUED,
        jobId: randomUUID(),
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        queuedAt: staleQueuedAt,
        createdAt: staleQueuedAt,
      },
    });
    const staleRunning = await prisma.executionRequest.create({
      data: {
        workspaceId: opened.body.workspace.id,
        userId: student.id,
        language: 'javascript',
        entryFile: 'index.js',
        filesSnapshotJson: { files: [{ path: 'index.js', content: 'console.log("stale running");' }] },
        status: ExecutionStatus.RUNNING,
        jobId: randomUUID(),
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        queuedAt: staleRunningAt,
        startedAt: staleRunningAt,
        createdAt: staleRunningAt,
      },
    });

    const queued = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    const activeCount = await prisma.executionRequest.count({
      where: { userId: student.id, status: { in: [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING] } },
    });
    const recovered = await prisma.executionRequest.findMany({
      where: { userId: student.id, id: { not: queued.body.id } },
      include: { result: true },
      orderBy: { createdAt: 'asc' },
    });

    expect(queued.status).toBe(202);
    expect(activeCount).toBe(1);
    expect(recovered.map((item) => item.status).sort()).toEqual([ExecutionStatus.FAILED, ExecutionStatus.TIMED_OUT]);
    expect(recovered.find((item) => item.id === staleRunning.id)?.result?.errorCode).toBe('EXECUTION_STALE_RUNNING');
  });

  it('keeps active execution limiting scoped to the authenticated user', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });
    const opened = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    for (let index = 0; index < testEnv.CODE_EXECUTION_MAX_ACTIVE_PER_USER; index += 1) {
      await prisma.executionRequest.create({
        data: {
          workspaceId: opened.body.workspace.id,
          userId: otherStudent.id,
          language: 'javascript',
          entryFile: 'index.js',
          filesSnapshotJson: { files: [{ path: 'index.js', content: 'console.log("other");' }] },
          status: ExecutionStatus.QUEUED,
          jobId: randomUUID(),
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
        },
      });
    }

    const queued = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    expect(queued.status).toBe(202);
  });

  it('still blocks genuinely active executions for the same user', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });
    const opened = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    for (let index = 0; index < testEnv.CODE_EXECUTION_MAX_ACTIVE_PER_USER; index += 1) {
      await prisma.executionRequest.create({
        data: {
          workspaceId: opened.body.workspace.id,
          userId: student.id,
          language: 'javascript',
          entryFile: 'index.js',
          filesSnapshotJson: { files: [{ path: 'index.js', content: 'console.log("active");' }] },
          status: index === 0 ? ExecutionStatus.QUEUED : ExecutionStatus.RUNNING,
          startedAt: index === 0 ? null : new Date(),
          jobId: randomUUID(),
          idempotencyKey: randomUUID(),
          correlationId: randomUUID(),
        },
      });
    }

    const blocked = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('EXECUTION_ACTIVE_LIMIT_EXCEEDED');
  });

  it('runs practice workspaces through the function adapter contract using the first public sample by default', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const problem = await prisma.practiceProblem.create({
      data: {
        createdByUserId: instructor.id,
        title: 'Two Sum Function Run',
        slug: `two-sum-run-${randomUUID()}`,
        description: 'Return two indices.',
        inputFormat: 'solution(input) receives nums and target.',
        outputFormat: 'Return the two indices.',
        constraints: 'Exactly one answer exists.',
        difficulty: 'EASY',
        status: 'PUBLISHED',
        language: 'javascript',
        entryFile: 'index.js',
        starterFilesJson: { files: [{ path: 'index.js', content: 'function solution(input) {\n  return [];\n}\n\nmodule.exports = { solution };\n' }] },
        executionContract: 'FUNCTION',
        comparisonPolicy: 'NORMALIZED_TEXT',
        testCases: {
          create: [
            {
              name: 'Sample 1',
              visibility: TestCaseVisibility.PUBLIC,
              input: '{"nums":[2,7,11,15],"target":9}',
              expectedOutput: '[0,1]',
              weight: 50,
              position: 1,
            },
            {
              name: 'Sample 2',
              visibility: TestCaseVisibility.PUBLIC,
              input: '{"nums":[3,2,4],"target":6}',
              expectedOutput: '[1,2]',
              weight: 50,
              position: 2,
            },
          ],
        },
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        userId: student.id,
        practiceProblemId: problem.id,
        language: 'javascript',
        entryFile: 'index.js',
        files: {
          create: [{
            path: 'index.js',
            content: 'function solution(input) {\n  return [0, 1];\n}\n\nmodule.exports = { solution };\n',
          }],
        },
      },
    });

    const queued = await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    expect(queued.status).toBe(202);
    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]?.payload.executionMode).toBe('FUNCTION');
    expect(publishedMessages[0]?.payload.stdin).toBe('{"nums":[2,7,11,15],"target":9}');
    expect(publishedMessages[0]?.payload.files[0]?.content).not.toContain('readFileSync');
  });

  it('runs a selected public practice sample when publicTestCaseId is provided', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const problem = await prisma.practiceProblem.create({
      data: {
        createdByUserId: instructor.id,
        title: 'Selected Sample Run',
        slug: `selected-sample-run-${randomUUID()}`,
        description: 'Return two indices.',
        inputFormat: 'solution(input) receives nums and target.',
        outputFormat: 'Return the two indices.',
        constraints: 'Exactly one answer exists.',
        difficulty: 'EASY',
        status: 'PUBLISHED',
        language: 'javascript',
        entryFile: 'index.js',
        starterFilesJson: { files: [{ path: 'index.js', content: 'function solution(input) {\n  return [];\n}\n\nmodule.exports = { solution };\n' }] },
        executionContract: 'FUNCTION',
        comparisonPolicy: 'NORMALIZED_TEXT',
        testCases: {
          create: [
            {
              name: 'Sample 1',
              visibility: TestCaseVisibility.PUBLIC,
              input: '{"nums":[2,7,11,15],"target":9}',
              expectedOutput: '[0,1]',
              weight: 50,
              position: 1,
            },
            {
              name: 'Sample 2',
              visibility: TestCaseVisibility.PUBLIC,
              input: '{"nums":[3,2,4],"target":6}',
              expectedOutput: '[1,2]',
              weight: 50,
              position: 2,
            },
            {
              name: 'Hidden',
              visibility: TestCaseVisibility.HIDDEN,
              input: '{"nums":[3,3],"target":6}',
              expectedOutput: '[0,1]',
              weight: 50,
              position: 3,
            },
          ],
        },
      },
      include: { testCases: { orderBy: { position: 'asc' } } },
    });
    const sample2 = problem.testCases.find((test) => test.name === 'Sample 2');
    const workspace = await prisma.workspace.create({
      data: {
        userId: student.id,
        practiceProblemId: problem.id,
        language: 'javascript',
        entryFile: 'index.js',
        files: {
          create: [{
            path: 'index.js',
            content: 'function solution(input) {\n  return [1, 2];\n}\n\nmodule.exports = { solution };\n',
          }],
        },
      },
    });

    const queued = await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ publicTestCaseId: sample2?.id });

    expect(queued.status).toBe(202);
    expect(publishedMessages[0]?.payload.executionMode).toBe('FUNCTION');
    expect(publishedMessages[0]?.payload.stdin).toBe('{"nums":[3,2,4],"target":6}');
    expect(JSON.stringify(publishedMessages[0]?.payload)).not.toContain('{"nums":[3,3],"target":6}');
  });

  it('preserves explicit null custom practice input instead of treating it as missing', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const problem = await prisma.practiceProblem.create({
      data: {
        createdByUserId: instructor.id,
        title: 'Null Input Run',
        slug: `null-input-run-${randomUUID()}`,
        description: 'Return null.',
        inputFormat: 'solution(input) receives null.',
        outputFormat: 'Return null.',
        constraints: 'Input may be null.',
        difficulty: 'EASY',
        status: 'PUBLISHED',
        language: 'javascript',
        entryFile: 'index.js',
        starterFilesJson: { files: [{ path: 'index.js', content: 'module.exports = { solution: (input) => input };' }] },
        executionContract: 'FUNCTION',
        comparisonPolicy: 'NORMALIZED_TEXT',
        testCases: {
          create: [{
            name: 'Null sample',
            visibility: TestCaseVisibility.PUBLIC,
            input: 'null',
            expectedOutput: 'null',
            weight: 100,
            position: 1,
          }],
        },
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        userId: student.id,
        practiceProblemId: problem.id,
        language: 'javascript',
        entryFile: 'index.js',
        files: { create: [{ path: 'index.js', content: 'module.exports = { solution: (input) => input };' }] },
      },
    });

    const queued = await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ input: null });

    expect(queued.status).toBe(202);
    expect(publishedMessages[0]?.payload.executionMode).toBe('FUNCTION');
    expect(publishedMessages[0]?.payload.stdin).toBe('null');
  });

  it('rejects practice run when no public sample exists', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const problem = await prisma.practiceProblem.create({
      data: {
        createdByUserId: instructor.id,
        title: 'No Public Sample Run',
        slug: `no-public-sample-run-${randomUUID()}`,
        description: 'Hidden only.',
        inputFormat: 'solution(input) receives hidden input.',
        outputFormat: 'Return answer.',
        constraints: 'Hidden only.',
        difficulty: 'EASY',
        status: 'PUBLISHED',
        language: 'javascript',
        entryFile: 'index.js',
        starterFilesJson: { files: [{ path: 'index.js', content: 'module.exports = { solution: () => 1 };' }] },
        executionContract: 'FUNCTION',
        comparisonPolicy: 'NORMALIZED_TEXT',
        testCases: {
          create: [{
            name: 'Hidden',
            visibility: TestCaseVisibility.HIDDEN,
            input: '{"secret":true}',
            expectedOutput: '1',
            weight: 100,
            position: 1,
          }],
        },
      },
    });
    const workspace = await prisma.workspace.create({
      data: {
        userId: student.id,
        practiceProblemId: problem.id,
        language: 'javascript',
        entryFile: 'index.js',
        files: { create: [{ path: 'index.js', content: 'module.exports = { solution: () => 1 };' }] },
      },
    });

    const blocked = await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();

    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('PRACTICE_RUN_SAMPLE_UNAVAILABLE');
    expect(publishedMessages).toHaveLength(0);
  });

  it('persists execution results idempotently and exposes detail/history only to the owner', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedVideoCheckpoint({ instructorId: instructor.id, studentId: student.id, type: VideoCheckpointType.CODING });
    const opened = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .send();
    const execution = await prisma.executionRequest.create({
      data: {
        workspaceId: opened.body.workspace.id,
        userId: student.id,
        language: 'javascript',
        entryFile: 'index.js',
        filesSnapshotJson: { files: [{ path: 'index.js', content: 'console.log("ok");' }] },
        status: ExecutionStatus.QUEUED,
        jobId: randomUUID(),
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      },
    });

    await prisma.executionRequest.update({
      where: { id: execution.id },
      data: { status: ExecutionStatus.RUNNING, startedAt: new Date() },
    });
    await prisma.executionResult.upsert({
      where: { executionRequestId: execution.id },
      create: {
        executionRequestId: execution.id,
        exitCode: 0,
        stdout: 'ok\n',
        stderr: '',
        durationMs: 42,
      },
      update: {},
    });
    await prisma.executionRequest.update({
      where: { id: execution.id },
      data: { status: ExecutionStatus.SUCCEEDED, completedAt: new Date() },
    });
    await prisma.executionResult.upsert({
      where: { executionRequestId: execution.id },
      create: {
        executionRequestId: execution.id,
        exitCode: 1,
        stdout: 'duplicate',
        stderr: '',
        durationMs: 99,
      },
      update: {},
    });

    const detail = await request(app)
      .get(`/api/v1/executions/${execution.id}`)
      .set('Authorization', `Bearer ${student.token}`);
    const outsider = await request(app)
      .get(`/api/v1/executions/${execution.id}`)
      .set('Authorization', `Bearer ${otherStudent.token}`);
    const history = await request(app)
      .get(`/api/v1/workspaces/${opened.body.workspace.id}/executions`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(detail.status).toBe(200);
    expect(detail.body.execution.status).toBe(ExecutionStatus.SUCCEEDED);
    expect(detail.body.execution.result.stdout).toBe('ok\n');
    expect(outsider.status).toBe(404);
    expect(history.status).toBe(200);
    expect(history.body.items[0].id).toBe(execution.id);
    expect(await prisma.executionResult.count({ where: { executionRequestId: execution.id } })).toBe(1);
  });
});
