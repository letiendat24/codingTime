import { randomUUID } from 'node:crypto';
import { CourseDifficulty, CourseStatus, LessonType, RoleName } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { Env } from '../../config';
import { createLogger } from '../../shared/logger';
import { TokenService } from '../auth/token.service';
import { PrismaClient } from '@prisma/client';

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

interface CourseBody {
  readonly course: {
    readonly id: string;
    readonly title?: string;
    readonly slug: string;
    readonly status: CourseStatus;
    readonly ownerInstructorId?: string;
    readonly modules: readonly {
      readonly id: string;
      readonly title: string;
      readonly position: number;
      readonly lessons: readonly {
        readonly id: string;
        readonly title: string;
        readonly position: number;
      }[];
    }[];
  };
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

async function clearCourseData() {
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

async function categoryId() {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'backend' } });
  return category.id;
}

async function createUser(roles: readonly RoleName[]): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      passwordHash: 'not-used-in-this-test',
      displayName: roles.join(' '),
      roles: {
        create: roles.map((name) => ({
          role: { connect: { name } },
        })),
      },
    },
  });

  return {
    id: user.id,
    token: tokenService.issueAccessToken(user.id, randomUUID(), roles),
  };
}

async function createDraftCourse(instructor: TestUser, slug = `course-${randomUUID()}`) {
  const response = await request(app)
    .post('/api/v1/instructor/courses')
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({
      title: 'Backend Fundamentals',
      slug,
      shortDescription: 'Learn backend foundations',
      description: 'A focused backend course.',
      difficulty: CourseDifficulty.BEGINNER,
      categoryId: await categoryId(),
      tags: ['NodeJS', 'postgresql', 'nodejs'],
    });

  return response;
}

async function addModule(instructor: TestUser, courseId: string, title: string) {
  const response = await request(app)
    .post(`/api/v1/instructor/courses/${courseId}/modules`)
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({ title });

  return response.body.module as { id: string; position: number };
}

async function addLesson(instructor: TestUser, moduleId: string, title: string) {
  const response = await request(app)
    .post(`/api/v1/instructor/modules/${moduleId}/lessons`)
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({ title, lessonType: LessonType.ARTICLE });

  return response.body.lesson as { id: string; position: number };
}

async function createPublishableCourse(instructor: TestUser) {
  const created = await createDraftCourse(instructor);
  const courseId = (created.body as CourseBody).course.id;
  const module = await addModule(instructor, courseId, 'Module 1');
  await addLesson(instructor, module.id, 'Lesson 1');

  return courseId;
}

describe('course management integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedReferenceData();
  });

  beforeEach(async () => {
    await clearCourseData();
    await seedReferenceData();
    app = createApp({
      env: testEnv,
      logger: createLogger('test'),
      prisma,
    });
  });

  afterAll(async () => {
    await clearCourseData();
    await prisma.$disconnect();
  });

  it('allows instructors to create draft courses and prevents students from creating courses', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);

    const created = await createDraftCourse(instructor, 'backend-fundamentals');
    const forbidden = await request(app)
      .post('/api/v1/instructor/courses')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        title: 'Student Course',
        difficulty: CourseDifficulty.BEGINNER,
        categoryId: await categoryId(),
      });

    expect(created.status).toBe(201);
    expect((created.body as CourseBody).course.status).toBe(CourseStatus.DRAFT);
    expect((created.body as CourseBody).course.slug).toBe('backend-fundamentals');
    expect(forbidden.status).toBe(403);

    const course = await prisma.course.findUniqueOrThrow({ where: { slug: 'backend-fundamentals' } });
    expect(course.ownerInstructorId).toBe(instructor.id);
  });

  it('prevents duplicate course slugs', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);

    await createDraftCourse(instructor, 'same-slug');
    const duplicate = await createDraftCourse(instructor, 'same-slug');

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ error: { code: 'COURSE_SLUG_ALREADY_EXISTS' } });
  });

  it('enforces instructor ownership for edits', async () => {
    const owner = await createUser([RoleName.INSTRUCTOR]);
    const other = await createUser([RoleName.INSTRUCTOR]);
    const created = await createDraftCourse(owner);
    const courseId = (created.body as CourseBody).course.id;

    const ownerEdit = await request(app)
      .patch(`/api/v1/instructor/courses/${courseId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Updated title' });
    const otherEdit = await request(app)
      .patch(`/api/v1/instructor/courses/${courseId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ title: 'Not yours' });

    expect(ownerEdit.status).toBe(200);
    expect(otherEdit.status).toBe(404);
  });

  it('validates publishing readiness and publishes valid courses', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const empty = await createDraftCourse(instructor, 'empty-course');
    const emptyCourseId = (empty.body as CourseBody).course.id;
    const emptyPublish = await request(app)
      .post(`/api/v1/instructor/courses/${emptyCourseId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);

    const noLesson = await createDraftCourse(instructor, 'no-lesson');
    const noLessonCourseId = (noLesson.body as CourseBody).course.id;
    await addModule(instructor, noLessonCourseId, 'Module without lessons');
    const noLessonPublish = await request(app)
      .post(`/api/v1/instructor/courses/${noLessonCourseId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);

    const validCourseId = await createPublishableCourse(instructor);
    const validPublish = await request(app)
      .post(`/api/v1/instructor/courses/${validCourseId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(emptyPublish.status).toBe(422);
    expect(emptyPublish.body.error.details).toContain('Course must contain at least one lesson');
    expect(noLessonPublish.status).toBe(422);
    expect(validPublish.status).toBe(200);
    expect((validPublish.body as CourseBody).course.status).toBe(CourseStatus.PUBLISHED);
  });

  it('shows published courses publicly while hiding drafts', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    await createDraftCourse(instructor, 'draft-hidden');
    const publishedCourseId = await createPublishableCourse(instructor);
    await request(app)
      .post(`/api/v1/instructor/courses/${publishedCourseId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);

    const catalog = await request(app).get('/api/v1/courses');
    const draftDetail = await request(app).get('/api/v1/courses/draft-hidden');
    const published = await prisma.course.findUniqueOrThrow({ where: { id: publishedCourseId } });
    const publishedDetail = await request(app).get(`/api/v1/courses/${published.slug}`);

    expect(catalog.status).toBe(200);
    expect(catalog.body.items).toHaveLength(1);
    expect(draftDetail.status).toBe(404);
    expect(publishedDetail.status).toBe(200);
    expect(publishedDetail.body.course.modules[0].lessons).toHaveLength(1);
  });

  it('supports enrollment rules and my courses isolation', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const draft = await createDraftCourse(instructor, 'draft-enroll');
    const draftCourseId = (draft.body as CourseBody).course.id;
    const publishedCourseId = await createPublishableCourse(instructor);
    await request(app)
      .post(`/api/v1/instructor/courses/${publishedCourseId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);

    const draftEnroll = await request(app)
      .post(`/api/v1/courses/${draftCourseId}/enroll`)
      .set('Authorization', `Bearer ${student.token}`);
    const enrolled = await request(app)
      .post(`/api/v1/courses/${publishedCourseId}/enroll`)
      .set('Authorization', `Bearer ${student.token}`);
    const duplicate = await request(app)
      .post(`/api/v1/courses/${publishedCourseId}/enroll`)
      .set('Authorization', `Bearer ${student.token}`);
    const myCourses = await request(app)
      .get('/api/v1/users/me/courses')
      .set('Authorization', `Bearer ${student.token}`);
    const otherCourses = await request(app)
      .get('/api/v1/users/me/courses')
      .set('Authorization', `Bearer ${otherStudent.token}`);

    await request(app)
      .post(`/api/v1/instructor/courses/${publishedCourseId}/archive`)
      .set('Authorization', `Bearer ${instructor.token}`);
    const archivedEnroll = await request(app)
      .post(`/api/v1/courses/${publishedCourseId}/enroll`)
      .set('Authorization', `Bearer ${otherStudent.token}`);

    expect(draftEnroll.status).toBe(409);
    expect(enrolled.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(myCourses.body.items).toHaveLength(1);
    expect(otherCourses.body.items).toHaveLength(0);
    expect(archivedEnroll.status).toBe(409);
  });

  it('reorders modules and lessons deterministically with unique positions', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const created = await createDraftCourse(instructor);
    const courseId = (created.body as CourseBody).course.id;
    const first = await addModule(instructor, courseId, 'First');
    const second = await addModule(instructor, courseId, 'Second');
    const third = await addModule(instructor, courseId, 'Third');

    await request(app)
      .post(`/api/v1/instructor/courses/${courseId}/modules/reorder`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ moduleIds: [third.id, first.id, second.id] });

    const lessonOne = await addLesson(instructor, third.id, 'One');
    const lessonTwo = await addLesson(instructor, third.id, 'Two');
    await request(app)
      .post(`/api/v1/instructor/modules/${third.id}/lessons/reorder`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ lessonIds: [lessonTwo.id, lessonOne.id] });

    const course = await request(app)
      .get(`/api/v1/instructor/courses/${courseId}`)
      .set('Authorization', `Bearer ${instructor.token}`);
    const modules = (course.body as CourseBody).course.modules;

    expect(modules.map((module) => module.id)).toEqual([third.id, first.id, second.id]);
    expect(modules.map((module) => module.position)).toEqual([1, 2, 3]);
    expect(modules[0]?.lessons.map((lesson) => lesson.id)).toEqual([lessonTwo.id, lessonOne.id]);
    expect(modules[0]?.lessons.map((lesson) => lesson.position)).toEqual([1, 2]);
  });

  it('supports unpublishing a published course back to draft for editing', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const courseId = await createPublishableCourse(instructor);

    // 1. Publish course
    const published = await request(app)
      .post(`/api/v1/instructor/courses/${courseId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);
    expect(published.status).toBe(200);
    expect((published.body as CourseBody).course.status).toBe(CourseStatus.PUBLISHED);

    // 2. Editing while published is rejected
    const blockedEdit = await request(app)
      .patch(`/api/v1/instructor/courses/${courseId}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Illegal Edit While Published' });
    expect(blockedEdit.status).toBe(409);
    expect(blockedEdit.body.error.code).toBe('COURSE_NOT_EDITABLE');

    // 3. Move back to draft via unpublish
    const unpublished = await request(app)
      .post(`/api/v1/instructor/courses/${courseId}/unpublish`)
      .set('Authorization', `Bearer ${instructor.token}`);
    expect(unpublished.status).toBe(200);
    expect((unpublished.body as CourseBody).course.status).toBe(CourseStatus.DRAFT);

    // 4. Editing is now allowed
    const allowedEdit = await request(app)
      .patch(`/api/v1/instructor/courses/${courseId}`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Updated After Unpublishing' });
    expect(allowedEdit.status).toBe(200);
    expect((allowedEdit.body as CourseBody).course.title).toBe('Updated After Unpublishing');

    // 5. Can be published again
    const republished = await request(app)
      .post(`/api/v1/instructor/courses/${courseId}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);
    expect(republished.status).toBe(200);
    expect((republished.body as CourseBody).course.status).toBe(CourseStatus.PUBLISHED);
  });
});
