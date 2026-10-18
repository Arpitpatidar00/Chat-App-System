import { presenceRepository, type PresenceRepository } from './presence.repository.js';
import { conversationsRepository } from '../conversations/conversations.repository.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { ok, err, type Result } from '../../core/result/result.js';
import { NotFoundError, type DomainError } from '../../core/errors/domain-error.js';
import type { UserPresenceDTO } from '@chat/types';

export class PresenceService {
  constructor(
    private readonly repo: PresenceRepository = presenceRepository,
    private readonly convRepo = conversationsRepository
  ) {}

  /**
   * P3-T04 & P3-T05: Retrieves presence of target user with privacy filter.
   */
  public async getPresence(
    requesterId: string,
    targetUserId: string
  ): Promise<Result<UserPresenceDTO, DomainError>> {
    const targetUser = await this.repo.getUser(targetUserId);
    if (!targetUser) {
      return err(new NotFoundError(`User ${targetUserId} not found`));
    }

    // Requester viewing their own presence
    if (requesterId === targetUserId) {
      const realPresence = await this.repo.getUserPresence(targetUserId);
      return ok({
        userId: targetUserId,
        isOnline: realPresence.isOnline,
        lastSeenAt: realPresence.lastSeenAt?.toISOString() ?? null,
      });
    }

    // 1. Check if target has blocked the requester (NFR-030)
    const isBlocked = await this.repo.isBlocked(targetUserId, requesterId);
    if (isBlocked) {
      return ok({
        userId: targetUserId,
        isOnline: false,
        lastSeenAt: null,
      });
    }

    // 2. Check target's visibility setting
    const privacy = targetUser.presencePrivacy as { visibility?: string } | null;
    const visibility = privacy?.visibility ?? 'EVERYONE';

    if (visibility === 'NOBODY') {
      return ok({
        userId: targetUserId,
        isOnline: false,
        lastSeenAt: null,
      });
    }

    if (visibility === 'CONTACTS') {
      const shareConv = await this.repo.shareActiveConversation(requesterId, targetUserId);
      if (!shareConv) {
        return ok({
          userId: targetUserId,
          isOnline: false,
          lastSeenAt: null,
        });
      }
    }

    // 3. User is eligible to see real presence
    const realPresence = await this.repo.getUserPresence(targetUserId);
    return ok({
      userId: targetUserId,
      isOnline: realPresence.isOnline,
      lastSeenAt: realPresence.lastSeenAt?.toISOString() ?? null,
    });
  }

  public async updatePrivacy(
    userId: string,
    visibility: 'EVERYONE' | 'CONTACTS' | 'NOBODY'
  ): Promise<Result<{ visibility: string }, DomainError>> {
    await this.repo.updatePresencePrivacy(userId, visibility);
    return ok({ visibility });
  }

  public async recordHeartbeat(userId: string, deviceId: string): Promise<void> {
    await this.repo.setDeviceHeartbeat(userId, deviceId);
  }

  /**
   * P3-T06: Handles TYPING_START and TYPING_STOP frames.
   * Auto-expires in 5s and broadcasts USER_TYPING to peers.
   */
  public async handleTyping(
    userId: string,
    _deviceId: string,
    conversationId: string,
    isTyping: boolean
  ): Promise<void> {
    await this.repo.setTyping(conversationId, userId, isTyping);

    // Broadcast to conversation peers
    const conv = await this.convRepo.findById(conversationId);
    if (!conv) return;

    for (const member of conv.members) {
      if (member.userId !== userId && member.removedAtSeqId === null) {
        wsGateway.sendToUserAllDevices(member.userId, {
          action: 'USER_TYPING',
          conversationId,
          userId,
        });
      }
    }
  }

  public async isUserTyping(conversationId: string, userId: string): Promise<boolean> {
    return this.repo.isUserTyping(conversationId, userId);
  }
}

export const presenceService = new PresenceService();
