import { prisma, type MessageReceipt, type Message } from '@chat/database';

export interface MonotonicReceiptResult {
  conversationId: string;
  messageId: string;
  userId: string;
  status: number;
  deliveredAt: Date | null;
  readAt: Date | null;
}

export class ReceiptsRepository {
  /**
   * Monotonically records DELIVERED status (2) for a message.
   * If status is already 3 (READ), GREATEST ensures it stays 3.
   */
  public async markDelivered(
    messageId: string,
    userId: string
  ): Promise<MonotonicReceiptResult | null> {
    const rows = await prisma.$queryRaw<MonotonicReceiptResult[]>`
      INSERT INTO message_receipts (conversation_id, message_id, user_id, status, delivered_at)
      SELECT conversation_id, id, ${userId}::uuid, 2, NOW()
      FROM messages
      WHERE id = ${messageId}::uuid
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET
        status = GREATEST(message_receipts.status, 2),
        delivered_at = COALESCE(message_receipts.delivered_at, NOW())
      RETURNING
        conversation_id AS "conversationId",
        message_id AS "messageId",
        user_id AS "userId",
        status,
        delivered_at AS "deliveredAt",
        read_at AS "readAt"
    `;

    return rows[0] ?? null;
  }

  /**
   * Monotonically marks all messages in a conversation up to maxSeqId as READ (3).
   * GREATEST ensures status never regresses.
   */
  public async markReadUpTo(
    conversationId: string,
    userId: string,
    maxSeqId: bigint
  ): Promise<number> {
    const affected = await prisma.$executeRaw`
      INSERT INTO message_receipts (conversation_id, message_id, user_id, status, read_at)
      SELECT conversation_id, id, ${userId}::uuid, 3, NOW()
      FROM messages
      WHERE conversation_id = ${conversationId}::uuid
        AND seq_id <= ${maxSeqId}
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET
        status = GREATEST(message_receipts.status, 3),
        read_at = COALESCE(message_receipts.read_at, NOW())
    `;

    return affected;
  }

  public async getReceipt(messageId: string, userId: string): Promise<MessageReceipt | null> {
    return prisma.messageReceipt.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });
  }

  public async getMessageById(messageId: string): Promise<Message | null> {
    return prisma.message.findUnique({
      where: { id: messageId },
    });
  }

  public async getReceiptsForMessage(messageId: string): Promise<MessageReceipt[]> {
    return prisma.messageReceipt.findMany({
      where: { messageId },
      include: { user: true },
    });
  }
}

export const receiptsRepository = new ReceiptsRepository();
