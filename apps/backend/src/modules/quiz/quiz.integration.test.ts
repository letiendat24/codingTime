import { randomUUID } from 'node:crypto';
import { CourseDifficulty, CourseStatus, LessonProgressStatus, LessonType, PrismaClient, RoleName } from '@prisma/client';
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

const prisma = new PrismaClient({ datasources: { db: { url: testEnv.DATABASE_URL } } });
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
  await prisma.quizAttemptAnswerOption.deleteMany();
  await prisma.quizAttemptAnswer.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.quizOption.deleteMany();
  await prisma.quizQuestion.deleteMany();
  await prisma.quiz.deleteMany();
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

  return {
    id: user.id,
    token: tokenService.issueAccessToken(user.id, randomUUID(), roles),
  };
}

async function createCourseWithQuiz(instructorId: string, status: CourseStatus = CourseStatus.PUBLISHED) {
  const category = await prisma.courseCategory.findUniqueOrThrow({ where: { slug: 'backend' } });
  const course = await prisma.course.create({
    data: {
      title: `Quiz Course ${randomUUID()}`,
      slug: `quiz-course-${randomUUID()}`,
      shortDescription: 'Short description',
      description: 'Long description',
      difficulty: CourseDifficulty.BEGINNER,
      categoryId: category.id,
      ownerInstructorId: instructorId,
      status,
      publishedAt: status === CourseStatus.PUBLISHED ? new Date() : null,
      modules: {
        create: {
          title: 'Module 1',
          position: 1,
          lessons: {
            create: {
              title: 'TypeScript Review',
              position: 1,
              lessonType: LessonType.QUIZ,
            },
          },
        },
      },
    },
    include: { modules: { include: { lessons: true } } },
  });

  return {
    course,
    lessonId: course.modules[0]?.lessons[0]?.id ?? '',
  };
}

async function createQuizWithQuestions(instructor: TestUser, lessonId: string) {
  const quizResponse = await request(app)
    .put(`/api/v1/instructor/lessons/${lessonId}/quiz`)
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({
      title: 'TypeScript Review',
      instructions: 'Choose the best answers.',
      passScore: 70,
      shuffleQuestions: false,
      shuffleOptions: false,
      showResultImmediately: true,
    });

  const quizId = quizResponse.body.quiz.id as string;

  const single = await request(app)
    .post(`/api/v1/instructor/quizzes/${quizId}/questions`)
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({
      type: 'SINGLE_CHOICE',
      prompt: 'Which declaration prevents reassignment?',
      points: 1,
      options: [
        { text: 'let', isCorrect: false },
        { text: 'const', isCorrect: true },
      ],
    });

  const multi = await request(app)
    .post(`/api/v1/instructor/quizzes/${quizId}/questions`)
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({
      type: 'MULTIPLE_CHOICE',
      prompt: 'Which are TypeScript union members in `string | number`?',
      points: 1,
      options: [
        { text: 'string', isCorrect: true },
        { text: 'number', isCorrect: true },
        { text: 'boolean', isCorrect: false },
      ],
    });

  return {
    quizId,
    singleQuestion: single.body.question,
    multiQuestion: multi.body.question,
  };
}

async function enroll(student: TestUser, courseId: string) {
  await request(app)
    .post(`/api/v1/courses/${courseId}/enroll`)
    .set('Authorization', `Bearer ${student.token}`)
    .expect(201);
}

describe('quiz assessment domain', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedReferenceData();
  });

  beforeEach(async () => {
    await clearData();
    await seedReferenceData();
    app = createApp({ env: testEnv, logger: createLogger('test'), prisma });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('lets instructor create quiz settings and questions with validation and ownership enforcement', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const otherInstructor = await createUser([RoleName.INSTRUCTOR]);
    const { lessonId } = await createCourseWithQuiz(instructor.id, CourseStatus.DRAFT);

    const quiz = await request(app)
      .put(`/api/v1/instructor/lessons/${lessonId}/quiz`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'TypeScript Review',
        instructions: 'Answer carefully.',
        passScore: 70,
        shuffleQuestions: false,
        shuffleOptions: false,
        showResultImmediately: true,
      });

    expect(quiz.status).toBe(200);
    expect(quiz.body.quiz.title).toBe('TypeScript Review');

    const invalidSingle = await request(app)
      .post(`/api/v1/instructor/quizzes/${quiz.body.quiz.id}/questions`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        type: 'SINGLE_CHOICE',
        prompt: 'Pick one',
        points: 1,
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      });

    expect(invalidSingle.status).toBe(422);
    expect(invalidSingle.body.error.code).toBe('QUIZ_VALIDATION_FAILED');

    const invalidMulti = await request(app)
      .post(`/api/v1/instructor/quizzes/${quiz.body.quiz.id}/questions`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        type: 'MULTIPLE_CHOICE',
        prompt: 'Pick many',
        points: 1,
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      });

    expect(invalidMulti.status).toBe(422);

    const valid = await request(app)
      .post(`/api/v1/instructor/quizzes/${quiz.body.quiz.id}/questions`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        type: 'SINGLE_CHOICE',
        prompt: 'Pick const',
        points: 1,
        options: [
          { text: 'let', isCorrect: false },
          { text: 'const', isCorrect: true },
        ],
      });

    expect(valid.status).toBe(201);
    expect(valid.body.question.options.filter((option: { isCorrect: boolean }) => option.isCorrect)).toHaveLength(1);

    const denied = await request(app)
      .get(`/api/v1/instructor/lessons/${lessonId}/quiz`)
      .set('Authorization', `Bearer ${otherInstructor.token}`);

    expect(denied.status).toBe(404);
  });

  it('does not expose correct answers before submission and resumes in-progress attempts', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const otherStudent = await createUser([RoleName.STUDENT]);
    const { course, lessonId } = await createCourseWithQuiz(instructor.id);
    const { quizId } = await createQuizWithQuestions(instructor, lessonId);
    await enroll(student, course.id);

    const payload = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/quiz`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(payload.status).toBe(200);
    expect(JSON.stringify(payload.body)).not.toContain('isCorrect');

    const firstAttempt = await request(app)
      .post(`/api/v1/learning/quizzes/${quizId}/attempts`)
      .set('Authorization', `Bearer ${student.token}`);
    const resumedAttempt = await request(app)
      .post(`/api/v1/learning/quizzes/${quizId}/attempts`)
      .set('Authorization', `Bearer ${student.token}`);
    const denied = await request(app)
      .get(`/api/v1/learning/lessons/${lessonId}/quiz`)
      .set('Authorization', `Bearer ${otherStudent.token}`);

    expect(firstAttempt.status).toBe(201);
    expect(resumedAttempt.body.attempt.id).toBe(firstAttempt.body.attempt.id);
    expect(denied.status).toBe(404);
  });

  it('grades exact-set answers, preserves retakes, and completes lesson only after passing', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const student = await createUser([RoleName.STUDENT]);
    const { course, lessonId } = await createCourseWithQuiz(instructor.id);
    const { quizId, singleQuestion, multiQuestion } = await createQuizWithQuestions(instructor, lessonId);
    await enroll(student, course.id);

    const failedAttempt = await request(app)
      .post(`/api/v1/learning/quizzes/${quizId}/attempts`)
      .set('Authorization', `Bearer ${student.token}`);

    const failedSubmit = await request(app)
      .post(`/api/v1/learning/quiz-attempts/${failedAttempt.body.attempt.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        answers: [
          { questionId: singleQuestion.id, selectedOptionIds: [singleQuestion.options[0].id] },
          { questionId: multiQuestion.id, selectedOptionIds: [multiQuestion.options[0].id] },
        ],
      });

    expect(failedSubmit.status).toBe(200);
    expect(failedSubmit.body.attempt.percentage).toBe(0);
    expect(failedSubmit.body.attempt.passed).toBe(false);

    const progressAfterFail = await prisma.lessonProgress.findUnique({
      where: { studentId_lessonId: { studentId: student.id, lessonId } },
    });
    expect(progressAfterFail?.status).not.toBe(LessonProgressStatus.COMPLETED);

    const duplicateSubmit = await request(app)
      .post(`/api/v1/learning/quiz-attempts/${failedAttempt.body.attempt.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ answers: [] });
    expect(duplicateSubmit.status).toBe(409);

    const passingAttempt = await request(app)
      .post(`/api/v1/learning/quizzes/${quizId}/attempts`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(passingAttempt.body.attempt.id).not.toBe(failedAttempt.body.attempt.id);

    const passedSubmit = await request(app)
      .post(`/api/v1/learning/quiz-attempts/${passingAttempt.body.attempt.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        answers: [
          { questionId: singleQuestion.id, selectedOptionIds: [singleQuestion.options[1].id] },
          { questionId: multiQuestion.id, selectedOptionIds: [multiQuestion.options[0].id, multiQuestion.options[1].id] },
        ],
      });

    expect(passedSubmit.status).toBe(200);
    expect(passedSubmit.body.attempt.percentage).toBe(100);
    expect(passedSubmit.body.attempt.passed).toBe(true);
    expect(passedSubmit.body.attempt.answers[0].correctOptionIds).toBeDefined();

    const progressAfterPass = await prisma.lessonProgress.findUniqueOrThrow({
      where: { studentId_lessonId: { studentId: student.id, lessonId } },
    });
    expect(progressAfterPass.status).toBe(LessonProgressStatus.COMPLETED);
    expect(await prisma.quizAttempt.count({ where: { userId: student.id, quizId } })).toBe(2);
  });

  it('blocks publishing quiz lessons with incomplete quiz configuration', async () => {
    const instructor = await createUser([RoleName.INSTRUCTOR]);
    const { course, lessonId } = await createCourseWithQuiz(instructor.id, CourseStatus.DRAFT);

    const missingQuiz = await request(app)
      .post(`/api/v1/instructor/courses/${course.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(missingQuiz.status).toBe(422);

    await request(app)
      .put(`/api/v1/instructor/lessons/${lessonId}/quiz`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({
        title: 'TypeScript Review',
        instructions: null,
        passScore: 70,
        shuffleQuestions: false,
        shuffleOptions: false,
        showResultImmediately: true,
      })
      .expect(200);

    const missingQuestions = await request(app)
      .post(`/api/v1/instructor/courses/${course.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(missingQuestions.status).toBe(422);

    await createQuizWithQuestions(instructor, lessonId);

    const published = await request(app)
      .post(`/api/v1/instructor/courses/${course.id}/publish`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(published.status).toBe(200);
    expect(published.body.course.status).toBe(CourseStatus.PUBLISHED);
  });
});
