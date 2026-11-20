import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  RABBITMQ_URL: z.string().url(),
  STORAGE_PROVIDER: z.enum(['minio', 's3']).default('minio'),
  AWS_REGION: z.string().min(1).optional(),
  AWS_S3_BUCKET: z.string().min(1).optional(),
  MINIO_ENDPOINT: z.string().min(1).optional(),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  MINIO_ACCESS_KEY: z.string().min(1).optional(),
  MINIO_SECRET_KEY: z.string().min(1).optional(),
  MINIO_BUCKET: z.string().min(1).optional(),
  VIDEO_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  VIDEO_PROCESSING_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  VIDEO_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(1800),
  VIDEO_TEMP_ROOT: z.string().min(1).default('/tmp/codesync-video'),
});

export type WorkerEnv = z.infer<typeof envSchema>;

function loadNearestEnvFile() {
  let currentDirectory = process.cwd();

  while (true) {
    const candidate = join(currentDirectory, '.env');

    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return;
    }

    currentDirectory = parentDirectory;
  }
}

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  if (source === process.env) {
    loadNearestEnvFile();
  }

  const env = envSchema.parse(source);
  const required = env.STORAGE_PROVIDER === 's3'
    ? ['AWS_REGION', 'AWS_S3_BUCKET'] as const
    : ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET'] as const;
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing ${key} for ${env.STORAGE_PROVIDER} storage`);
  }
  return env;
}
