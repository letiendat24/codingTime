import { spawn } from 'node:child_process';
import type { ProjectGradingWorkerEnv } from './config';

export interface SandboxResult {
  readonly status: 'completed' | 'timed_out';
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly outputTruncated: boolean;
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

export function buildDockerRunArgs(input: {
  readonly containerName: string;
  readonly repositoryDirectory: string;
  readonly command: readonly string[];
  readonly memoryMb: number;
  readonly env: ProjectGradingWorkerEnv;
}) {
  return [
    'run',
    '--rm',
    '--name',
    input.containerName,
    '--network',
    'none',
    '--memory',
    `${input.memoryMb}m`,
    '--cpus',
    String(input.env.PROJECT_GRADING_CPU_LIMIT),
    '--pids-limit',
    String(input.env.PROJECT_GRADING_PIDS_LIMIT),
    '--workdir',
    '/workspace',
    '--volume',
    `${input.repositoryDirectory}:/workspace:rw`,
    'node:22.13.1-alpine',
    ...input.command,
  ];
}

export async function runInSandbox(input: {
  readonly submissionId: string;
  readonly stage: 'build' | 'test';
  readonly repositoryDirectory: string;
  readonly command: readonly string[];
  readonly timeoutMs: number;
  readonly memoryMb: number;
  readonly env: ProjectGradingWorkerEnv;
}): Promise<SandboxResult> {
  const containerName = `codesync-project-${input.submissionId.replaceAll('-', '').slice(0, 18)}-${input.stage}`;
  const args = buildDockerRunArgs({
    containerName,
    repositoryDirectory: input.repositoryDirectory,
    command: input.command,
    memoryMb: input.memoryMb,
    env: input.env,
  });
  const startedAt = Date.now();
  let stdout = '';
  let stderr = '';
  let outputTruncated = false;
  let timedOut = false;

  return new Promise<SandboxResult>((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => {
      timedOut = true;
      spawn('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    }, input.timeoutMs);

    timeout.unref();
    child.stdout.on('data', (chunk: Buffer) => {
      const result = appendBounded(stdout, chunk, input.env.PROJECT_MAX_OUTPUT_BYTES - Buffer.byteLength(stderr, 'utf8'));
      stdout = result.value;
      outputTruncated = outputTruncated || result.truncated;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const result = appendBounded(stderr, chunk, input.env.PROJECT_MAX_OUTPUT_BYTES - Buffer.byteLength(stdout, 'utf8'));
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
}
