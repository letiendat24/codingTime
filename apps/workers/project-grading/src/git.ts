import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;

async function directorySize(path: string): Promise<number> {
  const stat = await lstat(path);

  if (stat.isSymbolicLink()) {
    return 0;
  }

  if (!stat.isDirectory()) {
    return stat.size;
  }

  const entries = await readdir(path);
  let total = 0;

  for (const entry of entries) {
    total += await directorySize(join(path, entry));
  }

  return total;
}

export async function cloneRepository(input: {
  readonly cloneUrl: string;
  readonly commitSha: string;
  readonly targetDirectory: string;
  readonly timeoutMs: number;
  readonly maxRepositoryBytes: number;
}) {
  if (!COMMIT_SHA_PATTERN.test(input.commitSha)) {
    throw new Error('Invalid commit SHA');
  }

  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };

  await execFileAsync('git', ['clone', '--no-tags', '--filter=blob:none', '--no-recurse-submodules', input.cloneUrl, input.targetDirectory], {
    timeout: input.timeoutMs,
    env,
    maxBuffer: 1024 * 1024,
  });
  await execFileAsync('git', ['-C', input.targetDirectory, 'checkout', '--detach', input.commitSha], {
    timeout: input.timeoutMs,
    env,
    maxBuffer: 1024 * 1024,
  });

  const size = await directorySize(input.targetDirectory);

  if (size > input.maxRepositoryBytes) {
    throw new Error('Repository exceeds configured size limit');
  }

  return { sizeBytes: size };
}
