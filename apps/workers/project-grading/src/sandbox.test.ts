import { describe, expect, it } from 'vitest';
import { loadWorkerEnv } from './config';
import { buildDockerRunArgs } from './sandbox';

describe('project grading sandbox docker args', () => {
  it('applies network isolation and resource limits', () => {
    const env = loadWorkerEnv({
      RABBITMQ_URL: 'amqp://localhost:5672',
      PROJECT_GRADING_TEMP_ROOT: '/tmp/codesync-project-grading-test',
    });
    const args = buildDockerRunArgs({
      containerName: 'codesync-project-test',
      repositoryDirectory: '/tmp/codesync-project-grading-test/repo',
      command: ['npm', 'test'],
      memoryMb: 256,
      env,
    });

    expect(args).toContain('--network');
    expect(args).toContain('none');
    expect(args).toContain('--memory');
    expect(args).toContain('256m');
    expect(args).toContain('--cpus');
    expect(args).toContain('--pids-limit');
    expect(args).toContain('/tmp/codesync-project-grading-test/repo:/workspace:rw');
    expect(args).toContain('node:22.13.1-alpine');
  });
});
