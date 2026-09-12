import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RABBITMQ_URL: z.string().url(),
  JUDGE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  JUDGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  JUDGE_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1024).max(1_000_000).default(100_000),
  JUDGE_CPU_LIMIT: z.coerce.number().min(0.1).max(2).default(0.5),
  JUDGE_PIDS_LIMIT: z.coerce.number().int().min(16).max(256).default(64),
  JUDGE_TEMP_ROOT: z.string().min(1).default('/tmp/codesync-judge'),
});

export type CodeJudgeWorkerEnv = z.infer<typeof envSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): CodeJudgeWorkerEnv {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid code judge worker environment: ${details}`);
  }

  return parsed.data;
}
