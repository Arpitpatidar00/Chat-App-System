import { messagesRepository, type MessagesRepository } from './messages.repository.js';
import { conversationsRepository } from '../conversations/conversations.repository.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { ok, err, type Result } from '../../core/result/result.js';
import { NotFoundError, ForbiddenError, type DomainError } from '../../core/errors/domain-error.js';
import type { SendMessageRequestDTO, MessageAckDTO, MessageDTO, EncryptedPayloads } from '@chat/types';
import { randomUUID } from 'node:crypto';

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

    return ok({
      action: 'MSG_ACK',
      clientMsgId: message.clientMsgId,
      messageId: message.id,
      seqId: message.seqId.toString(),
      createdAt: message.createdAt.toISOString(),
      status: 'SENT',
    });
  }
}

export const messagesService = new MessagesService();
