import { authRepository, type AuthRepository } from './auth.repository.js';
import { ok, err, type Result } from '../../core/result/result.js';
import { NotFoundError, type DomainError } from '../../core/errors/domain-error.js';
import type { UserSessionPayload, DevicePlatform } from '@chat/types';

export class AuthService {
  constructor(private readonly repo: AuthRepository = authRepository) {}

  public async getSession(userId: string, deviceId: string): Promise<Result<UserSessionPayload, DomainError>> {
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
}

export const authService = new AuthService();
