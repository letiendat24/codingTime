import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  CODE_EXCHANGE,
  CODE_JUDGE_DLQ,
  CODE_JUDGE_QUEUE,
  CODE_JUDGE_RESULT_QUEUE,
  CODE_JUDGE_ROUTING_KEYS,
  type AsyncMessage,
  type CodeJudgeCompletedPayload,
  type CodeJudgeFailedPayload,
  type CodeJudgeRequestedPayload,
  type CodeJudgeStartedPayload,
  type CodeJudgeTimedOutPayload,
} from '@codesync/shared';
import type { AppLogger } from '../../shared/logger';
import type { JudgeService } from './judge.service';

type JudgeResultMessage =
  | AsyncMessage<CodeJudgeStartedPayload>
  | AsyncMessage<CodeJudgeCompletedPayload>
  | AsyncMessage<CodeJudgeFailedPayload>
  | AsyncMessage<CodeJudgeTimedOutPayload>;

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

export class JudgePublisher {
  constructor(private readonly channel: Channel) {}

  publishJudgeRequested(message: AsyncMessage<CodeJudgeRequestedPayload>) {
    this.channel.publish(CODE_EXCHANGE, CODE_JUDGE_ROUTING_KEYS.requested, Buffer.from(JSON.stringify(message)), {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: message.jobId,
      correlationId: message.correlationId,
    });
  }
}

function parseMessage(message: ConsumeMessage): JudgeResultMessage {
  return JSON.parse(message.content.toString('utf8')) as JudgeResultMessage;
}

export async function startJudgeResultConsumer(input: {
  readonly connection: ChannelModel;
  readonly service: JudgeService;
  readonly logger: AppLogger;
  readonly maxAttempts: number;
}) {
  const channel = await setupJudgeTopology(input.connection, input.maxAttempts);

  await channel.consume(CODE_JUDGE_RESULT_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      const parsed = parseMessage(message);
      const routingKey = message.fields.routingKey;

      if (routingKey === CODE_JUDGE_ROUTING_KEYS.started) {
        await input.service.markStarted(parsed as AsyncMessage<CodeJudgeStartedPayload>);
      } else if (routingKey === CODE_JUDGE_ROUTING_KEYS.completed) {
        await input.service.applyCompleted(parsed as AsyncMessage<CodeJudgeCompletedPayload>);
      } else if (routingKey === CODE_JUDGE_ROUTING_KEYS.timedOut) {
        await input.service.applyTimedOut(parsed as AsyncMessage<CodeJudgeTimedOutPayload>);
      } else if (routingKey === CODE_JUDGE_ROUTING_KEYS.failed) {
        await input.service.applyFailed(parsed as AsyncMessage<CodeJudgeFailedPayload>);
      }

      channel.ack(message);
    } catch (error) {
      input.logger.error({ error }, 'judge result consumer failed');
      channel.nack(message, false, true);
    }
  });

  return channel;
}
