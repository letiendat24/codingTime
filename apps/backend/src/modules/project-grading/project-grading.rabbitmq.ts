import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  PROJECT_EXCHANGE,
  PROJECT_GRADING_DLQ,
  PROJECT_GRADING_QUEUE,
  PROJECT_GRADING_RESULT_QUEUE,
  PROJECT_GRADING_ROUTING_KEYS,
  type AsyncMessage,
  type ProjectGradingCompletedPayload,
  type ProjectGradingFailedPayload,
  type ProjectGradingRequestedPayload,
  type ProjectGradingStartedPayload,
  type ProjectGradingTimedOutPayload,
} from '@codesync/shared';
import type { AppLogger } from '../../shared/logger';
import type { ProjectGradingService } from './project-grading.service';

type ProjectResultMessage =
  | AsyncMessage<ProjectGradingStartedPayload>
  | AsyncMessage<ProjectGradingCompletedPayload>
  | AsyncMessage<ProjectGradingFailedPayload>
  | AsyncMessage<ProjectGradingTimedOutPayload>;

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

export class ProjectGradingPublisher {
  constructor(private readonly channel: Channel) {}

  publishProjectGradingRequested(message: AsyncMessage<ProjectGradingRequestedPayload>) {
    this.channel.publish(PROJECT_EXCHANGE, PROJECT_GRADING_ROUTING_KEYS.requested, Buffer.from(JSON.stringify(message)), {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: message.jobId,
      correlationId: message.correlationId,
    });
  }
}

function parseMessage(message: ConsumeMessage): ProjectResultMessage {
  return JSON.parse(message.content.toString('utf8')) as ProjectResultMessage;
}

export async function startProjectGradingResultConsumer(input: {
  readonly connection: ChannelModel;
  readonly service: ProjectGradingService;
  readonly logger: AppLogger;
  readonly maxAttempts: number;
}) {
  const channel = await setupProjectGradingTopology(input.connection, input.maxAttempts);

  await channel.consume(PROJECT_GRADING_RESULT_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      const parsed = parseMessage(message);
      const routingKey = message.fields.routingKey;

      if (routingKey === PROJECT_GRADING_ROUTING_KEYS.started) {
        await input.service.markStarted(parsed as AsyncMessage<ProjectGradingStartedPayload>);
      } else if (routingKey === PROJECT_GRADING_ROUTING_KEYS.completed) {
        await input.service.applyCompleted(parsed as AsyncMessage<ProjectGradingCompletedPayload>);
      } else if (routingKey === PROJECT_GRADING_ROUTING_KEYS.timedOut) {
        await input.service.applyTimedOut(parsed as AsyncMessage<ProjectGradingTimedOutPayload>);
      } else if (routingKey === PROJECT_GRADING_ROUTING_KEYS.failed) {
        await input.service.applyFailed(parsed as AsyncMessage<ProjectGradingFailedPayload>);
      }

      channel.ack(message);
    } catch (error) {
      input.logger.error({ error }, 'project grading result consumer failed');
      channel.nack(message, false, true);
    }
  });

  return channel;
}
