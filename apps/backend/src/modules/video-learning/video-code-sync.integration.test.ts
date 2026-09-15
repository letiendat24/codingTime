import { randomUUID } from 'node:crypto';
import {
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  LessonType,
  PrismaClient,
  RoleName,
  VideoAssetStatus,
  VideoCheckpointType,
  VideoPracticeBehavior,
  VideoPracticeVerificationMode,
} from '@prisma/client';
import type { Express } from 'express';
import type { Client as MinioClient } from 'minio';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { loadEnv } from '../../config';
import { createLogger } from '../../shared/logger';
import { TokenService } from '../auth/token.service';

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

const prisma = new PrismaClient({ datasources: { db: { url: testEnv.DATABASE_URL } } });
const tokenService = new TokenService(testEnv);
const logger = createLogger('test');
const storage = { presignedGetObject: async () => 'http://localhost:9000/playback-url' } as unknown as MinioClient;
let app: Express;

interface TestUser {
  readonly id: string;
  readonly token: string;
}

async function seedReferenceData() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.courseCategory.upsert({
    where: { slug: 'video-code-sync' },
    update: { name: 'Video Code Sync' },
    create: { name: 'Video Code Sync', slug: 'video-code-sync' },
  });
}

async function clearData() {
  await prisma.workspaceRevision.deleteMany();
  await prisma.executionResult.deleteMany();
  await prisma.executionRequest.deleteMany();
  await prisma.workspaceFile.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.videoCodeAlongConfig.deleteMany();
  await prisma.codeSnapshot.deleteMany();
  await prisma.checkpointProgress.deleteMany();
  await prisma.videoProgress.deleteMany();
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

async function seedVideoLesson(instructorId: string, studentId?: string, lessonType: LessonType = LessonType.VIDEO) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'video-code-sync' } });
  const course = await prisma.course.create({
    data: {
      title: 'Video Code Sync Course',
      slug: `video-code-sync-${randomUUID()}`,
      shortDescription: 'Video code sync',
      description: 'Video code sync course',
      status: CourseStatus.PUBLISHED,
      difficulty: CourseDifficulty.BEGINNER,
      ownerInstructorId: instructorId,
      categoryId: category.id,
      publishedAt: new Date(),
      modules: { create: [{ title: 'Module', position: 1, lessons: { create: [{ title: 'Lesson', position: 1, lessonType }] } }] },
    },
    include: { modules: { include: { lessons: true } } },
  });
  const lesson = course.modules[0]!.lessons[0]!;
  const video = lessonType === LessonType.VIDEO
    ? await prisma.videoAsset.create({
        data: {
          lessonId: lesson.id,
          status: VideoAssetStatus.READY,
          originalFilename: 'sync.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 1000,
          sourceObjectKey: 'source.mp4',
          masterPlaylistObjectKey: 'master.m3u8',
          durationSeconds: 1200,
          createdByUserId: instructorId,
        },
      })
    : null;

  if (studentId) {
    await prisma.enrollment.create({ data: { studentId, courseId: course.id, status: EnrollmentStatus.ACTIVE } });
  }

  return { course, lesson, video };
}

describe('video-code synchronization integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedReferenceData();
  });

  beforeEach(async () => {
    await clearData();
    await seedReferenceData();
    app = createApp({ env: testEnv, logger, prisma, storage });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('allows the course owner to enable code-along and rejects invalid ownership/type/language', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const otherInstructor = await createUser([RoleName.INSTRUCTOR]);
    const { lesson } = await seedVideoLesson(instructor.id);
    const article = await seedVideoLesson(instructor.id, undefined, LessonType.ARTICLE);

    await request(app)
      .put(`/api/v1/instructor/lessons/${lesson.id}/code-along`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ enabled: true, language: 'typescript', entryFile: 'src/index.ts' })
      .expect(200);

    await request(app)
      .put(`/api/v1/instructor/lessons/${lesson.id}/code-along`)
      .set('Authorization', `Bearer ${otherInstructor.token}`)
      .send({ enabled: true, language: 'typescript', entryFile: 'src/index.ts' })
      .expect(404);

    await request(app)
      .put(`/api/v1/instructor/lessons/${article.lesson.id}/code-along`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ enabled: true, language: 'typescript', entryFile: 'src/index.ts' })
      .expect(404);

    await request(app)
      .put(`/api/v1/instructor/lessons/${lesson.id}/code-along`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ enabled: true, language: 'brainfuck', entryFile: 'src/index.ts' })
      .expect(400);
  });

  it('creates one persistent lesson workspace for enrolled students and returns snapshot metadata only', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const outsider = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.videoCodeAlongConfig.create({
      data: { lessonId: lesson.id, enabled: true, language: 'typescript', entryFile: 'src/index.ts' },
    });
    await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 120,
        title: 'Create service',
        language: 'typescript',
        filesJson: { files: [{ path: 'src/index.ts', content: 'export const answer = 42;\n' }] },
        createdByUserId: instructor.id,
      },
    });

    const metadata = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/code-along`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(metadata.body).toMatchObject({ enabled: true, language: 'typescript', entryFile: 'src/index.ts' });
    expect(metadata.body.snapshots).toHaveLength(1);
    expect(metadata.body.snapshots[0].files).toBeUndefined();

    const first = await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${student.token}`).expect(200);
    const second = await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${student.token}`).expect(200);

    expect(second.body.workspace.id).toBe(first.body.workspace.id);
    expect(second.body.workspace.files).toEqual([{ path: 'src/index.ts', content: '' }]);

    await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${outsider.token}`).expect(400);
  });

  it('treats ready video lessons with instructor snapshots as code-along runtime even without config', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 0,
        title: 'Starter state',
        language: 'typescript',
        filesJson: { files: [{ path: 'src/index.ts', content: 'export const ready = true;\n' }] },
        createdByUserId: instructor.id,
      },
    });

    const metadata = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/code-along`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(metadata.body).toMatchObject({ enabled: true });
    expect(metadata.body.snapshots).toHaveLength(1);

    const opened = await request(app)
      .post(`/api/v1/learning/lessons/${lesson.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(opened.body.workspace.lessonId).toBe(lesson.id);
    expect(opened.body.workspace.files).toEqual([{ path: 'src/index.ts', content: 'export const ready = true;\n' }]);
  });

  it('backs up workspace files before snapshot import and enforces revision ownership on restore', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.videoCodeAlongConfig.create({ data: { lessonId: lesson.id, enabled: true, language: 'typescript', entryFile: 'src/index.ts' } });
    const snapshot = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 300,
        title: 'Instructor state',
        language: 'typescript',
        filesJson: { files: [{ path: 'src/index.ts', content: 'const instructor = true;\n' }] },
        createdByUserId: instructor.id,
      },
    });
    const opened = await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${student.token}`).expect(200);

    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'src/index.ts', content: 'const student = true;\n' }] })
      .expect(200);

    const imported = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/import-snapshot`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ snapshotId: snapshot.id })
      .expect(200);

    expect(imported.body.workspace.files).toEqual([{ path: 'src/index.ts', content: 'const instructor = true;\n' }]);

    const revisions = await request(app)
      .get(`/api/v1/workspaces/${opened.body.workspace.id}/revisions`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(revisions.body.items).toHaveLength(1);
    await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/revisions/${revisions.body.items[0].id}/restore`)
      .set('Authorization', `Bearer ${otherStudent.token}`)
      .expect(404);

    const restored = await request(app)
      .post(`/api/v1/workspaces/${opened.body.workspace.id}/revisions/${revisions.body.items[0].id}/restore`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(restored.body.workspace.files).toEqual([{ path: 'src/index.ts', content: 'const student = true;\n' }]);
  });

  it('configures practice steps, completes NONE/CODE_COMPARE, and persists progress', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.videoCodeAlongConfig.create({ data: { lessonId: lesson.id, enabled: true, language: 'typescript', entryFile: 'src/index.ts' } });
    const snapshot = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        title: 'Loop',
        language: 'typescript',
        filesJson: { files: [{ path: 'src/index.ts', content: 'const ready = true;\n' }] },
        createdByUserId: instructor.id,
      },
    });
    const checkpoint = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        type: VideoCheckpointType.INFO,
        title: 'Implement loop',
        description: 'Match the instructor reference',
        required: false,
        pauseVideo: false,
      },
    });

    const configured = await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/practice-step`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        practiceEnabled: true,
        practiceVerificationMode: VideoPracticeVerificationMode.CODE_COMPARE,
        practiceBehavior: VideoPracticeBehavior.GUIDED,
        practiceSnapshotId: snapshot.id,
        practiceTargetFilePath: 'src/index.ts',
      })
      .expect(200);

    expect(configured.body.checkpoint.practiceEnabled).toBe(true);

    const opened = await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${student.token}`).expect(200);
    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'src/index.ts', content: 'const ready = true;  \r\n' }] })
      .expect(200);

    const steps = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/practice-steps`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(steps.body.practiceSteps).toHaveLength(1);
    expect(steps.body.practiceSteps[0]).toMatchObject({
      id: checkpoint.id,
      verificationMode: VideoPracticeVerificationMode.CODE_COMPARE,
      behavior: VideoPracticeBehavior.GUIDED,
      status: 'NOT_STARTED',
    });

    await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: opened.body.workspace.id })
      .expect(200);

    const progress = await prisma.checkpointProgress.findUniqueOrThrow({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
    });
    expect(progress.status).toBe('COMPLETED');
  });

  it('allows guided practice skip and rejects required practice skip', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    const guided = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 20,
        type: VideoCheckpointType.INFO,
        title: 'Guided',
        required: false,
        pauseVideo: false,
        practiceEnabled: true,
        practiceVerificationMode: VideoPracticeVerificationMode.NONE,
        practiceBehavior: VideoPracticeBehavior.GUIDED,
      },
    });
    const required = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        type: VideoCheckpointType.INFO,
        title: 'Required',
        required: true,
        pauseVideo: false,
        practiceEnabled: true,
        practiceVerificationMode: VideoPracticeVerificationMode.NONE,
        practiceBehavior: VideoPracticeBehavior.REQUIRED,
      },
    });

    await request(app)
      .post(`/api/v1/learning/practice-steps/${guided.id}/skip`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    const skipped = await prisma.checkpointProgress.findUniqueOrThrow({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: guided.id } },
    });
    expect(skipped.status).toBe('SKIPPED');

    await request(app)
      .post(`/api/v1/learning/practice-steps/${required.id}/skip`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(409);
  });
});
