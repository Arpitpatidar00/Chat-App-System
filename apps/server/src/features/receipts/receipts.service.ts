import { receiptsRepository, type ReceiptsRepository } from './receipts.repository.js';
import { messagesRepository } from '../messages/messages.repository.js';
import { wsGateway } from '../../core/websocket/gateway.js';
import { ok, err, type Result } from '../../core/result/result.js';
import { NotFoundError, type DomainError } from '../../core/errors/domain-error.js';
import { RECEIPT_STATUS, type ReceiptAckDTO } from '@chat/types';

export class ReceiptsService {
  constructor(
    private readonly repo: ReceiptsRepository = receiptsRepository,
    private readonly msgRepo = messagesRepository
  ) {}

  public async updateReceipt(
    userId: string,
    dto: ReceiptAckDTO
  ): Promise<Result<{ status: number }, DomainError>> {
    const message = await this.msgRepo.findById(dto.messageId);
    if (!message) {
      return err(new NotFoundError(`Message ${dto.messageId} not found`));
    }

    // Check existing receipts for this user to enforce monotonicity (DEC-09)
    const existing = await this.repo.getMessageReceipts(dto.messageId);
    const userReceipt = existing.find((r) => r.userId === userId);

    if (userReceipt) {
      // Monotonic guard: late delivery acks never downgrade a READ receipt (3)
      if (dto.status <= userReceipt.status) {
        return ok({ status: userReceipt.status });
      }
    }

    await this.repo.upsertReceipt({
      conversationId: message.conversationId,
      messageId: dto.messageId,
      userId,
      status: dto.status,
    });

    // Notify message sender via WebSocket
    wsGateway.sendToUserAllDevices(message.senderId, {
      action: 'RECEIPT_EVENT',
      messageId: dto.messageId,
      userId,
      status: dto.status,
      timestamp: new Date().toISOString(),
    });

    return ok({ status: dto.status });
  }
}

export const receiptsService = new ReceiptsService();
