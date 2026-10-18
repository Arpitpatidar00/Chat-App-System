import { authRepository, type AuthRepository } from './auth.repository.js';
import { ok, err, type Result } from '../../core/result/result.js';
import {
  NotFoundError,
  ForbiddenError,
  type DomainError,
} from '../../core/errors/domain-error.js';
import type {
  UserSessionPayload,
  DevicePlatform,
  EnrollDeviceRequestDTO,
  UserStatus,
} from '@chat/types';
import { prisma } from '@chat/database';
import { getRedisClient } from '../../core/redis/redis-client.js';
import { wsGateway } from '../../core/websocket/gateway.js';

export class AuthService {
  constructor(private readonly repo: AuthRepository = authRepository) {}

  public async getSession(
    userId: string,
    deviceId: string
  ): Promise<Result<UserSessionPayload, DomainError>> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      return err(new NotFoundError(`User with ID ${userId} not found`));
    }

    const device = await this.repo.findDeviceById(deviceId);
    const platform = (device?.platform ?? 'WEB') as DevicePlatform;

    return ok({
      userId: user.id,
      deviceId,
      username: user.username,
      status: user.status as any,
      platform,
    });
  }

  /**
   * Flow 1A: Eligibility Gate & Session Validation (FR-001, FR-002).
   */
  public async verifySession(
    userId: string,
    deviceId: string
  ): Promise<Result<UserSessionPayload, DomainError>> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      return err(new NotFoundError(`User with ID ${userId} not found`));
    }

    // P1-T02 Eligibility Gate: Only VERIFIED or APPROVED accounts can participate in chat
    if (user.status !== 'VERIFIED' && user.status !== 'APPROVED') {
      return err(
        new ForbiddenError(
          `Account status is '${user.status}'. Only VERIFIED or APPROVED users may access chat services.`
        )
      );
    }

    const device = await this.repo.findDeviceById(deviceId);
    const platform = (device?.platform ?? 'WEB') as DevicePlatform;

    return ok({
      userId: user.id,
      deviceId,
      username: user.username,
      status: user.status as UserStatus,
      platform,
    });
  }

  /**
   * Flow 1C: Account Suspension Kill-Switch (FR-005, DEC-11).
   */
  public async suspendUser(
    userId: string
  ): Promise<Result<{ status: string; terminatedSessions: number }, DomainError>> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      return err(new NotFoundError(`User with ID ${userId} not found`));
    }

    // 1. Update status to SUSPENDED in PostgreSQL
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    // 2. Set Redis revocation blocklist with 24h TTL
    try {
      const redis = getRedisClient();
      await redis.set(`blacklist:user:${userId}`, '1', 'EX', 86400);
    } catch {
      // Offline fallback
    }

    // 3. Immediately close all active WebSocket connections with code 4403
    const terminatedCount = wsGateway.closeUserConnections(
      userId,
      4403,
      'Forbidden: Account Suspended'
    );

    return ok({
      status: 'SUSPENDED',
      terminatedSessions: terminatedCount,
    });
  }
}

export const authService = new AuthService();
