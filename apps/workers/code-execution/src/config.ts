import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RABBITMQ_URL: z.string().url(),
  CODE_EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  CODE_EXECUTION_MEMORY_MB: z.coerce.number().int().min(16).max(512).default(128),
  CODE_EXECUTION_CPU_LIMIT: z.coerce.number().min(0.1).max(2).default(0.5),
  CODE_EXECUTION_PIDS_LIMIT: z.coerce.number().int().min(16).max(256).default(64),
  CODE_EXECUTION_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1_024).max(1_000_000).default(100_000),
  CODE_EXECUTION_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  CODE_EXECUTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  CODE_EXECUTION_TEMP_ROOT: z.string().min(1).default('/tmp/codesync-code-execution'),
});

export type CodeExecutionWorkerEnv = z.infer<typeof environmentSchema>;

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

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): CodeExecutionWorkerEnv {
  if (source === process.env) {
    loadNearestEnvFile();
  }

  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid code execution worker environment: ${details}`);
  }

  return parsed.data;
}
