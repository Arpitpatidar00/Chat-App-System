import {
  conversationsRepository,
  type ConversationsRepository,
} from './conversations.repository.js';
import { ok, err, type Result } from '../../core/result/result.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  type DomainError,
} from '../../core/errors/domain-error.js';
import type { ConversationSummaryDTO } from '@chat/types';
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
}

export const conversationsService = new ConversationsService();
