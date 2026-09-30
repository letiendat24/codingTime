import type { Channel, ConsumeMessage } from 'amqplib';
import { describe, expect, it, vi } from 'vitest';
import {
  CODE_EXECUTION_ROUTING_KEYS,
  CODE_EXCHANGE,
  type AsyncMessage,
  type CodeExecutionRequestedPayload,
} from '@codesync/shared';
import { loadWorkerEnv } from './config';
import { mapSandboxFailure, processCodeExecutionMessage } from './consumer';

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
  it('maps structured practice generator errors to safe error codes', () => {
    expect(mapSandboxFailure({
      executionMode: 'PRACTICE_GENERATOR_ORACLE',
      stderr: 'CODESYNC_ERROR_JSON:{"code":"GENERATOR_CONTRACT_INVALID","message":"generateTests() must return an array."}',
      outputTruncated: false,
    })).toEqual({
      errorCode: 'GENERATOR_CONTRACT_INVALID',
      stderr: 'generateTests() must return an array.',
      retryable: false,
    });

    expect(mapSandboxFailure({
      executionMode: 'PRACTICE_GENERATOR_ORACLE',
      stderr: 'CODESYNC_ERROR_JSON:{"code":"REFERENCE_SOLUTION_FAILED","message":"Generator succeeded, but the Reference Solution failed on generated test #2."}',
      outputTruncated: false,
    })).toEqual({
      errorCode: 'REFERENCE_SOLUTION_FAILED',
      stderr: 'Generator succeeded, but the Reference Solution failed on generated test #2.',
      retryable: false,
    });
  });

  it('maps truncated practice generator output to output limit exceeded', () => {
    expect(mapSandboxFailure({
      executionMode: 'PRACTICE_GENERATOR_ORACLE',
      stderr: '',
      outputTruncated: true,
    })).toEqual({
      errorCode: 'GENERATOR_OUTPUT_LIMIT_EXCEEDED',
      stderr: 'Generated payload exceeds the configured output limit.',
      retryable: false,
    });
  });

  it('maps practice oracle batch runtime failures to reference-solution failures', () => {
    expect(mapSandboxFailure({
      executionMode: 'PRACTICE_ORACLE_BATCH',
      stderr: 'Cannot read properties of undefined',
      outputTruncated: false,
    })).toEqual({
      errorCode: 'REFERENCE_SOLUTION_FAILED',
      stderr: 'Cannot read properties of undefined',
      retryable: false,
    });
  });

  it('fails oracle batch executions without stdin before calling the sandbox', async () => {
    const publish = vi.fn((_exchange: string, _routingKey: string, _content: Buffer) => {
      return true;
    });
    const channel = { publish } as unknown as Channel;
    const message = makeMessage({
      jobId: 'job-oracle-missing-input',
      idempotencyKey: 'idem-oracle-missing-input',
      correlationId: 'corr-oracle-missing-input',
      requestedByUserId: 'user-1',
      createdAt: new Date().toISOString(),
      payload: {
        executionId: 'execution-oracle-missing-input',
        workspaceId: 'workspace-1',
        language: 'javascript',
        files: [{ path: 'index.js', content: 'module.exports = { solution: () => [] };' }],
        entryFile: 'index.js',
        executionMode: 'PRACTICE_ORACLE_BATCH',
      },
    });

    await expect(processCodeExecutionMessage({ message, channel, env })).resolves.toBeUndefined();

    const publishedBody = publish.mock.calls[0]?.[2];
    if (!publishedBody) {
      throw new Error('Expected worker to publish a failed result');
    }
    const failedPayload = JSON.parse(publishedBody.toString('utf8')) as AsyncMessage<Record<string, unknown>>;
    expect(failedPayload.payload).toMatchObject({
      executionId: 'execution-oracle-missing-input',
      errorCode: 'EXECUTION_INPUT_MISSING',
      retryable: false,
    });
  });

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
