import { getRedisClient } from '../redis/redis-client.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * P8-T05 & FR-074: Sliding Window Token Bucket Rate Limiter.
 * Enforces per-user rate limiting (e.g. 30 messages / 10 seconds)
 * with Redis backend and resilient in-memory fallback.
 */
export class TokenBucketRateLimiter {
  private readonly inMemoryStore = new Map<string, number[]>();

  public async consume(
    userId: string,
    action: string = 'MSG_SEND',
    maxTokens: number = 30,
    windowMs: number = 10000
  ): Promise<RateLimitResult> {
    const key = `ratelimit:${action}:${userId}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const redis = getRedisClient();
      if (redis.status !== 'ready') {
        throw new Error('Redis is not ready');
      }

      const pipeline = redis.pipeline();
      // Remove tokens older than sliding window
      pipeline.zremrangebyscore(key, 0, windowStart);
      // Count tokens within window
      pipeline.zcard(key);
      // Add current request token
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      // Set TTL
      pipeline.expire(key, Math.ceil(windowMs / 1000) + 1);

      const results = await pipeline.exec();
      if (!results || results.some(([err]) => err !== null)) {
        throw new Error('Redis pipeline error');
      }

      const currentCount = (results?.[1]?.[1] as number) ?? 0;

      if (currentCount >= maxTokens) {
        // Exceeded: remove the token we just added
        await redis.zremrangebyscore(key, now, now);
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: windowMs,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxTokens - (currentCount + 1)),
        retryAfterMs: 0,
      };
    } catch {
      // Resilient In-Memory Fallback
      let timestamps = this.inMemoryStore.get(key) || [];
      timestamps = timestamps.filter((t) => t > windowStart);

      if (timestamps.length >= maxTokens) {
        this.inMemoryStore.set(key, timestamps);
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: windowMs,
        };
      }

      timestamps.push(now);
      this.inMemoryStore.set(key, timestamps);

      return {
        allowed: true,
        remaining: maxTokens - timestamps.length,
        retryAfterMs: 0,
      };
    }
  }

  public reset(userId: string, action: string = 'MSG_SEND'): void {
    const key = `ratelimit:${action}:${userId}`;
    this.inMemoryStore.delete(key);
    try {
      const redis = getRedisClient();
      if (redis.status === 'ready') {
        redis.del(key).catch(() => {});
      }
    } catch {}
  }
}

export const tokenBucketRateLimiter = new TokenBucketRateLimiter();
