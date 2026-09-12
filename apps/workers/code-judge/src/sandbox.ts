import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CodeExecutionFile } from '@codesync/shared';
import type { CodeJudgeWorkerEnv } from './config';
import type { RuntimeDefinition } from './runtimes';

export interface SandboxResult {
  readonly status: 'completed' | 'timed_out';
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly outputTruncated: boolean;
}

function validatePath(path: string) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '')) {
    throw new Error('Invalid workspace file path');
  }
}

function appendBounded(current: string, chunk: Buffer, maxBytes: number) {
  const remaining = maxBytes - Buffer.byteLength(current, 'utf8');

  if (remaining <= 0) {
    return { value: current, truncated: true };
  }

  const text = chunk.toString('utf8');
  const value = Buffer.byteLength(text, 'utf8') <= remaining ? current + text : current + text.slice(0, remaining);

  return { value, truncated: Buffer.byteLength(text, 'utf8') > remaining };
}

async function writeWorkspaceFiles(root: string, files: readonly CodeExecutionFile[]) {
  for (const file of files) {
    validatePath(file.path);
    const target = join(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
}

export function buildDockerRunArgs(input: {
  readonly containerName: string;
  readonly workDirectory: string;
  readonly runtime: RuntimeDefinition;
  readonly entryFile: string;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly env: CodeJudgeWorkerEnv;
}) {
  return [
    'run',
    '--rm',
    '--interactive',
    '--name',
    input.containerName,
    '--network',
    'none',
    '--memory',
    `${input.memoryLimitMb}m`,
    '--cpus',
    String(input.env.JUDGE_CPU_LIMIT),
    '--pids-limit',
    String(input.env.JUDGE_PIDS_LIMIT),
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
    '--workdir',
    '/workspace',
    '--volume',
    `${input.workDirectory}:/workspace:ro`,
    input.runtime.image,
    ...input.runtime.command(input.entryFile),
  ];
}

export async function runInDockerSandbox(input: {
  readonly submissionId: string;
  readonly testCaseId: string;
  readonly runtime: RuntimeDefinition;
  readonly entryFile: string;
  readonly files: readonly CodeExecutionFile[];
  readonly stdin: string;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly env: CodeJudgeWorkerEnv;
}): Promise<SandboxResult> {
  const workDirectory = join(input.env.JUDGE_TEMP_ROOT, `${input.submissionId}-${input.testCaseId}`);
  const containerName = `codesync-judge-${input.submissionId.replaceAll('-', '').slice(0, 16)}-${input.testCaseId.replaceAll('-', '').slice(0, 16)}`;
  const startedAt = Date.now();
  let stdout = '';
  let stderr = '';
  let outputTruncated = false;
  let timedOut = false;

  await mkdir(workDirectory, { recursive: true });
  await writeWorkspaceFiles(workDirectory, input.files);

  const dockerArgs = buildDockerRunArgs({
    containerName,
    workDirectory,
    runtime: input.runtime,
    entryFile: input.entryFile,
    timeLimitMs: input.timeLimitMs,
    memoryLimitMb: input.memoryLimitMb,
    env: input.env,
  });

  try {
    return await new Promise<SandboxResult>((resolve, reject) => {
      const child = spawn('docker', dockerArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      const timeout = setTimeout(() => {
        timedOut = true;
        spawn('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
      }, input.timeLimitMs);

      timeout.unref();
      child.stdin.end(input.stdin);
      child.stdout.on('data', (chunk: Buffer) => {
        const result = appendBounded(stdout, chunk, input.env.JUDGE_MAX_OUTPUT_BYTES - Buffer.byteLength(stderr, 'utf8'));
        stdout = result.value;
        outputTruncated = outputTruncated || result.truncated;
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const result = appendBounded(stderr, chunk, input.env.JUDGE_MAX_OUTPUT_BYTES - Buffer.byteLength(stdout, 'utf8'));
        stderr = result.value;
        outputTruncated = outputTruncated || result.truncated;
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timeout);
        resolve({
          status: timedOut ? 'timed_out' : 'completed',
          exitCode: timedOut ? null : code,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          outputTruncated,
        });
      });
    });
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
