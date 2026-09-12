import type { ChannelModel } from 'amqplib';
import type Redis from 'ioredis';
import type { Client as MinioClient } from 'minio';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config';
import type { AppLogger } from '../shared/logger';
import { createPrismaClient } from './database/prisma';
import { createRabbitMqConnection } from './rabbitmq/connection';
import { createRedisClient } from './redis/client';
import { createObjectStorageClient } from './storage/client';
import { CodeExecutionRepository } from '../modules/code-execution/code-execution.repository';
import {
  CodeExecutionPublisher,
  setupCodeExecutionTopology,
  startCodeExecutionResultConsumer,
} from '../modules/code-execution/code-execution.rabbitmq';
import { JudgeRepository } from '../modules/judge/judge.repository';
import { JudgePublisher, setupJudgeTopology, startJudgeResultConsumer } from '../modules/judge/judge.rabbitmq';
import { JudgeService } from '../modules/judge/judge.service';
import { LearningRepository } from '../modules/learning/learning.repository';
import { LearningService } from '../modules/learning/learning.service';
import { NotificationRepository } from '../modules/notifications/notification.repository';
import { NotificationService } from '../modules/notifications/notification.service';
import { ProjectGradingRepository } from '../modules/project-grading/project-grading.repository';
import {
  ProjectGradingPublisher,
  setupProjectGradingTopology,
  startProjectGradingResultConsumer,
} from '../modules/project-grading/project-grading.rabbitmq';
import { ProjectGradingService } from '../modules/project-grading/project-grading.service';
import { VideoRepository } from '../modules/videos/video.repository';
import { setupVideoTopology, startVideoResultConsumer, VideoPublisher } from '../modules/videos/video.rabbitmq';

export interface InfrastructureClients {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly rabbitmq: ChannelModel;
  readonly storage: MinioClient;
  readonly videoPublisher: VideoPublisher;
  readonly codeExecutionPublisher: CodeExecutionPublisher;
  readonly judgePublisher: JudgePublisher;
  readonly projectGradingPublisher: ProjectGradingPublisher;
  readonly videoPublisherChannel: import('amqplib').Channel;
  readonly videoResultChannel: import('amqplib').Channel;
  readonly codeExecutionPublisherChannel: import('amqplib').Channel;
  readonly codeExecutionResultChannel: import('amqplib').Channel;
  readonly judgePublisherChannel: import('amqplib').Channel;
  readonly judgeResultChannel: import('amqplib').Channel;
  readonly projectGradingPublisherChannel: import('amqplib').Channel;
  readonly projectGradingResultChannel: import('amqplib').Channel;
}

export async function initializeInfrastructure(
  env: Env,
  logger: AppLogger,
): Promise<InfrastructureClients> {
  const prisma = createPrismaClient();
  const redis = createRedisClient(env);
  const rabbitmq = await createRabbitMqConnection(env);
  const storage = createObjectStorageClient(env);

  await prisma.$connect();
  await redis.connect();
  await storage.bucketExists(env.MINIO_BUCKET).catch((error: unknown) => {
    logger.warn({ error, bucket: env.MINIO_BUCKET }, 'MinIO bucket is not available yet');
  });
  const videoPublisherChannel = await setupVideoTopology(rabbitmq, env.VIDEO_PROCESSING_MAX_ATTEMPTS);
  const codeExecutionPublisherChannel = await setupCodeExecutionTopology(rabbitmq, env.CODE_EXECUTION_MAX_ATTEMPTS);
  const judgePublisherChannel = await setupJudgeTopology(rabbitmq, env.JUDGE_MAX_ATTEMPTS);
  const projectGradingPublisherChannel = await setupProjectGradingTopology(rabbitmq, env.PROJECT_GRADING_MAX_ATTEMPTS);
  const learningService = new LearningService(prisma, new LearningRepository(prisma));
  const notificationService = new NotificationService(new NotificationRepository(prisma), logger);
  const judgeService = new JudgeService(
    prisma,
    new JudgeRepository(prisma),
    { publishJudgeRequested: () => undefined },
    env,
    logger,
    learningService,
    notificationService,
  );
  const projectGradingService = new ProjectGradingService(
    prisma,
    new ProjectGradingRepository(prisma),
    { publishProjectGradingRequested: () => undefined },
    env,
    logger,
    learningService,
    undefined,
    notificationService,
  );
  const videoResultChannel = await startVideoResultConsumer({
    connection: rabbitmq,
    repository: new VideoRepository(prisma),
    notifications: notificationService,
    logger,
    maxAttempts: env.VIDEO_PROCESSING_MAX_ATTEMPTS,
  });
  const codeExecutionResultChannel = await startCodeExecutionResultConsumer({
    connection: rabbitmq,
    repository: new CodeExecutionRepository(prisma),
    logger,
    maxAttempts: env.CODE_EXECUTION_MAX_ATTEMPTS,
  });
  const judgeResultChannel = await startJudgeResultConsumer({
    connection: rabbitmq,
    service: judgeService,
    logger,
    maxAttempts: env.JUDGE_MAX_ATTEMPTS,
  });
  const projectGradingResultChannel = await startProjectGradingResultConsumer({
    connection: rabbitmq,
    service: projectGradingService,
    logger,
    maxAttempts: env.PROJECT_GRADING_MAX_ATTEMPTS,
  });
  const videoPublisher = new VideoPublisher(videoPublisherChannel);
  const codeExecutionPublisher = new CodeExecutionPublisher(codeExecutionPublisherChannel);
  const judgePublisher = new JudgePublisher(judgePublisherChannel);
  const projectGradingPublisher = new ProjectGradingPublisher(projectGradingPublisherChannel);

  logger.info('Infrastructure clients initialized');

  return {
    prisma,
    redis,
    rabbitmq,
    storage,
    videoPublisher,
    codeExecutionPublisher,
    judgePublisher,
    projectGradingPublisher,
    videoPublisherChannel,
    videoResultChannel,
    codeExecutionPublisherChannel,
    codeExecutionResultChannel,
    judgePublisherChannel,
    judgeResultChannel,
    projectGradingPublisherChannel,
    projectGradingResultChannel,
  };
}

export async function closeInfrastructure(clients: InfrastructureClients, logger: AppLogger) {
  const results = await Promise.allSettled([
    clients.prisma.$disconnect(),
    clients.redis.quit(),
    clients.videoPublisherChannel.close(),
    clients.videoResultChannel.close(),
    clients.codeExecutionPublisherChannel.close(),
    clients.codeExecutionResultChannel.close(),
    clients.judgePublisherChannel.close(),
    clients.judgeResultChannel.close(),
    clients.projectGradingPublisherChannel.close(),
    clients.projectGradingResultChannel.close(),
    clients.rabbitmq.close(),
  ]);
  const rejected = results.filter((result) => result.status === 'rejected');

  if (rejected.length > 0) {
    logger.warn({ failedClients: rejected.length }, 'Some infrastructure clients failed to close cleanly');
  }

  logger.info('Infrastructure clients closed');
}
