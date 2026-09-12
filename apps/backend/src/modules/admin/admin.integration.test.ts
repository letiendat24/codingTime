import { randomUUID } from 'node:crypto';
import {
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  ExecutionStatus,
  JudgeSubmissionStatus,
  LessonType,
  PrismaClient,
  ProjectAutoCheckType,
  ProjectCriterionType,
  ProjectSubmissionStatus,
  RoleName,
  ScoringMode,
  UserStatus,
  VideoAssetStatus,
  VideoCheckpointType,
  VideoProcessingJobStatus,
} from '@prisma/client';
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

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: testEnv.DATABASE_URL,
    },
  },
});
const tokenService = new TokenService(testEnv);
let app: Express;

async function seedReferenceData() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.courseCategory.upsert({
    where: { slug: 'admin-test' },
    update: { name: 'Admin Test' },
    create: { name: 'Admin Test', slug: 'admin-test' },
  });
}

async function clearData() {
  await prisma.adminAuditLog.deleteMany();
  await prisma.projectRubricResult.deleteMany();
  await prisma.projectGrade.deleteMany();
  await prisma.projectSubmission.deleteMany();
  await prisma.projectRubricCriterion.deleteMany();
  await prisma.projectCheckpointConfig.deleteMany();
  await prisma.testCaseResult.deleteMany();
  await prisma.judgeResult.deleteMany();
  await prisma.judgeSubmission.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.executionResult.deleteMany();
  await prisma.executionRequest.deleteMany();
  await prisma.workspaceRevision.deleteMany();
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

async function createUser(roles: readonly RoleName[], status = UserStatus.ACTIVE): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      passwordHash: 'not-used',
      displayName: roles.join(' '),
      status,
      roles: { create: roles.map((name) => ({ role: { connect: { name } } })) },
    },
  });

  return {
    id: user.id,
    token: tokenService.issueAccessToken(user.id, randomUUID(), roles),
  };
}

async function createCourse(instructorId: string, status: CourseStatus, title = `Course ${randomUUID()}`) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'admin-test' } });
  const course = await prisma.course.create({
    data: {
      title,
      slug: `course-${randomUUID()}`,
      shortDescription: 'Admin course',
      description: 'Admin course description',
      difficulty: CourseDifficulty.BEGINNER,
      categoryId: category.id,
      ownerInstructorId: instructorId,
      status,
      publishedAt: status === CourseStatus.PUBLISHED ? new Date() : null,
    },
  });
  const module = await prisma.courseModule.create({
    data: { courseId: course.id, title: 'Module', position: 1 },
  });
  const lesson = await prisma.lesson.create({
    data: { moduleId: module.id, title: 'Video Lesson', position: 1, lessonType: LessonType.VIDEO },
  });

  return { course, module, lesson };
}

async function seedOperationalData(student: TestUser, instructor: TestUser) {
  const { course, lesson } = await createCourse(instructor.id, CourseStatus.PUBLISHED, 'Operational Course');
  const enrollment = await prisma.enrollment.create({
    data: { studentId: student.id, courseId: course.id, status: EnrollmentStatus.ACTIVE },
  });
  await prisma.courseProgress.create({
    data: { enrollmentId: enrollment.id, totalLessons: 1, completedLessons: 0, progressPercent: 0 },
  });
  const video = await prisma.videoAsset.create({
    data: {
      lessonId: lesson.id,
      status: VideoAssetStatus.FAILED,
      originalFilename: 'video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 100n,
      sourceObjectKey: 'uploads/video.mp4',
      createdByUserId: instructor.id,
      failedAt: new Date(),
    },
  });
  await prisma.videoProcessingJob.create({
    data: {
      videoAssetId: video.id,
      jobId: randomUUID(),
      status: VideoProcessingJobStatus.FAILED,
      attemptCount: 1,
      failedAt: new Date(),
      lastErrorCode: 'FFMPEG_FAILED',
      lastErrorMessage: 'Transcoding failed',
    },
  });
  const workspace = await prisma.workspace.create({
    data: { userId: student.id, lessonId: lesson.id, language: 'javascript', entryFile: 'index.js' },
  });
  const execution = await prisma.executionRequest.create({
    data: {
      workspaceId: workspace.id,
      userId: student.id,
      language: 'javascript',
      entryFile: 'index.js',
      filesSnapshotJson: [{ path: 'index.js', content: 'console.log(1)' }],
      status: ExecutionStatus.FAILED,
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      failedAt: new Date(),
    },
  });
  await prisma.executionResult.create({
    data: { executionRequestId: execution.id, stdout: '', stderr: 'error', durationMs: 12, errorCode: 'RUNTIME_ERROR' },
  });
  const codingCheckpoint = await prisma.videoCheckpoint.create({
    data: {
      lessonId: lesson.id,
      videoAssetId: video.id,
      timestampSeconds: 10,
      type: VideoCheckpointType.CODING,
      title: 'Coding',
      position: 1,
    },
  });
  const codingConfig = await prisma.codingCheckpointConfig.create({
    data: {
      checkpointId: codingCheckpoint.id,
      language: 'javascript',
      entryFile: 'index.js',
      starterFilesJson: [{ path: 'index.js', content: '' }],
      scoringMode: ScoringMode.WEIGHTED,
    },
  });
  await prisma.judgeSubmission.create({
    data: {
      userId: student.id,
      workspaceId: workspace.id,
      checkpointId: codingCheckpoint.id,
      codingCheckpointConfigId: codingConfig.id,
      language: 'javascript',
      entryFile: 'index.js',
      filesSnapshotJson: [{ path: 'index.js', content: '' }],
      status: JudgeSubmissionStatus.ACCEPTED,
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      score: '100',
      passed: true,
      completedAt: new Date(),
    },
  });
  const projectCheckpoint = await prisma.videoCheckpoint.create({
    data: {
      lessonId: lesson.id,
      videoAssetId: video.id,
      timestampSeconds: 20,
      type: VideoCheckpointType.PROJECT,
      title: 'Project',
      position: 2,
    },
  });
  const projectConfig = await prisma.projectCheckpointConfig.create({
    data: {
      checkpointId: projectCheckpoint.id,
      maxRepositoryBytes: 200_000_000n,
      maxBuildTimeMs: 30_000,
      maxTestTimeMs: 30_000,
      criteria: {
        create: {
          title: 'Build',
          type: ProjectCriterionType.AUTO,
          autoCheckType: ProjectAutoCheckType.BUILD_SUCCESS,
          weight: '100',
          position: 1,
        },
      },
    },
  });
  await prisma.projectSubmission.create({
    data: {
      userId: student.id,
      checkpointId: projectCheckpoint.id,
      projectCheckpointConfigId: projectConfig.id,
      repositoryUrl: 'https://github.com/example/repo',
      repositoryProvider: 'GITHUB',
      repositoryOwner: 'example',
      repositoryName: 'repo',
      commitSha: 'a'.repeat(40),
      status: ProjectSubmissionStatus.AWAITING_REVIEW,
      jobId: randomUUID(),
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      gradingConfigSnapshotJson: { criteria: [] },
    },
  });

  return { course, video };
}

describe('admin platform management integration', () => {
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
      readinessChecker: async () => ({ postgres: 'ok', redis: 'ok', rabbitmq: 'ok', minio: 'ok' }),
    });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('protects admin APIs and allows ADMIN plus multi-role users', async () => {
    const student = await createUser([RoleName.STUDENT]);
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const admin = await createUser([RoleName.ADMIN]);
    const multiRole = await createUser([RoleName.ADMIN, RoleName.INSTRUCTOR]);

    expect((await request(app).get('/api/v1/admin/dashboard')).status).toBe(401);
    expect((await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${student.token}`)).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${instructor.token}`)).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${admin.token}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${multiRole.token}`)).status).toBe(200);
  });

  it('returns dashboard metrics and operation counts from durable state', async () => {
    const admin = await createUser([RoleName.ADMIN]);
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    await seedOperationalData(student, instructor);

    const response = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${admin.token}`);

    expect(response.status).toBe(200);
    expect(response.body.users.total).toBe(3);
    expect(response.body.users.students).toBe(1);
    expect(response.body.courses.published).toBe(1);
    expect(response.body.courses.enrollments).toBe(1);
    expect(response.body.operations.videos.failed).toBe(1);
    expect(response.body.operations.codeExecutions.failed).toBe(1);
    expect(response.body.operations.judgeSubmissions.accepted).toBe(1);
    expect(response.body.operations.projectGrading.awaitingReview).toBe(1);
  });

  it('lists and filters users, updates status, revokes sessions, and audits mutations', async () => {
    const admin = await createUser([RoleName.ADMIN]);
    const student = await createUser([RoleName.STUDENT]);
    await prisma.session.create({
      data: {
        userId: student.id,
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const list = await request(app)
      .get('/api/v1/admin/users?role=STUDENT&status=ACTIVE&search=student')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].passwordHash).toBeUndefined();

    const suspend = await request(app)
      .patch(`/api/v1/admin/users/${student.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: UserStatus.SUSPENDED, reason: 'policy' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.user.status).toBe(UserStatus.SUSPENDED);
    expect(await prisma.session.count({ where: { userId: student.id, revokedAt: null } })).toBe(0);

    const activate = await request(app)
      .patch(`/api/v1/admin/users/${student.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: UserStatus.ACTIVE });
    expect(activate.status).toBe(200);

    const audit = await request(app).get('/api/v1/admin/audit-logs').set('Authorization', `Bearer ${admin.token}`);
    expect(audit.status).toBe(200);
    expect(audit.body.items.map((item: { action: string }) => item.action)).toContain('USER_SUSPENDED');
    expect(JSON.stringify(audit.body.items)).not.toContain('refreshTokenHash');
  });

  it('manages roles and prevents admin self-lockout', async () => {
    const admin = await createUser([RoleName.ADMIN]);
    const student = await createUser([RoleName.STUDENT]);

    const selfSuspend = await request(app)
      .patch(`/api/v1/admin/users/${admin.id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: UserStatus.SUSPENDED });
    expect(selfSuspend.status).toBe(400);

    const roleChange = await request(app)
      .put(`/api/v1/admin/users/${student.id}/roles`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ roles: [RoleName.STUDENT, RoleName.INSTRUCTOR] });
    expect(roleChange.status).toBe(200);
    expect([...(roleChange.body.user.roles as RoleName[])].sort()).toEqual([RoleName.INSTRUCTOR, RoleName.STUDENT].sort());

    const selfRoleChange = await request(app)
      .put(`/api/v1/admin/users/${admin.id}/roles`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ roles: [RoleName.STUDENT] });
    expect(selfRoleChange.status).toBe(400);
  });

  it('oversees courses across instructors and audits administrative archive', async () => {
    const admin = await createUser([RoleName.ADMIN]);
    const instructorA = await createUser([RoleName.INSTRUCTOR]);
    const instructorB = await createUser([RoleName.INSTRUCTOR]);
    const first = await createCourse(instructorA.id, CourseStatus.PUBLISHED, 'First Admin Course');
    await createCourse(instructorB.id, CourseStatus.DRAFT, 'Second Admin Course');

    const list = await request(app).get('/api/v1/admin/courses').set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);

    const filtered = await request(app)
      .get(`/api/v1/admin/courses?instructorId=${instructorA.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(filtered.body.items).toHaveLength(1);

    const archived = await request(app)
      .post(`/api/v1/admin/courses/${first.course.id}/archive`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'policy' });
    expect(archived.status).toBe(200);
    expect(archived.body.course.status).toBe(CourseStatus.ARCHIVED);
    expect(await prisma.adminAuditLog.count({ where: { action: 'COURSE_ARCHIVED' } })).toBe(1);
  });

  it('exposes safe operational views and retries failed video through admin action', async () => {
    const admin = await createUser([RoleName.ADMIN]);
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { video } = await seedOperationalData(student, instructor);

    const videos = await request(app).get('/api/v1/admin/videos?status=FAILED').set('Authorization', `Bearer ${admin.token}`);
    expect(videos.status).toBe(200);
    expect(videos.body.items[0].latestJob.errorCode).toBe('FFMPEG_FAILED');
    expect(JSON.stringify(videos.body.items[0])).not.toContain('sourceObjectKey');

    expect((await request(app).get('/api/v1/admin/code-executions').set('Authorization', `Bearer ${admin.token}`)).body.items[0].filesSnapshotJson).toBeUndefined();
    expect((await request(app).get('/api/v1/admin/judge-submissions').set('Authorization', `Bearer ${admin.token}`)).body.items[0].hiddenTests).toBeUndefined();
    expect((await request(app).get('/api/v1/admin/project-submissions').set('Authorization', `Bearer ${admin.token}`)).body.items[0].repository.owner).toBe('example');

    const retry = await request(app)
      .post(`/api/v1/admin/videos/${video.id}/retry`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(retry.status).toBe(202);
    expect(retry.body.video.status).toBe(VideoAssetStatus.QUEUED);
    expect(await prisma.adminAuditLog.count({ where: { action: 'VIDEO_RETRY_REQUESTED' } })).toBe(1);
  });
});
