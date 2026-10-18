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
}

export const messagesRepository = new MessagesRepository();
