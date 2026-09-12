import type { Channel, ConsumeMessage } from 'amqplib';
import {
  CODE_EXECUTION_DLQ,
  CODE_EXECUTION_QUEUE,
  CODE_EXECUTION_ROUTING_KEYS,
  CODE_EXCHANGE,
  type AsyncMessage,
  type CodeExecutionCompletedPayload,
  type CodeExecutionFailedPayload,
  type CodeExecutionRequestedPayload,
  type CodeExecutionStartedPayload,
  type CodeExecutionTimedOutPayload,
} from '@codesync/shared';
import type { CodeExecutionWorkerEnv } from './config';
import { log, logError } from './logger';
import { getRuntime } from './runtimes';
import { runInDockerSandbox } from './sandbox';

function parseMessage(message: ConsumeMessage): AsyncMessage<CodeExecutionRequestedPayload> {
  return JSON.parse(message.content.toString('utf8')) as AsyncMessage<CodeExecutionRequestedPayload>;
}

function publish<TPayload extends Record<string, unknown>>(input: {
  readonly channel: Channel;
  readonly routingKey: string;
  readonly envelope: AsyncMessage<CodeExecutionRequestedPayload>;
  readonly payload: TPayload;
}) {
  const outgoing: AsyncMessage<TPayload> = {
    jobId: input.envelope.jobId,
    idempotencyKey: input.envelope.idempotencyKey,
    correlationId: input.envelope.correlationId,
    requestedByUserId: input.envelope.requestedByUserId,
    createdAt: new Date().toISOString(),
    payload: input.payload,
  };

  input.channel.publish(CODE_EXCHANGE, input.routingKey, Buffer.from(JSON.stringify(outgoing)), {
    contentType: 'application/json',
    deliveryMode: 2,
    correlationId: outgoing.correlationId,
    messageId: outgoing.jobId,
  });
}

export async function setupCodeExecutionWorkerTopology(channel: Channel, maxAttempts: number) {
  await channel.assertExchange(CODE_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(CODE_EXECUTION_DLQ, { durable: true });
  await channel.assertQueue(CODE_EXECUTION_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': CODE_EXCHANGE,
      'x-dead-letter-routing-key': `${CODE_EXECUTION_ROUTING_KEYS.requested}.dead`,
      'x-queue-type': 'quorum',
      'x-delivery-limit': maxAttempts,
    },
  });
  await channel.bindQueue(CODE_EXECUTION_QUEUE, CODE_EXCHANGE, CODE_EXECUTION_ROUTING_KEYS.requested);
  await channel.bindQueue(CODE_EXECUTION_DLQ, CODE_EXCHANGE, `${CODE_EXECUTION_ROUTING_KEYS.requested}.dead`);
}

export async function processCodeExecutionMessage(input: {
  readonly message: ConsumeMessage;
  readonly channel: Channel;
  readonly env: CodeExecutionWorkerEnv;
}) {
  const envelope = parseMessage(input.message);
  const runtime = getRuntime(envelope.payload.language);

  log('execution worker received job', {
    executionId: envelope.payload.executionId,
    jobId: envelope.jobId,
    correlationId: envelope.correlationId,
    language: envelope.payload.language,
  });

  publish<CodeExecutionStartedPayload>({
    channel: input.channel,
    routingKey: CODE_EXECUTION_ROUTING_KEYS.started,
    envelope,
    payload: { executionId: envelope.payload.executionId },
  });

  try {
    log('sandbox created', { executionId: envelope.payload.executionId, jobId: envelope.jobId });
    const result = await runInDockerSandbox({
      executionId: envelope.payload.executionId,
      jobId: envelope.jobId,
      runtime,
      entryFile: envelope.payload.entryFile,
      files: envelope.payload.files,
      env: input.env,
    });
    const stderr = result.outputTruncated ? `${result.stderr}\n[CodeSync output truncated]` : result.stderr;

    if (result.status === 'timed_out') {
      publish<CodeExecutionTimedOutPayload>({
        channel: input.channel,
        routingKey: CODE_EXECUTION_ROUTING_KEYS.timedOut,
        envelope,
        payload: {
          executionId: envelope.payload.executionId,
          stdout: result.stdout,
          stderr,
          durationMs: result.durationMs,
          errorCode: 'EXECUTION_TIMED_OUT',
        },
      });
      log('execution timed out', { executionId: envelope.payload.executionId, jobId: envelope.jobId, durationMs: result.durationMs });
      return;
    }

    if (result.exitCode === 0) {
      publish<CodeExecutionCompletedPayload>({
        channel: input.channel,
        routingKey: CODE_EXECUTION_ROUTING_KEYS.completed,
        envelope,
        payload: {
          executionId: envelope.payload.executionId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr,
          durationMs: result.durationMs,
          memoryBytes: null,
        },
      });
    } else {
      publish<CodeExecutionFailedPayload>({
        channel: input.channel,
        routingKey: CODE_EXECUTION_ROUTING_KEYS.failed,
        envelope,
        payload: {
          executionId: envelope.payload.executionId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr,
          durationMs: result.durationMs,
          memoryBytes: null,
          errorCode: 'USER_RUNTIME_ERROR',
          retryable: false,
        },
      });
    }

    log('execution finished', {
      executionId: envelope.payload.executionId,
      jobId: envelope.jobId,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });
  } catch (error) {
    logError('execution infrastructure failure', {
      executionId: envelope.payload.executionId,
      jobId: envelope.jobId,
      errorMessage: error instanceof Error ? error.message.slice(0, 200) : 'Unknown infrastructure error',
    });
    throw error;
  } finally {
    log('sandbox removed', { executionId: envelope.payload.executionId, jobId: envelope.jobId });
  }
}
