import { prisma, type User } from '@chat/database';
import { getRedisClient } from '../../core/redis/redis-client.js';
import { wsGateway } from '../../core/websocket/gateway.js';

export interface PresenceRecord {
  userId: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
}

export class PresenceRepository {
  /**
   * P3-T04: Records device heartbeat in Redis hash and wsGateway.
   */
  public async setDeviceHeartbeat(userId: string, deviceId: string): Promise<void> {
    wsGateway.recordHeartbeat(userId, deviceId);

    try {
      const redis = getRedisClient();
      const key = `presence:user:${userId}:devices`;
      await redis.hset(key, deviceId, Date.now().toString());
      await redis.expire(key, 60); // 60s TTL for the hash
    } catch {
      // Redis fallback: wsGateway maintains in-memory heartbeat
    }
  }

  /**
   * P3-T04: Evaluates user presence across devices.
   * User is ONLINE if at least 1 device has heartbeat within the last 45s.
   */
  public async getUserPresence(userId: string): Promise<PresenceRecord> {
    const isGatewayOnline = wsGateway.isUserOnline(userId, 45000);
    const lastSeen = wsGateway.getLastSeen(userId);

    try {
      const redis = getRedisClient();
      const key = `presence:user:${userId}:devices`;
      const devices = await redis.hgetall(key);

      const cutoff = Date.now() - 45000;
      let hasActiveDevice = false;
      let latestHeartbeat = 0;

      for (const [_, tsStr] of Object.entries(devices)) {
        const ts = parseInt(tsStr, 10);
        if (ts > latestHeartbeat) {
          latestHeartbeat = ts;
        }
        if (ts >= cutoff) {
          hasActiveDevice = true;
        }
      }

      if (hasActiveDevice || isGatewayOnline) {
        return {
          userId,
          isOnline: true,
          lastSeenAt: null,
        };
      }

      return {
        userId,
        isOnline: false,
        lastSeenAt: latestHeartbeat > 0 ? new Date(latestHeartbeat) : lastSeen,
      };
    } catch {
      // Redis unavailable: fallback to wsGateway
      return {
        userId,
        isOnline: isGatewayOnline,
        lastSeenAt: lastSeen,
      };
    }
  }

  private readonly inMemoryTyping = new Map<string, number>();

  /**
   * P3-T06: Sets typing indicator in Redis with 5s TTL (with in-memory fallback).
   */
  public async setTyping(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    const memKey = `${conversationId}:${userId}`;
    if (isTyping) {
      this.inMemoryTyping.set(memKey, Date.now() + 5000);
    } else {
      this.inMemoryTyping.delete(memKey);
    }

    try {
      const redis = getRedisClient();
      const key = `typing:conv:${conversationId}:user:${userId}`;
      if (isTyping) {
        await redis.set(key, 'active', 'EX', 5);
      } else {
        await redis.del(key);
      }
    } catch {
      // Redis unavailable: in-memory typing TTL handles it
    }
  }

  public async isUserTyping(conversationId: string, userId: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const key = `typing:conv:${conversationId}:user:${userId}`;
      const val = await redis.get(key);
      if (val === 'active') return true;
    } catch {
      // Redis unavailable: check in-memory TTL
    }

    const memKey = `${conversationId}:${userId}`;
    const expiresAt = this.inMemoryTyping.get(memKey);
    if (expiresAt) {
      if (Date.now() < expiresAt) {
        return true;
      }
      this.inMemoryTyping.delete(memKey);
    }

    return false;
  }


  /**
   * Checks if target has blocked requester.
   */
  public async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });
    return !!block;
  }

  public async getUser(userId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id: userId },
    });
  }

  public async updatePresencePrivacy(
    userId: string,
    visibility: 'EVERYONE' | 'CONTACTS' | 'NOBODY'
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        presencePrivacy: { visibility },
      },
    });
  }

  /**
   * Checks if two users share at least one active conversation (contacts check).
   */
  public async shareActiveConversation(userAId: string, userBId: string): Promise<boolean> {
    const shared = await prisma.conversationMember.count({
      where: {
        userId: userAId,
        removedAtSeqId: null,
        conversation: {
          members: {
            some: {
              userId: userBId,
              removedAtSeqId: null,
            },
          },
        },
      },
    });

    return shared > 0;
  }
}

export const presenceRepository = new PresenceRepository();
