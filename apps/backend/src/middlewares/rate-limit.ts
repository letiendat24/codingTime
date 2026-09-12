import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type Redis from 'ioredis';
import { HttpError } from '../shared/http-error';

export interface RateLimiterStore {
  increment(key: string, windowMs: number): Promise<number>;
}

export function createMemoryRateLimiterStore(): RateLimiterStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();

  return {
    async increment(key: string, windowMs: number) {
      const now = Date.now();
      const current = entries.get(key);

      if (!current || current.expiresAt <= now) {
        entries.set(key, { count: 1, expiresAt: now + windowMs });
        return 1;
      }

      current.count += 1;
      return current.count;
    },
  };
}

export function createRedisRateLimiterStore(redis: Redis): RateLimiterStore {
  return {
    async increment(key: string, windowMs: number) {
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }

      return count;
    },
  };
}

export function rateLimit(options: {
  readonly store: RateLimiterStore;
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly keyPrefix: string;
}): RequestHandler {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      const key = `${options.keyPrefix}:${request.ip}`;
      const count = await options.store.increment(key, options.windowMs);

      if (count > options.maxRequests) {
        next(new HttpError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests'));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
