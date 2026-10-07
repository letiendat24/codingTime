import { randomUUID } from 'node:crypto';
import {
  CheckpointProgressStatus,
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
import type {
  AiCheckpointEvaluationInput,
  AiCheckpointEvaluationResult,
  AiVideoCheckpointEvaluator,
} from './ai-video-checkpoint-evaluator';

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

class MockAiEvaluator implements AiVideoCheckpointEvaluator {
  readonly evaluatorType = 'MOCK' as const;
  readonly evaluatorVersion = 'mock-ai-v1';
  readonly model = 'mock-gemini';
  readonly calls: AiCheckpointEvaluationInput[] = [];

  constructor(private readonly nextResult: AiCheckpointEvaluationResult) {}

  async evaluate(input: AiCheckpointEvaluationInput): Promise<AiCheckpointEvaluationResult> {
    this.calls.push(input);
    return this.nextResult;
  }
}

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
  await prisma.videoPracticeVerificationAttempt.deleteMany();
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
    expect(second.body.workspace.files).toEqual([{ path: 'src/index.ts', content: 'export const answer = 42;\n' }]);

    await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${outsider.token}`).expect(400);
  });

  it('backfills missing starter snapshot files for existing empty lesson workspaces without overwriting student edits', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.videoCodeAlongConfig.create({
      data: { lessonId: lesson.id, enabled: true, language: 'typescript', entryFile: 'src/index.ts' },
    });
    await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 5,
        title: 'Initial setup',
        language: 'typescript',
        filesJson: {
          files: [{ path: 'src/index.ts', content: 'const numbers = [1, 2, 3, 4, 5, 6];\nconst result = [];\n' }],
        },
        createdByUserId: instructor.id,
      },
    });

    const legacyWorkspace = await prisma.workspace.create({
      data: {
        userId: student.id,
        lessonId: lesson.id,
        language: 'typescript',
        entryFile: 'src/App.tsx',
        files: { create: [{ path: 'src/App.tsx', content: 'const studentDraft = true;\n' }] },
      },
      include: { files: true },
    });

    const opened = await request(app)
      .post(`/api/v1/learning/lessons/${lesson.id}/workspace`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(opened.body.workspace.id).toBe(legacyWorkspace.id);
    expect(opened.body.workspace.entryFile).toBe('src/index.ts');
    expect(opened.body.workspace.files).toEqual([
      { path: 'src/App.tsx', content: 'const studentDraft = true;\n' },
      { path: 'src/index.ts', content: 'const numbers = [1, 2, 3, 4, 5, 6];\nconst result = [];\n' },
    ]);
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

    const checkpointNoSnapshot = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 99,
        type: VideoCheckpointType.INFO,
        title: 'No Snapshot Step',
        description: 'No reference available',
        required: false,
        pauseVideo: false,
      },
    });

    await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpointNoSnapshot.id}/practice-step`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        practiceEnabled: true,
        practiceVerificationMode: VideoPracticeVerificationMode.CODE_COMPARE,
        practiceBehavior: VideoPracticeBehavior.GUIDED,
      })
      .expect(400);

    await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/practice-step`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        practiceEnabled: true,
        practiceVerificationMode: VideoPracticeVerificationMode.CODE_COMPARE,
        practiceBehavior: VideoPracticeBehavior.GUIDED,
        practiceSnapshotId: snapshot.id,
        practiceTargetFilePath: 'src/missing.ts',
      })
      .expect(400);

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

    const steps = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/practice-steps`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(steps.body.practiceSteps).toHaveLength(1);
    expect(steps.body.practiceSteps[0]).toMatchObject({
      id: checkpoint.id,
      verificationMode: VideoPracticeVerificationMode.CODE_COMPARE,
      behavior: VideoPracticeBehavior.GUIDED,
      snapshotId: snapshot.id,
      targetFilePath: 'src/index.ts',
      status: 'NOT_STARTED',
    });

    const missingWorkspace = await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: randomUUID() })
      .expect(200);

    expect(missingWorkspace.body.practiceProgress.verification.status).toBe('UNAVAILABLE');

    const mismatch = await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: opened.body.workspace.id })
      .expect(200);

    expect(mismatch.body.practiceProgress).toMatchObject({
      status: 'NOT_STARTED',
      passed: false,
      verification: { status: 'FAILED', verificationMode: VideoPracticeVerificationMode.CODE_COMPARE },
    });
    await expect(prisma.checkpointProgress.findUnique({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
    })).resolves.toBeNull();

    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'src/index.ts', content: 'const ready = true;  \r\n' }] })
      .expect(200);

    const passed = await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: opened.body.workspace.id })
      .expect(200);
    expect(passed.body.practiceProgress.verification.status).toBe('PASSED');

    const progress = await prisma.checkpointProgress.findUniqueOrThrow({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
    });
    expect(progress.status).toBe('COMPLETED');
  });

  it('uses AI semantic verification for code-along AUTO checkpoints and persists attempt history', async () => {
    const evaluator = new MockAiEvaluator({
      status: 'PASS',
      explanation: 'The student implemented the milestone behavior.',
      guidance: 'Continue to the next step.',
      requirements: [{ label: 'Milestone behavior', status: 'PASS', feedback: 'The required change is present.' }],
      model: 'mock-gemini',
    });
    app = createApp({ env: testEnv, logger, prisma, storage, aiVideoCheckpointEvaluator: evaluator });
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.videoCodeAlongConfig.create({ data: { lessonId: lesson.id, enabled: true, language: 'typescript', entryFile: 'src/index.ts' } });
    const previous = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 0,
        title: 'Starter',
        language: 'typescript',
        filesJson: { files: [{ path: 'src/index.ts', content: 'export function add(a: number, b: number) { return 0; }\n' }] },
        createdByUserId: instructor.id,
      },
    });
    const current = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        title: 'Implement add',
        language: 'typescript',
        filesJson: { files: [{ path: 'src/index.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' }] },
        createdByUserId: instructor.id,
      },
    });
    const checkpoint = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        type: VideoCheckpointType.INFO,
        title: 'Milestone at 00:40',
        description: 'Implement add',
        required: true,
        pauseVideo: true,
        practiceEnabled: true,
        practiceConfigMode: 'AUTO',
        practiceVerificationMode: VideoPracticeVerificationMode.AI_SEMANTIC,
        practiceBehavior: VideoPracticeBehavior.REQUIRED,
        practiceSnapshotId: current.id,
        practiceTargetFilePath: 'src/index.ts',
      },
    });

    const opened = await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${student.token}`).expect(200);
    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'src/index.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' }] })
      .expect(200);

    const checked = await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: opened.body.workspace.id })
      .expect(200);

    expect(checked.body.practiceProgress).toMatchObject({
      passed: true,
      verification: {
        status: 'PASSED',
        verificationMode: VideoPracticeVerificationMode.AI_SEMANTIC,
        summary: 'The student implemented the milestone behavior.',
      },
    });
    expect(evaluator.calls).toHaveLength(1);
    expect(evaluator.calls[0]!.previousInstructorSnapshot?.id).toBe(previous.id);
    expect(evaluator.calls[0]!.currentInstructorSnapshot.id).toBe(current.id);
    expect(evaluator.calls[0]!.studentWorkspace.files[0]?.content).toContain('a + b');

    const progress = await prisma.checkpointProgress.findUniqueOrThrow({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
    });
    expect(progress.status).toBe(CheckpointProgressStatus.COMPLETED);

    const attempt = await prisma.videoPracticeVerificationAttempt.findFirstOrThrow({
      where: { studentId: student.id, checkpointId: checkpoint.id },
    });
    expect(attempt).toMatchObject({
      evaluatorType: 'MOCK',
      evaluatorModel: 'mock-gemini',
      status: 'PASS',
      feedback: 'The student implemented the milestone behavior.',
    });
  });

  it('does not complete AI semantic checkpoints on NEEDS_FIX or CANNOT_VERIFY and reuses cached identical attempts', async () => {
    const evaluator = new MockAiEvaluator({
      status: 'NEEDS_FIX',
      explanation: 'The key milestone behavior is still missing.',
      guidance: 'Review the instructor change and update your implementation.',
      requirements: [{ label: 'Implementation', status: 'NEEDS_FIX', feedback: 'The function still returns the starter value.' }],
      model: 'mock-gemini',
    });
    app = createApp({ env: testEnv, logger, prisma, storage, aiVideoCheckpointEvaluator: evaluator });
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.videoCodeAlongConfig.create({ data: { lessonId: lesson.id, enabled: true, language: 'typescript', entryFile: 'src/index.ts' } });
    const snapshot = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        title: 'Implement add',
        language: 'typescript',
        filesJson: { files: [{ path: 'src/index.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' }] },
        createdByUserId: instructor.id,
      },
    });
    const checkpoint = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        type: VideoCheckpointType.INFO,
        title: 'Milestone at 00:40',
        required: true,
        pauseVideo: true,
        practiceEnabled: true,
        practiceConfigMode: 'AUTO',
        practiceVerificationMode: VideoPracticeVerificationMode.AI_SEMANTIC,
        practiceBehavior: VideoPracticeBehavior.REQUIRED,
        practiceSnapshotId: snapshot.id,
        practiceTargetFilePath: 'src/index.ts',
      },
    });

    const opened = await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${student.token}`).expect(200);
    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ files: [{ path: 'src/index.ts', content: 'export function add(a: number, b: number) { return 0; }\n' }] })
      .expect(200);

    const first = await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: opened.body.workspace.id })
      .expect(200);

    expect(first.body.practiceProgress).toMatchObject({
      passed: false,
      verification: {
        status: 'FAILED',
        verificationMode: VideoPracticeVerificationMode.AI_SEMANTIC,
        summary: 'The key milestone behavior is still missing.',
      },
    });
    await expect(prisma.checkpointProgress.findUnique({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
    })).resolves.toBeNull();

    const second = await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: opened.body.workspace.id })
      .expect(200);

    expect(second.body.practiceProgress.verification.cached).toBe(true);
    expect(evaluator.calls).toHaveLength(1);
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

  it('verifies workspace structure without requiring exact instructor source text', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.videoCodeAlongConfig.create({
      data: {
        lessonId: lesson.id,
        enabled: true,
        language: 'typescript',
        entryFile: 'src/App.tsx',
        workspaceType: 'MULTI_FILE',
        allowCreateFiles: true,
        allowCreateFolders: true,
        allowRun: false,
        allowJudge: false,
      },
    });
    const checkpoint = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 70,
        type: VideoCheckpointType.INFO,
        title: 'Create UserCard',
        required: true,
        pauseVideo: false,
        practiceEnabled: true,
        practiceVerificationMode: VideoPracticeVerificationMode.WORKSPACE_STRUCTURE,
        practiceBehavior: VideoPracticeBehavior.REQUIRED,
        practiceTargetFilePath: 'src/components/UserCard.tsx',
        practiceVerificationRulesJson: {
          requiredPaths: ['src/components/UserCard.tsx'],
          rules: [{ type: 'EXPORT_EXISTS', path: 'src/components/UserCard.tsx', value: 'UserCard' }],
        },
      },
    });
    const opened = await request(app).post(`/api/v1/learning/lessons/${lesson.id}/workspace`).set('Authorization', `Bearer ${student.token}`).expect(200);

    const missing = await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: opened.body.workspace.id })
      .expect(200);

    expect(missing.body.practiceProgress.verification.status).toBe('FAILED');
    await expect(prisma.checkpointProgress.findUnique({
      where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
    })).resolves.toBeNull();

    await request(app)
      .put(`/api/v1/workspaces/${opened.body.workspace.id}/files`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        files: [
          { path: 'src/App.tsx', content: 'import { UserCard } from "./components/UserCard";\n' },
          { path: 'src/components/UserCard.tsx', content: 'export function UserCard() { return null; }\n' },
          { path: 'src/extra.ts', content: 'export const extra = true;\n' },
        ],
      })
      .expect(200);

    const passed = await request(app)
      .post(`/api/v1/learning/practice-steps/${checkpoint.id}/complete`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ workspaceId: opened.body.workspace.id })
      .expect(200);

    expect(passed.body.practiceProgress).toMatchObject({
      passed: true,
      verification: { status: 'PASSED', verificationMode: VideoPracticeVerificationMode.WORKSPACE_STRUCTURE },
    });
  });

  it('authoritatively resolves AUTO practice mode and ignores client-supplied fake verificationMode', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    const snapshot = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 50,
        title: 'Step 1 Snapshot',
        language: 'javascript',
        filesJson: {
          files: [
            { path: 'index.js', content: 'export function calculateTotal() { return 42; }\n' },
          ],
        },
        createdByUserId: instructor.id,
      },
    });

    const checkpoint = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 50,
        type: VideoCheckpointType.INFO,
        title: 'Complete calculateTotal',
        description: 'Implement calculateTotal function',
        required: true,
        pauseVideo: false,
      },
    });

    // Client attempts to send fake verificationMode = 'TESTS' in AUTO mode without test cases
    const response = await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/practice-step`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        configMode: 'AUTO',
        practiceVerificationMode: 'TESTS',
        practiceSnapshotId: snapshot.id,
      })
      .expect(200);

    // Backend ignores fake 'TESTS' mode and resolves the authoritative AUTO mode.
    expect(response.body.checkpoint.practice).toBeDefined();
    expect(response.body.checkpoint.practice.configMode).toBe('AUTO');
    expect(response.body.checkpoint.practice.verificationMode).toBe('AI_SEMANTIC');
    expect(response.body.checkpoint.practice.practiceEnabled).toBe(true);
    expect(response.body.checkpoint.practice.capabilities.allowRun).toBe(true);

    const persisted = await prisma.videoCheckpoint.findUniqueOrThrow({
      where: { id: checkpoint.id },
    });
    expect(persisted.practiceVerificationMode).toBe(VideoPracticeVerificationMode.AI_SEMANTIC);
  });

  it('strictly validates and rejects impossible manual override configurations', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    const checkpoint = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 30,
        type: VideoCheckpointType.INFO,
        title: 'Manual check',
        description: 'Test step',
        required: true,
        pauseVideo: false,
      },
    });

    // Manual override with TESTS mode but no test cases in lesson
    const invalidTests = await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/practice-step`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        configMode: 'MANUAL_OVERRIDE',
        practiceEnabled: true,
        practiceVerificationMode: 'TESTS',
      });
    expect(invalidTests.status).toBe(400);

    // Manual override with invalid line range
    const invalidLines = await request(app)
      .put(`/api/v1/instructor/checkpoints/${checkpoint.id}/practice-step`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        configMode: 'MANUAL_OVERRIDE',
        practiceEnabled: true,
        practiceVerificationMode: 'NONE',
        practiceTargetStartLine: 20,
        practiceTargetEndLine: 5,
      });
    expect(invalidLines.status).toBe(400);
  });

  it('aggregates multiple practice steps into compatible lesson workspace without downgrading', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    // Multi-file snapshot
    const multiSnapshot = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 10,
        title: 'Project Structure Snapshot',
        language: 'typescript',
        filesJson: {
          files: [
            { path: 'src/App.tsx', content: 'export function App() { return null; }\n' },
            { path: 'src/components/UserCard.tsx', content: 'export function UserCard() { return null; }\n' },
          ],
        },
        createdByUserId: instructor.id,
      },
    });

    // Single-file snapshot
    const singleSnapshot = await prisma.codeSnapshot.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        title: 'Single File Snapshot',
        language: 'typescript',
        filesJson: {
          files: [
            { path: 'index.ts', content: 'export function solve() { return 1; }\n' },
          ],
        },
        createdByUserId: instructor.id,
      },
    });

    const stepA = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 10,
        type: VideoCheckpointType.INFO,
        title: 'Multi file Step A',
        description: 'Build React components',
        required: true,
      },
    });

    const stepB = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 40,
        type: VideoCheckpointType.INFO,
        title: 'Single file Step B',
        description: 'Implement solve algorithm',
        required: true,
      },
    });

    // Save Step A (multi-file)
    const saveA = await request(app)
      .put(`/api/v1/instructor/checkpoints/${stepA.id}/practice-step`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ configMode: 'AUTO', practiceSnapshotId: multiSnapshot.id })
      .expect(200);

    expect(saveA.body.checkpoint.practice.workspaceType).toBe('MULTI_FILE');

    let lessonConfig = await prisma.videoCodeAlongConfig.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(lessonConfig.workspaceType).toBe('MULTI_FILE');
    expect(lessonConfig.allowCreateFiles).toBe(true);

    // Save Step B (single-file) AFTER Step A -> must NOT downgrade lesson to SINGLE_FILE
    const saveB = await request(app)
      .put(`/api/v1/instructor/checkpoints/${stepB.id}/practice-step`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ configMode: 'AUTO', practiceSnapshotId: singleSnapshot.id })
      .expect(200);
    expect(saveB.body.checkpoint.practice.workspaceType).toBe('MULTI_FILE');

    // Lesson config must remain MULTI_FILE because multiSnapshot / stepA still require it
    lessonConfig = await prisma.videoCodeAlongConfig.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(lessonConfig.workspaceType).toBe('MULTI_FILE');
    expect(lessonConfig.allowCreateFiles).toBe(true);

    // Deleting the multi-file step A and snapshot leaves only single-file requirement -> recomputes to SINGLE_FILE
    await request(app)
      .delete(`/api/v1/instructor/checkpoints/${stepA.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(204);

    await request(app)
      .delete(`/api/v1/instructor/code-snapshots/${multiSnapshot.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(204);

    lessonConfig = await prisma.videoCodeAlongConfig.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(lessonConfig.workspaceType).toBe('SINGLE_FILE');
    expect(lessonConfig.allowCreateFiles).toBe(false);
  });

  it('preserves manual lesson override and recomputes on snapshot update', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    const snapshot = await request(app)
      .post(`/api/v1/instructor/videos/${video!.id}/code-snapshots`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        timestampSeconds: 15,
        title: 'Initial Single File',
        language: 'javascript',
        files: [{ path: 'index.js', content: 'console.log("hello");' }],
      })
      .expect(201);

    let lessonConfig = await prisma.videoCodeAlongConfig.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(lessonConfig.workspaceType).toBe('SINGLE_FILE');

    // Editing snapshot to have multiple files automatically recomputes AUTO lesson workspace to MULTI_FILE
    await request(app)
      .patch(`/api/v1/instructor/code-snapshots/${snapshot.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        files: [
          { path: 'index.js', content: 'console.log("hello");' },
          { path: 'helper.js', content: 'export const help = true;' },
        ],
      })
      .expect(200);

    lessonConfig = await prisma.videoCodeAlongConfig.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(lessonConfig.workspaceType).toBe('MULTI_FILE');
  });

  it('keeps instructor snapshots and student practice milestones synchronized', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { lesson, video } = await seedVideoLesson(instructor.id, student.id);

    await prisma.videoCodeAlongConfig.create({
      data: {
        lessonId: lesson.id,
        enabled: true,
        language: 'typescript',
        entryFile: 'src/index.ts',
        defaultPracticeBehavior: VideoPracticeBehavior.REQUIRED,
      },
    });

    const orphanWithProgress = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 16,
        type: VideoCheckpointType.INFO,
        title: 'Legacy null-reference practice step',
        required: true,
        pauseVideo: true,
        practiceEnabled: true,
        practiceVerificationMode: VideoPracticeVerificationMode.FILE_COMPARE,
        practiceBehavior: VideoPracticeBehavior.REQUIRED,
      },
    });
    await prisma.checkpointProgress.create({
      data: {
        studentId: student.id,
        checkpointId: orphanWithProgress.id,
        status: CheckpointProgressStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    const staleCheckpoint = await prisma.videoCheckpoint.create({
      data: {
        lessonId: lesson.id,
        videoAssetId: video!.id,
        timestampSeconds: 43,
        type: VideoCheckpointType.INFO,
        title: 'Legacy stale-reference practice step',
        required: true,
        pauseVideo: true,
        practiceEnabled: true,
        practiceVerificationMode: VideoPracticeVerificationMode.FILE_COMPARE,
        practiceBehavior: VideoPracticeBehavior.REQUIRED,
        practiceSnapshotId: randomUUID(),
        practiceTargetFilePath: 'src/index.ts',
      },
    });

    const first = await request(app)
      .post(`/api/v1/instructor/videos/${video!.id}/code-snapshots`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        timestampSeconds: 19,
        title: 'Milestone at 00:19',
        language: 'typescript',
        files: [{ path: 'src/index.ts', content: 'export const first = true;\n' }],
      })
      .expect(201);

    const second = await request(app)
      .post(`/api/v1/instructor/videos/${video!.id}/code-snapshots`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        timestampSeconds: 49,
        title: 'Milestone at 00:49',
        language: 'typescript',
        files: [{ path: 'src/index.ts', content: 'export const second = true;\n' }],
      })
      .expect(201);

    const practiceSteps = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/practice-steps`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect(practiceSteps.body.practiceSteps.map((step: { title: string }) => step.title)).toEqual([
      'Milestone at 00:19',
      'Milestone at 00:49',
    ]);

    const playback = await request(app)
      .get(`/api/v1/learning/lessons/${lesson.id}/video`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    expect(playback.body.checkpoints.map((checkpoint: { id: string }) => checkpoint.id)).not.toContain(orphanWithProgress.id);
    expect(playback.body.checkpoints.map((checkpoint: { id: string }) => checkpoint.id)).not.toContain(staleCheckpoint.id);

    await request(app)
      .patch(`/api/v1/instructor/code-snapshots/${first.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Milestone at 00:25', timestampSeconds: 25 })
      .expect(200);
    await request(app)
      .patch(`/api/v1/instructor/code-snapshots/${first.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Milestone at 00:25 saved again' })
      .expect(200);

    const firstMilestones = await prisma.videoCheckpoint.findMany({
      where: { practiceSnapshotId: first.body.codeSnapshot.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(firstMilestones).toHaveLength(1);
    expect(firstMilestones[0]).toMatchObject({ timestampSeconds: 25, practiceEnabled: true });

    await request(app)
      .delete(`/api/v1/instructor/code-snapshots/${second.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(204);
    await expect(prisma.videoCheckpoint.findFirst({ where: { practiceSnapshotId: second.body.codeSnapshot.id } })).resolves.toBeNull();

    await prisma.checkpointProgress.create({
      data: {
        studentId: student.id,
        checkpointId: firstMilestones[0]!.id,
        status: CheckpointProgressStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await request(app)
      .delete(`/api/v1/instructor/code-snapshots/${first.body.codeSnapshot.id}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .expect(204);

    const preserved = await prisma.videoCheckpoint.findUniqueOrThrow({ where: { id: firstMilestones[0]!.id } });
    expect(preserved.practiceEnabled).toBe(false);
    expect(preserved.required).toBe(false);
    expect(preserved.practiceSnapshotId).toBeNull();
  });
});
