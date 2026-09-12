import type { ChannelModel } from 'amqplib';
import type Redis from 'ioredis';
import type { Client as MinioClient } from 'minio';
import type { PrismaClient } from '@prisma/client';

export type DependencyStatus = 'ok' | 'error';

export interface ReadinessReport {
  readonly postgres: DependencyStatus;
  readonly redis: DependencyStatus;
  readonly rabbitmq: DependencyStatus;
  readonly minio: DependencyStatus;
}

export type ReadinessChecker = () => Promise<ReadinessReport>;

async function checkDependency(check: () => Promise<unknown>): Promise<DependencyStatus> {
  try {
    await check();
    return 'ok';
  } catch {
    return 'error';
  }
}

export function createReadinessChecker(input: {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly rabbitmq: ChannelModel;
  readonly storage: MinioClient;
  readonly minioBucket: string;
}): ReadinessChecker {
  return async () => {
    const [postgres, redis, rabbitmq, minio] = await Promise.all([
      checkDependency(() => input.prisma.$queryRaw`SELECT 1`),
      checkDependency(() => input.redis.ping()),
      checkDependency(async () => {
        const channel = await input.rabbitmq.createChannel();
        await channel.close();
      }),
      checkDependency(() => input.storage.bucketExists(input.minioBucket)),
    ]);

    return { postgres, redis, rabbitmq, minio };
  };
}
