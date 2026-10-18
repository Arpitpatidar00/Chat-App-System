import { blocksRepository, type BlocksRepository } from './blocks.repository.js';
import { prisma } from '@chat/database';
import { ok, err, type Result } from '../../core/result/result.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  type DomainError,
} from '../../core/errors/domain-error.js';
import type { UserBlockDTO } from '@chat/types';

export class BlocksService {
  constructor(private readonly repo: BlocksRepository = blocksRepository) {}

  public async blockUser(
    blockerId: string,
    blockedUserId: string
  ): Promise<Result<UserBlockDTO, DomainError>> {
    if (blockerId === blockedUserId) {
      return err(new ValidationError('Cannot block yourself'));
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
    });
    if (!targetUser) {
      return err(new NotFoundError(`User ${blockedUserId} not found`));
    }

    const block = await this.repo.blockUser(blockerId, blockedUserId);

    return ok({
      blockerId: block.blockerId,
      blockedId: block.blockedId,
      createdAt: block.createdAt.toISOString(),
    });
  }

  public async unblockUser(
    blockerId: string,
    blockedUserId: string
  ): Promise<Result<{ unblocked: boolean }, DomainError>> {
    const success = await this.repo.unblockUser(blockerId, blockedUserId);
    return ok({ unblocked: success });
  }

  public async isBidirectionallyBlocked(userAId: string, userBId: string): Promise<boolean> {
    return this.repo.isBidirectionallyBlocked(userAId, userBId);
  }

  public async listBlockedUsers(userId: string): Promise<Result<string[], DomainError>> {
    const blockedIds = await this.repo.getBlockedUserIds(userId);
    return ok(blockedIds);
  }
}

export const blocksService = new BlocksService();
