import {
  conversationsRepository,
  type ConversationsRepository,
} from './conversations.repository.js';
import { ok, err, type Result } from '../../core/result/result.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  GroupLimitExceededError,
  type DomainError,
} from '../../core/errors/domain-error.js';
import type {
  ConversationSummaryDTO,
  CreateGroupConversationDTO,
  UploadHistoryPackageDTO,
  GroupHistoryPackageDTO,
} from '@chat/types';
import { wsGateway } from '../../core/websocket/gateway.js';
import { prisma } from '@chat/database';

export class ConversationsService {
  constructor(private readonly repo: ConversationsRepository = conversationsRepository) {}

  public async listUserConversations(userId: string): Promise<Result<ConversationSummaryDTO[], DomainError>> {
    const list = await this.repo.getUserConversations(userId);

    const dtos: ConversationSummaryDTO[] = list.map((c) => ({
      id: c.id,
      type: c.type as any,
      title: c.title,
      lastSeqId: c.lastSeqId.toString(),
      memberCount: c.members.length,
      unreadCount: 0,
      lastActivityAt: c.createdAt.toISOString(),
      pinnedMessageId: null,
    }));

    return ok(dtos);
  }

  public async getConversation(
    conversationId: string,
    requestingUserId: string
  ): Promise<Result<ConversationSummaryDTO, DomainError>> {
    const conversation = await this.repo.findById(conversationId);
    if (!conversation) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }

    const isMember = conversation.members.some(
      (m) => m.userId === requestingUserId && m.removedAtSeqId === null
    );
    if (!isMember) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    return ok({
      id: conversation.id,
      type: conversation.type as any,
      title: conversation.title,
      lastSeqId: conversation.lastSeqId.toString(),
      memberCount: conversation.members.length,
      unreadCount: 0,
      lastActivityAt: conversation.createdAt.toISOString(),
      pinnedMessageId: null,
    });
  }

  /**
   * P1-T03: Direct Conversation Upsert with Anti-Duplication.
   */
  public async createDirectConversation(
    initiatorUserId: string,
    peerUserId: string
  ): Promise<Result<ConversationSummaryDTO, DomainError>> {
    if (initiatorUserId === peerUserId) {
      return err(new ValidationError('Cannot create a direct conversation with yourself'));
    }

    // Verify peer exists
    const peer = await prisma.user.findUnique({
      where: { id: peerUserId },
    });
    if (!peer) {
      return err(new NotFoundError(`User with ID ${peerUserId} not found`));
    }

    const conversation = await this.repo.getOrCreateDirectConversation(
      initiatorUserId,
      peerUserId
    );

    return ok({
      id: conversation.id,
      type: conversation.type as any,
      title: conversation.title,
      lastSeqId: conversation.lastSeqId.toString(),
      memberCount: conversation.members.length,
      unreadCount: 0,
      lastActivityAt: conversation.createdAt.toISOString(),
      pinnedMessageId: null,
    });
  }

  /**
   * P4-T01: Group Creation strictly capped at 100 members (FR-009, NFR-003).
   */
  public async createGroupConversation(
    creatorUserId: string,
    dto: CreateGroupConversationDTO
  ): Promise<Result<ConversationSummaryDTO, DomainError>> {
    const totalMembers = dto.memberIds.length + 1; // +1 for creator
    if (totalMembers > 100) {
      return err(
        new GroupLimitExceededError('Group member limit exceeded. Maximum 100 members allowed.')
      );
    }

    const conversation = await this.repo.createGroupConversation(
      creatorUserId,
      dto.title,
      dto.memberIds
    );

    return ok({
      id: conversation.id,
      type: 'GROUP',
      title: conversation.title,
      lastSeqId: conversation.lastSeqId.toString(),
      memberCount: conversation.members.length,
      unreadCount: 0,
      lastActivityAt: conversation.createdAt.toISOString(),
      pinnedMessageId: null,
    });
  }

  /**
   * P4-T02 & P4-T03: Add member with 100-member ceiling and 100-message pre-join slice (FR-013, NFR-036).
   */
  public async addGroupMember(
    actorUserId: string,
    conversationId: string,
    targetUserId: string
  ): Promise<Result<{ userId: string; role: string; historyFloorSeqId: string }, DomainError>> {
    const conv = await this.repo.findById(conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }
    if (conv.type !== 'GROUP') {
      return err(new ValidationError('Cannot add members to a non-group conversation'));
    }

    // Role check: Only OWNER or ADMIN can add members (P4-T02)
    const actorMember = conv.members.find(
      (m) => m.userId === actorUserId && m.removedAtSeqId === null
    );
    if (!actorMember || (actorMember.role !== 'OWNER' && actorMember.role !== 'ADMIN')) {
      return err(new ForbiddenError('Only group owners or admins can add members'));
    }

    // Capacity check: Max 100 active members (NFR-003)
    const activeCount = await this.repo.getActiveMemberCount(conversationId);
    if (activeCount >= 100) {
      return err(
        new GroupLimitExceededError('Group member limit exceeded. Maximum 100 members allowed.')
      );
    }


    // Bounded pre-join history calculation: GREATEST(1, lastSeqId - 100)
    const joinedAtSeqId = conv.lastSeqId;
    const historyFloorSeqId = conv.lastSeqId > 100n ? conv.lastSeqId - 100n : 1n;

    const member = await this.repo.addMember(
      conversationId,
      targetUserId,
      joinedAtSeqId,
      historyFloorSeqId
    );

    return ok({
      userId: member.userId,
      role: member.role,
      historyFloorSeqId: member.historyFloorSeqId.toString(),
    });
  }

  /**
   * P4-T02, P4-T05, P4-T06: Member removal with forward secrecy broadcast and automatic admin succession.
   */
  public async removeGroupMember(
    actorUserId: string,
    conversationId: string,
    targetUserId: string
  ): Promise<Result<{ removedUserId: string; newAdminPromoted: boolean }, DomainError>> {
    const conv = await this.repo.findById(conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }

    const actorMember = conv.members.find(
      (m) => m.userId === actorUserId && m.removedAtSeqId === null
    );
    const targetMember = conv.members.find(
      (m) => m.userId === targetUserId && m.removedAtSeqId === null
    );

    if (!targetMember) {
      return err(new NotFoundError(`User is not an active member of this conversation`));
    }

    // Permission check: Actor must be OWNER/ADMIN, OR self-departure
    const isSelfDeparture = actorUserId === targetUserId;
    if (!isSelfDeparture) {
      if (!actorMember || (actorMember.role !== 'OWNER' && actorMember.role !== 'ADMIN')) {
        return err(new ForbiddenError('Only group owners or admins can remove other members'));
      }
    }

    // Mark removed at current sequence
    await this.repo.removeMember(conversationId, targetUserId, conv.lastSeqId);

    // P4-T05: Broadcast MEMBER_REMOVED control frame over WebSocket to active peers
    for (const m of conv.members) {
      if (m.userId !== targetUserId && m.removedAtSeqId === null) {
        wsGateway.sendToUserAllDevices(m.userId, {
          action: 'MEMBER_REMOVED',
          conversationId,
          userId: targetUserId,
        });
      }
    }

    // P4-T06: Check admin succession policy if departing member was an admin/owner (FR-015)
    let newAdminPromoted = false;
    if (targetMember.role === 'OWNER' || targetMember.role === 'ADMIN') {
      const hasAdmins = await this.repo.hasActiveAdminOrOwner(conversationId);
      if (!hasAdmins) {
        const promoted = await this.repo.promoteLongestTenuredMember(conversationId);
        if (promoted) {
          newAdminPromoted = true;
        }
      }
    }

    return ok({
      removedUserId: targetUserId,
      newAdminPromoted,
    });
  }

  /**
   * P4-T04: Upload encrypted pre-join history package for new member.
   */
  public async uploadHistoryPackage(
    actorUserId: string,
    conversationId: string,
    dto: UploadHistoryPackageDTO
  ): Promise<Result<GroupHistoryPackageDTO, DomainError>> {
    const conv = await this.repo.findById(conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }

    const actor = conv.members.find((m) => m.userId === actorUserId && m.removedAtSeqId === null);
    if (!actor || (actor.role !== 'OWNER' && actor.role !== 'ADMIN')) {
      return err(new ForbiddenError('Only admins can upload group history packages'));
    }

    const pkg = await this.repo.saveHistoryPackage({
      conversationId,
      recipientUserId: dto.recipientUserId,
      fromSeqId: BigInt(dto.fromSeqId),
      toSeqId: BigInt(dto.toSeqId),
      encryptedHistoryKeyBundle: Buffer.from(dto.encryptedHistoryKeyBundle, 'base64'),
    });

    return ok({
      id: pkg.id,
      conversationId: pkg.conversationId,
      recipientUserId: pkg.recipientUserId,
      fromSeqId: pkg.fromSeqId.toString(),
      toSeqId: pkg.toSeqId.toString(),
      encryptedHistoryKeyBundle: Buffer.from(pkg.encryptedHistoryKeyBundle).toString('base64'),
      createdAt: pkg.createdAt.toISOString(),
    });
  }

  public async getHistoryPackage(
    recipientUserId: string,
    conversationId: string
  ): Promise<Result<GroupHistoryPackageDTO, DomainError>> {
    const pkg = await this.repo.getHistoryPackage(conversationId, recipientUserId);
    if (!pkg) {
      return err(new NotFoundError('No history package available for this user'));
    }

    return ok({
      id: pkg.id,
      conversationId: pkg.conversationId,
      recipientUserId: pkg.recipientUserId,
      fromSeqId: pkg.fromSeqId.toString(),
      toSeqId: pkg.toSeqId.toString(),
      encryptedHistoryKeyBundle: Buffer.from(pkg.encryptedHistoryKeyBundle).toString('base64'),
      createdAt: pkg.createdAt.toISOString(),
    });
  }

  /**
   * P5-T08: Conversation Mute Setting (FR-063).
   */
  public async muteConversation(
    userId: string,
    conversationId: string,
    mutedUntil: string | null
  ): Promise<Result<{ conversationId: string; mutedUntil: string | null }, DomainError>> {
    const conv = await this.repo.findById(conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }

    const member = conv.members.find((m) => m.userId === userId && m.removedAtSeqId === null);
    if (!member) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    const mutedDate = mutedUntil ? new Date(mutedUntil) : null;
    await this.repo.updateMuteStatus(conversationId, userId, mutedDate);

    // Fan-out CONV_MUTE_UPDATE to user's enrolled devices
    wsGateway.sendToUserAllDevices(userId, {
      action: 'CONV_MUTE_UPDATE',
      conversationId,
      mutedUntil,
    });

    return ok({ conversationId, mutedUntil });
  }
}

export const conversationsService = new ConversationsService();

