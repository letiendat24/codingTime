import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  CODE_EXCHANGE,
  CODE_JUDGE_DLQ,
  CODE_JUDGE_QUEUE,
  CODE_JUDGE_RESULT_QUEUE,
  CODE_JUDGE_ROUTING_KEYS,
  type AsyncMessage,
  type CodeJudgeFailedPayload,
  type CodeJudgeRequestedPayload,
  type CodeJudgeStartedPayload,
} from '@codesync/shared';
import type { CodeJudgeWorkerEnv } from './config';
import { judgeSubmission } from './judge';
import type { WorkerLogger } from './logger';

export async function setupJudgeTopology(connection: ChannelModel, maxAttempts: number) {
  const channel = await connection.createChannel();
  const retryLimit = Math.max(maxAttempts, 1);

  await channel.assertExchange(CODE_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(CODE_JUDGE_DLQ, { durable: true });
  await channel.assertQueue(CODE_JUDGE_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': CODE_EXCHANGE,
      'x-dead-letter-routing-key': `${CODE_JUDGE_ROUTING_KEYS.requested}.dead`,
      'x-delivery-limit': retryLimit,
    },
  });
  await channel.bindQueue(CODE_JUDGE_QUEUE, CODE_EXCHANGE, CODE_JUDGE_ROUTING_KEYS.requested);
  await channel.bindQueue(CODE_JUDGE_DLQ, CODE_EXCHANGE, `${CODE_JUDGE_ROUTING_KEYS.requested}.dead`);

  await channel.assertQueue(CODE_JUDGE_RESULT_QUEUE, { durable: true });
  await channel.bindQueue(CODE_JUDGE_RESULT_QUEUE, CODE_EXCHANGE, CODE_JUDGE_ROUTING_KEYS.started);
  await channel.bindQueue(CODE_JUDGE_RESULT_QUEUE, CODE_EXCHANGE, CODE_JUDGE_ROUTING_KEYS.completed);
  await channel.bindQueue(CODE_JUDGE_RESULT_QUEUE, CODE_EXCHANGE, CODE_JUDGE_ROUTING_KEYS.failed);
  await channel.bindQueue(CODE_JUDGE_RESULT_QUEUE, CODE_EXCHANGE, CODE_JUDGE_ROUTING_KEYS.timedOut);

  return channel;
}

function publish<T extends Record<string, unknown>>(
  channel: Channel,
  source: AsyncMessage<CodeJudgeRequestedPayload>,
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

  channel.publish(CODE_EXCHANGE, routingKey, Buffer.from(JSON.stringify(message)), {
    contentType: 'application/json',
    deliveryMode: 2,
    messageId: source.jobId,
    correlationId: source.correlationId,
  });
}

export async function handleJudgeMessage(input: {
  readonly channel: Channel;
  readonly message: ConsumeMessage;
  readonly env: CodeJudgeWorkerEnv;
  readonly logger: WorkerLogger;
}) {
  const parsed = JSON.parse(input.message.content.toString('utf8')) as AsyncMessage<CodeJudgeRequestedPayload>;

  input.logger.info({
    submissionId: parsed.payload.submissionId,
    jobId: parsed.jobId,
    correlationId: parsed.correlationId,
  }, 'judge job received');

  publish<CodeJudgeStartedPayload>(input.channel, parsed, CODE_JUDGE_ROUTING_KEYS.started, {
    submissionId: parsed.payload.submissionId,
  });

  try {
    const outcome = await judgeSubmission({ payload: parsed.payload, env: input.env });
    publish(input.channel, parsed, outcome.kind === 'completed' ? CODE_JUDGE_ROUTING_KEYS.completed : CODE_JUDGE_ROUTING_KEYS.timedOut, outcome.payload);
  } catch (error) {
    input.logger.error({
      submissionId: parsed.payload.submissionId,
      jobId: parsed.jobId,
      correlationId: parsed.correlationId,
      error: error instanceof Error ? error.message : 'unknown',
    }, 'judge infrastructure failure');

    throw error;
  }
}

export function publishNonRetryableFailure(
  channel: Channel,
  source: AsyncMessage<CodeJudgeRequestedPayload>,
  payload: CodeJudgeFailedPayload,
) {
  publish(channel, source, CODE_JUDGE_ROUTING_KEYS.failed, payload);
}
