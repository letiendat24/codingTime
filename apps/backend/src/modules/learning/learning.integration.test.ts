import { randomUUID } from 'node:crypto';
import {
  CourseDifficulty,
  CourseStatus,
  LearningActivityType,
  LessonProgressStatus,
  LessonType,
  PrismaClient,
  RoleName,
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
    where: { slug: 'backend' },
    update: { name: 'Backend' },
    create: { name: 'Backend', slug: 'backend' },
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

async function createPublishedCourse(instructorId: string, lessonCount = 2) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'backend' } });
  const course = await prisma.course.create({
    data: {
      title: `Course ${randomUUID()}`,
      slug: `course-${randomUUID()}`,
      shortDescription: 'Short description',
      description: 'Long description',
      difficulty: CourseDifficulty.BEGINNER,
      categoryId: category.id,
      ownerInstructorId: instructorId,
      status: CourseStatus.PUBLISHED,
      publishedAt: new Date(),
      modules: {
        create: {
          title: 'Module 1',
          position: 1,
          lessons: {
            create: Array.from({ length: lessonCount }, (_value, index) => ({
              title: `Lesson ${index + 1}`,
              position: index + 1,
              lessonType: LessonType.ARTICLE,
            })),
          },
        },
      },
    },
    include: {
      modules: {
        include: {
          lessons: {
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  });

  return {
    course,
    lessons: course.modules[0]?.lessons ?? [],
  };
}

async function enroll(student: TestUser, courseId: string) {
  return request(app)
    .post(`/api/v1/courses/${courseId}/enroll`)
    .set('Authorization', `Bearer ${student.token}`);
}

describe('learning progress integration', () => {
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
    });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('starts lesson progress for enrolled students and keeps access idempotent', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { course, lessons } = await createPublishedCourse(instructor.id);
    const lessonId = lessons[0]?.id ?? '';

    await enroll(student, course.id);

    const firstAccess = await request(app)
      .post(`/api/v1/learning/lessons/${lessonId}/access`)
      .set('Authorization', `Bearer ${student.token}`);
    const repeatedAccess = await request(app)
      .post(`/api/v1/learning/lessons/${lessonId}/access`)
      .set('Authorization', `Bearer ${student.token}`);
    const notEnrolled = await request(app)
      .post(`/api/v1/learning/lessons/${lessonId}/access`)
      .set('Authorization', `Bearer ${otherStudent.token}`);

    expect(firstAccess.status).toBe(200);
    expect(firstAccess.body.lessonProgress.status).toBe(LessonProgressStatus.IN_PROGRESS);
    expect(repeatedAccess.status).toBe(200);
    expect(notEnrolled.status).toBe(403);
    expect(await prisma.lessonProgress.count({ where: { studentId: student.id, lessonId } })).toBe(1);
    expect(await prisma.learningActivity.count({
      where: { userId: student.id, type: LearningActivityType.LESSON_STARTED },
    })).toBe(1);
  });

  it('completes lessons idempotently and recalculates course progress', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { course, lessons } = await createPublishedCourse(instructor.id, 2);
    const firstLessonId = lessons[0]?.id ?? '';
    const secondLessonId = lessons[1]?.id ?? '';

    await enroll(student, course.id);

    const firstComplete = await request(app)
      .post(`/api/v1/learning/lessons/${firstLessonId}/complete`)
      .set('Authorization', `Bearer ${student.token}`);
    const repeatedComplete = await request(app)
      .post(`/api/v1/learning/lessons/${firstLessonId}/complete`)
      .set('Authorization', `Bearer ${student.token}`);
    const summary = await request(app)
      .get(`/api/v1/learning/courses/${course.id}/progress`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(firstComplete.status).toBe(200);
    expect(repeatedComplete.status).toBe(200);
    expect(firstComplete.body.lessonProgress.completedAt).toBe(repeatedComplete.body.lessonProgress.completedAt);
    expect(summary.body.progress).toMatchObject({
      totalLessons: 2,
      completedLessons: 1,
      progressPercent: 50,
    });
    expect(await prisma.learningActivity.count({
      where: { userId: student.id, type: LearningActivityType.LESSON_COMPLETED },
    })).toBe(1);

    await request(app)
      .post(`/api/v1/learning/lessons/${secondLessonId}/complete`)
      .set('Authorization', `Bearer ${student.token}`);

    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
      include: { courseProgress: true },
    });

    expect(enrollment.status).toBe('COMPLETED');
    expect(enrollment.courseProgress?.completedLessons).toBe(2);
    expect(Number(enrollment.courseProgress?.progressPercent)).toBe(100);
    expect(await prisma.learningActivity.count({
      where: { userId: student.id, type: LearningActivityType.COURSE_COMPLETED },
    })).toBe(1);
  });

  it('handles concurrent completion without double-counting', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { course, lessons } = await createPublishedCourse(instructor.id, 1);
    const lessonId = lessons[0]?.id ?? '';

    await enroll(student, course.id);

    const results = await Promise.all([
      request(app).post(`/api/v1/learning/lessons/${lessonId}/complete`).set('Authorization', `Bearer ${student.token}`),
      request(app).post(`/api/v1/learning/lessons/${lessonId}/complete`).set('Authorization', `Bearer ${student.token}`),
    ]);

    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(await prisma.lessonProgress.count({ where: { studentId: student.id, lessonId } })).toBe(1);
    expect(await prisma.learningActivity.count({
      where: { userId: student.id, type: LearningActivityType.LESSON_COMPLETED },
    })).toBe(1);

    const progress = await prisma.courseProgress.findFirstOrThrow({
      where: { enrollment: { studentId: student.id, courseId: course.id } },
    });
    expect(progress.completedLessons).toBe(1);
  });

  it('returns isolated resume, dashboard, my courses progress, and history pagination', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { course, lessons } = await createPublishedCourse(instructor.id, 2);
    const lessonId = lessons[0]?.id ?? '';

    await enroll(student, course.id);
    await request(app)
      .post(`/api/v1/learning/lessons/${lessonId}/access`)
      .set('Authorization', `Bearer ${student.token}`);

    const resume = await request(app)
      .get('/api/v1/learning/resume')
      .set('Authorization', `Bearer ${student.token}`);
    const emptyResume = await request(app)
      .get('/api/v1/learning/resume')
      .set('Authorization', `Bearer ${otherStudent.token}`);
    const dashboard = await request(app)
      .get('/api/v1/learning/dashboard')
      .set('Authorization', `Bearer ${student.token}`);
    const myCourses = await request(app)
      .get('/api/v1/users/me/courses')
      .set('Authorization', `Bearer ${student.token}`);
    const history = await request(app)
      .get('/api/v1/learning/history?page=1&limit=1')
      .set('Authorization', `Bearer ${student.token}`);
    const otherHistory = await request(app)
      .get('/api/v1/learning/history')
      .set('Authorization', `Bearer ${otherStudent.token}`);

    expect(resume.status).toBe(200);
    expect(resume.body.course.id).toBe(course.id);
    expect(resume.body.lesson.id).toBe(lessonId);
    expect(emptyResume.body).toEqual({ course: null, lesson: null, progress: null });
    expect(dashboard.body.activeCourses).toBe(1);
    expect(myCourses.body.items[0]).toMatchObject({
      progressPercent: 0,
      completedLessons: 0,
      totalLessons: 2,
    });
    expect(history.body.items).toHaveLength(1);
    expect(history.body.pagination.total).toBe(2);
    expect(otherHistory.body.items).toHaveLength(0);
  });
});
