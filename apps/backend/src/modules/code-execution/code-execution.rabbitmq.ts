import { ExecutionStatus } from '@prisma/client';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  CODE_EXECUTION_DLQ,
  CODE_EXECUTION_QUEUE,
  CODE_EXECUTION_RESULT_QUEUE,
  CODE_EXECUTION_ROUTING_KEYS,
  CODE_EXCHANGE,
  type AsyncMessage,
  type CodeExecutionCompletedPayload,
  type CodeExecutionFailedPayload,
  type CodeExecutionRequestedPayload,
  type CodeExecutionStartedPayload,
  type CodeExecutionTimedOutPayload,
} from '@codesync/shared';
import type { AppLogger } from '../../shared/logger';
import { CodeExecutionRepository } from './code-execution.repository';

const RESULT_ROUTING_KEYS = [
  CODE_EXECUTION_ROUTING_KEYS.started,
  CODE_EXECUTION_ROUTING_KEYS.completed,
  CODE_EXECUTION_ROUTING_KEYS.failed,
  CODE_EXECUTION_ROUTING_KEYS.timedOut,
] as const;

export async function setupCodeExecutionTopology(connection: ChannelModel, maxAttempts: number) {
  const channel = await connection.createChannel();
  const retryLimit = Math.max(maxAttempts, 1);

  await channel.assertExchange(CODE_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(CODE_EXECUTION_DLQ, { durable: true });
  await channel.assertQueue(CODE_EXECUTION_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': CODE_EXCHANGE,
      'x-dead-letter-routing-key': `${CODE_EXECUTION_ROUTING_KEYS.requested}.dead`,
      'x-delivery-limit': retryLimit,
    },
  });
  await channel.bindQueue(CODE_EXECUTION_QUEUE, CODE_EXCHANGE, CODE_EXECUTION_ROUTING_KEYS.requested);
  await channel.bindQueue(CODE_EXECUTION_DLQ, CODE_EXCHANGE, `${CODE_EXECUTION_ROUTING_KEYS.requested}.dead`);

  await channel.assertQueue(CODE_EXECUTION_RESULT_QUEUE, { durable: true });
  for (const routingKey of RESULT_ROUTING_KEYS) {
    await channel.bindQueue(CODE_EXECUTION_RESULT_QUEUE, CODE_EXCHANGE, routingKey);
  }

  return channel;
}

export class CodeExecutionPublisher {
  constructor(private readonly channel: Channel) {}

  publishExecutionRequested(message: AsyncMessage<CodeExecutionRequestedPayload>) {
    this.channel.publish(CODE_EXCHANGE, CODE_EXECUTION_ROUTING_KEYS.requested, Buffer.from(JSON.stringify(message)), {
      contentType: 'application/json',
      deliveryMode: 2,
      correlationId: message.correlationId,
      messageId: message.jobId,
    });
  }
}

function parseMessage<TPayload extends Record<string, unknown>>(message: ConsumeMessage): AsyncMessage<TPayload> {
  return JSON.parse(message.content.toString('utf8')) as AsyncMessage<TPayload>;
}

export async function startCodeExecutionResultConsumer(input: {
  readonly connection: ChannelModel;
  readonly repository: CodeExecutionRepository;
  readonly logger: AppLogger;
  readonly maxAttempts: number;
}) {
  const channel = await setupCodeExecutionTopology(input.connection, input.maxAttempts);

  await channel.consume(CODE_EXECUTION_RESULT_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      const routingKey = message.fields.routingKey;
      const envelope = parseMessage(message);

      input.logger.info({ jobId: envelope.jobId, correlationId: envelope.correlationId, routingKey }, 'code execution result received');

      if (routingKey === CODE_EXECUTION_ROUTING_KEYS.started) {
        const payload = envelope.payload as CodeExecutionStartedPayload;
        await input.repository.markExecutionStarted({ executionId: payload.executionId, startedAt: new Date() });
      } else if (routingKey === CODE_EXECUTION_ROUTING_KEYS.completed) {
        const payload = envelope.payload as CodeExecutionCompletedPayload;
        await input.repository.finishExecution({
          executionId: payload.executionId,
          status: ExecutionStatus.SUCCEEDED,
          exitCode: payload.exitCode,
          stdout: payload.stdout,
          stderr: payload.stderr,
          durationMs: payload.durationMs,
          memoryBytes: payload.memoryBytes === null ? null : BigInt(payload.memoryBytes),
          errorCode: null,
          finishedAt: new Date(),
        });
      } else if (routingKey === CODE_EXECUTION_ROUTING_KEYS.failed) {
        const payload = envelope.payload as CodeExecutionFailedPayload;
        await input.repository.finishExecution({
          executionId: payload.executionId,
          status: ExecutionStatus.FAILED,
          exitCode: payload.exitCode,
          stdout: payload.stdout,
          stderr: payload.stderr,
          durationMs: payload.durationMs,
          memoryBytes: payload.memoryBytes === null ? null : BigInt(payload.memoryBytes),
          errorCode: payload.errorCode,
          finishedAt: new Date(),
        });
      } else if (routingKey === CODE_EXECUTION_ROUTING_KEYS.timedOut) {
        const payload = envelope.payload as CodeExecutionTimedOutPayload;
        await input.repository.finishExecution({
          executionId: payload.executionId,
          status: ExecutionStatus.TIMED_OUT,
          exitCode: null,
          stdout: payload.stdout,
          stderr: payload.stderr,
          durationMs: payload.durationMs,
          memoryBytes: null,
          errorCode: payload.errorCode,
          finishedAt: new Date(),
        });
      }

      channel.ack(message);
    } catch (error) {
      input.logger.error({ error }, 'code execution result handling failed');
      channel.nack(message, false, true);
    }
  });

  return channel;
}
