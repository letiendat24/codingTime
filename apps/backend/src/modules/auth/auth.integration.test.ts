import { PrismaClient, RoleName, UserStatus } from '@prisma/client';
import type { Express } from 'express';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { Env } from '../../config';
import { createLogger } from '../../shared/logger';

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

interface AuthResponseBody {
  readonly accessToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly roles: readonly RoleName[];
  };
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: testEnv.DATABASE_URL,
    },
  },
});

let app: Express;

function getRefreshCookie(response: Response) {
  const setCookie = response.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (!cookie) {
    throw new Error('Expected refresh token cookie');
  }

  const [refreshCookie] = cookie.split(';');

  if (!refreshCookie) {
    throw new Error('Expected refresh token cookie value');
  }

  return refreshCookie;
}

async function seedRoles() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function clearAuthData() {
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

async function registerUser(email = 'student@example.com') {
  const response = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'secure-password',
    displayName: 'Student',
  });

  return {
    response,
    body: response.body as AuthResponseBody,
    refreshCookie: getRefreshCookie(response),
  };
}

describe('auth integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedRoles();
  });

  beforeEach(async () => {
    await clearAuthData();
    await seedRoles();
    app = createApp({
      env: testEnv,
      logger: createLogger('test'),
      prisma,
    });
  });

  afterAll(async () => {
    await clearAuthData();
    await prisma.$disconnect();
  });

  it('registers a user with a normalized unique email and default STUDENT role', async () => {
    const { response, body } = await registerUser('Student@Example.COM');

    expect(response.status).toBe(201);
    expect(body.user.email).toBe('student@example.com');
    expect(body.user.roles).toEqual([RoleName.STUDENT]);

    const user = await prisma.user.findUnique({
      where: { email: 'student@example.com' },
      include: { roles: { include: { role: true } } },
    });

    expect(user?.passwordHash).not.toBe('secure-password');
    expect(user?.roles.map((userRole) => userRole.role.name)).toEqual([RoleName.STUDENT]);
  });

  it('rejects duplicate email registration', async () => {
    await registerUser('student@example.com');
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'STUDENT@example.com',
      password: 'secure-password',
      displayName: 'Student',
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'USER_EMAIL_ALREADY_EXISTS' },
    });
  });

  it('rejects invalid email and weak password registration', async () => {
    const invalidEmail = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'secure-password',
      displayName: 'Student',
    });
    const weakPassword = await request(app).post('/api/v1/auth/register').send({
      email: 'student@example.com',
      password: 'short',
      displayName: 'Student',
    });

    expect(invalidEmail.status).toBe(400);
    expect(weakPassword.status).toBe(400);
  });

  it('logs in with valid credentials and rejects invalid credentials generically', async () => {
    await registerUser('student@example.com');
    const validLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'student@example.com',
      password: 'secure-password',
    });
    const invalidLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'student@example.com',
      password: 'wrong-password',
    });

    expect(validLogin.status).toBe(200);
    expect((validLogin.body as AuthResponseBody).accessToken).toEqual(expect.any(String));
    expect(getRefreshCookie(validLogin)).toContain('codesync_refresh_token=');
    expect(invalidLogin.status).toBe(401);
    expect(invalidLogin.body).toMatchObject({
      error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  });

  it('rate limits authentication attempts', async () => {
    const attempts: number[] = [];

    for (let index = 0; index < 21; index += 1) {
      const response = await request(app).post('/api/v1/auth/login').send({
          email: 'missing@example.com',
          password: 'secure-password',
      });

      attempts.push(response.status);
    }

    expect(attempts.at(-1)).toBe(429);
  });

  it('rejects suspended and disabled users during login', async () => {
    await registerUser('suspended@example.com');
    await prisma.user.update({
      where: { email: 'suspended@example.com' },
      data: { status: UserStatus.SUSPENDED },
    });

    const suspended = await request(app).post('/api/v1/auth/login').send({
      email: 'suspended@example.com',
      password: 'secure-password',
    });

    await registerUser('disabled@example.com');
    await prisma.user.update({
      where: { email: 'disabled@example.com' },
      data: { status: UserStatus.DISABLED },
    });

    const disabled = await request(app).post('/api/v1/auth/login').send({
      email: 'disabled@example.com',
      password: 'secure-password',
    });

    expect(suspended.status).toBe(403);
    expect(disabled.status).toBe(403);
  });

  it('returns current user with a valid access token and rejects missing token', async () => {
    const { body } = await registerUser('student@example.com');

    const missingToken = await request(app).get('/api/v1/users/me');
    const currentUser = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${body.accessToken}`);

    expect(missingToken.status).toBe(401);
    expect(currentUser.status).toBe(200);
    expect(currentUser.body).toMatchObject({
      user: {
        email: 'student@example.com',
        roles: [RoleName.STUDENT],
      },
    });
    expect(JSON.stringify(currentUser.body)).not.toContain('passwordHash');
  });

  it('rotates refresh tokens and rejects the old refresh token', async () => {
    const { refreshCookie } = await registerUser('student@example.com');
    const refresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie);

    expect(refresh.status).toBe(200);

    const oldRefresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie);

    expect(oldRefresh.status).toBe(401);
  });

  it('rejects expired, revoked, and malformed refresh tokens', async () => {
    const expiredUser = await registerUser('expired@example.com');
    await prisma.session.updateMany({
      where: { userId: expiredUser.body.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await request(app).post('/api/v1/auth/refresh').set('Cookie', expiredUser.refreshCookie);

    const revokedUser = await registerUser('revoked@example.com');
    await prisma.session.updateMany({
      where: { userId: revokedUser.body.user.id },
      data: { revokedAt: new Date() },
    });

    const revoked = await request(app).post('/api/v1/auth/refresh').set('Cookie', revokedUser.refreshCookie);
    const malformed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'codesync_refresh_token=not-a-token');

    expect(expired.status).toBe(401);
    expect(revoked.status).toBe(401);
    expect(malformed.status).toBe(401);
  });

  it('logs out and revokes all sessions', async () => {
    const { body } = await registerUser('student@example.com');

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${body.accessToken}`);

    expect(logout.status).toBe(204);

    const revokedSessionCount = await prisma.session.count({
      where: {
        userId: body.user.id,
        revokedAt: { not: null },
      },
    });

    expect(revokedSessionCount).toBe(1);

    const firstLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'student@example.com',
      password: 'secure-password',
    });
    await request(app).post('/api/v1/auth/login').send({
      email: 'student@example.com',
      password: 'secure-password',
    });

    const logoutAll = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${(firstLogin.body as AuthResponseBody).accessToken}`);

    expect(logoutAll.status).toBe(204);

    const activeSessions = await prisma.session.count({
      where: {
        userId: body.user.id,
        revokedAt: null,
      },
    });

    expect(activeSessions).toBe(0);
  });

  it('lists sessions and enforces session revocation ownership', async () => {
    const firstUser = await registerUser('first@example.com');
    const secondUser = await registerUser('second@example.com');
    const firstSession = await prisma.session.findFirstOrThrow({
      where: { userId: firstUser.body.user.id },
    });
    const secondSession = await prisma.session.findFirstOrThrow({
      where: { userId: secondUser.body.user.id },
    });

    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${firstUser.body.accessToken}`);
    const revokeOther = await request(app)
      .delete(`/api/v1/auth/sessions/${secondSession.id}`)
      .set('Authorization', `Bearer ${firstUser.body.accessToken}`);
    const revokeOwn = await request(app)
      .delete(`/api/v1/auth/sessions/${firstSession.id}`)
      .set('Authorization', `Bearer ${firstUser.body.accessToken}`);

    const secondSessionAfter = await prisma.session.findUniqueOrThrow({
      where: { id: secondSession.id },
    });

    expect(sessions.status).toBe(200);
    expect(sessions.body).toMatchObject({
      sessions: [
        {
          id: firstSession.id,
          current: true,
        },
      ],
    });
    expect(revokeOther.status).toBe(404);
    expect(secondSessionAfter.revokedAt).toBeNull();
    expect(revokeOwn.status).toBe(204);
  });
});
