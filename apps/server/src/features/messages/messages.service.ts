import { messagesRepository, type MessagesRepository } from './messages.repository.js';
import { conversationsRepository } from '../conversations/conversations.repository.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { ok, err, type Result } from '../../core/result/result.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  EditWindowExpiredError,
  DeleteWindowExpiredError,
  type DomainError,
} from '../../core/errors/domain-error.js';
import type {
  SendMessageRequestDTO,
  MessageAckDTO,
  MessageDTO,
  EncryptedPayloads,
  EditMessageRequestDTO,
  ReactionRequestDTO,
  PinRequestDTO,
  MessageEventDTO,
  SyncEventsResponseDTO,
} from '@chat/types';
import { randomUUID } from 'node:crypto';
import { pushNotificationService } from '../notifications/push-notification.service.js';
import { blocksService } from '../privacy/blocks.service.js';

export class MessagesService {
  constructor(
    private readonly repo: MessagesRepository = messagesRepository,
    private readonly convRepo = conversationsRepository
  ) {}

  public async sendMessage(
    senderId: string,
    senderDeviceId: string,
    dto: SendMessageRequestDTO
  ): Promise<Result<MessageAckDTO, DomainError>> {
    // 1. Verify membership
    const conv = await this.convRepo.findById(dto.conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${dto.conversationId} not found`));
    }

    const isMember = conv.members.some((m) => m.userId === senderId && m.removedAtSeqId === null);
    if (!isMember) {
      return err(new ForbiddenError('You cannot send messages to this conversation'));
    }

    // P8-T01: Bidirectional block enforcement in direct chats (FR-068, FR-069)
    if (conv.type === 'DIRECT') {
      const peer = conv.members.find((m) => m.userId !== senderId);
      if (peer) {
        const isBlocked = await blocksService.isBidirectionallyBlocked(senderId, peer.userId);
        if (isBlocked) {
          return err(new ForbiddenError('USER_BLOCKED: Message cannot be delivered to blocked user'));
        }
      }
    }

    // 2. Idempotency check: senderDeviceId + clientMsgId
    const existing = await this.repo.findByClientMsgId(senderDeviceId, dto.clientMsgId);
    if (existing) {
      return ok({
        action: 'MSG_ACK',
        clientMsgId: existing.clientMsgId,
        messageId: existing.id,
        seqId: existing.seqId.toString(),
        createdAt: existing.createdAt.toISOString(),
        status: 'SENT',
      });
    }

    // 3. Atomically persist message and allocate seqId
    const messageId = randomUUID();
    const message = await this.repo.persistMessage({
      id: messageId,
      clientMsgId: dto.clientMsgId,
      conversationId: dto.conversationId,
      senderId,
      senderDeviceId,
      msgType: dto.msgType,
      encryptedPayloads: dto.encryptedPayloads,
    });

    const messageDto: MessageDTO = {
      id: message.id,
      conversationId: message.conversationId,
      seqId: message.seqId.toString(),
      senderId: message.senderId,
      senderDeviceId: message.senderDeviceId,
      clientMsgId: message.clientMsgId,
      msgType: message.msgType as any,
      encryptedPayloads: message.encryptedPayloads as unknown as EncryptedPayloads,
      createdAt: message.createdAt.toISOString(),
      isTombstoned: message.isTombstoned,
    };

    // 4. Realtime broadcast to active conversation members via WebSocket Gateway
    for (const member of conv.members) {
      if (member.removedAtSeqId === null) {
        wsGateway.sendToUserAllDevices(member.userId, {
          action: 'MSG_EVENT',
          message: messageDto,
        });
      }
    }

    // 5. Asynchronously dispatch zero-plaintext push notification wakeups (FR-061 to FR-067)
    pushNotificationService
      .notifyConversationMembers(conv.id, message, senderId)
      .catch(() => {});

    return ok({
      action: 'MSG_ACK',
      clientMsgId: message.clientMsgId,
      messageId: message.id,
      seqId: message.seqId.toString(),
      createdAt: message.createdAt.toISOString(),
      status: 'SENT',
    });
  }

  /**
   * P2-T07 & P5-T03: Reconnect Retrieval & Offline Retention.
   * Returns messages strictly ordered by seq_id ASC, excluding user's hidden messages.
   */
  public async syncMessages(
    conversationId: string,
    userId: string,
    lastKnownSeqId: bigint,
    limit = 50
  ): Promise<Result<MessageDTO[], DomainError>> {
    const conv = await this.convRepo.findById(conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }

    const member = conv.members.find((m) => m.userId === userId && m.removedAtSeqId === null);
    if (!member) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    // P4-T03 & P5-T03: Bounded Pre-Join History, Forward Secrecy & Delete-for-Self exclusion
    const messages = await this.repo.getMessagesBounded(
      conversationId,
      lastKnownSeqId,
      member.historyFloorSeqId,
      member.removedAtSeqId,
      limit,
      userId
    );

    const dtos: MessageDTO[] = messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      seqId: m.seqId.toString(),
      senderId: m.senderId,
      senderDeviceId: m.senderDeviceId,
      clientMsgId: m.clientMsgId,
      msgType: m.msgType as any,
      encryptedPayloads: m.encryptedPayloads as unknown as EncryptedPayloads,
      createdAt: m.createdAt.toISOString(),
      isTombstoned: m.isTombstoned,
    }));

    return ok(dtos);
  }

  /**
   * P7-T01: Paged History Endpoint (FR-053 to FR-055, NFR-009).
   * Validates membership and history floor/ceiling, returning messages ordered by seq_id DESC.
   */
  public async getPagedHistory(
    conversationId: string,
    userId: string,
    beforeSeqId: bigint | null,
    limit = 50
  ): Promise<Result<{ messages: MessageDTO[]; hasMore: boolean; nextCursor: string | null }, DomainError>> {
    const conv = await this.convRepo.findById(conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }

    const member = conv.members.find((m) => m.userId === userId);
    if (!member) {
      return err(new ForbiddenError('You are not a member of this conversation'));
    }

    const fetchLimit = limit + 1;
    const messages = await this.repo.getPagedHistory(
      conversationId,
      beforeSeqId,
      member.historyFloorSeqId,
      member.removedAtSeqId,
      fetchLimit,
      userId
    );

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor =
      resultMessages.length > 0 && hasMore
        ? resultMessages[resultMessages.length - 1]!.seqId.toString()
        : null;

    const dtos: MessageDTO[] = resultMessages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      seqId: m.seqId.toString(),
      senderId: m.senderId,
      senderDeviceId: m.senderDeviceId,
      clientMsgId: m.clientMsgId,
      msgType: m.msgType as any,
      encryptedPayloads: m.encryptedPayloads as unknown as EncryptedPayloads,
      createdAt: m.createdAt.toISOString(),
      isTombstoned: m.isTombstoned,
    }));

    return ok({
      messages: dtos,
      hasMore,
      nextCursor,
    });
  }

  /**
   * P5-T04: Delete-for-Everyone (Tombstone) (FR-027, NFR-035, NFR-038).
   * Sender (within 48h) or Group Admin/Owner (any time).
   */
  public async deleteForEveryone(
    actorId: string,
    actorDeviceId: string,
    messageId: string
  ): Promise<Result<{ success: boolean; messageId: string }, DomainError>> {
    const message = await this.repo.findById(messageId);
    if (!message) {
      return err(new NotFoundError(`Message ${messageId} not found`));
    }

    const conv = await this.convRepo.findById(message.conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${message.conversationId} not found`));
    }

    const member = conv.members.find((m) => m.userId === actorId && m.removedAtSeqId === null);
    if (!member) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    const isSender = message.senderId === actorId;
    const isOwnerOrAdmin = member.role === 'OWNER' || member.role === 'ADMIN';

    if (!isSender && !isOwnerOrAdmin) {
      return err(
        new ForbiddenError('Only the message author or a conversation admin can delete for everyone')
      );
    }

    // Sender 48-hour window enforcement (DEC-04)
    if (isSender && !isOwnerOrAdmin) {
      const ageMs = Date.now() - new Date(message.createdAt).getTime();
      const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
      if (ageMs > FORTY_EIGHT_HOURS_MS) {
        return err(
          new DeleteWindowExpiredError('Delete-for-everyone window expired (48 hours)')
        );
      }
    }

    if (!message.isTombstoned) {
      await this.repo.tombstoneMessage(message, actorId, actorDeviceId);

      // Realtime broadcast to all active conversation members
      for (const m of conv.members) {
        if (m.removedAtSeqId === null) {
          wsGateway.sendToUserAllDevices(m.userId, {
            action: 'MSG_TOMBSTONED',
            messageId: message.id,
            conversationId: message.conversationId,
          });
        }
      }
    }

    return ok({ success: true, messageId: message.id });
  }

  /**
   * P5-T03: Delete-for-Self (FR-027, FR-031).
   */
  public async deleteForSelf(
    actorId: string,
    messageId: string
  ): Promise<Result<{ success: boolean; messageId: string }, DomainError>> {
    const message = await this.repo.findById(messageId);
    if (!message) {
      return err(new NotFoundError(`Message ${messageId} not found`));
    }

    const conv = await this.convRepo.findById(message.conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${message.conversationId} not found`));
    }

    const isMember = conv.members.some((m) => m.userId === actorId && m.removedAtSeqId === null);
    if (!isMember) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    await this.repo.hideMessageForUser(actorId, messageId);

    // Fan-out MSG_HIDDEN_SELF strictly to all enrolled devices of the deleting user
    wsGateway.sendToUserAllDevices(actorId, {
      action: 'MSG_HIDDEN_SELF',
      messageId: message.id,
      conversationId: message.conversationId,
    });

    return ok({ success: true, messageId: message.id });
  }

  /**
   * P5-T02: Message Edit Endpoint (FR-026, DEC-12).
   * Sender only, 48-hour window guard, must not be tombstoned.
   */
  public async editMessage(
    actorId: string,
    actorDeviceId: string,
    messageId: string,
    dto: EditMessageRequestDTO
  ): Promise<Result<{ success: boolean; messageId: string; isEdited: boolean }, DomainError>> {
    const message = await this.repo.findById(messageId);
    if (!message) {
      return err(new NotFoundError(`Message ${messageId} not found`));
    }

    if (message.senderId !== actorId) {
      return err(new ForbiddenError('Only the original sender can edit this message'));
    }

    if (message.isTombstoned) {
      return err(new ValidationError('Cannot edit a deleted message'));
    }

    const ageMs = Date.now() - new Date(message.createdAt).getTime();
    const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
    if (ageMs > FORTY_EIGHT_HOURS_MS) {
      return err(new EditWindowExpiredError('Message edit window expired (48 hours)'));
    }

    const conv = await this.convRepo.findById(message.conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${message.conversationId} not found`));
    }

    await this.repo.editMessage(message, dto.encryptedPayloads, actorId, actorDeviceId);

    // Broadcast MSG_EDITED to all active members
    for (const m of conv.members) {
      if (m.removedAtSeqId === null) {
        wsGateway.sendToUserAllDevices(m.userId, {
          action: 'MSG_EDITED',
          messageId: message.id,
          conversationId: message.conversationId,
          encryptedPayloads: dto.encryptedPayloads,
        });
      }
    }

    return ok({ success: true, messageId: message.id, isEdited: true });
  }

  /**
   * P5-T05: Reactions Aggregator (FR-028).
   */
  public async reactToMessage(
    actorId: string,
    actorDeviceId: string,
    messageId: string,
    dto: ReactionRequestDTO
  ): Promise<Result<{ success: boolean; messageId: string; emoji: string; action: string }, DomainError>> {
    const message = await this.repo.findById(messageId);
    if (!message) {
      return err(new NotFoundError(`Message ${messageId} not found`));
    }

    const conv = await this.convRepo.findById(message.conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${message.conversationId} not found`));
    }

    const isMember = conv.members.some((m) => m.userId === actorId && m.removedAtSeqId === null);
    if (!isMember) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    await this.repo.recordReaction(
      message.conversationId,
      message.id,
      actorId,
      actorDeviceId,
      dto.emoji,
      dto.action
    );

    // Broadcast MSG_REACTION to active members
    for (const m of conv.members) {
      if (m.removedAtSeqId === null) {
        wsGateway.sendToUserAllDevices(m.userId, {
          action: 'MSG_REACTION',
          messageId: message.id,
          conversationId: message.conversationId,
          userId: actorId,
          emoji: dto.emoji,
          reactionAction: dto.action,
        });
      }
    }

    return ok({
      success: true,
      messageId: message.id,
      emoji: dto.emoji,
      action: dto.action,
    });
  }

  /**
   * P5-T07: Conversation Pinning Handlers (FR-030).
   */
  public async pinMessage(
    actorId: string,
    actorDeviceId: string,
    conversationId: string,
    dto: PinRequestDTO
  ): Promise<Result<{ success: boolean; conversationId: string; messageId: string; action: string }, DomainError>> {
    const conv = await this.convRepo.findById(conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }

    const isMember = conv.members.some((m) => m.userId === actorId && m.removedAtSeqId === null);
    if (!isMember) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    const message = await this.repo.findById(dto.messageId);
    if (!message || message.conversationId !== conversationId) {
      return err(new NotFoundError(`Message ${dto.messageId} does not exist in this conversation`));
    }

    await this.repo.recordPin(
      conversationId,
      dto.messageId,
      actorId,
      actorDeviceId,
      dto.action
    );

    // Broadcast CONV_PIN_UPDATE
    for (const m of conv.members) {
      if (m.removedAtSeqId === null) {
        wsGateway.sendToUserAllDevices(m.userId, {
          action: 'CONV_PIN_UPDATE',
          conversationId,
          messageId: dto.messageId,
          pinAction: dto.action,
          actorId,
        });
      }
    }

    return ok({
      success: true,
      conversationId,
      messageId: dto.messageId,
      action: dto.action,
    });
  }

  /**
   * P5-T09: Event Delta Synchronization Endpoint (FR-056).
   */
  public async syncEvents(
    conversationId: string,
    userId: string,
    afterEventId: bigint,
    limit = 100
  ): Promise<Result<SyncEventsResponseDTO, DomainError>> {
    const conv = await this.convRepo.findById(conversationId);
    if (!conv) {
      return err(new NotFoundError(`Conversation ${conversationId} not found`));
    }

    const isMember = conv.members.some((m) => m.userId === userId && m.removedAtSeqId === null);
    if (!isMember) {
      return err(new ForbiddenError('You are not an active member of this conversation'));
    }

    const events = await this.repo.getEventsAfter(conversationId, afterEventId, limit);

    const dtos: MessageEventDTO[] = events.map((e) => ({
      eventId: e.eventId.toString(),
      conversationId: e.conversationId,
      targetMessageId: e.targetMessageId,
      actorId: e.actorId,
      actorDeviceId: e.actorDeviceId,
      eventType: e.eventType as any,
      encryptedPatch: e.encryptedPatch ? Buffer.from(e.encryptedPatch).toString('utf-8') : null,
      createdAt: e.createdAt.toISOString(),
    }));

    return ok({ events: dtos });
  }
}

export const messagesService = new MessagesService();
