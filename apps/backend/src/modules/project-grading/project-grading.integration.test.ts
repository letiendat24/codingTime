import { randomUUID } from 'node:crypto';
import {
  CheckpointProgressStatus,
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  PrismaClient,
  ProjectRubricResultStatus,
  RoleName,
  VideoAssetStatus,
  VideoCheckpointType,
} from '@prisma/client';
import type { Express } from 'express';
import type { Client as MinioClient } from 'minio';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AsyncMessage, ProjectGradingCompletedPayload, ProjectGradingRequestedPayload } from '@codesync/shared';
import { createApp } from '../../app';
import { loadEnv } from '../../config';
import { createLogger } from '../../shared/logger';
import { TokenService } from '../auth/token.service';
import { LearningRepository } from '../learning/learning.repository';
import { LearningService } from '../learning/learning.service';
import { ProjectGradingRepository } from './project-grading.repository';
import { ProjectGradingService, type CommitResolver } from './project-grading.service';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  API_PORT: '4000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://codesync:codesync_dev_password@localhost:5432/codesync_test',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://codesync:codesync_dev_password@localhost:5672',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: '9000',
  MINIO_ACCESS_KEY: 'codesync',
  MINIO_SECRET_KEY: 'codesync_dev_password',
  MINIO_BUCKET: 'codesync-local',
  JWT_ACCESS_SECRET: 'test_access_secret_that_is_at_least_32_chars',
  JWT_REFRESH_SECRET: 'test_refresh_secret_that_is_at_least_32_chars',
});

interface TestUser {
  readonly id: string;
  readonly token: string;
}

const prisma = new PrismaClient({ datasources: { db: { url: testEnv.DATABASE_URL } } });
const tokenService = new TokenService(testEnv);
const storage = { presignedGetObject: async () => 'http://localhost:9000/playback-url' } as unknown as MinioClient;
const logger = createLogger('test');
const commitSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const commitResolver: CommitResolver = {
  resolve: async () => commitSha,
};
let app: Express;
let publishedMessages: AsyncMessage<ProjectGradingRequestedPayload>[] = [];

async function seedReferenceData() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.courseCategory.upsert({
    where: { slug: 'project-grading' },
    update: { name: 'Project Grading' },
    create: { name: 'Project Grading', slug: 'project-grading' },
  });
}

async function clearData() {
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

async function seedProjectCheckpoint(instructorId: string, studentId?: string) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'project-grading' } });
  const course = await prisma.course.create({
    data: {
      title: 'Project Course',
      slug: `project-course-${randomUUID()}`,
      shortDescription: 'Project',
      description: 'Project course',
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
      originalFilename: 'project.mp4',
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
      type: VideoCheckpointType.PROJECT,
      title: 'Project submit',
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
        lastPositionSeconds: 95,
        furthestPositionSeconds: 95,
        watchedPercent: 95,
        completedAt: new Date(),
      },
    });
  }

  return { lesson, checkpoint };
}

function createProjectGradingService() {
  return new ProjectGradingService(
    prisma,
    new ProjectGradingRepository(prisma),
    { publishProjectGradingRequested: () => undefined },
    testEnv,
    logger,
    new LearningService(prisma, new LearningRepository(prisma)),
    commitResolver,
  );
}

describe('project grading integration', () => {
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
      commitResolver,
      projectGradingPublisher: { publishProjectGradingRequested: (message) => publishedMessages.push(message) },
    });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('queues an immutable GitHub project submission and publishes a project grading job', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedProjectCheckpoint(instructor.id, student.id);

    await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/project`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ defaultBranch: 'main', passScore: 70 })
      .expect(200);
    await request(app)
      .post(`/api/v1/instructor/checkpoints/${checkpoint.id}/project/rubric`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'Has package manifest',
        type: 'AUTO',
        autoCheckType: 'FILE_EXISTS',
        config: { path: 'package.json' },
        weight: 100,
        required: true,
      })
      .expect(201);

    const response = await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/project-submissions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ repositoryUrl: 'https://github.com/example/codesync-project', branch: 'main' })
      .expect(202);

    expect(response.body).toMatchObject({ status: 'QUEUED', commitSha });
    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]!.payload.repository).toMatchObject({
      provider: 'GITHUB',
      owner: 'example',
      name: 'codesync-project',
      commitSha,
      cloneUrl: 'https://github.com/example/codesync-project.git',
    });
  });

  it('persists grading results and completes the checkpoint only after passing automated results', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedProjectCheckpoint(instructor.id, student.id);
    const service = createProjectGradingService();

    await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/project`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ defaultBranch: 'main', passScore: 70 })
      .expect(200);
    const criterion = await request(app)
      .post(`/api/v1/instructor/checkpoints/${checkpoint.id}/project/rubric`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'Has package manifest',
        type: 'AUTO',
        autoCheckType: 'FILE_EXISTS',
        config: { path: 'package.json' },
        weight: 100,
        required: true,
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/project-submissions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ repositoryUrl: 'https://github.com/example/codesync-project', branch: 'main' })
      .expect(202);

    const message = publishedMessages[0]!;
    await service.applyCompleted({
      ...message,
      payload: {
        submissionId: message.payload.submissionId,
        autoScore: 100,
        score: 100,
        passed: true,
        manualReviewPending: false,
        summary: 'ok',
        results: [{
          criterionId: criterion.body.criterion.id,
          title: 'Has package manifest',
          status: 'PASSED',
          scoreEarned: 100,
          maxScore: 100,
          feedback: null,
          details: null,
        }],
      } satisfies ProjectGradingCompletedPayload,
    });

    const submission = await prisma.projectSubmission.findUniqueOrThrow({ where: { id: message.payload.submissionId } });
    const progress = await prisma.checkpointProgress.findUniqueOrThrow({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
    });

    expect(submission.status).toBe('PASSED');
    expect(submission.commitSha).toBe(commitSha);
    expect(progress.status).toBe(CheckpointProgressStatus.COMPLETED);
  });

  it('requires instructor manual grading before completing submissions with manual criteria', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { checkpoint } = await seedProjectCheckpoint(instructor.id, student.id);
    const service = createProjectGradingService();

    await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/project`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ passScore: 70 })
      .expect(200);
    const manualCriterion = await request(app)
      .post(`/api/v1/instructor/checkpoints/${checkpoint.id}/project/rubric`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'Project quality',
        type: 'MANUAL',
        weight: 100,
        required: true,
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/learning/checkpoints/${checkpoint.id}/project-submissions`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ repositoryUrl: 'https://github.com/example/manual-project' })
      .expect(202);

    const message = publishedMessages[0]!;
    await service.applyCompleted({
      ...message,
      payload: {
        submissionId: message.payload.submissionId,
        autoScore: 0,
        score: 0,
        passed: false,
        manualReviewPending: true,
        summary: 'manual review required',
        results: [{
          criterionId: manualCriterion.body.criterion.id,
          title: 'Project quality',
          status: 'PENDING_MANUAL',
          scoreEarned: 0,
          maxScore: 100,
          feedback: null,
          details: null,
        }],
      } satisfies ProjectGradingCompletedPayload,
    });

    const pending = await prisma.projectSubmission.findUniqueOrThrow({
      where: { id: message.payload.submissionId },
      include: { grade: { include: { results: true } } },
    });
    expect(pending.status).toBe('AWAITING_REVIEW');
    expect(pending.grade?.results[0]?.status).toBe(ProjectRubricResultStatus.PENDING_MANUAL);

    await request(app)
      .post(`/api/v1/instructor/project-submissions/${message.payload.submissionId}/manual-grade`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ criteria: [{ criterionId: manualCriterion.body.criterion.id, score: 100, feedback: 'Solid project' }] })
      .expect(200);

    const completed = await prisma.projectSubmission.findUniqueOrThrow({ where: { id: message.payload.submissionId } });
    const progress = await prisma.checkpointProgress.findUniqueOrThrow({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
    });

    expect(completed.status).toBe('PASSED');
    expect(progress.status).toBe(CheckpointProgressStatus.COMPLETED);
  });
});
