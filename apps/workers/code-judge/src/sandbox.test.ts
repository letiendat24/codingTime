import { describe, expect, it } from 'vitest';
import { loadWorkerEnv } from './config';
import { RUNTIMES } from './runtimes';
import { buildDockerRunArgs } from './sandbox';

describe('judge sandbox docker args', () => {
  it('uses the fixed JavaScript runtime image', () => {
    expect(RUNTIMES.javascript.image).toBe('node:22.13.1-alpine');
    expect(RUNTIMES.javascript.command('index.js')).toEqual(['node', 'index.js']);
  });

  it('applies isolation and resource limits', () => {
    const env = loadWorkerEnv({
      RABBITMQ_URL: 'amqp://localhost:5672',
      JUDGE_TEMP_ROOT: '/tmp/codesync-judge-test',
    });
    const args = buildDockerRunArgs({
      containerName: 'codesync-judge-test',
      workDirectory: '/tmp/codesync-judge-test/job',
      runtime: RUNTIMES.javascript,
      entryFile: 'index.js',
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      env,
    });

    expect(args).toContain('--interactive');
    expect(args).toContain('--network');
    expect(args).toContain('none');
    expect(args).toContain('--memory');
    expect(args).toContain('128m');
    expect(args).toContain('--cpus');
    expect(args).toContain('--pids-limit');
    expect(args).toContain('--read-only');
    expect(args).toContain('--tmpfs');
    expect(args).toContain('/tmp:rw,noexec,nosuid,size=16m');
    expect(args).toContain('/tmp/codesync-judge-test/job:/workspace:ro');
  });
});
