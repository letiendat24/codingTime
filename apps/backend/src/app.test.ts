import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { Env } from './config';
import { createLogger } from './shared/logger';

const testEnv: Env = {
  NODE_ENV: 'test',
  API_PORT: 4000,
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://codesync:codesync_dev_password@localhost:5432/codesync',
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

describe('health route', () => {
  const readyDependencies = {
    postgres: 'ok',
    redis: 'ok',
    rabbitmq: 'ok',
    minio: 'ok',
  } as const;

  it('returns ok without starting a listener', async () => {
    const app = createApp({
      env: testEnv,
      logger: createLogger('test'),
    });

    await request(app).get('/api/v1/health').expect(200).expect({ status: 'ok' });
  });

  it('returns ready when dependencies are available', async () => {
    const app = createApp({
      env: testEnv,
      logger: createLogger('test'),
      readinessChecker: async () => readyDependencies,
    });

    await request(app).get('/api/v1/ready').expect(200).expect({
      status: 'ready',
      dependencies: readyDependencies,
    });
  });

  it('fails readiness safely when one dependency is unavailable', async () => {
    const app = createApp({
      env: testEnv,
      logger: createLogger('test'),
      readinessChecker: async () => ({
        ...readyDependencies,
        rabbitmq: 'error',
      }),
    });

    await request(app).get('/api/v1/ready').expect(503).expect({
      status: 'not_ready',
      dependencies: {
        ...readyDependencies,
        rabbitmq: 'error',
      },
    });
  });

  it('reuses valid incoming correlation IDs in response headers', async () => {
    const app = createApp({
      env: testEnv,
      logger: createLogger('test'),
    });
    const correlationId = 'test-correlation-123';

    const response = await request(app).get('/api/v1/health').set('x-correlation-id', correlationId).expect(200);

    expect(response.header['x-request-id']).toBe(correlationId);
    expect(response.header['x-correlation-id']).toBe(correlationId);
  });

  it('keeps centralized error responses consistent and safe', async () => {
    const app = createApp({
      env: testEnv,
      logger: createLogger('test'),
    });

    const response = await request(app).get('/api/v1/missing-route').expect(404);

    expect(response.body).toMatchObject({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route not found',
      },
    });
    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(response.body.error.stack).toBeUndefined();
  });

  it('allows browser preflight requests from the configured frontend origin', async () => {
    const app = createApp({
      env: testEnv,
      logger: createLogger('test'),
    });

    await request(app)
      .options('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:3000')
      .expect('Access-Control-Allow-Credentials', 'true');
  });
});
