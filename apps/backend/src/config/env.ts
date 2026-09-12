import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1),
  MINIO_PUBLIC_ENDPOINT: z.string().url().default('http://localhost:9000'),
  VIDEO_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(1_073_741_824),
  VIDEO_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  VIDEO_PLAYBACK_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3_600),
  VIDEO_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  VIDEO_PROCESSING_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  VIDEO_PROGRESS_SAVE_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(60).default(10),
  VIDEO_COMPLETION_THRESHOLD_PERCENT: z.coerce.number().int().min(1).max(100).default(90),
  CODE_SNAPSHOT_MAX_FILES: z.coerce.number().int().min(1).max(50).default(10),
  CODE_SNAPSHOT_MAX_TOTAL_BYTES: z.coerce.number().int().min(1_024).max(1_000_000).default(100_000),
  WORKSPACE_MAX_FILES: z.coerce.number().int().min(1).max(50).default(10),
  WORKSPACE_MAX_FILE_BYTES: z.coerce.number().int().min(1_024).max(500_000).default(100_000),
  WORKSPACE_MAX_TOTAL_BYTES: z.coerce.number().int().min(1_024).max(1_000_000).default(200_000),
  WORKSPACE_MAX_REVISIONS: z.coerce.number().int().min(1).max(50).default(10),
  CODE_EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  CODE_EXECUTION_MEMORY_MB: z.coerce.number().int().min(16).max(512).default(128),
  CODE_EXECUTION_CPU_LIMIT: z.coerce.number().min(0.1).max(2).default(0.5),
  CODE_EXECUTION_PIDS_LIMIT: z.coerce.number().int().min(16).max(256).default(64),
  CODE_EXECUTION_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1_024).max(1_000_000).default(100_000),
  CODE_EXECUTION_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  CODE_EXECUTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  CODE_EXECUTION_MAX_ACTIVE_PER_USER: z.coerce.number().int().min(1).max(10).default(2),
  CODE_EXECUTION_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  CODE_EXECUTION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(20),
  JUDGE_MAX_TEST_CASES: z.coerce.number().int().min(1).max(100).default(20),
  JUDGE_MAX_TEST_INPUT_BYTES: z.coerce.number().int().min(1).max(100_000).default(10_000),
  JUDGE_MAX_EXPECTED_OUTPUT_BYTES: z.coerce.number().int().min(1).max(100_000).default(10_000),
  JUDGE_MIN_TIME_LIMIT_MS: z.coerce.number().int().min(100).max(10_000).default(500),
  JUDGE_MAX_TIME_LIMIT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  JUDGE_MIN_MEMORY_MB: z.coerce.number().int().min(16).max(128).default(32),
  JUDGE_MAX_MEMORY_MB: z.coerce.number().int().min(64).max(1024).default(512),
  JUDGE_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1_024).max(1_000_000).default(100_000),
  JUDGE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  JUDGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  JUDGE_MAX_ACTIVE_PER_USER: z.coerce.number().int().min(1).max(10).default(2),
  JUDGE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  JUDGE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
  PROJECT_MAX_REPOSITORY_BYTES: z.coerce.number().int().min(1_024).max(200_000_000).default(20_000_000),
  PROJECT_CLONE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  PROJECT_GRADING_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
  PROJECT_BUILD_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(20_000),
  PROJECT_TEST_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(20_000),
  PROJECT_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1_024).max(1_000_000).default(100_000),
  PROJECT_GRADING_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  PROJECT_GRADING_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  PROJECT_MAX_ACTIVE_SUBMISSIONS_PER_USER: z.coerce.number().int().min(1).max(5).default(1),
  PROJECT_SUBMISSION_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  PROJECT_SUBMISSION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(20).default(3),
  PROJECT_GRADING_CPU_LIMIT: z.coerce.number().min(0.1).max(2).default(0.5),
  PROJECT_GRADING_MEMORY_MB: z.coerce.number().int().min(64).max(2048).default(512),
  PROJECT_GRADING_PIDS_LIMIT: z.coerce.number().int().min(16).max(512).default(128),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_SECURE: z
    .preprocess((value) => {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        return value === 'true';
      }

      return false;
    }, z.boolean())
    .default(false),
});

type RawEnv = z.infer<typeof environmentSchema>;

export interface Env extends RawEnv {
  readonly JWT_ACCESS_TTL_SECONDS: number;
  readonly JWT_REFRESH_TTL_SECONDS: number;
}

export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(value);

  if (!match) {
    throw new Error(`Invalid duration value: ${value}`);
  }

  const amount = Number.parseInt(match[1] ?? '0', 10);
  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  } satisfies Record<'s' | 'm' | 'h' | 'd', number>;
  const unit = (match[2] ?? 's') as keyof typeof multipliers;

  return amount * multipliers[unit];
}

function findEnvFile(startDirectory: string): string | undefined {
  let currentDirectory = startDirectory;

  while (true) {
    const candidate = join(currentDirectory, '.env');

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return undefined;
    }

    currentDirectory = parentDirectory;
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env) {
    const envFile = findEnvFile(process.cwd());

    if (envFile) {
      process.loadEnvFile(envFile);
    }
  }

  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid backend environment configuration: ${details}`);
  }

  const accessTtlSeconds = parseDurationToSeconds(parsed.data.JWT_ACCESS_TTL);
  const refreshTtlSeconds = parseDurationToSeconds(parsed.data.JWT_REFRESH_TTL);

  if (parsed.data.NODE_ENV === 'production' && !parsed.data.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production');
  }

  return {
    ...parsed.data,
    JWT_ACCESS_TTL_SECONDS: accessTtlSeconds,
    JWT_REFRESH_TTL_SECONDS: refreshTtlSeconds,
  };
}
