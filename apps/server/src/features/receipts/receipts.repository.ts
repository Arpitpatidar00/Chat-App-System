import { prisma, type MessageReceipt } from '@chat/database';

export class ReceiptsRepository {
  public async upsertReceipt(params: {
    conversationId: string;
    messageId: string;
    userId: string;
    status: number;
  }): Promise<MessageReceipt> {
    const now = new Date();
    return prisma.messageReceipt.upsert({
      where: {
        messageId_userId: {
          messageId: params.messageId,
          userId: params.userId,
        },
      },
      create: {
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
        status: params.status,
        deliveredAt: params.status >= 2 ? now : null,
        readAt: params.status === 3 ? now : null,
      },
      update: {
        status: params.status,
        deliveredAt: params.status >= 2 ? now : undefined,
        readAt: params.status === 3 ? now : undefined,
      },
    });
  }

  public async getMessageReceipts(messageId: string): Promise<MessageReceipt[]> {
    return prisma.messageReceipt.findMany({
      where: { messageId },
    });
  }
}

export const receiptsRepository = new ReceiptsRepository();
