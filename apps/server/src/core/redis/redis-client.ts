import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

let redisClient: Redis | null = null;
let redisSubscriber: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 2) return null; // Stop retrying
        return 100;
      },
      lazyConnect: true,
    });

    redisClient.on('error', () => {
      // Handled silently
    });
  }

  return redisClient;
}

export function getRedisSubscriber(): Redis {
  if (!redisSubscriber) {
    redisSubscriber = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisSubscriber.on('error', (err) => {
      console.warn('⚠️ Redis Subscriber Error:', err.message);
    });
  }

  return redisSubscriber;
}

export async function closeRedisConnections(): Promise<void> {
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {}
    redisClient = null;
  }
  if (redisSubscriber) {
    try {
      redisSubscriber.disconnect();
    } catch {}
    redisSubscriber = null;
  }
}
