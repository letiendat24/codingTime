import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RABBITMQ_URL: z.string().url(),
  PROJECT_GRADING_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  PROJECT_GRADING_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  PROJECT_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1_024).max(1_000_000).default(100_000),
  PROJECT_GRADING_CPU_LIMIT: z.coerce.number().min(0.1).max(2).default(0.5),
  PROJECT_GRADING_MEMORY_MB: z.coerce.number().int().min(64).max(2048).default(512),
  PROJECT_GRADING_PIDS_LIMIT: z.coerce.number().int().min(16).max(512).default(128),
  PROJECT_GRADING_TEMP_ROOT: z.string().min(1).default('/tmp/codesync-project-grading'),
});

export type ProjectGradingWorkerEnv = z.infer<typeof schema>;

function loadNearestEnvFile() {
  let current = process.cwd();

  while (true) {
    const candidate = join(current, '.env');

    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }

    const parent = dirname(current);

    if (parent === current) {
      return;
    }

    current = parent;
  }
}

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): ProjectGradingWorkerEnv {
  if (source === process.env) {
    loadNearestEnvFile();
  }

  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    throw new Error(`Invalid project grading worker environment: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }

  return parsed.data;
}
