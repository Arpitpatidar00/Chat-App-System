import { wsGateway } from '../../core/websocket/gateway.js';
import { getRedisClient } from '../../core/redis/redis-client.js';
import { ok, type Result } from '../../core/result/result.js';
import type { UserPresenceDTO } from '@chat/types';

export class PresenceService {
  public async getUserPresence(userId: string): Promise<Result<UserPresenceDTO>> {
    const isOnline = wsGateway.isUserOnline(userId);
    let lastSeenAt: string | null = null;

    try {
      const redis = getRedisClient();
      const lastSeenStr = await redis.get(`presence:last_seen:${userId}`);
      if (lastSeenStr) {
        lastSeenAt = lastSeenStr;
      }
    } catch {
      // In-memory fallback
    }

    return ok({
      userId,
      isOnline,
      lastSeenAt,
    });
  }

  public async setPresence(userId: string, isOnline: boolean): Promise<void> {
    const timestamp = new Date().toISOString();

    try {
      const redis = getRedisClient();
      if (!isOnline) {
        await redis.set(`presence:last_seen:${userId}`, timestamp, 'EX', 86400 * 30);
      }
    } catch {
      // Offline fallback
    }
  }
}

export const presenceService = new PresenceService();
