import Redis from 'ioredis';
import type { Env } from '../../config';

export function createRedisClient(env: Env): Redis {
  return new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
}
