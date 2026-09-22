import type { Channel, ConsumeMessage } from 'amqplib';
import { describe, expect, it, vi } from 'vitest';
import {
  CODE_EXECUTION_ROUTING_KEYS,
  CODE_EXCHANGE,
  type AsyncMessage,
  type CodeExecutionRequestedPayload,
} from '@codesync/shared';
import { loadWorkerEnv } from './config';
import { processCodeExecutionMessage } from './consumer';

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

function makeMessage(payload: AsyncMessage<CodeExecutionRequestedPayload>): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(payload)),
    fields: {
      consumerTag: 'test-consumer',
      deliveryTag: 1,
      redelivered: false,
      exchange: CODE_EXCHANGE,
      routingKey: CODE_EXECUTION_ROUTING_KEYS.requested,
    },
    properties: {},
  } as ConsumeMessage;
}

describe('code execution consumer', () => {
  it('publishes a failed result instead of throwing when a job cannot be processed', async () => {
    const publish = vi.fn((_exchange: string, _routingKey: string, _content: Buffer) => {
      return true;
    });
    const channel = { publish } as unknown as Channel;
    const message = makeMessage({
      jobId: 'job-1',
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1',
      requestedByUserId: 'user-1',
      createdAt: new Date().toISOString(),
      payload: {
        executionId: 'execution-1',
        workspaceId: 'workspace-1',
        language: 'python',
        files: [{ path: 'index.py', content: 'print("hi")' }],
        entryFile: 'index.py',
      },
    });

    await expect(processCodeExecutionMessage({ message, channel, env })).resolves.toBeUndefined();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      CODE_EXCHANGE,
      CODE_EXECUTION_ROUTING_KEYS.failed,
      expect.any(Buffer),
      expect.objectContaining({ messageId: 'job-1', correlationId: 'corr-1' }),
    );

    const calls = publish.mock.calls;
    const publishedBody = calls[0]?.[2];
    if (!publishedBody) {
      throw new Error('Expected worker to publish a failed result');
    }
    const failedPayload = JSON.parse(publishedBody.toString('utf8')) as AsyncMessage<Record<string, unknown>>;
    expect(failedPayload.payload).toMatchObject({
      executionId: 'execution-1',
      errorCode: 'EXECUTION_WORKER_FAILED',
      retryable: true,
    });
  });

  it('fails function-mode executions without stdin before calling the sandbox', async () => {
    const publish = vi.fn((_exchange: string, _routingKey: string, _content: Buffer) => {
      return true;
    });
    const channel = { publish } as unknown as Channel;
    const message = makeMessage({
      jobId: 'job-2',
      idempotencyKey: 'idem-2',
      correlationId: 'corr-2',
      requestedByUserId: 'user-1',
      createdAt: new Date().toISOString(),
      payload: {
        executionId: 'execution-2',
        workspaceId: 'workspace-1',
        language: 'javascript',
        files: [{ path: 'index.js', content: 'module.exports = { solution: () => [] };' }],
        entryFile: 'index.js',
        executionMode: 'FUNCTION',
      },
    });

    await expect(processCodeExecutionMessage({ message, channel, env })).resolves.toBeUndefined();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      CODE_EXCHANGE,
      CODE_EXECUTION_ROUTING_KEYS.failed,
      expect.any(Buffer),
      expect.objectContaining({ messageId: 'job-2', correlationId: 'corr-2' }),
    );

    const publishedBody = publish.mock.calls[0]?.[2];
    if (!publishedBody) {
      throw new Error('Expected worker to publish a failed result');
    }
    const failedPayload = JSON.parse(publishedBody.toString('utf8')) as AsyncMessage<Record<string, unknown>>;
    expect(failedPayload.payload).toMatchObject({
      executionId: 'execution-2',
      errorCode: 'EXECUTION_INPUT_MISSING',
      retryable: false,
    });
  });
});
