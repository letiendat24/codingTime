import { randomUUID } from 'node:crypto';
import { NotificationCategory, NotificationType, PrismaClient, RoleName } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { Env } from '../../config';
import { createLogger } from '../../shared/logger';
import { TokenService } from '../auth/token.service';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

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
const logger = createLogger('test');
let app: Express;
let notifications: NotificationService;

async function seedRoles() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
}

async function clearData() {
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
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

async function createNotification(userId: string, input: Partial<Parameters<NotificationService['create']>[0]> = {}) {
  return notifications.create({
    userId,
    type: NotificationType.JUDGE_COMPLETED,
    category: NotificationCategory.LEARNING,
    title: 'Judge completed',
    message: 'Your submission was judged.',
    actionUrl: '/dashboard',
    dedupeKey: `test:${randomUUID()}`,
    ...input,
  });
}

describe('notifications integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedRoles();
  });

  beforeEach(async () => {
    await clearData();
    await seedRoles();
    notifications = new NotificationService(new NotificationRepository(prisma), logger);
    app = createApp({ env: testEnv, logger, prisma });
  });

  afterAll(async () => {
    await clearData();
    await prisma.$disconnect();
  });

  it('lists only owned notifications and supports read state changes', async () => {
    const student = await createUser([RoleName.STUDENT]);
    const other = await createUser([RoleName.STUDENT]);
    const owned = await createNotification(student.id);
    await createNotification(other.id);

    const list = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${student.token}`).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(owned.notification?.id);

    const read = await request(app)
      .patch(`/api/v1/notifications/${owned.notification?.id}/read`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    expect(read.body.notification.readAt).toEqual(expect.any(String));

    await request(app)
      .patch(`/api/v1/notifications/${owned.notification?.id}/unread`)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    const count = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${student.token}`).expect(200);
    expect(count.body.count).toBe(1);

    await request(app)
      .patch(`/api/v1/notifications/${owned.notification?.id}/read`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
  });

  it('persists preferences and suppresses disabled categories', async () => {
    const student = await createUser([RoleName.STUDENT]);

    const defaults = await request(app).get('/api/v1/notifications/preferences').set('Authorization', `Bearer ${student.token}`).expect(200);
    expect(defaults.body.preferences.practiceEnabled).toBe(true);

    await request(app)
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ practiceEnabled: false })
      .expect(200);

    await createNotification(student.id, {
      type: NotificationType.PRACTICE_SOLVED,
      category: NotificationCategory.PRACTICE,
      dedupeKey: `practice:${student.id}`,
    });
    const count = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${student.token}`).expect(200);
    expect(count.body.count).toBe(0);
  });

  it('deduplicates async result notifications by dedupeKey', async () => {
    const student = await createUser([RoleName.STUDENT]);
    const dedupeKey = `JUDGE_COMPLETED:${randomUUID()}:${student.id}`;

    await createNotification(student.id, { dedupeKey });
    await createNotification(student.id, { dedupeKey });

    const stored = await prisma.notification.findMany({ where: { userId: student.id, dedupeKey } });
    expect(stored).toHaveLength(1);
  });

  it('rejects unsafe external action URLs', async () => {
    const student = await createUser([RoleName.STUDENT]);

    await expect(createNotification(student.id, { actionUrl: 'https://example.com/project' })).rejects.toMatchObject({
      code: 'NOTIFICATION_ACTION_INVALID',
    });
  });
});
