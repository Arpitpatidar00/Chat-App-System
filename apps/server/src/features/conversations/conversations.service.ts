import {
  conversationsRepository,
  type ConversationsRepository,
} from './conversations.repository.js';
import { ok, err, type Result } from '../../core/result/result.js';
import { NotFoundError, ForbiddenError, type DomainError } from '../../core/errors/domain-error.js';
import type { ConversationSummaryDTO } from '@chat/types';

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
}

export const conversationsService = new ConversationsService();
