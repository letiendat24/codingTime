import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { NotificationCategory, NotificationType } from '@prisma/client';
import {
  VIDEO_EXCHANGE,
  VIDEO_PROCESSING_DLQ,
  VIDEO_PROCESSING_QUEUE,
  VIDEO_RESULT_QUEUE,
  VIDEO_ROUTING_KEYS,
  type AsyncMessage,
  type VideoProcessingCompletedPayload,
  type VideoProcessingFailedPayload,
  type VideoProcessingProgressPayload,
  type VideoProcessingRequestedPayload,
  type VideoProcessingStartedPayload,
} from '@codesync/shared';
import type { AppLogger } from '../../shared/logger';
import type { NotificationService } from '../notifications/notification.service';
import { VideoRepository } from './video.repository';

const RESULT_ROUTING_KEYS = [
  VIDEO_ROUTING_KEYS.started,
  VIDEO_ROUTING_KEYS.progress,
  VIDEO_ROUTING_KEYS.completed,
  VIDEO_ROUTING_KEYS.failed,
] as const;

export async function setupVideoTopology(connection: ChannelModel, maxAttempts: number) {
  const channel = await connection.createChannel();
  const retryLimit = Math.max(maxAttempts, 1);

  await channel.assertExchange(VIDEO_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(VIDEO_PROCESSING_DLQ, { durable: true });
  await channel.assertQueue(VIDEO_PROCESSING_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': VIDEO_EXCHANGE,
      'x-dead-letter-routing-key': `${VIDEO_ROUTING_KEYS.requested}.dead`,
      'x-delivery-limit': retryLimit,
    },
  });
  await channel.bindQueue(VIDEO_PROCESSING_QUEUE, VIDEO_EXCHANGE, VIDEO_ROUTING_KEYS.requested);
  await channel.bindQueue(VIDEO_PROCESSING_DLQ, VIDEO_EXCHANGE, `${VIDEO_ROUTING_KEYS.requested}.dead`);

  await channel.assertQueue(VIDEO_RESULT_QUEUE, { durable: true });
  for (const routingKey of RESULT_ROUTING_KEYS) {
    await channel.bindQueue(VIDEO_RESULT_QUEUE, VIDEO_EXCHANGE, routingKey);
  }

  return channel;
}

export class VideoPublisher {
  constructor(private readonly channel: Channel) {}

  publishProcessingRequested(message: AsyncMessage<VideoProcessingRequestedPayload>) {
    this.channel.publish(VIDEO_EXCHANGE, VIDEO_ROUTING_KEYS.requested, Buffer.from(JSON.stringify(message)), {
      contentType: 'application/json',
      deliveryMode: 2,
      correlationId: message.correlationId,
      messageId: message.jobId,
    });
  }
}

export interface VideoMessagePublisher {
  publishProcessingRequested(message: AsyncMessage<VideoProcessingRequestedPayload>): void;
}

function parseMessage<TPayload extends Record<string, unknown>>(message: ConsumeMessage): AsyncMessage<TPayload> {
  return JSON.parse(message.content.toString('utf8')) as AsyncMessage<TPayload>;
}

function isRoutingKey(value: string, expected: string) {
  return value === expected;
}

export async function startVideoResultConsumer(input: {
  readonly connection: ChannelModel;
  readonly repository: VideoRepository;
  readonly notifications?: NotificationService;
  readonly logger: AppLogger;
  readonly maxAttempts: number;
}) {
  const channel = await setupVideoTopology(input.connection, input.maxAttempts);

  await channel.consume(VIDEO_RESULT_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      const routingKey = message.fields.routingKey;
      const envelope = parseMessage(message);
      const jobId = envelope.jobId;

      input.logger.info(
        { jobId, correlationId: envelope.correlationId, routingKey },
        'video processing result received',
      );

      if (isRoutingKey(routingKey, VIDEO_ROUTING_KEYS.started)) {
        const payload = envelope.payload as VideoProcessingStartedPayload;
        await input.repository.markStarted({ videoAssetId: payload.videoAssetId, jobId });
      } else if (isRoutingKey(routingKey, VIDEO_ROUTING_KEYS.progress)) {
        const payload = envelope.payload as VideoProcessingProgressPayload;
        await input.repository.markProgress({
          videoAssetId: payload.videoAssetId,
          jobId,
          progressPercent: Math.max(0, Math.min(100, payload.progressPercent)),
        });
      } else if (isRoutingKey(routingKey, VIDEO_ROUTING_KEYS.completed)) {
        const payload = envelope.payload as VideoProcessingCompletedPayload;
        await input.repository.markCompleted({
          videoAssetId: payload.videoAssetId,
          jobId,
          durationSeconds: payload.durationSeconds,
          width: payload.width,
          height: payload.height,
          masterPlaylistObjectKey: payload.masterPlaylistObjectKey,
          thumbnailObjectKey: payload.thumbnailObjectKey,
          renditions: payload.renditions,
        });
        const video = await input.repository.findVideoById(payload.videoAssetId);

        if (video && input.notifications) {
          await input.notifications.create({
            userId: video.createdByUserId,
            type: NotificationType.VIDEO_PROCESSING_COMPLETED,
            category: NotificationCategory.COURSE,
            title: 'Video processing completed',
            message: `${video.originalFilename} is ready for playback.`,
            actionUrl: `/instructor/courses/${video.lesson.module.course.id}`,
            dedupeKey: `VIDEO_PROCESSING_COMPLETED:${jobId}:${video.createdByUserId}`,
            data: {
              videoAssetId: video.id,
              lessonId: video.lessonId,
              courseId: video.lesson.module.course.id,
              jobId,
            },
          }).catch((error: unknown) => {
            input.logger.warn({ error, videoAssetId: payload.videoAssetId, jobId }, 'video completion notification skipped');
          });
        }
      } else if (isRoutingKey(routingKey, VIDEO_ROUTING_KEYS.failed)) {
        const payload = envelope.payload as VideoProcessingFailedPayload;
        await input.repository.markFailed({
          videoAssetId: payload.videoAssetId,
          jobId,
          errorCode: payload.errorCode,
          errorMessage: payload.errorMessage,
          retryable: payload.retryable,
        });
        const video = await input.repository.findVideoById(payload.videoAssetId);

        if (video && input.notifications) {
          await input.notifications.create({
            userId: video.createdByUserId,
            type: NotificationType.VIDEO_PROCESSING_FAILED,
            category: NotificationCategory.COURSE,
            title: 'Video processing failed',
            message: `${video.originalFilename} failed to process.`,
            actionUrl: `/instructor/courses/${video.lesson.module.course.id}`,
            dedupeKey: `VIDEO_PROCESSING_FAILED:${jobId}:${video.createdByUserId}`,
            data: {
              videoAssetId: video.id,
              lessonId: video.lessonId,
              courseId: video.lesson.module.course.id,
              jobId,
              errorCode: payload.errorCode,
              retryable: payload.retryable,
            },
          }).catch((error: unknown) => {
            input.logger.warn({ error, videoAssetId: payload.videoAssetId, jobId }, 'video failure notification skipped');
          });
          await input.notifications.notifyAdmins({
            type: NotificationType.ADMIN_OPERATION_ALERT,
            category: NotificationCategory.SYSTEM,
            title: 'Video processing failure',
            message: 'A video processing job failed.',
            actionUrl: '/admin/operations',
            dedupeKeyPrefix: `ADMIN_OPERATION_ALERT:VIDEO_PROCESSING_FAILED:${jobId}`,
            data: {
              videoAssetId: video.id,
              lessonId: video.lessonId,
              courseId: video.lesson.module.course.id,
              jobId,
              errorCode: payload.errorCode,
            },
          });
        }
      }

      channel.ack(message);
    } catch (error) {
      input.logger.error({ error }, 'video processing result handling failed');
      channel.nack(message, false, true);
    }
  });

  return channel;
}
