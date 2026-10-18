import { prisma, type Message, type MessageType } from '@chat/database';
import { uow, type TransactionClient } from '../../core/database/unit-of-work.js';
import type { EncryptedPayloads } from '@chat/types';

export interface CreateMessageParams {
  id: string;
  clientMsgId: string;
  conversationId: string;
  senderId: string;
  senderDeviceId: string;
  msgType: MessageType;
  encryptedPayloads: EncryptedPayloads;
}

export class MessagesRepository {
  public async findById(id: string): Promise<Message | null> {
    return prisma.message.findUnique({
      where: { id },
    });
  }

  public async findByClientMsgId(
    senderDeviceId: string,
    clientMsgId: string
  ): Promise<Message | null> {
    return prisma.message.findUnique({
      where: {
        senderDeviceId_clientMsgId: {
          senderDeviceId,
          clientMsgId,
        },
      },
    });
  }

  public async persistMessage(params: CreateMessageParams): Promise<Message> {
    try {
      return await uow.runInTransaction(async (tx: TransactionClient) => {
        // 1. Atomically increment conversation last_seq_id
        const updatedConv = await tx.conversation.update({
          where: { id: params.conversationId },
          data: {
            lastSeqId: { increment: 1 },
          },
          select: { lastSeqId: true },
        });

        const seqId = updatedConv.lastSeqId;

        // 2. Commit message with allocated monotonic sequence ID
        const message = await tx.message.create({
          data: {
            id: params.id,
            clientMsgId: params.clientMsgId,
            conversationId: params.conversationId,
            senderId: params.senderId,
            senderDeviceId: params.senderDeviceId,
            seqId,
            msgType: params.msgType,
            encryptedPayloads: params.encryptedPayloads as any,
            isTombstoned: false,
          },
        });

        return message;
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        const existing = await this.findByClientMsgId(params.senderDeviceId, params.clientMsgId);
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  public async getMessagesAfterSeq(
    conversationId: string,
    afterSeqId: bigint,
    limit = 50
  ): Promise<Message[]> {
    return prisma.message.findMany({
      where: {
        conversationId,
        seqId: { gt: afterSeqId },
      },
      take: limit,
      orderBy: {
        seqId: 'asc',
      },
    });
  }

  /**
   * P4-T03 & P5-T03: Bounded Pre-Join History & Forward Secrecy Retrieval, excluding delete-for-self messages.
   */
  public async getMessagesBounded(
    conversationId: string,
    afterSeqId: bigint,
    floorSeqId: bigint,
    ceilingSeqId: bigint | null,
    limit = 50,
    userId?: string
  ): Promise<Message[]> {
    const effectiveFloor = afterSeqId >= floorSeqId ? afterSeqId : floorSeqId - 1n;
    return prisma.message.findMany({
      where: {
        conversationId,
        seqId: {
          gt: effectiveFloor,
          ...(ceilingSeqId !== null ? { lte: ceilingSeqId } : {}),
        },
        ...(userId
          ? {
              hiddenByUsers: {
                none: {
                  userId,
                },
              },
            }
          : {}),
      },
      take: limit,
      orderBy: {
        seqId: 'asc',
      },
    });
  }

  /**
   * P7-T01 & Flow 7A: Bounded Paged History Retrieval (FR-053 to FR-055, NFR-009).
   * Returns historical messages ordered by seq_id DESC for backward pagination
   * within member history boundaries (floorSeqId <= seqId < beforeSeqId)
   * excluding delete-for-self messages.
   */
  public async getPagedHistory(
    conversationId: string,
    beforeSeqId: bigint | null,
    floorSeqId: bigint,
    ceilingSeqId: bigint | null,
    limit = 50,
    userId?: string
  ): Promise<Message[]> {
    return prisma.message.findMany({
      where: {
        conversationId,
        seqId: {
          gte: floorSeqId,
          ...(beforeSeqId !== null ? { lt: beforeSeqId } : {}),
          ...(ceilingSeqId !== null ? { lte: ceilingSeqId } : {}),
        },
        ...(userId
          ? {
              hiddenByUsers: {
                none: {
                  userId,
                },
              },
            }
          : {}),
      },
      take: limit,
      orderBy: {
        seqId: 'desc',
      },
    });
  }

  /**
   * P5-T04: Atomically clear payloads, mark isTombstoned=true, and append DELETE_EVERYONE event.
   */
  public async tombstoneMessage(
    message: Message,
    actorId: string,
    actorDeviceId: string
  ): Promise<Message> {
    return uow.runInTransaction(async (tx: TransactionClient) => {
      const updated = await tx.message.update({
        where: { id: message.id },
        data: {
          encryptedPayloads: {},
          isTombstoned: true,
        },
      });

      await tx.messageEvent.create({
        data: {
          conversationId: message.conversationId,
          targetMessageId: message.id,
          actorId,
          actorDeviceId,
          eventType: 'DELETE_EVERYONE',
        },
      });

      // P8-T07 & NFR-040: Persistent deletion registry for backup resurrection prevention
      await tx.deletedEntityRegistry.upsert({
        where: {
          entityType_entityId: {
            entityType: 'MESSAGE',
            entityId: message.id,
          },
        },
        create: {
          entityType: 'MESSAGE',
          entityId: message.id,
        },
        update: {},
      });

      return updated;
    });
  }

  /**
   * P5-T03: Record Delete-for-Self in user_hidden_messages.
   */
  public async hideMessageForUser(userId: string, messageId: string): Promise<void> {
    await prisma.userHiddenMessage.upsert({
      where: {
        userId_messageId: {
          userId,
          messageId,
        },
      },
      create: {
        userId,
        messageId,
      },
      update: {},
    });
  }

  /**
   * P5-T02: Message Edit - update payloads and record EDIT event.
   */
  public async editMessage(
    message: Message,
    encryptedPayloads: EncryptedPayloads,
    actorId: string,
    actorDeviceId: string
  ): Promise<Message> {
    return uow.runInTransaction(async (tx: TransactionClient) => {
      const updated = await tx.message.update({
        where: { id: message.id },
        data: {
          encryptedPayloads: encryptedPayloads as any,
        },
      });

      await tx.messageEvent.create({
        data: {
          conversationId: message.conversationId,
          targetMessageId: message.id,
          actorId,
          actorDeviceId,
          eventType: 'EDIT',
          encryptedPatch: Buffer.from(JSON.stringify(encryptedPayloads)),
        },
      });

      return updated;
    });
  }

  /**
   * P5-T05: Reactions - record REACTION_ADD or REACTION_REMOVE event.
   */
  public async recordReaction(
    conversationId: string,
    targetMessageId: string,
    actorId: string,
    actorDeviceId: string,
    emoji: string,
    action: 'ADD' | 'REMOVE'
  ) {
    return prisma.messageEvent.create({
      data: {
        conversationId,
        targetMessageId,
        actorId,
        actorDeviceId,
        eventType: action === 'ADD' ? 'REACTION_ADD' : 'REACTION_REMOVE',
        encryptedPatch: Buffer.from(emoji, 'utf-8'),
      },
    });
  }

  /**
   * P5-T07: Conversation Pinning - record PIN or UNPIN event.
   */
  public async recordPin(
    conversationId: string,
    targetMessageId: string,
    actorId: string,
    actorDeviceId: string,
    action: 'PIN' | 'UNPIN'
  ) {
    return prisma.messageEvent.create({
      data: {
        conversationId,
        targetMessageId,
        actorId,
        actorDeviceId,
        eventType: action === 'PIN' ? 'PIN' : 'UNPIN',
      },
    });
  }

  /**
   * P5-T09: Event Delta Synchronization - fetch message_events after a given event_id.
   */
  public async getEventsAfter(
    conversationId: string,
    afterEventId: bigint,
    limit = 100
  ) {
    return prisma.messageEvent.findMany({
      where: {
        conversationId,
        eventId: { gt: afterEventId },
      },
      take: limit,
      orderBy: {
        eventId: 'asc',
      },
    });
  }
}

export const messagesRepository = new MessagesRepository();

