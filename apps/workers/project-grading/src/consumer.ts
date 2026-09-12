import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  PROJECT_EXCHANGE,
  PROJECT_GRADING_DLQ,
  PROJECT_GRADING_QUEUE,
  PROJECT_GRADING_RESULT_QUEUE,
  PROJECT_GRADING_ROUTING_KEYS,
  type AsyncMessage,
  type ProjectGradingRequestedPayload,
  type ProjectGradingStartedPayload,
} from '@codesync/shared';
import type { ProjectGradingWorkerEnv } from './config';
import { gradeProject } from './grader';
import type { WorkerLogger } from './logger';

export async function setupProjectGradingTopology(connection: ChannelModel, maxAttempts: number) {
  const channel = await connection.createChannel();
  const retryLimit = Math.max(maxAttempts, 1);

  await channel.assertExchange(PROJECT_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(PROJECT_GRADING_DLQ, { durable: true });
  await channel.assertQueue(PROJECT_GRADING_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': PROJECT_EXCHANGE,
      'x-dead-letter-routing-key': `${PROJECT_GRADING_ROUTING_KEYS.requested}.dead`,
      'x-delivery-limit': retryLimit,
    },
  });
  await channel.bindQueue(PROJECT_GRADING_QUEUE, PROJECT_EXCHANGE, PROJECT_GRADING_ROUTING_KEYS.requested);
  await channel.bindQueue(PROJECT_GRADING_DLQ, PROJECT_EXCHANGE, `${PROJECT_GRADING_ROUTING_KEYS.requested}.dead`);

  await channel.assertQueue(PROJECT_GRADING_RESULT_QUEUE, { durable: true });
  await channel.bindQueue(PROJECT_GRADING_RESULT_QUEUE, PROJECT_EXCHANGE, PROJECT_GRADING_ROUTING_KEYS.started);
  await channel.bindQueue(PROJECT_GRADING_RESULT_QUEUE, PROJECT_EXCHANGE, PROJECT_GRADING_ROUTING_KEYS.completed);
  await channel.bindQueue(PROJECT_GRADING_RESULT_QUEUE, PROJECT_EXCHANGE, PROJECT_GRADING_ROUTING_KEYS.failed);
  await channel.bindQueue(PROJECT_GRADING_RESULT_QUEUE, PROJECT_EXCHANGE, PROJECT_GRADING_ROUTING_KEYS.timedOut);

  return channel;
}

function publish<T extends Record<string, unknown>>(
  channel: Channel,
  source: AsyncMessage<ProjectGradingRequestedPayload>,
  routingKey: string,
  payload: T,
) {
  const message = {
    jobId: source.jobId,
    idempotencyKey: source.idempotencyKey,
    correlationId: source.correlationId,
    requestedByUserId: source.requestedByUserId,
    createdAt: new Date().toISOString(),
    payload,
  };

  channel.publish(PROJECT_EXCHANGE, routingKey, Buffer.from(JSON.stringify(message)), {
    contentType: 'application/json',
    deliveryMode: 2,
    messageId: source.jobId,
    correlationId: source.correlationId,
  });
}

export async function handleProjectGradingMessage(input: {
  readonly channel: Channel;
  readonly message: ConsumeMessage;
  readonly env: ProjectGradingWorkerEnv;
  readonly logger: WorkerLogger;
}) {
  const parsed = JSON.parse(input.message.content.toString('utf8')) as AsyncMessage<ProjectGradingRequestedPayload>;
  const workingDirectory = join(input.env.PROJECT_GRADING_TEMP_ROOT, parsed.payload.submissionId);
  const repositoryDirectory = join(workingDirectory, 'repo');

  input.logger.info({
    submissionId: parsed.payload.submissionId,
    jobId: parsed.jobId,
    correlationId: parsed.correlationId,
  }, 'project grading job received');

  publish<ProjectGradingStartedPayload>(input.channel, parsed, PROJECT_GRADING_ROUTING_KEYS.started, {
    submissionId: parsed.payload.submissionId,
  });

  await rm(workingDirectory, { recursive: true, force: true });
  await mkdir(workingDirectory, { recursive: true });

  try {
    const outcome = await gradeProject({
      payload: parsed.payload,
      repositoryDirectory,
      env: input.env,
    });

    const routingKey =
      outcome.kind === 'completed'
        ? PROJECT_GRADING_ROUTING_KEYS.completed
        : outcome.kind === 'timed_out'
          ? PROJECT_GRADING_ROUTING_KEYS.timedOut
          : PROJECT_GRADING_ROUTING_KEYS.failed;

    publish(input.channel, parsed, routingKey, outcome.payload);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}
