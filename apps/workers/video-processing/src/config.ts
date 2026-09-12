import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  RABBITMQ_URL: z.string().url(),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1),
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

  return envSchema.parse(source);
}
