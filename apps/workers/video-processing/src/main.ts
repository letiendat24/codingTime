import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import amqp, { type Channel, type ConsumeMessage } from 'amqplib';
import {
  VIDEO_EXCHANGE,
  VIDEO_PROCESSING_DLQ,
  VIDEO_PROCESSING_QUEUE,
  VIDEO_ROUTING_KEYS,
  type AsyncMessage,
  type VideoProcessingCompletedPayload,
  type VideoProcessingFailedPayload,
  type VideoProcessingProgressPayload,
  type VideoProcessingRequestedPayload,
  type VideoProcessingStartedPayload,
} from '@codesync/shared';
import { loadWorkerEnv } from './config';
import { processVideo } from './ffmpeg';
import { log, logError } from './logger';
import { downloadObject, createStorageClient, uploadDirectory } from './storage';

function parseMessage(message: ConsumeMessage): AsyncMessage<VideoProcessingRequestedPayload> {
  return JSON.parse(message.content.toString('utf8')) as AsyncMessage<VideoProcessingRequestedPayload>;
}

function publish<TPayload extends Record<string, unknown>>(input: {
  readonly channel: Channel;
  readonly routingKey: string;
  readonly envelope: AsyncMessage<VideoProcessingRequestedPayload>;
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

  input.channel.publish(VIDEO_EXCHANGE, input.routingKey, Buffer.from(JSON.stringify(outgoing)), {
    contentType: 'application/json',
    deliveryMode: 2,
    correlationId: outgoing.correlationId,
    messageId: outgoing.jobId,
  });
}

async function setup(channel: Channel, maxAttempts: number) {
  await channel.assertExchange(VIDEO_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(VIDEO_PROCESSING_DLQ, { durable: true });
  await channel.assertQueue(VIDEO_PROCESSING_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': VIDEO_EXCHANGE,
      'x-dead-letter-routing-key': `${VIDEO_ROUTING_KEYS.requested}.dead`,
      'x-queue-type': 'quorum',
      'x-delivery-limit': maxAttempts,
    },
  });
  await channel.bindQueue(VIDEO_PROCESSING_QUEUE, VIDEO_EXCHANGE, VIDEO_ROUTING_KEYS.requested);
  await channel.bindQueue(VIDEO_PROCESSING_DLQ, VIDEO_EXCHANGE, `${VIDEO_ROUTING_KEYS.requested}.dead`);
}

async function processMessage(input: {
  readonly message: ConsumeMessage;
  readonly channel: Channel;
  readonly env: ReturnType<typeof loadWorkerEnv>;
}) {
  const envelope = parseMessage(input.message);
  const storage = createStorageClient(input.env);
  const workDirectory = join(input.env.VIDEO_TEMP_ROOT, envelope.jobId);
  const sourcePath = join(workDirectory, 'source');
  const outputDirectory = join(workDirectory, 'output');

  log('job received', {
    jobId: envelope.jobId,
    videoAssetId: envelope.payload.videoAssetId,
    correlationId: envelope.correlationId,
  });

  await mkdir(outputDirectory, { recursive: true });

  try {
    publish<VideoProcessingStartedPayload>({
      channel: input.channel,
      routingKey: VIDEO_ROUTING_KEYS.started,
      envelope,
      payload: { videoAssetId: envelope.payload.videoAssetId },
    });
    await downloadObject({
      storage,
      bucket: input.env.MINIO_BUCKET,
      objectKey: envelope.payload.sourceObjectKey,
      targetPath: sourcePath,
    });
    log('transcoding started', { jobId: envelope.jobId, videoAssetId: envelope.payload.videoAssetId });
    const output = await processVideo({
      videoAssetId: envelope.payload.videoAssetId,
      sourcePath,
      outputDirectory,
      timeoutSeconds: input.env.VIDEO_PROCESSING_TIMEOUT_SECONDS,
      onProgress: async (progressPercent) => {
        publish<VideoProcessingProgressPayload>({
          channel: input.channel,
          routingKey: VIDEO_ROUTING_KEYS.progress,
          envelope,
          payload: { videoAssetId: envelope.payload.videoAssetId, progressPercent },
        });
      },
    });

    await uploadDirectory({
      storage,
      bucket: input.env.MINIO_BUCKET,
      directory: output.outputDirectory,
      objectPrefix: `videos/processed/${envelope.payload.videoAssetId}`,
    });
    log('upload completed', { jobId: envelope.jobId, videoAssetId: envelope.payload.videoAssetId });

    publish<VideoProcessingCompletedPayload>({
      channel: input.channel,
      routingKey: VIDEO_ROUTING_KEYS.completed,
      envelope,
      payload: {
        videoAssetId: envelope.payload.videoAssetId,
        durationSeconds: output.durationSeconds,
        width: output.width,
        height: output.height,
        masterPlaylistObjectKey: output.masterPlaylistObjectKey,
        thumbnailObjectKey: output.thumbnailObjectKey,
        renditions: output.renditions.map(({ localDirectory: _localDirectory, ...rendition }) => rendition),
      },
    });
    log('job completed', { jobId: envelope.jobId, videoAssetId: envelope.payload.videoAssetId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown video processing error';
    const retryable = !/Unable to inspect|too small|missing|not found/i.test(errorMessage);

    publish<VideoProcessingFailedPayload>({
      channel: input.channel,
      routingKey: VIDEO_ROUTING_KEYS.failed,
      envelope,
      payload: {
        videoAssetId: envelope.payload.videoAssetId,
        errorCode: retryable ? 'VIDEO_PROCESSING_FAILED' : 'VIDEO_PROCESSING_INVALID_SOURCE',
        errorMessage: errorMessage.slice(0, 500),
        retryable,
      },
    });
    logError('job failed', {
      jobId: envelope.jobId,
      videoAssetId: envelope.payload.videoAssetId,
      retryable,
      errorMessage: errorMessage.slice(0, 500),
    });

    if (retryable) {
      throw error;
    }
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const env = loadWorkerEnv();
  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  await setup(channel, env.VIDEO_PROCESSING_MAX_ATTEMPTS);
  await channel.prefetch(env.VIDEO_WORKER_CONCURRENCY);

  log('worker startup success', {
    environment: env.NODE_ENV,
    concurrency: env.VIDEO_WORKER_CONCURRENCY,
  });

  await channel.consume(VIDEO_PROCESSING_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      await processMessage({ message, channel, env });
      channel.ack(message);
    } catch {
      channel.nack(message, false, true);
    }
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    log('worker shutdown started', { signal });
    await Promise.allSettled([
      channel.close(),
      connection.close(),
    ]);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  logError('worker startup failed', {
    errorMessage: error instanceof Error ? error.message : 'Unknown startup error',
  });
  process.exit(1);
});
