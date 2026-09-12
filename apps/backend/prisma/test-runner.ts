import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Client } from 'pg';

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

function resolveTestDatabaseUrl() {
  const envFile = findEnvFile(process.cwd());

  if (envFile) {
    process.loadEnvFile(envFile);
  }

  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL or TEST_DATABASE_URL is required to run backend tests');
  }

  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.pathname = '/codesync_test';

  return databaseUrl.toString();
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureDatabase(databaseUrl: string) {
  const target = new URL(databaseUrl);
  const databaseName = target.pathname.replace('/', '');
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = '/postgres';

  const client = new Client({
    connectionString: maintenanceUrl.toString(),
  });

  await client.connect();
  const result = await client.query('select 1 from pg_database where datname = $1', [databaseName]);

  if (result.rowCount === 0) {
    await client.query(`create database ${quoteIdentifier(databaseName)}`);
  }

  await client.end();
}

function runCommand(command: string, args: readonly string[], databaseUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'test',
      },
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`));
    });

    child.on('error', reject);
  });
}

async function main() {
  const databaseUrl = resolveTestDatabaseUrl();
  await ensureDatabase(databaseUrl);
  await runCommand('pnpm', ['exec', 'prisma', 'generate'], databaseUrl);
  await runCommand('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], databaseUrl);
  await runCommand('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/app.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/auth/auth.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/courses/course.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/learning/learning.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/videos/video.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/video-learning/video-learning.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/video-learning/video-code-sync.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/code-execution/code-execution.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/judge/judge.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/project-grading/project-grading.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/admin/admin.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/practice/practice.integration.test.ts'], databaseUrl);
  await runCommand('pnpm', ['exec', 'vitest', 'run', 'src/modules/notifications/notification.integration.test.ts'], databaseUrl);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
