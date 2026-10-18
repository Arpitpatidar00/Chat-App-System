import { receiptsRepository, type ReceiptsRepository } from './receipts.repository.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { ok, err, type Result } from '../../core/result/result.js';
import { NotFoundError, type DomainError } from '../../core/errors/domain-error.js';

export interface ReceiptDto {
  conversationId: string;
  messageId: string;
  userId: string;
  status: number;
  deliveredAt: string | null;
  readAt: string | null;
}

export class ReceiptsService {
  constructor(private readonly repo: ReceiptsRepository = receiptsRepository) {}

  /**
   * P3-T02: Processes RECEIPT_ACK from recipient device (status 2 = DELIVERED).
   * Monotonically records delivered status and notifies sender devices.
   */
  public async handleReceiptAck(
    userId: string,
    _deviceId: string,
    messageId: string
  ): Promise<Result<ReceiptDto, DomainError>> {
    const updated = await this.repo.markDelivered(messageId, userId);
    if (!updated) {
      return err(new NotFoundError(`Message ${messageId} not found`));
    }

    const dto: ReceiptDto = {
      conversationId: updated.conversationId,
      messageId: updated.messageId,
      userId: updated.userId,
      status: updated.status,
      deliveredAt: updated.deliveredAt?.toISOString() ?? null,
      readAt: updated.readAt?.toISOString() ?? null,
    };

    // Notify the message sender via WebSocket
    const message = await this.repo.getMessageById(messageId);
    if (message) {
      wsGateway.sendToUserAllDevices(message.senderId, {
        action: 'RECEIPT_EVENT',
        messageId,
        userId,
        status: updated.status,
        timestamp: updated.deliveredAt?.toISOString() ?? new Date().toISOString(),
      });
    }

    return ok(dto);
  }

  /**
   * P3-T02 & P3-T03: Processes READ_UP_TO from reader device (status 3 = READ).
   * Monotonically records read status up to maxSeqId and broadcasts SELF_READ_SYNC
   * to reader's other devices to instantly clear unread badges.
   */
  public async handleReadUpTo(
    userId: string,
    deviceId: string,
    conversationId: string,
    maxSeqId: string
  ): Promise<Result<{ affected: number }, DomainError>> {
    const seq = BigInt(maxSeqId);
    const affected = await this.repo.markReadUpTo(conversationId, userId, seq);

    // P3-T03: Fan out SELF_READ_SYNC to reader's OTHER enrolled devices
    wsGateway.sendToUserOtherDevices(userId, deviceId, {
      action: 'SELF_READ_SYNC',
      conversationId,
      maxSeqId,
    });

    return ok({ affected });
  }

  public async getReceiptsForMessage(
    messageId: string
  ): Promise<Result<ReceiptDto[], DomainError>> {
    const receipts = await this.repo.getReceiptsForMessage(messageId);
    return ok(
      receipts.map((r) => ({
        conversationId: r.conversationId,
        messageId: r.messageId,
        userId: r.userId,
        status: r.status,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        readAt: r.readAt?.toISOString() ?? null,
      }))
    );
  }
}

export const receiptsService = new ReceiptsService();
