import { describe, expect, it } from 'vitest';
import { loadWorkerEnv } from './config';
import { getRuntime } from './runtimes';
import { buildDockerRunArgs } from './sandbox';

const env = loadWorkerEnv({
  NODE_ENV: 'test',
  RABBITMQ_URL: 'amqp://localhost:5672',
  CODE_EXECUTION_TIMEOUT_MS: '5000',
  CODE_EXECUTION_MEMORY_MB: '128',
  CODE_EXECUTION_CPU_LIMIT: '0.5',
  CODE_EXECUTION_PIDS_LIMIT: '64',
  CODE_EXECUTION_MAX_OUTPUT_BYTES: '100000',
  CODE_EXECUTION_WORKER_CONCURRENCY: '2',
  CODE_EXECUTION_MAX_ATTEMPTS: '3',
  CODE_EXECUTION_TEMP_ROOT: '/tmp/codesync-code-execution',
});

describe('code execution sandbox configuration', () => {
  it('uses a fixed JavaScript runtime image and command', () => {
    const runtime = getRuntime('javascript');

    expect(runtime.image).toBe('node:22.13.1-alpine');
    expect(runtime.command('index.js')).toEqual(['node', 'index.js']);
  });

  it('builds Docker args with network, process, CPU, memory, and filesystem limits', () => {
    const args = buildDockerRunArgs({
      containerName: 'codesync-exec-test',
      workDirectory: '/tmp/codesync-code-execution/job',
      runtime: getRuntime('javascript'),
      entryFile: 'index.js',
      env,
    });

    expect(args).toContain('--network');
    expect(args).toContain('none');
    expect(args).toContain('--memory');
    expect(args).toContain('128m');
    expect(args).toContain('--cpus');
    expect(args).toContain('0.5');
    expect(args).toContain('--pids-limit');
    expect(args).toContain('64');
    expect(args).toContain('--read-only');
    expect(args).toContain('/tmp:rw,noexec,nosuid,size=16m');
    expect(args).toContain('/tmp/codesync-code-execution/job:/workspace:ro');
  });
});
